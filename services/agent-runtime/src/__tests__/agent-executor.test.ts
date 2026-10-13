import { AgentDefinition, AgentExecutionPolicy, AgentTask, DEFAULT_AGENT_EXECUTION_POLICY } from '../types'
import { AgentExecutionCheckpoint, AgentExecutor } from '../services/AgentExecutor'
import { AgentRuntime } from '../services/AgentRuntime'
import { PersistentAgentRuntime } from '../services/PersistentAgentRuntime'
import { ArtifactsService } from '@stage7-nextgen/artifacts'
import {
  BRAIN_MODEL_SELECTION_RETRY,
  BRAIN_ROUTING_SESSION_CONTEXT_KEY,
} from '@stage7-nextgen/shared'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response
}

const definition: AgentDefinition = {
  id: 'mission-agent',
  tenantId: 'tenant-1',
  name: 'Mission Agent',
  description: 'Mission-scoped agent',
  type: 'worker',
  systemPrompt: 'ROOT_AGENT',
  tools: [],
  metadata: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

function task(taskId = 'mission-1:phase-1:task-1'): Omit<AgentTask, 'agentId' | 'createdAt'> {
  return {
    taskId,
    type: 'research',
    input: { prompt: 'Complete the goal', context: {} },
    priority: 1,
    status: 'pending',
  }
}

describe('AgentExecutor', () => {
  it('bounds Brain request time and surfaces a recoverable task error', async () => {
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) return jsonResponse({ tools: [] })
      if (url.endsWith('/api/brain/complete')) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('request aborted')), { once: true })
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    }

    await expect(new AgentExecutor({ fetcher, brainRequestTimeoutMs: 1_000 }).execute(
      definition,
      task() as AgentTask,
      { missionId: 'mission-1', delegationDepth: 0 },
    )).rejects.toThrow('Brain request timed out after 1000ms')
  })

  it('resumes after a persisted tool result without executing that action again', async () => {
    let checkpoint: AgentExecutionCheckpoint | undefined
    let toolExecutions = 0
    let brainTurn = 0
    const fetcher: typeof fetch = async (input) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) {
        return jsonResponse({
          tools: [{ id: 'lookup', name: 'Lookup', description: 'Look up data', type: 'code' }],
        })
      }
      if (url.endsWith('/api/brain/complete')) {
        brainTurn++
        return jsonResponse({
          content: brainTurn === 1
            ? '{"tool":"lookup","args":{"query":"status"}}'
            : 'The lookup result is confirmed.',
          tokensUsed: 5,
        })
      }
      if (url.endsWith('/api/tool-executor/tools/execute')) {
        toolExecutions++
        return jsonResponse({ status: 'completed', output: { status: 'ready' } })
      }
      throw new Error(`Unexpected request: ${url}`)
    }
    const firstRun = new AgentExecutor({ fetcher })

    await expect(firstRun.execute(definition, task() as AgentTask, {
      missionId: 'mission-1',
      delegationDepth: 0,
      saveCheckpoint: async (saved) => {
        checkpoint = saved
        if (saved.history.some((message) => message.content.includes('Action result:'))) {
          throw new Error('simulated process interruption')
        }
      },
    })).rejects.toThrow('simulated process interruption')

    expect(checkpoint?.pendingAction).toBeUndefined()
    expect(checkpoint?.history.at(-1)?.content).toContain('Action result:')
    expect(toolExecutions).toBe(1)

    const resumed = await new AgentExecutor({
      fetcher: async (input, init) => {
        const url = String(input)
        if (url.endsWith('/api/tool-executor/tools')) {
          return jsonResponse({
            tools: [{ id: 'lookup', name: 'Lookup', description: 'Look up data', type: 'code' }],
          })
        }
        if (url.endsWith('/api/brain/complete')) {
          const request = JSON.parse(String(init?.body)) as { prompt: string }
          expect(request.prompt).toContain('Action result: {"status":"ready"}')
          return jsonResponse({ content: 'The lookup result is confirmed.', tokensUsed: 4 })
        }
        if (url.endsWith('/api/tool-executor/tools/execute')) {
          toolExecutions++
          return jsonResponse({ status: 'completed', output: { status: 'ready' } })
        }
        throw new Error(`Unexpected request: ${url}`)
      },
    }).execute(definition, task() as AgentTask, {
      missionId: 'mission-1',
      delegationDepth: 0,
      resumeCheckpoint: checkpoint,
    })

    expect(resumed.output).toBe('The lookup result is confirmed.')
    expect(resumed.toolCalls).toBe(1)
    expect(toolExecutions).toBe(1)
  })

  it('fails closed when a checkpoint contains an action without a persisted result', async () => {
    const fetcher = jest.fn() as typeof fetch
    const checkpoint: AgentExecutionCheckpoint = {
      version: 1,
      history: [{ role: 'user', content: 'do the task' }],
      tokensUsed: 0,
      toolCalls: 1,
      brainCalls: 1,
      completionTokensReserved: 1,
      delegations: 0,
      lastAction: 'write:{"value":1}',
      repeatedActionCount: 0,
      pendingAction: 'write:{"value":1}',
    }

    await expect(new AgentExecutor({ fetcher }).execute(definition, task() as AgentTask, {
      missionId: 'mission-1',
      delegationDepth: 0,
      resumeCheckpoint: checkpoint,
    })).rejects.toThrow('refusing to replay it')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('keeps legacy pending delegation checkpoints fail-closed', async () => {
    const args = { goal: 'Find two relevant sources', role: 'researcher' }
    const signature = `__delegate:${JSON.stringify(args)}`
    const checkpoint: AgentExecutionCheckpoint = {
      version: 1,
      history: [
        { role: 'user', content: 'do the task' },
        { role: 'assistant', content: JSON.stringify({ tool: '__delegate', args }) },
      ],
      tokensUsed: 0,
      toolCalls: 1,
      brainCalls: 1,
      completionTokensReserved: 1,
      delegations: 1,
      lastAction: signature,
      repeatedActionCount: 0,
      pendingAction: signature,
    }
    const delegate = jest.fn(async () => 'child result')
    const fetcher = jest.fn() as typeof fetch

    await expect(new AgentExecutor({ fetcher }).execute(definition, task() as AgentTask, {
      missionId: 'mission-1',
      delegationDepth: 0,
      resumeCheckpoint: checkpoint,
      delegate,
    })).rejects.toThrow('refusing to replay it')
    expect(delegate).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('uses a live global tool catalog and can request, discover, and use a generated tool', async () => {
    const calls: Array<{ url: string; body?: Record<string, unknown> }> = []
    let toolRegistered = false
    let brainTurn = 0
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined
      calls.push({ url, body })

      if (url.endsWith('/api/brain/complete')) {
        brainTurn++
        const contents = [
          '{"tool":"__create_tool","args":{"description":"Convert a distance to a taxi fare","requirements":["distance"]}}',
          '{"tool":"mission_taxi_fare","args":{"distance":10}}',
          'The generated tool returned the fare.',
        ]
        return jsonResponse({ content: contents[brainTurn - 1], tokensUsed: 7 })
      }

      if (url.endsWith('/api/tool-executor/tools') && init?.method !== 'POST') {
        return jsonResponse({
          tools: toolRegistered
            ? [{ id: 'mission_taxi_fare', name: 'Mission Taxi Fare', description: 'Calculate taxi fare', type: 'code' }]
            : [],
        })
      }

      if (url.endsWith('/api/tool-executor/plugins/generate')) {
        toolRegistered = true
        return jsonResponse({
          success: true,
          tool: { id: 'mission_taxi_fare', name: 'Mission Taxi Fare', manifest: {} },
        }, 201)
      }

      if (url.endsWith('/api/tool-executor/tools/execute')) {
        expect(body?.id).toBe('mission_taxi_fare')
        expect(body?.agentId).toBe(definition.id)
        return jsonResponse({ status: 'completed', output: { fare: 23 } })
      }

      throw new Error(`Unexpected request: ${url}`)
    }

    const executor = new AgentExecutor({ fetcher })
    const result = await executor.execute(definition, task() as AgentTask, {
      missionId: 'mission-1',
      delegationDepth: 0,
    })

    expect(result.output).toBe('The generated tool returned the fare.')
    expect(result.tokensUsed).toBe(21)
    expect(result.toolCalls).toBe(2)
    expect(calls.some((call) => call.url.endsWith('/api/tool-executor/plugins/generate'))).toBe(true)
    expect(calls.some((call) => call.url.endsWith('/api/tool-executor/tools/execute'))).toBe(true)
    expect(calls.filter((call) => call.url.endsWith('/api/brain/complete'))
      .every((call) => !Object.prototype.hasOwnProperty.call(call.body, 'model'))).toBe(true)
  })

  it('restricts tool visibility and execution to an Agent allowlist', async () => {
    const calls: Array<{ url: string; body?: Record<string, unknown> }> = []
    const prompts: string[] = []
    let brainTurn = 0
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined
      calls.push({ url, body })

      if (url.endsWith('/api/tool-executor/tools')) {
        return jsonResponse({
          tools: [
            { id: 'allowed-tool', name: 'Allowed Tool', description: 'Allowed', type: 'code' },
            { id: 'blocked-tool', name: 'Blocked Tool', description: 'Blocked', type: 'code' },
          ],
        })
      }
      if (url.endsWith('/api/brain/complete')) {
        prompts.push(String(body?.systemPrompt))
        brainTurn++
        const responses = [
          '{"tool":"blocked-tool","args":{}}',
          '{"tool":"__create_tool","args":{"description":"Create a tool","requirements":[]}}',
          'I can continue without requesting unauthorized tools.',
        ]
        return jsonResponse({ content: responses[brainTurn - 1] })
      }
      throw new Error(`Unexpected request: ${url}`)
    }
    const restrictedAgent: AgentDefinition = {
      ...definition,
      tools: ['allowed-tool'],
      toolPolicy: { mode: 'allowlist' },
    }

    const result = await new AgentExecutor({ fetcher }).execute(
      restrictedAgent,
      task() as AgentTask,
      { missionId: 'mission-1', delegationDepth: 0 },
    )

    expect(result.output).toContain('without requesting unauthorized tools')
    expect(prompts[0]).toContain('allowed-tool')
    expect(prompts[0]).not.toContain('blocked-tool')
    expect(prompts[0]).toContain('Tool creation is disabled')
    expect(calls.some((call) => call.url.endsWith('/api/tool-executor/tools/execute'))).toBe(false)
    expect(calls.some((call) => call.url.endsWith('/api/tool-executor/plugins/generate'))).toBe(false)
  })

  it('lets an allowlisted Agent use a registered generated tool without granting other tools', async () => {
    const calls: Array<{ url: string; body?: Record<string, unknown> }> = []
    const prompts: string[] = []
    let brainTurn = 0
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined
      calls.push({ url, body })

      if (url.endsWith('/api/tool-executor/tools')) {
        return jsonResponse({
          tools: [
            { id: 'registered-generated-tool', name: 'Generated Tool', description: 'Calculate a fare', type: 'code' },
            { id: 'unapproved-tool', name: 'Unapproved Tool', description: 'Not granted', type: 'code' },
          ],
        })
      }
      if (url.endsWith('/api/brain/complete')) {
        prompts.push(String(body?.systemPrompt))
        brainTurn++
        return jsonResponse({
          content: brainTurn === 1
            ? '{"tool":"registered-generated-tool","args":{"distance":10}}'
            : 'The registered generated tool completed the task.',
        })
      }
      if (url.endsWith('/api/tool-executor/tools/execute')) {
        expect(body?.id).toBe('registered-generated-tool')
        expect(body?.agentId).toBe(definition.id)
        return jsonResponse({ status: 'completed', output: { fare: 23 } })
      }
      throw new Error(`Unexpected request: ${url}`)
    }

    const restrictedAgent: AgentDefinition = {
      ...definition,
      tools: ['registered-generated-tool'],
      toolPolicy: { mode: 'allowlist' },
    }
    const result = await new AgentExecutor({ fetcher }).execute(
      restrictedAgent,
      task() as AgentTask,
      { missionId: 'mission-1', delegationDepth: 0 },
    )

    expect(result.output).toContain('registered generated tool completed')
    expect(prompts[0]).toContain('registered-generated-tool')
    expect(prompts[0]).not.toContain('unapproved-tool')
    expect(calls.filter((call) => call.url.endsWith('/api/tool-executor/tools/execute'))).toHaveLength(1)
    expect(calls.some((call) => call.url.endsWith('/api/tool-executor/plugins/generate'))).toBe(false)
  })

  it('keeps a large live tool catalog below Brain request limits', async () => {
    let brainRequest = ''
    const largeToolCatalog = Array.from({ length: 170 }, (_, index) => ({
      id: `system-tool-${index}`,
      name: `System Tool ${index}`,
      description: `Tool ${index} ${'description '.repeat(30)}`,
      type: 'code',
      inputSchema: {
        type: 'object',
        required: ['payload'],
        properties: { payload: { type: 'string', description: 'large-schema '.repeat(1000) } },
      },
    }))
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) return jsonResponse({ tools: largeToolCatalog })
      if (url.endsWith('/api/brain/complete')) {
        brainRequest = String(init?.body)
        return jsonResponse({ content: 'Completed using the compact tool catalog.' })
      }
      throw new Error(`Unexpected request: ${url}`)
    }

    const result = await new AgentExecutor({ fetcher }).execute(definition, task() as AgentTask, {
      missionId: 'mission-1',
      delegationDepth: 0,
    })

    expect(result.output).toBe('Completed using the compact tool catalog.')
    expect(Buffer.byteLength(brainRequest)).toBeLessThan(96 * 1024)
    expect(brainRequest).toContain('system-tool-0')
    expect(brainRequest).toContain('system-tool-169')
    expect(brainRequest).toContain('payload:string!')
    expect(brainRequest).not.toContain('large-schema')
  })

  it('forwards the Brain routing session without requesting a model and preserves retry codes', async () => {
    let brainRequest: Record<string, unknown> | undefined
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) return jsonResponse({ tools: [] })
      if (url.endsWith('/api/brain/complete')) {
        brainRequest = JSON.parse(String(init?.body)) as Record<string, unknown>
        return jsonResponse({
          success: false,
          error: 'Brain has untried eligible models',
          statusCode: 503,
          details: { code: BRAIN_MODEL_SELECTION_RETRY },
        }, 503)
      }
      throw new Error(`Unexpected request: ${url}`)
    }
    const plannerTask = {
      ...task(),
      agentId: 'planner-agent',
      createdAt: new Date().toISOString(),
      input: {
        prompt: 'Repair the plan',
        context: { [BRAIN_ROUTING_SESSION_CONTEXT_KEY]: 'mission-1:planner' },
      },
    } as AgentTask

    await expect(new AgentExecutor({ fetcher }).execute(definition, plannerTask, {
      missionId: 'mission-1',
      delegationDepth: 0,
    })).rejects.toThrow(`${BRAIN_MODEL_SELECTION_RETRY}: Brain has untried eligible models`)

    expect(brainRequest?.routingSessionId).toBe('mission-1:planner')
    expect(brainRequest).not.toHaveProperty('model')
  })

  it('executes an agent-owned delegation and returns the child result to the parent', async () => {
    const brainCalls: Array<{ systemPrompt: string; prompt: string }> = []
    let parentTurn = 0
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) return jsonResponse({ tools: [] })
      if (!url.endsWith('/api/brain/complete')) throw new Error(`Unexpected request: ${url}`)

      const body = JSON.parse(String(init?.body)) as { systemPrompt: string; prompt: string }
      brainCalls.push(body)
      if (body.systemPrompt.includes('ROOT_AGENT')) {
        parentTurn++
        return jsonResponse({
          content: parentTurn === 1
            ? '{"tool":"__delegate","args":{"goal":"Find two relevant sources","role":"researcher"}}'
            : 'The child research is complete.',
        })
      }
      return jsonResponse({ content: 'I found two relevant sources.' })
    }

    const restrictedDefinition: AgentDefinition = {
      ...definition,
      tools: ['lookup'],
      toolPolicy: { mode: 'allowlist' },
    }
    const runtime = new AgentRuntime(new AgentExecutor({ fetcher }))
    const executionPolicy: AgentExecutionPolicy = {
      ...DEFAULT_AGENT_EXECUTION_POLICY,
      maxBrainCalls: 5,
      maxCompletionTokens: 8192,
    }
    runtime.registerAgentForMission('mission-1', restrictedDefinition)
    runtime.startAgent(restrictedDefinition.id, 'mission-1')
    const submitted = runtime.submitTask(restrictedDefinition.id, {
      ...task(),
      input: {
        prompt: 'Complete the goal',
        context: { executionPolicy },
      },
    })
    const completed = await runtime.executeTask(restrictedDefinition.id, submitted.taskId)

    expect(completed.status).toBe('completed')
    expect((completed.result as { output: string }).output).toBe('The child research is complete.')
    expect(runtime.listAgentsForMission('mission-1')).toHaveLength(2)
    expect(runtime.listAgentsForMission('mission-1')[1]).toEqual(expect.objectContaining({
      tools: ['lookup'],
      toolPolicy: { mode: 'allowlist' },
    }))
    expect(brainCalls.some((call) => call.systemPrompt.includes('researcher agent'))).toBe(true)
    expect(brainCalls.every((call) => call.systemPrompt.includes('5 Brain calls'))).toBe(true)
    expect(brainCalls).toHaveLength(3)
  })

  it('feeds tool failures back to Brain and lets the Agent recover with a corrected call', async () => {
    let brainTurn = 0
    let toolExecution = 0
    const prompts: string[] = []
    const tokenCaps: number[] = []
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) {
        return jsonResponse({
          tools: [{ id: 'lookup', name: 'Lookup', description: 'Look up a record', type: 'code' }],
        })
      }
      if (url.endsWith('/api/brain/complete')) {
        const body = JSON.parse(String(init?.body)) as { prompt: string; maxTokens: number }
        prompts.push(body.prompt)
        tokenCaps.push(body.maxTokens)
        brainTurn++
        const responses = [
          '{"tool":"lookup","args":{"query":"bad"}}',
          '{"tool":"lookup","args":{"query":"good"}}',
          'The lookup succeeded after correcting the query.',
        ]
        return jsonResponse({ content: responses[brainTurn - 1] })
      }
      if (url.endsWith('/api/tool-executor/tools/execute')) {
        toolExecution++
        return toolExecution === 1
          ? jsonResponse({ status: 'failed', error: 'invalid query' }, 500)
          : jsonResponse({ status: 'completed', output: { record: 'found' } })
      }
      throw new Error(`Unexpected request: ${url}`)
    }
    const executionPolicy: AgentExecutionPolicy = {
      ...DEFAULT_AGENT_EXECUTION_POLICY,
      maxCompletionTokens: 5000,
      maxActions: 2,
    }

    const result = await new AgentExecutor({ fetcher }).execute(definition, task() as AgentTask, {
      missionId: 'mission-1',
      delegationDepth: 0,
      executionPolicy,
    })

    expect(result.output).toContain('correcting the query')
    expect(result.brainCalls).toBe(3)
    expect(result.toolCalls).toBe(2)
    expect(prompts[1]).toContain('Action failed: invalid query')
    expect(tokenCaps).toEqual([2048, 2048, 904])
    expect(tokenCaps.reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(executionPolicy.maxCompletionTokens)
  })

  it('enforces the action budget before executing an over-budget tool call', async () => {
    let brainTurn = 0
    let toolExecutions = 0
    const fetcher: typeof fetch = async (input) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) {
        return jsonResponse({
          tools: [{ id: 'lookup', name: 'Lookup', description: 'Look up a record', type: 'code' }],
        })
      }
      if (url.endsWith('/api/brain/complete')) {
        brainTurn++
        return jsonResponse({
          content: '{"tool":"lookup","args":{"query":"same"}}',
        })
      }
      if (url.endsWith('/api/tool-executor/tools/execute')) {
        toolExecutions++
        return jsonResponse({ status: 'completed', output: {} })
      }
      throw new Error(`Unexpected request: ${url}`)
    }
    const executionPolicy: AgentExecutionPolicy = {
      ...DEFAULT_AGENT_EXECUTION_POLICY,
      maxActions: 1,
      maxCompletionTokens: 8192,
    }

    await expect(new AgentExecutor({ fetcher }).execute(definition, task() as AgentTask, {
      missionId: 'mission-1',
      delegationDepth: 0,
      executionPolicy,
    })).rejects.toThrow('exhausted its 1-action execution budget')
    expect(toolExecutions).toBe(1)
    expect(brainTurn).toBe(2)
  })

  it('completes a bounded mission task through delegation, tool repair, and receipt replay after runtime recreation', async () => {
    type SavedAgentState = {
      agentId: string
      tenantId: string
      missionId: string
      status: string
      context: Record<string, unknown>
      artifacts: string[]
      createdAt: Date
      updatedAt: Date
    }
    const savedStates = new Map<string, SavedAgentState>()
    const persistence = {
      ready: async () => undefined,
      getAgentState: async (agentId: string) => savedStates.get(agentId),
      saveAgentState: async (state: SavedAgentState) => {
        savedStates.set(state.agentId, structuredClone(state))
      },
      queryDocuments: async () => ({ documents: [] }),
    } as unknown as ArtifactsService
    const turns = new Map<string, number>()
    const brainCalls: Array<{ systemPrompt: string; prompt: string }> = []
    const toolInputs: Array<{ query: string }> = []
    let successfulSideEffects = 0
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) {
        return jsonResponse({
          tools: [{
            id: 'lookup',
            name: 'Lookup',
            description: 'Look up a source',
            type: 'code',
          }],
        })
      }
      if (url.endsWith('/api/brain/complete')) {
        const body = JSON.parse(String(init?.body)) as { systemPrompt: string; prompt: string }
        brainCalls.push(body)
        const agentKey = body.systemPrompt.includes('ROOT_AGENT') ? 'parent' : 'child'
        const turn = (turns.get(agentKey) || 0) + 1
        turns.set(agentKey, turn)
        if (agentKey === 'parent') {
          return jsonResponse({
            content: turn === 1
              ? '{"tool":"__delegate","args":{"goal":"Find a verified source","role":"researcher"}}'
              : 'Completed the mission using the delegated verified finding.',
          })
        }
        const childResponses = [
          '{"tool":"lookup","args":{"query":"invalid"}}',
          '{"tool":"lookup","args":{"query":"verified"}}',
          'I found a verified source.',
        ]
        return jsonResponse({ content: childResponses[turn - 1] })
      }
      if (url.endsWith('/api/tool-executor/tools/execute')) {
        const body = JSON.parse(String(init?.body)) as { input: { query: string } }
        toolInputs.push(body.input)
        if (body.input.query === 'invalid') {
          return jsonResponse({ status: 'failed', error: 'No source found for that query.' }, 400)
        }
        successfulSideEffects++
        return jsonResponse({ status: 'completed', output: { finding: 'verified finding' } })
      }
      throw new Error(`Unexpected request: ${url}`)
    }

    const executionTask = task('mission-acceptance:phase-1:task-1')
    const firstRuntime = new PersistentAgentRuntime(persistence, new AgentExecutor({ fetcher }))
    firstRuntime.registerAgentForMission('mission-acceptance', definition)
    await firstRuntime.startAgent(definition.id, 'mission-acceptance')
    const submitted = await firstRuntime.submitTask(definition.id, executionTask)
    const firstResult = await firstRuntime.executeTask(definition.id, submitted.taskId)

    expect(firstResult.status).toBe('completed')
    expect((firstResult.result as { output: string }).output)
      .toContain('Completed the mission using the delegated verified finding.')
    expect(firstRuntime.listAgentsForMission('mission-acceptance')).toHaveLength(2)
    expect(toolInputs).toEqual([{ query: 'invalid' }, { query: 'verified' }])
    expect(brainCalls.some((call) => call.prompt.includes('Action failed: No source found')))
      .toBe(true)
    expect(brainCalls[brainCalls.length - 1]?.prompt).toContain('I found a verified source.')
    expect(successfulSideEffects).toBe(1)

    const brainCallsBeforeRestart = brainCalls.length
    const restartedRuntime = new PersistentAgentRuntime(persistence, new AgentExecutor({ fetcher }))
    restartedRuntime.registerAgentForMission('mission-acceptance', definition)
    await restartedRuntime.startAgent(definition.id, 'mission-acceptance')
    const retried = await restartedRuntime.submitTask(definition.id, executionTask)
    const replayed = await restartedRuntime.executeTask(definition.id, retried.taskId, true)

    expect(replayed.result).toEqual(firstResult.result)
    expect(brainCalls).toHaveLength(brainCallsBeforeRestart)
    expect(successfulSideEffects).toBe(1)
  })

  it('enforces a zero-delegation policy and gives Brain a chance to finish without delegation', async () => {
    let brainTurn = 0
    let delegateCalls = 0
    const prompts: string[] = []
    const histories: string[] = []
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) return jsonResponse({ tools: [] })
      if (!url.endsWith('/api/brain/complete')) throw new Error(`Unexpected request: ${url}`)
      const body = JSON.parse(String(init?.body)) as { systemPrompt: string; prompt: string }
      prompts.push(body.systemPrompt)
      histories.push(body.prompt)
      brainTurn++
      return jsonResponse({
        content: brainTurn === 1
          ? '{"tool":"__delegate","args":{"goal":"Do the task","role":"researcher"}}'
          : 'I will complete this without delegation.',
      })
    }
    const executionPolicy: AgentExecutionPolicy = {
      ...DEFAULT_AGENT_EXECUTION_POLICY,
      maxBrainCalls: 2,
      maxActions: 1,
      maxCompletionTokens: 4096,
      maxDelegations: 0,
    }

    const result = await new AgentExecutor({ fetcher }).execute(definition, task() as AgentTask, {
      missionId: 'mission-1',
      delegationDepth: 0,
      executionPolicy,
      delegate: async () => {
        delegateCalls++
        return 'should not run'
      },
    })

    expect(result.output).toContain('without delegation')
    expect(delegateCalls).toBe(0)
    expect(prompts[0]).toContain('You may not delegate further')
    expect(histories[1]).toContain('delegation budget exhausted')
  })

  it('rejects policies that exceed the service hard ceiling before calling Brain', async () => {
    let fetchCalls = 0
    const fetcher: typeof fetch = async () => {
      fetchCalls++
      throw new Error('Brain should not be called for an invalid policy')
    }
    const policy: AgentExecutionPolicy = {
      ...DEFAULT_AGENT_EXECUTION_POLICY,
      maxActions: DEFAULT_AGENT_EXECUTION_POLICY.maxActions + 1,
    }

    await expect(new AgentExecutor({ fetcher }).execute(definition, task() as AgentTask, {
      missionId: 'mission-1',
      delegationDepth: 0,
      executionPolicy: policy,
    })).rejects.toThrow('maxActions must be an integer')
    expect(fetchCalls).toBe(0)
  })

  it('returns a completed task for duplicate execute requests and rejects concurrent duplicates', async () => {
    let resolveCompletion: ((response: Response) => void) | undefined
    let requestCount = 0
    const fetcher: typeof fetch = async (input) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) return jsonResponse({ tools: [] })
      if (!url.endsWith('/api/brain/complete')) throw new Error(`Unexpected request: ${url}`)
      requestCount++
      if (requestCount === 1) {
        return new Promise<Response>((resolve) => { resolveCompletion = resolve })
      }
      return jsonResponse({ content: 'Done.' })
    }
    const runtime = new AgentRuntime(new AgentExecutor({ fetcher }))
    runtime.registerAgent(definition)
    runtime.startAgent(definition.id, 'mission-1')
    const submitted = runtime.submitTask(definition.id, task())

    const first = runtime.executeTask(definition.id, submitted.taskId)
    await Promise.resolve()
    await expect(runtime.executeTask(definition.id, submitted.taskId)).rejects.toThrow('already running')
    resolveCompletion?.(jsonResponse({ content: 'Done.' }))
    const result = await first
    const duplicate = await runtime.executeTask(definition.id, submitted.taskId)

    expect(result).toEqual(duplicate)
    expect(requestCount).toBe(1)
  })

  it('restores completed task receipts after runtime recreation and refuses uncertain replay', async () => {
    const savedStates = new Map<string, {
      agentId: string
      tenantId: string
      missionId: string
      status: string
      context: Record<string, unknown>
      artifacts: string[]
      createdAt: Date
      updatedAt: Date
    }>()
    const persistence = {
      ready: async () => undefined,
      getAgentState: async (agentId: string) => savedStates.get(agentId),
      saveAgentState: async (state: {
        agentId: string
        tenantId: string
        missionId: string
        status: string
        context: Record<string, unknown>
        artifacts: string[]
        createdAt: Date
        updatedAt: Date
      }) => { savedStates.set(state.agentId, structuredClone(state)) },
      queryDocuments: async () => ({ documents: [] }),
    } as unknown as ArtifactsService
    let brainCalls = 0
    const fetcher: typeof fetch = async (input) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) return jsonResponse({ tools: [] })
      if (url.endsWith('/api/brain/complete')) {
        brainCalls++
        return jsonResponse({ content: 'Completed once.' })
      }
      throw new Error(`Unexpected request: ${url}`)
    }

    const firstRuntime = new PersistentAgentRuntime(persistence, new AgentExecutor({ fetcher }))
    firstRuntime.registerAgentForMission('mission-1', definition)
    await firstRuntime.startAgent(definition.id, 'mission-1')
    const submitted = await firstRuntime.submitTask(definition.id, task())
    const firstResult = await firstRuntime.executeTask(definition.id, submitted.taskId)

    const restartedRuntime = new PersistentAgentRuntime(persistence, new AgentExecutor({ fetcher }))
    restartedRuntime.registerAgentForMission('mission-1', definition)
    await restartedRuntime.startAgent(definition.id, 'mission-1')
    const retried = await restartedRuntime.submitTask(definition.id, task())
    const restoredResult = await restartedRuntime.executeTask(definition.id, retried.taskId, true)

    expect(restoredResult.result).toEqual(firstResult.result)
    expect(brainCalls).toBe(1)

    const checkpointedAgent = { ...definition, id: 'checkpoint-without-receipt' }
    const checkpointedRuntime = new PersistentAgentRuntime(persistence, new AgentExecutor({ fetcher }))
    checkpointedRuntime.registerAgentForMission('mission-1', checkpointedAgent)
    await checkpointedRuntime.startAgent(checkpointedAgent.id, 'mission-1')
    const checkpointedTask = await checkpointedRuntime.submitTask(checkpointedAgent.id, task('checkpoint-without-receipt-task'))
    await expect(checkpointedRuntime.executeTask(checkpointedAgent.id, checkpointedTask.taskId, true))
      .rejects.toThrow('no completed Agent receipt; refusing to execute it again')
    expect(brainCalls).toBe(1)

    const interruptedState = savedStates.get(definition.id)!
    interruptedState.context = { ...interruptedState.context, activeTaskId: 'mission-1:phase-1:interrupted' }
    savedStates.set(definition.id, interruptedState)

    const interruptedRuntime = new PersistentAgentRuntime(persistence, new AgentExecutor({ fetcher }))
    interruptedRuntime.registerAgentForMission('mission-1', definition)
    await interruptedRuntime.startAgent(definition.id, 'mission-1')
    const interrupted = await interruptedRuntime.submitTask(definition.id, {
      ...task('mission-1:phase-1:interrupted'),
      status: 'pending',
    })
    await expect(interruptedRuntime.executeTask(definition.id, interrupted.taskId))
      .rejects.toThrow('refusing to replay external actions automatically')
    expect(brainCalls).toBe(1)
  })

  it('resumes a failed task from a safe checkpoint after runtime recreation', async () => {
    const savedStates = new Map<string, {
      agentId: string
      tenantId: string
      missionId: string
      status: string
      context: Record<string, unknown>
      artifacts: string[]
      createdAt: Date
      updatedAt: Date
    }>()
    const persistence = {
      ready: async () => undefined,
      getAgentState: async (agentId: string) => savedStates.get(agentId),
      saveAgentState: async (state: {
        agentId: string
        tenantId: string
        missionId: string
        status: string
        context: Record<string, unknown>
        artifacts: string[]
        createdAt: Date
        updatedAt: Date
      }) => { savedStates.set(state.agentId, structuredClone(state)) },
      queryDocuments: async () => ({ documents: [] }),
    } as unknown as ArtifactsService
    const retryAgent = { ...definition, id: 'retryable-agent' }
    let firstAttemptBrainCalls = 0
    const failedFetcher: typeof fetch = async (input) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) return jsonResponse({ tools: [] })
      if (url.endsWith('/api/brain/complete')) {
        firstAttemptBrainCalls++
        return new Response('Brain temporarily unavailable', { status: 503 })
      }
      throw new Error(`Unexpected request: ${url}`)
    }
    const firstRuntime = new PersistentAgentRuntime(persistence, new AgentExecutor({ fetcher: failedFetcher }))
    firstRuntime.registerAgentForMission('mission-1', retryAgent)
    await firstRuntime.startAgent(retryAgent.id, 'mission-1')
    const submitted = await firstRuntime.submitTask(retryAgent.id, task('retry-safe-checkpoint'))

    await expect(firstRuntime.executeTask(retryAgent.id, submitted.taskId)).rejects.toThrow('Brain request failed (503)')
    expect(savedStates.get(retryAgent.id)?.context).toMatchObject({
      activeTaskId: submitted.taskId,
      taskReceipts: {
        [submitted.taskId]: { status: 'failed' },
      },
    })

    let retryBrainCalls = 0
    const recoveredFetcher: typeof fetch = async (input) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) return jsonResponse({ tools: [] })
      if (url.endsWith('/api/brain/complete')) {
        retryBrainCalls++
        return jsonResponse({ content: 'Recovered without replaying an action.' })
      }
      throw new Error(`Unexpected request: ${url}`)
    }
    const restartedRuntime = new PersistentAgentRuntime(persistence, new AgentExecutor({ fetcher: recoveredFetcher }))
    restartedRuntime.registerAgentForMission('mission-1', retryAgent)
    await restartedRuntime.startAgent(retryAgent.id, 'mission-1')
    const restoredTask = await restartedRuntime.submitTask(retryAgent.id, task('retry-safe-checkpoint'))
    const result = await restartedRuntime.executeTask(retryAgent.id, restoredTask.taskId)

    expect(result.result).toMatchObject({
      output: expect.stringContaining('Recovered without replaying an action.'),
    })
    expect(firstAttemptBrainCalls).toBe(1)
    expect(retryBrainCalls).toBe(1)
  })

  it('recovers a completed delegated child when the parent checkpoint still has a pending delegation', async () => {
    const savedStates = new Map<string, {
      agentId: string
      tenantId: string
      missionId: string
      status: string
      context: Record<string, unknown>
      artifacts: string[]
      createdAt: Date
      updatedAt: Date
    }>()
    const persistence = {
      ready: async () => undefined,
      getAgentState: async (agentId: string) => savedStates.get(agentId),
      saveAgentState: async (state: {
        agentId: string
        tenantId: string
        missionId: string
        status: string
        context: Record<string, unknown>
        artifacts: string[]
        createdAt: Date
        updatedAt: Date
      }) => { savedStates.set(state.agentId, structuredClone(state)) },
      queryDocuments: async () => ({ documents: [] }),
    } as unknown as ArtifactsService
    const parent = { ...definition, id: 'persistent-parent' }
    const delegationArgs = { goal: 'Find two relevant sources', role: 'researcher' }
    const delegationAction = JSON.stringify({ tool: '__delegate', args: delegationArgs })
    const delegationSignature = `__delegate:${JSON.stringify(delegationArgs)}`
    let parentTurns = 0
    let childBrainCalls = 0
    const firstFetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) return jsonResponse({ tools: [] })
      if (!url.endsWith('/api/brain/complete')) throw new Error(`Unexpected request: ${url}`)
      const body = JSON.parse(String(init?.body)) as { systemPrompt: string }
      if (body.systemPrompt.includes('ROOT_AGENT')) {
        parentTurns++
        return parentTurns === 1
          ? jsonResponse({ content: delegationAction })
          : jsonResponse({ error: 'Parent Brain temporarily unavailable' }, 503)
      }
      childBrainCalls++
      return jsonResponse({ content: 'The child completed its research.' })
    }
    const firstRuntime = new PersistentAgentRuntime(persistence, new AgentExecutor({ fetcher: firstFetcher }))
    firstRuntime.registerAgentForMission('mission-1', parent)
    await firstRuntime.startAgent(parent.id, 'mission-1')
    const submitted = await firstRuntime.submitTask(parent.id, task('parent-delegation-resume'))

    await expect(firstRuntime.executeTask(parent.id, submitted.taskId)).rejects.toThrow('Brain request failed (503)')
    expect(childBrainCalls).toBe(1)
    const parentState = savedStates.get(parent.id)
    expect(parentState).toBeDefined()
    const persistedCheckpoints = parentState?.context.executionCheckpoints as Record<string, AgentExecutionCheckpoint>
    const parentCheckpoint = persistedCheckpoints[submitted.taskId]
    expect(parentCheckpoint).toBeDefined()
    const childStates = Array.from(savedStates.values()).filter((state) => state.agentId !== parent.id)
    expect(childStates).toHaveLength(1)
    const childReceipts = childStates[0].context.taskReceipts as Record<string, { status?: string }>
    expect(Object.values(childReceipts)).toContainEqual(expect.objectContaining({ status: 'completed' }))

    if (!parentState || !parentCheckpoint) throw new Error('Expected a persisted parent execution checkpoint')
    parentState.context = {
      ...parentState.context,
      executionCheckpoints: {
        ...persistedCheckpoints,
        [submitted.taskId]: {
          ...parentCheckpoint,
          history: [
            parentCheckpoint.history[0],
            { role: 'assistant', content: delegationAction },
          ],
          lastAction: delegationSignature,
          pendingAction: delegationSignature,
        },
      },
    }
    savedStates.set(parent.id, parentState)

    const recoveredFetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) return jsonResponse({ tools: [] })
      if (!url.endsWith('/api/brain/complete')) throw new Error(`Unexpected request: ${url}`)
      const body = JSON.parse(String(init?.body)) as { systemPrompt: string }
      if (!body.systemPrompt.includes('ROOT_AGENT')) {
        throw new Error('A completed delegated child must not execute again')
      }
      return jsonResponse({ content: 'Parent resumed after child recovery.' })
    }
    const restartedRuntime = new PersistentAgentRuntime(persistence, new AgentExecutor({ fetcher: recoveredFetcher }))
    restartedRuntime.registerAgentForMission('mission-1', parent)
    await restartedRuntime.startAgent(parent.id, 'mission-1')
    const restoredTask = await restartedRuntime.submitTask(parent.id, task('parent-delegation-resume'))
    const result = await restartedRuntime.executeTask(parent.id, restoredTask.taskId)

    expect(result.result).toMatchObject({
      output: expect.stringContaining('Parent resumed after child recovery.'),
    })
    expect(childBrainCalls).toBe(1)
  })
})
