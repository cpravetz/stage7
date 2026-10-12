import { TemporalClient } from '../client/TemporalClient'
import * as missionActivity from '../activities/missionActivity'

describe('TemporalClient mission start', () => {
  const originalTemporalAddress = process.env.TEMPORAL_ADDRESS
  const originalArtifactsUrl = process.env.ARTIFACTS_URL
  const originalGatewayUrl = process.env.GATEWAY_URL

  afterEach(() => {
    jest.restoreAllMocks()
    if (originalTemporalAddress === undefined) delete process.env.TEMPORAL_ADDRESS
    else process.env.TEMPORAL_ADDRESS = originalTemporalAddress
    if (originalArtifactsUrl === undefined) delete process.env.ARTIFACTS_URL
    else process.env.ARTIFACTS_URL = originalArtifactsUrl
    if (originalGatewayUrl === undefined) delete process.env.GATEWAY_URL
    else process.env.GATEWAY_URL = originalGatewayUrl
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
})
