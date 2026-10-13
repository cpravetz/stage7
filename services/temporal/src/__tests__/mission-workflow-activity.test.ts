const mockActivities = {
  runMissionActivity: jest.fn(),
  prepareMissionActivity: jest.fn(),
  selectNextMissionTaskActivity: jest.fn(),
  reviewAndAmendMissionPhaseActivity: jest.fn(),
  startMissionPhaseActivity: jest.fn(),
  executeMissionTaskActivity: jest.fn(),
  finishMissionPhaseActivity: jest.fn(),
  awaitMissionPhaseApprovalActivity: jest.fn(),
  recordMissionPhaseApprovalActivity: jest.fn(),
  completeMissionActivity: jest.fn(),
}

jest.mock('@temporalio/workflow', () => ({
  proxyActivities: jest.fn(() => mockActivities),
  patched: jest.fn(() => true),
}))

import { patched, proxyActivities } from '@temporalio/workflow'
import { missionWorkflow } from '../workflows/missionWorkflow'
import { WorkflowInput } from '../types/workflow'
import { Plan } from '@stage7-nextgen/shared'

describe('missionWorkflow activity boundary', () => {
  beforeEach(() => {
    Object.values(mockActivities).forEach((activity) => activity.mockReset());
    (patched as jest.Mock).mockReturnValue(false)
  })

  it('schedules plan, tasks, and completion as separate Temporal activities', async () => {
    const input: WorkflowInput = {
      missionId: 'mission-1',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Complete the mission',
    }
    const plan: Plan = {
      summary: 'Complete the requested work',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      phases: [{
        id: 'phase-1',
        name: 'Execution',
        goal: 'Complete the requested work',
        requiresApproval: false,
        status: 'pending',
        tasks: [{
          id: 'task-1',
          title: 'Do the work',
          description: 'Complete the work.',
          agentRole: 'worker',
          systemPrompt: 'Be thorough.',
          expectedArtifacts: ['result'],
          status: 'pending',
          artifacts: [],
        }],
      }],
    }
    const artifacts = [{ name: 'result', type: 'text', content: 'Done' }]
    mockActivities.prepareMissionActivity.mockResolvedValue(plan)
    mockActivities.executeMissionTaskActivity.mockResolvedValue({ output: 'Done', artifacts, tokensUsed: 1 })
    mockActivities.completeMissionActivity.mockResolvedValue({
      plan,
      outputs: { phases: [], status: 'completed' },
      compensations: [],
    })

    const result = await missionWorkflow(input)

    expect(result.status).toBe('completed')
    expect(mockActivities.prepareMissionActivity).toHaveBeenCalledWith(input)
    expect(mockActivities.executeMissionTaskActivity).toHaveBeenCalledWith({
      input,
      plan,
      phase: plan.phases[0],
      task: plan.phases[0]!.tasks[0],
    })
    expect(mockActivities.startMissionPhaseActivity).toHaveBeenCalledTimes(1)
    expect(mockActivities.finishMissionPhaseActivity).toHaveBeenCalledWith({
      input,
      phase: plan.phases[0],
      tasks: [{ taskId: 'task-1', status: 'completed', artifacts }],
    })
    expect(mockActivities.completeMissionActivity).toHaveBeenCalledTimes(1)
    expect(proxyActivities).toHaveBeenCalledWith(expect.objectContaining({
      startToCloseTimeout: '2h',
      heartbeatTimeout: '2m',
      retry: expect.objectContaining({ maximumAttempts: 2 }),
    }))
  })

  it('returns awaiting review when the plan requires clarification', async () => {
    const plan: Plan = {
      summary: 'Clarify the requested outcome',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: true,
      clarificationQuestions: ['Which environment should be targeted?'],
      phases: [],
    }
    mockActivities.prepareMissionActivity.mockResolvedValue(plan)

    const result = await missionWorkflow({
      missionId: 'mission-1',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Complete the mission',
    })

    expect(result.status).toBe('awaiting_review')
    expect(mockActivities.executeMissionTaskActivity).not.toHaveBeenCalled()
  })

  it('lets the mission Agent select among dependency-ready tasks while Temporal owns execution', async () => {
    (patched as jest.Mock).mockReturnValueOnce(true).mockReturnValueOnce(false)
    const input: WorkflowInput = {
      missionId: 'mission-selection',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Complete the mission',
    }
    const phase = {
      id: 'phase-1',
      name: 'Execution',
      goal: 'Complete the requested work',
      requiresApproval: false,
      status: 'pending' as const,
      tasks: ['task-1', 'task-2', 'task-3'].map((id) => ({
        id,
        title: id,
        description: `Complete ${id}`,
        agentRole: 'worker',
        systemPrompt: 'Be thorough.',
        dependsOnTaskIds: id === 'task-2' ? ['task-1'] : [],
        expectedArtifacts: [],
        status: 'pending' as const,
        artifacts: [],
      })),
    }
    const plan: Plan = {
      summary: 'Complete the requested work',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      phases: [phase],
    }
    mockActivities.prepareMissionActivity.mockResolvedValue(plan)
    mockActivities.selectNextMissionTaskActivity
      .mockResolvedValueOnce('task-3')
      .mockResolvedValueOnce('task-1')
      .mockResolvedValueOnce('task-2')
    mockActivities.executeMissionTaskActivity.mockImplementation(async ({ task }) => ({
      output: `Finished ${task.id}`,
      artifacts: [],
      tokensUsed: 1,
    }))
    mockActivities.completeMissionActivity.mockResolvedValue({
      plan,
      outputs: { phases: [], status: 'completed' },
      compensations: [],
    })

    const result = await missionWorkflow(input)

    expect(result.status).toBe('completed')
    expect(mockActivities.executeMissionTaskActivity.mock.calls.map(([call]) => call.task.id))
      .toEqual(['task-3', 'task-1', 'task-2'])
    expect(mockActivities.selectNextMissionTaskActivity).toHaveBeenCalledTimes(1)
    expect(mockActivities.selectNextMissionTaskActivity.mock.calls[0]?.[0].completedTaskIds)
      .toEqual([])
  })

  it('keeps plan-order task execution for workflows without the selection patch', async () => {
    const plan: Plan = {
      summary: 'Do both tasks',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      phases: [{
        id: 'phase-1',
        name: 'Execution',
        goal: 'Do both tasks',
        requiresApproval: false,
        status: 'pending',
        tasks: ['task-1', 'task-2'].map((id) => ({
          id,
          title: id,
          description: `Complete ${id}`,
          agentRole: 'worker',
          systemPrompt: 'Be thorough.',
          expectedArtifacts: [],
          status: 'pending',
          artifacts: [],
        })),
      }],
    }
    mockActivities.prepareMissionActivity.mockResolvedValue(plan)
    mockActivities.executeMissionTaskActivity.mockResolvedValue({ output: 'Done', artifacts: [], tokensUsed: 0 })
    mockActivities.completeMissionActivity.mockResolvedValue({
      plan,
      outputs: { phases: [], status: 'completed' },
      compensations: [],
    })

    const result = await missionWorkflow({
      missionId: 'mission-legacy',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Do both tasks',
    })

    expect(result.status).toBe('completed')
    expect(mockActivities.executeMissionTaskActivity.mock.calls.map(([call]) => call.task.id))
      .toEqual(['task-1', 'task-2'])
    expect(mockActivities.selectNextMissionTaskActivity).not.toHaveBeenCalled()
  })

  it('executes a bounded Agent-proposed phase amendment before requesting approval', async () => {
    (patched as jest.Mock).mockReturnValue(true)
    const input: WorkflowInput = {
      missionId: 'mission-amendment',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Complete and verify the deliverable',
    }
    const originalPhase = {
      id: 'phase-1',
      name: 'Execution',
      goal: 'Complete and verify the deliverable',
      requiresApproval: true,
      status: 'pending' as const,
      tasks: [{
        id: 'task-1',
        title: 'Create deliverable',
        description: 'Create the requested deliverable.',
        agentRole: 'writer',
        systemPrompt: 'Create the deliverable.',
        dependsOnTaskIds: [],
        expectedArtifacts: ['deliverable.md'],
        status: 'pending' as const,
        artifacts: [],
      }],
    }
    const initialPlan: Plan = {
      summary: 'Create and verify a deliverable',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      phases: [originalPhase],
    }
    const amendment = {
      id: 'phase-1-amendment-1',
      title: 'Verify the deliverable',
      description: 'Check the deliverable against the stated requirements and report any gaps.',
      agentRole: 'reviewer',
      systemPrompt: 'Verify the deliverable against the mission requirements.',
      dependsOnTaskIds: ['task-1'],
      expectedArtifacts: ['verification.md'],
      status: 'pending' as const,
      artifacts: [],
    }
    const amendedPhase = { ...originalPhase, tasks: [...originalPhase.tasks, amendment] }
    const amendedPlan: Plan = { ...initialPlan, phases: [amendedPhase] }
    mockActivities.prepareMissionActivity.mockResolvedValue(initialPlan)
    mockActivities.executeMissionTaskActivity.mockImplementation(async ({ task }) => ({
      output: `Completed ${task.id}`,
      artifacts: [],
      tokensUsed: 1,
    }))
    mockActivities.reviewAndAmendMissionPhaseActivity
      .mockResolvedValueOnce({
        plan: amendedPlan,
        phase: amendedPhase,
        satisfied: false,
        gaps: ['The deliverable has not been independently checked.'],
        amendment,
      })
      .mockResolvedValueOnce({
        plan: amendedPlan,
        phase: amendedPhase,
        satisfied: true,
        gaps: [],
      })
    mockActivities.awaitMissionPhaseApprovalActivity.mockResolvedValue({ approved: true })
    mockActivities.completeMissionActivity.mockResolvedValue({
      plan: amendedPlan,
      outputs: { phases: [], status: 'completed' },
      compensations: [],
    })

    const result = await missionWorkflow(input)

    expect(result.status).toBe('completed')
    expect(mockActivities.executeMissionTaskActivity.mock.calls.map(([call]) => call.task.id))
      .toEqual(['task-1', 'phase-1-amendment-1'])
    expect(mockActivities.reviewAndAmendMissionPhaseActivity).toHaveBeenCalledTimes(2)
    expect(mockActivities.finishMissionPhaseActivity).toHaveBeenCalledWith(expect.objectContaining({
      phase: amendedPhase,
      tasks: expect.arrayContaining([
        expect.objectContaining({ taskId: 'task-1' }),
        expect.objectContaining({ taskId: 'phase-1-amendment-1' }),
      ]),
    }))
    expect(mockActivities.awaitMissionPhaseApprovalActivity).toHaveBeenCalledTimes(1)
    expect(mockActivities.completeMissionActivity).toHaveBeenCalledWith(expect.objectContaining({ plan: amendedPlan }))
  })

  it('returns an explicit failed result when a task activity fails', async () => {
    const plan: Plan = {
      summary: 'Do the work',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      phases: [{
        id: 'phase-1',
        name: 'Execution',
        goal: 'Do the work',
        requiresApproval: false,
        status: 'pending',
        tasks: [{
          id: 'task-1',
          title: 'Do the work',
          description: 'Complete the work.',
          agentRole: 'worker',
          systemPrompt: 'Be thorough.',
          expectedArtifacts: [],
          status: 'pending',
          artifacts: [],
        }],
      }],
    }
    mockActivities.prepareMissionActivity.mockResolvedValue(plan)
    mockActivities.executeMissionTaskActivity.mockRejectedValue(new Error('interrupted task has no receipt'))

    const result = await missionWorkflow({
      missionId: 'mission-1',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Complete the mission',
    })

    expect(result.status).toBe('failed')
    expect(result.error).toContain('interrupted task has no receipt')
  })
})
