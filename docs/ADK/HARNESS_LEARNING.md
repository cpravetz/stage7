# Harness² — the Propose–Probe–Compose Loop

The harness is the part of an assistant that can change: the prompt it runs with, the skills it knows about, the heuristics it applies, synthesized skills, memory, sub-agent topologies, routing, and guardrails. This document describes how a change to that surface is proposed, judged and composed, including the outer loop (distillation) and guardrails added in Phases 0-5.

Three rules shape everything here.

1. **A probe is the only evidence.** An edit that has not been probed is not composed, however plausible it looks.
2. **The tier is the gate.** An edit that changes what an assistant does on the user's behalf needs the same approval the action itself needs. The gate is derived from `tier` and is never declared, so an edit cannot smuggle in a hand-written `confirmBeforeSend`.
3. **The flag is the door.** The loop only runs for an assistant that opted in, for a tenant that opted in.

## Phases (implementation status)

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0 | Done | Added `SynthesizedSkillRef`, `HeuristicEntry`, `AssistantHarness` to `shared-nextgen/src/types/assistant.ts`. Attached `harness?: AssistantHarness` to `AssistantDefinition`, `AssistantTemplate`, `AssistantInstance` (backward compatible). Extended `AssistantHarness` with `history`, `synthesizedSkills`, `heuristicsLog` alias, `harnessVersion`, `routingRules`, `sandboxPolicy`. |
| Phase 1 | Done | `services/worker-pool/src/services/AssistantLoader.ts` loads/saves harness via ArtifactsService with defensive migration initializing harness from `systemPrompt`/`tools` when absent; preserves harness on register/update. |
| Phase 2 | Done | Propose–Probe–Compose loop in `services/tool-executor/src/adk/harness-loop.ts` with `ProbeExecutor` in `adk/probeExecutor.ts`. Feature flag gated via `metadata.learning.enabled`/`metadata.harnessLearning`. |
| Phase 3 | Done | Synthesized skills via `services/tool-executor/src/adk/synthesizedSkillWriter.ts` (writes to assistant skills dir with metadata header, hash, validatedAt). Records in `harness.synthesizedSkills`/`harness.skills`. |
| Phase 4 | Done | Post-task distillation (outer loop): `services/brain/src/services/DistillationService.ts`, `DistillationOrchestrator.ts`, routes added. Triggered asynchronously on mission completion in `services/temporal/src/client/TemporalClient.ts`. Extracts heuristics via fast model, validates/appends to `heuristics` (active), increments `version`/`harnessVersion`, persists via assistant updates. |
| Phase 5 | Done | Guardrails & safety: probe sandbox enforces network isolation (blackhole/proxy), env allowlist blocking credentials/persistence vars, production mutation checks, timeouts/output caps. Tier gates enforced via `gates.ts` (`assertNoManualGate`, `deriveApproval`/`effectiveGate` preserved). Harness history/rollback snapshots (last 10) stored in `harness.history`. Feature flags and tenant allowlists enforced. |

## The three stages

| Stage | What it does | Where it lives |
|-------|--------------|----------------|
| Propose | Turns a candidate into an edit spec: a diff, the paths it touches, the risk, the gate | `adk/harness-loop.ts` |
| Probe | Runs the candidate in a sandbox and reports what came out | `adk/probeExecutor.ts` |
| Compose | Merges the candidates whose probes passed, and logs the evidence | `adk/harness-loop.ts` |

The runtime entry point is `HarnessEditService` (`services/tool-executor/src/services/HarnessEditService.ts`), which answers the two questions the loop cannot answer for itself: may this assistant run the loop at all, and what is the gate for its skills.

## Distillation (outer loop)

On assistant/mission completion (multi-step, errors, or epic completion), `DistillationOrchestrator` triggers async distillation using a fast/cheap model. It collects errors/events/artifacts/traces, prompts for minimal rules/wrappers/tool changes with evidence, validates heuristics (non-empty/actionable), appends to `harness.heuristics` with `source: 'distillation'`, `active: true`, increments harness version, and persists via assistant update. Harness history is snapshotted before updates for rollback capability.

## Synthesized skills

When a probe produces a reusable routine (bash/python/ts/javascript) that passes validation, `writeSynthesizedSkill` writes it to the assistant's skills directory with a metadata header (`@synthesized`, `@skillId`, `@hash`, `@validatedAt`), computes a SHA256 hash, records a `SynthesizedSkillRef` in `harness.synthesizedSkills` (and/or `harness.skills`) with `path`, `hash`, `validatedAt`, `source: 'synthesized'`, and requires probe validation before persistence.

