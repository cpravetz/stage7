import { MissionStageCompletedListener } from '../src/listeners/MissionStageCompletedListener';
import type { Plan } from '@stage7-nextgen/shared';
import type { MissionPhaseOutput, WorkflowInput } from '../src/types/workflow';

type Call = { url: string; body: Record<string, unknown> };

function input(overrides: Partial<WorkflowInput> = {}): WorkflowInput {
  return {
    missionId: 'mission-9',
    tenantId: 'system',
    assistantId: 'ast-1',
    prompt: 'do the thing',
    ...overrides,
  };
}

function phase(): MissionPhaseOutput {
  return {
    phaseId: 'p1',
    name: 'Research',
    status: 'completed',
    tasks: [{ taskId: 't1', status: 'completed', artifacts: [], output: 'found it' }],
  };
}

const plan = { summary: 'Do the thing' } as unknown as Plan;

function installFetch(): Call[] {
  const calls: Call[] = [];
  jest.spyOn(global, 'fetch').mockImplementation((async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '',
    };
  }) as typeof fetch);
  return calls;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('MissionStageCompletedListener entity-memory slot', () => {
  it('writes to the assistant slot when metadata.entityId is absent', async () => {
    const calls = installFetch();
    await new MissionStageCompletedListener().onStageCompleted(input(), plan, phase());

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/api/brain/memory/entity');
    expect(calls[0].body.entityId).toBe('ast-1');
    expect(calls[0].body.assistantId).toBe('ast-1');
    expect(calls[0].body.tenantId).toBe('system');
  });

  it('falls back to the general slot when the input has no assistantId', async () => {
    const calls = installFetch();
    await new MissionStageCompletedListener().onStageCompleted(input({ assistantId: '' }), plan, phase());

    expect(calls[0].body.entityId).toBe('general');
    expect(calls[0].body.assistantId).toBe('general');
  });

  it('lets an explicit metadata.entityId win at the write site', async () => {
    const calls = installFetch();
    await new MissionStageCompletedListener().onStageCompleted(
      input({ metadata: { entityId: 'cust-7' } }),
      plan,
      phase(),
    );

    expect(calls[0].body.entityId).toBe('cust-7');
  });

  it('never falls back to the missionId', async () => {
    const calls = installFetch();
    await new MissionStageCompletedListener().onStageCompleted(input(), plan, phase());

    expect(calls[0].body.entityId).not.toBe('mission-9');
    expect(calls[0].body.missionId).toBe('mission-9');
  });
});
