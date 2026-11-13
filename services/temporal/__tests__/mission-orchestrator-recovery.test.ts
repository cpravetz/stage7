import { MissionOrchestrator } from '../src/planner/MissionOrchestrator'
import { MissionContext } from '../src/planner/MissionOrchestrator'
import { Plan } from '@stage7-nextgen/shared'
import { MISSION_TASK_EXECUTION_POLICY, MissionAgentRuntime } from '../src/agent/MissionAgentRuntime'
import type { MissionActivityCheckpoint } from '../src/types/workflow'
import { completedTaskIdsWithSummaries } from '../src/types/workflow'

function jsonResponse(body: unknown = {}): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response
}

describe('MissionOrchestrator checkpoint recovery', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('only makes recovery tasks depend on task results that are available', () => {
    expect(completedTaskIdsWithSummaries(
      ['task-complete', 'task-pending', 'task-failed-without-output'],
      [{ taskId: 'task-complete' }],
    )).toEqual(['task-complete'])
  })

  it('returns a concrete gap when completed phase results do not cover the plan', async () => {
    const plan: Plan = {
      summary: 'Complete the work',
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
        status: 'completed',
        tasks: [{
          id: 'task-1',
          title: 'Complete the task',
          description: 'Complete the task.',
          agentRole: 'worker',
          systemPrompt: 'Complete the task.',
          expectedArtifacts: [],
          status: 'completed',
          artifacts: [],
        }],
      }],
    }

    await expect(new MissionOrchestrator().evaluateMissionCompletion(
      { missionId: 'mission-incomplete', prompt: 'Complete the work' },
      plan,
      { phases: [] },
    )).resolves.toEqual({
      satisfied: false,
      gaps: ['Phase "Execution" (phase-1) has no execution result.'],
    })
  })

  it('turns a checkpointed clarification into an autonomous recovery task', async () => {
    const plan: Plan = {
      summary: 'Clarify the requested outcome',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: true,
      clarificationQuestions: ['Which environment should be targeted?'],
      clarificationAnswers: [],
      phases: [],
    }
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse())
    const onCheckpoint = jest.fn()
    jest.spyOn(MissionAgentRuntime.prototype, 'getOrCreateAgent').mockResolvedValue('agent-worker')
    jest.spyOn(MissionAgentRuntime.prototype, 'executeTask').mockResolvedValue({
      output: 'The available context was used to complete the requested outcome.',
      artifacts: [],
      tokensUsed: 1,
    })
    jest.spyOn(MissionAgentRuntime.prototype, 'reviewPhase').mockResolvedValue({ satisfied: true, gaps: [] })
    jest.spyOn(MissionAgentRuntime.prototype, 'reviewMissionCompletion').mockResolvedValue({ satisfied: true, gaps: [] })
    const context: MissionContext = {
      missionId: 'mission-recovery',
      prompt: 'Deploy the application',
      tenantId: 'tenant-1',
      persistenceUrl: 'http://artifacts',
      gatewayUrl: 'http://gateway',
      broadcast: jest.fn().mockResolvedValue(undefined),
      broadcastAll: jest.fn().mockResolvedValue(undefined),
      waitForApproval: jest.fn(),
      resumePlan: plan,
      onCheckpoint,
    }

    const result = await new MissionOrchestrator().run(context)

    expect(result.outputs.status).toBe('completed')
    expect(result.plan.requiresClarification).toBe(false)
    expect(result.plan.clarificationQuestions).toEqual([])
    expect(result.plan.phases).toHaveLength(1)
    expect(onCheckpoint).toHaveBeenCalledWith(expect.objectContaining({
      version: 1,
      completedPhases: ['phase-1'],
    }))
    expect(fetchMock).toHaveBeenCalled()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/missions/mission-recovery/plan')
  })

  it('reuses completed task results from the activity checkpoint instead of executing them again', async () => {
    const plan: Plan = {
      summary: 'Produce an answer',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      clarificationAnswers: [],
      phases: [{
        id: 'phase-1',
        name: 'Answer',
        goal: 'Produce a concise answer',
        requiresApproval: false,
        status: 'in_progress',
        tasks: [{
          id: 'task-1',
          title: 'Write the answer',
          description: 'Write the requested answer.',
          agentRole: 'writer',
          systemPrompt: 'Write clearly.',
          expectedArtifacts: ['answer.md'],
          status: 'pending',
          artifacts: [],
        }],
      }],
    }
    const taskResult = {
      output: 'The answer is ready.',
      artifacts: [{ name: 'answer.md', type: 'document', content: 'The answer is ready.' }],
      tokensUsed: 13,
    }
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      return jsonResponse()
    })
    const getAgent = jest.spyOn(MissionAgentRuntime.prototype, 'getOrCreateAgent')
      .mockResolvedValue('agent-writer')
    const executeTask = jest.spyOn(MissionAgentRuntime.prototype, 'executeTask')
      .mockResolvedValue(taskResult)
    const reviewPhase = jest.spyOn(MissionAgentRuntime.prototype, 'reviewPhase')
      .mockResolvedValue({ satisfied: true, gaps: [] })
    const reviewMissionCompletion = jest.spyOn(MissionAgentRuntime.prototype, 'reviewMissionCompletion')
      .mockResolvedValue({ satisfied: true, gaps: [] })
    const onCheckpoint = jest.fn()
    const broadcast = jest.fn().mockResolvedValue(undefined)
    const context: MissionContext = {
      missionId: 'mission-recovery',
      prompt: 'Write an answer',
      tenantId: 'tenant-1',
      persistenceUrl: 'http://artifacts',
      gatewayUrl: 'http://gateway',
      broadcast,
      broadcastAll: jest.fn().mockResolvedValue(undefined),
      waitForApproval: jest.fn(),
      resumeCheckpoint: {
        version: 1,
        plan,
        completedTasks: [{ phaseId: 'phase-1', taskId: 'task-1' }],
        completedPhases: [],
      },
      onCheckpoint,
    }

    const result = await new MissionOrchestrator().run(context)

    expect(result.outputs.status).toBe('completed')
    expect(result.outputs.phases[0].tasks[0].artifacts).toEqual(taskResult.artifacts)
    expect(result.plan.phases[0]?.status).toBe('completed')
    expect(result.plan.phases[0]?.tasks[0]).toMatchObject({
      status: 'completed',
      output: taskResult.output,
      artifacts: taskResult.artifacts,
    })
    expect(getAgent).toHaveBeenCalledWith('writer', plan.phases[0]!.tasks[0]!.systemPrompt)
    expect(reviewPhase).toHaveBeenCalledTimes(1)
    expect(reviewMissionCompletion).toHaveBeenCalledWith(
      context.prompt,
      plan.summary,
      expect.arrayContaining([
        expect.objectContaining({
          taskId: 'task-1',
          artifactNames: ['answer.md'],
        }),
      ]),
    )
    expect(executeTask).toHaveBeenCalledWith(
      'agent-writer',
      plan.phases[0]!.tasks[0]!,
      plan.phases[0]!,
      plan,
      true,
      MISSION_TASK_EXECUTION_POLICY,
      [],
      undefined,
      undefined,
      'Write an answer',
    )
    expect(onCheckpoint).toHaveBeenCalledWith(expect.objectContaining({
      completedTasks: [{ phaseId: 'phase-1', taskId: 'task-1' }],
      completedPhases: ['phase-1'],
    }))
    expect(fetchMock).toHaveBeenCalledWith(
      'http://artifacts/api/artifacts/missions/mission-recovery/tasks/task-1',
      expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('"status":"completed"'),
      }),
    )
    expect(broadcast).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'task_completed' }))
  })

  it('checks mission control after persisting the current task and before starting the next task', async () => {
    const plan: Plan = {
      summary: 'Complete two dependent tasks',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      clarificationAnswers: [],
      phases: [{
        id: 'phase-1',
        name: 'Execution',
        goal: 'Complete both tasks',
        requiresApproval: false,
        status: 'in_progress',
        tasks: [
          {
            id: 'task-1',
            title: 'First task',
            description: 'Complete the first task.',
            agentRole: 'worker',
            systemPrompt: 'Complete the task.',
            expectedArtifacts: [],
            status: 'pending',
            artifacts: [],
          },
          {
            id: 'task-2',
            title: 'Second task',
            description: 'Complete the second task.',
            agentRole: 'worker',
            systemPrompt: 'Complete the task.',
            expectedArtifacts: [],
            dependsOnTaskIds: ['task-1'],
            status: 'pending',
            artifacts: [],
          },
        ],
      }],
    }
    let firstTaskPersisted = false
    let controlChecks = 0
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      if (
        String(input).endsWith('/tasks/task-1')
        && init?.method === 'PUT'
        && String(init.body).includes('"status":"completed"')
      ) {
        firstTaskPersisted = true
      }
      return jsonResponse()
    })
    const executeTask = jest.spyOn(MissionAgentRuntime.prototype, 'executeTask')
      .mockResolvedValue({ output: 'done', artifacts: [], tokensUsed: 0 })
    jest.spyOn(MissionAgentRuntime.prototype, 'getOrCreateAgent').mockResolvedValue('agent-worker')
    const controlCheckpoint = jest.fn(async () => {
      controlChecks++
      if (controlChecks === 3) {
        expect(firstTaskPersisted).toBe(true)
        throw new Error('pause requested at safe checkpoint')
      }
    })

    const context: MissionContext = {
      missionId: 'mission-pause-boundary',
      prompt: 'Complete both tasks',
      tenantId: 'tenant-1',
      persistenceUrl: 'http://artifacts',
      gatewayUrl: 'http://gateway',
      broadcast: jest.fn().mockResolvedValue(undefined),
      broadcastAll: jest.fn().mockResolvedValue(undefined),
      waitForApproval: jest.fn(),
      resumePlan: plan,
      controlCheckpoint,
    }

    await expect(new MissionOrchestrator().run(context)).rejects.toThrow('pause requested at safe checkpoint')

    expect(firstTaskPersisted).toBe(true)
    expect(executeTask).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://artifacts/api/artifacts/missions/mission-pause-boundary/tasks/task-1',
      expect.objectContaining({ method: 'PUT', body: expect.stringContaining('"status":"completed"') }),
    )
  })

  it('retries a transient phase-review failure before completing the phase', async () => {
    const plan: Plan = {
      summary: 'Complete and verify the requested work',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      clarificationAnswers: [],
      phases: [{
        id: 'phase-1',
        name: 'Execution',
        goal: 'Complete and verify the requested work',
        requiresApproval: false,
        status: 'pending',
        tasks: [],
      }],
    }
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse())
    const reviewPhase = jest.spyOn(MissionAgentRuntime.prototype, 'reviewPhase')
      .mockRejectedValueOnce(new Error('review service unavailable'))
      .mockResolvedValue({ satisfied: true, gaps: [] })
    const reviewMissionCompletion = jest.spyOn(MissionAgentRuntime.prototype, 'reviewMissionCompletion')
      .mockResolvedValue({ satisfied: true, gaps: [] })
    const broadcast = jest.fn().mockResolvedValue(undefined)

    const result = await new MissionOrchestrator().run({
      missionId: 'mission-phase-review-failure',
      prompt: 'Complete and verify the requested work',
      tenantId: 'tenant-1',
      persistenceUrl: 'http://artifacts',
      gatewayUrl: 'http://gateway',
      broadcast,
      broadcastAll: jest.fn().mockResolvedValue(undefined),
      waitForApproval: jest.fn(),
      resumePlan: plan,
    })

    expect(result.outputs.status).toBe('completed')
    expect(result.plan.phases[0]?.status).toBe('completed')
    expect(reviewPhase).toHaveBeenCalledTimes(2)
    expect(reviewMissionCompletion).toHaveBeenCalled()
    expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({ type: 'phase_completed' }))
    expect(broadcast).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'mission_incomplete' }))
  })

  it('retries a failed task once from its safe checkpoint before recording it as failed', async () => {
    const plan: Plan = {
      summary: 'Complete the work',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      clarificationAnswers: [],
      phases: [{
        id: 'phase-1',
        name: 'Execution',
        goal: 'Complete the work',
        requiresApproval: false,
        status: 'pending',
        tasks: [{
          id: 'task-1',
          title: 'Complete the work',
          description: 'Complete the work.',
          agentRole: 'worker',
          systemPrompt: 'Be thorough.',
          expectedArtifacts: [],
          status: 'pending',
          artifacts: [],
        }],
      }],
    }
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse())
    jest.spyOn(MissionAgentRuntime.prototype, 'getOrCreateAgent').mockResolvedValue('agent-worker')
    const executeTask = jest.spyOn(MissionAgentRuntime.prototype, 'executeTask')
      .mockRejectedValueOnce(new Error('Brain request failed (503)'))
      .mockResolvedValueOnce({ output: 'The work is complete.', artifacts: [], tokensUsed: 1 })
    jest.spyOn(MissionAgentRuntime.prototype, 'reviewPhase')
      .mockResolvedValue({ satisfied: true, gaps: [] })
    jest.spyOn(MissionAgentRuntime.prototype, 'reviewMissionCompletion')
      .mockResolvedValue({ satisfied: true, gaps: [] })

    const result = await new MissionOrchestrator().run({
      missionId: 'mission-safe-task-retry',
      prompt: 'Complete the work',
      tenantId: 'tenant-1',
      persistenceUrl: 'http://artifacts',
      gatewayUrl: 'http://gateway',
      broadcast: jest.fn().mockResolvedValue(undefined),
      broadcastAll: jest.fn().mockResolvedValue(undefined),
      waitForApproval: jest.fn(),
      resumePlan: plan,
    })

    expect(result.outputs.status).toBe('completed')
    expect(executeTask).toHaveBeenCalledTimes(2)
    expect(executeTask.mock.calls[1]?.[7]).toContain('work saved so far')
  })

  it('pauses on an Agent input request and resumes the task after the user responds', async () => {
    const plan: Plan = {
      summary: 'Complete the work',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      clarificationAnswers: [],
      phases: [{
        id: 'phase-1',
        name: 'Execution',
        goal: 'Complete the work',
        requiresApproval: false,
        status: 'pending',
        tasks: [{
          id: 'task-1',
          title: 'Complete the work',
          description: 'Complete the requested action.',
          agentRole: 'worker',
          systemPrompt: 'Use the required values.',
          expectedArtifacts: [],
          status: 'pending',
          artifacts: [],
        }],
      }],
    }
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse())
    jest.spyOn(MissionAgentRuntime.prototype, 'getOrCreateAgent').mockResolvedValue('agent-worker')
    const executeTask = jest.spyOn(MissionAgentRuntime.prototype, 'executeTask')
      .mockResolvedValueOnce({
        output: '__ASK_USER__:{"question":"Which account should be used?"}',
        artifacts: [],
        actionReceipts: [
          { toolId: 'lookup-account', isError: false, content: '{"found":false}', outcome: 'success' },
          { toolId: 'protected-api', isError: true, content: 'credentials required', outcome: 'question_asked', actionKey: 'a'.repeat(64) },
        ],
        interruption: {
          kind: 'user_input', question: 'Which account should be used?',
          credentialRequest: {
            executionId: 'exec-1', toolId: 'protected-api', toolName: 'Protected API',
            missingCredentials: [{ key: 'account', label: 'Account' }],
          },
        },
        tokensUsed: 2,
      })
      .mockResolvedValueOnce({
        output: 'The requested action is complete.',
        artifacts: [],
        actionReceipts: [{ toolId: 'send-message', isError: false, content: '{"sent":true}', outcome: 'success' }],
        tokensUsed: 5,
      })
    jest.spyOn(MissionAgentRuntime.prototype, 'reviewPhase')
      .mockResolvedValue({ satisfied: true, gaps: [] })
    jest.spyOn(MissionAgentRuntime.prototype, 'reviewMissionCompletion')
      .mockResolvedValue({ satisfied: true, gaps: [] })
    const checkpoints: MissionActivityCheckpoint[] = []
    const broadcast = jest.fn().mockResolvedValue(undefined)
    const context = {
      missionId: 'mission-ask-user',
      prompt: 'Complete the action',
      tenantId: 'tenant-1',
      persistenceUrl: 'http://artifacts',
      gatewayUrl: 'http://gateway',
      broadcast,
      broadcastAll: jest.fn().mockResolvedValue(undefined),
      waitForApproval: jest.fn(),
      resumePlan: plan,
      onCheckpoint: (checkpoint: MissionActivityCheckpoint) => checkpoints.push(checkpoint),
    }
    const first = await new MissionOrchestrator().run(context)

    expect(first.outputs.status).toBe('awaiting_user_input')
    expect(first.outputs.pendingInteraction).toMatchObject({
      kind: 'user_input',
      taskId: 'task-1',
      question: 'Which account should be used?',
    })
    expect(first.plan.phases[0]?.tasks[0]?.status).toBe('pending')
    expect(executeTask).toHaveBeenCalledTimes(1)
    expect(first.plan.phases[0]?.tasks[0]?.output).toContain('Which account should be used?')
    expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({
      type: 'question_asked',
      data: expect.objectContaining({ taskId: 'task-1', question: 'Which account should be used?' }),
    }))
    const checkpoint = checkpoints.at(-1)!
    expect(checkpoint.pendingInteraction).toEqual(first.outputs.pendingInteraction)
    const evaluatePlanLoad = jest.spyOn(MissionAgentRuntime.prototype, 'evaluatePlanLoad')

    const resumed = await new MissionOrchestrator().run({
      ...context,
      resumePlan: first.plan,
      resumeCheckpoint: checkpoints.at(-1)!,
      interactionResponse: 'The commercial account.',
      userMessages: ['Use secret:account_key.', 'The commercial account.'],
    })
    expect(resumed.outputs.status).toBe('completed')
    expect(executeTask).toHaveBeenCalledTimes(2)
    expect(executeTask.mock.calls[1]?.[8]).toMatchObject({
      response: 'The commercial account.',
      pendingInteraction: expect.objectContaining({
        taskId: 'task-1',
        actionReceipts: [{ toolId: 'lookup-account', isError: false, content: '{"found":false}', outcome: 'success' }],
      }),
    })
    expect(executeTask.mock.calls[1]?.[10]).toEqual(['Use secret:account_key.', 'The commercial account.'])
    expect(evaluatePlanLoad).not.toHaveBeenCalled()
  })


  it('completes the mission when recovery evidence satisfies the original unmet requirement (successful recovery)', async () => {
    jest.spyOn(MissionAgentRuntime.prototype, 'reviewMissionCompletion').mockResolvedValue({ satisfied: true, gaps: [] })
    const plan: Plan = {
      summary: 'Send an SMS',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      clarificationAnswers: [],
      phases: [{
        id: 'phase-1',
        name: 'Send',
        goal: 'Send an SMS',
        requiresApproval: false,
        status: 'in_progress',
        tasks: [{
          id: 'task-1',
          title: 'Send the SMS',
          description: 'Send an SMS to +15551234567',
          agentRole: 'assistant',
          systemPrompt: 'Send the SMS.',
          dependsOnTaskIds: [],
          expectedArtifacts: [],
          requiredActions: [{ toolId: '__external_action__', outcome: 'success' }],
          requiresExternalAction: true,
          status: 'incomplete',
          artifacts: [],
          output: 'No verified send.',
        }, {
          id: 'phase-1-mission-recovery-1',
          title: 'Recovery send',
          description: 'Recovery send evidence',
          agentRole: 'assistant',
          systemPrompt: 'Produce recovery evidence.',
          dependsOnTaskIds: ['task-1'],
          expectedArtifacts: [],
          requiredActions: [],
          requiresExternalAction: false,
          status: 'completed',
          artifacts: [],
        }],
      }],
    }
    const result = await new MissionOrchestrator().evaluateMissionCompletion(
      { missionId: 'mission-recovery', prompt: 'Send an SMS', tenantId: 'tenant-1', metadata: {}, agentRuntimeUrl: 'http://agent-runtime' },
      plan,
      {
        phases: [{
          phaseId: 'phase-1',
          status: 'in_progress',
          tasks: [
            { taskId: 'task-1', status: 'incomplete', artifacts: [], output: 'No verified send.' },
            {
              taskId: 'phase-1-mission-recovery-1',
              status: 'completed',
              artifacts: [{
                name: 'system-action-receipts.json',
                type: 'json',
                content: JSON.stringify([{
                  toolId: 'text-service-twilio-sms',
                  outcome: 'success',
                  binding: { operation: 'send_sms', recipients: ['+15551234567'], message: 'Hello', executionId: 'sms-exec-1' },
                }]),
              }],
            },
          ],
        }],
      },
    )
    expect(result.satisfied).toBe(true)
    expect(result.gaps).toEqual([])
  })

  it('treats only completed tasks as satisfied dependencies; independent tasks can progress', () => {
    const summaries = [{ taskId: 'task-independent' }]
    expect(completedTaskIdsWithSummaries(
      ['task-independent', 'task-dependent'],
      summaries,
    )).toEqual(['task-independent'])
  })
})