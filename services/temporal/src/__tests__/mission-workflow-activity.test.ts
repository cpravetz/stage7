const mockActivities = {
  runMissionActivity: jest.fn(),
  prepareMissionActivity: jest.fn(),
  startMissionPhaseActivity: jest.fn(),
  executeMissionTaskActivity: jest.fn(),
  finishMissionPhaseActivity: jest.fn(),
  awaitMissionPhaseApprovalActivity: jest.fn(),
  recordMissionPhaseApprovalActivity: jest.fn(),
  completeMissionActivity: jest.fn(),
}

jest.mock('@temporalio/workflow', () => ({
  proxyActivities: jest.fn(() => mockActivities),
}))

import { proxyActivities } from '@temporalio/workflow'
import { missionWorkflow } from '../workflows/missionWorkflow'
import { WorkflowInput } from '../types/workflow'
import { Plan } from '@stage7-nextgen/shared'

describe('missionWorkflow activity boundary', () => {
  beforeEach(() => {
    Object.values(mockActivities).forEach((activity) => activity.mockReset())
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
