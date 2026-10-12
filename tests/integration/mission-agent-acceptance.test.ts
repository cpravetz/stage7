import { Context } from '@temporalio/activity';
import { ArtifactsService } from '@stage7-nextgen/artifacts';
import { Plan, Task } from '@stage7-nextgen/shared';
import { AgentExecutor, AgentExecutionResult } from '../../services/agent-runtime/src/services/AgentExecutor';
import { PersistentAgentRuntime } from '../../services/agent-runtime/src/services/PersistentAgentRuntime';
import { AgentDefinition } from '../../services/agent-runtime/src/types';
import { MissionAgentRuntime, TaskExecutionResult } from '../../services/temporal/src/agent/MissionAgentRuntime';
import { executeMissionTaskActivity } from '../../services/temporal/src/activities/missionWorkflowActivities';
import { WorkflowInput } from '../../services/temporal/src/types/workflow';

jest.mock('@temporalio/activity', () => ({
  Context: { current: jest.fn() },
}));

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('mission Agent acceptance across Temporal task retry', () => {
  const input: WorkflowInput = {
    missionId: 'mission-agent-acceptance',
    tenantId: 'tenant-1',
    assistantId: 'assistant-1',
    prompt: 'Find and validate one source.',
  };
  const task: Task = {
    id: 'task-1',
    title: 'Find a source',
    description: 'Use the lookup tool to find a verified source.',
    agentRole: 'researcher',
    systemPrompt: 'You are a careful researcher.',
    expectedArtifacts: ['source.txt'],
    status: 'pending',
    artifacts: [],
  };
  const phase = {
    id: 'phase-1',
    name: 'Research',
    goal: 'Find a verified source.',
    requiresApproval: false,
    status: 'in_progress' as const,
    tasks: [task],
  };
  const plan: Plan = {
    summary: 'Find a verified source.',
    estimatedDuration: 'short',
    estimatedCost: 'low',
    requiresClarification: false,
    clarificationQuestions: [],
    phases: [phase],
  };

  it('delegates, repairs a tool error, then replays the persisted result on activity retry', async () => {
    const originalFetch = global.fetch;
    const originalArtifactsUrl = process.env.ARTIFACTS_URL;
    const originalGatewayUrl = process.env.GATEWAY_URL;
    type SavedAgentState = {
      agentId: string;
      tenantId: string;
      missionId: string;
      status: string;
      context: Record<string, unknown>;
      artifacts: string[];
      createdAt: Date;
      updatedAt: Date;
    };
    const savedStates = new Map<string, SavedAgentState>();
    const persistence = {
      getAgentState: async (agentId: string) => savedStates.get(agentId),
      saveAgentState: async (state: SavedAgentState) => {
        savedStates.set(state.agentId, structuredClone(state));
      },
    } as unknown as ArtifactsService;
    const brainTurns = new Map<string, number>();
    const brainPrompts: string[] = [];
    let brainCalls = 0;
    let toolCalls = 0;
    let successfulSideEffects = 0;
    const brainToolFetcher: typeof fetch = async (url, init) => {
      const address = String(url);
      if (address.endsWith('/api/tool-executor/tools')) {
        return jsonResponse({
          tools: [{ id: 'lookup', name: 'Lookup', description: 'Find a source', type: 'code' }],
        });
      }
      if (address.endsWith('/api/brain/complete')) {
        brainCalls++;
        const request = JSON.parse(String(init?.body)) as { systemPrompt: string; prompt: string };
        brainPrompts.push(request.prompt);
        const agentKey = request.systemPrompt.includes('You are a researcher agent.') ? 'researcher' : 'parent';
        const turn = (brainTurns.get(agentKey) || 0) + 1;
        brainTurns.set(agentKey, turn);
        if (agentKey === 'parent') {
          return jsonResponse({
            content: turn === 1
              ? '{"tool":"__delegate","args":{"goal":"Find a verified source","role":"researcher"}}'
              : 'Completed with the delegated, verified source.',
          });
        }
        const responses = [
          '{"tool":"lookup","args":{"query":"invalid"}}',
          '{"tool":"lookup","args":{"query":"verified"}}',
          'I found a verified source.',
        ];
        return jsonResponse({ content: responses[turn - 1] });
      }
      if (address.endsWith('/api/tool-executor/tools/execute')) {
        toolCalls++;
        const request = JSON.parse(String(init?.body)) as { input: { query: string } };
        if (request.input.query === 'invalid') {
          return jsonResponse({ status: 'failed', error: 'No source found for that query.' }, 400);
        }
        successfulSideEffects++;
        return jsonResponse({ status: 'completed', output: { source: 'verified source' } });
      }
      throw new Error(`Unexpected Brain/tool request: ${address}`);
    };

    let agentRuntime = new PersistentAgentRuntime(persistence, new AgentExecutor({ fetcher: brainToolFetcher }));
    const agentDefinition: AgentDefinition = {
      id: `agent-${input.missionId}-researcher`,
      tenantId: input.tenantId!,
      name: 'Researcher Agent',
      description: 'Mission-scoped researcher.',
      type: 'researcher',
      systemPrompt: task.systemPrompt,
      tools: [],
      metadata: { missionId: input.missionId, agentRole: task.agentRole },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const getOrCreate = jest.spyOn(MissionAgentRuntime.prototype, 'getOrCreateAgent')
      .mockImplementation(async () => {
        if (!agentRuntime.getAgent(agentDefinition.id)) {
          agentRuntime.registerAgentForMission(input.missionId, agentDefinition);
        }
        await agentRuntime.startAgent(agentDefinition.id, input.missionId);
        return agentDefinition.id;
      });
    const execute = jest.spyOn(MissionAgentRuntime.prototype, 'executeTask')
      .mockImplementation(async (
        agentId,
        currentTask,
        currentPhase,
        _currentPlan,
        requireCompletedReceipt = false,
        executionPolicy,
      ): Promise<TaskExecutionResult> => {
        const submitted = await agentRuntime.submitTask(agentId, {
          taskId: `${input.missionId}:${currentPhase.id}:${currentTask.id}`,
          type: currentTask.agentRole,
          input: {
            prompt: currentTask.description,
            context: {
              missionId: input.missionId,
              phaseId: currentPhase.id,
              taskId: currentTask.id,
              ...(executionPolicy ? { executionPolicy } : {}),
            },
          },
          priority: 1,
          status: 'pending',
        });
        const completed = await agentRuntime.executeTask(agentId, submitted.taskId, requireCompletedReceipt);
        const result = completed.result as AgentExecutionResult;
        return {
          output: result.output,
          artifacts: [{ name: 'source.txt', type: 'text', content: result.output }],
          tokensUsed: result.tokensUsed,
        };
      });

    process.env.ARTIFACTS_URL = 'http://artifacts.test';
    delete process.env.GATEWAY_URL;
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({}));
    jest.spyOn(Context, 'current').mockReturnValue({
      info: { attempt: 1 },
      heartbeat: jest.fn(),
    } as unknown as ReturnType<typeof Context.current>);

    try {
      const firstResult = await executeMissionTaskActivity({ input, plan, phase, task });
      expect(firstResult.output).toBe('Completed with the delegated, verified source.');
      expect(agentRuntime.listAgentsForMission(input.missionId)).toHaveLength(2);
      expect(brainCalls).toBe(5);
      expect(toolCalls).toBe(2);
      expect(brainPrompts.some((prompt) => prompt.includes('Action failed: No source found for that query.')))
        .toBe(true);
      expect(successfulSideEffects).toBe(1);

      const brainCallsBeforeRetry = brainCalls;
      const toolCallsBeforeRetry = toolCalls;
      agentRuntime = new PersistentAgentRuntime(persistence, new AgentExecutor({ fetcher: brainToolFetcher }));
      jest.spyOn(Context, 'current').mockReturnValue({
        info: { attempt: 2 },
        heartbeat: jest.fn(),
      } as unknown as ReturnType<typeof Context.current>);

      const retriedResult = await executeMissionTaskActivity({ input, plan, phase, task });

      expect(retriedResult).toEqual(firstResult);
      expect(brainCalls).toBe(brainCallsBeforeRetry);
      expect(toolCalls).toBe(toolCallsBeforeRetry);
      expect(successfulSideEffects).toBe(1);
      expect(getOrCreate).toHaveBeenCalledTimes(2);
      expect(execute.mock.calls.map((call) => call[4])).toEqual([false, true]);
    } finally {
      jest.restoreAllMocks();
      global.fetch = originalFetch;
      if (originalArtifactsUrl === undefined) delete process.env.ARTIFACTS_URL;
      else process.env.ARTIFACTS_URL = originalArtifactsUrl;
      if (originalGatewayUrl === undefined) delete process.env.GATEWAY_URL;
      else process.env.GATEWAY_URL = originalGatewayUrl;
    }
  });
});
