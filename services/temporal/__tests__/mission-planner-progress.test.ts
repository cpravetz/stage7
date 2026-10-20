import {
  Plan,
} from '@stage7-nextgen/shared'
import {
  generateValidPlan,
  PlannerCompletionRequest,
  PlannerProgress,
} from '../src/planner/MissionPlanner'
import { MissionContext, MissionOrchestrator } from '../src/planner/MissionOrchestrator'
import { MissionAgentRuntime } from '../src/agent/MissionAgentRuntime'
import { TemporalClient } from '../src/client/TemporalClient'

function validPlan(): Plan {
  return {
    summary: 'A goal-specific execution plan',
    estimatedDuration: 'One week',
    estimatedCost: 'Low',
    requiresClarification: false,
    clarificationQuestions: [],
    phases: [{
      id: 'phase-1',
      name: 'Deliverable 1',
      goal: 'Produce deliverable 1',
      requiresApproval: false,
      status: 'pending',
      tasks: [{
        id: 'phase-1-task-1',
        title: 'Complete deliverable 1',
        description: 'Produce deliverable 1 for the stated goal',
        agentRole: 'analyst',
        systemPrompt: 'Complete this task for the stated goal.',
        dependsOnTaskIds: [],
        expectedArtifacts: ['deliverable-1.md'],
        requiredActions: [],
        status: 'pending',
        artifacts: [],
      }],
    }],
  }
}

describe('planner progress reporting', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })
  it('shares a retry update when a Brain request fails transiently', async () => {
    const progress: PlannerProgress[] = []
    let attempt = 0
    const complete = async (_request: PlannerCompletionRequest): Promise<string> => {
      attempt += 1
      if (attempt === 1) {
        throw new Error('Brain request failed (504): completion deadline expired')
      }
      return JSON.stringify(validPlan())
    }

    const plan = await generateValidPlan(
      'Create a business plan',
      {},
      'mission-progress',
      complete,
      undefined,
      async (update) => { progress.push(update) },
    )

    expect(plan.summary).toBe('A goal-specific execution plan')
    expect(progress).toHaveLength(1)
    expect(progress[0]).toMatchObject({ attempt: 1, status: 'retrying', transient: true })
    expect(progress[0]?.reason).toContain('completion deadline')
  })

  it('shares a rejection update when the plan does not pass validation', async () => {
    const progress: PlannerProgress[] = []
    let attempt = 0
    const complete = async (_request: PlannerCompletionRequest): Promise<string> => {
      attempt += 1
      if (attempt === 1) return '{"summary":"incomplete"}'
      return JSON.stringify(validPlan())
    }

    await generateValidPlan(
      'Create a business plan',
      {},
      'mission-progress',
      complete,
      undefined,
      async (update) => { progress.push(update) },
    )

    expect(progress).toHaveLength(1)
    expect(progress[0]).toMatchObject({ attempt: 1, status: 'rejected', transient: false })
    expect(progress[0]?.reason).toContain('estimatedDuration')
  })

  it('reports a repeated planner update once', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '',
      json: async () => ({}),
    } as Response)
    const broadcast = jest.fn().mockResolvedValue(undefined)
    jest.spyOn(MissionAgentRuntime.prototype, 'generatePlan').mockImplementation(
      async (_prompt, _context, onProgress) => {
        for (const attempt of [1, 2, 3]) {
          await onProgress?.({
            attempt,
            status: 'retrying',
            reason: `Agent Runtime API /missions/mission-1/agents/agent-planner/tasks/mission-1:planner:attempt-${attempt}/execute failed (500): Brain request failed (504): fetch failed`,
            transient: true,
          })
        }
        return { ...validPlan(), requiresClarification: true, clarificationQuestions: ['Which market?'] }
      },
    )

    const context: MissionContext = {
      missionId: 'mission-progress',
      prompt: 'Create a business plan',
      tenantId: 'tenant-1',
      persistenceUrl: 'http://artifacts',
      gatewayUrl: 'http://gateway',
      broadcast,
      broadcastAll: jest.fn().mockResolvedValue(undefined),
      waitForApproval: jest.fn(),
    }

    await new MissionOrchestrator().run(context)

    const progressEvents = broadcast.mock.calls
      .map((call) => call[0] as { type: string })
      .filter((event) => event.type === 'planner_progress')
    expect(progressEvents).toHaveLength(1)
  })

  it('broadcasts the planner progress to the mission feed', async () => {    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '',
      json: async () => ({}),
    } as Response)
    const broadcast = jest.fn().mockResolvedValue(undefined)
    jest.spyOn(MissionAgentRuntime.prototype, 'generatePlan').mockImplementation(
      async (_prompt, _context, onProgress) => {
        await onProgress?.({
          attempt: 4,
          status: 'retrying',
          reason: 'Brain request failed (504): completion deadline expired',
          transient: true,
        })
        return { ...validPlan(), requiresClarification: true, clarificationQuestions: ['Which market?'] }
      },
    )

    const context: MissionContext = {
      missionId: 'mission-progress',
      prompt: 'Create a business plan',
      tenantId: 'tenant-1',
      persistenceUrl: 'http://artifacts',
      gatewayUrl: 'http://gateway',
      broadcast,
      broadcastAll: jest.fn().mockResolvedValue(undefined),
      waitForApproval: jest.fn(),
    }

    await new MissionOrchestrator().run(context)

    const progressEvents = broadcast.mock.calls
      .map((call) => call[0] as { type: string; data?: Record<string, unknown> })
      .filter((event) => event.type === 'planner_progress')
    expect(progressEvents).toHaveLength(1)
    expect(progressEvents[0]?.data).toMatchObject({ attempt: 4, status: 'retrying', transient: true })
  })
})

describe('mission lifecycle event persistence', () => {
  const originalArtifactsUrl = process.env.ARTIFACTS_URL
  const originalGatewayUrl = process.env.GATEWAY_URL

  beforeEach(() => {
    jest.restoreAllMocks()
  })

  afterEach(() => {
    jest.restoreAllMocks()
    if (originalArtifactsUrl === undefined) delete process.env.ARTIFACTS_URL
    else process.env.ARTIFACTS_URL = originalArtifactsUrl
    if (originalGatewayUrl === undefined) delete process.env.GATEWAY_URL
    else process.env.GATEWAY_URL = originalGatewayUrl
  })

  it('persists the failure reason with the mission event', async () => {
    process.env.ARTIFACTS_URL = 'http://artifacts'
    delete process.env.GATEWAY_URL
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      statusText: 'Created',
      text: async () => '',
      json: async () => ({}),
    } as Response)

    await new TemporalClient().broadcastMissionUpdate({
      type: 'mission_failed',
      missionId: 'mission-failed',
      workflowId: 'mission-mission-failed',
      status: 'failed',
      error: 'Planner Agent request failed on attempt 88',
      timestamp: 1_700_000_000_000,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.type).toBe('mission_failed')
    expect(body.error).toBe('Planner Agent request failed on attempt 88')
    expect(body.status).toBe('failed')
  })

  it('does not repeat the mission output inside the persisted event', async () => {
    process.env.ARTIFACTS_URL = 'http://artifacts'
    delete process.env.GATEWAY_URL
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      statusText: 'Created',
      text: async () => '',
      json: async () => ({}),
    } as Response)

    await new TemporalClient().broadcastMissionUpdate({
      type: 'mission_completed',
      missionId: 'mission-completed',
      status: 'completed',
      output: { phases: [] },
      timestamp: 1_700_000_000_000,
    })

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.output).toBeUndefined()
    expect(body.status).toBe('completed')
  })
})