## The sandbox

A probe runs somewhere that is not production. `ProbeExecutor` gives it:

- an empty working directory that is deleted when the run ends
- an environment built from an allowlist, not inherited — no production persistence variables, no credentials, nothing that names a live store (BLOCKED_ENV_PATTERNS)
- the network off by default, enforced with proxy blackhole/network namespace where possible (`requireNetworkIsolation` supported)
- a wall-clock budget and an output cap, both enforced by killing the process group
- a check afterwards that the production roots named by the caller were not written to

The read-only guarantee is mode-based, not a kernel sandbox: input fixtures are written `0444` and the workspace is disposable.

A probe that writes to production fails the probe, and the failure names the paths it wrote to. That check is what makes the evidence trustworthy.

## The gate

`decideHarnessGate` reads the paths an edit changes and decides whether the user has to approve it.

| Scope | What changed | Gate |
|-------|--------------|------|
| `advisory` | `heuristics`, `memory` | Not gated. Guidance cannot switch off the runtime approval gate |
| `skill` | One identified tool or skill | Gated if that skill is gated |
| `global` | The prompt, the guardrails, the routing | Gated if any of the assistant's skills is gated |

The tier of each skill is read from the tool registry, so the gate is derived from the same `tier` the runtime enforces. A skill with no tier is unclassifiable, and the safe reading of an unclassifiable skill is the strictest one: it is treated as `represent`.

A skill the registry does not know is therefore gated. The caller can state the tiers itself — the platform knows the assistant's bindings, and the harness cannot be the source of the tier, because the harness is what the loop edits:

```json
{
  "skills": [{ "id": "summarise", "tier": "advise" }]
}
```

An edit whose scope cannot be resolved is held for approval rather than composed. So is a candidate that declares the approval gate by hand: the harness is validated with `assertNoManualGate` before it is probed, and a finding refuses the candidate outright. Manual `confirmBeforeSend` declarations remain disallowed (`assertNoManualGate`), and harness edits cannot bypass approval for `represent` actions.

## The evidence

Every probed candidate leaves a record: the probe id, the exit code, the duration, whether the network was isolated, the diff fingerprint, the paths that changed, the gate decision, and the reason it passed or failed. The evidence is what a later reader checks, so it carries the diff hash that ties it to the edit it judged.

A candidate that passed its probe but is held by the gate is reported as pending approval, and it is composed only when the caller supplies the approval.

## Opting in

The loop is off unless the assistant says so:

```json
{
  "metadata": {
    "learning": {
      "enabled": true,
      "allowedTenants": ["tenant-a"]
    }
  }
}
```

`allowedTenants` is optional; when it is present the assistant's tenant has to be on the list. `HARNESS_LEARNING_TENANTS` adds a deployment-wide list on top.

An assistant that wants its candidates to carry their own probe code also has to say `allowInlineProbes: true`. Inline probes are arbitrary code, so the HTTP route only runs probes this service ships with.

## Calling it

```bash
curl -X POST http://localhost:3500/api/tool-executor/harness/evolve \
  -H 'Content-Type: application/json' \
  -d '{
    "assistantId": "assistant-1",
    "tenantId": "tenant-a",
    "harness": { "systemPrompt": "You are a helpful assistant." },
    "metadata": { "learning": { "enabled": true } },
    "skills": [{ "id": "summarise", "tier": "advise" }],
    "candidates": [
      {
        "id": "edit-1",
        "kind": "prompt",
        "rationale": "the prompt does not name the audience",
        "probeId": "harness-validity",
        "affectedSkillIds": ["summarise"],
        "patch": { "systemPrompt": "You are a helpful assistant for engineers." }
      }
    ]
  }'
```

The response carries the composed harness, the evidence, and whether the result is waiting on an approval.

The probes the service ships with are `harness-validity` (the proposed harness is well formed and declares no manual gate) and `harness-prompt-smoke` (the proposed prompt is present and within its length budget). A host registers its own with `HarnessEditService.registerProbe`.

## Where it stops

The loop composes a harness in memory. Persisting it is the caller's business: the claim this loop makes is that a harness change is evidence-backed, and a change that was not saved is easier to throw away than one that was written to production. Distillation writes heuristics back to assistants via Artifacts/persistence; synthesized skills are written to disk and recorded in the harness.
