import { applyPhaseReview, MissionAgentRuntime } from '../agent/MissionAgentRuntime'
import {
  AgentDefinition,
  AgentTask,
  BRAIN_ROUTING_SESSION_CONTEXT_KEY,
  DEFAULT_AGENT_EXECUTION_POLICY,
} from '@stage7-nextgen/shared'
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
  dependsOnTaskIds: [],
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

  it('passes one stable Brain routing session through Planner repair tasks', async () => {
    const plannerAgent = { ...agent, id: 'agent-mission-1-planner', type: 'planner' }
    const generatedPlan: Plan = {
      ...plan,
      phases: Array.from({ length: 3 }, (_, index) => ({
        ...phase,
        id: `phase-${index + 1}`,
        name: `Phase ${index + 1}`,
        goal: `Complete phase ${index + 1}`,
        tasks: [{
          ...task,
          id: `phase-${index + 1}-task-1`,
        }],
      })),
    }
    let submittedInput: Record<string, unknown> | undefined
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined

      if (url.endsWith('/missions/mission-1/agents/agent-mission-1-planner') && method === 'GET') {
        return jsonResponse(plannerAgent)
      }
      if (url.endsWith('/agents/agent-mission-1-planner/start')) return jsonResponse({})
      if (url.endsWith('/tasks') && method === 'POST') {
        submittedInput = body?.input as Record<string, unknown>
        return jsonResponse({
          agentId: plannerAgent.id,
          taskId: body?.taskId,
          type: body?.type,
          input: body?.input,
          priority: body?.priority,
          status: 'pending',
          createdAt: new Date().toISOString(),
        })
      }
      if (url.endsWith('/tasks/mission-1:planner:attempt-1/execute')) {
        return jsonResponse({
          agentId: plannerAgent.id,
          taskId: 'mission-1:planner:attempt-1',
          type: 'planning',
          input: {},
          priority: 1,
          status: 'completed',
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          result: { output: JSON.stringify(generatedPlan), artifacts: [], tokensUsed: 0 },
        })
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    const runtime = new MissionAgentRuntime({
      missionId: 'mission-1',
      tenantId: 'tenant-1',
      agentRuntimeUrl: 'http://agent-runtime:3400',
    })
    await expect(runtime.generatePlan('Create a plan')).resolves.toMatchObject({
      summary: generatedPlan.summary,
    })

    expect(submittedInput?.context).toMatchObject({
      plannerAttempt: 1,
      [BRAIN_ROUTING_SESSION_CONTEXT_KEY]: 'mission-1:planner',
    })
  })

  it('asks the mission Agent to choose only from tasks whose dependencies are complete', async () => {
    const requests: Array<{ url: string; body?: Record<string, unknown> }> = []
    const selectionPhase: Phase = {
      ...phase,
      tasks: [
        task,
        { ...task, id: 'task-2', title: 'Independent option', dependsOnTaskIds: [] },
        { ...task, id: 'task-3', title: 'Ready after task one', dependsOnTaskIds: ['task-1'] },
      ],
    }
    const selectionPlan = { ...plan, phases: [selectionPhase] }
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined
      requests.push({ url, body })

      if (url.endsWith('/agents/agent-mission-1-mission-director')) {
        return jsonResponse({ error: 'not found' }, 404)
      }
      if (url.endsWith('/agents') && init?.method === 'POST') {
        return jsonResponse({ ...agent, id: 'agent-mission-1-mission-director' }, 201)
      }
      if (url.endsWith('/agents/agent-mission-1-mission-director/start')) {
        return jsonResponse({})
      }
      if (url.endsWith('/tasks') && init?.method === 'POST') {
        return jsonResponse({
          taskId: body?.taskId,
          input: body?.input,
          status: 'pending',
        })
      }
      if (url.endsWith('/tasks/mission-1:phase-1:selector-2:attempt-1/execute')) {
        return jsonResponse({
          status: 'completed',
          result: { output: '{"taskId":"task-3"}', artifacts: [], tokensUsed: 0 },
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    const runtime = new MissionAgentRuntime({
      missionId: 'mission-1',
      tenantId: 'tenant-1',
      agentRuntimeUrl: 'http://agent-runtime:3400',
    })
    const selected = await runtime.selectNextTask(
      'Complete the full mission',
      selectionPlan,
      selectionPhase,
      ['task-1'],
    )

    expect(selected.id).toBe('task-3')
    const submitted = requests.find(({ url }) => url.endsWith('/tasks'))?.body
    const taskInput = submitted?.input as Record<string, unknown>
    const context = taskInput.context as Record<string, unknown>
    expect(context[BRAIN_ROUTING_SESSION_CONTEXT_KEY]).toBe('mission-1:task-selection:phase-1:2')
    expect(taskInput.prompt).toContain('"id":"task-2"')
    expect(taskInput.prompt).toContain('"id":"task-3"')
    expect(taskInput.prompt).not.toContain('"id":"task-1"')
    expect(taskInput.prompt).toContain('Complete the full mission')
    expect(submitted?.taskId).toBe('mission-1:phase-1:selector-2:attempt-1')
  })

  it('adds at most two follow-up tasks and makes each depend on already planned work', () => {
    const basePlan: Plan = {
      ...plan,
      phases: [{ ...phase, tasks: [{ ...task, dependsOnTaskIds: [] }] }],
    }
    const review = {
      satisfied: false,
      gaps: ['The result needs verification.'],
      followUpTask: {
        title: 'Verify result',
        description: 'Check the result against the mission requirements.',
        agentRole: 'reviewer',
        systemPrompt: 'Verify the result.',
        expectedArtifacts: ['verification.md'],
      },
    }

    const first = applyPhaseReview(basePlan, phase.id, review)
    const second = applyPhaseReview(first.plan, phase.id, review)
    const overLimit = applyPhaseReview(second.plan, phase.id, review)

    expect(first.amendment?.id).toBe('phase-1-amendment-1')
    expect(first.amendment?.dependsOnTaskIds).toEqual(['task-1'])
    expect(second.amendment?.id).toBe('phase-1-amendment-2')
    expect(second.amendment?.dependsOnTaskIds).toEqual(['task-1', 'phase-1-amendment-1'])
    expect(overLimit.amendment).toBeUndefined()
    expect(overLimit.satisfied).toBe(false)
    expect(overLimit.plan.phases[0]?.tasks).toHaveLength(3)
  })

  it('parses satisfied and incomplete phase reviews through a mission Agent', async () => {
    const reviewerAgentId = 'agent-mission-1-phase-reviewer'
    const reviewResponses = [
      { satisfied: true, gaps: [], followUpTask: null },
      {
        satisfied: false,
        gaps: ['The result needs verification.'],
        followUpTask: {
          title: 'Verify result',
          description: 'Check the result against the mission requirements.',
          agentRole: 'reviewer',
          systemPrompt: 'Verify the result.',
          expectedArtifacts: ['verification.md'],
        },
      },
    ]
    const taskRequests: Array<Record<string, unknown>> = []
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined

      if (url.endsWith(`/missions/mission-1/agents/${reviewerAgentId}`) && method === 'GET') {
        return jsonResponse({ ...agent, id: reviewerAgentId })
      }
      if (url.endsWith(`/missions/mission-1/agents/${reviewerAgentId}/start`)) {
        return jsonResponse({})
      }
      if (url.endsWith(`/missions/mission-1/agents/${reviewerAgentId}/tasks`) && method === 'POST') {
        taskRequests.push(body || {})
        return jsonResponse({ taskId: body?.taskId })
      }
      if (url.endsWith('/execute') && method === 'POST') {
        return jsonResponse({
          status: 'completed',
          result: { output: JSON.stringify(reviewResponses.shift()) },
        })
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    const runtime = new MissionAgentRuntime({
      missionId: 'mission-1',
      tenantId: 'tenant-1',
      agentRuntimeUrl: 'http://agent-runtime:3400',
    })
    const summaries = [{ taskId: task.id, output: 'Research complete.', artifactNames: ['research.md'] }]

    await expect(runtime.reviewPhase('Understand the topic', plan, phase, summaries, 1))
      .resolves.toEqual({ satisfied: true, gaps: [] })
    await expect(runtime.reviewPhase('Understand the topic', plan, phase, summaries, 2))
      .resolves.toEqual({
        satisfied: false,
        gaps: ['The result needs verification.'],
        followUpTask: {
          title: 'Verify result',
          description: 'Check the result against the mission requirements.',
          agentRole: 'reviewer',
          systemPrompt: 'Verify the result.',
          expectedArtifacts: ['verification.md'],
        },
      })

    expect(taskRequests).toHaveLength(2)
      const firstTaskInput = taskRequests[0]?.input as { context: Record<string, unknown> }
      const secondTaskInput = taskRequests[1]?.input as { context: Record<string, unknown> }
      expect(firstTaskInput.context[BRAIN_ROUTING_SESSION_CONTEXT_KEY])
        .toBe('mission-1:phase-review:phase-1:1')
      expect(secondTaskInput.context[BRAIN_ROUTING_SESSION_CONTEXT_KEY])
        .toBe('mission-1:phase-review:phase-1:2')
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
