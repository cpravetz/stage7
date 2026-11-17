# Mission Execution Lifecycle

How a mission moves from a user goal to closure: who does what, where the flow branches, and where work is handed to the Brain, to tools, or to a sub-plan.

This is a business/workflow description. It intentionally omits code-level detail.

---

## Entities

| Entity | What it is responsible for |
|---|---|
| **User** | States the goal; supplies secrets/credentials, grants permissions, makes authorization decisions, provides missing facts about the goal, and approves phases. Nothing else. |
| **Brain** | The structured reasoning service. Every planning, selection, review, and repair decision is a Brain call. It only *proposes*; it never performs side effects. |
| **Mission Planner** | An autonomous reasoning agent that turns the goal into a plan (phases, tasks, artifacts, required actions) and repairs its own malformed output. Runs its own bounded loop with its own model routing and context. |
| **Mission Director** | An autonomous reasoning agent that owns the execution loop: selects the next task, applies review findings, authors amendment/recovery tasks, and decides completion. |
| **Phase Reviewer** | An autonomous reasoning agent that judges a phase's actual outputs against that phase's goal. |
| **Mission Evaluator** | An autonomous reasoning agent that judges all evidence against the original mission goal at the end. |
| **Mission Executor** | The action-taking agent: performs tasks, creates/uses tools, delegates, and produces artifacts. The only role that causes side effects. |
| **Sub-agent** | A delegated child execution spawned by the Mission Executor for a bounded piece of work. |
| **Tool Executor service** | Runs registered tools, manages credentials/permissions, resolves or generates missing capabilities. |
| **Mission Orchestrator** | The in-process engine that sequences phases/tasks, applies reviews, and persists checkpoints to Artifacts. A Temporal `missionWorkflow` implementation also exists but is **not wired** (see Phase 2). |

The **Planner**, **Director**, **Phase Reviewer**, and **Mission Evaluator** are autonomous agents in their own right — each runs its own bounded reasoning loop against the Brain, with its own model routing and context. They differ from the **Mission Executor** only in authority: they propose, decide, and judge, while the Executor is the only role that performs side effects (through tools) and delegates to sub-agents. Treating any of them as "just the Brain" hides where autonomy and accountability actually sit.

---

## Invariants

These are easy to violate by accident, so they are stated explicitly:

1. **The user's role is bounded.** The user is only ever asked for: (a) secrets/credentials, (b) permission or authorization decisions, (c) missing facts about the goal, and (d) phase approval. The system must never ask the user to choose a tool or provider, perform tool setup, or do work the agent can do itself.
2. **Capability acquisition is self-service.** A missing capability is discovered, composed from existing tools, or created and verified by the system. The user is involved only when a declared secret value or an authorization decision is genuinely required.
3. **No false completion.** A task is not complete until its declared actions and artifacts exist as real content; a planned or proposed action is not evidence of success.

---

## Lifecycle at a glance

