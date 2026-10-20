import { TemporalClient } from '../src/client/TemporalClient'
import { MissionTerminationRequestedError } from '../src/types/missionControl'

interface RecordedRequest {
  method: string
  url: string
  body?: Record<string, unknown>
}

/**
 * Minimal in-memory stand-in for the artifacts service. The mission record is
 * merged on PUT, replaced on POST and dropped on DELETE, mirroring how the
 * real service persists mission state.
 */
function installArtifacts(record: Record<string, unknown>) {
  const state: Record<string, unknown> = { ...record }
  const requests: RecordedRequest[] = []

  jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
    const requestUrl = String(url)
    const method = (init?.method || 'GET').toUpperCase()
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    requests.push({ method, url: requestUrl, body })

    if (method === 'GET') {
      return { ok: true, status: 200, json: async () => ({ ...state }) } as Response
    }
    if (method === 'PUT') {
      Object.assign(state, body)
      return { ok: true, status: 200, json: async () => ({ ...state }) } as Response
    }
    if (method === 'POST') {
      if (requestUrl.endsWith('/api/artifacts/missions')) {
        for (const key of Object.keys(state)) delete state[key]
        Object.assign(state, body)
        return { ok: true, status: 200, json: async () => ({ ...state }) } as Response
      }
      if (requestUrl.endsWith('/recovery-lease')) {
        const action = body?.action
        return {
          ok: true,
          status: 200,
          json: async () => (action === 'claim' ? { claimed: true } : { renewed: true }),
        } as Response
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response
    }
    if (method === 'DELETE') {
      for (const key of Object.keys(state)) delete state[key]
      return { ok: true, status: 204, json: async () => ({}) } as Response
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response
  })

  return { state, requests }
}

const deletes = (requests: RecordedRequest[]) =>
  requests.filter((request) => request.method === 'DELETE')

describe('TemporalClient mission deletion', () => {
  const originalArtifactsUrl = process.env.ARTIFACTS_URL
  const originalGatewayUrl = process.env.GATEWAY_URL

  beforeEach(() => {
    process.env.ARTIFACTS_URL = 'http://artifacts'
    delete process.env.GATEWAY_URL
    delete process.env.TEMPORAL_ADDRESS
  })

  afterEach(() => {
    jest.restoreAllMocks()
    if (originalArtifactsUrl === undefined) delete process.env.ARTIFACTS_URL
    else process.env.ARTIFACTS_URL = originalArtifactsUrl
    if (originalGatewayUrl === undefined) delete process.env.GATEWAY_URL
    else process.env.GATEWAY_URL = originalGatewayUrl
  })

  it('removes the artifacts and live feed events of a finished mission right away', async () => {
    const { requests } = installArtifacts({
      missionId: 'mission-finished',
      status: 'completed',
      controlState: 'running',
    })
    const client = new TemporalClient()

    await expect(client.deleteMission('mission-mission-finished')).resolves.toBe('deleted')

    expect(deletes(requests).map((request) => request.url)).toEqual([
      'http://artifacts/api/artifacts/missions/mission-finished',
    ])
  })

  it('keeps a running mission intact and records the deletion for the runner', async () => {
    const { requests, state } = installArtifacts({
      missionId: 'mission-running',
      status: 'running',
      controlState: 'running',
    })
    const client = new TemporalClient()

    await expect(client.deleteMission('mission-mission-running')).resolves.toBe('stopping')

    // The runner still owns the state, so nothing is removed yet.
    expect(deletes(requests)).toHaveLength(0)
    expect(state.pendingDeletion).toBe(true)
    expect(state.controlState).toBe('terminate_requested')
  })

  it('removes the artifacts once the runner finalizes a mission that was deleted while running', async () => {
    const { requests, state } = installArtifacts({
      missionId: 'mission-finalized',
      status: 'running',
      controlState: 'running',
    })

    let releaseRunner: () => void = () => undefined
    const runnerGate = new Promise<void>((resolve) => {
      releaseRunner = resolve
    })
    const directRun = jest.fn(async () => {
      await runnerGate
      throw new MissionTerminationRequestedError()
    })
    const client = new TemporalClient('default', directRun as never)

    await client.startMission({
      missionId: 'mission-finalized',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Do the work',
    })

    // The user deletes the mission while the runner is still working.
    state.pendingDeletion = true
    releaseRunner()
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(deletes(requests).map((request) => request.url)).toEqual([
      'http://artifacts/api/artifacts/missions/mission-finalized',
    ])
  })
})
