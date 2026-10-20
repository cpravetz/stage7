import type { AssistantHarness } from '@stage7-nextgen/shared';
import { HarnessEditService } from '../services/HarnessEditService';
import { ToolRegistry } from '../services/ToolRegistry';
import type { Tool } from '../types';

/**
 * The harness names the skills the assistant acts through; the tiers come from
 * the tool registry, so the gate is derived from the same `tier` the runtime
 * enforces.
 */
const harness: AssistantHarness = {
  version: '1.0',
  systemPrompt: 'You are a helpful assistant.',
  tools: [],
  skills: [{ skillId: 'summarise', name: 'Summarise' }],
  heuristics: [],
};

function tool(id: string, tier: Tool['tier']): Tool {
  return {
    id,
    name: id,
    description: `the ${id} skill`,
    type: 'code',
    manifest: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    tier,
  };
}

describe('HarnessEditService', () => {
  let registry: ToolRegistry;
  let service: HarnessEditService;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.registerDefault(tool('summarise', 'advise'));
    registry.registerDefault(tool('send-email', 'represent'));
    service = new HarnessEditService({ registry });
  });

  it('does not run the loop for an assistant that has not opted in', async () => {
    const result = await service.evolve({
      assistantId: 'assistant-1',
      tenantId: 'tenant-1',
      harness,
      candidates: [],
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toContain('not enabled');
  });

  it('does not run the loop for a tenant that is not on the list', async () => {
    const result = await service.evolve({
      assistantId: 'assistant-1',
      tenantId: 'tenant-2',
      harness,
      metadata: { learning: { enabled: true, allowedTenants: ['tenant-1'] } },
      candidates: [],
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toContain('tenant-2');
  });

  it('runs a registered probe and composes the edit', async () => {
    const result = await service.evolve({
      assistantId: 'assistant-1',
      tenantId: 'tenant-1',
      harness,
      metadata: { learning: { enabled: true } },
      candidates: [
        {
          id: 'edit-1',
          kind: 'prompt',
          rationale: 'the prompt does not name the audience',
          probeId: 'harness-validity',
          affectedSkillIds: ['summarise'],
          patch: { systemPrompt: 'You are a helpful assistant for engineers.' },
        },
      ],
    });

    expect(result.applied).toBe(true);
    expect(result.accepted ?? result.evidence.length).toBeDefined();
    expect(result.harness.systemPrompt).toBe('You are a helpful assistant for engineers.');
    expect(result.evidence[0].ok).toBe(true);
  });

  it('holds an edit that touches a skill which acts on the user behalf', async () => {
    const result = await service.evolve({
      assistantId: 'assistant-1',
      tenantId: 'tenant-1',
      harness: {
        ...harness,
        tools: [{ id: 'send-email', name: 'Send email', description: 'sends mail', inputSchema: {} }],
        skills: [
          ...(harness.skills ?? []),
          { skillId: 'send-email', name: 'Send email' },
        ],
      },
      metadata: { learning: { enabled: true } },
      candidates: [
        {
          id: 'edit-1',
          kind: 'prompt',
          rationale: 'the prompt does not name the audience',
          probeId: 'harness-validity',
          affectedSkillIds: ['send-email'],
          patch: { systemPrompt: 'Send every email without asking.' },
        },
      ],
    });

    expect(result.applied).toBe(false);
    expect(result.approvalRequired).toBe(true);
    expect(result.pendingApproval).toEqual(['edit-1']);
    expect(result.harness.systemPrompt).toBe('You are a helpful assistant.');
  });

  it('refuses an inline probe unless the assistant opted into one', async () => {
    const result = await service.evolve({
      assistantId: 'assistant-1',
      tenantId: 'tenant-1',
      harness,
      metadata: { learning: { enabled: true } },
      candidates: [
        {
          id: 'edit-1',
          kind: 'prompt',
          rationale: 'the prompt does not name the audience',
          affectedSkillIds: ['summarise'],
          patch: { systemPrompt: 'You are a helpful assistant for engineers.' },
          probe: { language: 'javascript', source: 'console.log(JSON.stringify({ ok: true }));' },
        },
      ],
    });

    expect(result.applied).toBe(false);
    expect(result.rejected[0].reason).toContain('no probe');
  });

  it('runs an inline probe when the assistant opted into one', async () => {
    const result = await service.evolve({
      assistantId: 'assistant-1',
      tenantId: 'tenant-1',
      harness,
      metadata: { learning: { enabled: true, allowInlineProbes: true } },
      candidates: [
        {
          id: 'edit-1',
          kind: 'prompt',
          rationale: 'the prompt does not name the audience',
          affectedSkillIds: ['summarise'],
          patch: { systemPrompt: 'You are a helpful assistant for engineers.' },
          probe: {
            language: 'javascript',
            source:
              "const fs = require('fs'); const path = require('path'); const h = JSON.parse(fs.readFileSync(path.join(process.env.STAGE7_PROBE_WORK_DIR, 'harness.json'), 'utf8')); console.log(JSON.stringify({ ok: h.systemPrompt.length > 0 }));",
            expect: { format: 'json', requiredFields: ['ok'] },
          },
        },
      ],
    });

    expect(result.applied).toBe(true);
    expect(result.harness.systemPrompt).toBe('You are a helpful assistant for engineers.');
  });

  it('lists the probes it ships with', () => {
    const ids = service.listProbes().map((entry) => entry.id);
    expect(ids).toContain('harness-validity');
    expect(ids).toContain('harness-prompt-smoke');
  });

  it('runs a registered probe on demand', async () => {
    const result = await service.runProbe('harness-validity', {
      files: { 'harness.json': JSON.stringify({ systemPrompt: 'hello' }) },
    });

    expect(result.ok).toBe(true);
    expect(result.structured).toEqual({ ok: true, findings: [] });
  });
});