```
User goal
   │
   ▼
[1] PLAN ──────────────► Mission Planner agent builds plan (own Brain-backed loop)
   │                        └─ malformed? local fix → field repair → refinement
   ▼
[2] PER PHASE: start phase (Mission Orchestrator)
   │
   ▼
[3] SELECT next ready task ──► Mission Director agent selects when several are ready
    │        ├─ ready = every dependsOnTaskIds task is "completed" AND produced
    │        │          its declared expectedArtifacts (real content)
    │        ├─ dependency done but its artifact absent = missing input → rerun that
    │        │          dependency (bounded); never ask the user
    │        └─ no task ready but tasks remain = deadlock → remaining marked failed
    ▼
[4] EXECUTE task ───────────► Mission Executor (one bounded agent loop)
    │        ├─ final answer / content ► Brain (validated against task contract)
    │        ├─ tool call ───────────► Tool Executor
    │        ├─ missing tool ────────► search → compose → create → VERIFY (dry run);
    │        │                         then a second strategy (other provider, compose,
    │        │                         stronger Brain tier) before any blocker
    │        ├─ missing input ─────────► a dependency finished "completed" but its
    │        │   (upstream artifact)     artifact/input is absent → rerun the upstream
    │        │                         task, or author an alternative task to produce it;
    │        │                         NEVER ask the user (user is only for goal facts)
    │        ├─ missing secret ──────► ask ONLY for the named secret value → PAUSE
    │        ├─ missing fact (goal) ─► question → PAUSE for user
    │        ├─ permission needed ───► PAUSE for user authorization
    │        └─ delegate ────────────► Sub-agent (bounded)
   │
   ▼
[5] Task outcome (classified by Executor, acted on by Director)
   │
   ├─ completed ───────────────► next task
   ├─ incomplete, known reason ► ONE bounded recovery turn (same task id, fresh
   │                              execution + guidance; NOT a checkpoint resume)
   ├─ incomplete, uncertain ───► NO retry; blocks until reconciled
   ├─ failed (unhandled error) ► record + compensate, CONTINUE to next task
   ├─ interrupted (question /
   │  permission / credentials) ► PAUSE → awaiting_review
   │                              user answers → RESUME from checkpoint,
   │                              SAME task continues with answer injected
   └─ Brain/service loss ──────► FATAL → mission fails
                                  (model exhausted / Brain unreachable /
                                   artifacts service unavailable)
   │
   ▼
[6] PHASE REVIEW ─────────────► Phase Reviewer agent
   │        ├─ satisfied ────────► complete phase
   │        └─ gaps ─────────────► TARGETED amendment task (not a phase redo):
   │                                 references the gap + all phase task IDs,
   │                                 runs after phase tasks → back to [3]
   │                                 (bounded: 12 rounds / 3 no-progress)
   │
   ▼
[7] APPROVAL GATE (if phase requires approval) ──► User
   │        ├─ approved ─────────► same run continues
   │        └─ rejected ─────────► END at rejected_at_phase
   │
   ▼
[8] MISSION COMPLETION REVIEW ─► Mission Evaluator agent
   │        ├─ satisfied ────────► COMPLETED
   │        └─ gaps ─────────────► TARGETED mission-recovery task (not a full
   │                                 redo): references the gaps + target task IDs,
   │                                 runs in the inferred recovery phase → back to [3]
   │                                 (bounded: 12 rounds / 3 no-progress)
   ▼
[9] CLOSURE
   ├─ completed ────── terminal: all phases done + completion review satisfied
   ├─ incomplete ───── terminal: gaps remain, but NO user action (secret,
   │                      permission/authorization, missing goal fact) can fix them
   ├─ awaiting_review ─ NOT final: re-entrant pause; resumes on ANY user message
   ├─ rejected_at_phase terminal: user rejected an approval gate
   └─ failed ───────── terminal: fatal loss of Brain or a backend service
```

---

## Phase 1 — Planning

**Responsible: Mission Planner agent (its own Brain-backed loop)**

1. The Director loads an existing/resumed plan if one is valid; otherwise it asks the Planner to generate one.
2. The Planner sends the goal + context to the Brain and receives a structured plan: summary, estimates, phases, and per-phase tasks. Each task carries an `agentRole`, a description, dependency list, expected artifacts, and required actions.
3. The Planner validates its own output before accepting it.

**Decisions that branch here (all handled by the Planner/Brain, never the user):**

| Situation | Action | Who |
|---|---|---|
| Plan JSON malformed | Local structural repair | Planner |
| Schema/type mismatch | Local field fix → narrow Brain field-repair → full-plan refinement | Planner + Brain |
| Brain transient error (timeout/5xx) | Retry with another model (bounded) | Brain router |
| No usable model left | Fatal: mission cannot be planned | Brain / Mission Orchestrator |
| Plan empty or unusable | Synthesize a single-phase, single-task fallback | Planner |
| Task is really a capability/tool setup | Normalize into an outcome task | Planner |

**Clarification rule:** The Planner does **not** pause to ask the user. If a human decision is needed it is represented as a phase *approval requirement* or asked later by an execution agent at runtime.

**Handoff to Brain:** plan generation, plan repair, and task-requirement normalization.

---

## Phase 2 — Phase and task selection

**Responsible: Mission Orchestrator + Mission Director agent**

