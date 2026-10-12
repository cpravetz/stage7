import { MissionAgentRuntime } from '../agent/MissionAgentRuntime'
import { AgentDefinition, AgentTask, DEFAULT_AGENT_EXECUTION_POLICY } from '@stage7-nextgen/shared'
import { Plan, Phase, Task } from '@stage7-nextgen/shared'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response
}

const agent: AgentDefinition = {
  id: 'agent-mission-1-researcher',
  tenantId: 'tenant-1',
  name: 'researcher Agent',
  description: 'Mission agent',
  type: 'researcher',
  systemPrompt: 'You research carefully.',
  tools: [],
  metadata: { missionId: 'mission-1', agentRole: 'researcher' },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const task: Task = {
  id: 'task-1',
  title: 'Research the topic',
  description: 'Find and synthesize relevant facts.',
  agentRole: 'researcher',
  systemPrompt: 'You research carefully.',
  expectedArtifacts: ['research.md'],
  status: 'pending',
  artifacts: [],
}

const phase: Phase = {
  id: 'phase-1',
  name: 'Research',
  goal: 'Understand the topic',
  tasks: [task],
  requiresApproval: false,
  status: 'in_progress',
}

const plan: Plan = {
  summary: 'Research and report',
  estimatedDuration: '1 hour',
  estimatedCost: 'low',
  requiresClarification: false,
  clarificationQuestions: [],
  phases: [phase],
}

describe('MissionAgentRuntime', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('executes the mission task through the mission Agent Runtime without Assistant execution', async () => {
    const requests: Array<{ url: string; method: string; body?: Record<string, unknown> }> = []
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined
      requests.push({ url, method, body })

      if (url.endsWith('/missions/mission-1/agents/agent-mission-1-researcher') && method === 'GET') {
        return jsonResponse(agent)
      }
      if (url.endsWith('/missions/mission-1/agents/agent-mission-1-researcher/start')) {
        return jsonResponse({})
      }
      if (url.endsWith('/tasks/mission-1:phase-1:task-1/execute')) {
        const submittedTask: AgentTask = {
          agentId: agent.id,
          taskId: 'mission-1:phase-1:task-1',
          type: 'researcher',
          input: {},
          priority: 1,
          status: 'completed',
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          result: {
            output: 'Research complete.',
            artifacts: [{ name: 'research.md', type: 'document', content: 'Research complete.' }],
            tokensUsed: 19,
          },
        }
        return jsonResponse(submittedTask)
      }
      if (url.endsWith('/tasks')) {
        return jsonResponse({
          agentId: agent.id,
          taskId: 'mission-1:phase-1:task-1',
          type: body?.type,
          input: body?.input,
          priority: body?.priority,
          status: 'pending',
          createdAt: new Date().toISOString(),
        })
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    const runtime = new MissionAgentRuntime({
      missionId: 'mission-1',
      tenantId: 'tenant-1',
      agentRuntimeUrl: 'http://agent-runtime:3400',
    })
    const agentId = await runtime.getOrCreateAgent('researcher', task.systemPrompt)
    const result = await runtime.executeTask(
      agentId,
      task,
      phase,
      plan,
      true,
      DEFAULT_AGENT_EXECUTION_POLICY,
    )

    expect(result.output).toBe('Research complete.')
    expect(result.tokensUsed).toBe(19)
    expect(result.artifacts[0]?.name).toBe('research.md')
    expect(requests.some((request) => request.url.includes('/api/workers/assistants/'))).toBe(false)
    expect(requests.find((request) => request.url.endsWith('/tasks'))?.body?.taskId).toBe('mission-1:phase-1:task-1')
    expect(
      (requests.find((request) => request.url.endsWith('/tasks'))?.body?.input as Record<string, unknown>)
        ?.context,
    ).toMatchObject({ executionPolicy: DEFAULT_AGENT_EXECUTION_POLICY })
    expect(requests.find((request) => request.url.endsWith('/tasks/mission-1:phase-1:task-1/execute'))?.body)
      .toEqual({ requireCompletedReceipt: true })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('creates and starts an agent only when lookup returns 404', async () => {
    const requests: Array<{ url: string; method: string }> = []
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'
      requests.push({ url, method })
      if (method === 'GET') return jsonResponse({ error: 'not found' }, 404)
      if (method === 'POST') return jsonResponse(agent, 201)
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    const runtime = new MissionAgentRuntime({
      missionId: 'mission-1',
      tenantId: 'tenant-1',
      agentRuntimeUrl: 'http://agent-runtime:3400',
    })
    await expect(runtime.getOrCreateAgent('researcher', task.systemPrompt))
      .resolves.toBe(agent.id)

    expect(requests.map((request) => request.method)).toEqual(['GET', 'POST', 'POST'])
  })

  it('does not hide agent-runtime outages as missing agents', async () => {
    const requests: string[] = []
    jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      requests.push(String(input))
      return jsonResponse({ error: 'unavailable' }, 503)
    })

    const runtime = new MissionAgentRuntime({
      missionId: 'mission-1',
      tenantId: 'tenant-1',
      agentRuntimeUrl: 'http://agent-runtime:3400',
    })
    await expect(runtime.getOrCreateAgent('researcher', task.systemPrompt))
      .rejects.toThrow('failed (503)')
    expect(requests).toHaveLength(1)
  })
})
