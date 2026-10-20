import { Context } from '@temporalio/activity'
import { Plan } from '@stage7-nextgen/shared'
import { runMissionActivity, runMissionDirect } from '../src/activities/missionActivity'
import { MissionOrchestrator } from '../src/planner/MissionOrchestrator'
import { WorkflowInput } from '../src/types/workflow'

describe('runMissionActivity checkpoints', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('restores and heartbeats a validated plan checkpoint', async () => {
    const plan: Plan = {
      summary: 'Clarify the requested outcome',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: true,
      clarificationQuestions: ['Which environment should be targeted?'],
      phases: [],
    }
    const heartbeat = jest.fn()
    const activityContext = Object.assign(Object.create(Context.prototype), {
      info: { heartbeatDetails: { version: 1, plan } },
      heartbeat,
    })
    jest.spyOn(Context, 'current').mockReturnValue(activityContext)
    const run = jest.spyOn(MissionOrchestrator.prototype, 'run').mockResolvedValue({
      plan,
      outputs: { status: 'awaiting_clarification' },
      compensations: [],
    })
    const input: WorkflowInput = {
      missionId: 'mission-recovery',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Deploy the application',
    }

    const result = await runMissionActivity(input)

    expect(result.outputs.status).toBe('awaiting_clarification')
    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      missionId: input.missionId,
      resumeCheckpoint: expect.objectContaining({ plan, completedTasks: [], completedPhases: [] }),
      onCheckpoint: expect.any(Function),
      heartbeat: expect.any(Function),
    }))
    expect(heartbeat).toHaveBeenCalledWith({
      version: 1,
      plan,
      completedTasks: [],
      completedPhases: [],
    })
  })

  it('rejects unsupported checkpoint versions instead of silently restarting from scratch', async () => {
    const activityContext = Object.assign(Object.create(Context.prototype), {
      info: { heartbeatDetails: { version: 99 } },
      heartbeat: jest.fn(),
    })
    jest.spyOn(Context, 'current').mockReturnValue(activityContext)
    const run = jest.spyOn(MissionOrchestrator.prototype, 'run')
    const input: WorkflowInput = {
      missionId: 'mission-recovery',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Deploy the application',
    }

    await expect(runMissionActivity(input)).rejects.toThrow('unsupported heartbeat checkpoint')
    expect(run).not.toHaveBeenCalled()
  })

  it('uses the Artifacts service default and does not silently approve on timeout', async () => {
    const originalArtifactsUrl = process.env.ARTIFACTS_URL
    const originalApprovalTimeout = process.env.APPROVAL_TIMEOUT_MS
    const originalApprovalPollInterval = process.env.APPROVAL_POLL_INTERVAL_MS
    delete process.env.ARTIFACTS_URL
    process.env.APPROVAL_TIMEOUT_MS = '1'
    process.env.APPROVAL_POLL_INTERVAL_MS = '1'
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Artifacts unavailable',
    } as Response)
    const activityContext = Object.assign(Object.create(Context.prototype), {
      info: { heartbeatDetails: undefined },
      heartbeat: jest.fn(),
    })
    jest.spyOn(Context, 'current').mockReturnValue(activityContext)
    const run = jest.spyOn(MissionOrchestrator.prototype, 'run').mockResolvedValue({
      plan: {
        summary: 'Await approval',
        estimatedDuration: 'short',
        estimatedCost: 'low',
        requiresClarification: false,
        clarificationQuestions: [],
        phases: [],
      },
      outputs: { status: 'awaiting_approval' },
      compensations: [],
    })

    try {
      await runMissionActivity({
        missionId: 'mission-approval',
        tenantId: 'tenant-1',
        assistantId: 'assistant-1',
        prompt: 'Run an approval-gated mission',
      })
      const missionContext = run.mock.calls[0]?.[0]
      await expect(missionContext?.waitForApproval('phase-1', 'Approve?')).resolves.toEqual({
        approved: false,
        reason: 'Approval timeout',
      })
      expect(fetchMock).toHaveBeenCalledWith(
        'http://artifacts:4200/api/artifacts/missions/mission-approval/phases/phase-1',
        expect.any(Object),
      )
    } finally {
      if (originalArtifactsUrl === undefined) delete process.env.ARTIFACTS_URL
      else process.env.ARTIFACTS_URL = originalArtifactsUrl
      if (originalApprovalTimeout === undefined) delete process.env.APPROVAL_TIMEOUT_MS
      else process.env.APPROVAL_TIMEOUT_MS = originalApprovalTimeout
      if (originalApprovalPollInterval === undefined) delete process.env.APPROVAL_POLL_INTERVAL_MS
      else process.env.APPROVAL_POLL_INTERVAL_MS = originalApprovalPollInterval
    }
  })

  it('rejects a completed phase checkpoint that omits a task receipt', async () => {
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
    const activityContext = Object.assign(Object.create(Context.prototype), {
      info: { heartbeatDetails: { version: 1, plan, completedTasks: [], completedPhases: ['phase-1'] } },
      heartbeat: jest.fn(),
    })
    jest.spyOn(Context, 'current').mockReturnValue(activityContext)
    const run = jest.spyOn(MissionOrchestrator.prototype, 'run')

    await expect(runMissionActivity({
      missionId: 'mission-recovery',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Write an answer',
    })).rejects.toThrow('marks incomplete phase phase-1 complete')
    expect(run).not.toHaveBeenCalled()
  })

  it('keeps the in-process fallback outside Temporal activity context', async () => {
    const plan: Plan = {
      summary: 'Clarify the requested outcome',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: true,
      clarificationQuestions: ['Which environment should be targeted?'],
      phases: [],
    }
    const run = jest.spyOn(MissionOrchestrator.prototype, 'run').mockResolvedValue({
      plan,
      outputs: { status: 'awaiting_clarification' },
      compensations: [],
    })
    const input: WorkflowInput = {
      missionId: 'mission-local',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Deploy the application',
    }

    await expect(runMissionDirect(input)).resolves.toEqual({
      plan,
      outputs: { status: 'awaiting_clarification' },
      compensations: [],
    })
    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      missionId: input.missionId,
    }))
    expect(run.mock.calls[0]?.[0].resumePlan).toBeUndefined()
  })
})
