import { TemporalClient } from '../src/client/TemporalClient'
import * as missionActivity from '../src/activities/missionActivity'

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

  it('starts recurring missions with Temporal cron metadata', async () => {
    delete process.env.TEMPORAL_ADDRESS
    delete process.env.ARTIFACTS_URL
    delete process.env.GATEWAY_URL
    const client = new TemporalClient()
    const start = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(client, 'client', {
      configurable: true,
      value: { workflow: { start } },
    })
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '',
      json: async () => ({}),
    } as Response)

    await client.startMission({
      missionId: 'weekly-review',
      tenantId: 'tenant-1',
      assistantId: 'legal',
      prompt: 'Review recent matters',
      cronSchedule: '0 9 * * 1',
    })

    expect(start).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
      workflowId: 'mission-weekly-review',
      cronSchedule: '0 9 * * 1',
      memo: {
        missionId: 'weekly-review',
        assistantId: 'legal',
        cronSchedule: '0 9 * * 1',
      },
    }))
  })

  it('refuses cron schedules when only the direct runner is available', async () => {
    delete process.env.TEMPORAL_ADDRESS
    const directRun = jest.fn(async () => ({}))
    const client = new TemporalClient('default', directRun)

    await expect(client.startMission({
      missionId: 'direct-recurring',
      tenantId: 'tenant-1',
      assistantId: 'legal',
      prompt: 'Review matters',
      cronSchedule: '0 9 * * 1',
    })).rejects.toThrow('Recurring missions require a connected Temporal Server');
    expect(directRun).not.toHaveBeenCalled()
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
      clarificationAnswers: [],
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

  it('records a failed terminal-state write instead of silently leaving a mission running', async () => {
    delete process.env.TEMPORAL_ADDRESS
    process.env.ARTIFACTS_URL = 'http://artifacts'
    delete process.env.GATEWAY_URL
    const largeText = 'x'.repeat(60_000)
    const directRun = jest.fn(async () => ({
      plan: { summary: largeText },
      outputs: { status: 'incomplete', phases: [{ tasks: [{ output: largeText }] }] },
    }))
    const client = new TemporalClient('default', directRun)
    const missionId = 'mission-large-final-state'
    const missionWrites: Array<Record<string, unknown>> = []
    let missionReads = 0
    let finishWrites!: () => void
    const writesFinished = new Promise<void>((resolve) => { finishWrites = resolve })
    jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const requestUrl = String(url)
      const method = init?.method || 'GET'
      if (requestUrl.endsWith(`/api/artifacts/missions/${missionId}`) && method === 'GET') {
        missionReads += 1
        if (missionReads <= 2) {
          return { ok: false, status: 404, json: async () => ({}) } as Response
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ missionId, status: 'running', controlState: 'running' }),
        } as Response
      }
      if (requestUrl.endsWith('/recovery-lease')) {
        const action = JSON.parse(String(init?.body)).action
        return {
          ok: true,
          status: 200,
          json: async () => action === 'claim' ? { claimed: true } : { released: true },
        } as Response
      }
      if (requestUrl.endsWith('/api/artifacts/missions') && method === 'POST') {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        missionWrites.push(body)
        if (missionWrites.length === 2 && String(init?.body).length > 100 * 1024) {
          return { ok: false, status: 413, text: async () => 'Payload too large' } as Response
        }
        if (missionWrites.length === 3) finishWrites()
        return { ok: true, status: 201, text: async () => '' } as Response
      }
      return { ok: true, status: 201, text: async () => '' } as Response
    })

    await client.startMission({
      missionId,
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Complete a large mission',
    })
    await Promise.race([
      writesFinished,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Mission state was not finalized')), 5_000)),
    ])

    expect(missionWrites.map((write) => write.status)).toEqual(['running', 'incomplete', 'failed'])
    expect(missionWrites[2]?.error).toContain('413')
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
      clarificationAnswers: [],
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

  it('replans after clarification answers instead of resuming the unanswered plan checkpoint', async () => {
    delete process.env.TEMPORAL_ADDRESS
    process.env.ARTIFACTS_URL = 'http://artifacts'
    delete process.env.GATEWAY_URL
    const client = new TemporalClient()
    const input = {
      missionId: 'mission-clarification',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Create and use an email service',
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
            status: 'awaiting_review',
            input,
            output: { outputs: { status: 'awaiting_clarification' } },
          }),
        } as Response
      }
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}/recovery-lease`)) {
        return { ok: true, status: 200, json: async () => ({ claimed: true }) } as Response
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })

    await expect(client.resumeMission(`mission-${input.missionId}`, ['SMTP host is smtp.example.com']))
      .resolves.toBe('resuming')

    expect(client.startMission).toHaveBeenCalledWith(
      { ...input, clarificationAnswers: ['SMTP host is smtp.example.com'] },
      undefined,
      true,
      true,
    )
    expect(fetchMock).not.toHaveBeenCalledWith(
      `http://artifacts/api/artifacts/missions/${input.missionId}/plan`,
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
      clarificationAnswers: [],
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
