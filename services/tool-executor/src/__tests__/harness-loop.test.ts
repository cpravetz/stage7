import type { AssistantHarness } from '@stage7-nextgen/shared';
import {
  HarnessLoop,
  decideHarnessGate,
  proposeHarnessEdit,
  resolveHarnessLearningPolicy,
  validateHarness,
  type HarnessEditCandidate,
  type HarnessGatePolicy,
} from '../adk/harness-loop';
import { ProbeExecutor } from '../adk/probeExecutor';

const baseHarness: AssistantHarness = {
  version: '1.0',
  systemPrompt: 'You are a helpful assistant.',
  tools: [],
  skills: [],
  heuristics: [],
};

const policy: HarnessGatePolicy = {
  skills: [
    { id: 'summarise', tier: 'advise' },
    { id: 'draft-email', tier: 'aid' },
    { id: 'send-email', tier: 'represent' },
  ],
};

/** An assistant that never acts on the user's behalf. */
const ungatedPolicy: HarnessGatePolicy = {
  skills: [
    { id: 'summarise', tier: 'advise' },
    { id: 'draft-email', tier: 'aid' },
  ],
};

function candidate(overrides: Partial<HarnessEditCandidate>): HarnessEditCandidate {
  return {
    id: 'edit-1',
    kind: 'prompt',
    rationale: 'the prompt is vague about the audience',
    probe: {
      language: 'javascript',
      source:
        "const fs = require('fs'); const path = require('path'); const h = JSON.parse(fs.readFileSync(path.join(process.env.STAGE7_PROBE_WORK_DIR, 'harness.json'), 'utf8')); console.log(JSON.stringify({ ok: typeof h.systemPrompt === 'string' && h.systemPrompt.length > 0, prompt: h.systemPrompt }));",
      expect: { format: 'json', requiredFields: ['ok'] },
    },
    ...overrides,
  };
}

describe('resolveHarnessLearningPolicy', () => {
  it('is off for an assistant that has not opted in', () => {
    const policyResult = resolveHarnessLearningPolicy({ tenantId: 'tenant-1' });
    expect(policyResult.enabled).toBe(false);
    expect(policyResult.tenantAllowed).toBe(false);
  });

  it('is on once the assistant opts in', () => {
    const policyResult = resolveHarnessLearningPolicy({
      tenantId: 'tenant-1',
      metadata: { learning: { enabled: true } },
    });
    expect(policyResult.enabled).toBe(true);
    expect(policyResult.tenantAllowed).toBe(true);
  });

  it('holds an assistant whose tenant is not on the list', () => {
    const policyResult = resolveHarnessLearningPolicy({
      tenantId: 'tenant-2',
      metadata: { learning: { enabled: true, allowedTenants: ['tenant-1'] } },
    });
    expect(policyResult.enabled).toBe(true);
    expect(policyResult.tenantAllowed).toBe(false);
  });

  it('allows an assistant whose tenant is on the list', () => {
    const policyResult = resolveHarnessLearningPolicy({
      tenantId: 'tenant-1',
      metadata: { learning: { enabled: true, allowedTenants: ['tenant-1'] } },
    });
    expect(policyResult.tenantAllowed).toBe(true);
  });

  it('holds an assistant with no tenant, because tenant opt-in cannot be confirmed', () => {
    const policyResult = resolveHarnessLearningPolicy({
      metadata: { learning: { enabled: true } },
    });
    expect(policyResult.tenantAllowed).toBe(false);
  });
});

