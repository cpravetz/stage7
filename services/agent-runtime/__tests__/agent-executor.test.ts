import { createHash } from 'node:crypto'
import { AgentDefinition, AgentExecutionPolicy, AgentTask, DEFAULT_AGENT_EXECUTION_POLICY } from '../src/types'
import { AgentExecutionCheckpoint, AgentExecutor } from '../src/services/AgentExecutor'
import { AgentRuntime } from '../src/services/AgentRuntime'
import { PersistentAgentRuntime } from '../src/services/PersistentAgentRuntime'
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

  it('waits for the configured Brain completion deadline plus response grace', async () => {
    const previousDeadline = process.env.BRAIN_COMPLETION_DEADLINE_MS
    const previousAttemptTimeout = process.env.BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS
    let aborted = false
    jest.useFakeTimers()
    process.env.BRAIN_COMPLETION_DEADLINE_MS = '150000'
    process.env.BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS = '120000'
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) return jsonResponse({ tools: [] })
      if (url.endsWith('/api/brain/complete')) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true
            reject(new Error('request aborted'))
          }, { once: true })
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    }

    try {
      const execution = new AgentExecutor({ fetcher }).execute(
        definition,
        task() as AgentTask,
        { missionId: 'mission-1', delegationDepth: 0 },
      )
      const timeoutAssertion = expect(execution).rejects.toThrow('Brain request timed out after 180000ms')
      await jest.advanceTimersByTimeAsync(120_000)
      expect(aborted).toBe(false)
      await jest.advanceTimersByTimeAsync(60_000)
      await timeoutAssertion
    } finally {
      jest.useRealTimers()
      if (previousDeadline === undefined) delete process.env.BRAIN_COMPLETION_DEADLINE_MS
      else process.env.BRAIN_COMPLETION_DEADLINE_MS = previousDeadline
      if (previousAttemptTimeout === undefined) delete process.env.BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS
      else process.env.BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS = previousAttemptTimeout
    }
  })

  it.each([
    ['raw JSON', '{"tool":"calculate","args":{"expression":"17 + 25"}}\n\nThe result is 42. I have completed the task.'],
    ['a leading JSON code fence', '```json\n{"tool":"calculate","args":{"expression":"17 + 25"}}\n```\nThe result is 42. I have completed the task.'],
  ])('executes a single leading %s action and ignores trailing narration', async (_format, firstResponse) => {
    const brainResponses = [firstResponse, '42']
    const prompts: string[] = []
    const complaints: Array<{ requestId: string; reason: string; missionId: string }> = []
    let toolExecutions = 0
    let optimizeFor = ''
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) {
        return jsonResponse({
          tools: [{ id: 'calculate', name: 'Calculate', description: 'Calculate an expression', type: 'code' }],
        })
      }
      if (url.endsWith('/api/brain/complaint')) {
        complaints.push(JSON.parse(String(init?.body)) as { requestId: string; reason: string; missionId: string })
        return jsonResponse({ recorded: true })
      }
      if (url.endsWith('/api/brain/complete')) {
        const request = JSON.parse(String(init?.body)) as {
          prompt: string
          options?: { optimizeFor?: string }
        }
        prompts.push(request.prompt)
        optimizeFor = request.options?.optimizeFor || ''
        const content = brainResponses.shift()
        if (!content) throw new Error('Unexpected additional Brain request')
        return jsonResponse({ content, requestId: `brain-request-${prompts.length}`, tokensUsed: 5 })
      }
      if (url.endsWith('/api/tool-executor/tools/execute')) {
        toolExecutions++
        return jsonResponse({ status: 'completed', output: { result: 42 } })
      }
      throw new Error(`Unexpected request: ${url}`)
    }

    const result = await new AgentExecutor({ fetcher }).execute(
      { ...definition, tools: ['calculate'], toolPolicy: { mode: 'allowlist' } },
      task() as AgentTask,
      { missionId: 'mission-1', delegationDepth: 0 },
    )

    expect(result.output).toBe('42')
    expect(result.toolCalls).toBe(1)
    expect(result.actionReceipts).toEqual([
      { toolId: 'calculate', isError: false, content: '{"result":42}', outcome: 'success' },
    ])
    expect(toolExecutions).toBe(1)
    expect(prompts[1]).toContain('Only the leading action object was considered')
    expect(prompts[1]).not.toContain('I have completed the task.')
    expect(optimizeFor).toBe('accuracy')
    expect(complaints).toEqual([expect.objectContaining({
      requestId: 'brain-request-1',
      missionId: 'mission-1',
      reason: expect.stringContaining('trailing narration'),
    })])
  })

  it('complains about an empty Brain response and retries without treating it as task output', async () => {
    const prompts: string[] = []
    const complaints: Array<{ requestId: string; reason: string; missionId: string }> = []
    let brainCalls = 0
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) return jsonResponse({ tools: [] })
      if (url.endsWith('/api/brain/complaint')) {
        complaints.push(JSON.parse(String(init?.body)) as { requestId: string; reason: string; missionId: string })
        return jsonResponse({ recorded: true })
      }
      if (url.endsWith('/api/brain/complete')) {
        const request = JSON.parse(String(init?.body)) as { prompt: string }
        prompts.push(request.prompt)
        brainCalls++
        return jsonResponse({
          content: brainCalls === 1 ? '' : 'Recovered after the empty response.',
          requestId: `empty-response-${brainCalls}`,
          tokensUsed: 1,
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    }

    const result = await new AgentExecutor({ fetcher }).execute(
      definition,
      task() as AgentTask,
      { missionId: 'mission-1', delegationDepth: 0 },
    )

    expect(result.output).toBe('Recovered after the empty response.')
    expect(result.brainCalls).toBe(2)
    expect(prompts[1]).toContain('Your previous Brain response was empty')
    expect(complaints).toEqual([
      expect.objectContaining({
        requestId: 'empty-response-1',
        missionId: 'mission-1',
        reason: expect.stringContaining('returned empty content'),
      }),
    ])
  })

  it('requires non-empty exact sections for expected artifacts before completing a task', async () => {
    const prompts: string[] = []
    const complaints: Array<{ requestId: string; reason: string; missionId: string }> = []
    let brainTurn = 0
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) return jsonResponse({ tools: [] })
      if (url.endsWith('/api/brain/complaint')) {
        complaints.push(JSON.parse(String(init?.body)) as { requestId: string; reason: string; missionId: string })
        return jsonResponse({ recorded: true })
      }
      if (url.endsWith('/api/brain/complete')) {
        const body = JSON.parse(String(init?.body)) as { prompt: string }
        prompts.push(body.prompt)
        brainTurn++
        return jsonResponse({
          content: brainTurn === 1
            ? 'The answer is 5.'
            : '## answer.json\n{"answer":4}',
          requestId: `brain-response-${brainTurn}`,
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    }
    const expectedTask: AgentTask = {
      ...task(),
      agentId: definition.id,
      createdAt: new Date().toISOString(),
      input: { prompt: 'Calculate 2 + 2.', context: { expectedArtifacts: ['answer.json'] } },
    }

    const result = await new AgentExecutor({ fetcher }).execute(definition, expectedTask, {
      missionId: 'mission-1',
      delegationDepth: 0,
    })

    expect(result.output).toBe('## answer.json\n{"answer":4}')
    expect(prompts).toHaveLength(2)
    expect(prompts[1]).toContain('missing required, non-empty Markdown artifact section(s): ## answer.json')
    expect(complaints).toEqual([
      expect.objectContaining({
        requestId: 'brain-response-1',
        missionId: 'mission-1',
        reason: expect.stringContaining('omitted required artifact section'),
      }),
    ])
  })

  it('executes required tool actions before accepting an otherwise complete answer', async () => {
    const prompts: string[] = []
    const complaints: Array<{ requestId: string; reason: string; missionId: string }> = []
    let brainTurn = 0
    let toolExecutions = 0
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) {
        return jsonResponse({
          tools: [{ id: 'calculate', name: 'Calculate', description: 'Calculate an expression', type: 'code' }],
        })
      }
      if (url.endsWith('/api/brain/complaint')) {
        complaints.push(JSON.parse(String(init?.body)) as { requestId: string; reason: string; missionId: string })
        return jsonResponse({ recorded: true })
      }
      if (url.endsWith('/api/brain/complete')) {
        const body = JSON.parse(String(init?.body)) as { prompt: string; systemPrompt: string }
        prompts.push(`${body.systemPrompt}\n${body.prompt}`)
        brainTurn++
        return jsonResponse({
          content: [
            '## answer\n4',
            '{"tool":"calculate","args":{"expression":"2+2"}}',
            '## answer\n4',
          ][brainTurn - 1],
          requestId: `required-action-${brainTurn}`,
        })
      }
      if (url.endsWith('/api/tool-executor/tools/execute')) {
        toolExecutions++
        return jsonResponse({ status: 'completed', output: { result: 4 } })
      }
      throw new Error(`Unexpected request: ${url}`)
    }
    const requiredTask: AgentTask = {
      ...task(),
      agentId: definition.id,
      createdAt: new Date().toISOString(),
      input: {
        prompt: 'Calculate 2 + 2 using the calculate tool.',
        context: {
          expectedArtifacts: ['answer'],
          requiredActions: [{ toolId: 'calculate', outcome: 'success' }],
        },
      },
    }

    const result = await new AgentExecutor({ fetcher }).execute(
      { ...definition, tools: ['calculate'], toolPolicy: { mode: 'allowlist' } },
      requiredTask,
      { missionId: 'mission-1', delegationDepth: 0 },
    )

    expect(result.output).toBe('## answer\n4')
    expect(result.actionReceipts).toEqual([
      { toolId: 'calculate', isError: false, content: '{"result":4}', outcome: 'success' },
    ])
    expect(toolExecutions).toBe(1)
    expect(prompts[0]).toContain('Required action receipts before completion')
    expect(prompts[1]).toContain('Before finalizing, execute each required action')
    expect(complaints).toEqual([
      expect.objectContaining({
        requestId: 'required-action-1',
        reason: expect.stringContaining('missing required action receipt'),
      }),
    ])
  })

  it('records an actual allowlist denial when a task requires a denied action', async () => {
    const calls: string[] = []
    let brainTurn = 0
    const fetcher: typeof fetch = async (input) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith('/api/tool-executor/tools')) {
        return jsonResponse({
          tools: [
            { id: 'allowed-tool', name: 'Allowed Tool', description: 'Allowed', type: 'code' },
            { id: 'blocked-tool', name: 'Blocked Tool', description: 'Blocked', type: 'code' },
          ],
        })
      }
      if (url.endsWith('/api/brain/complete')) {
        brainTurn++
        return jsonResponse({
          content: brainTurn === 1
            ? '{"tool":"blocked-tool","args":{}}'
            : '## denial\nThe policy denied blocked-tool.',
        })
      }
      if (url.endsWith('/api/brain/complaint')) return jsonResponse({ recorded: true })
      throw new Error(`Unexpected request: ${url}`)
    }
    const restrictedTask: AgentTask = {
      ...task(),
      agentId: definition.id,
      createdAt: new Date().toISOString(),
      input: {
        prompt: 'Attempt blocked-tool and report the verified denial.',
        context: {
          expectedArtifacts: ['denial'],
          requiredActions: [{ toolId: 'blocked-tool', outcome: 'denied' }],
        },
      },
    }

    const result = await new AgentExecutor({ fetcher }).execute(
      { ...definition, tools: ['allowed-tool'], toolPolicy: { mode: 'allowlist' } },
      restrictedTask,
      { missionId: 'mission-1', delegationDepth: 0 },
    )

    expect(result.output).toBe('## denial\nThe policy denied blocked-tool.')
    expect(result.actionReceipts).toEqual([
      {
        toolId: 'blocked-tool',
        isError: true,
        content: "Tool 'blocked-tool' is not in this Agent's allowed tool set.",
        outcome: 'denied',
      },
    ])
    expect(calls.some((url) => url.endsWith('/api/tool-executor/tools/execute'))).toBe(false)
  })

  it('requires an expected tool error and its successful repair to be observed', async () => {
    let brainTurn = 0
    let toolExecutions = 0
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) {
        return jsonResponse({
          tools: [{ id: 'calculate', name: 'Calculate', description: 'Calculate an expression', type: 'code' }],
        })
      }
      if (url.endsWith('/api/brain/complete')) {
        brainTurn++
        return jsonResponse({
          content: [
            '{"tool":"calculate","args":{"expression":"2*"}}',
            '{"tool":"calculate","args":{"expression":"2+2"}}',
            '## answer\n4',
          ][brainTurn - 1],
        })
      }
      if (url.endsWith('/api/tool-executor/tools/execute')) {
        toolExecutions++
        return toolExecutions === 1
          ? jsonResponse({ status: 'completed', output: { error: 'Invalid expression' } })
          : jsonResponse({ status: 'completed', output: { result: 4 } })
      }
      throw new Error(`Unexpected request: ${url}`)
    }
    const repairTask: AgentTask = {
      ...task(),
      agentId: definition.id,
      createdAt: new Date().toISOString(),
      input: {
        prompt: 'Recover from the first calculator error and report the corrected result.',
        context: {
          expectedArtifacts: ['answer'],
          requiredActions: [
            { toolId: 'calculate', outcome: 'failure' },
            { toolId: 'calculate', outcome: 'success' },
          ],
        },
      },
    }

    const result = await new AgentExecutor({ fetcher }).execute(
      { ...definition, tools: ['calculate'], toolPolicy: { mode: 'allowlist' } },
      repairTask,
      { missionId: 'mission-1', delegationDepth: 0 },
    )

    expect(result.output).toBe('## answer\n4')
    expect(result.actionReceipts.map(({ outcome }) => outcome)).toEqual(['failure', 'success'])
    expect(toolExecutions).toBe(2)
  })

  it('corrects a persisted action receipt whose payload records a semantic failure', async () => {
    const finalOutput = [
      '## calculate-invalid-failure-receipt',
      '{"error":"Unexpected end of expression"}',
      '',
      '## calculate-recovery-success-receipt',
      '{"result":4}',
    ].join('\n')
    let toolExecutions = 0
    const fetcher: typeof fetch = async (input) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) {
        return jsonResponse({
          tools: [{ id: 'calculate', name: 'Calculate', description: 'Calculate an expression', type: 'code' }],
        })
      }
      if (url.endsWith('/api/brain/complete')) return jsonResponse({ content: finalOutput })
      if (url.endsWith('/api/tool-executor/tools/execute')) {
        toolExecutions++
        return jsonResponse({ status: 'completed', output: { result: 4 } })
      }
      throw new Error(`Unexpected request: ${url}`)
    }
    const recoveryTask: AgentTask = {
      ...task(),
      agentId: definition.id,
      createdAt: new Date().toISOString(),
      input: {
        prompt: 'Record the invalid calculation failure and successful recovery.',
        context: {
          expectedArtifacts: ['calculate-invalid-failure-receipt', 'calculate-recovery-success-receipt'],
          executionPolicy: {
            maxBrainCalls: 8,
            maxActions: 6,
            maxCompletionTokens: 16_384,
            maxCompletionTokensPerCall: 2_048,
            maxDelegations: 2,
          },
          requiredActions: [
            { toolId: 'calculate', outcome: 'failure' },
            { toolId: 'calculate', outcome: 'success' },
          ],
        },
      },
    }
    const checkpoint: AgentExecutionCheckpoint = {
      version: 2,
      history: [{ role: 'user', content: 'Record the invalid calculation failure and successful recovery.' }],
      tokensUsed: 0,
      toolCalls: 2,
      brainCalls: 5,
      completionTokensReserved: 10_240,
      delegations: 0,
      lastAction: 'calculate:{"expression":"2+2"}',
      repeatedActionCount: 0,
      actionReceipts: [
        {
          toolId: 'calculate',
          isError: false,
          content: '{"error":"Unexpected end of expression"}',
          outcome: 'success',
        },
        {
          toolId: 'calculate',
          isError: false,
          content: '{"result":4,"expression":"2+2"}',
          outcome: 'success',
        },
      ],
    }

    const result = await new AgentExecutor({ fetcher }).execute(
      { ...definition, tools: ['calculate'], toolPolicy: { mode: 'allowlist' } },
      recoveryTask,
      { missionId: 'mission-1', delegationDepth: 0, resumeCheckpoint: checkpoint },
    )

    expect(result.output).toBe(finalOutput)
    expect(result.actionReceipts.map(({ isError, outcome }) => ({ isError, outcome }))).toEqual([
      { isError: true, outcome: 'failure' },
      { isError: false, outcome: 'success' },
    ])
    expect(toolExecutions).toBe(0)
  })

  it('keeps Assistant Skills out of the mission Agent tool catalog', async () => {
    const systemPrompts: string[] = []
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) {
        return jsonResponse({
          tools: [
            { id: 'calculate', name: 'Calculate', description: 'Calculate expressions', type: 'code' },
            {
              id: 'education-lesson-assessment-drafting-user',
              name: 'Lesson & Assessment Drafting',
              description: 'An Assistant Skill',
              type: 'code',
              isSkill: true,
            },
          ],
        })
      }
      if (url.endsWith('/api/brain/complete')) {
        const body = JSON.parse(String(init?.body)) as { systemPrompt: string }
        systemPrompts.push(body.systemPrompt)
        return jsonResponse({ content: 'The task is complete.' })
      }
      throw new Error(`Unexpected request: ${url}`)
    }

    await new AgentExecutor({ fetcher }).execute(definition, task() as AgentTask, {
      missionId: 'mission-1',
      delegationDepth: 0,
    })

    expect(systemPrompts).toHaveLength(1)
    expect(systemPrompts[0]).toContain('"id":"calculate"')
    expect(systemPrompts[0]).not.toContain('education-lesson-assessment-drafting-user')
    expect(systemPrompts[0]).not.toContain('Assistant Skill')
  })

  it.each([
    [
      'a fenced JSON action embedded in prose',
      'I will use the calculator:\n```json\n{"tool":"calculate","args":{"expression":"17 + 25"}}\n```\nThen I will report the result.',
    ],
    [
      'a nested action object embedded in prose',
      'The calculation request is {"product":{"tool":"calculate","args":{"expression":"17 + 25"}}}.',
    ],
  ])('corrects %s instead of executing or returning it as a completed task', async (_description, malformedResponse) => {
    const brainResponses = [
      malformedResponse,
      '{"tool":"calculate","args":{"expression":"17 + 25"}}',
      '42',
    ]
    const prompts: string[] = []
    let toolExecutions = 0
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) {
        return jsonResponse({
          tools: [{ id: 'calculate', name: 'Calculate', description: 'Calculate an expression', type: 'code' }],
        })
      }
      if (url.endsWith('/api/brain/complaint')) return jsonResponse({ recorded: true })
      if (url.endsWith('/api/brain/complete')) {
        const request = JSON.parse(String(init?.body)) as { prompt: string }
        prompts.push(request.prompt)
        const content = brainResponses.shift()
        if (!content) throw new Error('Unexpected additional Brain request')
        return jsonResponse({ content, tokensUsed: 5 })
      }
      if (url.endsWith('/api/tool-executor/tools/execute')) {
        toolExecutions++
        return jsonResponse({ status: 'completed', output: { result: 42 } })
      }
      throw new Error(`Unexpected request: ${url}`)
    }

    const result = await new AgentExecutor({ fetcher }).execute(
      { ...definition, tools: ['calculate'], toolPolicy: { mode: 'allowlist' } },
      task() as AgentTask,
      { missionId: 'mission-1', delegationDepth: 0 },
    )

    expect(result.output).toBe('42')
    expect(result.toolCalls).toBe(1)
    expect(toolExecutions).toBe(1)
    expect(prompts[1]).toContain('was not executed')
  })

  it('does not advertise tool actions to an Agent whose action budget is zero', async () => {
    let systemPrompt = ''
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/brain/complete')) {
        systemPrompt = (JSON.parse(String(init?.body)) as { systemPrompt: string }).systemPrompt
        return jsonResponse({ content: '{"taskId":"task-1"}', tokensUsed: 5 })
      }
      throw new Error(`Unexpected request: ${url}`)
    }

    await new AgentExecutor({ fetcher }).execute(definition, task() as AgentTask, {
      missionId: 'mission-1',
      delegationDepth: 0,
      executionPolicy: {
        ...DEFAULT_AGENT_EXECUTION_POLICY,
        maxBrainCalls: 1,
        maxActions: 0,
        maxCompletionTokens: 1_024,
        maxCompletionTokensPerCall: 1_024,
        maxDelegations: 0,
      },
    })

    expect(systemPrompt).toContain('No tool, tool-generation, or delegation actions are available')
    expect(systemPrompt).not.toContain('{"tool":')
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

  it('blocks repeated successful required actions and grants one bounded continuation budget', async () => {
    const guidance = 'Use the recorded receipts and finish both artifacts without repeating actions.'
    const receipts = [
      {
        toolId: '__create_tool',
        isError: false,
        content: 'Created and registered the calculator plugin.',
        outcome: 'success' as const,
      },
      {
        toolId: '__list_tools',
        isError: false,
        content: 'The exact plugin ID and schemas are present in the catalog.',
        outcome: 'success' as const,
      },
    ]
    const checkpoint: AgentExecutionCheckpoint = {
      version: 2,
      history: [
        { role: 'user', content: 'Create and verify the calculator plugin.' },
        {
          role: 'assistant',
          content: '{"tool":"__create_tool","args":{"description":"calculator","requirements":[]}}',
        },
        { role: 'user', content: "Action failed: Generated plugin id 'calculator' is already registered" },
        { role: 'user', content: `Retry guidance for this resumed task:\n${guidance}` },
      ],
      tokensUsed: 0,
      toolCalls: 4,
      brainCalls: 8,
      completionTokensReserved: 16_384,
      delegations: 0,
      lastAction: '__create_tool',
      repeatedActionCount: 0,
      actionReceipts: receipts,
    }
    const resumedTask: AgentTask = {
      ...task(),
      agentId: definition.id,
      createdAt: new Date().toISOString(),
      input: {
        prompt: 'Create and verify the calculator plugin.',
        context: {
          expectedArtifacts: ['plugin_creation_result', 'plugin_verification_result'],
          requiredActions: [
            { toolId: '__create_tool', outcome: 'success' },
            { toolId: '__list_tools', outcome: 'success' },
          ],
        },
      },
    }
    let brainCalls = 0
    let toolExecutions = 0
    let complaints = 0
    const prompts: string[] = []
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) return jsonResponse({ tools: [] })
      if (url.endsWith('/api/brain/complete')) {
        brainCalls++
        const body = JSON.parse(String(init?.body)) as { prompt: string }
        prompts.push(body.prompt)
        return jsonResponse({
          content: brainCalls === 1
            ? '{"tool":"__create_tool","args":{"description":"calculator","requirements":[]}}'
            : '## plugin_creation_result\nCreated calculator plugin.\n\n## plugin_verification_result\nCatalog receipt confirms its ID and schemas.',
          requestId: `resume-request-${brainCalls}`,
        })
      }
      if (url.endsWith('/api/brain/complaint')) {
        complaints++
        return jsonResponse({ recorded: true })
      }
      if (url.endsWith('/api/tool-executor/tools/execute')) {
        toolExecutions++
        return jsonResponse({ status: 'completed' })
      }
      throw new Error(`Unexpected request: ${url}`)
    }

    const result = await new AgentExecutor({ fetcher }).execute(definition, resumedTask, {
      missionId: 'mission-1',
      delegationDepth: 0,
      resumeCheckpoint: checkpoint,
      retryGuidance: guidance,
    })

    expect(result.output).toContain('## plugin_creation_result')
    expect(result.output).toContain('## plugin_verification_result')
    expect(result.brainCalls).toBe(10)
    expect(result.toolCalls).toBe(4)
    expect(result.actionReceipts.at(-1)).toMatchObject({
      toolId: '__create_tool',
      outcome: 'denied',
    })
    expect(brainCalls).toBe(2)
    expect(toolExecutions).toBe(0)
    expect(complaints).toBe(1)
    expect(prompts[0]).toContain('A single bounded checkpoint-resume allowance is available for this task.')
    expect(prompts[1]).toContain('the repeated action was not executed')
  })

  it('grants a resume allowance without retry guidance when brain calls are exhausted', async () => {
    const receipts = [
      {
        toolId: '__create_tool',
        isError: false,
        content: 'Created and registered the calculator plugin.',
        outcome: 'success' as const,
      },
      {
        toolId: '__list_tools',
        isError: false,
        content: 'The exact plugin ID and schemas are present in the catalog.',
        outcome: 'success' as const,
      },
    ]
    const checkpoint: AgentExecutionCheckpoint = {
      version: 2,
      history: [
        { role: 'user', content: 'Create and verify the calculator plugin.' },
        {
          role: 'assistant',
          content: '{"tool":"__create_tool","args":{"description":"calculator","requirements":[]}}',
        },
      ],
      tokensUsed: 0,
      toolCalls: 2,
      brainCalls: 8,
      completionTokensReserved: 16_384,
      delegations: 0,
      lastAction: '__create_tool',
      repeatedActionCount: 0,
      actionReceipts: receipts,
    }
    const resumedTask: AgentTask = {
      ...task(),
      agentId: definition.id,
      createdAt: new Date().toISOString(),
      input: {
        prompt: 'Create and verify the calculator plugin.',
        context: {
          expectedArtifacts: ['plugin_creation_result', 'plugin_verification_result'],
          requiredActions: [
            { toolId: '__create_tool', outcome: 'success' },
            { toolId: '__list_tools', outcome: 'success' },
          ],
        },
      },
    }
    let brainCalls = 0
    let toolExecutions = 0
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) return jsonResponse({ tools: [] })
      if (url.endsWith('/api/brain/complete')) {
        brainCalls++
        const body = JSON.parse(String(init?.body)) as { prompt: string }
        return jsonResponse({
          content: '## plugin_creation_result\nCreated calculator plugin.\n\n## plugin_verification_result\nCatalog receipt confirms its ID and schemas.',
          requestId: `resume-request-${brainCalls}`,
        })
      }
      if (url.endsWith('/api/brain/complaint')) {
        return jsonResponse({ recorded: true })
      }
      if (url.endsWith('/api/tool-executor/tools/execute')) {
        toolExecutions++
        return jsonResponse({ status: 'completed' })
      }
      throw new Error()
    }

    const result = await new AgentExecutor({ fetcher }).execute(definition, resumedTask, {
      missionId: 'mission-1',
      delegationDepth: 0,
      resumeCheckpoint: checkpoint,
    })

    expect(result.output).toContain('## plugin_creation_result')
    expect(result.output).toContain('## plugin_verification_result')
    expect(result.brainCalls).toBe(9)
    expect(result.toolCalls).toBe(2)
    expect(brainCalls).toBe(1)
    expect(toolExecutions).toBe(0)
  })

  it('preserves the exhausted Brain budget when safely resuming a stale checkpoint', async () => {
    const receipts = [
      {
        toolId: '__list_tools',
        isError: false,
        content: 'The exact plugin ID and schemas are present in the catalog.',
        outcome: 'success' as const,
      },
    ]
    const checkpoint: AgentExecutionCheckpoint = {
      version: 2,
      history: [
        { role: 'user', content: 'Verify plugin ID uniqueness.' },
        {
          role: 'assistant',
          content: '{"tool":"__list_tools","args":{}}',
        },
        { role: 'user', content: 'Action result: "plugin-id-1234". Verify uniqueness.' },
        { role: 'user', content: 'A single bounded checkpoint-resume allowance is available for this task.' },
      ],
      tokensUsed: 0,
      toolCalls: 1,
      brainCalls: 8,
      completionTokensReserved: 16_384,
      delegations: 0,
      lastAction: '__list_tools',
      repeatedActionCount: 0,
      actionReceipts: receipts,
    }
    const resumedTask: AgentTask = {
      ...task(),
      agentId: definition.id,
      createdAt: new Date().toISOString(),
      input: {
        prompt: 'Verify plugin ID uniqueness.',
        context: {
          expectedArtifacts: ['plugin_uniqueness_report'],
        },
      },
    }
    let brainCalls = 0
    const prompts: string[] = []
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) return jsonResponse({ tools: [] })
      if (url.endsWith('/api/brain/complete')) {
        brainCalls++
        const body = JSON.parse(String(init?.body)) as { prompt: string }
        prompts.push(body.prompt)
        return jsonResponse({
          content: '## plugin_uniqueness_report\nPlugin ID plugin-id-1234 is unique across the catalog.',
          requestId: `stale-resume-${brainCalls}`,
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    }

    const result = await new AgentExecutor({ fetcher }).execute(definition, resumedTask, {
      missionId: 'mission-1',
      delegationDepth: 0,
      resumeCheckpoint: checkpoint,
    })

    expect(result.output).toContain('## plugin_uniqueness_report')
    expect(result.brainCalls).toBe(9)
    expect(result.toolCalls).toBe(1)
    expect(brainCalls).toBe(1)
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

      if (url.endsWith('/api/tool-executor/tools/resolve')) {
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
    expect(calls.some((call) => call.url.endsWith('/api/tool-executor/tools/resolve'))).toBe(true)
    expect(calls.some((call) => call.url.endsWith('/api/tool-executor/tools/execute'))).toBe(true)
    expect(calls.find((call) => call.url.endsWith('/api/brain/complete'))?.body?.systemPrompt)
      .toContain('ToolExecutor checks registered native tools')
    expect(calls.filter((call) => call.url.endsWith('/api/brain/complete'))
      .every((call) => !Object.prototype.hasOwnProperty.call(call.body, 'model'))).toBe(true)
  })

  it('returns missing user input as a structured mission interruption marker', async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) return jsonResponse({ tools: [] })
      if (url.endsWith('/api/brain/complete')) {
        return jsonResponse({ content: '__ASK_USER__:{"question":"[secret:service_token] Provide the service token."}' })
      }
      throw new Error(`Unexpected request: ${url}`)
    }

    const result = await new AgentExecutor({ fetcher }).execute(definition, task() as AgentTask, {
      missionId: 'mission-1',
      delegationDepth: 0,
    })

    expect(result.output).toBe('__ASK_USER__:{"question":"[secret:service_token] Provide the service token."}')
    expect(result.brainCalls).toBe(1)
  })

  it('returns MCP permission requests out of band without sending them back to Brain', async () => {
    const brainPrompts: string[] = []
    let resolveCalls = 0
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) return jsonResponse({ tools: [] })
      if (url.endsWith('/api/brain/complete')) {
        const request = JSON.parse(String(init?.body)) as { systemPrompt: string }
        brainPrompts.push(request.systemPrompt)
        return jsonResponse({
          content: '{"tool":"__create_tool","args":{"description":"Send a requested SMS","requirements":[]}}',
        })
      }
      if (url.endsWith('/api/tool-executor/tools/resolve')) {
        resolveCalls++
        return jsonResponse({
          success: false,
          permissionRequired: true,
          request: { id: 'perm-mission-test', neededCapability: 'send SMS' },
          candidate: { id: 'mcp-sms', name: 'SMS via MCP' },
          prompt: 'The user must approve this tool.',
        }, 202)
      }
      throw new Error(`Unexpected request: ${url}`)
    }

    const result = await new AgentExecutor({ fetcher }).execute(definition, task() as AgentTask, {
      missionId: 'mission-1',
      delegationDepth: 0,
    })

    expect(result.output).toMatch(/^__MISSION_PERMISSION__:/)
    expect(result.actionReceipts).toEqual([
      expect.objectContaining({ outcome: 'permission_required', isError: true }),
    ])
    expect(resolveCalls).toBe(1)
    expect(brainPrompts).toHaveLength(1)
    expect(brainPrompts[0]).not.toContain('The user must approve this tool.')
  })

  it('does not replay a successful action already recorded before a mission interruption', async () => {
    const action = { tool: 'send-message', args: { recipient: 'user-42', body: 'Hello' } }
    const actionKey = createHash('sha256')
      .update(`${action.tool}:${JSON.stringify(action.args)}`)
      .digest('hex')
    let brainTurn = 0
    let executions = 0
    const fetcher: typeof fetch = async (input) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) {
        return jsonResponse({
          tools: [{ id: 'send-message', name: 'Send Message', description: 'Send a message', type: 'code' }],
        })
      }
      if (url.endsWith('/api/brain/complete')) {
        brainTurn++
        return jsonResponse({
          content: brainTurn === 1
            ? JSON.stringify(action)
            : 'The earlier successful delivery remains valid.',
        })
      }
      if (url.endsWith('/api/tool-executor/tools/execute')) {
        executions++
        return jsonResponse({ status: 'completed', output: { sent: true } })
      }
      throw new Error(`Unexpected request: ${url}`)
    }

    const result = await new AgentExecutor({ fetcher }).execute(definition, {
      ...(task() as AgentTask),
      input: {
        prompt: 'Continue after asking the user.',
        context: {
          priorActionReceipts: [{
            toolId: action.tool,
            isError: false,
            content: '{"sent":true}',
            outcome: 'success',
            actionKey,
          }],
        },
      },
    }, {
      missionId: 'mission-1',
      delegationDepth: 0,
    })

    expect(result.output).toBe('The earlier successful delivery remains valid.')
    expect(executions).toBe(0)
    expect(result.actionReceipts[0]).toMatchObject({ actionKey, outcome: 'success' })
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
    expect(calls.some((call) => call.url.endsWith('/api/tool-executor/tools/resolve'))).toBe(false)
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

  it('lets an Agent inspect only the tools visible under its policy', async () => {
    const calls: string[] = []
    let brainTurn = 0
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith('/api/tool-executor/tools')) {
        return jsonResponse({
          tools: [
            {
              id: 'allowed-tool',
              name: 'Allowed Tool',
              description: 'Allowed',
              type: 'code',
              inputSchema: { type: 'object', required: ['value'], properties: { value: { type: 'integer' } } },
            },
            { id: 'blocked-tool', name: 'Blocked Tool', description: 'Blocked', type: 'code' },
          ],
        })
      }
      if (url.endsWith('/api/brain/complete')) {
        brainTurn++
        return jsonResponse({
          content: brainTurn === 1
            ? '{"tool":"__list_tools","args":{}}'
            : 'The allowed tool catalog was verified.',
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    }
    const restrictedAgent: AgentDefinition = {
      ...definition,
      tools: ['allowed-tool'],
      toolPolicy: { mode: 'allowlist' },
    }
    const requiredTask: AgentTask = {
      ...task(),
      agentId: restrictedAgent.id,
      createdAt: new Date().toISOString(),
      input: {
        prompt: 'Verify the visible tool catalog.',
        context: { requiredActions: [{ toolId: '__list_tools', outcome: 'success' }] },
      },
    }

    const result = await new AgentExecutor({ fetcher }).execute(
      restrictedAgent,
      requiredTask,
      { missionId: 'mission-1', delegationDepth: 0 },
    )
    const catalogReceipt = result.actionReceipts?.find((receipt) => receipt.toolId === '__list_tools')

    expect(result.output).toContain('catalog was verified')
    expect(catalogReceipt?.outcome).toBe('success')
    expect(JSON.parse(catalogReceipt?.content || '[]')).toEqual([{
      id: 'allowed-tool',
      name: 'Allowed Tool',
      description: 'Allowed',
      type: 'code',
      inputs: 'value:integer!',
    }])
    expect(calls.filter((url) => url.endsWith('/api/tool-executor/tools/execute'))).toHaveLength(0)
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
    expect(Buffer.byteLength(brainRequest)).toBeLessThan(192 * 1024)
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

  it('does not return success when the Brain-call budget ends after an action', async () => {
    let toolExecutions = 0
    const fetcher: typeof fetch = async (input) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) {
        return jsonResponse({
          tools: [{ id: 'lookup', name: 'Lookup', description: 'Look up a record', type: 'code' }],
        })
      }
      if (url.endsWith('/api/brain/complete')) {
        return jsonResponse({ content: '{"tool":"lookup","args":{"query":"record"}}' })
      }
      if (url.endsWith('/api/tool-executor/tools/execute')) {
        toolExecutions++
        return jsonResponse({ status: 'completed', output: { record: 'found' } })
      }
      if (url.endsWith('/api/brain/complaint')) return jsonResponse({ success: true })
      throw new Error(`Unexpected request: ${url}`)
    }

    await expect(new AgentExecutor({ fetcher }).execute(definition, task() as AgentTask, {
      missionId: 'mission-1',
      delegationDepth: 0,
      executionPolicy: {
        ...DEFAULT_AGENT_EXECUTION_POLICY,
        maxBrainCalls: 1,
        maxActions: 1,
      },
    })).rejects.toThrow('exhausted its 1-call Brain execution budget')
    expect(toolExecutions).toBe(1)
  })

  it('fails instead of reporting success after repeating an action without progress', async () => {
    let brainCalls = 0
    let toolExecutions = 0
    const fetcher: typeof fetch = async (input) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) {
        return jsonResponse({
          tools: [{ id: 'lookup', name: 'Lookup', description: 'Look up a record', type: 'code' }],
        })
      }
      if (url.endsWith('/api/brain/complete')) {
        brainCalls++
        return jsonResponse({
          content: '{"tool":"lookup","args":{"query":"same"}}',
          requestId: `request-${brainCalls}`,
        })
      }
      if (url.endsWith('/api/tool-executor/tools/execute')) {
        toolExecutions++
        return jsonResponse({ status: 'completed', output: { record: 'found' } })
      }
      if (url.endsWith('/api/brain/complaint')) return jsonResponse({ success: true })
      throw new Error(`Unexpected request: ${url}`)
    }

    await expect(new AgentExecutor({ fetcher }).execute(definition, task() as AgentTask, {
      missionId: 'mission-1',
      delegationDepth: 0,
      executionPolicy: {
        ...DEFAULT_AGENT_EXECUTION_POLICY,
        maxBrainCalls: 5,
      },
    })).rejects.toThrow('repeated the same action without progress')
    expect(brainCalls).toBe(3)
    expect(toolExecutions).toBe(2)
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

  it('allows an explicitly bounded 8192-token planning completion', async () => {
    let requestedMaxTokens: number | undefined
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/brain/complete')) {
        requestedMaxTokens = (JSON.parse(String(init?.body)) as { maxTokens: number }).maxTokens
        return jsonResponse({ content: 'Plan generated.' })
      }
      throw new Error(`Unexpected request: ${url}`)
    }
    const executionPolicy: AgentExecutionPolicy = {
      ...DEFAULT_AGENT_EXECUTION_POLICY,
      maxBrainCalls: 1,
      maxActions: 0,
      maxCompletionTokens: 8_192,
      maxCompletionTokensPerCall: 8_192,
      maxDelegations: 0,
    }

    await new AgentExecutor({ fetcher }).execute(definition, task() as AgentTask, {
      missionId: 'mission-1',
      delegationDepth: 0,
      executionPolicy,
    })

    expect(requestedMaxTokens).toBe(8_192)
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
    let retryPrompt = ''
    let retryDispatcher: RequestInit['dispatcher']
    const recoveredFetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/tool-executor/tools')) return jsonResponse({ tools: [] })
      if (url.endsWith('/api/brain/complete')) {
        retryBrainCalls++
        const body = JSON.parse(String(init?.body)) as { prompt: string }
        retryPrompt = body.prompt
        retryDispatcher = init?.dispatcher
        return jsonResponse({ content: 'Recovered without replaying an action.' })
      }
      throw new Error(`Unexpected request: ${url}`)
    }
    const continuationRuntime = new PersistentAgentRuntime(persistence, new AgentExecutor({ fetcher: recoveredFetcher }))
    continuationRuntime.registerAgentForMission('mission-1', retryAgent)
    await continuationRuntime.startAgent(retryAgent.id, 'mission-1')
    const continuationTask = await continuationRuntime.submitTask(retryAgent.id, task('next-safe-task'))
    await expect(continuationRuntime.executeTask(retryAgent.id, continuationTask.taskId))
      .resolves.toMatchObject({
        status: 'completed',
        result: expect.objectContaining({ output: expect.stringContaining('Recovered without replaying an action.') }),
      })

    const restartedRuntime = new PersistentAgentRuntime(persistence, new AgentExecutor({ fetcher: recoveredFetcher }))
    restartedRuntime.registerAgentForMission('mission-1', retryAgent)
    await restartedRuntime.startAgent(retryAgent.id, 'mission-1')
    const restoredTask = await restartedRuntime.submitTask(retryAgent.id, task('retry-safe-checkpoint'))
    const guidance = 'Use existing receipts and return the required artifacts without repeating actions.'
    const result = await restartedRuntime.executeTask(retryAgent.id, restoredTask.taskId, false, 0, guidance)

    expect(result.result).toMatchObject({
      output: expect.stringContaining('Recovered without replaying an action.'),
    })
    expect(retryPrompt).toContain(`Retry guidance for this resumed task:\n${guidance}`)
    expect(retryDispatcher).toBeDefined()
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
