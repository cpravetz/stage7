/**
 * Harness² — the in-task Propose–Probe–Compose loop.
 *
 * Phase 0 gave the assistant a harness; Phase 1 made it load and save. This is
 * the part that changes it: a candidate edit is proposed, judged in a sandbox
 * by a probe, and only composed into the harness if the probe says it works.
 *
 * The three rules that shape the whole module:
 *
 *   1. **A probe is the only evidence.** An edit that has not been probed is
 *      not composed, however plausible it looks.
 *   2. **The tier is the gate.** An edit that changes what an assistant does
 *      on the user's behalf needs the same approval the action itself needs.
 *      The gate is derived from `tier` (gates.ts) and never declared, so an
 *      edit cannot smuggle in a hand-written `confirmBeforeSend`.
 *   3. **The flag is the door.** The loop only runs for an assistant that has
 *      opted in, for a tenant that has opted in.
 *
 * The composed harness is returned in memory. Persisting it is the caller's
 * business — this module never writes to a store.
 */

import { createHash } from 'node:crypto';
import { logger } from '@stage7-nextgen/shared';
import type {
  AssistantHarness,
  HeuristicEntry,
  MCPTool,
  SynthesizedSkillRef,
} from '@stage7-nextgen/shared';
import { assertNoGateOptOutConfig, assertNoManualGate, effectiveGate, gateOf } from './gates';
import type { ToolManifest } from '../types';
import type { GovernanceTier } from './types';
import { ProbeExecutor, type ProbeSpec } from './probeExecutor';

export type HarnessEditKind =
  | 'heuristic'
  | 'prompt'
  | 'skill'
  | 'tool'
  | 'guardrail'
  | 'memory'
  | 'routing'
  | 'sub-agent';

export interface HarnessPatch {
  version?: string;
  systemPrompt?: string;
  tools?: Array<Partial<MCPTool> & Record<string, unknown>>;
  skills?: Array<Partial<SynthesizedSkillRef> & Record<string, unknown>>;
  heuristics?: Array<Partial<HeuristicEntry> & Record<string, unknown>>;
  memory?: { episodic?: unknown[]; semantic?: unknown[]; working?: Record<string, unknown> };
  subAgents?: Array<Record<string, unknown>>;
  routing?: { strategy?: string; rules?: Array<Record<string, unknown>>; preferences?: Record<string, unknown> };
  guardrails?: { policies?: string[]; constraints?: string[]; approvalRules?: Record<string, unknown> };
  metadata?: Record<string, unknown>;
}

export interface HarnessEditCandidate {
  id: string;
  kind: HarnessEditKind;
  /** Why this edit is worth making. Carried into the evidence log. */
  rationale: string;
  /** A complete proposed harness. Mutually exclusive with `patch`. */
  harness?: AssistantHarness;
  /** A patch merged onto the current harness. */
  patch?: HarnessPatch;
  /** Skill ids the edit is scoped to. Empty means it applies to every skill. */
  affectedSkillIds?: string[];
  /**
   * The probe that decides whether the edit is admissible.
   *
   * Either an inline spec or the id of a registered probe. An inline spec is
   * only honoured for an assistant that has opted into inline probes, because
   * an inline spec is arbitrary code.
   */
  probe?: ProbeSpec;
  /** The id of a registered probe. */
  probeId?: string;
  /** Operator-facing confidence, recorded but never used as a gate. */
  confidence?: number;
}

/** What is known about a skill the harness can act through. */
export interface HarnessSkillFacts {
  id: string;
  tier?: GovernanceTier;
  manifest?: Record<string, unknown>;
}

export interface HarnessGatePolicy {
  /** The skills this assistant can act through. */
  skills: HarnessSkillFacts[];
}

export type HarnessGateReason =
  | 'advisory-only'
  | 'ungated'
  | 'represent-scope'
  | 'mutating-action'
  | 'global-scope'
  | 'unresolved-scope';

export interface HarnessGateDecision {
  gated: boolean;
  requiresConfirmation: boolean;
  reason: HarnessGateReason;
  /**
   * How wide the edit is.
   *
   * `advisory` edits cannot change what the assistant does on the user's
   * behalf. `skill` edits change one identified skill. `global` edits change
   * something every skill reads — the prompt, the guardrails, the routing — so
   * every gated skill is in scope.
   */
  scope: 'advisory' | 'skill' | 'global';
  affectedSkillIds: string[];
  /** The tier the gate was derived from, per affected skill. */
  tiers: Record<string, GovernanceTier | 'unknown'>;
}

