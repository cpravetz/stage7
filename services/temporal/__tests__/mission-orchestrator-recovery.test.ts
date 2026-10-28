import { MissionOrchestrator } from '../src/planner/MissionOrchestrator'
import { MissionContext } from '../src/planner/MissionOrchestrator'
import { DEFAULT_AGENT_EXECUTION_POLICY, Plan } from '@stage7-nextgen/shared'
import { MissionAgentRuntime } from '../src/agent/MissionAgentRuntime'

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

  it('returns a concrete gap when completed phase results do not cover the plan', async () => {
    const plan: Plan = {
      summary: 'Complete the work',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
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
      gaps: ['Completed 0 of 1 planned phases.'],
    })
  })

  it('reuses a checkpointed plan instead of generating another plan on retry', async () => {
    const plan: Plan = {
      summary: 'Clarify the requested outcome',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: true,
      clarificationQuestions: ['Which environment should be targeted?'],
      phases: [],
    }
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse())
    const onCheckpoint = jest.fn()
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

    expect(result.outputs.status).toBe('awaiting_clarification')
    expect(onCheckpoint).toHaveBeenCalledWith({
      version: 1,
      plan,
      completedTasks: [],
      completedPhases: [],
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/missions/mission-recovery/plan')
  })

  it('reuses completed task results from the activity checkpoint instead of executing them again', async () => {
    const plan: Plan = {
      summary: 'Produce an answer',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
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
      DEFAULT_AGENT_EXECUTION_POLICY,
      [],
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

  it('does not mark a phase complete when phase review fails', async () => {
    const plan: Plan = {
      summary: 'Complete and verify the requested work',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
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
      .mockRejectedValue(new Error('review service unavailable'))
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

    expect(result.outputs.status).toBe('incomplete')
    expect(result.plan.phases[0]?.status).toBe('in_progress')
    expect(reviewPhase).toHaveBeenCalledTimes(1)
    expect(reviewMissionCompletion).not.toHaveBeenCalled()
    expect(broadcast).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'phase_completed' }))
    expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({ type: 'mission_incomplete' }))
  })

  it('retries a failed task once from its safe checkpoint before recording it as failed', async () => {
    const plan: Plan = {
      summary: 'Complete the work',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
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
    expect(executeTask.mock.calls[1]?.[7]).toContain('persisted safe checkpoint and action receipts')
  })
})
