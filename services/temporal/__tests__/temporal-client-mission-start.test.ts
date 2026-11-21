import { isMissionAwaitingInputError, missionStatus, TemporalClient } from '../src/client/TemporalClient'
import * as missionActivity from '../src/activities/missionActivity'

describe('TemporalClient mission start', () => {
  it('only treats explicitly completed output as completed', () => {
    expect(missionStatus({ outputs: { status: 'awaiting_review' } })).toBe('awaiting_review')
    expect(missionStatus({ outputs: { status: 'incomplete' } })).toBe('incomplete')
    expect(missionStatus({ outputs: { status: 'completed' } })).toBe('completed')
    expect(missionStatus({ outputs: { status: 'unexpected' } })).toBe('incomplete')
    expect(missionStatus({})).toBe('incomplete')
  })

  it('exposes an older falsely completed record as needing review', async () => {
    process.env.ARTIFACTS_URL = 'http://artifacts'
    const record = {
      missionId: 'old-incorrect-status',
      status: 'completed',
      output: { outputs: { status: 'awaiting_review', gaps: ['The email was not sent.'] } },
    }
    jest.spyOn(global, 'fetch').mockImplementation(async (url) => ({
      ok: true,
      json: async () => String(url).endsWith('/missions') ? { missions: [record] } : record,
    }) as Response)
    const client = new TemporalClient()

    expect(await client.getMissionResult('mission-old-incorrect-status')).toMatchObject({ status: 'awaiting_review' })
    expect(await client.listMissions()).toEqual([expect.objectContaining({ status: 'awaiting_review' })])
  })

  it.each([
    {
      outputs: { status: 'awaiting_review', gaps: [
        'The email was not sent.',
        'Task "Send" did not complete. Steps that ran: send_email.',
      ] },
      expected: { reviewStatus: 'awaiting_review', gaps: ['The email was not sent.', 'Task "Send" did not complete.'] },
    },
    {
      outputs: { status: 'awaiting_permission', pendingInteraction: {
        kind: 'mcp_permission', taskTitle: 'Send report', permission: { toolName: 'Email' },
      } },
      expected: { reviewStatus: 'awaiting_permission', taskTitle: 'Send report', toolName: 'Email' },
    },
    {
      outputs: { status: 'awaiting_review', gaps: ['The action receipt is uncertain.'] },
      expected: { reviewStatus: 'awaiting_review', gaps: ['The recorded result is uncertain.'], outcomeUncertain: true },
    },
  ])('persists review details instead of completion for $outputs.status', async ({ outputs, expected }) => {
    process.env.ARTIFACTS_URL = 'http://artifacts'
    delete process.env.GATEWAY_URL
    const writes: Array<Record<string, unknown>> = []
    const events: Array<Record<string, unknown>> = []
    let finish!: () => void
    const finished = new Promise<void>((resolve) => { finish = resolve })
    jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const requestUrl = String(url)
      const method = init?.method || 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      if (requestUrl.endsWith('/recovery-lease')) {
        return { ok: true, status: 200, json: async () => ({ claimed: true, released: true }) } as Response
      }
      if (requestUrl.endsWith('/events') && method === 'POST') {
        events.push(body)
        if (body.type === 'mission_needs_review') finish()
      }
      if (requestUrl.endsWith('/api/artifacts/missions') && method === 'POST') writes.push(body)
      if (method === 'GET') return {
        ok: true, status: 200, json: async () => ({ missionId: 'review-test', status: 'running', controlState: 'running' }),
      } as Response
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })
    const runner = jest.fn(async () => ({ outputs }))
    const client = new TemporalClient('default', runner)
    await client.startMission({ missionId: 'review-test', tenantId: 'tenant-1', assistantId: '', prompt: 'Send it.' })
    await finished
    expect(writes).toContainEqual(expect.objectContaining({ status: 'awaiting_review' }))
    expect(events).toContainEqual(expect.objectContaining({
      type: 'mission_needs_review',
      data: expect.objectContaining(expected),
    }))
    expect(events.some((event) => event.type === 'mission_completed')).toBe(false)
  })

  const originalTemporalAddress = process.env.TEMPORAL_ADDRESS
  const originalTemporalBackend = process.env.TEMPORAL_BACKEND
  const originalArtifactsUrl = process.env.ARTIFACTS_URL
  const originalGatewayUrl = process.env.GATEWAY_URL
  const originalToolExecutorUrl = process.env.TOOL_EXECUTOR_URL

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
    if (originalToolExecutorUrl === undefined) delete process.env.TOOL_EXECUTOR_URL
    else process.env.TOOL_EXECUTOR_URL = originalToolExecutorUrl
  })

  it('always uses the built-in runner regardless of legacy backend settings', () => {
    process.env.TEMPORAL_BACKEND = 'temporal-server'
    process.env.TEMPORAL_ADDRESS = 'temporal:7233'
    expect(new TemporalClient().getRuntimeStatus().executionMode).toBe('artifacts-backed-direct')
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
    const missionId = 'large-final-state'
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

    await expect(client.resumeMission(`mission-${input.missionId}`, {
      clarificationAnswers: ['SMTP host is smtp.example.com'],
    }))
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

  it('resolves an MCP permission decision and resumes from the persisted pending-task checkpoint', async () => {
    delete process.env.TEMPORAL_ADDRESS
    process.env.ARTIFACTS_URL = 'http://artifacts'
    process.env.TOOL_EXECUTOR_URL = 'http://tool-executor:3500'
    delete process.env.GATEWAY_URL
    const client = new TemporalClient()
    const input = {
      missionId: 'mission-mcp-permission',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Use the discovered capability',
    }
    const plan = {
      summary: 'Use the capability',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      clarificationAnswers: [],
      phases: [],
    }
    const pendingInteraction = {
      kind: 'mcp_permission' as const,
      phaseId: 'phase-1',
      taskId: 'task-1',
      taskTitle: 'Use the capability',
      agentRole: 'worker',
      requestId: 'perm-mission-test',
      permission: {
        toolName: 'External Capability',
        dataClasses: ['task-data'],
        credentials: { needed: false, keys: [] },
        defaultScope: 'task',
        availableScopes: ['task'],
        explanation: 'Approval required.',
      },
      actionReceipts: [],
      resumeCount: 0,
    }
    jest.spyOn(client, 'startMission').mockResolvedValue(`mission-${input.missionId}`)
    const calls: Array<{ url: string; method?: string; body?: string }> = []
    jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const requestUrl = String(url)
      calls.push({
        url: requestUrl,
        method: init?.method,
        body: init?.body ? String(init.body) : undefined,
      })
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}`) && !init?.method) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            missionId: input.missionId,
            status: 'awaiting_review',
            input,
            output: { outputs: { status: 'awaiting_permission', pendingInteraction } },
          }),
        } as Response
      }
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}/plan`)) {
        return { ok: true, status: 200, json: async () => plan } as Response
      }
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}/recovery-lease`)) {
        return { ok: true, status: 200, json: async () => ({ claimed: true }) } as Response
      }
      if (requestUrl.endsWith('/api/tool-executor/mcp/permission/perm-mission-test/decide')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ decision: 'granted', satisfied: true }),
        } as Response
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })

    await expect(client.resumeMission(`mission-${input.missionId}`, {
      permissionDecision: 'granted',
      permissionScope: 'task',
    })).resolves.toBe('resuming')

    expect(calls.find((call) => call.url.includes('/api/tool-executor/mcp/permission/'))?.body)
      .toContain('"decision":"granted"')
    expect(client.startMission).toHaveBeenCalledWith(
      expect.objectContaining({
        ...input,
        interactionResponse: expect.stringContaining('granted permission'),
      }),
      expect.objectContaining({ pendingInteraction }),
      true,
      true,
    )
  })

  it('resumes a pending mission with a single mission_resumed emission and no client-side user_input_resolved duplicate', async () => {
    delete process.env.TEMPORAL_ADDRESS
    process.env.ARTIFACTS_URL = 'http://artifacts'
    process.env.TOOL_EXECUTOR_URL = 'http://tool-executor:3500'
    delete process.env.GATEWAY_URL
    const client = new TemporalClient()
    const input = {
      missionId: 'mission-resume-once',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Complete the protected operation',
    }
    const pendingInteraction = {
      kind: 'user_input' as const,
      phaseId: 'phase-1',
      taskId: 'task-1',
      taskTitle: 'Protected operation',
      agentRole: 'worker',
      question: 'Provide the SMTP host.',
      credentialRequest: {
        executionId: 'exec-pending-credential',
        toolId: 'protected-api',
        toolName: 'Protected API',
        missingCredentials: [{ key: 'smtp_host', label: 'SMTP host' }],
      },
      actionReceipts: [],
      resumeCount: 0,
    }
    jest.spyOn(client, 'startMission').mockResolvedValue(`mission-${input.missionId}`)
    const events: Array<Record<string, unknown>> = []
    jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const requestUrl = String(url)
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}`) && !init?.method) {
        return {
          ok: true, status: 200,
          json: async () => ({ missionId: input.missionId, status: 'running', controlState: 'running', input,
            output: { outputs: { status: 'awaiting_user_input', pendingInteraction } } }),
        } as Response
      }
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}/plan`)) {
        return { ok: true, status: 200, json: async () => ({ summary: '', estimatedDuration: '', estimatedCost: '', requiresClarification: false, clarificationQuestions: [], clarificationAnswers: [], phases: [] }) } as Response
      }
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}/recovery-lease`)) {
        return { ok: true, status: 200, json: async () => ({ claimed: true }) } as Response
      }
      if (requestUrl.endsWith('/events') && init?.method === 'POST') {
        events.push(JSON.parse(String(init.body)))
        return { ok: true, status: 200, json: async () => ({}) } as Response
      }
      if (requestUrl.endsWith('/api/tool-executor/executions/exec-pending-credential/credentials')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'completed', toolId: 'protected-api', output: { host: 'smtp.example.com' } }) } as Response
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })

    await expect(client.resumeMission(`mission-${input.missionId}`, {
      interactionResponse: 'smtp_host: smtp.example.com',
    })).resolves.toBe('resuming')

    expect(client.startMission).toHaveBeenCalledTimes(1)
    expect(events.filter((event) => event.type === 'mission_resumed')).toHaveLength(1)
    // The client does not re-emit user_input_resolved; the orchestrator emits it
    // exactly once when the pending task resumes.
    expect(events.filter((event) => event.type === 'user_input_resolved')).toHaveLength(0)
  })

  it.each([
    ['successful', { updated: true }, undefined, 'success', false],
    ['failed', { output: '{"success":false,"error":"provider rejected request"}' }, undefined, 'failure', true],
    ['unknown', { updated: true }, false, 'failure', true],
  ])('resumes with %s tool outcome after credentials are provided', async (_label, output, outcomeKnown, outcome, isError) => {
    delete process.env.TEMPORAL_ADDRESS
    process.env.ARTIFACTS_URL = 'http://artifacts'
    process.env.TOOL_EXECUTOR_URL = 'http://tool-executor:3500'
    delete process.env.GATEWAY_URL
    const client = new TemporalClient()
    const input = {
      missionId: 'mission-tool-credentials',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Complete the protected operation',
    }
    const plan = {
      summary: 'Complete protected operation',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      clarificationAnswers: [],
      phases: [],
    }
    const actionKey = 'a'.repeat(64)
    const pendingInteraction = {
      kind: 'user_input' as const,
      phaseId: 'phase-1',
      taskId: 'task-1',
      taskTitle: 'Protected operation',
      agentRole: 'worker',
      question: 'Provide the SMTP host and username.',
      credentialRequest: {
        executionId: 'exec-pending-credential',
        toolId: 'protected-api',
        toolName: 'Protected API',
        missingCredentials: [
          { key: 'smtp_host', label: 'SMTP host' },
          { key: 'smtp_user', label: 'SMTP username' },
        ],
      },
      actionReceipts: [{
        toolId: 'protected-api',
        isError: true,
        content: '__ASK_USER__:credential request',
        outcome: 'question_asked' as const,
        actionKey,
      }],
      resumeCount: 0,
    }
    jest.spyOn(client, 'startMission').mockResolvedValue(`mission-${input.missionId}`)
    const calls: Array<{ url: string; method?: string; body?: string }> = []
    jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const requestUrl = String(url)
      calls.push({
        url: requestUrl,
        method: init?.method,
        body: init?.body ? String(init.body) : undefined,
      })

      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}`) && !init?.method) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            missionId: input.missionId,
            status: 'running',
            controlState: 'running',
            input,
            output: { outputs: { status: 'awaiting_user_input', pendingInteraction } },
          }),
        } as Response
      }
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}/plan`)) {
        return { ok: true, status: 200, json: async () => plan } as Response
      }
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}/recovery-lease`)) {
        return { ok: true, status: 200, json: async () => ({ claimed: true }) } as Response
      }
      if (requestUrl.includes('/api/vault/secrets/name/')) {
        const secretName = decodeURIComponent(new URL(requestUrl).pathname.split('/').at(-1) || '');
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: secretName.endsWith('smtp_host') ? 'secret-host' : 'secret-user' }),
        } as Response
      }
      if (requestUrl.endsWith('/api/tool-executor/executions/exec-pending-credential/credentials')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            status: 'completed',
            toolId: 'protected-api',
            output,
            ...(outcomeKnown === undefined ? {} : { outcomeKnown }),
          }),
        } as Response
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })

    await expect(client.resumeMission(`mission-${input.missionId}`, {
      useConfiguredCredentials: true,
    })).resolves.toBe('resuming')

    const credentialCall = calls.find((call) => call.url.endsWith('/credentials'))
    expect(JSON.parse(credentialCall?.body || '{}')).toEqual({
      credentials: {
        smtp_host: 'vault://secret-host',
        smtp_user: 'vault://secret-user',
      },
    })
    const resumed = (client.startMission as jest.Mock).mock.calls[0] as [
      Record<string, unknown>,
      { pendingInteraction?: { actionReceipts?: Array<Record<string, unknown>> } },
    ]
    expect(resumed[0].interactionResponse).not.toContain('vault://')
    expect(resumed[1].pendingInteraction?.actionReceipts).toEqual([
      expect.objectContaining({
        toolId: 'protected-api',
        isError,
        outcome,
        actionKey,
        content: JSON.stringify(output),
      }),
    ])
  })

  it.each([
    ['vault reference', [{ key: 'token', label: 'Token' }], 'Use vault://prod-token for the token.', { token: 'vault://prod-token' }],
    ['JSON fragment', [{ key: 'smtp_host', label: 'SMTP host' }, { key: 'smtp_user', label: 'SMTP username' }], '{"smtp_host":"mail.example.com","smtp_user":"admin"}', { smtp_host: 'mail.example.com', smtp_user: 'admin' }],
    ['key:value pairs', [{ key: 'smtp_host', label: 'SMTP host' }, { key: 'smtp_user', label: 'SMTP username' }], 'smtp_host: mail.example.com, smtp_user: admin', { smtp_host: 'mail.example.com', smtp_user: 'admin' }],
  ])('accepts %s in a conversational reply for credential values', async (_format, missingCredentials, reply, expectedCredentials) => {
    delete process.env.TEMPORAL_ADDRESS
    process.env.ARTIFACTS_URL = 'http://artifacts'
    process.env.TOOL_EXECUTOR_URL = 'http://tool-executor:3500'
    delete process.env.GATEWAY_URL
    delete process.env.VAULT_URL
    const client = new TemporalClient()
    const input = {
      missionId: 'mission-cred-format',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Complete the protected operation',
    }
    const plan = {
      summary: '', estimatedDuration: '', estimatedCost: '', requiresClarification: false,
      clarificationQuestions: [], clarificationAnswers: [], phases: [],
    }
    const actionKey = 'b'.repeat(64)
    const pendingInteraction = {
      kind: 'user_input' as const,
      phaseId: 'phase-1',
      taskId: 'task-1',
      taskTitle: 'Protected operation',
      agentRole: 'worker',
      question: 'Provide the credentials.',
      credentialRequest: {
        executionId: 'exec-format-credential',
        toolId: 'protected-api',
        toolName: 'Protected API',
        missingCredentials,
      },
      actionReceipts: [{
        toolId: 'protected-api',
        isError: true,
        content: '__ASK_USER__:credential request',
        outcome: 'question_asked' as const,
        actionKey,
      }],
      resumeCount: 0,
    }
    jest.spyOn(client, 'startMission').mockResolvedValue(`mission-${input.missionId}`)
    const calls: Array<{ url: string; body?: string }> = []
    jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const requestUrl = String(url)
      calls.push({ url: requestUrl, body: init?.body ? String(init.body) : undefined })
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}`) && !init?.method) {
        return {
          ok: true, status: 200,
          json: async () => ({ missionId: input.missionId, status: 'running', controlState: 'running', input,
            output: { outputs: { status: 'awaiting_user_input', pendingInteraction } } }),
        } as Response
      }
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}/plan`)) {
        return { ok: true, status: 200, json: async () => plan } as Response
      }
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}/recovery-lease`)) {
        return { ok: true, status: 200, json: async () => ({ claimed: true }) } as Response
      }
      if (requestUrl.includes('/api/vault/secrets/name/')) {
        return { ok: false, status: 404, json: async () => ({}) } as Response
      }
      if (requestUrl.endsWith('/api/tool-executor/executions/exec-format-credential/credentials')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'completed', toolId: 'protected-api' }) } as Response
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })

    await expect(client.resumeMission(`mission-${input.missionId}`, { interactionResponse: reply })).resolves.toBe('resuming')

    const credentialCall = calls.find((call) => call.url.endsWith('/credentials'))
    expect(JSON.parse(credentialCall?.body || '{}')).toEqual({ credentials: expectedCredentials })
    expect(client.startMission).toHaveBeenCalledTimes(1)
    expect(calls.filter((call) => call.url.endsWith('/credentials'))).toHaveLength(1)
  })

  it('reports specifically which configured credentials remain unresolved', async () => {
    delete process.env.TEMPORAL_ADDRESS
    process.env.ARTIFACTS_URL = 'http://artifacts'
    process.env.TOOL_EXECUTOR_URL = 'http://tool-executor:3500'
    delete process.env.GATEWAY_URL
    delete process.env.VAULT_URL
    const client = new TemporalClient()
    const input = {
      missionId: 'mission-unresolved-credentials',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Complete the protected operation',
    }
    const plan = {
      summary: '', estimatedDuration: '', estimatedCost: '', requiresClarification: false,
      clarificationQuestions: [], clarificationAnswers: [], phases: [],
    }
    const pendingInteraction = {
      kind: 'user_input' as const,
      phaseId: 'phase-1',
      taskId: 'task-1',
      taskTitle: 'Protected operation',
      agentRole: 'worker',
      question: 'Provide the SMTP host and username.',
      credentialRequest: {
        executionId: 'exec-unresolved-credential',
        toolId: 'protected-api',
        toolName: 'Protected API',
        missingCredentials: [
          { key: 'smtp_host', label: 'SMTP host' },
          { key: 'smtp_user', label: 'SMTP username' },
        ],
      },
      actionReceipts: [],
      resumeCount: 0,
    }
    jest.spyOn(client, 'startMission').mockResolvedValue(`mission-${input.missionId}`)
    jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const requestUrl = String(url)
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}`)) {
        return {
          ok: true, status: 200,
          json: async () => ({ missionId: input.missionId, status: 'running', controlState: 'running', input,
            output: { outputs: { status: 'awaiting_user_input', pendingInteraction } } }),
        } as Response
      }
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}/plan`)) {
        return { ok: true, status: 200, json: async () => plan } as Response
      }
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}/recovery-lease`)) {
        return { ok: true, status: 200, json: async () => ({ claimed: true }) } as Response
      }
      if (requestUrl.includes('/api/vault/secrets/name/')) {
        return { ok: false, status: 404, json: async () => ({}) } as Response
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })

    let error: unknown
    try {
      await client.resumeMission(`mission-${input.missionId}`, {
        interactionResponse: 'The credentials are already configured and ready to use.',
      })
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('smtp_host (SMTP host)')
    expect((error as Error).message).toContain('smtp_user (SMTP username)')
    expect((error as Error).message).toContain('Provide the values or point to existing secrets')
    expect(client.startMission).not.toHaveBeenCalled()
  })

  it('resumes a credential interruption with a conversational message without submitting it as a secret', async () => {
    process.env.ARTIFACTS_URL = 'http://artifacts'
    delete process.env.GATEWAY_URL
    const client = new TemporalClient()
    const input = {
      missionId: 'message-context', tenantId: 'tenant-1', assistantId: 'assistant-1',
      prompt: 'Complete the protected operation',
    }
    const pendingInteraction = {
      kind: 'user_input', phaseId: 'phase-1', taskId: 'task-1', taskTitle: 'Protected operation',
      agentRole: 'worker', resumeCount: 0,
      credentialRequest: { executionId: 'exec-1', toolId: 'service', toolName: 'Service', missingCredentials: [{ key: 'token', label: 'Token' }] },
    }
    jest.spyOn(client, 'startMission').mockResolvedValue('mission-message-context')
    const fetcher = jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const requestUrl = String(url)
      if (requestUrl.endsWith('/api/artifacts/missions/message-context') && !init?.method) {
        return { ok: true, status: 200, json: async () => ({
          missionId: input.missionId, status: 'awaiting_review', controlState: 'running', input,
          output: { outputs: { pendingInteraction } },
        }) } as Response
      }
      if (requestUrl.endsWith('/plan')) {
        return { ok: true, status: 200, json: async () => ({
          summary: '', estimatedDuration: '', estimatedCost: '', requiresClarification: false,
          clarificationQuestions: [], clarificationAnswers: [], phases: [],
        }) } as Response
      }
      if (requestUrl.endsWith('/recovery-lease')) {
        return { ok: true, status: 200, json: async () => ({ claimed: true }) } as Response
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })
    await client.resumeMission('mission-message-context', {
      interactionResponse: 'Use secret:service_token.',
      continueWithMessage: true,
    })
    expect(client.startMission).toHaveBeenCalledWith(
      expect.objectContaining({ interactionResponse: 'Use secret:service_token.' }),
      expect.objectContaining({ pendingInteraction }), true, true,
    )
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/credentials'))).toBe(false)
  })

  it('resumes a plain pending question with the user reply as guidance', async () => {
    process.env.ARTIFACTS_URL = 'http://artifacts'
    delete process.env.GATEWAY_URL
    const client = new TemporalClient()
    const input = {
      missionId: 'plain-question', tenantId: 'tenant-1', assistantId: 'assistant-1',
      prompt: 'Send the customer an SMS',
    }
    const pendingInteraction = {
      kind: 'user_input', phaseId: 'phase-1', taskId: 'phase-1-task-1',
      taskTitle: 'Send SMS sending capability', agentRole: 'worker', resumeCount: 0,
      question: 'I need the value for the HEALTHCARE_COMM_API_KEY configuration field.',
    }
    jest.spyOn(client, 'startMission').mockResolvedValue('mission-plain-question')
    const fetcher = jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const requestUrl = String(url)
      if (requestUrl.endsWith('/api/artifacts/missions/plain-question') && !init?.method) {
        return { ok: true, status: 200, json: async () => ({
          missionId: input.missionId, status: 'awaiting_review', controlState: 'running', input,
          output: { outputs: { pendingInteraction } },
        }) } as Response
      }
      if (requestUrl.endsWith('/plan')) {
        return { ok: true, status: 200, json: async () => ({
          summary: '', estimatedDuration: '', estimatedCost: '', requiresClarification: false,
          clarificationQuestions: [], clarificationAnswers: [], phases: [],
        }) } as Response
      }
      if (requestUrl.endsWith('/recovery-lease')) {
        return { ok: true, status: 200, json: async () => ({ claimed: true }) } as Response
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })

    const reply = 'You do not need that key; write an SMS tool with Twilio and the credentials I gave you.';
    await expect(client.resumeMission('mission-plain-question', {
      interactionResponse: reply,
      continueWithMessage: true,
    })).resolves.toBe('resuming')
    expect(client.startMission).toHaveBeenCalledWith(
      expect.objectContaining({ interactionResponse: reply }),
      expect.objectContaining({ pendingInteraction }), true, true,
    )
    const missionUpdate = fetcher.mock.calls.find(([url, init]) =>
      String(url).endsWith('/api/artifacts/missions/plain-question') && init?.method === 'PUT')
    expect(missionUpdate).toBeDefined()
    const persistedUpdate = JSON.parse(String(missionUpdate?.[1]?.body))
    expect(persistedUpdate.status).toBe('running')
    expect(persistedUpdate.output.outputs.status).toBe('running')
    expect(persistedUpdate.output.outputs).not.toHaveProperty('pendingInteraction')
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

  it('refuses to resume a paused mission without an answer, and resumes once the configuration is confirmed', async () => {
    delete process.env.TEMPORAL_ADDRESS
    process.env.ARTIFACTS_URL = 'http://artifacts'
    delete process.env.GATEWAY_URL
    const client = new TemporalClient()
    const input = {
      missionId: 'mission-awaiting-config',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Send the message',
    }
    const question = 'A required service or configuration is missing. Configure it in Tools configuration and continue after you save.'
    jest.spyOn(client, 'startMission').mockResolvedValue(`mission-${input.missionId}`)
    jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const requestUrl = String(url)
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}`) && !init?.method) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            missionId: input.missionId,
            status: 'awaiting_review',
            controlState: 'running',
            input,
            output: { outputs: { status: 'awaiting_user_input', pendingInteraction: { kind: 'user_input', taskId: 'phase-1-task-1', question } } },
          }),
        } as Response
      }
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}/plan`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            summary: 'Send the message',
            estimatedDuration: 'short',
            estimatedCost: 'low',
            requiresClarification: false,
            clarificationQuestions: [],
            clarificationAnswers: [],
            phases: [],
          }),
        } as Response
      }
      return { ok: true, status: 200, json: async () => ({ claimed: true }) } as Response
    })

    let caught: unknown
    try {
      await client.resumeMission(`mission-${input.missionId}`)
    } catch (error) {
      caught = error
    }
    expect(isMissionAwaitingInputError(caught)).toBe(true)
    expect((caught as Error).message).toBe('A non-empty response is required for the pending mission question')
    expect(client.startMission).not.toHaveBeenCalled()

    await expect(
      client.resumeMission(`mission-${input.missionId}`, { useConfiguredCredentials: true }),
    ).resolves.toBe('resuming')

    expect(client.startMission).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId: input.missionId,
        interactionResponse: expect.stringContaining('supplied the requested service or configuration'),
      }),
      expect.objectContaining({
        plan: expect.objectContaining({ summary: 'Send the message' }),
        pendingInteraction: expect.objectContaining({ kind: 'user_input' }),
      }),
      true,
      true,
    )
  })

  it('resumes a completed mission with a user message and starts fresh without checkpoint', async () => {
    delete process.env.TEMPORAL_ADDRESS
    process.env.ARTIFACTS_URL = 'http://artifacts'
    delete process.env.GATEWAY_URL
    const client = new TemporalClient()
    const input = {
      missionId: 'mission-completed-resume',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Original mission goal',
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
            status: 'completed',
            input,
            output: { outputs: { status: 'completed' } },
          }),
        } as Response
      }
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}/recovery-lease`)) {
        return { ok: true, status: 200, json: async () => ({ claimed: true }) } as Response
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })

    await expect(
      client.resumeMission(`mission-${input.missionId}`, { interactionResponse: 'New user message after completion' })
    ).resolves.toBe('resuming')

    expect(client.startMission).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId: input.missionId,
        userMessages: ['New user message after completion'],
      }),
      undefined,
      true,
      true,
    )
    expect(fetchMock).not.toHaveBeenCalledWith(
      `http://artifacts/api/artifacts/missions/${input.missionId}/plan`,
    )
  })

  it('resumes a canceled mission with a user message and starts fresh without checkpoint', async () => {
    delete process.env.TEMPORAL_ADDRESS
    process.env.ARTIFACTS_URL = 'http://artifacts'
    delete process.env.GATEWAY_URL
    const client = new TemporalClient()
    const input = {
      missionId: 'mission-canceled-resume',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Original mission goal',
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
            status: 'canceled',
            input,
            output: { outputs: { status: 'canceled' } },
          }),
        } as Response
      }
      if (requestUrl.endsWith(`/api/artifacts/missions/${input.missionId}/recovery-lease`)) {
        return { ok: true, status: 200, json: async () => ({ claimed: true }) } as Response
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })

    await expect(
      client.resumeMission(`mission-${input.missionId}`, { interactionResponse: 'New user message after cancellation' })
    ).resolves.toBe('resuming')

    expect(client.startMission).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId: input.missionId,
        userMessages: ['New user message after cancellation'],
      }),
      undefined,
      true,
      true,
    )
    expect(fetchMock).not.toHaveBeenCalledWith(
      `http://artifacts/api/artifacts/missions/${input.missionId}/plan`,
    )
  })
})