export interface HarnessEditSpec {
  candidateId: string;
  kind: HarnessEditKind;
  rationale: string;
  /** A line diff of the harness before and after the edit. */
  diff: string;
  /** The paths the edit touches. */
  changedPaths: string[];
  /** The harness the edit would produce. */
  merged: AssistantHarness;
  gate: HarnessGateDecision;
  /** `advisory` edits cannot change what the assistant does on the user's behalf. */
  risk: 'advisory' | 'behavioral';
  /** Stable fingerprint of the diff, used to tie evidence to an edit. */
  diffHash: string;
}

export interface HarnessProbeEvidence {
  candidateId: string;
  probeId: string;
  kind: HarnessEditKind;
  rationale: string;
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  networkIsolation: 'enforced' | 'best-effort';
  diffHash: string;
  changedPaths: string[];
  gate: HarnessGateDecision;
  error?: string;
  validationError?: string;
  warnings: string[];
  decidedAt: string;
}

export interface HarnessComposeRequest {
  /** The harness as it stands today. */
  current: AssistantHarness;
  candidates: HarnessEditCandidate[];
  policy: HarnessGatePolicy;
  /** The user's approval for edits the gate holds. */
  confirmation?: boolean;
  /** Directories the probes must not write to. */
  productionRoots?: string[];
  /** Extra files materialised into every probe workspace. */
  fixtures?: Record<string, string>;
}

export interface HarnessComposeResult {
  /** The composed harness. Unchanged when nothing was applied. */
  harness: AssistantHarness;
  applied: boolean;
  /** Candidates whose probes passed and which were merged. */
  accepted: string[];
  /** Candidates whose probes passed but whose gate needs the user's approval. */
  pendingApproval: string[];
  /** Candidates that were refused, with the reason. */
  rejected: Array<{ candidateId: string; reason: string }>;
  evidence: HarnessProbeEvidence[];
  specs: HarnessEditSpec[];
  approvalRequired: boolean;
  reason: string;
}

export interface HarnessLearningSource {
  tenantId?: string;
  metadata?: Record<string, unknown>;
  harness?: AssistantHarness;
}

export interface HarnessLearningPolicy {
  enabled: boolean;
  tenantAllowed: boolean;
  reason: string;
}

/** The metadata key an assistant sets to opt into the loop. */
export const HARNESS_LEARNING_METADATA_KEY = 'learning';

const MERGE_BY_ID_KEYS = ['tools', 'skills', 'heuristics', 'subAgents'] as const;

/**
 * Decides whether the loop may run for an assistant.
 *
 * Two separate permissions, because they can be granted by different people:
 * the assistant's own metadata opts the *assistant* in, and the tenant list
 * opts the *tenant* in. Either one missing means no loop.
 */
