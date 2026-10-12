import { logger } from '@stage7-nextgen/shared'
import {
  AgentDefinition,
  AgentExecutionPolicy,
  AgentTask,
  DEFAULT_AGENT_EXECUTION_POLICY,
} from '../types'

interface ToolDescriptor {
  id: string
  name: string
  description: string
  type: string
  manifest?: Record<string, unknown>
  inputSchema?: Record<string, unknown>
}

interface ToolCatalogResponse {
  tools?: ToolDescriptor[]
}

interface BrainResponse {
  content?: string
  tokensUsed?: number
}

interface ToolExecutionResponse {
  status?: string
  output?: unknown
  error?: string
}

interface PluginGenerationResponse {
  success?: boolean
  error?: string
  tool?: ToolDescriptor
}

export interface AgentDelegateRequest {
  goal: string
  role?: string
  systemPrompt?: string
}

export interface AgentExecutorOptions {
  brainUrl?: string
  toolExecutorUrl?: string
  fetcher?: typeof fetch
  maxIterations?: number
  maxDelegationDepth?: number
}

export interface AgentExecutionContext {
  missionId: string
  delegationDepth: number
  executionPolicy?: AgentExecutionPolicy
  delegate?: (request: AgentDelegateRequest) => Promise<unknown>
}

export interface AgentExecutionResult {
  output: string
  tokensUsed: number
  toolCalls: number
  brainCalls: number
  completionTokensReserved: number
}

interface AgentAction {
  tool: string
  args: Record<string, unknown>
}

interface ToolResult {
  isError: boolean
  content: string
}

const CREATE_TOOL_ACTION = '__create_tool'
const DELEGATE_ACTION = '__delegate'
const MAX_TOOL_DESCRIPTION_LENGTH = 200
const MAX_BRAIN_REQUEST_BYTES = 96 * 1024
const MAX_COMPLETION_TOKENS_PER_CALL = 4_096

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function parseAction(content: string): AgentAction | undefined {
  const normalized = content.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  try {
    const parsed = asRecord(JSON.parse(normalized))
    const args = asRecord(parsed?.args)
    if (typeof parsed?.tool !== 'string' || !args) return undefined
    return { tool: parsed.tool, args }
  } catch {
    return undefined
  }
}

export class AgentExecutor {
  private readonly brainUrl: string
  private readonly toolExecutorUrl: string
  private readonly fetcher: typeof fetch
  private readonly maxIterations: number
  readonly maxDelegationDepth: number

  constructor(options: AgentExecutorOptions = {}) {
    this.brainUrl = (options.brainUrl || process.env.BRAIN_URL || 'http://brain:3100').replace(/\/$/, '')
    this.toolExecutorUrl = (options.toolExecutorUrl || process.env.TOOL_EXECUTOR_URL || 'http://tool-executor:3500').replace(/\/$/, '')
    this.fetcher = options.fetcher || ((input, init) => fetch(input, init))
    this.maxIterations = options.maxIterations ?? 12
    this.maxDelegationDepth = options.maxDelegationDepth ?? 3
    if (!Number.isInteger(this.maxIterations) || this.maxIterations < 1 || this.maxIterations > 50) {
      throw new Error('Agent maxIterations must be an integer between 1 and 50')
    }
    if (!Number.isInteger(this.maxDelegationDepth) || this.maxDelegationDepth < 0 || this.maxDelegationDepth > 8) {
      throw new Error('Agent maxDelegationDepth must be an integer between 0 and 8')
    }
  }

