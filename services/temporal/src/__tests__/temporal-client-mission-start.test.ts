import { TemporalClient } from '../client/TemporalClient'
import * as missionActivity from '../activities/missionActivity'

describe('TemporalClient mission start', () => {
  const originalTemporalAddress = process.env.TEMPORAL_ADDRESS
  const originalTemporalBackend = process.env.TEMPORAL_BACKEND
  const originalArtifactsUrl = process.env.ARTIFACTS_URL
  const originalGatewayUrl = process.env.GATEWAY_URL

  afterEach(() => {
    jest.restoreAllMocks()
    if (originalTemporalAddress === undefined) delete process.env.TEMPORAL_ADDRESS
    else process.env.TEMPORAL_ADDRESS = originalTemporalAddress
    if (originalTemporalBackend === undefined) delete process.env.TEMPORAL_BACKEND
    else process.env.TEMPORAL_BACKEND = originalTemporalBackend
    if (originalArtifactsUrl === undefined) delete process.env.ARTIFACTS_URL
    else process.env.ARTIFACTS_URL = originalArtifactsUrl
    if (originalGatewayUrl === undefined) delete process.env.GATEWAY_URL
    else process.env.GATEWAY_URL = originalGatewayUrl
  })

  it('uses the built-in runner by default even if TEMPORAL_ADDRESS points at an HTTP service', () => {
    delete process.env.TEMPORAL_BACKEND
    process.env.TEMPORAL_ADDRESS = 'temporal:4100'
    expect(new TemporalClient().isConnected()).toBe(false)
  })

  it('requires an explicit backend choice before connecting to a Temporal Server', () => {
    process.env.TEMPORAL_BACKEND = 'temporal-server'
    delete process.env.TEMPORAL_ADDRESS
    expect(() => new TemporalClient()).toThrow('TEMPORAL_BACKEND=temporal-server requires TEMPORAL_ADDRESS')
  })

  it('does not start a direct duplicate after an ambiguous Temporal start failure', async () => {
    delete process.env.TEMPORAL_ADDRESS
    delete process.env.ARTIFACTS_URL
    delete process.env.GATEWAY_URL
    const client = new TemporalClient()
    const start = jest.fn().mockRejectedValue(new Error('connection lost during start'))
    Object.defineProperty(client, 'client', {
      configurable: true,
      value: { workflow: { start } },
    })
    jest.spyOn(missionActivity, 'runMissionDirect').mockResolvedValue({})
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '',
      json: async () => ({}),
    } as Response)

    await expect(client.startMission({
      missionId: 'mission-ambiguous',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Do the work',
    })).rejects.toThrow('connection lost during start')

    expect(start).toHaveBeenCalledTimes(1)
    expect(missionActivity.runMissionDirect).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('recovers a running mission from its persisted plan and completed task statuses', async () => {
    delete process.env.TEMPORAL_ADDRESS
    process.env.ARTIFACTS_URL = 'http://artifacts'
    delete process.env.GATEWAY_URL
    const directRun = jest.fn(async () => ({}))
    const client = new TemporalClient('default', directRun)
    const input = {
      missionId: 'mission-recovery',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Finish the mission',
    }
    const plan = {
      summary: 'Complete the mission',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      phases: [{
        id: 'phase-1',
        name: 'Execution',
        goal: 'Complete saved work',
        requiresApproval: false,
        status: 'completed',
        tasks: [{
          id: 'task-1',
          title: 'Saved task',
          description: 'Already completed before restart.',
          agentRole: 'worker',
          systemPrompt: 'Complete the task.',
          expectedArtifacts: [],
          status: 'completed',
          artifacts: [],
        }],
      }],
    }
    jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const requestUrl = String(url)
      if (requestUrl.endsWith('/api/artifacts/missions') && !init?.method) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ missions: [{ missionId: input.missionId, status: 'running', input }] }),
        } as Response
      }
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}/plan`)) {
        return { ok: true, status: 200, json: async () => plan } as Response
      }
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}/recovery-lease`)) {
        const action = JSON.parse(String(init?.body)).action
        return {
          ok: true,
          status: 200,
          json: async () => action === 'claim' ? { claimed: true } : { released: true },
        } as Response
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })

    await expect(client.recoverInFlightMissions()).resolves.toBe(1)

    expect(directRun).toHaveBeenCalledWith(input, {
      version: 1,
      plan,
      completedTasks: [{ phaseId: 'phase-1', taskId: 'task-1' }],
      completedPhases: ['phase-1'],
    }, expect.any(Function))
  })

  it('allows only one Temporal client to recover the same running mission', async () => {
    delete process.env.TEMPORAL_ADDRESS
    process.env.ARTIFACTS_URL = 'http://artifacts'
    delete process.env.GATEWAY_URL
    const directRun = jest.fn(async () => ({}))
    const clients = [
      new TemporalClient('default', directRun),
      new TemporalClient('default', directRun),
    ]
    const input = {
      missionId: 'mission-recovery-race',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Recover once',
    }
    let leaseOwner: string | undefined
    jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const requestUrl = String(url)
      if (requestUrl.endsWith('/api/artifacts/missions') && !init?.method) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ missions: [{ missionId: input.missionId, status: 'running', input }] }),
        } as Response
      }
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}/plan`)) {
        return { ok: true, status: 404, json: async () => ({}) } as Response
      }
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}/recovery-lease`)) {
        const body = JSON.parse(String(init?.body)) as { action: string; ownerId: string }
        if (body.action === 'claim') {
          if (!leaseOwner) leaseOwner = body.ownerId
          return {
            ok: true,
            status: 200,
            json: async () => ({ claimed: leaseOwner === body.ownerId }),
          } as Response
        }
        if (body.action === 'release') {
          if (leaseOwner === body.ownerId) leaseOwner = undefined
          return { ok: true, status: 200, json: async () => ({ released: true }) } as Response
        }
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })

    await Promise.all(clients.map((client) => client.recoverInFlightMissions()))
    await new Promise((resolve) => setImmediate(resolve))

    expect(directRun).toHaveBeenCalledTimes(1)
  })

  it('resumes a paused mission only after claiming its recovery lease', async () => {
    delete process.env.TEMPORAL_ADDRESS
    process.env.ARTIFACTS_URL = 'http://artifacts'
    delete process.env.GATEWAY_URL
    const client = new TemporalClient()
    const input = {
      missionId: 'mission-paused',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Continue the mission',
    }
    const plan = {
      summary: 'Continue work',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      phases: [],
    }
    jest.spyOn(client, 'startMission').mockResolvedValue(`mission-${input.missionId}`)
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const requestUrl = String(url)
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}`) && !init?.method) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            missionId: input.missionId,
            status: 'paused',
            controlState: 'paused',
            input,
          }),
        } as Response
      }
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}/plan`)) {
        return { ok: true, status: 200, json: async () => plan } as Response
      }
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}/recovery-lease`)) {
        expect(JSON.parse(String(init?.body))).toEqual(expect.objectContaining({ action: 'claim' }))
        return { ok: true, status: 200, json: async () => ({ claimed: true }) } as Response
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })

    await expect(client.resumeMission(`mission-${input.missionId}`)).resolves.toBe('resuming')

    expect(client.startMission).toHaveBeenCalledWith(
      input,
      expect.objectContaining({ plan, completedTasks: [], completedPhases: [] }),
      true,
      true,
    )
    expect(fetchMock).toHaveBeenCalledWith(
      `http://artifacts/api/artifacts/missions/${input.missionId}`,
      expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('"controlState":"running"'),
      }),
    )
  })

  it('loads the persisted plan when retrying before any phase or task completed', async () => {
    delete process.env.TEMPORAL_ADDRESS
    process.env.ARTIFACTS_URL = 'http://artifacts'
    delete process.env.GATEWAY_URL
    const directRun = jest.fn(async () => ({}))
    const client = new TemporalClient('default', directRun)
    const input = {
      missionId: 'mission-retry-no-progress',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Continue the mission',
      retryGuidance: 'Use the existing receipts.',
      metadata: { retriedFrom: 'mission-retry-no-progress' },
      completedPhases: [],
      completedTasks: [],
      resumeFromPhaseId: 'phase-1',
      resumeFromTaskId: 'task-1',
    }
    const plan = {
      summary: 'Continue saved work',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      phases: [],
    }
    jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const requestUrl = String(url)
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}/plan`)) {
        return { ok: true, status: 200, json: async () => plan } as Response
      }
      if (requestUrl.endsWith('/recovery-lease')) {
        return { ok: true, status: 200, json: async () => ({ claimed: true }) } as Response
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })

    await expect(client.startMission(input)).resolves.toBe(`mission-${input.missionId}`)

    expect(directRun).toHaveBeenCalledWith(
      input,
      expect.objectContaining({ plan, completedTasks: [], completedPhases: [] }),
      expect.any(Function),
    )
  })

  it('recovers stale pause and termination requests without replaying uncertain task side effects', async () => {
    delete process.env.TEMPORAL_ADDRESS
    process.env.ARTIFACTS_URL = 'http://artifacts'
    delete process.env.GATEWAY_URL
    const client = new TemporalClient()
    const missions = [
      { missionId: 'mission-pause-recovery', controlState: 'pause_requested', status: 'paused' },
      { missionId: 'mission-terminate-recovery', controlState: 'terminate_requested', status: 'canceled' },
    ]
    const directRun = jest.spyOn(missionActivity, 'runMissionDirect')
    const updatedStates = new Map<string, unknown>()
    jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const requestUrl = String(url)
      if (requestUrl.endsWith('/api/artifacts/missions') && !init?.method) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            missions: missions.map(({ status: _status, ...mission }) => ({ ...mission, status: 'running' })),
          }),
        } as Response
      }
      if (requestUrl.endsWith('/recovery-lease')) {
        const body = JSON.parse(String(init?.body)) as { action: string }
        return {
          ok: true,
          status: 200,
          json: async () => body.action === 'claim' ? { claimed: true } : { released: true },
        } as Response
      }
      if (init?.method === 'PUT') {
        const missionId = requestUrl.split('/').pop()!
        updatedStates.set(missionId, JSON.parse(String(init.body)))
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })

    await expect(client.recoverInFlightMissions()).resolves.toBe(2)

    expect(directRun).not.toHaveBeenCalled()
    expect(updatedStates.get('mission-pause-recovery')).toEqual(expect.objectContaining({
      status: 'paused',
      controlState: 'paused',
    }))
    expect(updatedStates.get('mission-terminate-recovery')).toEqual(expect.objectContaining({
      status: 'canceled',
      controlState: 'terminated',
    }))
  })

  it('does not rerun a completed scheduled mission occurrence after a scheduler restart', async () => {
    delete process.env.TEMPORAL_ADDRESS
    process.env.ARTIFACTS_URL = 'http://artifacts'
    delete process.env.GATEWAY_URL
    const client = new TemporalClient()
    const input = {
      missionId: 'scheduled-occurrence-1',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Run the scheduled review',
      metadata: {
        scheduled: true,
        scheduleId: 'mission-schedule-weekly',
        scheduledFor: '2026-10-05T09:00:00.000Z',
      },
    }
    const directRun = jest.spyOn(missionActivity, 'runMissionDirect').mockResolvedValue({});
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        missionId: input.missionId,
        status: 'completed',
        input,
      }),
    } as Response)

    await expect(client.startMission(input)).resolves.toBe(`mission-${input.missionId}`)

    expect(directRun).not.toHaveBeenCalled()
  })
})