export function resolveHarnessLearningPolicy(source: HarnessLearningSource): HarnessLearningPolicy {
  const learning = readLearningBlock(source.metadata);
  const harnessLearning = readLearningBlock(source.harness?.metadata);

  const enabled = learning?.enabled === true || harnessLearning?.enabled === true;
  if (!enabled) {
    return {
      enabled: false,
      tenantAllowed: false,
      reason: 'harness learning is not enabled for this assistant',
    };
  }

  const tenantId = source.tenantId;
  if (!tenantId) {
    return {
      enabled: true,
      tenantAllowed: false,
      reason: 'the assistant has no tenant, so tenant opt-in cannot be confirmed',
    };
  }

  const allowedTenants = [
    ...toStringArray(learning?.allowedTenants),
    ...toStringArray(harnessLearning?.allowedTenants),
  ];
  if (allowedTenants.length > 0 && !allowedTenants.includes(tenantId)) {
    return {
      enabled: true,
      tenantAllowed: false,
      reason: `tenant "${tenantId}" is not in the allowed list for harness learning`,
    };
  }

  const envTenants = (process.env.HARNESS_LEARNING_TENANTS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (envTenants.length > 0 && !envTenants.includes(tenantId)) {
    return {
      enabled: true,
      tenantAllowed: false,
      reason: `tenant "${tenantId}" is not in HARNESS_LEARNING_TENANTS`,
    };
  }

  return { enabled: true, tenantAllowed: true, reason: 'harness learning is enabled for this assistant' };
}

/**
 * Works out the gate for an edit.
 *
 * The tier is the gate, exactly as it is for a Skill (gates.ts §2.2). An edit
 * scoped to a `represent` skill is held for approval; an edit that applies to
 * every skill is held when any of them is gated. An edit whose scope cannot be
 * resolved is held as well — the safe reading of an unclassifiable edit is the
 * strict one.
 *
 * Edits that only touch `heuristics` and `memory` are advisory: they cannot
 * change what the assistant does on the user's behalf, and the runtime gate
 * still holds whatever they say.
 */
export function decideHarnessGate(
  changedPaths: string[],
  affectedSkillIds: string[],
  policy: HarnessGatePolicy,
): HarnessGateDecision {
  const tiers: Record<string, GovernanceTier | 'unknown'> = {};
  const scope = editScope(changedPaths);

  if (scope === 'advisory') {
    for (const id of affectedSkillIds) {
      tiers[id] = policy.skills.find((skill) => skill.id === id)?.tier ?? 'unknown';
    }
    return {
      gated: false,
      requiresConfirmation: false,
      reason: 'advisory-only',
      scope,
      affectedSkillIds,
      tiers,
    };
  }

  // A skill-scoped edit is judged on the skills it actually touches, plus the
  // ones the candidate declared. A global edit is judged on every skill the
  // assistant has, because the prompt and the guardrails are read by all of
  // them.
  const entityIds = changedPaths
    .map((path) => entityIdFromPath(path))
    .filter((id): id is string => id !== undefined);
  const scopedIds = [...new Set([...entityIds, ...affectedSkillIds])];
  const isSkillScope = scope === 'skill' && scopedIds.length > 0;

  const affected = isSkillScope
    ? policy.skills.filter((skill) => scopedIds.includes(skill.id))
    : policy.skills;

  if (isSkillScope && affected.length < scopedIds.length) {
    for (const id of scopedIds) {
      if (!tiers[id]) tiers[id] = policy.skills.find((skill) => skill.id === id)?.tier ?? 'unknown';
    }
    return {
      gated: true,
      requiresConfirmation: true,
      reason: 'unresolved-scope',
      scope: 'skill',
      affectedSkillIds: scopedIds,
      tiers,
    };
  }

  if (!isSkillScope && policy.skills.length === 0) {
    return {
      gated: true,
      requiresConfirmation: true,
      reason: 'unresolved-scope',
      scope: 'global',
      affectedSkillIds,
      tiers,
    };
  }

  let gated = false;
  let reason: HarnessGateReason = 'ungated';

  for (const skill of affected) {
    const tier = skill.tier;
    tiers[skill.id] = tier && isGovernanceTierValue(tier) ? tier : 'unknown';
    const gate = gateOf({
      tier: skill.tier,
      manifest: (skill.manifest ?? {}) as ToolManifest,
      confirmBeforeSend: undefined,
    });
    if (!gate.requiresConfirmation) continue;
    gated = true;
    if (tier === 'represent') {
      reason = 'represent-scope';
    } else if (
      effectiveGate({ tier: skill.tier, manifest: (skill.manifest ?? {}) as ToolManifest }).reason ===
      'mutating-action'
    ) {
      reason = 'mutating-action';
    } else {
      reason = 'unresolved-scope';
    }
  }

  return {
    gated,
    requiresConfirmation: gated,
    reason,
    scope: isSkillScope ? 'skill' : 'global',
    affectedSkillIds: isSkillScope ? scopedIds : affected.map((skill) => skill.id),
    tiers,
  };
}

/**
 * How wide an edit is, read from the paths it changes.
 *
 * Heuristics and memory are guidance: they cannot change what the assistant
 * does on the user's behalf, and the runtime gate holds whatever they say. A
 * change to an identified tool or skill is scoped to that entity. Everything
 * else — the prompt, the guardrails, the routing — is read by every skill.
 */
export type HarnessEditScope = 'advisory' | 'skill' | 'global';

export function editScope(changedPaths: string[]): HarnessEditScope {
  if (changedPaths.length === 0) return 'advisory';
  if (changedPaths.every((path) => path.startsWith('heuristics') || path.startsWith('memory'))) {
    return 'advisory';
  }
  if (changedPaths.every((path) => path.startsWith('tools[') || path.startsWith('skills['))) {
    return 'skill';
  }
  return 'global';
}

/** The entity an identified path belongs to, e.g. `tools[send-email].name`. */
function entityIdFromPath(path: string): string | undefined {
  const match = /^(?:tools|skills)\[([^\]]+)\]/.exec(path);
  return match ? match[1] : undefined;
}