  async execute(
    definition: AgentDefinition,
    task: AgentTask,
    context: AgentExecutionContext,
  ): Promise<AgentExecutionResult> {
    const taskInput = asRecord(task.input) || {}
    const taskContext = asRecord(taskInput.context) || {}
    const prompt = typeof taskInput.prompt === 'string' ? taskInput.prompt : JSON.stringify(taskInput)
    const history: Array<{ role: 'user' | 'assistant'; content: string }> = [
      {
        role: 'user',
        content: `Mission ID: ${context.missionId}\nTask: ${prompt}\nContext: ${JSON.stringify(taskContext)}`,
      },
    ]
    let tokensUsed = 0
    let toolCalls = 0
    let brainCalls = 0
    let completionTokensReserved = 0
    let delegations = 0
    let lastAction = ''
    let repeatedActionCount = 0
    const policy = this.resolvePolicy(context.executionPolicy)
    const brainCallLimit = Math.min(this.maxIterations, policy.maxBrainCalls)

    for (let iteration = 0; iteration < brainCallLimit; iteration++) {
      const tools = policy.maxActions > 0 ? await this.listTools() : []
      const remainingCompletionTokens = policy.maxCompletionTokens - completionTokensReserved
      if (remainingCompletionTokens <= 0) {
        throw new Error(`Agent ${definition.id} exhausted its ${policy.maxCompletionTokens}-token completion budget`)
      }
      const systemPrompt = this.buildSystemPrompt(
        definition.systemPrompt,
        tools,
        context.delegationDepth,
        policy,
        brainCallLimit - brainCalls,
        policy.maxActions - toolCalls,
        remainingCompletionTokens,
        policy.maxDelegations - delegations,
      )
      const maxTokens = Math.min(policy.maxCompletionTokensPerCall, remainingCompletionTokens)
      const completion = await this.complete(definition, context.missionId, systemPrompt, history, maxTokens)
      brainCalls++
      completionTokensReserved += maxTokens
      tokensUsed += completion.tokensUsed || 0
      const content = (completion.content || '').trim()
      if (!content) throw new Error(`Agent ${definition.id} received an empty Brain response`)

      const action = parseAction(content)
      if (!action) {
        return { output: content, tokensUsed, toolCalls, brainCalls, completionTokensReserved }
      }
      if (toolCalls >= policy.maxActions) {
        throw new Error(`Agent ${definition.id} exhausted its ${policy.maxActions}-action execution budget`)
      }

      const signature = `${action.tool}:${JSON.stringify(action.args)}`
      repeatedActionCount = signature === lastAction ? repeatedActionCount + 1 : 0
      lastAction = signature
      if (repeatedActionCount >= 2) {
        throw new Error(`Agent ${definition.id} repeated the same action without progress: ${action.tool}`)
      }

      toolCalls++
      let result: ToolResult
      if (action.tool === DELEGATE_ACTION && delegations >= policy.maxDelegations) {
        result = {
          isError: true,
          content: `Agent delegation budget exhausted (${policy.maxDelegations} subtasks maximum). Complete the task without delegating further or explain the blocker.`,
        }
      } else {
        if (action.tool === DELEGATE_ACTION) delegations++
        result = await this.executeAction(action, tools, definition, context)
      }
      history.push(
        { role: 'assistant', content },
        {
          role: 'user',
          content: result.isError
            ? `Action failed: ${result.content}\nChoose a safe correction, another available tool, delegation, or explain the blocker.`
            : `Action result: ${result.content}\nContinue toward the task goal. If complete, return the final answer as plain text.`,
        },
      )
    }

    throw new Error(`Agent ${definition.id} exceeded its ${brainCallLimit}-call Brain budget`)
  }

