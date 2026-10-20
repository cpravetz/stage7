/**
 * HarnessEditService — the runtime entry point for the Harness² inner loop.
 *
 * The ADK owns the rules (gates.ts), the loop owns the sequence
 * (harness-loop.ts) and the sandbox owns the evidence (probeExecutor.ts). This
 * service is the piece a host actually calls: it answers the two questions the
 * loop cannot answer for itself — *may this assistant run the loop at all?* and
 * *what is the gate for this assistant's skills?* — and it turns a request into
 * a composed harness.
 *
 * The composed harness comes back in memory. Nothing here writes to a store
 * unless a persistence port was supplied, because the loop's whole claim is
 * that a harness change is evidence-backed, and an unsaved change is easier to
 * throw away than one that was written to production.
 */

import { logger } from '@stage7-nextgen/shared';
import type { AssistantHarness } from '@stage7-nextgen/shared';
import {
  HarnessLoop,
  resolveHarnessLearningPolicy,
  type HarnessComposeResult,
  type HarnessEditCandidate,
  type HarnessGatePolicy,
  type HarnessProbeEvidence,
  type HarnessSkillFacts,
} from '../adk/harness-loop';
import { ProbeExecutor, type ProbeResult, type ProbeSpec } from '../adk/probeExecutor';
import type { ToolRegistry } from './ToolRegistry';

export interface HarnessEvolveRequest {
  assistantId: string;
  tenantId?: string;
  /** The harness as it stands today. */
  harness: AssistantHarness;
  /** The assistant's metadata, which carries the opt-in. */
  metadata?: Record<string, unknown>;
  /** The edits being proposed. */
  candidates: HarnessEditCandidate[];
  /**
   * The skills the assistant can act through.
   *
   * When omitted, the policy is built from the skills and tools the harness
   * names, with their tiers read from the tool registry.
   */
  skills?: HarnessSkillFacts[];
  /** The user's approval for edits the gate holds. */
  confirmation?: boolean;
  /** Directories the probes must not write to. */
  productionRoots?: string[];
  /** Extra files materialised into every probe workspace. */
  fixtures?: Record<string, string>;
}

export interface HarnessEvolveResult {
  assistantId: string;
  applied: boolean;
  /** The composed harness, or the original when nothing was applied. */
  harness: AssistantHarness;
  evidence: HarnessProbeEvidence[];
  approvalRequired: boolean;
  pendingApproval: string[];
  rejected: Array<{ candidateId: string; reason: string }>;
  reason: string;
}

function readLearningBlock(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
  const raw = metadata?.learning;
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : undefined;
}

export interface HarnessPersistencePort {
  save(assistantId: string, harness: AssistantHarness): Promise<void>;
}

export interface HarnessEditServiceOptions {
  registry?: ToolRegistry;
  probes?: ProbeExecutor;
  /** Where a composed harness is written, when the caller wants it written. */
  persistence?: HarnessPersistencePort;
}

/**
 * The probes the service ships with.
 *
 * They are the two questions worth asking of a proposed harness before it is
 * composed: is it well formed, and does the prompt it carries still say
 * something. A host registers its own alongside them.
 */
export interface RegisteredProbe {
  id: string;
  description: string;
  spec: ProbeSpec;
}