/**
 * Merges a patch onto a harness.
 *
 * Objects merge key by key. Arrays of identified things — tools, skills,
 * heuristics, sub-agents — merge by id, so "add this heuristic" does not
 * silently drop the others; an array of things without ids is replaced.
 */
export function mergeHarness(current: AssistantHarness, patch: HarnessPatch): AssistantHarness {
  const merged: Record<string, unknown> = { ...(current as Record<string, unknown>) };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if ((MERGE_BY_ID_KEYS as readonly string[]).includes(key) && Array.isArray(value)) {
      merged[key] = mergeById(
        (current as Record<string, unknown>)[key],
        value as Array<Record<string, unknown>>,
      );
      continue;
    }
    if (isPlainObject(value) && isPlainObject(merged[key])) {
      merged[key] = deepMerge(merged[key] as Record<string, unknown>, value);
      continue;
    }
    merged[key] = value;
  }

  return merged as AssistantHarness;
}

/**
 * Builds the edit spec for a candidate: what changes, by how much, and whether
 * the gate holds it.
 */
export function proposeHarnessEdit(
  current: AssistantHarness,
  candidate: HarnessEditCandidate,
  policy: HarnessGatePolicy,
): { spec: HarnessEditSpec } | { rejection: { reason: string; findings: string[] } } {
  if (!candidate.harness && !candidate.patch) {
    return { rejection: { reason: 'the candidate proposes neither a harness nor a patch', findings: [] } };
  }

  const merged = candidate.harness
    ? (deepMerge(
        current as Record<string, unknown>,
        candidate.harness as Record<string, unknown>,
      ) as AssistantHarness)
    : mergeHarness(current, candidate.patch as HarnessPatch);

  const findings = validateHarness(merged);
  if (findings.length > 0) {
    return { rejection: { reason: 'the proposed harness is not valid', findings } };
  }

  const changedPaths = diffPaths(
    current as unknown as Record<string, unknown>,
    merged as unknown as Record<string, unknown>,
  );
  const diff = diffHarness(current, merged);
  const gate = decideHarnessGate(changedPaths, candidate.affectedSkillIds ?? [], policy);
  const risk: 'advisory' | 'behavioral' = changedPaths.every(
    (path) => path.startsWith('heuristics') || path.startsWith('memory'),
  )
    ? 'advisory'
    : 'behavioral';

  return {
    spec: {
      candidateId: candidate.id,
      kind: candidate.kind,
      rationale: candidate.rationale,
      diff,
      changedPaths,
      merged,
      gate,
      risk,
      diffHash: hashText(diff),
    },
  };
}

/**
 * The loop itself: propose, probe, compose.
 */
export class HarnessLoop {
  constructor(private readonly probes: ProbeExecutor) {}