  private resolvePolicy(policy?: AgentExecutionPolicy): AgentExecutionPolicy {
    const resolved = policy || DEFAULT_AGENT_EXECUTION_POLICY
    const limits: Array<[keyof AgentExecutionPolicy, number, number]> = [
      ['maxBrainCalls', resolved.maxBrainCalls, DEFAULT_AGENT_EXECUTION_POLICY.maxBrainCalls],
      ['maxActions', resolved.maxActions, DEFAULT_AGENT_EXECUTION_POLICY.maxActions],
      ['maxCompletionTokens', resolved.maxCompletionTokens, DEFAULT_AGENT_EXECUTION_POLICY.maxCompletionTokens],
      ['maxCompletionTokensPerCall', resolved.maxCompletionTokensPerCall ?? DEFAULT_AGENT_EXECUTION_POLICY.maxCompletionTokensPerCall, MAX_COMPLETION_TOKENS_PER_CALL],
      ['maxDelegations', resolved.maxDelegations, DEFAULT_AGENT_EXECUTION_POLICY.maxDelegations],
    ]
    for (const [name, value, maximum] of limits) {
      const minimum = name === 'maxDelegations' || name === 'maxActions' ? 0 : 1
      if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw new Error(`Agent execution policy ${name} must be an integer between ${minimum} and ${maximum}`)
      }
    }
    const maxCompletionTokensPerCall = resolved.maxCompletionTokensPerCall ?? DEFAULT_AGENT_EXECUTION_POLICY.maxCompletionTokensPerCall
    if (maxCompletionTokensPerCall > resolved.maxCompletionTokens) {
      throw new Error('Agent execution policy maxCompletionTokensPerCall cannot exceed maxCompletionTokens')
    }
    return { ...resolved, maxCompletionTokensPerCall }
  }

  private buildSystemPrompt(
    base: string,
    tools: ToolDescriptor[],
    delegationDepth: number,
    policy: AgentExecutionPolicy,
    remainingBrainCalls: number,
    remainingActions: number,
    remainingCompletionTokens: number,
    remainingDelegations: number,
  ): string {
    const catalog = tools.map(({ id, name, description, type, inputSchema }) => {
      const schema = asRecord(inputSchema)
      const properties = asRecord(schema?.properties) || {}
      const required = Array.isArray(schema?.required)
        ? schema.required.filter((field): field is string => typeof field === 'string')
        : []
      const inputs = Object.entries(properties)
        .slice(0, 20)
        .map(([key, value]) => {
          const property = asRecord(value)
          const propertyType = typeof property?.type === 'string' ? property.type : 'object'
          return `${key}:${propertyType}${required.includes(key) ? '!' : ''}`
        })
        .join(', ')
      return {
        id,
        name,
        description: description.slice(0, MAX_TOOL_DESCRIPTION_LENGTH),
        type,
        inputs,
      }
    })
    const delegation = delegationDepth < this.maxDelegationDepth && remainingDelegations > 0
      ? `You may delegate a bounded subtask with {"tool":"${DELEGATE_ACTION}","args":{"goal":"...","role":"...","systemPrompt":"..."}}.`
      : 'You may not delegate further in this execution.'

    return [
      base || 'You are an autonomous mission agent. Complete the assigned task and report what you did.',
      'You are a mission-scoped Agent, not the persistent domain Assistant. Use Brain and system tools as needed.',
      `Execution policy caps: ${policy.maxBrainCalls} Brain calls, ${policy.maxActions} tool/delegation actions, ${policy.maxCompletionTokens} total generated completion tokens, ${policy.maxCompletionTokensPerCall} tokens per completion, and ${policy.maxDelegations} delegated subtasks.`,
      `Remaining budget: ${remainingBrainCalls} Brain calls, ${remainingActions} actions, ${remainingCompletionTokens} generated completion tokens, and ${remainingDelegations} delegations.`,
      'To call a registered system tool, respond with ONLY JSON: {"tool":"<tool-id>","args":{...}}.',
      `Available system tools (the live catalog; generated tools appear after registration): ${JSON.stringify(catalog)}`,
      `If no available tool can satisfy a concrete capability need, request one with {"tool":"${CREATE_TOOL_ACTION}","args":{"description":"...","requirements":["..."]}}. Do not claim a tool was created unless it is registered and available.`,
      delegation,
      'Tool errors are evidence; do not claim success when an action failed. Stop after the task is complete or explain a blocker.',
    ].join('\n\n')
  }

  private async complete(
    definition: AgentDefinition,
    missionId: string,
    systemPrompt: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    maxTokens: number,
  ): Promise<BrainResponse> {
    const requestBody = JSON.stringify({
      prompt: history.map((message) => `${message.role === 'user' ? 'User' : 'Agent'}: ${message.content}`).join('\n\n'),
      systemPrompt,
      maxTokens,
      temperature: 0.3,
      missionId,
    })
    const requestBytes = Buffer.byteLength(requestBody)
    if (requestBytes > MAX_BRAIN_REQUEST_BYTES) {
      throw new Error(
        `Brain request for Agent ${definition.id} is ${requestBytes} bytes, exceeding the ${MAX_BRAIN_REQUEST_BYTES}-byte service limit; reduce the task context or tool output.`,
      )
    }

    const response = await this.fetcher(`${this.brainUrl}/api/brain/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Brain request failed (${response.status}): ${text.slice(0, 300)}`)
    }
    const result = await response.json() as BrainResponse
    if (typeof result.content !== 'string') {
      throw new Error('Brain returned a completion without content')
    }
    return result
  }

  private async listTools(): Promise<ToolDescriptor[]> {
    const response = await this.fetcher(`${this.toolExecutorUrl}/api/tool-executor/tools`)
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Tool catalog request failed (${response.status}): ${text.slice(0, 300)}`)
    }
    const result = await response.json() as ToolCatalogResponse
    if (!Array.isArray(result.tools)) throw new Error('Tool catalog response did not contain a tools array')
    return result.tools.filter((tool) =>
      typeof tool.id === 'string'
      && typeof tool.name === 'string'
      && typeof tool.description === 'string'
      && typeof tool.type === 'string',
    )
  }

  private async executeAction(
    action: AgentAction,
    tools: ToolDescriptor[],
    definition: AgentDefinition,
    context: AgentExecutionContext,
  ): Promise<ToolResult> {
    if (action.tool === CREATE_TOOL_ACTION) {
      return this.createTool(action.args, context)
    }
    if (action.tool === DELEGATE_ACTION) {
      return this.delegate(action.args, context)
    }

    const tool = tools.find((candidate) => candidate.id === action.tool || candidate.name === action.tool)
    if (!tool) {
      return { isError: true, content: `Tool '${action.tool}' is not in the live system catalog.` }
    }

    try {
      const response = await this.fetcher(`${this.toolExecutorUrl}/api/tool-executor/tools/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: tool.id,
          name: tool.id,
          type: tool.type,
          manifest: {},
          input: action.args,
          agentId: definition.id,
          context: { missionId: context.missionId, agentId: definition.id },
        }),
      })
      const result = await response.json() as ToolExecutionResponse
      if (!response.ok || result.status !== 'completed') {
        return {
          isError: true,
          content: result.error || `Tool '${tool.name}' failed with HTTP ${response.status}`,
        }
      }
      return { isError: false, content: JSON.stringify(result.output ?? {}) }
    } catch (error) {
      logger.warn(
        { agentId: definition.id, toolId: tool.id, error: error instanceof Error ? error.message : String(error) },
        'Agent tool call failed',
      )
      return { isError: true, content: error instanceof Error ? error.message : String(error) }
    }
  }

  private async createTool(args: Record<string, unknown>, context: AgentExecutionContext): Promise<ToolResult> {
    const description = typeof args.description === 'string' ? args.description.trim() : ''
    if (!description) return { isError: true, content: 'Tool creation requires a non-empty description.' }
    const requirements = Array.isArray(args.requirements)
      ? args.requirements.filter((value): value is string => typeof value === 'string')
      : []

    try {
      const response = await this.fetcher(`${this.toolExecutorUrl}/api/tool-executor/plugins/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          requirements,
          context: { missionId: context.missionId },
        }),
      })
      const result = await response.json() as PluginGenerationResponse
      if (!response.ok || !result.success || !result.tool) {
        return { isError: true, content: result.error || `Tool generation failed with HTTP ${response.status}` }
      }
      if (result.tool.manifest?.requiresInstallation === true) {
        return { isError: true, content: `Discovered '${result.tool.name}', but it requires installation before use.` }
      }

      const catalog = await this.listTools()
      const registered = catalog.find((tool) => tool.id === result.tool?.id || tool.name === result.tool?.name)
      if (!registered) {
        return { isError: true, content: `Generated tool '${result.tool.name}' was not registered in the system catalog.` }
      }
      return {
        isError: false,
        content: `Created and registered tool '${registered.name}' (${registered.id}). It is now available in the live tool catalog.`,
      }
    } catch (error) {
      return { isError: true, content: error instanceof Error ? error.message : String(error) }
    }
  }

  private async delegate(args: Record<string, unknown>, context: AgentExecutionContext): Promise<ToolResult> {
    if (!context.delegate) return { isError: true, content: 'Delegation is not available in this execution context.' }
    const goal = typeof args.goal === 'string' ? args.goal.trim() : ''
    if (!goal) return { isError: true, content: 'Delegation requires a non-empty goal.' }
    try {
      const result = await context.delegate({
        goal,
        ...(typeof args.role === 'string' ? { role: args.role } : {}),
        ...(typeof args.systemPrompt === 'string' ? { systemPrompt: args.systemPrompt } : {}),
      })
      return { isError: false, content: JSON.stringify(result) }
    } catch (error) {
      return { isError: true, content: error instanceof Error ? error.message : String(error) }
    }
  }
}