> **Engine note:** the running engine is the in-process **Mission Orchestrator** (`runMissionDirect` → `MissionOrchestrator.run`), which checkpoints to Artifacts and is driven by the API/scheduler. `services/temporal/src/workflows/missionWorkflow.ts` and the per-step activities it calls are retained for tests but are **not started** by the client on this branch.

1. The Orchestrator opens each phase, skipping phases already completed.
2. Tasks become *ready* only when all of their `dependsOnTaskIds` dependencies are **completed** *and* have produced their declared outputs. Readiness verifies both: a dependency that finished but did not produce one of its declared `expectedArtifacts` (with real content) does **not** satisfy a downstream task (see Phase 3, *Missing input from an upstream task*).
3. If no task is ready but pending tasks remain, that is a deadlock: remaining tasks are marked failed.
4. When more than one task is ready, the Director agent asks the **Brain** to select the next task. With a single ready task it is taken directly.

**Decision:** dependency readiness is the primary gate; the Director only arbitrates *choice* among equally-ready tasks. Readiness checks completion **and** that each dependency produced its declared artifacts. A dependency that completed without producing its artifact is a *missing input*: the orchestrator reopens that dependency for a bounded rerun (Phase 3, *Missing input from an upstream task*) rather than blocking or asking the user.

---

## Phase 3 — Task execution

**Responsible: Mission Executor, with the Tool Executor and possibly a Sub-agent**

One execution = one bounded agent loop. Each turn:

1. The executor asks the **Brain** for the next action.
2. The Brain proposes exactly one action.
3. The executor checks the proposal against policy (guards).
4. If accepted, the executor performs it and records a receipt.
5. If rejected, the Brain gets a *complaint plus a corrective instruction* and the loop continues — no blind retry, no exception.

**What the Brain may propose, and who handles it:**

| Proposal | Handled by | Notes |
|---|---|---|
| Tool call | Tool Executor | Primary side-effect path. |
| List / search tools | Agent (local catalog) | No side effect. |
| Create / resolve a missing capability | Tool Executor (`resolve`) | See **Capability acquisition** below; never a user task. |
| Delegate to a sub-agent | Sub-agent | Bounded by delegation budget and depth. |
| Ask the user a question | — (pauses mission) | Only for secrets, permission/authorization, or a missing fact about the goal. |
| Final answer (plain text) | Agent | Validated against the task contract. |

**Decisions that branch execution:**

- **Tool not in catalog** → search → compose from existing tools → create and verify; only then consider a second strategy. Record a failure only after those routes are exhausted (see **Capability acquisition**).
- **Missing input (a dependency completed but its artifact/input is absent)** → this is **not** a user task and **not** a missing goal fact; resolve it by rerunning the upstream task that should have produced it, or by authoring an alternative task that produces the missing artifact, then continue (see **Missing input from an upstream task**). The user is involved only if the missing item is genuinely a fact about the goal.
- **Missing secret/credential** → the tool declares it as a secret; the mission pauses with a request for that one named value.
- **MCP/permission needed** → mission pauses for the user to authorize.
- **Unresolvable capability (all strategies exhausted)** → *not* retried; short-circuit with an explanatory failure and end the task *incomplete*.
- **Delegation budget/depth exceeded** → Brain told to finish directly or explain the blocker.
- **No progress (same action repeatedly)** → one resolution attempt, then stop with a blocker.
- **Budgets exhausted** (actions, Brain calls, tokens) → task ends *incomplete*, not failed.

Every proposed action is validated before execution; every executed action is recorded as a receipt.

**When the Brain's reply is bad or unusable** (this is *not* a service outage — the Brain responded):

| Bad reply | What happens | Who |
|---|---|---|
| Identical to the previous turn (no progress) | Complaint recorded, agent told to take a different concrete next step; same turn continues | Executor |
| Action wrapped in prose / Markdown, or mixed with narration | Normalized to the single action; complaint recorded; action proceeds | Executor |
| Tool-shaped but not a valid executable action | Complaint + explicit format instruction; nothing executed; next turn | Executor |
| Final answer missing required actions/artifacts | Specific gaps listed, correction instruction sent, next turn | Executor |
| Artifacts still missing after the correction limit | Task ends *incomplete* with a blocker | Executor |

