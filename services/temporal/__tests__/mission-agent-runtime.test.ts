import { applyPhaseReview, MissionAgentRuntime } from '../src/agent/MissionAgentRuntime'
import {
  AgentDefinition,
  AgentTask,
  BRAIN_ROUTING_SESSION_CONTEXT_KEY,
  DEFAULT_AGENT_EXECUTION_POLICY,
} from '@stage7-nextgen/shared'
import { Plan, Phase, Task } from '@stage7-nextgen/shared'
import { createCompletedTaskSummary } from '../src/types/workflow'

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
  clarificationAnswers: [],
  phases: [phase],
}

describe('MissionAgentRuntime', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it.each([false, true])('preserves incomplete results and receipts after recovery=%s', async (recover) => {
    const receipt = { toolId: 'email_sender', isError: false, outcome: 'success', content: '{"id":"email-1"}' }
    const completed = {
      taskId: 'mission-1:phase-1:task-1',
      status: 'completed',
      result: { output: 'The other action could not be completed.', incompleteReason: 'Missing SMS receipt.', actionReceipts: [receipt] },
    }
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/execute')) return recover ? jsonResponse({ error: 'Task is already running' }, 500) : jsonResponse(completed)
      if (url.endsWith('/tasks') && init?.method === 'POST') return jsonResponse({ taskId: completed.taskId })
      if (url.endsWith(`/tasks/${completed.taskId}/events`)) {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(`event: task\ndata: ${JSON.stringify(completed)}\n\n`))
            controller.close()
          },
        })
        return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    const runtime = new MissionAgentRuntime({ missionId: 'mission-1', tenantId: 'tenant-1', agentRuntimeUrl: 'http://agent-runtime:3400' })
    const result = await runtime.executePromptTask(agent.id, {
      taskId: completed.taskId,
      type: 'researcher',
      prompt: 'Continue the task.',
    })
    expect(result.incompleteReason).toBe('Missing SMS receipt.')
    expect(result.actionReceipts).toEqual([receipt])
    const receiptArtifact = result.artifacts.find((artifact) => artifact.name === 'system-action-receipts.json')
    expect(receiptArtifact).toBeDefined()
    expect(JSON.parse(receiptArtifact!.content as string)).toEqual([receipt])
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
            artifacts: [
              { name: 'research.md', type: 'text/markdown', content: 'Research complete.' },
              {
                name: 'audio.wav',
                type: 'application/octet-stream',
                mediaType: 'audio/wav',
                contentEncoding: 'base64',
                content: 'AAECAw==',
              },
            ],
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
      'Use the steps already completed; do not repeat actions with side effects.',
      undefined,
      'Research the topic and produce research.md.',
    )

    expect(result.output).toBe('## research.md\nResearch complete.')
    expect(result.tokensUsed).toBe(19)
    expect(result.artifacts[0]?.name).toBe('research.md')
    expect(result.artifacts[0]?.content).toBe('Research complete.')
    expect(result.artifacts[1]).toMatchObject({
      name: 'audio.wav',
      mediaType: 'audio/wav',
      contentEncoding: 'base64',
      content: 'AAECAw==',
    })
    expect(result.artifacts[2]).toEqual({
      name: 'system-action-receipts.json',
      type: 'evidence',
      content: JSON.stringify([{ toolId: 'calculate', isError: false, content: '{"result":42}', outcome: 'success' }]),
      purpose: 'execution-outcome',
      visibility: 'internal',
    })
    expect(result.actionReceipts).toEqual([
      { toolId: 'calculate', isError: false, content: '{"result":42}', outcome: 'success' },
    ])
    expect(createCompletedTaskSummary('task-1', result.output, result.artifacts).artifacts?.[0])
      .toMatchObject({
        name: 'system-action-receipts.json',
        content: JSON.stringify([{ toolId: 'calculate', isError: false, content: '{"result":42}', outcome: 'success' }]),
      })
    expect(createCompletedTaskSummary('task-1', result.output, result.artifacts).artifacts?.[2])
      .toMatchObject({
        name: 'audio.wav',
        content: undefined,
        contentOmitted: true,
        mediaType: 'audio/wav',
      })
    expect(requests.some((request) => request.url.includes('/api/workers/assistants/'))).toBe(false)
    expect(requests.find((request) => request.url.endsWith('/tasks'))?.body?.taskId).toBe('mission-1:phase-1:task-1')
    expect(requests.find((request) => request.url.endsWith('/tasks/mission-1:phase-1:task-1/execute'))?.body)
      .toMatchObject({
        retryGuidance: 'Use the steps already completed; do not repeat actions with side effects.',
      })

    const submittedInput = requests.find((request) => request.url.endsWith('/tasks'))?.body?.input as Record<string, unknown>
    expect(submittedInput.prompt).toContain(`Task Instructions: ${task.systemPrompt}`)
    expect(submittedInput.prompt).toContain('Original mission goal: Research the topic and produce research.md.')
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
        retryGuidance: 'Use the steps already completed; do not repeat actions with side effects.',
      })

    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('parses structured credential questions into resumable mission interruptions', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/tasks')) {
        return jsonResponse({
          agentId: agent.id,
          taskId: 'mission-1:credential-task',
          type: 'researcher',
          input: {},
          priority: 1,
          status: 'pending',
          createdAt: new Date().toISOString(),
        })
      }
      if (url.endsWith('/tasks/mission-1:credential-task/execute')) {
        return jsonResponse({
          taskId: 'mission-1:credential-task',
          status: 'completed',
          result: {
            output: '__ASK_USER__:{"question":"[secret:tool-credentials] Provide the API token.","credentialRequest":{"executionId":"exec-1","toolId":"protected-api","toolName":"Protected API","missingCredentials":[{"key":"apiToken","label":"API token"}]}}',
            actionReceipts: [{
              toolId: 'protected-api',
              isError: true,
              content: 'credential request',
              outcome: 'question_asked',
              actionKey: 'a'.repeat(64),
            }],
          },
        })
      }
      throw new Error(`Unexpected request: ${String(init?.method || 'GET')} ${url}`)
    })
    const runtime = new MissionAgentRuntime({
      missionId: 'mission-1',
      tenantId: 'tenant-1',
      agentRuntimeUrl: 'http://agent-runtime:3400',
    })

    const result = await runtime.executePromptTask(agent.id, {
      taskId: 'mission-1:credential-task',
      type: 'researcher',
      prompt: 'Complete the protected operation.',
      expectedArtifacts: ['must-not-be-required-during-interruption.md'],
    })

    expect(result.interruption).toMatchObject({
      kind: 'user_input',
      question: '[secret:tool-credentials] Provide the API token.',
      credentialRequest: {
        executionId: 'exec-1',
        toolId: 'protected-api',
        toolName: 'Protected API',
      },
    })
    expect(result.output).toContain('__ASK_USER__')
    expect(result.artifacts).toEqual([
      expect.objectContaining({ name: 'system-action-receipts.json', purpose: 'execution-outcome' }),
    ])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('preserves task output when a planned artifact is missing for phase-level recovery', async () => {
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
      .resolves.toEqual(expect.objectContaining({ output: 'Research complete.' }))
  })

  it('reports malformed mission-completion output and retries the structured decision contract', async () => {
    const complaints: Array<{ requestId: string; reason: string; missionId: string }> = []
    const prompts: string[] = []
    const completionOutputs = [
      'No.',
      '{"satisfied":false,"gaps":["concrete unmet requirement"]}',
      '{"satisfied":true,"gaps":[]}',
    ]
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
    expect(completionAttempt).toBe(3)
    expect(submittedTaskIds).toEqual([
      'mission-1:review:completion:retry-5:attempt-1',
      'mission-1:review:completion:retry-5:attempt-2',
      'mission-1:review:completion:retry-5:attempt-3',
    ])
    const completionInput = submittedTask!.input as Record<string, unknown>
    const completionContext = completionInput.context as Record<string, unknown>
    expect(completionContext.executionPolicy).toMatchObject({
      maxBrainCalls: 3,
      maxCompletionTokens: 3_072,
      maxCompletionTokensPerCall: 1_024,
      maxDelegations: 0,
    })
    expect(complaints).toEqual([
      {
        requestId: 'review-1',
        reason: expect.stringContaining('response must be valid JSON'),
        missionId: 'mission-1',
      },
      {
        requestId: 'review-2',
        reason: expect.stringContaining('identify the exact task ID'),
        missionId: 'mission-1',
      },
    ])
    expect(prompts[1]).toContain('Previous response: No.')
    expect(prompts[2]).toContain('Do not return generic gap text')
  })

  it('executes a dependent task and instructs recovery when completed dependency output is unavailable', async () => {
    let submittedPrompt = ''
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'
      if (method === 'POST' && url.endsWith('/tasks')) {
        const body = JSON.parse(String(init?.body || '{}'))
        submittedPrompt = body?.input?.prompt || ''
        return jsonResponse({ taskId: 'agent-task-1', status: 'pending' }, 201)
      }
      if (method === 'POST' && url.endsWith('/tasks/agent-task-1/execute')) {
        return jsonResponse({
          taskId: 'agent-task-1',
          status: 'completed',
          result: { output: 'Recovered missing dependency and completed task.', artifacts: [] },
        }, 200)
      }
      if (method === 'GET' && url.endsWith('/tasks/agent-task-1')) {
        return jsonResponse({
          taskId: 'agent-task-1',
          status: 'completed',
          result: { output: 'Recovered missing dependency and completed task.', artifacts: [] },
        }, 200)
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    const runtime = new MissionAgentRuntime({
      missionId: 'mission-1',
      tenantId: 'tenant-1',
      agentRuntimeUrl: 'http://agent-runtime:3400',
    })

    await expect(runtime.executeTask(
      agent.id,
      { ...task, dependsOnTaskIds: ['missing-source'], expectedArtifacts: [] },
      phase,
      plan,
    )).resolves.toEqual(expect.objectContaining({
      output: 'Recovered missing dependency and completed task.',
    }))

    expect(fetchMock).toHaveBeenCalled()
    expect(submittedPrompt).toContain('missing-source')
    expect(submittedPrompt).toContain('Missing completed dependency results for task ID(s): missing-source')
    expect(submittedPrompt).toContain('Do not treat this as mission failure')
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

    expect(requests.map((request) => request.method)).toEqual(['GET', 'GET', 'POST', 'POST'])
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

  it('receives an already-running persisted Agent task result through its event stream', async () => {
    const executePaths: string[] = []
    const taskStatusPaths: string[] = []
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
      if (url.endsWith(taskPath) && method === 'GET') {
        taskStatusPaths.push(url)
        return jsonResponse(completedTask)
      }
      if (url.endsWith(`${taskPath}/events`)) {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(`event: task\ndata: ${JSON.stringify(completedTask)}\n\n`))
            controller.close()
          },
        })
        return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
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

    expect(result.output).toBe('## research.md\nRecovered from the running task.')
    expect(executePaths).toHaveLength(1)
    expect(taskStatusPaths).toHaveLength(0)
  })

  it('waits for an Agent task notification without requesting task status repeatedly', async () => {
    const taskId = 'mission-1:phase-1:task-1'
    const taskPath = `/missions/mission-1/agents/${agent.id}/tasks/${taskId}`
    const submittedTask: AgentTask = {
      agentId: agent.id,
      taskId,
      type: 'researcher',
      input: {},
      priority: 1,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    const completedTask: AgentTask = {
      ...submittedTask,
      status: 'completed',
      completedAt: new Date().toISOString(),
      result: { output: 'The Agent completed after a notification.', artifacts: [], tokensUsed: 1 },
    }
    const statusRequests: string[] = []
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'
      if (url.endsWith('/tasks') && method === 'POST') return jsonResponse(submittedTask)
      if (url.endsWith(`${taskPath}/execute`)) {
        return jsonResponse({ error: `Agent task ${taskId} is already running` }, 500)
      }
      if (url.endsWith(taskPath) && method === 'GET') {
        statusRequests.push(url)
        return jsonResponse(submittedTask)
      }
      if (url.endsWith(`${taskPath}/events`)) {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            const encoder = new TextEncoder()
            controller.enqueue(encoder.encode(`event: task\ndata: ${JSON.stringify({ ...submittedTask, status: 'running' })}\n\n`))
            setTimeout(() => {
              controller.enqueue(encoder.encode(`event: task\ndata: ${JSON.stringify(completedTask)}\n\n`))
              controller.close()
            }, 10)
          },
        })
        return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    const runtime = new MissionAgentRuntime({
      missionId: 'mission-1',
      tenantId: 'tenant-1',
      agentRuntimeUrl: 'http://agent-runtime:3400',
    })
    const result = await runtime.executePromptTask(agent.id, {
      taskId,
      type: 'researcher',
      prompt: 'Wait for the running Agent task.',
    })

    expect(result.output).toBe('The Agent completed after a notification.')
    expect(statusRequests).toHaveLength(0)
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
      if (url.endsWith(`/tasks/${taskId}/events`)) {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(`event: task\ndata: ${JSON.stringify(failedTask)}\n\n`))
            controller.close()
          },
        })
        return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
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
    expect(statusRequests).toHaveLength(0)
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

  it('uses retry-scoped planner agents and task IDs after a mission retry', async () => {
    const plannerAgent = { ...agent, id: 'agent-mission-retry-planner-retry-2', type: 'planner' }
    const taskId = 'mission-retry:planner:retry-2:attempt-1'
    const requests: Array<{ url: string; method: string; body?: Record<string, unknown> }> = []
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined
      requests.push({ url, method, body })

      if (url.endsWith(`/agents/${plannerAgent.id}`) && method === 'GET') return jsonResponse({}, 404)
      if (url.endsWith('/agents') && method === 'POST') return jsonResponse(plannerAgent, 201)
      if (url.endsWith(`/agents/${plannerAgent.id}/start`)) return jsonResponse({})
      if (url.endsWith('/tasks') && method === 'POST') {
        return jsonResponse({
          agentId: plannerAgent.id,
          taskId: body?.taskId,
          type: body?.type,
          input: body?.input,
          priority: body?.priority,
          status: 'pending',
          createdAt: new Date().toISOString(),
        }, 201)
      }
      if (url.endsWith(`/tasks/${taskId}/execute`)) {
        return jsonResponse({
          agentId: plannerAgent.id,
          taskId,
          type: 'planning',
          input: {},
          priority: 1,
          status: 'completed',
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          result: { output: JSON.stringify(plan), artifacts: [], tokensUsed: 0 },
        })
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })

    const runtime = new MissionAgentRuntime({
      missionId: 'mission-retry',
      tenantId: 'tenant-1',
      metadata: { retryCount: 2 },
      agentRuntimeUrl: 'http://agent-runtime:3400',
    })
    await expect(runtime.generatePlan('Create a plan')).resolves.toMatchObject({
      summary: plan.summary,
    })

    expect(requests.some((request) => request.url.endsWith(`/agents/${plannerAgent.id}`))).toBe(true)
    expect(requests.some((request) => request.url.endsWith(`/tasks/${taskId}/execute`))).toBe(true)
  })

  it('asks the mission Agent to choose only from tasks whose dependencies are complete', async () => {
    const requests: Array<{ url: string; body?: Record<string, unknown> }> = []
    let selectionAttempts = 0
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
      if (url.endsWith('/agents') && init?.method !== 'POST') {
        return jsonResponse({ agents: [] })
      }
      if (url.endsWith('/agents') && init?.method === 'POST') {
        return jsonResponse({ ...agent, id: 'agent-mission-1-mission-director' }, 201)
      }
      if (url.endsWith('/agents/agent-mission-1-mission-director/start')) {
        return jsonResponse({})
      }
      if (url.endsWith('/api/brain/complaint')) {
        return jsonResponse({ recorded: true })
      }
      if (url.endsWith('/tasks') && init?.method === 'POST') {
        return jsonResponse({
          taskId: body?.taskId,
          input: body?.input,
          status: 'pending',
        })
      }
      if (/\/tasks\/mission-1:phase-1:selector-2:attempt-\d+\/execute$/.test(url)) {
        selectionAttempts++
        return jsonResponse({
          status: 'completed',
          result: {
            output: selectionAttempts < 3 ? '{"taskId":"not-ready"}' : '{"taskId":"task-3"}',
            artifacts: [],
            tokensUsed: 0,
            requestId: `selection-${selectionAttempts}`,
          },
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
    expect(selectionAttempts).toBe(3)
    expect(requests.filter(({ url }) => url.endsWith('/tasks')).at(-1)?.body?.taskId)
      .toBe('mission-1:phase-1:selector-2:attempt-3')
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
    expect(catalogVerification.amendment?.requiredActions).toEqual([])
    expect(catalogVerification.amendment?.systemPrompt).toContain(
      'Use the outputs produced by task task-1, including research.md',
    )
  })

  it('leaves tool and action selection to the follow-up agent', () => {
    const applied = applyPhaseReview(plan, phase.id, {
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
    })
    expect(applied.amendment?.requiredActions).toEqual([])
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
          requiredActions: 'verify-sms-status',
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
          systemPrompt: 'Complete all remaining mission requirements including child agent delegation, search_web denial, and calculator error recovery.',
          expectedArtifacts: [],
          requiredActions: [],
        },
      })

    expect(taskRequests).toHaveLength(2)
    const firstTaskInput = taskRequests[0]?.input as { prompt: string; context: Record<string, unknown> }
    const secondTaskInput = taskRequests[1]?.input as { context: Record<string, unknown> }
    expect(firstTaskInput.prompt).toContain('"taskId":"review-summary-0"')
    expect(firstTaskInput.prompt).toContain('"taskId":"review-summary-11"')
    expect(firstTaskInput.prompt).toContain('Judge only actual task outputs and artifacts')
    expect(firstTaskInput.context.executionPolicy).toEqual(expect.objectContaining({
      maxBrainCalls: 4,
      maxActions: 0,
      maxCompletionTokens: 4_096,
      maxCompletionTokensPerCall: 2_048,
      maxDelegations: 0,
    }))
    expect(firstTaskInput.context[BRAIN_ROUTING_SESSION_CONTEXT_KEY])
      .toBe('mission-1:phase-review:phase-1:1')
    expect(secondTaskInput.context[BRAIN_ROUTING_SESSION_CONTEXT_KEY])
      .toBe('mission-1:phase-review:phase-1:2')
    expect(complaints).toHaveLength(0)
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

  it('uses canonical generated Agent IDs in URL paths', async () => {
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
      'http://agent-runtime:3400/api/agent-runtime/missions/mission-1/agents/agent-mission-1-verification-analyst',
      'http://agent-runtime:3400/api/agent-runtime/missions/mission-1/agents',
      'http://agent-runtime:3400/api/agent-runtime/missions/mission-1/agents',
      'http://agent-runtime:3400/api/agent-runtime/missions/mission-1/agents/agent-mission-1-verification-analyst/start',
    ])
  })

  it('reuses an existing agent whose role differs only by an Agent suffix', async () => {
    const alias: AgentDefinition = {
      id: 'agent-mission-1-Execution Agent',
      tenantId: 'tenant-1',
      name: 'Execution Agent Agent',
      description: 'Existing mission executor',
      type: 'Execution Agent',
      systemPrompt: 'Execute mission tasks',
      tools: [],
      metadata: { agentRole: 'Execution Agent' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const requests: string[] = []
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      requests.push(`${init?.method || 'GET'} ${String(input)}`)
      if (init?.method === 'POST') return jsonResponse({ id: alias.id }, 200)
      if (String(input).endsWith('/agents')) return jsonResponse({ agents: [alias] })
      return jsonResponse({ error: 'not found' }, 404)
    })

    const runtime = new MissionAgentRuntime({
      missionId: 'mission-1',
      tenantId: 'tenant-1',
      agentRuntimeUrl: 'http://agent-runtime:3400',
    })

    await expect(runtime.getOrCreateAgent('execution', task.systemPrompt)).resolves.toBe(alias.id)
    expect(requests).toEqual([
      'GET http://agent-runtime:3400/api/agent-runtime/missions/mission-1/agents/agent-mission-1-execution',
      'GET http://agent-runtime:3400/api/agent-runtime/missions/mission-1/agents',
      `POST http://agent-runtime:3400/api/agent-runtime/missions/mission-1/agents/${encodeURIComponent(alias.id)}/start`,
    ])
  })
})
