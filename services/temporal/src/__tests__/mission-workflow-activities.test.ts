import { Context } from '@temporalio/activity';
import { MissionAgentRuntime } from '../agent/MissionAgentRuntime';
import { executeMissionTaskActivity } from '../activities/missionWorkflowActivities';
import { WorkflowInput } from '../types/workflow';
import { Plan } from '@stage7-nextgen/shared';

jest.mock('@temporalio/activity', () => ({
  Context: { current: jest.fn() },
}));

const input: WorkflowInput = {
  missionId: 'mission-task-activity',
  tenantId: 'tenant-1',
  assistantId: 'assistant-1',
  prompt: 'Complete a task safely',
};

const plan: Plan = {
  summary: 'Complete a task safely',
  estimatedDuration: 'short',
  estimatedCost: 'low',
  requiresClarification: false,
  clarificationQuestions: [],
  phases: [{
    id: 'phase-1',
    name: 'Execution',
    goal: 'Complete the task',
    requiresApproval: false,
    status: 'in_progress',
    tasks: [{
      id: 'task-1',
      title: 'Complete the task',
      description: 'Produce the requested result.',
      agentRole: 'worker',
      systemPrompt: 'Be careful.',
      expectedArtifacts: ['result.txt'],
      status: 'in_progress',
      artifacts: [],
    }],
  }],
};

const phase = plan.phases[0]!;
const task = phase.tasks[0]!;
const result = {
  output: 'Completed',
  artifacts: [{ name: 'result.txt', type: 'text', content: 'Completed' }],
  tokensUsed: 12,
};

function jsonResponse(): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({}),
    text: async () => '',
  } as Response;
}

describe('mission task activity retry safety', () => {
  const originalFetch = global.fetch;
  const originalArtifactsUrl = process.env.ARTIFACTS_URL;
  const originalGatewayUrl = process.env.GATEWAY_URL;

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env.ARTIFACTS_URL = 'http://artifacts.test';
    delete process.env.GATEWAY_URL;
    global.fetch = jest.fn().mockResolvedValue(jsonResponse());
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (originalArtifactsUrl === undefined) delete process.env.ARTIFACTS_URL;
    else process.env.ARTIFACTS_URL = originalArtifactsUrl;
    if (originalGatewayUrl === undefined) delete process.env.GATEWAY_URL;
    else process.env.GATEWAY_URL = originalGatewayUrl;
  });

  it('executes a new task without requiring a receipt and returns its persisted result', async () => {
    const heartbeat = jest.fn();
    jest.spyOn(Context, 'current').mockReturnValue({
      info: { attempt: 1 },
      heartbeat,
    } as unknown as ReturnType<typeof Context.current>);
    const getOrCreate = jest.spyOn(MissionAgentRuntime.prototype, 'getOrCreateAgent')
      .mockResolvedValue('agent-mission-task-activity-worker');
    const execute = jest.spyOn(MissionAgentRuntime.prototype, 'executeTask')
      .mockResolvedValue(result);

    await expect(executeMissionTaskActivity({ input, plan, phase, task })).resolves.toEqual(result);

    expect(getOrCreate).toHaveBeenCalledWith('worker', 'Be careful.');
    expect(execute).toHaveBeenCalledWith(
      'agent-mission-task-activity-worker',
      task,
      phase,
      plan,
      false,
      expect.objectContaining({ maxBrainCalls: 8 }),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'http://artifacts.test/api/artifacts/missions/mission-task-activity/tasks/task-1',
      expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('"status":"completed"'),
      }),
    );
  });

  it('requires a completed receipt on activity retry to prevent replaying uncertain tool side effects', async () => {
    jest.spyOn(Context, 'current').mockReturnValue({
      info: { attempt: 2 },
      heartbeat: jest.fn(),
    } as unknown as ReturnType<typeof Context.current>);
    jest.spyOn(MissionAgentRuntime.prototype, 'getOrCreateAgent')
      .mockResolvedValue('agent-mission-task-activity-worker');
    const execute = jest.spyOn(MissionAgentRuntime.prototype, 'executeTask')
      .mockResolvedValue(result);

    await executeMissionTaskActivity({ input, plan, phase, task });

    expect(execute).toHaveBeenCalledWith(
      'agent-mission-task-activity-worker',
      task,
      phase,
      plan,
      true,
      expect.objectContaining({ maxBrainCalls: 8 }),
    );
    const persistedEvents = (global.fetch as jest.Mock).mock.calls
      .filter(([, options]) => (options as RequestInit).method === 'POST')
      .map(([, options]) => JSON.parse((options as RequestInit).body as string).type);
    expect(persistedEvents).not.toContain('task_started');
    expect(persistedEvents).toContain('task_completed');
  });

  it('fails explicitly when an activity retry finds no completed receipt', async () => {
    jest.spyOn(Context, 'current').mockReturnValue({
      info: { attempt: 2 },
      heartbeat: jest.fn(),
    } as unknown as ReturnType<typeof Context.current>);
    jest.spyOn(MissionAgentRuntime.prototype, 'getOrCreateAgent')
      .mockResolvedValue('agent-mission-task-activity-worker');
    jest.spyOn(MissionAgentRuntime.prototype, 'executeTask')
      .mockRejectedValue(new Error('Checkpointed task has no completed Agent receipt; refusing to execute it again'));

    await expect(executeMissionTaskActivity({ input, plan, phase, task }))
      .rejects.toThrow('no completed Agent receipt');
  });
});