The mechanism is always **complaint + corrective instruction → another turn**, not a blind retry and not an exception. It does **not** switch models — model switching is reserved for Brain *infrastructure* failures (below).

**When the Brain or a backend service is lost** (infrastructure, not a bad answer): model exhausted / all models unavailable, Brain unreachable (connection refused, DNS, timeout, 503/504), or the artifacts service unavailable. This is **fatal** — the mission aborts (`failed`) rather than retrying the task.

### Missing input from an upstream task

A task can find that an input it needs — one an upstream task was supposed to produce — is absent or empty, even though that upstream task is marked `completed`. Readiness therefore verifies consumed inputs, not just completion status (see Phase 2): a dependency that completed without producing its declared artifact is a *missing input*, and the dependent task is not started until it is resolved.

This is distinct from a *missing fact about the goal*:

- A **missing goal fact** is something only the user can supply → the mission pauses and asks the user (`missing fact (goal)` above).
- A **missing input/artifact** should have been produced by the mission itself → the mission must **never** ask the user for it. It reruns the upstream task that should have produced it, or authors an alternative task that produces the missing artifact, then continues.

**Enforcement:** the ready gate verifies consumed inputs — a task does not start until every dependency is `completed` *and* has produced its declared `expectedArtifacts` with real content. When a completed dependency is missing a declared artifact, the orchestrator reopens that dependency for a bounded rerun (it does not fail or block the mission, and it never asks the user). If reruns are exhausted, phase review authors a targeted amendment task to produce the missing artifact; only a genuine secret / permission / goal-fact need ever reaches the user.

### Capability acquisition

This is where reliability is won or lost, so it is specified rather than left to one line:

1. **Verify before registering.** A candidate capability — a discovered MCP/OpenAPI tool or generated code — is run once against a **dry run with non-secret fixtures** to confirm it performs the *exact* operation. A similarly named draft, preview, or queue tool does not pass. Registration happens only after the dry run succeeds.
2. **Try a second strategy after the first fails.** A single failed attempt must not end in a blocker. The agent tries a different route first: another provider category, composing existing tools, or a stronger Brain tier. Only after those are exhausted does it record a blocker.
3. **Declared secret schemas.** A created tool states which inputs are secrets. The only possible user interaction is a specific, self-explanatory request for a named value — never an open-ended "configure this" or "choose a tool" prompt.

If all routes fail, the task ends *incomplete* with a blocker that names what was tried; it is not reported as completed.

> **Implementation status:** declared secrets and secret-flagging are enforced; dry-run verification and the second-strategy ladder are the target contract and are not yet both enforced (capability resolution currently allows one recovery attempt per failed tool).

---

## Phase 4 — Task outcome and immediate handling

**Responsible: Mission Executor (classification) → Mission Director (reaction)**

| Outcome | Meaning | Director's reaction |
|---|---|---|
| **completed** | Brain answer passes the task contract (required actions + artifacts present) | Mark completed, continue |
| **incomplete** | Ran out of budget, or outcome uncertain | *Known reason* → one bounded recovery turn; *uncertain* → no retry, blocks |
| **failed** | Unhandled task error (not a classified tool error) | Record failure + compensation, continue to next task |
| **interrupted** | Agent asked a question or needs permission/credentials | Pause mission (`awaiting_review`) |

**Does an incomplete task trigger a full retry or an incremental request?** Neither a from-scratch rerun nor a checkpoint resume: the Director gives the agent **exactly one bounded recovery turn** — a fresh execution of the same task (same task id) carrying corrective guidance ("you did not accomplish X; retry with a different approach, ask for help, or delegate; do not repeat actions already recorded"). Completed side effects are not repeated. If the incomplete reason is *uncertain / outcome unknown*, **no recovery turn is given** — the task blocks until the uncertainty is reconciled.

**Failure reasons are distinguished.** Each failure/incomplete reason carries a classification that drives the response:

| Reason | Retry? | Needs user? | Adaptation |
|---|---|---|---|
| `REQUEST_TOO_LARGE` | Yes | No | Rebuild context |
| `TRANSIENT_SERVICE_ERROR` | Yes | No | Retry with backoff |
| `TOOL_MISSING` | Yes | No | Self-discover / compose / create + verify; ask only for a named secret or permission |
| `CREDENTIAL_REQUIRED` | No | Yes | Ask the user for the specific named secret |
| `MODEL_EXHAUSTED` | No | No | Stop with blocker |
| `OUTCOME_UNKNOWN` | No | No | Stop with blocker |
| `UNKNOWN_FAILURE` | No | No | Stop with blocker |

**User involvement is bounded to secrets, authorization, and missing facts about the goal.** A capability/tool gap is never a user task; it is resolved by discovery, composition, creation, and verification.

**Loss of Brain/services is different from an incorrect response.** A bad response (malformed, repeated, incomplete answer) is handled inside the task by complaint + correction. Loss of the Brain or a backend service (all models exhausted, connection failure, artifacts service down) is **fatal** and aborts the mission as `failed`.

**Rule:** An *uncertain* side effect is never treated as success; it blocks until reconciled.

A single failed task does **not** abort the mission. A task that needs the user **does** pause it.

---

## Phase 5 — Phase review and remediation

**Responsible: Phase Reviewer agent (review) + Mission Director agent (remediation)**

1. The Phase Reviewer agent compares the phase's **actual outputs/artifacts** against the phase goal — not the plan.
2. **Satisfied** → the phase completes.
3. **Gaps found** → the reviewer proposes follow-up work, and the Director turns it into a **targeted amendment task** — the phase is **not** redone wholesale and the original task is **not** simply rerun. The amendment:
   - carries the gap description in its title/description/instructions,
   - depends on all of the phase's existing task IDs, so it runs *after* them,
   - is scheduled back into execution (Phase 3).