  /**
   * Runs the whole inner loop over a set of candidates.
   *
   * A candidate is composed only if its probe passed. A candidate that passed
   * but is held by the gate is not composed either — it is reported as pending
   * approval, and it is composed only when the caller supplies the approval.
   */
  async compose(request: HarnessComposeRequest): Promise<HarnessComposeResult> {
    const specs: HarnessEditSpec[] = [];
    const evidence: HarnessProbeEvidence[] = [];
    const rejected: Array<{ candidateId: string; reason: string }> = [];
    const accepted: string[] = [];
    const pendingApproval: string[] = [];

    // The running harness is what the last accepted candidate left behind.
    // Each candidate is proposed against it, so two candidates that touch
    // different parts of the harness both survive, and a candidate that is
    // refused leaves the harness exactly as it was.
    let harness = request.current;

    for (const candidate of request.candidates ?? []) {
      if (!candidate.probe) {
        rejected.push({
          candidateId: candidate.id,
          reason: candidate.probeId
            ? `the probe "${candidate.probeId}" was not resolved before the loop ran`
            : 'the candidate names no probe',
        });
        continue;
      }

      const proposal = proposeHarnessEdit(harness, candidate, request.policy);

      if ('rejection' in proposal) {
        rejected.push({ candidateId: candidate.id, reason: proposal.rejection.reason });
        logger.warn(
          { candidateId: candidate.id, findings: proposal.rejection.findings },
          'Harness candidate refused before probing',
        );
        continue;
      }

      const spec = proposal.spec;
      specs.push(spec);

      const probeResult = await this.probes.run({
        ...candidate.probe,
        probeId: candidate.probe.probeId ?? `${candidate.id}:probe`,
        productionRoots: candidate.probe.productionRoots ?? request.productionRoots ?? [],
        files: {
          ...(candidate.probe.files ?? {}),
          ...(request.fixtures ?? {}),
          'harness.json': JSON.stringify(spec.merged, null, 2),
          'harness.prompt': spec.merged.systemPrompt ?? '',
        },
      });

      const record: HarnessProbeEvidence = {
        candidateId: candidate.id,
        probeId: probeResult.probeId,
        kind: candidate.kind,
        rationale: candidate.rationale,
        ok: probeResult.ok,
        exitCode: probeResult.exitCode,
        durationMs: probeResult.durationMs,
        timedOut: probeResult.timedOut,
        networkIsolation: probeResult.networkIsolation,
        diffHash: spec.diffHash,
        changedPaths: spec.changedPaths,
        gate: spec.gate,
        error: probeResult.error,
        validationError: probeResult.validationError,
        warnings: probeResult.warnings,
        decidedAt: new Date().toISOString(),
      };
      evidence.push(record);

      if (!probeResult.ok) {
        rejected.push({
          candidateId: candidate.id,
          reason: probeResult.validationError ?? probeResult.error ?? 'the probe did not pass',
        });
        continue;
      }

      if (spec.gate.requiresConfirmation && !request.confirmation) {
        pendingApproval.push(candidate.id);
        continue;
      }

      harness = spec.merged;
      accepted.push(candidate.id);
    }

    const applied = accepted.length > 0;
    const approvalRequired = pendingApproval.length > 0;

    const result: HarnessComposeResult = {
      harness,
      applied,
      accepted,
      pendingApproval,
      rejected,
      evidence,
      specs,
      approvalRequired,
      reason: applied
        ? approvalRequired
          ? `composed ${accepted.length} edit(s); ${pendingApproval.length} edit(s) are held for approval`
          : `composed ${accepted.length} edit(s)`
        : approvalRequired
          ? 'every candidate that passed is held for approval'
          : 'no candidate passed its probe',
    };

    logger.info(
      {
        accepted: accepted.length,
        pendingApproval: pendingApproval.length,
        rejected: rejected.length,
        approvalRequired,
      },
      'Harness loop composed',
    );

    return result;
  }
}

/**
 * Checks a proposed harness for the things that must never be true of one.
 *
 * The manual-gate check is the important one: an edit that writes
 * `confirmBeforeSend` by hand is trying to switch off a policy the tier
 * derives, and it is refused here rather than being caught later by a Skill
 * that never asked for it.
 */
export function validateHarness(harness: AssistantHarness): string[] {
  const findings: string[] = [];

  if (harness.systemPrompt !== undefined && typeof harness.systemPrompt !== 'string') {
    findings.push('harness.systemPrompt must be a string');
  }

  for (const [index, heuristic] of (harness.heuristics ?? []).entries()) {
    if (!heuristic || typeof heuristic !== 'object') {
      findings.push(`harness.heuristics[${index}] is not an object`);
      continue;
    }
    if (typeof heuristic.id !== 'string' || heuristic.id === '') {
      findings.push(`harness.heuristics[${index}] has no id`);
    }
    if (typeof heuristic.rule !== 'string' || heuristic.rule === '') {
      findings.push(`harness.heuristics[${index}] has no rule`);
    }
  }

  for (const [index, skill] of (harness.skills ?? []).entries()) {
    if (!skill || typeof skill !== 'object') {
      findings.push(`harness.skills[${index}] is not an object`);
      continue;
    }
    if (typeof skill.skillId !== 'string' || skill.skillId === '') {
      findings.push(`harness.skills[${index}] has no skillId`);
    }
  }

  for (const [index, tool] of (harness.tools ?? []).entries()) {
    const path = `harness.tools[${index}]`;
    const manual = assertNoManualGate(tool as unknown as Record<string, unknown>, path);
    findings.push(...manual.map((finding) => `${finding.path}: ${finding.message}`));
    findings.push(
      ...assertNoGateOptOutConfig(tool.configSchema, path).map(
        (finding) => `${finding.path}: ${finding.message}`,
      ),
    );
  }

  return findings;
}

/* ------------------------------------------------------------------ */
/* Internals                                                           */
/* ------------------------------------------------------------------ */

function readLearningBlock(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
  const raw = metadata?.[HARNESS_LEARNING_METADATA_KEY];
  return isPlainObject(raw) ? raw : undefined;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry !== '');
}

