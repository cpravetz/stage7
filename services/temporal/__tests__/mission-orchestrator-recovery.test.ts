import { MissionOrchestrator } from '../src/planner/MissionOrchestrator'
import { MissionContext } from '../src/planner/MissionOrchestrator'
import { Plan } from '@stage7-nextgen/shared'
import { MISSION_TASK_EXECUTION_POLICY, MissionAgentRuntime } from '../src/agent/MissionAgentRuntime'
import type { MissionActivityCheckpoint } from '../src/types/workflow'
import { completedTaskIdsWithSummaries } from '../src/types/workflow'
import { dependencyArtifactGaps, extractArtifacts, missingDependencyInputs, missingExpectedArtifacts } from '../src/agent/TaskResultParser'
import { MissionCompletedListener } from '../src/listeners/MissionCompletedListener'

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
  it('retains internal headings within each named deliverable', () => {
    const artifacts = extractArtifacts(
      '## brief.txt\nSummary\n## Findings\nFive concepts.\n## analysis.txt\n## Ranking\nThree candidates.',
      ['brief.txt', 'analysis.txt'],
    )
    expect(artifacts.map(({ name, content }) => ({ name, content }))).toEqual([
      { name: 'brief.txt', content: 'Summary\n## Findings\nFive concepts.' },
      { name: 'analysis.txt', content: '## Ranking\nThree candidates.' },
    ])
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('only makes recovery tasks depend on task results that are available', () => {
    expect(completedTaskIdsWithSummaries(
      ['task-complete', 'task-pending', 'task-failed-without-output'],
      [{ taskId: 'task-complete' }],
    )).toEqual(['task-complete'])
  })

  it('does not execute a normal dependent task after an incomplete prerequisite', async () => {
    const plan: Plan = {
      summary: 'Complete dependent work', estimatedDuration: 'short', estimatedCost: 'low',
      requiresClarification: false, clarificationQuestions: [], clarificationAnswers: [],
      phases: [{
        id: 'phase-1', name: 'Work', goal: 'Complete work', requiresApproval: false, status: 'pending',
        tasks: [
          { id: 'task-1', title: 'Prerequisite', description: 'First', agentRole: 'worker',
            systemPrompt: 'First', expectedArtifacts: [], status: 'pending', artifacts: [] },
          { id: 'task-2', title: 'Dependent', description: 'Second', agentRole: 'worker',
            systemPrompt: 'Second', dependsOnTaskIds: ['task-1'], expectedArtifacts: [], status: 'pending', artifacts: [] },
        ],
      }],
    }
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse())
    jest.spyOn(MissionAgentRuntime.prototype, 'getOrCreateAgent').mockResolvedValue('agent-worker')
    const execute = jest.spyOn(MissionAgentRuntime.prototype, 'executeTask')
      .mockResolvedValue({ output: 'Not completed', incompleteReason: 'Blocked', artifacts: [], tokensUsed: 0 })
    let dependentBlocked = false
    const broadcast = jest.fn(async (event: { type: string; data?: any }) => {
      if (event.type === 'task_failed' && event.data?.taskId === 'task-2') dependentBlocked = true
    })
    await expect(new MissionOrchestrator().run({
      missionId: 'dependency-blocked', prompt: 'Complete dependent work',
      persistenceUrl: 'http://artifacts', gatewayUrl: 'http://gateway',
      broadcast, broadcastAll: jest.fn().mockResolvedValue(undefined), waitForApproval: jest.fn(),
      resumePlan: plan,
      controlCheckpoint: async () => { if (dependentBlocked) throw new Error('test checkpoint'); },
    })).rejects.toThrow('test checkpoint')
    expect(dependentBlocked).toBe(true)
    expect(execute.mock.calls.every((call) => call[1].id === 'task-1')).toBe(true)
  })

  it('stops phase recovery when a task has an uncertain action outcome', async () => {
    const plan: Plan = {
      summary: 'Send a message', estimatedDuration: 'short', estimatedCost: 'low',
      requiresClarification: false, clarificationQuestions: [], clarificationAnswers: [],
      phases: [{
        id: 'phase-1', name: 'Send', goal: 'Send', requiresApproval: false, status: 'pending',
        tasks: [{
          id: 'task-1', title: 'Send', description: 'Send a message', agentRole: 'worker',
          systemPrompt: 'Send', expectedArtifacts: [], status: 'pending', artifacts: [],
        }],
      }],
    }
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse())
    jest.spyOn(MissionAgentRuntime.prototype, 'getOrCreateAgent').mockResolvedValue('agent-worker')
    jest.spyOn(MissionAgentRuntime.prototype, 'stopAllAgents').mockResolvedValue()
    const execute = jest.spyOn(MissionAgentRuntime.prototype, 'executeTask').mockResolvedValue({
      output: '', incompleteReason: 'The send outcome is uncertain; reconcile it.',
      artifacts: [], tokensUsed: 0,
    })
    const review = jest.spyOn(MissionAgentRuntime.prototype, 'reviewPhase')
    const result = await new MissionOrchestrator().run({
      missionId: 'uncertain-send', prompt: 'Send a message',
      persistenceUrl: 'http://artifacts', gatewayUrl: 'http://gateway',
      broadcast: jest.fn().mockResolvedValue(undefined), broadcastAll: jest.fn().mockResolvedValue(undefined),
      waitForApproval: jest.fn(), resumePlan: plan,
    })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(review).not.toHaveBeenCalled()
    expect(result.outputs.status).toBe('incomplete')
    expect(result.outputs.gaps).toEqual([expect.stringContaining('uncertain')])
  })

  it('reports a long-running task without requesting user input', async () => {
    jest.useFakeTimers()
    try {
      const plan: Plan = {
        summary: 'Work', estimatedDuration: 'short', estimatedCost: 'low',
        requiresClarification: false, clarificationQuestions: [], clarificationAnswers: [],
        phases: [{
          id: 'phase-1', name: 'Work', goal: 'Work', requiresApproval: false, status: 'pending',
          tasks: [{ id: 'task-1', title: 'Work', description: 'Work', agentRole: 'worker',
            systemPrompt: 'Work', expectedArtifacts: [], status: 'pending', artifacts: [] }],
        }],
      }
      jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse())
      jest.spyOn(MissionAgentRuntime.prototype, 'getOrCreateAgent').mockResolvedValue('agent-worker')
      jest.spyOn(MissionAgentRuntime.prototype, 'reviewPhase').mockResolvedValue({ satisfied: true, gaps: [] })
      jest.spyOn(MissionAgentRuntime.prototype, 'stopAllAgents').mockResolvedValue()
      let finish!: (value: { output: string; artifacts: []; tokensUsed: number }) => void
      let notifyStarted!: () => void
      const started = new Promise<void>((resolve) => { notifyStarted = resolve })
      jest.spyOn(MissionAgentRuntime.prototype, 'executeTask').mockImplementation(() => {
        notifyStarted()
        return new Promise((resolve) => { finish = resolve })
      })
      const orchestrator = new MissionOrchestrator()
      jest.spyOn(orchestrator, 'evaluateMissionCompletion').mockResolvedValue({ satisfied: true, gaps: [] })
      const broadcastAll = jest.fn().mockResolvedValue(undefined)
      const running = orchestrator.run({
        missionId: 'running-status', prompt: 'Work', persistenceUrl: 'http://artifacts', gatewayUrl: 'http://gateway',
        broadcast: jest.fn().mockResolvedValue(undefined), broadcastAll, waitForApproval: jest.fn(), resumePlan: plan,
      })
      await started
      await jest.advanceTimersByTimeAsync(60_000)
      expect(broadcastAll).toHaveBeenCalledWith(expect.objectContaining({
        type: 'monologue',
        data: expect.objectContaining({ taskId: 'task-1', status: 'running', kind: 'waiting_for_agent_runtime' }),
      }))
      finish({ output: 'Done', artifacts: [], tokensUsed: 0 })
      await running
    } finally {
      jest.useRealTimers()
    }
  })

  it.each([
    { name: 'stagnant gaps', changingGaps: false, attempts: 3 },
    { name: 'changing gaps', changingGaps: true, attempts: 3 },
  ])('pauses recovery for $name without reporting completion', async ({ changingGaps, attempts }) => {
    const plan: Plan = {
      summary: 'Complete the work',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      clarificationAnswers: [],
      phases: [{
        id: 'phase-1', name: 'Execution', goal: 'Complete the work',
        requiresApproval: false, status: 'completed',
        tasks: [{
          id: 'task-1', title: 'Work', description: 'Work', agentRole: 'worker',
          systemPrompt: 'Work', expectedArtifacts: [], status: 'completed', artifacts: [], output: 'Done',
        }],
      }],
    }
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse())
    jest.spyOn(MissionAgentRuntime.prototype, 'getOrCreateAgent').mockResolvedValue('agent-worker')
    const execute = jest.spyOn(MissionAgentRuntime.prototype, 'executeTask')
      .mockResolvedValue({ output: 'No improvement', artifacts: [], tokensUsed: 0 })
    jest.spyOn(MissionAgentRuntime.prototype, 'stopAllAgents').mockResolvedValue()
    const completionListener = jest.spyOn(MissionCompletedListener.prototype, 'onMissionCompleted')
    const orchestrator = new MissionOrchestrator()
    let reviews = 0
    jest.spyOn(orchestrator, 'evaluateMissionCompletion').mockImplementation(async () => ({
      satisfied: false,
      gaps: [changingGaps ? `Unresolved gap ${++reviews}` : 'The outcome is still missing'],
    }))
    const broadcast = jest.fn().mockResolvedValue(undefined)

    const result = await orchestrator.run({
      missionId: 'stagnant', prompt: 'Complete the work', tenantId: 'tenant-1',
      persistenceUrl: 'http://artifacts', gatewayUrl: 'http://gateway',
      broadcast, broadcastAll: jest.fn().mockResolvedValue(undefined), waitForApproval: jest.fn(),
      resumeCheckpoint: {
        version: 1, plan, completedPhases: ['phase-1'],
        completedTasks: [{ phaseId: 'phase-1', taskId: 'task-1' }],
      },
    })

    const recoveryCalls = execute.mock.calls.filter((call) => call[1].id.includes('-mission-recovery-'))
    expect(recoveryCalls).toHaveLength(attempts)
    expect(result.outputs.status).toBe('incomplete')
    expect(result.outputs.gaps).toEqual([changingGaps ? 'Unresolved gap 4' : 'The outcome is still missing'])
    expect(result.outputs.reason).toContain('several approaches')
    expect(completionListener).not.toHaveBeenCalled()
    expect(broadcast).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'mission_completed' }))
  })

  it('does not abort a mission when the completion reviewer cannot produce a valid verdict', async () => {
    const plan: Plan = {
      summary: 'Complete the work',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      clarificationAnswers: [],
      phases: [{
        id: 'phase-1', name: 'Execution', goal: 'Complete the work',
        requiresApproval: false, status: 'completed',
        tasks: [{
          id: 'task-1', title: 'Work', description: 'Work', agentRole: 'worker',
          systemPrompt: 'Work', expectedArtifacts: [], status: 'completed', artifacts: [], output: 'Done',
        }],
      }],
    }
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse())
    jest.spyOn(MissionAgentRuntime.prototype, 'getOrCreateAgent').mockResolvedValue('agent-worker')
    const execute = jest.spyOn(MissionAgentRuntime.prototype, 'executeTask')
      .mockResolvedValue({ output: 'No improvement', artifacts: [], tokensUsed: 0 })
    jest.spyOn(MissionAgentRuntime.prototype, 'stopAllAgents').mockResolvedValue()
    const completionListener = jest.spyOn(MissionCompletedListener.prototype, 'onMissionCompleted')
    const orchestrator = new MissionOrchestrator()
    const review = jest.spyOn(orchestrator, 'evaluateMissionCompletion').mockResolvedValue({
      satisfied: false,
      gaps: ['Mission completion could not be verified: the reviewer did not identify a task-specific unmet requirement after 3 attempts.'],
      verificationFailed: true,
    })
    const broadcast = jest.fn().mockResolvedValue(undefined)

    const result = await orchestrator.run({
      missionId: 'verification-failed', prompt: 'Complete the work', tenantId: 'tenant-1',
      persistenceUrl: 'http://artifacts', gatewayUrl: 'http://gateway',
      broadcast, broadcastAll: jest.fn().mockResolvedValue(undefined), waitForApproval: jest.fn(),
      resumeCheckpoint: {
        version: 1, plan, completedPhases: ['phase-1'],
        completedTasks: [{ phaseId: 'phase-1', taskId: 'task-1' }],
      },
    })

    // Verification failure retries the review instead of spawning futile
    // recovery tasks, and resolves to a resumable review state, not an abort.
    const recoveryCalls = execute.mock.calls.filter((call) => call[1].id.includes('-mission-recovery-'))
    expect(recoveryCalls).toHaveLength(0)
    expect(review.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(result.outputs.status).toBe('awaiting_review')
    expect(result.outputs.reason).toContain('automatically verified')
    expect(completionListener).not.toHaveBeenCalled()
  })

  it('persists and pauses a recovery with an uncertain side effect without another attempt', async () => {
      const plan: Plan = {
        summary: 'Complete work', estimatedDuration: 'short', estimatedCost: 'low',
        requiresClarification: false, clarificationQuestions: [], clarificationAnswers: [],
        phases: [{
          id: 'phase-1', name: 'Execution', goal: 'Work', requiresApproval: false, status: 'completed',
          tasks: [{ id: 'task-1', title: 'Work', description: 'Work', agentRole: 'worker',
            systemPrompt: 'Work', status: 'completed', artifacts: [], output: 'Done' }],
        }],
      }
      jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse())
      jest.spyOn(MissionAgentRuntime.prototype, 'getOrCreateAgent').mockResolvedValue('agent-worker')
      const execute = jest.spyOn(MissionAgentRuntime.prototype, 'executeTask').mockImplementation(async (_agent, task) =>
        task.id === 'task-1'
          ? { output: 'Done', artifacts: [], tokensUsed: 0 }
          : {
            output: 'The outcome of tool "send" is uncertain; reconcile it.',
            incompleteReason: 'The outcome of tool "send" is uncertain; reconcile it.',
            artifacts: [], tokensUsed: 0,
          })
      jest.spyOn(MissionAgentRuntime.prototype, 'stopAllAgents').mockResolvedValue()
      const orchestrator = new MissionOrchestrator()
      jest.spyOn(orchestrator, 'evaluateMissionCompletion').mockResolvedValue({
        satisfied: false, gaps: ['task-1 still needs verification'],
      })
      const result = await orchestrator.run({
        missionId: 'uncertain', prompt: 'Complete work', tenantId: 'tenant-1',
        persistenceUrl: 'http://artifacts', gatewayUrl: 'http://gateway',
        broadcast: jest.fn().mockResolvedValue(undefined), broadcastAll: jest.fn().mockResolvedValue(undefined),
        waitForApproval: jest.fn(),
        resumeCheckpoint: {
          version: 1, plan, completedPhases: ['phase-1'],
          completedTasks: [{ phaseId: 'phase-1', taskId: 'task-1' }],
        },
      })
      expect(execute.mock.calls.filter((call) => call[1].id.includes('-mission-recovery-'))).toHaveLength(1)
      expect(result.outputs.status).toBe('incomplete')
      expect(result.outputs.gaps).toEqual(expect.arrayContaining([expect.stringContaining('uncertain')]))
      expect(result.plan.phases[0].tasks.at(-1)).toMatchObject({ status: 'incomplete', output: expect.stringContaining('uncertain') })
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
    jest.spyOn(MissionAgentRuntime.prototype, 'executePromptTask').mockResolvedValue({
      output: JSON.stringify({
        summary: 'Deploy the application',
        estimatedDuration: 'short',
        estimatedCost: 'low',
        requiresClarification: false,
        clarificationQuestions: [],
        clarificationAnswers: [],
        phases: [{
          id: 'phase-1',
          name: 'Deploy',
          goal: 'Deploy the application',
          requiresApproval: false,
          status: 'pending',
          tasks: [{
            id: 'phase-1-task-1',
            title: 'Deploy the application',
            description: 'Deploy the application.',
            agentRole: 'assistant',
            systemPrompt: 'Deploy the application.',
            dependsOnTaskIds: [],
            expectedArtifacts: [],
            requiredActions: [],
            status: 'pending',
            artifacts: [],
          }],
        }],
      }),
      requestId: 'planner-request',
      artifacts: [],
      tokensUsed: 1,
    })
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
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/missions/mission-recovery/plan'))).toBe(true)
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
    // Missions execute with one shared Agent rather than a separate Agent per
    // task role; the checkpoint reuses that Agent instead of re-registering one.
    expect(getAgent).toHaveBeenCalledTimes(1)
    expect(getAgent).toHaveBeenCalledWith('mission-executor', expect.stringContaining('mission execution agent'))
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
      undefined,
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
    // An empty resume plan is not reusable, so the planner regenerates it with
    // the phase under test; reviewPhase then fails transiently once before the
    // phase completes.
    jest.spyOn(MissionAgentRuntime.prototype, 'executePromptTask').mockResolvedValue({
      output: JSON.stringify({
        ...plan,
        phases: [{
          ...plan.phases[0]!,
          tasks: [{
            id: 'phase-1-task-1',
            title: 'Complete and verify the requested work',
            description: 'Complete and verify the requested work.',
            agentRole: 'assistant',
            systemPrompt: 'Complete and verify the requested work.',
            dependsOnTaskIds: [],
            expectedArtifacts: [],
            requiredActions: [],
            status: 'pending' as const,
            artifacts: [],
          }],
        }],
      }),
      requestId: 'planner-request',
      artifacts: [],
      tokensUsed: 1,
    })
    jest.spyOn(MissionAgentRuntime.prototype, 'getOrCreateAgent').mockResolvedValue('agent-assistant')
    jest.spyOn(MissionAgentRuntime.prototype, 'executeTask').mockResolvedValue({
      output: 'The work is complete.',
      artifacts: [],
      tokensUsed: 1,
    })
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

  describe('missing dependency input', () => {
    it('reports a declared artifact as missing when the produced artifact has no usable content', () => {
      expect(missingExpectedArtifacts(
        [{ name: 'report.md', type: 'document', content: '   ' }],
        ['report.md'],
      )).toEqual(['report.md'])
      expect(missingExpectedArtifacts(
        [{ name: 'report.md', type: 'document', content: 'the full report' }],
        ['report.md'],
      )).toEqual([])
      // An internal execution-outcome artifact never satisfies a deliverable.
      expect(missingExpectedArtifacts(
        [{ name: 'report.md', type: 'document', content: '{}', purpose: 'execution-outcome' }],
        ['report.md'],
      )).toEqual(['report.md'])
    })

    it('treats a dependency with no declared artifacts as having no missing input', () => {
      const dependency = { id: 'task-1', artifacts: [], expectedArtifacts: [] } as any
      expect(dependencyArtifactGaps(dependency)).toEqual([])
    })

    it('flags a completed dependency that did not produce its declared artifact', () => {
      const dependency = { id: 'task-1', status: 'completed', expectedArtifacts: ['report.md'], artifacts: [{ name: 'notes.txt', content: 'notes' }] } as any
      const task = { id: 'task-2', dependsOnTaskIds: ['task-1'] } as any
      const byId = new Map([['task-1', dependency]])
      expect(missingDependencyInputs(task, byId)).toEqual([
        { dependencyTaskId: 'task-1', missingArtifacts: ['report.md'] },
      ])
    })
  })

  it('reruns a dependency that completed without its declared artifact before running the dependent task', async () => {
    const plan: Plan = {
      summary: 'Produce then consume a report', estimatedDuration: 'short', estimatedCost: 'low',
      requiresClarification: false, clarificationQuestions: [], clarificationAnswers: [],
      phases: [{
        id: 'phase-1', name: 'Work', goal: 'Produce and consume a report', requiresApproval: false, status: 'pending',
        tasks: [
          { id: 'task-1', title: 'Produce report', description: 'Produce report.md', agentRole: 'worker',
            systemPrompt: 'Produce the report.', expectedArtifacts: ['report.md'], status: 'pending', artifacts: [] },
          { id: 'task-2', title: 'Consume report', description: 'Consume report.md', agentRole: 'worker',
            systemPrompt: 'Consume the report.', dependsOnTaskIds: ['task-1'], expectedArtifacts: [], status: 'pending', artifacts: [] },
        ],
      }],
    }
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse())
    jest.spyOn(MissionAgentRuntime.prototype, 'getOrCreateAgent').mockResolvedValue('agent-worker')
    let task1Runs = 0
    const execute = jest.spyOn(MissionAgentRuntime.prototype, 'executeTask').mockImplementation(async (_agent, task) => {
      if (task.id === 'task-1') {
        task1Runs++
        return task1Runs === 1
          ? { output: 'Done', artifacts: [{ name: 'notes.txt', type: 'document', content: 'notes' }], tokensUsed: 0 }
          : { output: 'Done', artifacts: [{ name: 'report.md', type: 'document', content: 'the full report' }], tokensUsed: 0 }
      }
      return { output: 'Consumed', artifacts: [], tokensUsed: 0 }
    })
    jest.spyOn(MissionAgentRuntime.prototype, 'stopAllAgents').mockResolvedValue()
    jest.spyOn(MissionAgentRuntime.prototype, 'reviewPhase').mockResolvedValue({ satisfied: true, gaps: [] })
    jest.spyOn(MissionAgentRuntime.prototype, 'reviewMissionCompletion').mockResolvedValue({ satisfied: true, gaps: [] })
    const broadcast = jest.fn().mockResolvedValue(undefined)

    const result = await new MissionOrchestrator().run({
      missionId: 'missing-input', prompt: 'Produce and consume a report', tenantId: 'tenant-1',
      persistenceUrl: 'http://artifacts', gatewayUrl: 'http://gateway',
      broadcast, broadcastAll: jest.fn().mockResolvedValue(undefined), waitForApproval: jest.fn(),
      resumePlan: plan,
    })

    // The prerequisite ran twice: once completing without the artifact, once
    // reopened to produce the missing report.md.
    expect(task1Runs).toBe(2)
    const task1Calls = execute.mock.calls.filter((call) => call[1].id === 'task-1')
    expect(task1Calls[0]?.[7]).toBeUndefined()
    expect(task1Calls[1]?.[7]).toContain('report.md')
    // The dependent ran exactly once, only after the artifact existed.
    expect(execute.mock.calls.filter((call) => call[1].id === 'task-2')).toHaveLength(1)
    expect(result.outputs.status).toBe('completed')
    expect(result.plan.phases[0]?.tasks.find((t) => t.id === 'task-1')?.status).toBe('completed')
  })

  it('does not rerun a dependency more than the bounded number of times when the artifact never appears', async () => {
    const plan: Plan = {
      summary: 'Produce then consume a report', estimatedDuration: 'short', estimatedCost: 'low',
      requiresClarification: false, clarificationQuestions: [], clarificationAnswers: [],
      phases: [{
        id: 'phase-1', name: 'Work', goal: 'Produce and consume a report', requiresApproval: false, status: 'pending',
        tasks: [
          { id: 'task-1', title: 'Produce report', description: 'Produce report.md', agentRole: 'worker',
            systemPrompt: 'Produce the report.', expectedArtifacts: ['report.md'], status: 'pending', artifacts: [] },
          { id: 'task-2', title: 'Consume report', description: 'Consume report.md', agentRole: 'worker',
            systemPrompt: 'Consume the report.', dependsOnTaskIds: ['task-1'], expectedArtifacts: [], status: 'pending', artifacts: [] },
        ],
      }],
    }
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse())
    jest.spyOn(MissionAgentRuntime.prototype, 'getOrCreateAgent').mockResolvedValue('agent-worker')
    let task1Runs = 0
    const execute = jest.spyOn(MissionAgentRuntime.prototype, 'executeTask').mockImplementation(async (_agent, task) => {
      if (task.id === 'task-1') {
        task1Runs++
        // Never produces report.md.
        return { output: 'Done', artifacts: [{ name: 'notes.txt', type: 'document', content: 'notes' }], tokensUsed: 0 }
      }
      return { output: 'Consumed', artifacts: [], tokensUsed: 0 }
    })
    jest.spyOn(MissionAgentRuntime.prototype, 'stopAllAgents').mockResolvedValue()
    jest.spyOn(MissionAgentRuntime.prototype, 'reviewPhase').mockResolvedValue({ satisfied: false, gaps: ['report.md missing'] })
    const orchestrator = new MissionOrchestrator()
    jest.spyOn(orchestrator, 'evaluateMissionCompletion').mockResolvedValue({ satisfied: false, gaps: ['report.md missing'] })

    const result = await orchestrator.run({
      missionId: 'missing-input-exhausted', prompt: 'Produce and consume a report', tenantId: 'tenant-1',
      persistenceUrl: 'http://artifacts', gatewayUrl: 'http://gateway',
      broadcast: jest.fn().mockResolvedValue(undefined), broadcastAll: jest.fn().mockResolvedValue(undefined),
      waitForApproval: jest.fn(), resumePlan: plan,
    })

    // 1 original run + MAX_DEPENDENCY_INPUT_RERUNS (2) reruns, then it stops.
    expect(task1Runs).toBe(3)
    // The dependent never ran because its input was never produced.
    expect(execute.mock.calls.filter((call) => call[1].id === 'task-2')).toHaveLength(0)
    expect(result.outputs.status).not.toBe('completed')
  })
})
describe('MissionOrchestrator missing-input recovery', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('retries the source task with a different prompt instead of failing the mission', async () => {
    const plan: Plan = {
      summary: 'Research and summarize',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      clarificationAnswers: [],
      phases: [{
        id: 'phase-1', name: 'Research', goal: 'Research and summarize', requiresApproval: false, status: 'pending',
        tasks: [
          {
            id: 'task-1', title: 'Research the market', description: 'Produce research.',
            agentRole: 'worker', systemPrompt: 'Research.', dependsOnTaskIds: [],
            expectedArtifacts: ['research.md'], status: 'pending', artifacts: [],
          },
          {
            id: 'task-2', title: 'Summarize the research', description: 'Summarize.',
            agentRole: 'worker', systemPrompt: 'Summarize.', dependsOnTaskIds: ['task-1'],
            expectedArtifacts: ['summary.md'], status: 'pending', artifacts: [],
          },
        ],
      }],
    }
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse())
    jest.spyOn(MissionAgentRuntime.prototype, 'getOrCreateAgent').mockResolvedValue('agent-worker')
    jest.spyOn(MissionAgentRuntime.prototype, 'reviewPhase').mockResolvedValue({ satisfied: true, gaps: [] })
    jest.spyOn(MissionAgentRuntime.prototype, 'reviewMissionCompletion').mockResolvedValue({ satisfied: true, gaps: [] })
    jest.spyOn(MissionAgentRuntime.prototype, 'stopAllAgents').mockResolvedValue()
    let task1Calls = 0
    const execute = jest.spyOn(MissionAgentRuntime.prototype, 'executeTask').mockImplementation(async (_agentId, task) => {
      if (task.id === 'task-1') {
        task1Calls += 1
        if (task1Calls < 3) {
          return {
            output: 'I could not finish the research yet.',
            incompleteReason: 'The research did not produce its required artifact.',
            artifacts: [],
            tokensUsed: 0,
          }
        }
        return {
          output: 'Research complete.',
          artifacts: [{ name: 'research.md', type: 'text', content: '# Findings\nSubstantive findings.' }],
          tokensUsed: 0,
        }
      }
      return {
        output: 'Summary complete.',
        artifacts: [{ name: 'summary.md', type: 'text', content: '# Summary\nSubstantive summary.' }],
        tokensUsed: 0,
      }
    })
    const broadcast = jest.fn().mockResolvedValue(undefined)

    const result = await new MissionOrchestrator().run({
      missionId: 'missing-input-recovery',
      prompt: 'Research and summarize the market',
      tenantId: 'tenant-1',
      persistenceUrl: 'http://artifacts',
      gatewayUrl: 'http://gateway',
      broadcast,
      broadcastAll: jest.fn().mockResolvedValue(undefined),
      waitForApproval: jest.fn(),
      resumePlan: plan,
    })

    const task1Executions = execute.mock.calls.filter((call) => call[1].id === 'task-1')
    expect(task1Executions.length).toBeGreaterThanOrEqual(3)
    expect(String(task1Executions.at(-1)?.[7] || '')).toMatch(/different approach|Reopened|reopened/i)
    expect(execute.mock.calls.some((call) => call[1].id === 'task-2')).toBe(true)
    expect(result.outputs.status).toBe('completed')
    expect(broadcast).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'mission_incomplete' }))
  })

  it('retries a transient phase-review failure at the same review index without consuming a recovery round', async () => {
    const plan: Plan = {
      summary: 'Complete and verify the requested work',
      estimatedDuration: 'short', estimatedCost: 'low',
      requiresClarification: false, clarificationQuestions: [], clarificationAnswers: [],
      phases: [{
        id: 'phase-1', name: 'Execution', goal: 'Complete and verify the requested work',
        requiresApproval: false, status: 'pending',
        tasks: [{
          id: 'phase-1-task-1', title: 'Complete and verify the requested work',
          description: 'Complete and verify the requested work.', agentRole: 'assistant',
          systemPrompt: 'Complete and verify the requested work.', dependsOnTaskIds: [],
          expectedArtifacts: [], requiredActions: [], status: 'pending', artifacts: [],
        }],
      }],
    }
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse())
    jest.spyOn(MissionAgentRuntime.prototype, 'getOrCreateAgent').mockResolvedValue('agent-assistant')
    jest.spyOn(MissionAgentRuntime.prototype, 'executeTask').mockResolvedValue({
      output: 'The work is complete.', artifacts: [], tokensUsed: 1,
    })
    // First review call fails transiently; the retry must reuse the SAME reviewIndex (1), not 2.
    const reviewIndexes: number[] = []
    const reviewPhase = jest.spyOn(MissionAgentRuntime.prototype, 'reviewPhase')
      .mockRejectedValueOnce(new Error('review service unavailable'))
      .mockImplementation(async (...args: any[]) => {
        reviewIndexes.push(args[4] as number)
        return { satisfied: true, gaps: [] }
      })
    jest.spyOn(MissionAgentRuntime.prototype, 'reviewMissionCompletion')
      .mockResolvedValue({ satisfied: true, gaps: [] })
    const broadcast = jest.fn().mockResolvedValue(undefined)

    const result = await new MissionOrchestrator().run({
      missionId: 'review-retry-index', prompt: 'Complete and verify the requested work',
      tenantId: 'tenant-1', persistenceUrl: 'http://artifacts', gatewayUrl: 'http://gateway',
      broadcast, broadcastAll: jest.fn().mockResolvedValue(undefined), waitForApproval: jest.fn(),
      resumePlan: plan,
    })

    expect(result.outputs.status).toBe('completed')
    // The transient failure did not advance the review index: the successful retry ran at index 1.
    expect(reviewIndexes).toEqual([1])
    expect(reviewPhase).toHaveBeenCalledTimes(2)
    expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({ type: 'phase_completed' }))
  })

  it('creates one fallback recovery task per gap when the reviewer proposes no follow-up', async () => {
    const plan: Plan = {
      summary: 'Complete the work',
      estimatedDuration: 'short', estimatedCost: 'low',
      requiresClarification: false, clarificationQuestions: [], clarificationAnswers: [],
      phases: [{
        id: 'phase-1', name: 'Execution', goal: 'Complete the work',
        requiresApproval: false, status: 'pending',
        tasks: [{
          id: 'task-1', title: 'Work', description: 'Work', agentRole: 'worker',
          systemPrompt: 'Work', dependsOnTaskIds: [], expectedArtifacts: [],
          requiredActions: [], status: 'pending', artifacts: [],
        }],
      }],
    }
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse())
    jest.spyOn(MissionAgentRuntime.prototype, 'getOrCreateAgent').mockResolvedValue('agent-worker')
    const execute = jest.spyOn(MissionAgentRuntime.prototype, 'executeTask')
      .mockResolvedValue({ output: 'Still incomplete', artifacts: [], tokensUsed: 0 })
    // Reviewer reports two gaps but no actionable follow-up task each round, so the Director must
    // synthesize one recovery task per gap.
    jest.spyOn(MissionAgentRuntime.prototype, 'reviewPhase')
      .mockResolvedValue({ satisfied: false, gaps: ['the report is missing', 'the summary is missing'] })
    jest.spyOn(MissionAgentRuntime.prototype, 'reviewMissionCompletion')
      .mockResolvedValue({ satisfied: false, gaps: ['the report is missing', 'the summary is missing'] })
    const amendedTasks: any[] = []
    const broadcast = jest.fn(async (event: { type: string; data?: any }) => {
      if (event.type === 'phase_plan_amended' && event.data?.task) amendedTasks.push(event.data.task)
    })

    const result = await new MissionOrchestrator().run({
      missionId: 'per-gap-fallback', prompt: 'Complete the work', tenantId: 'tenant-1',
      persistenceUrl: 'http://artifacts', gatewayUrl: 'http://gateway',
      broadcast, broadcastAll: jest.fn().mockResolvedValue(undefined), waitForApproval: jest.fn(),
      resumePlan: plan,
    })

    // At least two distinct fallback tasks were scheduled, one per reported gap.
    const firstRound = amendedTasks.filter((task) => String(task.id).includes('-amendment-'))
    expect(firstRound.length).toBeGreaterThanOrEqual(2)
    const ids = new Set(firstRound.slice(0, 2).map((task) => task.id))
    expect(ids.size).toBe(2)
    expect(result.outputs.status).not.toBe('completed')
  })
})
