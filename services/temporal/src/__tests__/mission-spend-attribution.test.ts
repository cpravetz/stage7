import { MissionClient } from '../client/MissionClient'

describe('MissionClient spend attribution', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
    delete process.env.ARTIFACTS_URL
  })

  it('sends the persisted mission creator as userId on brain classification calls', async () => {
    process.env.ARTIFACTS_URL = 'http://artifacts'
    const brainBodies: Array<Record<string, unknown>> = []
    jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const urlStr = String(url)
      if (urlStr.endsWith('/api/brain/complete')) {
        brainBodies.push(JSON.parse(String(init?.body)))
        return {
          ok: true,
          status: 200,
          json: async () => ({ classification: 'ANSWER' }),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ missionId: 'mission-1', input: { createdBy: 'usr_creator' } }),
      } as Response
    })
    const client = new MissionClient()

    const classification = await client.classifyUserMessageForPendingInteraction(
      'mission-1',
      'The answer is 42.',
      {
        kind: 'user_input',
        phaseId: 'phase-1',
        taskId: 'task-1',
        taskTitle: 'Answer',
        agentRole: 'mission-director',
        question: 'What is the answer?',
      },
    )

    expect(classification).toBe('ANSWER')
    expect(brainBodies.length).toBeGreaterThan(0)
    expect(brainBodies[0].userId).toBe('usr_creator')
  })

  it('omits userId when the mission has no persisted creator, leaving spend to the system bucket', async () => {
    process.env.ARTIFACTS_URL = 'http://artifacts'
    const brainBodies: Array<Record<string, unknown>> = []
    jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const urlStr = String(url)
      if (urlStr.endsWith('/api/brain/complete')) {
        brainBodies.push(JSON.parse(String(init?.body)))
        return {
          ok: true,
          status: 200,
          json: async () => ({ classification: 'FEEDBACK' }),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ missionId: 'mission-1', input: {} }),
      } as Response
    })
    const client = new MissionClient()

    const classification = await client.classifyUserMessageForPendingInteraction(
      'mission-1',
      'Try again.',
      {
        kind: 'user_input',
        phaseId: 'phase-1',
        taskId: 'task-1',
        taskTitle: 'Retry',
        agentRole: 'mission-director',
        question: 'What should change?',
      },
    )

    expect(classification).toBe('FEEDBACK')
    expect(brainBodies.length).toBeGreaterThan(0)
    expect(brainBodies[0].userId).toBeUndefined()
  })
})
