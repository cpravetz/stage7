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
  rollupEntityMemoryActivity: jest.fn(),
  notifyMissionCompletedActivity: jest.fn(),
}

jest.mock('@temporalio/workflow', () => ({
  proxyActivities: jest.fn(() => mockActivities),
  patched: jest.fn(() => true),
}))

jest.mock('@temporalio/activity', () => ({
  Context: {
    current: () => ({ info: { attempt: 2 }, heartbeat: jest.fn() }),
  },
}))

import { patched, proxyActivities } from '@temporalio/workflow'
import { missionWorkflow } from '../src/workflows/missionWorkflow'
import { WorkflowInput } from '../src/types/workflow'
import { Plan } from '@stage7-nextgen/shared'
import {
  completeMissionActivity,
  executeMissionTaskActivity,
  prepareMissionActivity,
} from '../src/activities/missionWorkflowActivities'
import { MissionAgentRuntime } from '../src/agent/MissionAgentRuntime'

function jsonResponse(): Response {
  return new Response('{}', { status: 200 })
}

describe('missionWorkflow activity boundary', () => {
  beforeEach(() => {
    Object.values(mockActivities).forEach((activity) => activity.mockReset());
    (patched as jest.Mock).mockReturnValue(false)
  })

  it('generates a fresh plan when a retry has no persisted plan', async () => {
    const plan: Plan = {
      summary: 'Complete the requested operation',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      clarificationAnswers: [],
      phases: [{
        id: 'phase-1',
        name: 'Execution',
        goal: 'Complete the requested operation',
        requiresApproval: false,
        status: 'pending',
        tasks: [{
          id: 'phase-1-task-1',
          title: 'Complete the requested operation',
          description: 'Perform the requested action.',
          agentRole: 'worker',
          systemPrompt: 'Perform the requested action.',
          dependsOnTaskIds: [],
          expectedArtifacts: [],
          requiredActions: [],
          status: 'pending',
          artifacts: [],
        }],
      }],
    }
    const input: WorkflowInput = {
      missionId: 'retry-without-plan',
      tenantId: 'tenant-1',
      assistantId: '',
      prompt: 'Perform the requested action.',
      metadata: { retryCount: 1, retriedFrom: 'mission-retry-without-plan' },
    }
    const originalArtifactsUrl = process.env.ARTIFACTS_URL
    process.env.ARTIFACTS_URL = 'http://artifacts:4200'
    const generatePlan = jest.spyOn(MissionAgentRuntime.prototype, 'generatePlan').mockResolvedValue(plan)
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (request, init) => {
      const url = String(request)
      if (url.endsWith('/plan') && (init?.method || 'GET') === 'GET') {
        return new Response('Plan not found', { status: 404 })
      }
      return new Response('{}', { status: 200 })
    })

    try {
      await expect(prepareMissionActivity(input)).resolves.toEqual(plan)
      expect(generatePlan).toHaveBeenCalledWith(
        input.prompt,
        input.metadata,
        expect.any(Function),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        'http://artifacts:4200/api/artifacts/missions/retry-without-plan/plan',
        expect.objectContaining({ method: 'PUT' }),
      )
    } finally {
      fetchMock.mockRestore()
      generatePlan.mockRestore()
      if (originalArtifactsUrl === undefined) delete process.env.ARTIFACTS_URL
      else process.env.ARTIFACTS_URL = originalArtifactsUrl
    }
  })

  it('requires successful planned tasks and a positive mission-goal review before completion', async () => {
    const plan: Plan = {
      summary: 'Create a verified deliverable',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      clarificationAnswers: [],
      phases: [{
        id: 'phase-1',
        name: 'Execution',
        goal: 'Create the deliverable',
        requiresApproval: false,
        status: 'completed',
        tasks: [{
          id: 'task-1',
          title: 'Create the deliverable',
          description: 'Create it and verify it.',
          agentRole: 'worker',
          systemPrompt: 'Be thorough.',
          expectedArtifacts: [],
          status: 'completed',
          artifacts: [],
        }],
      }],
    }
    const reviewMissionCompletion = jest.spyOn(MissionAgentRuntime.prototype, 'reviewMissionCompletion')
      .mockResolvedValue({ satisfied: false, gaps: ['The goal is not verified.'] })
    const input: WorkflowInput = {
      missionId: 'mission-completion-review',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Create a verified deliverable',
    }

    const reviewed = await completeMissionActivity({
      input,
      plan,
      phases: [{
        phaseId: 'phase-1',
        name: 'Execution',
        status: 'completed',
        tasks: [{ taskId: 'task-1', status: 'completed', artifacts: [], output: 'Created it.' }],
      }],
      compensations: [],
    })
    expect(reviewed.outputs).toMatchObject({
      status: 'incomplete',
      gaps: ['The goal is not verified.'],
    })

    const failedTask = await completeMissionActivity({
      input,
      plan,
      phases: [{
        phaseId: 'phase-1',
        name: 'Execution',
        status: 'completed',
        tasks: [{ taskId: 'task-1', status: 'failed', artifacts: [], output: 'Task failed.' }],
      }],
      compensations: [],
    })
    expect(failedTask.outputs.status).toBe('incomplete')
    expect(reviewMissionCompletion).toHaveBeenCalledTimes(1)
  })

  it('accepts a verified replacement capability for a required action after a missing dependency', async () => {
    const plan: Plan = {
      summary: 'Export a document',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      clarificationAnswers: [],
      phases: [{
        id: 'phase-1',
        name: 'Document export',
        goal: 'Export the requested document',
        requiresApproval: false,
        status: 'completed',
        tasks: [{
          id: 'export-document',
          title: 'Export the document',
          description: 'Export the requested document using an available capability.',
          agentRole: 'worker',
          systemPrompt: 'Complete and verify the document export.',
          expectedArtifacts: [],
          requiredActions: [{ toolId: 'legacy-document-exporter', outcome: 'success' }],
          status: 'completed',
          artifacts: [],
        }],
      }],
    }
    const reviewMissionCompletion = jest.spyOn(MissionAgentRuntime.prototype, 'reviewMissionCompletion')
      .mockResolvedValue({ satisfied: false, gaps: ['The goal is not verified.'] })

    const result = await completeMissionActivity({
      input: {
        missionId: 'mission-tool-fallback',
        tenantId: 'tenant-1',
        assistantId: 'assistant-1',
        prompt: 'Export the requested document',
      },
      plan,
      phases: [{
        phaseId: 'phase-1',
        name: 'Document export',
        status: 'completed',
        tasks: [{
          taskId: 'export-document',
          status: 'completed',
          output: 'The exporter confirmed the document was created.',
          artifacts: [{
            name: 'system-action-receipts.json',
            content: JSON.stringify([
              {
                toolId: 'legacy-document-exporter',
                outcome: 'failure',
                content: "Cannot find module 'legacy-export-sdk'",
              },
              {
                toolId: '__create_tool',
                outcome: 'success',
                fallbackForToolId: 'legacy-document-exporter',
                resolvedToolId: 'document-exporter',
              },
              {
                toolId: 'document-exporter',
                outcome: 'success',
                fallbackForToolId: 'legacy-document-exporter',
                content: 'The exporter confirmed the document was created.',
              },
            ]),
            purpose: 'execution-outcome',
          }],
        }],
      }],
      compensations: [],
    })

    expect(result.outputs.gaps).toEqual(['The goal is not verified.'])
    expect((result.outputs.gaps || []).some((gap) => gap.includes('did not satisfy required action'))).toBe(false)
  })

  it('reports the exact missing task artifact and failed action instead of asking the reviewer', async () => {
    const plan: Plan = {
      summary: 'Send a text message',
      estimatedDuration: 'minutes',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      clarificationAnswers: [],
      phases: [{
        id: 'phase-1',
        name: 'Message delivery',
        goal: 'Send the requested text message',
        requiresApproval: false,
        status: 'completed',
        tasks: [{
          id: 'phase-1-task-1',
          title: 'Send the text message',
          description: 'Send the exact requested message.',
          agentRole: 'messenger',
          systemPrompt: 'Send the requested message.',
          expectedArtifacts: ['text-message.txt'],
          requiredActions: [{ toolId: 'textMessageSentConfirmation', outcome: 'success' }],
          status: 'completed',
          artifacts: [],
        }],
      }],
    }
    const reviewMissionCompletion = jest.spyOn(MissionAgentRuntime.prototype, 'reviewMissionCompletion')
      .mockResolvedValue({ satisfied: false, gaps: ['concrete unmet requirement'] })
    reviewMissionCompletion.mockClear()

    const result = await completeMissionActivity({
      input: {
        missionId: 'mission-concrete-gaps',
        tenantId: 'tenant-1',
        assistantId: 'assistant-1',
        prompt: 'Send a text message',
      },
      plan,
      phases: [{
        phaseId: 'phase-1',
        name: 'Message delivery',
        status: 'completed',
        tasks: [{
          taskId: 'phase-1-task-1',
          status: 'completed',
          output: '**Blocker:** Cannot find module twilio.',
          artifacts: [
            {
              name: 'system-action-receipts.json',
              content: JSON.stringify([{
                toolId: 'text-service-twilio-sms',
                outcome: 'failure',
                content: 'Cannot find module twilio',
              }]),
              purpose: 'execution-outcome',
            },
            {
              name: 'text-message.txt',
              content: '**Blocker:** Cannot find module twilio.',
              purpose: 'execution-outcome',
              status: 'blocked',
            },
          ],
        }],
      }],
      compensations: [],
    })

    expect(result.outputs.status).toBe('incomplete')
    expect(result.outputs.gaps).toEqual(expect.arrayContaining([
      expect.stringContaining('Task "Send the text message" (phase-1-task-1) did not satisfy required action "textMessageSentConfirmation"'),
      expect.stringContaining('Cannot find module twilio'),
      expect.stringContaining('is missing expected artifact "text-message.txt"'),
    ]))
    expect(result.outputs.gaps).not.toContain('concrete unmet requirement')
    expect(reviewMissionCompletion).not.toHaveBeenCalled()
  })

  it('resumes failed task activities from safe checkpoints instead of requiring a completed receipt', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse())
    const task = {
      id: 'task-retry',
      title: 'Retry the work',
      description: 'Finish the requested work.',
      agentRole: 'worker',
      systemPrompt: 'Be thorough.',
      expectedArtifacts: [],
      status: 'in_progress' as const,
      artifacts: [],
    }
    const phase = {
      id: 'phase-retry',
      name: 'Execution',
      goal: 'Finish the requested work',
      requiresApproval: false,
      status: 'in_progress' as const,
      tasks: [task],
    }
    const plan: Plan = {
      summary: 'Finish the requested work',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      clarificationAnswers: [],
      phases: [phase],
    }
    const executeTask = jest.spyOn(MissionAgentRuntime.prototype, 'executeTask')
      .mockResolvedValue({ output: 'Finished safely.', artifacts: [], tokensUsed: 1 })
    jest.spyOn(MissionAgentRuntime.prototype, 'getOrCreateAgent').mockResolvedValue('agent-worker')

    await executeMissionTaskActivity({
      input: {
        missionId: 'mission-task-retry',
        tenantId: 'tenant-1',
        assistantId: 'assistant-1',
        prompt: 'Finish the requested work',
      },
      plan,
      phase,
      task,
    })

    expect(executeTask).toHaveBeenCalledWith(
      'agent-worker',
      task,
      phase,
      plan,
      true,
      expect.any(Object),
      [],
      expect.stringContaining('persisted safe checkpoint and action receipts'),
    )
    expect(fetchMock).toHaveBeenCalled()
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
      clarificationAnswers: [],
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
      completedTaskSummaries: [],
    })
    expect(mockActivities.startMissionPhaseActivity).toHaveBeenCalledTimes(1)
    expect(mockActivities.finishMissionPhaseActivity).toHaveBeenCalledWith({
      input,
      phase: plan.phases[0],
      tasks: [{ taskId: 'task-1', status: 'completed', artifacts, output: 'Done' }],
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
      clarificationAnswers: [],
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
      clarificationAnswers: [],
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
      clarificationAnswers: [],
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
      clarificationAnswers: [],
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
      clarificationAnswers: [],
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
    mockActivities.reviewAndAmendMissionPhaseActivity.mockResolvedValue({ plan, phase: plan.phases[0], satisfied: true, gaps: [] })
    mockActivities.finishMissionPhaseActivity.mockResolvedValue({})
    mockActivities.completeMissionActivity.mockResolvedValue({ plan, outputs: { phases: [], status: 'completed' }, compensations: [] })

    const result = await missionWorkflow({
      missionId: 'mission-1',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Complete the mission',
    })

    expect(result.status).toBe('incomplete')
  })

  it('does not complete a phase when its completion review fails', async () => {
    (patched as jest.Mock).mockReturnValue(true)
    const phase = {
      id: 'phase-review-failed',
      name: 'Execution',
      goal: 'Complete and verify the work',
      requiresApproval: false,
      status: 'pending' as const,
      tasks: [{
        id: 'task-1',
        title: 'Do the work',
        description: 'Complete the work.',
        agentRole: 'worker',
        systemPrompt: 'Be thorough.',
        expectedArtifacts: [],
        status: 'pending' as const,
        artifacts: [],
      }],
    }
    const plan: Plan = {
      summary: 'Complete the requested work',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      clarificationAnswers: [],
      phases: [phase],
    }
    mockActivities.prepareMissionActivity.mockResolvedValue(plan)
    mockActivities.executeMissionTaskActivity.mockResolvedValue({ output: 'The work is done.', artifacts: [], tokensUsed: 1 })
    mockActivities.reviewAndAmendMissionPhaseActivity.mockRejectedValue(new Error('review unavailable'))
    mockActivities.completeMissionActivity.mockResolvedValue({
      plan,
      outputs: { phases: [], status: 'incomplete', gaps: ['The phase review did not complete.'] },
      compensations: [],
    })

    const result = await missionWorkflow({
      missionId: 'mission-review-failed',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Complete and verify the work',
    })

    expect(result.status).toBe('incomplete')
    expect(mockActivities.finishMissionPhaseActivity).toHaveBeenCalledWith(expect.objectContaining({
      phase: expect.objectContaining({ status: 'in_progress' }),
    }))
    expect(mockActivities.awaitMissionPhaseApprovalActivity).not.toHaveBeenCalled()
  })
})