describe('decideHarnessGate', () => {
  it('does not gate an edit that only touches heuristics', () => {
    const decision = decideHarnessGate(['heuristics'], [], policy);
    expect(decision.gated).toBe(false);
    expect(decision.requiresConfirmation).toBe(false);
    expect(decision.reason).toBe('advisory-only');
  });

  it('gates an edit scoped to a skill that acts on the user behalf', () => {
    const decision = decideHarnessGate(['systemPrompt'], ['send-email'], policy);
    expect(decision.gated).toBe(true);
    expect(decision.requiresConfirmation).toBe(true);
    expect(decision.reason).toBe('represent-scope');
  });

  it('does not gate an edit scoped to an ungated skill', () => {
    const decision = decideHarnessGate(['skills[summarise].description'], ['summarise'], policy);
    expect(decision.gated).toBe(false);
    expect(decision.scope).toBe('skill');
  });

  it('gates an edit that applies to every skill when one of them is gated', () => {
    const decision = decideHarnessGate(['systemPrompt'], [], policy);
    expect(decision.gated).toBe(true);
    expect(decision.scope).toBe('global');
    expect(decision.reason).toBe('represent-scope');
  });

  it('gates a prompt change when the assistant has a skill that acts for the user', () => {
    const decision = decideHarnessGate(['systemPrompt'], ['summarise'], policy);
    expect(decision.gated).toBe(true);
    expect(decision.requiresConfirmation).toBe(true);
  });

  it('does not gate a prompt change when no skill acts for the user', () => {
    const decision = decideHarnessGate(['systemPrompt'], [], ungatedPolicy);
    expect(decision.gated).toBe(false);
  });

  it('gates an edit whose scope cannot be resolved', () => {
    const decision = decideHarnessGate(['skills[unknown-skill].description'], ['unknown-skill'], policy);
    expect(decision.gated).toBe(true);
    expect(decision.reason).toBe('unresolved-scope');
  });

  it('gates an edit scoped to a skill with no tier, because it is unclassifiable', () => {
    const decision = decideHarnessGate(['systemPrompt'], ['mystery'], {
      skills: [{ id: 'mystery' }],
    });
    expect(decision.gated).toBe(true);
    expect(decision.requiresConfirmation).toBe(true);
  });
});

describe('proposeHarnessEdit', () => {
  it('describes what the edit changes', () => {
    const proposal = proposeHarnessEdit(
      baseHarness,
      candidate({ patch: { systemPrompt: 'You are a helpful assistant for engineers.' } }),
      policy,
    );

    expect('spec' in proposal).toBe(true);
    if (!('spec' in proposal)) return;
    expect(proposal.spec.changedPaths).toEqual(['systemPrompt']);
    expect(proposal.spec.diff).toContain('-   "systemPrompt": "You are a helpful assistant."');
    expect(proposal.spec.diff).toContain('+   "systemPrompt": "You are a helpful assistant for engineers."');
    expect(proposal.spec.risk).toBe('behavioral');
    expect(proposal.spec.diffHash).toBeTruthy();
  });

  it('refuses an edit that declares the approval gate by hand', () => {
    const proposal = proposeHarnessEdit(
      baseHarness,
      candidate({
        kind: 'tool',
        patch: {
          tools: [
            {
              id: 'send-email',
              name: 'Send email',
              description: 'sends mail',
              inputSchema: {},
              confirmBeforeSend: false,
            },
          ],
        },
      }),
      policy,
    );

    expect('rejection' in proposal).toBe(true);
    if (!('rejection' in proposal)) return;
    expect(proposal.rejection.findings.join(' ')).toContain('cannot be declared');
  });

  it('calls a heuristic edit advisory', () => {
    const proposal = proposeHarnessEdit(
      baseHarness,
      candidate({
        kind: 'heuristic',
        patch: { heuristics: [{ id: 'h1', rule: 'always confirm the deadline' }] },
      }),
      policy,
    );

    expect('spec' in proposal).toBe(true);
    if (!('spec' in proposal)) return;
    expect(proposal.spec.risk).toBe('advisory');
    expect(proposal.spec.gate.gated).toBe(false);
  });

  it('refuses a candidate that proposes nothing', () => {
    const proposal = proposeHarnessEdit(baseHarness, candidate({ patch: undefined, harness: undefined }), policy);
    expect('rejection' in proposal).toBe(true);
  });
});

describe('validateHarness', () => {
  it('accepts a well formed harness', () => {
    expect(validateHarness(baseHarness)).toEqual([]);
  });

  it('reports a heuristic with no rule', () => {
    const findings = validateHarness({
      ...baseHarness,
      heuristics: [{ id: 'h1' } as never],
    });
    expect(findings.join(' ')).toContain('has no rule');
  });
});