const BUILT_IN_PROBES: Record<string, RegisteredProbe> = {
  'harness-validity': {
    id: 'harness-validity',
    description: 'Checks that the proposed harness is well formed and declares no manual approval gate.',
    spec: {
    probeId: 'harness-validity',
    language: 'javascript',
    expect: { format: 'json', requiredFields: ['ok', 'findings'] },
    source: `const fs = require('fs');
const path = require('path');
const workDir = process.env.STAGE7_PROBE_WORK_DIR || process.cwd();
const findings = [];
let harness = {};
try {
  harness = JSON.parse(fs.readFileSync(path.join(workDir, 'harness.json'), 'utf8'));
} catch (err) {
  findings.push('the harness is not valid JSON: ' + err.message);
}
if (harness.systemPrompt !== undefined && typeof harness.systemPrompt !== 'string') {
  findings.push('harness.systemPrompt must be a string');
}
for (const [index, heuristic] of (harness.heuristics || []).entries()) {
  if (!heuristic || typeof heuristic.id !== 'string' || typeof heuristic.rule !== 'string') {
    findings.push('harness.heuristics[' + index + '] needs an id and a rule');
  }
}
for (const [index, skill] of (harness.skills || []).entries()) {
  if (!skill || typeof skill.skillId !== 'string') {
    findings.push('harness.skills[' + index + '] needs a skillId');
  }
}
for (const [index, tool] of (harness.tools || []).entries()) {
  if (tool && (tool.confirmBeforeSend !== undefined || (tool.manifest && tool.manifest.confirmBeforeSend !== undefined))) {
    findings.push('harness.tools[' + index + '] declares the approval gate by hand');
  }
}
const ok = findings.length === 0;
console.log(JSON.stringify({ ok, findings }));
process.exit(ok ? 0 : 1);
`,
    },
  },
  'harness-prompt-smoke': {
    id: 'harness-prompt-smoke',
    description: 'Checks that the proposed system prompt is present and within its length budget.',
    spec: {
    probeId: 'harness-prompt-smoke',
    language: 'javascript',
    expect: { format: 'json', requiredFields: ['ok', 'length'] },
    source: `const fs = require('fs');
const path = require('path');
const workDir = process.env.STAGE7_PROBE_WORK_DIR || process.cwd();
const prompt = fs.readFileSync(path.join(workDir, 'harness.prompt'), 'utf8');
const findings = [];
if (!prompt.trim()) findings.push('the system prompt is empty');
if (prompt.length > 20000) findings.push('the system prompt is longer than 20000 characters');
const ok = findings.length === 0;
console.log(JSON.stringify({ ok, length: prompt.length, findings }));
process.exit(ok ? 0 : 1);
`,
    },
  },
};

export class HarnessEditService {
  private readonly registry?: ToolRegistry;
  private readonly probes: ProbeExecutor;
  private readonly persistence?: HarnessPersistencePort;
  private readonly loop: HarnessLoop;
  private readonly registeredProbes = new Map<string, RegisteredProbe>(
    Object.entries(BUILT_IN_PROBES),
  );

  constructor(options: HarnessEditServiceOptions = {}) {
    this.registry = options.registry;
    this.probes = options.probes ?? new ProbeExecutor();
    this.persistence = options.persistence;
    this.loop = new HarnessLoop(this.probes);
  }

  /** Registers a probe a candidate may name by id. */
  registerProbe(id: string, spec: ProbeSpec, description = id): void {
    this.registeredProbes.set(id, {
      id,
      description,
      spec: { ...spec, probeId: spec.probeId ?? id },
    });
  }

  listProbes(): Array<{ id: string; description: string }> {
    return [...this.registeredProbes.values()].map((entry) => ({
      id: entry.id,
      description: entry.description,
    }));
  }

  /** A registered probe, if there is one by that name. */
  getProbe(id: string): RegisteredProbe | undefined {
    return this.registeredProbes.get(id);
  }

  /**
   * Runs a registered probe.
   *
   * Only registered probes are reachable this way: a probe is arbitrary code,
   * and the set of code this service will run is the set it ships with plus
   * whatever a host has explicitly registered.
   */
  async runProbe(
    id: string,
    options: {
      files?: Record<string, string>;
      timeoutMs?: number;
      productionRoots?: string[];
      network?: 'off' | 'on';
    } = {},
  ): Promise<ProbeResult> {
    const registered = this.registeredProbes.get(id);
    if (!registered) {
      throw new Error(`no probe named "${id}" is registered`);
    }
    const spec = registered.spec;
    return this.probes.run({
      ...spec,
      probeId: spec.probeId ?? id,
      files: { ...(spec.files ?? {}), ...(options.files ?? {}) },
      timeoutMs: options.timeoutMs ?? spec.timeoutMs,
      productionRoots: options.productionRoots ?? spec.productionRoots,
      network: options.network ?? spec.network,
    });
  }

