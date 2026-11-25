import { ArtifactsService } from '@stage7-nextgen/artifacts';
import { AgentExecutor, AgentExecutionResult } from '../../services/agent-runtime/src/services/AgentExecutor';
import { PersistentAgentRuntime } from '../../services/agent-runtime/src/services/PersistentAgentRuntime';
import { AgentDefinition } from '../../services/agent-runtime/src/types';
import { WorkflowInput } from '../../services/temporal/src/types/workflow';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

// The per-task Temporal activity (executeMissionTaskActivity) was removed with
// the deprecated mission workflow (commit c79bbd8); task execution now lives in
// PersistentAgentRuntime.executeTask with execution checkpoints persisted
// through the Artifacts service. This suite ports the acceptance contract to
// that surface: an agent delegates, repairs a tool error, and — across a full
// runtime restart (as a Temporal retry produces) — replays the persisted
// result instead of re-executing.
describe('mission Agent acceptance across task retry', () => {
  const input: WorkflowInput = {
    missionId: 'mission-agent-acceptance',
    tenantId: 'tenant-1',
    assistantId: 'assistant-1',
    prompt: 'Find and validate one source.',
  };
  const task = {
    id: 'task-1',
    title: 'Find a source',
    description: 'Use the lookup tool to find a verified source.',
    agentRole: 'researcher',
    systemPrompt: 'You are a careful researcher.',
    expectedArtifacts: ['source.txt'],
  };
  const taskId = `${input.missionId}:phase-1:${task.id}`;

  function buildPersistence() {
    const savedStates = new Map<string, any>();
    const savedCheckpoints = new Map<string, any>();
    return {
      ready: async () => {},
      getAgentState: async (agentId: string) => savedStates.get(agentId),
      saveAgentState: async (state: any) => {
        savedStates.set(state.agentId, structuredClone(state));
      },
      getExecutionCheckpoint: async (agentId: string, tid: string) => savedCheckpoints.get(`${agentId}:${tid}`),
      saveExecutionCheckpoint: async (checkpoint: any) => {
        savedCheckpoints.set(`${checkpoint.agentId}:${checkpoint.taskId}`, structuredClone(checkpoint));
      },
      deleteExecutionCheckpoint: async (agentId: string, tid: string) => {
        savedCheckpoints.delete(`${agentId}:${tid}`);
      },
      queryDocuments: async () => ({ documents: [] }),
    } as unknown as ArtifactsService;
  }

  it('delegates, repairs a tool error, then replays the persisted result on retry', async () => {
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

    const persistence = buildPersistence();
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

    const originalArtifactsUrl = process.env.ARTIFACTS_URL;
    const originalGatewayUrl = process.env.GATEWAY_URL;
    process.env.ARTIFACTS_URL = 'http://artifacts.test';
    delete process.env.GATEWAY_URL;

    try {
      const agentRuntime = new PersistentAgentRuntime(persistence, new AgentExecutor({ fetcher: brainToolFetcher }));
      agentRuntime.registerAgentForMission(input.missionId, agentDefinition);
      await agentRuntime.startAgent(agentDefinition.id, input.missionId);
      const submitted = await agentRuntime.submitTask(agentDefinition.id, {
        taskId,
        type: task.agentRole,
        input: {
          prompt: task.description,
          context: {
            missionId: input.missionId,
            phaseId: 'phase-1',
            taskId: task.id,
          },
        },
        priority: 1,
        status: 'pending',
      });
      const completed = await agentRuntime.executeTask(agentDefinition.id, submitted.taskId);
      const firstResult = completed.result as AgentExecutionResult;

      expect(firstResult.output).toBe('Completed with the delegated, verified source.');
      expect(agentRuntime.listAgentsForMission(input.missionId)).toHaveLength(2);
      expect(brainCalls).toBe(5);
      expect(toolCalls).toBe(2);
      expect(brainPrompts.some((prompt) => prompt.includes('Action failed: No source found for that query.')))
        .toBe(true);
      expect(successfulSideEffects).toBe(1);

      // A Temporal retry starts with a fresh runtime whose only state is the
      // persisted agent state and checkpoints. The retried execution must
      // replay the persisted result: no new Brain calls, no tool executions,
      // no duplicate side effects.
      const brainCallsBeforeRetry = brainCalls;
      const toolCallsBeforeRetry = toolCalls;
      const retriedRuntime = new PersistentAgentRuntime(persistence, new AgentExecutor({ fetcher: brainToolFetcher }));
      retriedRuntime.registerAgentForMission(input.missionId, agentDefinition);
      await retriedRuntime.startAgent(agentDefinition.id, input.missionId);
      // Task records are in-memory per runtime instance; a retry re-submits
      // the same deterministic task ID while the persisted checkpoint replays.
      const retriedSubmitted = await retriedRuntime.submitTask(agentDefinition.id, {
        taskId,
        type: task.agentRole,
        input: {
          prompt: task.description,
          context: {
            missionId: input.missionId,
            phaseId: 'phase-1',
            taskId: task.id,
          },
        },
        priority: 1,
        status: 'pending',
      });
      const retriedCompleted = await retriedRuntime.executeTask(agentDefinition.id, retriedSubmitted.taskId, true);
      const retriedResult = retriedCompleted.result as AgentExecutionResult;

      expect(retriedResult).toEqual(firstResult);
      expect(brainCalls).toBe(brainCallsBeforeRetry);
      expect(toolCalls).toBe(toolCallsBeforeRetry);
      expect(successfulSideEffects).toBe(1);
    } finally {
      if (originalArtifactsUrl === undefined) delete process.env.ARTIFACTS_URL;
      else process.env.ARTIFACTS_URL = originalArtifactsUrl;
      if (originalGatewayUrl === undefined) delete process.env.GATEWAY_URL;
      else process.env.GATEWAY_URL = originalGatewayUrl;
    }
  });
});