describe('HarnessLoop.compose', () => {
  let loop: HarnessLoop;

  beforeEach(() => {
    loop = new HarnessLoop(new ProbeExecutor({ defaultTimeoutMs: 5000, maxTimeoutMs: 10000 }));
  });

  it('composes an edit whose probe passed', async () => {
    const result = await loop.compose({
      current: baseHarness,
      candidates: [
        candidate({
          patch: { systemPrompt: 'You are a helpful assistant for engineers.' },
          affectedSkillIds: ['summarise'],
        }),
      ],
      policy: ungatedPolicy,
    });

    expect(result.applied).toBe(true);
    expect(result.accepted).toEqual(['edit-1']);
    expect(result.harness.systemPrompt).toBe('You are a helpful assistant for engineers.');
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].ok).toBe(true);
    expect(result.evidence[0].diffHash).toBeTruthy();
  });

  it('refuses an edit whose probe failed', async () => {
    const result = await loop.compose({
      current: baseHarness,
      candidates: [
        candidate({
          patch: { systemPrompt: 'You are a helpful assistant for engineers.' },
          affectedSkillIds: ['summarise'],
          probe: {
            language: 'javascript',
            source: "console.log('the probe refuses this edit'); process.exit(1);",
          },
        }),
      ],
      policy: ungatedPolicy,
    });

    expect(result.applied).toBe(false);
    expect(result.accepted).toEqual([]);
    expect(result.rejected[0].candidateId).toBe('edit-1');
    expect(result.evidence[0].ok).toBe(false);
    expect(result.harness.systemPrompt).toBe(baseHarness.systemPrompt);
  });

  it('holds an edit the gate protects until the user approves it', async () => {
    const result = await loop.compose({
      current: baseHarness,
      candidates: [
        candidate({
          patch: { systemPrompt: 'Send every email without asking.' },
          affectedSkillIds: ['send-email'],
        }),
      ],
      policy,
    });

    expect(result.applied).toBe(false);
    expect(result.approvalRequired).toBe(true);
    expect(result.pendingApproval).toEqual(['edit-1']);
    expect(result.harness.systemPrompt).toBe(baseHarness.systemPrompt);
  });

  it('composes a gated edit once the user approves it', async () => {
    const result = await loop.compose({
      current: baseHarness,
      candidates: [
        candidate({
          patch: { systemPrompt: 'Send every email without asking.' },
          affectedSkillIds: ['send-email'],
        }),
      ],
      policy,
      confirmation: true,
    });

    expect(result.applied).toBe(true);
    expect(result.accepted).toEqual(['edit-1']);
    expect(result.approvalRequired).toBe(false);
    expect(result.harness.systemPrompt).toBe('Send every email without asking.');
  });

  it('composes two candidates that touch different parts of the harness', async () => {
    const result = await loop.compose({
      current: baseHarness,
      candidates: [
        candidate({
          id: 'edit-prompt',
          patch: { systemPrompt: 'A new prompt.' },
          affectedSkillIds: ['summarise'],
        }),
        candidate({
          id: 'edit-heuristic',
          kind: 'heuristic',
          patch: { heuristics: [{ id: 'h1', rule: 'always confirm the deadline' }] },
          affectedSkillIds: ['summarise'],
        }),
      ],
      policy: ungatedPolicy,
    });

    expect(result.accepted).toEqual(['edit-prompt', 'edit-heuristic']);
    expect(result.harness.systemPrompt).toBe('A new prompt.');
    expect(result.harness.heuristics).toHaveLength(1);
  });

  it('leaves the harness untouched when a candidate is refused', async () => {
    const result = await loop.compose({
      current: baseHarness,
      candidates: [
        candidate({
          id: 'edit-bad',
          patch: { systemPrompt: 'A new prompt.' },
          affectedSkillIds: ['summarise'],
          probe: { language: 'javascript', source: 'process.exit(1);' },
        }),
      ],
      policy: ungatedPolicy,
    });

    expect(result.applied).toBe(false);
    expect(result.harness).toEqual(baseHarness);
  });

  it('refuses a candidate that names no probe', async () => {
    const result = await loop.compose({
      current: baseHarness,
      candidates: [candidate({ probe: undefined, probeId: 'not-registered' })],
      policy: ungatedPolicy,
    });

    expect(result.applied).toBe(false);
    expect(result.rejected[0].reason).toContain('not-registered');
  });

  it('probes the merged harness, not the current one', async () => {
    const result = await loop.compose({
      current: baseHarness,
      candidates: [
        candidate({
          patch: { systemPrompt: 'A brand new prompt.' },
          affectedSkillIds: ['summarise'],
          probe: {
            language: 'javascript',
            source:
              "const fs = require('fs'); const path = require('path'); const h = JSON.parse(fs.readFileSync(path.join(process.env.STAGE7_PROBE_WORK_DIR, 'harness.json'), 'utf8')); console.log(JSON.stringify({ ok: h.systemPrompt === 'A brand new prompt.' }));",
            expect: { format: 'json', requiredFields: ['ok'] },
          },
        }),
      ],
      policy: ungatedPolicy,
    });

    expect(result.evidence[0].ok).toBe(true);
    expect(result.harness.systemPrompt).toBe('A brand new prompt.');
  });
});