4. If the reviewer does not propose a follow-up, the Director authors the recovery task itself from the gaps.
5. Safety ceilings bound this loop: **12** phase-recovery rounds and **3** no-progress attempts. A missing tool/capability is **not** a user blocker — it is resolved by discovery, composition, creation, and verification. If the blocker is a *secret, permission/authorization, or a missing fact about the goal*, the mission surfaces it to the user (through the amendment task's question, or an `awaiting_review` classification at completion review) rather than retrying; if no-progress is hit it also pauses for review.

**Reviewer verdict is advisory.** A deterministic evidence check (`phaseRequirementEvidenceGaps`) can still mark the phase incomplete when declared actions or artifacts are missing, even if the reviewer said "satisfied".

**Decision:** remediation is targeted at the gap (a new task that references the gap), not a phase restart.

---

## Phase 6 — Approval gate (only when a phase requires approval)

**Responsible: User**

- If a phase requires approval, the mission waits for the user.
- **Approved** → phase marked approved; the **same** run continues to the next phase.
- **Rejected** → phase marked rejected; the current run halts and the mission ends at `rejected_at_phase` (surfaced as `awaiting_review` at the client level).

---

## Phase 7 — Mission completion review and recovery

**Responsible: Mission Evaluator agent (review) + Mission Director agent (remediation)**

1. After all phases, the Mission Evaluator agent reviews all observed evidence against the original goal.
2. **Satisfied** → mission is **completed**.
3. **Gaps found** → the mission is **not** redone from the start. The Director creates a **targeted mission-recovery task** that:
   - carries the gap descriptions in its instructions,
   - depends on the specific unmet task IDs,
   - targets the phase inferred from those gaps,
   - re-executes and then re-reviews.
4. Recovery loops are bounded: **12** recovery rounds and **3** no-progress attempts.
5. **Decisions that end recovery:** a credential/secret, permission/authorization, or missing-goal-fact blocker pauses for the user (`awaiting_review`); loss of the Brain (model exhausted / unreachable) is fatal (`failed`); an uncertain outcome (`outcome unknown`) ends **incomplete** because it must not be repeated. If recovery simply runs out of rounds, the mission ends **incomplete**.

---

## Phase 8 — Closure

**Responsible: Mission Orchestrator / Mission Director agent**

Outcome statuses:

| Status | Terminal? | Meaning |
|---|---|---|
| **completed** | Yes | All phases complete and the completion review is satisfied |
| **incomplete** | Yes | Gaps remain but **no user action (secret, permission/authorization, missing goal fact) could fix them** — the agent simply could not finish (e.g. recovery rounds exhausted, uncertain outcome) |
| **awaiting_review** | **No — re-entrant** | A concrete user action is pending (question, approval, credential/secret, permission/authorization, missing goal fact). The mission is paused, not finished. |
| **rejected_at_phase** | Yes | The user rejected a phase that required approval |
| **failed** | Yes | Fatal loss of a required backend service (Brain exhausted/unreachable, artifacts service unavailable) |

**How can a mission end as `incomplete`?** When completion review still finds gaps, but those gaps do **not** require the user and are **not** a secret/permission/authorization blocker — the agent exhausted its bounded recovery without finishing. It is a genuine terminal outcome, distinct from `awaiting_review` (which *can* be resolved by the user) and from `failed` (which is a service outage).

**Is `awaiting_review` final?** No. It is a pause. The run returns, but the mission is **re-entrant**: it resumes when the user responds.

**What happens when the user responds to a paused mission**

1. **Any** non-empty user message resumes an `awaiting_review` mission — no exact phrase required.
2. The mission **resumes from its saved checkpoint**, not from the beginning: the plan, completed phases, and completed tasks are restored.
3. If the pause was on a specific task, that **same task continues** with the user's answer injected into the agent's context (the prior action receipts are preserved, with a note not to repeat completed actions).
4. The user's text is stored as the interaction response and fed to the agent; later messages are appended as additional mission context so the agent does not re-ask for values already supplied.
5. A pending permission/credential decision resumes the same way; once granted, the blocked action proceeds.
6. An approval resumes the **same** run; a rejection ends it at `rejected_at_phase`.

**Completion rule:** a mission is never marked finished while a genuine user interaction is still pending. A mission pauses for the user only for a secret, permission/authorization, missing goal fact, or phase approval.

---

## Review and remediation summary

| Level | Reviewer | Remediator | Remediation action |
|---|---|---|---|
| Plan | Mission Planner (self-check) | Mission Planner | Local fix, field repair, refinement, fallback plan |
| Task | Mission Executor (contract validation) | Mission Executor | One bounded recovery turn; *uncertain* outcome blocks instead |
| Phase | Phase Reviewer | Mission Director | Targeted amendment task referencing the gap (not a phase redo); pause only for a secret/permission/authorization/missing-fact blocker |
| Mission | Mission Evaluator | Mission Director | Targeted mission-recovery task referencing the gaps + unmet task IDs (not a full redo); pause on unresolvable gaps |

**Bad response vs. service loss:** a malformed, repeated, or incomplete *response* is corrected inside the task (complaint + corrective instruction → another turn). Loss of the Brain or a backend service is fatal and ends the mission as `failed`.

---

## What is Brain-handled, tool-handled, or sub-planned

| Concern | Handled by |
|---|---|
| Building and repairing the plan | **Mission Planner** (its own Brain-backed reasoning loop) |
| Choosing among ready tasks | **Mission Director** (its own loop) |
| Deciding each next action in a task | **Mission Executor** (its own loop) |
| Reviewing phase and mission results | **Phase Reviewer / Mission Evaluator** (their own loops) |
| Performing actions / running tools | **Tools** (Tool Executor) |
| Finding, composing, or generating and verifying a missing capability | **Tools** (Tool Executor resolve) |
| Bounded sub-work | **Sub-agent** (delegated by Mission Executor) |
| Task decomposition into a bounded sub-plan | **Mission Executor**, either directly or by delegating to a **sub-agent** |
| Sequencing, persistence, resume | **Mission Orchestrator** (in-process; checkpoints in Artifacts) |
| Secrets, permissions/authorization, missing facts about the goal, phase approval | **User** (mission pauses) |

**When a task needs a sub-plan:** the Mission Executor decomposes a task that is too broad into smaller pieces, either handling them itself across turns or delegating bounded pieces to a sub-agent. The planner deliberately defines *what* is needed; the executor decides *how* — including whether a sub-plan or delegation is required.