function isGovernanceTierValue(value: unknown): value is GovernanceTier {
  return value === 'advise' || value === 'aid' || value === 'represent';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key] as Record<string, unknown>, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function mergeById(
  current: unknown,
  patch: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const base = Array.isArray(current) ? (current as Array<Record<string, unknown>>) : [];
  const out = base.map((entry) => ({ ...entry }));
  for (const entry of patch) {
    const id = typeof entry.id === 'string' ? entry.id : undefined;
    if (id === undefined) {
      out.push({ ...entry });
      continue;
    }
    const index = out.findIndex((existing) => existing.id === id);
    if (index === -1) out.push({ ...entry });
    else out[index] = { ...out[index], ...entry };
  }
  return out;
}

/**
 * The paths that differ between two harness objects.
 */
export function diffPaths(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  prefix = '',
): string[] {
  const paths: string[] = [];
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);

  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const left = before?.[key];
    const right = after?.[key];

    if (left === right) continue;

    if (Array.isArray(left) && Array.isArray(right)) {
      if (JSON.stringify(left) === JSON.stringify(right)) continue;
      const entityPaths = diffEntityArrays(left, right, path);
      paths.push(...(entityPaths.length > 0 ? entityPaths : [path]));
      continue;
    }

    if (isPlainObject(left) && isPlainObject(right)) {
      const nested = diffPaths(left, right, path);
      if (nested.length === 0) paths.push(path);
      else paths.push(...nested);
      continue;
    }

    paths.push(path);
  }

  return paths.sort();
}

/**
 * Diffs two arrays of identified things — tools, skills, heuristics — by id.
 *
 * The paths it produces name the entity, e.g. `tools[send-email].name`, which
 * is what lets the gate tell a change to one skill from a change to every
 * skill. An array whose entries have no id cannot be diffed this way, and the
 * caller falls back to treating the whole array as changed.
 */
function diffEntityArrays(before: unknown[], after: unknown[], path: string): string[] {
  const keyOf = (entry: unknown): string | undefined => {
    if (!isPlainObject(entry)) return undefined;
    for (const key of ['id', 'skillId']) {
      const value = entry[key];
      if (typeof value === 'string' && value !== '') return value;
    }
    return undefined;
  };

  const beforeKeys = before.map(keyOf);
  const afterKeys = after.map(keyOf);
  if (beforeKeys.some((key) => key === undefined) || afterKeys.some((key) => key === undefined)) {
    return [];
  }

  const beforeMap = new Map(beforeKeys.map((key, index) => [key as string, before[index]]));
  const afterMap = new Map(afterKeys.map((key, index) => [key as string, after[index]]));
  const paths: string[] = [];

  for (const [id, left] of beforeMap) {
    const right = afterMap.get(id);
    if (right === undefined) {
      paths.push(`${path}[${id}]`);
      continue;
    }
    if (JSON.stringify(left) === JSON.stringify(right)) continue;
    paths.push(
      ...diffPaths(
        left as Record<string, unknown>,
        right as Record<string, unknown>,
        `${path}[${id}]`,
      ),
    );
  }

  for (const [id] of afterMap) {
    if (!beforeMap.has(id)) paths.push(`${path}[${id}]`);
  }

  return paths;
}

/**
 * A line diff of the two harnesses, for the human reading the evidence.
 */
export function diffHarness(before: AssistantHarness, after: AssistantHarness): string {
  const beforeLines = JSON.stringify(before ?? {}, null, 2).split('\n');
  const afterLines = JSON.stringify(after ?? {}, null, 2).split('\n');
  return diffLines(beforeLines, afterLines).join('\n');
}

function diffLines(before: string[], after: string[]): string[] {
  // A harness is small, but a pathological one should not be able to allocate a
  // quadratic table. Past this size the diff degrades to a summary.
  if (before.length * after.length > 4_000_000) {
    return [`- ${before.length} line(s) before`, `+ ${after.length} line(s) after`];
  }

  const rows = before.length + 1;
  const cols = after.length + 1;
  const table: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      out.push(`  ${before[i]}`);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push(`- ${before[i]}`);
      i += 1;
    } else {
      out.push(`+ ${after[j]}`);
      j += 1;
    }
  }
  while (i < before.length) {
    out.push(`- ${before[i]}`);
    i += 1;
  }
  while (j < after.length) {
    out.push(`+ ${after[j]}`);
    j += 1;
  }
  return out;
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}
