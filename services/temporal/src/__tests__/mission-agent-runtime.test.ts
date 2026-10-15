import { applyPhaseReview, MissionAgentRuntime } from '../agent/MissionAgentRuntime'
import {
  AgentDefinition,
  AgentTask,
  BRAIN_ROUTING_SESSION_CONTEXT_KEY,
  DEFAULT_AGENT_EXECUTION_POLICY,
} from '@stage7-nextgen/shared'
import { Plan, Phase, Task } from '@stage7-nextgen/shared'
import { createCompletedTaskSummary } from '../types/workflow'

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
  requiredActions: [],
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
            output: '## research.md\nResearch complete.',
            artifacts: [],
            actionReceipts: [{ toolId: 'calculate', isError: false, content: '{"result":42}' }],
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
    const dependencySummary = {
      taskId: 'source-task',
      output: 'The source task calculated 42.',
      artifactNames: ['answer.json'],
      artifacts: [{ name: 'answer.json', type: 'application/json', content: '{"result":42}' }],
    }
    const dependentTask = { ...task, dependsOnTaskIds: ['source-task'] }
    const result = await runtime.executeTask(
      agentId,
      dependentTask,
      phase,
      plan,
      true,
      DEFAULT_AGENT_EXECUTION_POLICY,
      [dependencySummary],
      'Use the existing action receipts; do not repeat completed side effects.',
    )

    expect(result.output).toBe('## research.md\nResearch complete.')
    expect(result.tokensUsed).toBe(19)
    expect(result.artifacts[0]?.name).toBe('research.md')
    expect(result.artifacts[0]?.content).toBe('Research complete.')
    expect(result.artifacts[1]).toEqual({
      name: 'system-action-receipts.json',
      type: 'evidence',
      content: JSON.stringify([{ toolId: 'calculate', isError: false, content: '{"result":42}', outcome: 'success' }]),
    })
    expect(result.actionReceipts).toEqual([
      { toolId: 'calculate', isError: false, content: '{"result":42}', outcome: 'success' },
    ])
    expect(createCompletedTaskSummary('task-1', result.output, result.artifacts).artifacts?.[0])
      .toMatchObject({
        name: 'system-action-receipts.json',
        content: JSON.stringify([{ toolId: 'calculate', isError: false, content: '{"result":42}', outcome: 'success' }]),
      })
    expect(requests.some((request) => request.url.includes('/api/workers/assistants/'))).toBe(false)
    expect(requests.find((request) => request.url.endsWith('/tasks'))?.body?.taskId).toBe('mission-1:phase-1:task-1')
    expect(requests.find((request) => request.url.endsWith('/tasks/mission-1:phase-1:task-1/execute'))?.body)
      .toMatchObject({
        retryGuidance: 'Use the existing action receipts; do not repeat completed side effects.',
      })
    const submittedInput = requests.find((request) => request.url.endsWith('/tasks'))?.body?.input as Record<string, unknown>
    expect(submittedInput.prompt).toContain(`Task Instructions: ${task.systemPrompt}`)
    expect(submittedInput.prompt).toContain('Completed dependency results')
    expect(submittedInput.prompt).toContain('The source task calculated 42.')
    expect(submittedInput.prompt).toContain('answer.json')
    expect(submittedInput.prompt).toContain('Do not return a plan, future-tense promises, or placeholders.')
    expect(
      (requests.find((request) => request.url.endsWith('/tasks'))?.body?.input as Record<string, unknown>)
        ?.context,
    ).toMatchObject({
      executionPolicy: DEFAULT_AGENT_EXECUTION_POLICY,
      [BRAIN_ROUTING_SESSION_CONTEXT_KEY]: 'mission-1:task:phase-1:task-1',
    })
    expect(requests.find((request) => request.url.endsWith('/tasks/mission-1:phase-1:task-1/execute'))?.body)
      .toEqual({
        requireCompletedReceipt: true,
        retryGuidance: 'Use the existing action receipts; do not repeat completed side effects.',
      })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('rejects task output that omits an expected artifact section', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'
      if (url.endsWith(`/missions/mission-1/agents/${agent.id}`) && method === 'GET') {
        return jsonResponse(agent)
      }
      if (url.endsWith(`/missions/mission-1/agents/${agent.id}/start`)) return jsonResponse({})
      if (url.endsWith('/tasks') && method === 'POST') {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        return jsonResponse({
          agentId: agent.id,
          taskId: 'mission-1:phase-1:task-1',
          type: 'researcher',
          input: body.input,
          priority: 1,
          status: 'pending',
          createdAt: new Date().toISOString(),
        })
      }
      if (url.endsWith('/tasks/mission-1:phase-1:task-1/execute')) {
        return jsonResponse({
          agentId: agent.id,
          taskId: 'mission-1:phase-1:task-1',
          type: 'researcher',
          input: {},
          priority: 1,
          status: 'completed',
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          result: { output: 'Research complete.', artifacts: [], tokensUsed: 19 },
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

    await expect(runtime.executeTask(agentId, task, phase, plan))
      .rejects.toThrow('omitted required artifact section(s): research.md')
  })

  it('reports malformed mission-completion output and retries the structured decision contract', async () => {
    const complaints: Array<{ requestId: string; reason: string; missionId: string }> = []
    const prompts: string[] = []
    const completionOutputs = ['No.', '{"satisfied":true,"gaps":[]}']
    const evaluatorAgent: AgentDefinition = {
      ...agent,
      id: 'agent-mission-1-mission-evaluator-retry-5',
      type: 'mission-evaluator',
    }
    let submittedTask: Record<string, unknown> | undefined
    const submittedTaskIds: string[] = []
    let completionAttempt = 0
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'
      if (url.endsWith('/api/brain/complaint')) {
        complaints.push(JSON.parse(String(init?.body)) as {
          requestId: string;
          reason: string;
          missionId: string;
        })
        return jsonResponse({ recorded: true })
      }
      if (url.endsWith(`/missions/mission-1/agents/${evaluatorAgent.id}`) && method === 'GET') {
        return jsonResponse(evaluatorAgent)
      }
      if (url.endsWith(`/missions/mission-1/agents/${evaluatorAgent.id}/start`)) return jsonResponse({})
      if (url.endsWith('/tasks') && method === 'POST') {
        submittedTask = JSON.parse(String(init?.body)) as Record<string, unknown>
        submittedTaskIds.push(String(submittedTask.taskId))
        const bodyInput = submittedTask.input as Record<string, unknown>
        prompts.push(String(bodyInput.prompt))
        return jsonResponse({
          agentId: evaluatorAgent.id,
          taskId: submittedTask.taskId,
          type: 'mission-completion-review',
          input: bodyInput,
          priority: 1,
          status: 'pending',
          createdAt: new Date().toISOString(),
        })
      }
      if (url.endsWith('/execute')) {
        completionAttempt++
        const output = completionOutputs[completionAttempt - 1]
        if (!output) throw new Error('Unexpected additional completion review attempt')
        return jsonResponse({
          agentId: evaluatorAgent.id,
          taskId: submittedTask?.taskId,
          type: 'mission-completion-review',
          input: submittedTask?.input,
          priority: 1,
          status: 'completed',
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          result: { output, artifacts: [], tokensUsed: 10, requestId: `review-${completionAttempt}` },
        })
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    const runtime = new MissionAgentRuntime({
      missionId: 'mission-1',
      tenantId: 'tenant-1',
      metadata: { retryCount: 5 },
      agentRuntimeUrl: 'http://agent-runtime:3400',
    })
    const result = await runtime.reviewMissionCompletion('Calculate 2 + 2.', 'Use calculate.', [{
      taskId: 'task-1',
      output: 'The answer is 4.',
      artifactNames: ['system-action-receipts.json'],
      artifacts: [{
        name: 'system-action-receipts.json',
        type: 'evidence',
        content: '[{"toolId":"calculate","isError":false,"content":"{\\"result\\":4}"}]',
      }],
    }])

    expect(result).toEqual({ satisfied: true, gaps: [] })
    expect(completionAttempt).toBe(2)
    expect(submittedTaskIds).toEqual([
      'mission-1:review:completion:retry-5:attempt-1',
      'mission-1:review:completion:retry-5:attempt-2',
    ])
    const completionInput = submittedTask!.input as Record<string, unknown>
    const completionContext = completionInput.context as Record<string, unknown>
    expect(completionContext.executionPolicy).toMatchObject({
      maxBrainCalls: 2,
      maxCompletionTokens: 1_024,
      maxCompletionTokensPerCall: 512,
    })
    expect(complaints).toEqual([{
      requestId: 'review-1',
      reason: expect.stringContaining('response must be valid JSON'),
      missionId: 'mission-1',
    }])
    expect(prompts[1]).toContain('Previous response: No.')
  })

  it('refuses to execute a dependent task when its completed output is unavailable', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
    const runtime = new MissionAgentRuntime({
      missionId: 'mission-1',
      tenantId: 'tenant-1',
      agentRuntimeUrl: 'http://agent-runtime:3400',
    })

    await expect(runtime.executeTask(
      agent.id,
      { ...task, dependsOnTaskIds: ['missing-source'] },
      phase,
      plan,
    )).rejects.toThrow('completed dependency results are missing for: missing-source')
    expect(fetchMock).not.toHaveBeenCalled()
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

  it('applies validated role-specific tool policies from mission metadata', async () => {
    const requests: Array<{ url: string; method: string; body?: Record<string, unknown> }> = []
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined
      requests.push({ url, method, body })
      if (method === 'GET') return jsonResponse({ error: 'not found' }, 404)
      if (url.endsWith('/agents') && method === 'POST') return jsonResponse(body || {}, 201)
      if (method === 'POST') return jsonResponse({})
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    const runtime = new MissionAgentRuntime({
      missionId: 'mission-1',
      tenantId: 'tenant-1',
      agentRuntimeUrl: 'http://agent-runtime:3400',
      metadata: {
        agentToolPolicies: {
          researcher: { mode: 'allowlist', tools: ['web_search', 'fetch_url'] },
          '*': { mode: 'all' },
        },
      },
    })

    await runtime.getOrCreateAgent('researcher', task.systemPrompt)
    const registered = requests.find((request) =>
      request.method === 'POST' && request.url.endsWith('/missions/mission-1/agents'),
    )?.body
    expect(registered).toMatchObject({
      tools: ['web_search', 'fetch_url'],
      toolPolicy: { mode: 'allowlist' },
      metadata: { missionId: 'mission-1', agentRole: 'researcher' },
    })
  })

  it('retries a failed Agent execution once using the same persisted task ID', async () => {
    const executedPaths: string[] = []
    const completedTask: AgentTask = {
      agentId: agent.id,
      taskId: 'mission-1:phase-1:task-1',
      type: 'researcher',
      input: {},
      priority: 1,
      status: 'completed',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      result: {
        output: '## research.md\nRecovered from the saved checkpoint.',
        artifacts: [],
        tokensUsed: 10,
      },
    }
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'
      if (url.endsWith(`/missions/mission-1/agents/${agent.id}`) && method === 'GET') {
        return jsonResponse(agent)
      }
      if (url.endsWith(`/missions/mission-1/agents/${agent.id}/start`)) return jsonResponse({})
      if (url.endsWith('/tasks') && method === 'POST') {
        return jsonResponse({
          ...completedTask,
          status: 'pending',
          result: undefined,
          completedAt: undefined,
          input: (JSON.parse(String(init?.body)) as Record<string, unknown>).input,
        })
      }
      if (url.endsWith('/tasks/mission-1:phase-1:task-1/execute')) {
        executedPaths.push(url)
        return executedPaths.length === 1
          ? jsonResponse({ error: 'Brain temporarily unavailable' }, 503)
          : jsonResponse(completedTask)
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    const runtime = new MissionAgentRuntime({
      missionId: 'mission-1',
      tenantId: 'tenant-1',
      agentRuntimeUrl: 'http://agent-runtime:3400',
    })
    const agentId = await runtime.getOrCreateAgent('researcher', task.systemPrompt)
    const result = await runtime.executeTask(agentId, task, phase, plan)

    expect(result.output).toBe('## research.md\nRecovered from the saved checkpoint.')
    expect(executedPaths).toHaveLength(2)
    expect(executedPaths[0]).toBe(executedPaths[1])
  })

  it('waits for an already-running persisted Agent task instead of executing it a second time', async () => {
    const executePaths: string[] = []
    const taskPath = `/missions/mission-1/agents/${agent.id}/tasks/mission-1:phase-1:task-1`
    const completedTask: AgentTask = {
      agentId: agent.id,
      taskId: 'mission-1:phase-1:task-1',
      type: 'researcher',
      input: {
        context: { expectedArtifacts: ['research.md'] },
      },
      priority: 1,
      status: 'completed',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      result: {
        output: '## research.md\nRecovered from the running task.',
        artifacts: [],
        tokensUsed: 10,
      },
    }
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'
      if (url.endsWith(`/missions/mission-1/agents/${agent.id}`) && method === 'GET') {
        return jsonResponse(agent)
      }
      if (url.endsWith(`/missions/mission-1/agents/${agent.id}/start`)) return jsonResponse({})
      if (url.endsWith('/tasks') && method === 'POST') {
        return jsonResponse({
          ...completedTask,
          status: 'pending',
          result: undefined,
          completedAt: undefined,
          input: (JSON.parse(String(init?.body)) as Record<string, unknown>).input,
        })
      }
      if (url.endsWith('/tasks/mission-1:phase-1:task-1/execute')) {
        executePaths.push(url)
        return jsonResponse({ error: 'Agent task mission-1:phase-1:task-1 is already running' }, 500)
      }
      if (url.endsWith(taskPath) && method === 'GET') return jsonResponse(completedTask)
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    const runtime = new MissionAgentRuntime({
      missionId: 'mission-1',
      tenantId: 'tenant-1',
      agentRuntimeUrl: 'http://agent-runtime:3400',
    })
    const agentId = await runtime.getOrCreateAgent('researcher', task.systemPrompt)
    const result = await runtime.executeTask(agentId, task, phase, plan)

    expect(result.output).toBe('## research.md\nRecovered from the running task.')
    expect(executePaths).toHaveLength(1)
  })

  it('fails immediately when an already-running persisted Agent task reports a failure', async () => {
    const taskId = 'mission-1:phase-1:task-1'
    const submittedTask: AgentTask = {
      agentId: agent.id,
      taskId,
      type: 'researcher',
      input: {},
      priority: 1,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    const failedTask: AgentTask = {
      ...submittedTask,
      status: 'failed',
      error: 'fetch failed',
      completedAt: new Date().toISOString(),
    }
    const statusRequests: string[] = []
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'
      if (url.endsWith('/tasks') && method === 'POST') return jsonResponse(submittedTask)
      if (url.endsWith(`/tasks/${taskId}/execute`)) {
        return jsonResponse({ error: `Agent task ${taskId} is already running` }, 500)
      }
      if (url.endsWith(`/tasks/${taskId}`) && method === 'GET') {
        statusRequests.push(url)
        return jsonResponse(failedTask)
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    const runtime = new MissionAgentRuntime({
      missionId: 'mission-1',
      tenantId: 'tenant-1',
      agentRuntimeUrl: 'http://agent-runtime:3400',
    })

    await expect(runtime.executePromptTask(agent.id, {
      taskId,
      type: 'researcher',
      prompt: 'Resume the persisted Agent task.',
    })).rejects.toThrow('fetch failed')
    expect(statusRequests).toHaveLength(1)
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

  it('keeps adding follow-up tasks while gaps remain, without an amendment or phase-size cap', () => {
    const baseTasks = Array.from({ length: 8 }, (_, index) => ({
      ...task,
      id: `task-${index + 1}`,
      title: `Existing task ${index + 1}`,
      dependsOnTaskIds: index === 0 ? [] : [`task-${index}`],
      status: 'completed' as const,
    }))
    const basePlan: Plan = {
      ...plan,
      phases: [{ ...phase, tasks: baseTasks }],
    }
    let amendedPlan = basePlan

    for (let index = 1; index <= 10; index++) {
      const currentPhase = amendedPlan.phases[0]!
      const applied = applyPhaseReview(amendedPlan, phase.id, {
        satisfied: false,
        gaps: [`The result needs verification ${index}.`],
        followUpTask: {
          title: `Verify result ${index}`,
          description: `Check the result against requirement ${index}.`,
          agentRole: 'reviewer',
          systemPrompt: `Use the completed outputs from ${currentPhase.tasks.map((item) => item.id).join(', ')} to verify result ${index}.`,
          expectedArtifacts: Array.from({ length: 6 }, (_, artifactIndex) =>
            `verification-${index}-${artifactIndex}.md`,
          ),
          requiredActions: [],
        },
      })

      expect(applied.amendment?.id).toBe(`phase-1-amendment-${index}`)
      expect(applied.amendment?.dependsOnTaskIds).toEqual(currentPhase.tasks.map((item) => item.id))
      for (const existingTask of currentPhase.tasks) {
        expect(applied.amendment?.systemPrompt).toContain(
          `Use the outputs produced by task ${existingTask.id}`,
        )
      }
      expect(applied.amendment?.expectedArtifacts).toHaveLength(6)
      amendedPlan = applied.plan
    }

    expect(amendedPlan.phases[0]?.tasks).toHaveLength(18)
  })

  it('does not append an identical follow-up task more than once', () => {
    const followUpTask = {
      title: 'Complete the market assessment',
      description: 'Choose an AI business opportunity from the completed research.',
      agentRole: 'reviewer',
      systemPrompt: 'Select one opportunity using the output from task-1 and explain the evidence.',
      expectedArtifacts: ['market-assessment.md'],
      requiredActions: [],
    }
    const review = {
      satisfied: false,
      gaps: ['The phase still lacks a selected opportunity.'],
      followUpTask,
    }
    const first = applyPhaseReview(plan, phase.id, review)
    const repeated = applyPhaseReview(first.plan, phase.id, {
      ...review,
      followUpTask: {
        ...followUpTask,
        title: '  COMPLETE   the market assessment ',
        description: 'Choose an AI business opportunity\nfrom the completed research.',
        systemPrompt: 'Use the output from task-1 to choose the same opportunity.',
        expectedArtifacts: ['MARKET-ASSESSMENT.MD'],
        requiredActions: [],
      },
    })

    expect(first.amendment?.id).toBe('phase-1-amendment-1')
    expect(repeated.amendment).toBeUndefined()
    expect(repeated.plan).toBe(first.plan)
    expect(repeated.phase.tasks).toHaveLength(2)
    expect(repeated.gaps).toContain(
      'Reviewer repeated existing task "Complete the market assessment"; no new task was added.',
    )
  })

  it('blocks repeated successful side effects but permits a read-only catalog verification', () => {
    const completedPlan: Plan = {
      ...plan,
      phases: [{
        ...phase,
        tasks: [{
          ...task,
          status: 'completed',
          requiredActions: [{ toolId: '__create_tool', outcome: 'success' }],
        }],
      }],
    }
    const repeatedCreation = applyPhaseReview(completedPlan, phase.id, {
      satisfied: false,
      gaps: ['The catalog result needs verification.'],
      followUpTask: {
        title: 'Create another plugin',
        description: 'Create a replacement plugin.',
        agentRole: 'plugin-developer',
        systemPrompt: 'Call __create_tool to create the replacement.',
        expectedArtifacts: [],
        requiredActions: [{ toolId: '__create_tool', outcome: 'success' }],
      },
    })
    const catalogVerification = applyPhaseReview(completedPlan, phase.id, {
      satisfied: false,
      gaps: ['The catalog result needs verification.'],
      followUpTask: {
        title: 'Verify the plugin catalog',
        description: 'Read the catalog to verify the requested plugin schema.',
        agentRole: 'plugin-developer',
        systemPrompt: 'Call __list_tools to verify the requested plugin schema.',
        expectedArtifacts: ['plugin_verification_result'],
        requiredActions: [{ toolId: '__list_tools', outcome: 'success' }],
      },
    })

    expect(repeatedCreation.amendment).toBeUndefined()
    expect(repeatedCreation.gaps).toContain(
      'Reviewer proposed repeating successful side-effect action "__create_tool"; no new task was added.',
    )
    expect(catalogVerification.amendment?.requiredActions).toEqual([
      { toolId: '__list_tools', outcome: 'success' },
    ])
    expect(catalogVerification.amendment?.systemPrompt).toContain(
      'Use the outputs produced by task task-1, including research.md',
    )
  })

  it('rejects follow-up tasks that do not require receipts for explicit actions', () => {
    expect(() => applyPhaseReview(plan, phase.id, {
      satisfied: false,
      gaps: ['A child calculation is missing.'],
      followUpTask: {
        title: 'Delegate the calculation',
        description: 'Ask a child Agent to calculate 29 times 41.',
        agentRole: 'delegation-agent',
        systemPrompt: 'Please delegate to a child Agent to calculate 29 times 41 using the calculate tool.',
        expectedArtifacts: [],
        requiredActions: [{ toolId: 'delegate', outcome: 'success' }],
      },
    })).toThrow('Phase reviewer proposed an invalid follow-up task')
  })

  it('parses satisfied and incomplete phase reviews through a mission Agent', async () => {
    const reviewerAgentId = 'agent-mission-1-phase-reviewer'
    const reviewResponses = [
      { satisfied: true, gaps: [], followUpTask: null },
      {
        satisfied: false,
        gaps: ['The result needs verification.'],
        followUpTask: {
          title: 'Complete remaining mission actions',
          description: 'Delegate a child calculation, attempt the denied search, and recover from a calculator error.',
          agentRole: 'mission-agent',
          systemPrompt: 'Complete all remaining mission requirements including child agent delegation, search_web denial, and calculator error recovery.',
          expectedArtifacts: [],
          requiredActions: [
            { toolId: 'delegate', outcome: 'success' },
            { toolId: 'calculate', outcome: 'success' },
            { toolId: 'search_web', outcome: 'denied' },
          ],
        },
      },
      {
        satisfied: false,
        gaps: ['The result needs verification.'],
        followUpTask: {
          title: 'Complete remaining mission actions',
          description: 'Delegate a child calculation, attempt the denied search, and recover from a calculator error.',
          agentRole: 'mission-agent',
          systemPrompt: 'Please delegate to a child agent to compute 29*41 using the calculate tool. Attempt the search_web tool to observe its policy denial. Use calculate with invalid expression 2* to record failure, then use calculate with 2+2 to record successful recovery.',
          expectedArtifacts: [],
          requiredActions: [
            { toolId: '__delegate', outcome: 'success' },
            { toolId: 'calculate', outcome: 'failure' },
            { toolId: 'calculate', outcome: 'success' },
            { toolId: 'search_web', outcome: 'denied' },
          ],
        },
      },
    ]
    const taskRequests: Array<Record<string, unknown>> = []
    const complaints: Array<Record<string, unknown>> = []
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
        const response = reviewResponses.shift()
        return jsonResponse({
          status: 'completed',
          result: { output: JSON.stringify(response), requestId: `review-${reviewResponses.length}` },
        })
      }
      if (url.endsWith('/api/brain/complaint') && method === 'POST') {
        complaints.push(body || {})
        return jsonResponse({ recorded: true })
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    const runtime = new MissionAgentRuntime({
      missionId: 'mission-1',
      tenantId: 'tenant-1',
      agentRuntimeUrl: 'http://agent-runtime:3400',
    })
    const summaries = Array.from({ length: 12 }, (_, index) => ({
      taskId: `review-summary-${index}`,
      output: `Research complete ${index}.`,
      artifactNames: [`research-${index}.md`],
    }))

    await expect(runtime.reviewPhase('Understand the topic', plan, phase, summaries, 1))
      .resolves.toEqual({ satisfied: true, gaps: [] })
    await expect(runtime.reviewPhase('Understand the topic', plan, phase, summaries, 2))
      .resolves.toEqual({
        satisfied: false,
        gaps: ['The result needs verification.'],
        followUpTask: {
          title: 'Complete remaining mission actions',
          description: 'Delegate a child calculation, attempt the denied search, and recover from a calculator error.',
          agentRole: 'mission-agent',
          systemPrompt: 'Please delegate to a child agent to compute 29*41 using the calculate tool. Attempt the search_web tool to observe its policy denial. Use calculate with invalid expression 2* to record failure, then use calculate with 2+2 to record successful recovery.',
          expectedArtifacts: [],
          requiredActions: [
            { toolId: '__delegate', outcome: 'success' },
            { toolId: 'calculate', outcome: 'failure' },
            { toolId: 'calculate', outcome: 'success' },
            { toolId: 'search_web', outcome: 'denied' },
          ],
        },
      })

    expect(taskRequests).toHaveLength(3)
    const firstTaskInput = taskRequests[0]?.input as { prompt: string; context: Record<string, unknown> }
    const secondTaskInput = taskRequests[1]?.input as { context: Record<string, unknown> }
    const repairTaskInput = taskRequests[2]?.input as { prompt: string; context: Record<string, unknown> }
    expect(firstTaskInput.prompt).toContain('"taskId":"review-summary-0"')
    expect(firstTaskInput.prompt).toContain('"taskId":"review-summary-11"')
    expect(firstTaskInput.prompt).toContain('Judge only actual task outputs and artifacts')
    expect(firstTaskInput.context.executionPolicy).toEqual(expect.objectContaining({
      maxBrainCalls: 2,
      maxActions: 0,
      maxCompletionTokens: 2_048,
      maxCompletionTokensPerCall: 1_024,
    }))
    expect(firstTaskInput.context[BRAIN_ROUTING_SESSION_CONTEXT_KEY])
      .toBe('mission-1:phase-review:phase-1:1')
    expect(secondTaskInput.context[BRAIN_ROUTING_SESSION_CONTEXT_KEY])
      .toBe('mission-1:phase-review:phase-1:2')
    expect(repairTaskInput.prompt).toContain('followUpTask action contract is invalid')
    expect(complaints).toHaveLength(1)
    expect(complaints[0]).toEqual(expect.objectContaining({
      requestId: 'review-1',
      reason: expect.stringContaining('Mission phase-review validation failed'),
      missionId: 'mission-1',
    }))
  })

  it('uses retry-scoped phase-review task and routing IDs', async () => {
    const reviewerAgentId = 'agent-mission-1-phase-reviewer'
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
          result: { output: JSON.stringify({ satisfied: true, gaps: [] }), requestId: 'review-retry' },
        })
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })
    const runtime = new MissionAgentRuntime({
      missionId: 'mission-1',
      tenantId: 'tenant-1',
      metadata: { retryCount: 4 },
      agentRuntimeUrl: 'http://agent-runtime:3400',
    })

    await expect(runtime.reviewPhase('Understand the topic', plan, phase, [], 1))
      .resolves.toEqual({ satisfied: true, gaps: [] })

    expect(taskRequests[0]?.taskId).toBe('mission-1:phase-1:review-1:retry-4:attempt-1')
    const reviewInput = taskRequests[0]?.input as { context: Record<string, unknown> }
    expect(reviewInput.context[BRAIN_ROUTING_SESSION_CONTEXT_KEY])
      .toBe('mission-1:phase-review:phase-1:1:retry-4')
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

  it('encodes generated Agent IDs as URL path segments', async () => {
    const requests: string[] = []
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      requests.push(String(input))
      return init?.method !== 'POST'
        ? jsonResponse({ error: 'not found' }, 404)
        : jsonResponse({ id: 'created' }, 201)
    })

    const runtime = new MissionAgentRuntime({
      missionId: 'mission-1',
      tenantId: 'tenant-1',
      agentRuntimeUrl: 'http://agent-runtime:3400',
    })

    await runtime.getOrCreateAgent('verification analyst', task.systemPrompt)

    expect(requests).toEqual([
      'http://agent-runtime:3400/api/agent-runtime/missions/mission-1/agents/agent-mission-1-verification%20analyst',
      'http://agent-runtime:3400/api/agent-runtime/missions/mission-1/agents',
      'http://agent-runtime:3400/api/agent-runtime/missions/mission-1/agents/agent-mission-1-verification%20analyst/start',
    ])
  })
})
