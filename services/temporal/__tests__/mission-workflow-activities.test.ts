import { Context } from '@temporalio/activity';
import { MissionAgentRuntime } from '../src/agent/MissionAgentRuntime';
import {
  executeMissionTaskActivity,
  prepareMissionActivity,
  selectNextMissionTaskActivity,
} from '../src/activities/missionWorkflowActivities';
import { WorkflowInput } from '../src/types/workflow';
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
  clarificationAnswers: [],
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

  it('reuses the persisted plan for a retry instead of calling the planner again', async () => {
    const generatePlan = jest.spyOn(MissionAgentRuntime.prototype, 'generatePlan')
      .mockRejectedValue(new Error('retry must not regenerate the plan'));
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => plan,
    } as Response);

    await expect(prepareMissionActivity({
      ...input,
      metadata: { retriedFrom: `mission-${input.missionId}` },
    })).resolves.toEqual(plan);

    expect(generatePlan).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      `http://artifacts.test/api/artifacts/missions/${input.missionId}/plan`,
    );
  });

  it('executes a new task without requiring a receipt and returns its persisted result', async () => {
    const heartbeat = jest.fn();
    const restrictedInput: WorkflowInput = {
      ...input,
      metadata: {
        agentToolPolicies: {
          worker: { mode: 'allowlist', tools: ['calculate'] },
        },
      },
    }
    jest.spyOn(Context, 'current').mockReturnValue({
      info: { attempt: 1 },
      heartbeat,
    } as unknown as ReturnType<typeof Context.current>);
    const getOrCreate = jest.spyOn(MissionAgentRuntime.prototype, 'getOrCreateAgent');
    const execute = jest.spyOn(MissionAgentRuntime.prototype, 'executeTask')
      .mockResolvedValue(result);

    await expect(executeMissionTaskActivity({ input: restrictedInput, plan, phase, task })).resolves.toEqual(result);

    expect(getOrCreate).toHaveBeenCalledWith('worker', 'Be careful.');
    expect(execute).toHaveBeenCalledWith(
      'agent-mission-task-activity-worker',
      task,
      phase,
      plan,
      false,
      expect.objectContaining({ maxBrainCalls: Number.MAX_SAFE_INTEGER }),
      [],
    );
    const createdAgentRequest = (global.fetch as jest.Mock).mock.calls.find(
      ([url, options]) =>
        String(url).endsWith('/missions/mission-task-activity/agents')
        && (options as RequestInit).method === 'POST',
    )
    expect(JSON.parse((createdAgentRequest?.[1] as RequestInit).body as string)).toMatchObject({
      tools: ['calculate'],
      toolPolicy: { mode: 'allowlist' },
    })
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
      expect.objectContaining({ maxBrainCalls: Number.MAX_SAFE_INTEGER }),
      [],
      'Resume from the persisted safe checkpoint and action receipts. Do not repeat external actions whose outcome is already recorded or uncertain.',
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

  it('fails a persisted human-role task without sending it to an Agent', async () => {
    jest.spyOn(Context, 'current').mockReturnValue({
      info: { attempt: 1 },
      heartbeat: jest.fn(),
    } as unknown as ReturnType<typeof Context.current>);
    const humanTask = { ...task, agentRole: 'Human' };
    const getOrCreate = jest.spyOn(MissionAgentRuntime.prototype, 'getOrCreateAgent');
    const execute = jest.spyOn(MissionAgentRuntime.prototype, 'executeTask');

    await expect(executeMissionTaskActivity({ input, plan, phase, task: humanTask }))
      .rejects.toThrow('cannot be executed with human agentRole "Human"');

    expect(getOrCreate).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      'http://artifacts.test/api/artifacts/missions/mission-task-activity/tasks/task-1',
      expect.objectContaining({ method: 'PUT', body: expect.stringContaining('"status":"failed"') }),
    );
  });

  it('does not send a persisted human-role phase to the task selector', async () => {
    const selectNext = jest.spyOn(MissionAgentRuntime.prototype, 'selectNextTask');

    await expect(selectNextMissionTaskActivity({
      input,
      plan,
      phase: { ...phase, tasks: [{ ...task, agentRole: 'User' }] },
      completedTaskIds: [],
      completedTaskSummaries: [],
    })).rejects.toThrow('Refusing to send the phase to the task selector');

    expect(selectNext).not.toHaveBeenCalled();
  });
});
