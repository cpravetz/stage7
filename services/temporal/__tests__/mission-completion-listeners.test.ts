import { MissionCompletedListener } from '../src/listeners/MissionCompletedListener';
import { MissionStageCompletedListener } from '../src/listeners/MissionStageCompletedListener';
import type { Plan } from '@stage7-nextgen/shared';
import type { WorkflowInput } from '../src/types/workflow';

const input: WorkflowInput = {
  missionId: 'mission-12',
  tenantId: 'tenant-1',
  assistantId: 'legal',
  prompt: 'Review the contract.',
  metadata: {},
};
const plan: Plan = {
  summary: 'Review contract terms.',
  estimatedDuration: 'short',
  estimatedCost: 'low',
  requiresClarification: false,
  clarificationQuestions: [],
  clarificationAnswers: [],
  phases: [{
    id: 'phase-1',
    name: 'Clause review',
    goal: 'Identify risks.',
    requiresApproval: false,
    status: 'completed',
    tasks: [{
      id: 'task-1',
      title: 'Review clauses',
      description: 'Identify unusual indemnity terms.',
      agentRole: 'Researcher',
      systemPrompt: 'Review the clauses.',
      expectedArtifacts: [],
      status: 'completed',
      artifacts: [],
      output: 'Escalate unusual indemnity terms.',
    }],
  }],
};

describe('mission completion listeners', () => {
  const originalToolExecutorUrl = process.env.TOOL_EXECUTOR_URL;
  const originalBrainUrl = process.env.BRAIN_URL;

  beforeEach(() => {
    process.env.TOOL_EXECUTOR_URL = 'http://tool-executor:3500';
    process.env.BRAIN_URL = 'http://brain:3100';
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (originalToolExecutorUrl === undefined) delete process.env.TOOL_EXECUTOR_URL;
    else process.env.TOOL_EXECUTOR_URL = originalToolExecutorUrl;
    if (originalBrainUrl === undefined) delete process.env.BRAIN_URL;
    else process.env.BRAIN_URL = originalBrainUrl;
  });

  it('sends successful mission trajectories to the versioned Tool Executor endpoint', async () => {
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ skill: { skillId: 'generated-legal-skill' } }), { status: 201 }),
    );
    const phase = {
      phaseId: 'phase-1',
      name: 'Clause review',
      status: 'completed' as const,
      tasks: [{
        taskId: 'task-1',
        status: 'completed' as const,
        artifacts: [],
        output: 'Escalate unusual indemnity terms.',
      }],
    };

    await new MissionCompletedListener().onMissionCompleted(input, plan, [phase]);

    expect(fetch).toHaveBeenCalledWith(
      'http://tool-executor:3500/api/v1/compile-skill',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      authorAssistantId: 'legal',
      targetCategory: 'legal',
      trajectory: { missionId: 'mission-12', assistantId: 'legal' },
    });
  });

  it('sends completed stage output to Brain with the stable entity ID', async () => {
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ memory: {} }), { status: 201 }),
    );
    await new MissionStageCompletedListener().onStageCompleted(input, plan, {
      phaseId: 'phase-1',
      name: 'Clause review',
      status: 'completed',
      tasks: [{
        taskId: 'task-1',
        status: 'completed',
        artifacts: [],
        output: 'Escalate unusual indemnity terms.',
      }],
    });

    expect(fetch).toHaveBeenCalledWith(
      'http://brain:3100/api/brain/memory/entity',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({
      tenantId: 'tenant-1',
      entityId: 'legal',
      assistantId: 'legal',
      missionId: 'mission-12',
      stageName: 'Clause review',
    });
  });
});