  /**
   * Runs the inner loop for one assistant.
   *
   * Returns a result in every case — including the ones where the loop was
   * not allowed to run — because the caller asked a question and deserves an
   * answer, not an exception.
   */
  async evolve(request: HarnessEvolveRequest): Promise<HarnessEvolveResult> {
    const policy = resolveHarnessLearningPolicy({
      tenantId: request.tenantId,
      metadata: request.metadata,
      harness: request.harness,
    });

    if (!policy.enabled || !policy.tenantAllowed) {
      logger.info(
        { assistantId: request.assistantId, reason: policy.reason },
        'Harness loop did not run',
      );
      return {
        assistantId: request.assistantId,
        applied: false,
        harness: request.harness,
        evidence: [],
        approvalRequired: false,
        pendingApproval: [],
        rejected: [],
        reason: policy.reason,
      };
    }

    const resolved = this.resolveCandidates(request);
    const result: HarnessComposeResult = await this.loop.compose({
      current: request.harness,
      candidates: resolved,
      policy: this.buildPolicy(request),
      confirmation: request.confirmation,
      productionRoots: request.productionRoots,
      fixtures: request.fixtures,
    });

    if (result.applied && this.persistence) {
      try {
        await this.persistence.save(request.assistantId, result.harness);
      } catch (error) {
        logger.error(
          { assistantId: request.assistantId, err: error instanceof Error ? error.message : String(error) },
          'Could not persist the composed harness',
        );
      }
    }

    return {
      assistantId: request.assistantId,
      applied: result.applied,
      harness: result.harness,
      evidence: result.evidence,
      approvalRequired: result.approvalRequired,
      pendingApproval: result.pendingApproval,
      rejected: result.rejected,
      reason: result.reason,
    };
  }

  /**
   * Resolves each candidate's probe.
   *
   * A candidate may name a registered probe, or carry an inline spec. An
   * inline spec is arbitrary code, so it is only honoured when the assistant
   * has explicitly opted into inline probes.
   */
  private resolveCandidates(request: HarnessEvolveRequest): HarnessEditCandidate[] {
    const learning = readLearningBlock(request.metadata);
    const allowInline = learning?.allowInlineProbes === true;

    return (request.candidates ?? []).map((candidate) => {
      if (candidate.probe) {
        if (!allowInline) {
          return { ...candidate, probe: undefined, probeId: candidate.probeId };
        }
        return candidate;
      }
      if (!candidate.probeId) return candidate;

      const registered = this.registeredProbes.get(candidate.probeId);
      if (!registered) return { ...candidate, probe: undefined };
      return {
        ...candidate,
        probe: {
          ...registered.spec,
          probeId: registered.spec.probeId ?? candidate.probeId,
        },
      };
    });
  }

  /**
   * Works out the gate for the assistant's skills.
   *
   * The skills come from the harness — the tools and the skills it names — and
   * their tiers come from the tool registry, so the gate is derived from the
   * same `tier` the runtime enforces rather than from anything the harness
   * says about itself.
   */
  private buildPolicy(request: HarnessEvolveRequest): HarnessGatePolicy {
    if (request.skills && request.skills.length > 0) {
      return { skills: request.skills };
    }

    const ids = new Set<string>();
    for (const tool of request.harness?.tools ?? []) {
      if (typeof tool?.id === 'string' && tool.id) ids.add(tool.id);
    }
    for (const skill of request.harness?.skills ?? []) {
      if (typeof skill?.skillId === 'string' && skill.skillId) ids.add(skill.skillId);
    }

    const skills: HarnessSkillFacts[] = [...ids].map((id) => {
      const tool = this.registry?.get(id);
      return { id, tier: tool?.tier, manifest: tool?.manifest as Record<string, unknown> | undefined };
    });

    return { skills };
  }
}
