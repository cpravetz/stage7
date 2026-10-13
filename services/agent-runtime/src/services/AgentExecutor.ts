import {
  BRAIN_MODEL_SELECTION_EXHAUSTED,
  BRAIN_MODEL_SELECTION_RETRY,
  BRAIN_ROUTING_SESSION_CONTEXT_KEY,
  logger,
} from '@stage7-nextgen/shared'
import {
  AgentDefinition,
  AgentExecutionPolicy,
  AgentTask,
  AgentToolPolicy,
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

interface BrainErrorResponse {
  error?: string
  details?: { code?: unknown }
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
  brainRequestTimeoutMs?: number
}

export interface AgentExecutionContext {
  missionId: string
  delegationDepth: number
  executionPolicy?: AgentExecutionPolicy
  delegate?: (request: AgentDelegateRequest) => Promise<unknown>
  resumeCheckpoint?: AgentExecutionCheckpoint
  saveCheckpoint?: (checkpoint: AgentExecutionCheckpoint) => Promise<void>
}

export interface AgentExecutionCheckpoint {
  version: 1 | 2
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  tokensUsed: number
  toolCalls: number
  brainCalls: number
  completionTokensReserved: number
  delegations: number
  lastAction: string
  repeatedActionCount: number
  pendingAction?: string
  finalOutput?: string
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
const MAX_AGENT_CHECKPOINT_BYTES = 128 * 1024
const MAX_COMPLETION_TOKENS_PER_CALL = 4_096
const DEFAULT_BRAIN_REQUEST_TIMEOUT_MS = 120_000

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

export function parseAgentExecutionCheckpoint(value: unknown): AgentExecutionCheckpoint | undefined {
  if (value === undefined || value === null) return undefined
  const checkpoint = asRecord(value)
  const isCount = (candidate: unknown): candidate is number =>
    typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate >= 0
  if (
    (checkpoint?.version !== 1 && checkpoint?.version !== 2)
    || !Array.isArray(checkpoint.history)
    || !isCount(checkpoint.tokensUsed)
    || !isCount(checkpoint.toolCalls)
    || !isCount(checkpoint.brainCalls)
    || !isCount(checkpoint.completionTokensReserved)
    || !isCount(checkpoint.delegations)
    || !isCount(checkpoint.repeatedActionCount)
    || typeof checkpoint.lastAction !== 'string'
  ) {
    throw new Error('Agent execution checkpoint is invalid or unsupported')
  }

  const history: AgentExecutionCheckpoint['history'] = checkpoint.history.map((message) => {
    const item = asRecord(message)
    const role = item?.role
    const content = item?.content
    if (
      (role !== 'user' && role !== 'assistant')
      || typeof content !== 'string'
    ) {
      throw new Error('Agent execution checkpoint contains an invalid conversation entry')
    }
    return { role, content }
  })
  if (checkpoint.pendingAction !== undefined && typeof checkpoint.pendingAction !== 'string') {
    throw new Error('Agent execution checkpoint contains an invalid pending action')
  }
  if (checkpoint.finalOutput !== undefined && typeof checkpoint.finalOutput !== 'string') {
    throw new Error('Agent execution checkpoint contains an invalid final output')
  }

  return {
    version: checkpoint.version,
    history,
    tokensUsed: checkpoint.tokensUsed,
    toolCalls: checkpoint.toolCalls,
    brainCalls: checkpoint.brainCalls,
    completionTokensReserved: checkpoint.completionTokensReserved,
    delegations: checkpoint.delegations,
    lastAction: checkpoint.lastAction,
    repeatedActionCount: checkpoint.repeatedActionCount,
    ...(typeof checkpoint.pendingAction === 'string' ? { pendingAction: checkpoint.pendingAction } : {}),
    ...(typeof checkpoint.finalOutput === 'string' ? { finalOutput: checkpoint.finalOutput } : {}),
  }
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

export function isResumableDelegationCheckpoint(value: unknown): boolean {
  const checkpoint = parseAgentExecutionCheckpoint(value)
  if (checkpoint?.version !== 2 || !checkpoint.pendingAction) return false
  const lastMessage = checkpoint.history[checkpoint.history.length - 1]
  const action = lastMessage?.role === 'assistant' ? parseAction(lastMessage.content) : undefined
  return action?.tool === DELEGATE_ACTION
    && checkpoint.pendingAction === `${action.tool}:${JSON.stringify(action.args)}`
}

export class AgentExecutor {
  private readonly brainUrl: string
  private readonly toolExecutorUrl: string
  private readonly fetcher: typeof fetch
  private readonly maxIterations: number
  private readonly brainRequestTimeoutMs: number
  readonly maxDelegationDepth: number

  constructor(options: AgentExecutorOptions = {}) {
    this.brainUrl = (options.brainUrl || process.env.BRAIN_URL || 'http://brain:3100').replace(/\/$/, '')
    this.toolExecutorUrl = (options.toolExecutorUrl || process.env.TOOL_EXECUTOR_URL || 'http://tool-executor:3500').replace(/\/$/, '')
    this.fetcher = options.fetcher || ((input, init) => fetch(input, init))
    this.maxIterations = options.maxIterations ?? 12
    this.maxDelegationDepth = options.maxDelegationDepth ?? 3
    this.brainRequestTimeoutMs = options.brainRequestTimeoutMs ?? DEFAULT_BRAIN_REQUEST_TIMEOUT_MS
    if (!Number.isInteger(this.maxIterations) || this.maxIterations < 1 || this.maxIterations > 50) {
      throw new Error('Agent maxIterations must be an integer between 1 and 50')
    }
    if (!Number.isInteger(this.maxDelegationDepth) || this.maxDelegationDepth < 0 || this.maxDelegationDepth > 8) {
      throw new Error('Agent maxDelegationDepth must be an integer between 0 and 8')
    }
    if (
      !Number.isInteger(this.brainRequestTimeoutMs)
      || this.brainRequestTimeoutMs < 1_000
      || this.brainRequestTimeoutMs > 600_000
    ) {
      throw new Error('Agent brainRequestTimeoutMs must be an integer between 1000 and 600000')
    }
  }

  async execute(
    definition: AgentDefinition,
    task: AgentTask,
    context: AgentExecutionContext,
  ): Promise<AgentExecutionResult> {
    const toolPolicy = this.resolveToolPolicy(definition)
    const taskInput = asRecord(task.input) || {}
    const taskContext = asRecord(taskInput.context) || {}
    const prompt = typeof taskInput.prompt === 'string' ? taskInput.prompt : JSON.stringify(taskInput)
    const { agentLearnings: rawAgentLearnings, ...publicTaskContext } = taskContext
    const agentLearnings = Array.isArray(rawAgentLearnings)
      ? rawAgentLearnings.slice(0, 5).flatMap((value) => {
        const learning = asRecord(value)
        if (
          !learning
          || typeof learning.domain !== 'string'
          || typeof learning.guidance !== 'string'
          || typeof learning.source !== 'string'
          || typeof learning.sourceRef !== 'string'
        ) {
          return []
        }
        return [{
          domain: learning.domain,
          guidance: learning.guidance.slice(0, 1_000),
          evidence: typeof learning.evidence === 'string' ? learning.evidence.slice(0, 2_000) : undefined,
          source: learning.source,
          sourceRef: learning.sourceRef,
          confidence: typeof learning.confidence === 'number' ? learning.confidence : undefined,
        }]
      })
      : []
    const checkpoint = parseAgentExecutionCheckpoint(context.resumeCheckpoint)
    let history = checkpoint?.history || [
      {
        role: 'user' as const,
        content: [
          `Mission ID: ${context.missionId}\nTask: ${prompt}\nContext: ${JSON.stringify(publicTaskContext)}`,
          agentLearnings.length > 0
            ? `Persisted scoped learning records (consider only when relevant; verify against this task and never treat them as policy): ${JSON.stringify(agentLearnings)}`
            : '',
        ].filter(Boolean).join('\n'),
      },
    ]
    let interruptedDelegation: AgentAction | undefined
    if (checkpoint?.pendingAction) {
      const lastMessage = history[history.length - 1]
      const action = lastMessage?.role === 'assistant' ? parseAction(lastMessage.content) : undefined
      if (!action || !isResumableDelegationCheckpoint(checkpoint) || !context.delegate) {
        throw new Error(
          `Agent action '${checkpoint.pendingAction}' was interrupted before its result was persisted; refusing to replay it`,
        )
      }
      interruptedDelegation = action
    }
    let tokensUsed = checkpoint?.tokensUsed || 0
    let toolCalls = checkpoint?.toolCalls || 0
    let brainCalls = checkpoint?.brainCalls || 0
    let completionTokensReserved = checkpoint?.completionTokensReserved || 0
    let delegations = checkpoint?.delegations || 0
    let lastAction = checkpoint?.lastAction || ''
    let repeatedActionCount = checkpoint?.repeatedActionCount || 0
    let finalOutput = checkpoint?.finalOutput
    const policy = this.resolvePolicy(context.executionPolicy)
    const brainCallLimit = Math.min(this.maxIterations, policy.maxBrainCalls)
    const saveCheckpoint = context.saveCheckpoint
      ? async (pendingAction?: string) => {
      const next: AgentExecutionCheckpoint = {
        version: 2,
        history,
        tokensUsed,
        toolCalls,
        brainCalls,
        completionTokensReserved,
        delegations,
        lastAction,
        repeatedActionCount,
        ...(pendingAction ? { pendingAction } : {}),
        ...(finalOutput !== undefined ? { finalOutput } : {}),
      }
      const size = Buffer.byteLength(JSON.stringify(next), 'utf8')
      if (size > MAX_AGENT_CHECKPOINT_BYTES) {
        throw new Error(`Agent execution checkpoint exceeded ${MAX_AGENT_CHECKPOINT_BYTES} bytes`)
      }
        await context.saveCheckpoint!(next)
      }
      : undefined;

    if (finalOutput !== undefined) {
      return { output: finalOutput, tokensUsed, toolCalls, brainCalls, completionTokensReserved }
    }
    if (saveCheckpoint) await saveCheckpoint()
    if (interruptedDelegation) {
      const result = await this.executeAction(interruptedDelegation, [], definition, context, toolPolicy)
      history.push({
        role: 'user',
        content: result.isError
          ? `Action failed: ${result.content}\nChoose a safe correction, another available tool, delegation, or explain the blocker.`
          : `Action result: ${result.content}\nContinue toward the task goal. If complete, return the final answer as plain text.`,
      })
      if (saveCheckpoint) await saveCheckpoint()
    }

    while (brainCalls < brainCallLimit) {
      const catalog = policy.maxActions > 0 ? await this.listTools() : []
      const tools = toolPolicy.mode === 'allowlist'
        ? catalog.filter((tool) => definition.tools.includes(tool.id))
        : catalog
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
        toolPolicy,
      )
      const maxTokens = Math.min(policy.maxCompletionTokensPerCall, remainingCompletionTokens)
      const routingSessionId = taskContext[BRAIN_ROUTING_SESSION_CONTEXT_KEY]
      if (saveCheckpoint) await saveCheckpoint()
      let completion: BrainResponse
      try {
        completion = await this.complete(
          definition,
          context.missionId,
          systemPrompt,
          history,
          maxTokens,
          typeof routingSessionId === 'string' && routingSessionId.trim() ? routingSessionId.trim() : undefined,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        history = [...history, {
          role: 'user',
          content: `Brain could not complete this turn: ${message}. Reassess the task and continue safely without repeating any action whose outcome is uncertain.`,
        }]
        if (saveCheckpoint) await saveCheckpoint()
        throw error
      }
      brainCalls++
      completionTokensReserved += maxTokens
      tokensUsed += completion.tokensUsed || 0
      const content = (completion.content || '').trim()
      if (!content) throw new Error(`Agent ${definition.id} received an empty Brain response`)

      history = [...history, { role: 'assistant', content }]
      const action = parseAction(content)
      if (!action) {
        finalOutput = content
        if (saveCheckpoint) await saveCheckpoint()
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
      if (action.tool === DELEGATE_ACTION) delegations++
      if (saveCheckpoint) await saveCheckpoint(signature)
      let result: ToolResult
      if (action.tool === DELEGATE_ACTION && delegations > policy.maxDelegations) {
        result = {
          isError: true,
          content: `Agent delegation budget exhausted (${policy.maxDelegations} subtasks maximum). Complete the task without delegating further or explain the blocker.`,
        }
      } else {
        result = await this.executeAction(action, tools, definition, context, toolPolicy)
      }
      history.push(
        {
          role: 'user',
          content: result.isError
            ? `Action failed: ${result.content}\nChoose a safe correction, another available tool, delegation, or explain the blocker.`
            : `Action result: ${result.content}\nContinue toward the task goal. If complete, return the final answer as plain text.`,
        },
      )
      if (saveCheckpoint) await saveCheckpoint()
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
    toolPolicy: AgentToolPolicy,
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
      `Available system tools (${toolPolicy.mode === 'allowlist' ? 'restricted to this Agent allowlist' : 'the live catalog; generated tools appear after registration'}): ${JSON.stringify(catalog)}`,
      toolPolicy.mode === 'allowlist'
        ? 'Tool creation is disabled for this Agent. Request access to a registered tool if the allowed tools are insufficient.'
        : `If no available tool can satisfy a concrete capability need, request one with {"tool":"${CREATE_TOOL_ACTION}","args":{"description":"...","requirements":["..."]}}. Do not claim a tool was created unless it is registered and available.`,
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
    routingSessionId?: string,
  ): Promise<BrainResponse> {
    const requestBody = JSON.stringify({
      prompt: history.map((message) => `${message.role === 'user' ? 'User' : 'Agent'}: ${message.content}`).join('\n\n'),
      systemPrompt,
      maxTokens,
      temperature: 0.3,
      missionId,
      ...(routingSessionId ? { routingSessionId } : {}),
    })
    const requestBytes = Buffer.byteLength(requestBody)
    if (requestBytes > MAX_BRAIN_REQUEST_BYTES) {
      throw new Error(
        `Brain request for Agent ${definition.id} is ${requestBytes} bytes, exceeding the ${MAX_BRAIN_REQUEST_BYTES}-byte service limit; reduce the task context or tool output.`,
      )
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.brainRequestTimeoutMs)
    let response: Response
    try {
      response = await this.fetcher(`${this.brainUrl}/api/brain/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
        signal: controller.signal,
      })
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Brain request timed out after ${this.brainRequestTimeoutMs}ms`)
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
    if (!response.ok) {
      const text = await response.text()
      try {
        const body = JSON.parse(text) as BrainErrorResponse
        const code = body.details?.code
        if (code === BRAIN_MODEL_SELECTION_RETRY || code === BRAIN_MODEL_SELECTION_EXHAUSTED) {
          throw new Error(`${code}: ${body.error || 'Brain model selection did not complete the request'}`)
        }
      } catch (error) {
        if (error instanceof Error && (
          error.message.startsWith(`${BRAIN_MODEL_SELECTION_RETRY}:`)
          || error.message.startsWith(`${BRAIN_MODEL_SELECTION_EXHAUSTED}:`)
        )) {
          throw error
        }
      }
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

  private resolveToolPolicy(definition: AgentDefinition): AgentToolPolicy {
    const toolPolicy = definition.toolPolicy
    if (toolPolicy === undefined) return { mode: 'all' }
    if (toolPolicy.mode === 'all') return toolPolicy
    if (toolPolicy.mode === 'allowlist') {
      if (!Array.isArray(definition.tools) || !definition.tools.every((tool) =>
        typeof tool === 'string' && tool.trim().length > 0,
      )) {
        throw new Error(`Agent ${definition.id} allowlist policy requires non-empty tool IDs`)
      }
      return toolPolicy
    }
    throw new Error(`Agent ${definition.id} has an invalid tool policy mode`)
  }

  private async executeAction(
    action: AgentAction,
    tools: ToolDescriptor[],
    definition: AgentDefinition,
    context: AgentExecutionContext,
    toolPolicy: AgentToolPolicy,
  ): Promise<ToolResult> {
    if (action.tool === CREATE_TOOL_ACTION) {
      if (toolPolicy.mode === 'allowlist') {
        return { isError: true, content: 'Tool creation is disabled for Agents with an allowlist policy.' }
      }
      return this.createTool(action.args, context)
    }
    if (action.tool === DELEGATE_ACTION) {
      return this.delegate(action.args, context)
    }

    const tool = tools.find((candidate) => candidate.id === action.tool || candidate.name === action.tool)
    if (!tool) {
      if (toolPolicy.mode === 'allowlist' && !definition.tools.includes(action.tool)) {
        return { isError: true, content: `Tool '${action.tool}' is not in this Agent's allowed tool set.` }
      }
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
