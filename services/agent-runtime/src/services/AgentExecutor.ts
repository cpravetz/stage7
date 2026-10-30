import {
  BRAIN_MODEL_SELECTION_EXHAUSTED,
  BRAIN_MODEL_SELECTION_RETRY,
  BRAIN_ROUTING_SESSION_CONTEXT_KEY,
  logger,
} from '@stage7-nextgen/shared'
import { createHash } from 'node:crypto'
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
  isSkill?: boolean
  manifest?: Record<string, unknown>
  inputSchema?: Record<string, unknown>
  configSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
}

interface ToolCatalogResponse {
  tools?: ToolDescriptor[]
}

interface BrainResponse {
  content?: string
  tokensUsed?: number
  requestId?: string
  reasoning?: string
}

interface BrainErrorResponse {
  error?: string
  details?: { code?: unknown }
}

interface ToolExecutionResponse {
  status?: string
  output?: unknown
  error?: string
  request?: {
    executionId?: string
    toolId?: string
    toolName?: string
    missingCredentials?: Array<{
      key?: string
      label?: string
      source?: { vaultSecretId?: string; envVar?: string; configKey?: string }
    }>
  }
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
  retryGuidance?: string
  delegate?: (request: AgentDelegateRequest) => Promise<unknown>
  resumeCheckpoint?: AgentExecutionCheckpoint
  saveCheckpoint?: (checkpoint: AgentExecutionCheckpoint) => Promise<void>
}

export interface AgentActionReceipt {
  toolId: string
  isError: boolean
  content: string
  outcome: AgentActionOutcome
  actionKey?: string
  fallbackForToolId?: string
  resolvedToolId?: string
}

export type AgentActionOutcome = 'success' | 'failure' | 'denied' | 'question_asked' | 'permission_required'

interface RequiredAction {
  toolId: string
  outcome: AgentActionOutcome
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
  actionReceipts?: AgentActionReceipt[]
  pendingAction?: string
  finalOutput?: string
  lastRequestId?: string
}

export interface AgentExecutionResult {
  output: string
  tokensUsed: number
  toolCalls: number
  brainCalls: number
  completionTokensReserved: number
  actionReceipts: AgentActionReceipt[]
  requestId?: string
  reasoning?: string
}

interface AgentAction {
  tool: string
  args: Record<string, unknown>
}

interface ToolResult {
  isError: boolean
  content: string
  outcome?: AgentActionOutcome
  resolvedToolId?: string
}

const CREATE_TOOL_ACTION = '__create_tool'
const DELEGATE_ACTION = '__delegate'
const LIST_TOOLS_ACTION = '__list_tools'
const MAX_TOOL_DESCRIPTION_LENGTH = 200
const MAX_BRAIN_REQUEST_BYTES = 192 * 1024
const MAX_AGENT_CHECKPOINT_BYTES = 512 * 1024
const MAX_ACTION_RESULT_CHARS = 12_000
const MAX_COMPLETION_TOKENS_PER_CALL = 8_192
const DEFAULT_BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS = 310_000
const DEFAULT_BRAIN_COMPLETION_DEADLINE_MS = 900_000
const BRAIN_RESPONSE_GRACE_MS = 30_000
const MAX_BRAIN_REQUEST_TIMEOUT_MS = 2_147_483_647
const MAX_ACTION_RECEIPT_CHARS = 2_048
const RESUME_COMPLETION_TOKEN_BONUS = 8_192
const RESUME_BUDGET_MARKER = 'A single bounded checkpoint-resume allowance is available for this task.'

function brainRequestTimeoutFromEnvironment(): number {
  const configuredDeadline = Number(process.env.BRAIN_COMPLETION_DEADLINE_MS)
  const configuredAttemptTimeout = Number(process.env.BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS)
  const attemptTimeout = Number.isFinite(configuredAttemptTimeout) && configuredAttemptTimeout > 0
    ? configuredAttemptTimeout
    : DEFAULT_BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS
  const completionDeadline = Number.isFinite(configuredDeadline) && configuredDeadline > 0
    ? configuredDeadline
    : Math.max(attemptTimeout, Math.min(attemptTimeout * 3, DEFAULT_BRAIN_COMPLETION_DEADLINE_MS))
  return completionDeadline + BRAIN_RESPONSE_GRACE_MS
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function boundSchemaDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(boundSchemaDescriptions)
  const record = asRecord(value)
  if (!record) return value
  return Object.fromEntries(Object.entries(record).map(([key, child]) => [
    key,
    key === 'description' && typeof child === 'string'
      ? child.length > 500 ? '[Long schema description omitted.]' : child
      : boundSchemaDescriptions(child),
  ]))
}

function describeTools(tools: ToolDescriptor[]): Array<{
  id: string;
  name: string;
  description: string;
  type: string;
  inputs: string;
  inputSchema: unknown;
  configSchema: unknown;
  outputSchema: unknown;
}> {
  return tools.map(({ id, name, description, type, inputSchema, configSchema, outputSchema, manifest }) => {
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
      inputSchema: boundSchemaDescriptions(inputSchema || { type: 'object', properties: {} }),
      configSchema: boundSchemaDescriptions(configSchema || asRecord(manifest?.configSchema) || { type: 'object', properties: {} }),
      outputSchema: boundSchemaDescriptions(outputSchema || { type: 'object', properties: {} }),
    }
  })
}

function boundedActionResult(content: string): string {
  if (content.length <= MAX_ACTION_RESULT_CHARS) return content
  const marker = '\n[Tool output truncated; request a targeted result for more detail.]'
  return `${content.slice(0, MAX_ACTION_RESULT_CHARS - marker.length)}${marker}`
}


function compactHistoryForBrainRequest(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxBytes: number,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (history.length === 0) return history
  const first = history[0]
  const rest = history.slice(1)
  const estimate = (h: Array<{ role: 'user' | 'assistant'; content: string }>) =>
    h.reduce((sum, m) => sum + Buffer.byteLength(m.content, 'utf8') + 12, 0)
  if (estimate(history) <= maxBytes) return history
  // Keep the first user prompt and the most recent turns; drop the oldest middle turns.
  let keepCount = 0
  for (let i = rest.length - 1; i >= 0; i--) {
    const candidate = [first, ...rest.slice(i)]
    if (estimate(candidate) > maxBytes) break
    keepCount = rest.length - i
  }
  return [first, ...rest.slice(rest.length - keepCount)]
}

function isToolFailurePayload(value: unknown): boolean {
  let payload = asRecord(value)
  if (!payload && typeof value === 'string') {
    try {
      payload = asRecord(JSON.parse(value))
    } catch {
      return false
    }
  }
  if (!payload) return false
  return payload.success === false
    || payload.isError === true
    || payload.status === 'failed'
    || (typeof payload.error === 'string' && payload.error.trim().length > 0)
}

function parseActionReceipts(value: unknown): AgentActionReceipt[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    throw new Error('Agent execution checkpoint contains invalid action receipts')
  }
  return value.map((candidate) => {
    const receipt = asRecord(candidate)
    if (
      !receipt
      || typeof receipt.toolId !== 'string'
      || !receipt.toolId.trim()
      || typeof receipt.isError !== 'boolean'
      || typeof receipt.content !== 'string'
      || (receipt.actionKey !== undefined && (typeof receipt.actionKey !== 'string' || !/^[a-f0-9]{64}$/i.test(receipt.actionKey)))
      || (receipt.fallbackForToolId !== undefined && (typeof receipt.fallbackForToolId !== 'string' || !receipt.fallbackForToolId.trim()))
      || (receipt.resolvedToolId !== undefined && (typeof receipt.resolvedToolId !== 'string' || !receipt.resolvedToolId.trim()))
      || (receipt.outcome !== undefined && !['success', 'failure', 'denied', 'question_asked', 'permission_required'].includes(String(receipt.outcome)))
    ) {
      throw new Error('Agent execution checkpoint contains an invalid action receipt')
    }
    const semanticFailure = isToolFailurePayload(receipt.content)
    const outcome = receipt.outcome === 'denied'
      ? 'denied'
      : receipt.outcome === 'permission_required'
        ? 'permission_required'
        : receipt.outcome === 'question_asked'
          ? 'question_asked'
      : semanticFailure
        ? 'failure'
        : (receipt.outcome as AgentActionOutcome | undefined)
          || (receipt.isError ? 'failure' : 'success')
    return {
      toolId: receipt.toolId,
      isError: receipt.isError || semanticFailure || outcome === 'failure' || outcome === 'permission_required',
      content: receipt.content.slice(0, MAX_ACTION_RECEIPT_CHARS),
      outcome,
      ...(typeof receipt.actionKey === 'string' ? { actionKey: receipt.actionKey } : {}),
      ...(typeof receipt.fallbackForToolId === 'string' ? { fallbackForToolId: receipt.fallbackForToolId } : {}),
      ...(typeof receipt.resolvedToolId === 'string' ? { resolvedToolId: receipt.resolvedToolId } : {}),
    }
  })
}

function parseRequiredActions(value: unknown): RequiredAction[] {
  if (value === undefined) return []
  if (
    !Array.isArray(value)
    || value.length > 50
    || value.some((candidate) => {
      const action = asRecord(candidate)
      return !action
        || typeof action.toolId !== 'string'
        || !action.toolId.trim()
        || action.toolId.length > 120
        || !['success', 'failure', 'denied'].includes(String(action.outcome))
    })
  ) {
    throw new Error('Agent task requiredActions must contain valid tool IDs and expected outcomes')
  }
  return value.map((candidate) => {
    const action = candidate as Record<string, unknown>
    return { toolId: (action.toolId as string).trim(), outcome: action.outcome as AgentActionOutcome }
  })
}

function missingRequiredActions(
  requiredActions: RequiredAction[],
  receipts: AgentActionReceipt[],
): RequiredAction[] {
  const remainingReceipts = [...receipts]
  return requiredActions.filter((required) => {
    const matchingIndex = remainingReceipts.findIndex((receipt) =>
      (receipt.toolId === required.toolId
        || (receipt.toolId !== CREATE_TOOL_ACTION
          && required.outcome === 'success'
          && receipt.outcome === 'success'
          && receipt.fallbackForToolId === required.toolId))
      && receipt.outcome === required.outcome,
    )
    if (matchingIndex < 0) return true
    remainingReceipts.splice(matchingIndex, 1)
    return false
  })
}

function requiredActionCorrection(actions: RequiredAction[]): string {
  return `Before finalizing, execute each required action and provide a matching action receipt with its expected outcome: ${JSON.stringify(actions)}. For outcome "denied", make the actual action request even when the tool is absent from your available-tool list; only an explicit policy or catalog denial receipt satisfies that requirement. Never claim an action occurred without its receipt. If a required action needs a missing user-provided value or credential, do not guess or repeat the failed call; pause with __ASK_USER__:{"question":"..."} and prefix secret questions with [secret:<key>]. If an error reports a missing runtime module or package, do not try to install it in the mission environment or treat it as a credential; the runtime attempts one alternative-capability lookup automatically when policy and action budget allow. If unavailable, use another visible capability or report the exact blocker.`
}

function parseExpectedArtifacts(value: unknown): string[] {
  if (value === undefined) return []
  if (
    !Array.isArray(value)
    || value.length > 100
    || value.some((name) => typeof name !== 'string' || !name.trim())
  ) {
    throw new Error('Agent task expectedArtifacts must be an array of non-empty strings')
  }
  const names = value.map((name) => {
    if (typeof name !== 'string') {
      throw new Error('Agent task expectedArtifacts must be an array of non-empty strings')
    }
    return name.trim()
  })
  const deliverables = names.filter((name) => name.toLocaleLowerCase() !== 'system-action-receipts.json')
  if (new Set(deliverables.map((name) => name.toLocaleLowerCase())).size !== deliverables.length) {
    throw new Error('Agent task expectedArtifacts must be unique')
  }
  return deliverables
}

function isConfigurationFailure(content: string): boolean {
  return /\b(?:not configured|no .{1,80} configured|missing (?:the )?.{1,80}credential|requires? (?:the )?.{1,80}credential|credential .{1,80} missing)\b/i.test(content)
}

function getMissingRuntimeModule(content: string): string | undefined {
  return content.match(/Cannot find (?:module|package)\s+['"]?([@a-z0-9._/-]+)['"]?/i)?.[1]
}

function isExplicitBlocker(content: string): boolean {
  return /\b(?:blocked|cannot complete|unable to complete|could not complete|missing (?:configuration|credentials?|endpoint)|not configured|no safe alternative|requires? (?:user input|credentials?|configuration))\b/i.test(content)
}

function missingExpectedArtifactSections(content: string, expected: string[]): string[] {
  if (expected.length === 0) return []
  const headings = [...content.matchAll(/^##[ \t]+(.+?)[ \t]*$/gm)]
  const sectionNames = new Set<string>()
  headings.forEach((heading, index) => {
    const name = heading[1]?.trim().toLocaleLowerCase()
    const start = (heading.index ?? 0) + heading[0].length
    const end = headings[index + 1]?.index ?? content.length
    if (name && content.slice(start, end).trim()) sectionNames.add(name)
  })
  return expected.filter((name) => !sectionNames.has(name.toLocaleLowerCase()))
}

function expectedArtifactCorrection(missing: string[]): string {
  return `Your final response is missing required, non-empty Markdown artifact section(s): ${missing.map((name) => `## ${name}`).join(', ')}. Return the complete corrected result with each exact heading and only verified results under it, drawing on the action results already obtained in this conversation. Do not invent results or claim actions that were not executed.`
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
    actionReceipts: parseActionReceipts(checkpoint.actionReceipts),
    ...(typeof checkpoint.pendingAction === 'string' ? { pendingAction: checkpoint.pendingAction } : {}),
    ...(typeof checkpoint.finalOutput === 'string' ? { finalOutput: checkpoint.finalOutput } : {}),
    ...(typeof checkpoint.lastRequestId === 'string' ? { lastRequestId: checkpoint.lastRequestId } : {}),
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

function parseSingleWrappedAction(content: string): AgentAction | undefined {
  const normalized = content.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  let value: unknown
  try {
    value = JSON.parse(normalized)
  } catch {
    return undefined
  }

  for (let depth = 0; depth < 8; depth++) {
    if (Array.isArray(value)) {
      if (value.length !== 1) return undefined
      value = value[0]
      continue
    }
    const record = asRecord(value)
    if (!record) return undefined
    const args = asRecord(record.args)
    if (typeof record.tool === 'string' && args) {
      return { tool: record.tool, args }
    }
    const keys = Object.keys(record)
    if (keys.length !== 1) return undefined
    value = record[keys[0]!]
  }
  return undefined
}

function parseLeadingAction(content: string): AgentAction | undefined {
  const normalized = content.trim()
  const leadingFence = normalized.match(/^```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (leadingFence?.[1] !== undefined) return parseAction(leadingFence[1])
  if (!normalized.startsWith('{')) return undefined

  let depth = 0
  let inString = false
  let escaped = false
  for (let index = 0; index < normalized.length; index++) {
    const character = normalized[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }

    if (character === '"') inString = true
    else if (character === '{') depth++
    else if (character === '}' && --depth === 0) {
      return parseAction(normalized.slice(0, index + 1))
    }
  }
  return undefined
}

function containsToolActionShape(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsToolActionShape)
  const record = asRecord(value)
  if (!record) return false
  if (typeof record.tool === 'string' && asRecord(record.args)) return true
  return Object.values(record).some(containsToolActionShape)
}

function containsToolAction(content: string): boolean {
  const objectStarts: number[] = []
  let inString = false
  let escaped = false

  for (let index = 0; index < content.length; index++) {
    const character = content[index]
    if (objectStarts.length === 0) {
      if (character === '{') {
        objectStarts.push(index)
        inString = false
        escaped = false
      }
      continue
    }

    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }

    if (character === '"') {
      inString = true
    } else if (character === '{') {
      objectStarts.push(index)
    } else if (character === '}') {
      const start = objectStarts.pop()
      if (start === undefined) continue
      if (objectStarts.length === 0) {
        try {
          if (containsToolActionShape(JSON.parse(content.slice(start, index + 1)))) return true
        } catch {
          // Ignore malformed JSON objects; the caller will request a corrected response.
        }
        inString = false
        escaped = false
      }
    }
  }

  return false
}

export function isResumableDelegationCheckpoint(value: unknown): boolean {
  const checkpoint = parseAgentExecutionCheckpoint(value)
  if (checkpoint?.version !== 2 || !checkpoint.pendingAction) return false
  const lastMessage = checkpoint.history[checkpoint.history.length - 1]
  const action = lastMessage?.role === 'assistant'
    ? parseAction(lastMessage.content) || parseLeadingAction(lastMessage.content)
    : undefined
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
    this.maxIterations = options.maxIterations ?? 50
    this.maxDelegationDepth = options.maxDelegationDepth ?? 3
    this.brainRequestTimeoutMs = options.brainRequestTimeoutMs ?? brainRequestTimeoutFromEnvironment()
    this.fetcher = options.fetcher || ((input, init) => fetch(input, init))
    if (!Number.isInteger(this.maxIterations) || this.maxIterations < 1 || this.maxIterations > 100) {
      throw new Error('Agent maxIterations must be an integer between 1 and 100')
    }
    if (!Number.isInteger(this.maxDelegationDepth) || this.maxDelegationDepth < 0 || this.maxDelegationDepth > 8) {
      throw new Error('Agent maxDelegationDepth must be an integer between 0 and 8')
    }
    if (
      !Number.isInteger(this.brainRequestTimeoutMs)
      || this.brainRequestTimeoutMs < 1_000
      || this.brainRequestTimeoutMs > MAX_BRAIN_REQUEST_TIMEOUT_MS
    ) {
      throw new Error(`Agent brainRequestTimeoutMs must be an integer between 1000 and ${MAX_BRAIN_REQUEST_TIMEOUT_MS}`)
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
    const expectedArtifacts = parseExpectedArtifacts(taskContext.expectedArtifacts)
    const requiredActions = parseRequiredActions(taskContext.requiredActions)
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
    const retryGuidance = context.retryGuidance?.trim()
    const retryGuidanceMessage = retryGuidance
      ? `Retry guidance for this resumed task:\n${retryGuidance}`
      : undefined
    const policy = this.resolvePolicy(context.executionPolicy)
    let grantResumeAllowance = !!checkpoint
      && !history.some((message) => message.role === 'user' && message.content.includes(RESUME_BUDGET_MARKER))
    let interruptedDelegation: AgentAction | undefined
    if (checkpoint?.pendingAction) {
      const lastMessage = history[history.length - 1]
      const action = lastMessage?.role === 'assistant'
        ? parseAction(lastMessage.content) || parseLeadingAction(lastMessage.content)
        : undefined
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
    let modelSelectionRetries = 0
    let previousRemainingModelCount: number | undefined
    let lastAction = checkpoint?.lastAction || ''
    let repeatedActionCount = checkpoint?.repeatedActionCount || 0
    let finalOutput = checkpoint?.finalOutput
    const priorActionReceipts = parseActionReceipts(taskContext.priorActionReceipts)
    const priorActionKeys = new Set(
      priorActionReceipts.flatMap((receipt) => receipt.actionKey ? [receipt.actionKey] : []),
    )
    const actionReceipts = [...(checkpoint?.actionReceipts || []), ...priorActionReceipts]
    const fallbackToolIds = new Map(
      actionReceipts.flatMap((receipt) => receipt.toolId === CREATE_TOOL_ACTION
        && receipt.fallbackForToolId
        && receipt.resolvedToolId
        ? [[receipt.resolvedToolId, receipt.fallbackForToolId]]
        : []),
    )
    let lastRequestId = checkpoint?.lastRequestId
    let reasoning: string | undefined
    const configurationFailures = new Map<string, string>()
    for (const receipt of actionReceipts) {
      if (receipt.outcome === 'failure' && isConfigurationFailure(receipt.content)) {
        configurationFailures.set(receipt.toolId, receipt.content)
      }
    }
    const brainCallLimit = Math.min(
      this.maxIterations,
      policy.maxBrainCalls === Number.MAX_SAFE_INTEGER
        ? this.maxIterations
        : policy.maxBrainCalls + Number(grantResumeAllowance),
    )
    const completionTokenLimit = policy.maxCompletionTokens
      + (grantResumeAllowance ? RESUME_COMPLETION_TOKEN_BONUS : 0)
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
        actionReceipts,
        lastRequestId,
        ...(pendingAction ? { pendingAction } : {}),
        ...(finalOutput !== undefined ? { finalOutput } : {}),
      }
      // Compact the persisted history when it grows large: keep the first user prompt,
      // the most recent turns, and all action receipts, dropping the oldest middle turns.
      // Receipts are kept intact because they are the durable evidence of executed actions.
      let checkpointHistory = next.history
      const receiptsBudget = Buffer.byteLength(JSON.stringify(next.actionReceipts), 'utf8')
      const overhead = Buffer.byteLength(JSON.stringify({ ...next, history: [], actionReceipts: [] }), 'utf8')
      const historyBudget = Math.max(0, MAX_AGENT_CHECKPOINT_BYTES - receiptsBudget - overhead - 256)
      let currentSize = checkpointHistory.reduce((sum, m) => sum + Buffer.byteLength(m.content, 'utf8') + 12, 0)
      while (currentSize > historyBudget && checkpointHistory.length > 2) {
        const dropIndex = 1 + Math.floor((checkpointHistory.length - 2) / 2)
        const dropped = checkpointHistory[dropIndex]
        currentSize -= Buffer.byteLength(dropped.content, 'utf8') + 12
        checkpointHistory = [checkpointHistory[0], ...checkpointHistory.slice(dropIndex + 1)]
      }
      const compacted = { ...next, history: checkpointHistory }
      const size = Buffer.byteLength(JSON.stringify(compacted), 'utf8')
      if (size > MAX_AGENT_CHECKPOINT_BYTES) {
        throw new Error(`Agent execution checkpoint exceeded ${MAX_AGENT_CHECKPOINT_BYTES} bytes`)
      }
        await context.saveCheckpoint!(compacted)
      }
      : undefined;

    if (finalOutput !== undefined) {
      const missingActions = missingRequiredActions(requiredActions, actionReceipts)
      const missingArtifacts = missingExpectedArtifactSections(finalOutput, expectedArtifacts)
      if (missingActions.length === 0 && missingArtifacts.length === 0) {
        return {
          output: finalOutput,
          tokensUsed,
          toolCalls,
          brainCalls,
          completionTokensReserved,
          actionReceipts,
          requestId: lastRequestId,
          reasoning,
        }
      }
      if (missingActions.length > 0) {
        await this.reportBrainComplaint(
          lastRequestId,
          `Agent response validation failed: missing required action receipt(s): ${missingActions.map((action) => `${action.toolId}:${action.outcome}`).join(', ')}.`,
          context.missionId,
        )
      }
      if (missingArtifacts.length > 0) {
        await this.reportBrainComplaint(
          lastRequestId,
          `Agent response validation failed: final output omitted required artifact section(s): ${missingArtifacts.join(', ')}.`,
          context.missionId,
        )
      }
      history.push({
        role: 'user',
        content: [
          ...(missingActions.length > 0 ? [requiredActionCorrection(missingActions)] : []),
          ...(missingArtifacts.length > 0 ? [expectedArtifactCorrection(missingArtifacts)] : []),
        ].join('\n\n'),
      })
      finalOutput = undefined
    }
    if (saveCheckpoint) await saveCheckpoint()
    if (interruptedDelegation) {
      const result = await this.executeAction(interruptedDelegation, [], definition, context, toolPolicy)
      actionReceipts.push({
        toolId: interruptedDelegation.tool,
        isError: result.isError,
        content: result.content.slice(0, MAX_ACTION_RECEIPT_CHARS),
        outcome: result.outcome || (result.isError ? 'failure' : 'success'),
        actionKey: createHash('sha256')
          .update(`${interruptedDelegation.tool}:${JSON.stringify(interruptedDelegation.args)}`)
          .digest('hex'),
      })
      history.push({
        role: 'user',
        content: result.isError
          ? `Action failed: ${result.content}\nChoose a safe correction, another available tool, delegation, or explain the blocker.`
          : `Action result: ${boundedActionResult(result.content)}\nContinue toward the task goal. If complete, return the final answer as plain text.`,
      })
      if (saveCheckpoint) await saveCheckpoint()
    }
    if (grantResumeAllowance) history.push({ role: 'user', content: RESUME_BUDGET_MARKER })
    if (
      checkpoint
      && retryGuidanceMessage
      && !history.some((message) => message.role === 'user' && message.content.includes(retryGuidanceMessage))
    ) {
      history.push({ role: 'user', content: retryGuidanceMessage })
    }

    while (brainCalls < brainCallLimit) {
      const catalog = policy.maxActions > 0 ? await this.listTools() : []
      const tools = toolPolicy.mode === 'allowlist'
        ? catalog.filter((tool) => definition.tools.includes(tool.id))
        : catalog
      const remainingCompletionTokens = completionTokenLimit - completionTokensReserved
      const systemPrompt = this.buildSystemPrompt(
        definition.systemPrompt,
        tools,
        requiredActions,
        context.delegationDepth,
        policy,
        brainCallLimit - brainCalls,
        policy.maxActions - toolCalls,
        remainingCompletionTokens,
        policy.maxDelegations - delegations,
        toolPolicy,
      )
      // Cap per-call tokens at a sane ceiling even when the policy is unlimited, so the
      // Brain request body stays within service limits and the model has a bounded budget.
      const maxTokens = Math.min(
        policy.maxCompletionTokensPerCall === Number.MAX_SAFE_INTEGER
          ? MAX_COMPLETION_TOKENS_PER_CALL
          : policy.maxCompletionTokensPerCall,
        remainingCompletionTokens === Number.MAX_SAFE_INTEGER
          ? MAX_COMPLETION_TOKENS_PER_CALL
          : remainingCompletionTokens,
      )
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
        if (message.startsWith(BRAIN_MODEL_SELECTION_RETRY)) {
          const remainingMatch = message.match(/(\d+) eligible model\(s\) remain untried/i)
          const remainingModelCount = remainingMatch ? Number(remainingMatch[1]) : undefined
          modelSelectionRetries++
          if (
            modelSelectionRetries > 50
            || (remainingModelCount !== undefined
              && previousRemainingModelCount !== undefined
              && remainingModelCount >= previousRemainingModelCount)
          ) {
            throw new Error(
              `Brain model routing made no progress after ${modelSelectionRetries} retry request(s): ${message}`,
            )
          }
          previousRemainingModelCount = remainingModelCount
          // Brain still has untried eligible models/providers. Re-issue the same
          // Brain request (same routing session) so it advances to the remaining
          // candidates instead of aborting the agent task.
          logger.info({ missionId: context.missionId, reason: message }, 'Brain requested a retry with an untried eligible model; re-issuing Brain call')
          history = [...history, {
            role: 'user',
            content: 'The previous Brain attempt could not complete yet because some eligible models were not tried. Retry the Brain request now; it will continue with the remaining eligible models.',
          }]
          if (saveCheckpoint) await saveCheckpoint()
          continue
        }
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
      lastRequestId = completion.requestId
      const reasoning = completion.reasoning || undefined
      const content = (completion.content || '').trim()
      if (!content) {
        await this.reportBrainComplaint(
          completion.requestId,
          'Agent response validation failed: Brain returned empty content.',
          context.missionId,
        )
        history.push({
          role: 'user',
          content: 'Your previous Brain response was empty, so no action was executed. Reassess the task and return one raw JSON action object or a plain-text final answer. Do not claim an action that was not executed.',
        })
        if (saveCheckpoint) await saveCheckpoint()
        continue
      }

      history = [...history, { role: 'assistant', content }]
      const exactAction = parseAction(content)
      const leadingAction = exactAction ? undefined : parseLeadingAction(content)
      const wrappedAction = exactAction || leadingAction ? undefined : parseSingleWrappedAction(content)
      const action = exactAction || leadingAction || wrappedAction
      if (!exactAction && action) {
        await this.reportBrainComplaint(
          completion.requestId,
          wrappedAction
            ? 'Agent response validation failed: a single unambiguous JSON-wrapped tool action was normalized; no other response content was executed.'
            : 'Agent response validation failed: a tool action was mixed with trailing narration; only the leading action was executed.',
          context.missionId,
        )
        history[history.length - 1] = { role: 'assistant', content: JSON.stringify(action) }
      }
      if (!action) {
        if (content.startsWith('__ASK_USER__:')) {
          finalOutput = content
          if (saveCheckpoint) await saveCheckpoint()
          return {
            output: content,
            tokensUsed,
            toolCalls,
            brainCalls,
            completionTokensReserved,
            actionReceipts,
            requestId: lastRequestId,
            reasoning,
          }
        }
        if (containsToolAction(content)) {
          const correction = 'Your response included a tool-action object, but it was not the sole valid action response and was not executed. To execute an action, return exactly one raw JSON object in the form {"tool":"<tool-id>","args":{...}} with no surrounding prose, Markdown fence, or nesting. Otherwise return plain text if the task is complete. Never describe or claim an action that was not executed.'
          await this.reportBrainComplaint(
            completion.requestId,
            'Agent response validation failed: tool-action-shaped content was not a single valid executable action.',
            context.missionId,
          )
          if (history.some((message) => message.role === 'user' && message.content === correction)) {
            const reason = 'Agent response validation failed: Brain returned another non-executable tool-action response after receiving a format correction.'
            await this.reportBrainComplaint(completion.requestId, reason, context.missionId)
            throw new Error(reason)
          }
          history.push({
            role: 'user',
            content: correction,
          })
          if (saveCheckpoint) await saveCheckpoint()
          continue
        }
        const missingActions = missingRequiredActions(requiredActions, actionReceipts)
        const missingArtifacts = missingExpectedArtifactSections(content, expectedArtifacts)
        if (missingActions.length > 0 || missingArtifacts.length > 0) {
          const blockedRequiredAction = missingActions.some((required) =>
            actionReceipts.some((receipt) =>
              receipt.toolId === required.toolId
              && receipt.outcome !== 'success'
              && isConfigurationFailure(receipt.content),
            ),
          )
          if (blockedRequiredAction && missingArtifacts.length === 0 && isExplicitBlocker(content)) {
            finalOutput = content
            if (saveCheckpoint) await saveCheckpoint()
            return {
              output: content,
              tokensUsed,
              toolCalls,
              brainCalls,
              completionTokensReserved,
              actionReceipts,
              requestId: lastRequestId,
              reasoning,
            }
          }
          if (missingActions.length > 0) {
            await this.reportBrainComplaint(
              completion.requestId,
              `Agent response validation failed: missing required action receipt(s): ${missingActions.map((required) => `${required.toolId}:${required.outcome}`).join(', ')}.`,
              context.missionId,
            )
          }
          if (missingArtifacts.length > 0) {
            await this.reportBrainComplaint(
              completion.requestId,
              `Agent response validation failed: output omitted required artifact section(s): ${missingArtifacts.join(', ')}.`,
              context.missionId,
            )
          }
          const correction = [
            ...(missingActions.length > 0 ? [requiredActionCorrection(missingActions)] : []),
            ...(missingArtifacts.length > 0 ? [expectedArtifactCorrection(missingArtifacts)] : []),
          ].join('\n\n')
          if (history.some((message) => message.role === 'user' && message.content === correction)) {
            const reason = `Agent response validation failed after one correction: still missing ${[
              ...missingActions.map((required) => `required action receipt ${required.toolId}:${required.outcome}`),
              ...missingArtifacts.map((artifact) => `artifact section "${artifact}"`),
            ].join(' and ')}.`
            await this.reportBrainComplaint(completion.requestId, reason, context.missionId)
            throw new Error(reason)
          }
          history.push({
            role: 'user',
            content: correction,
          })
          if (saveCheckpoint) await saveCheckpoint()
          continue
        }
        finalOutput = content
        if (saveCheckpoint) await saveCheckpoint()
        return {
          output: content,
          tokensUsed,
          toolCalls,
          brainCalls,
          completionTokensReserved,
          actionReceipts,
          requestId: lastRequestId,
          reasoning,
        }
      }
      const alreadySatisfiedRequiredAction = requiredActions.some(
        (required) => required.toolId === action.tool && required.outcome === 'success',
      ) && actionReceipts.some(
        (receipt) => receipt.toolId === action.tool && receipt.outcome === 'success',
      )
      if (alreadySatisfiedRequiredAction) {
        const reason = `Agent response validation failed: action "${action.tool}" already has a successful persisted receipt; the repeated action was not executed.`
        await this.reportBrainComplaint(completion.requestId, reason, context.missionId)
        actionReceipts.push({
          toolId: action.tool,
          isError: true,
          content: reason,
          outcome: 'denied',
        })
        history.push({
          role: 'user',
          content: `${reason} The previous action result is already in the conversation. Return the required task artifacts using the already-completed action results without repeating any side-effect action.`,
        })
        if (saveCheckpoint) await saveCheckpoint()
        continue
      }
      const signature = `${action.tool}:${JSON.stringify(action.args)}`
      repeatedActionCount = signature === lastAction ? repeatedActionCount + 1 : 0
      lastAction = signature
      const actionKey = createHash('sha256').update(signature).digest('hex')
      if (repeatedActionCount >= 2) {
        const reason = `Agent ${definition.id} repeated the same action without progress: ${action.tool}`
        const previousFailure = [...actionReceipts].reverse().find(
          (receipt) => receipt.actionKey === actionKey && receipt.isError,
        )
        const failedTool = tools.find((tool) => tool.id === action.tool || tool.name === action.tool)
        const capabilityResolutionAttempted = actionReceipts.some(
          (receipt) => receipt.toolId === CREATE_TOOL_ACTION
            && (receipt.fallbackForToolId === (failedTool?.id || action.tool)),
        )
        if (
          previousFailure
          && !capabilityResolutionAttempted
          && toolPolicy.mode !== 'allowlist'
          && toolCalls < policy.maxActions
        ) {
          const taskGoal = typeof task.input.prompt === 'string' ? task.input.prompt.trim().slice(0, 1_000) : ''
          const capability = taskGoal || (failedTool
            ? `${failedTool.name} ${failedTool.description}`
            : action.tool.replace(/[_-]+/g, ' '))
          const resolutionArgs = {
            capability,
            description: [
              `Resolve the capability required by this task: "${capability}".`,
              `The selected tool "${failedTool?.name || action.tool}" failed: ${previousFailure.content.slice(0, 500)}`,
              'Choose a tool that performs the exact requested operation and produces evidence of its result; a similarly named draft, queue, or storage tool is not a substitute for an external action.',
              'Check registered and approved integrations first; create a compatible implementation only if none is suitable.',
              'Do not install unavailable runtime packages or claim success without verified execution.',
            ].join(' '),
            requirements: [],
            excludeToolIds: [failedTool?.id || action.tool],
          }
          const resolutionSignature = `${CREATE_TOOL_ACTION}:${JSON.stringify(resolutionArgs)}`
          const resolutionActionKey = createHash('sha256').update(resolutionSignature).digest('hex')
          toolCalls++
          if (saveCheckpoint) await saveCheckpoint(resolutionSignature)
          const resolution = await this.executeAction(
            { tool: CREATE_TOOL_ACTION, args: resolutionArgs },
            tools,
            definition,
            context,
            toolPolicy,
            completion.requestId,
          )
          actionReceipts.push({
            toolId: CREATE_TOOL_ACTION,
            isError: resolution.isError,
            content: resolution.content.slice(0, MAX_ACTION_RECEIPT_CHARS),
            outcome: resolution.outcome || (resolution.isError ? 'failure' : 'success'),
            actionKey: resolutionActionKey,
            fallbackForToolId: failedTool?.id || action.tool,
            ...(resolution.resolvedToolId ? { resolvedToolId: resolution.resolvedToolId } : {}),
          })
          if (resolution.outcome === 'permission_required') {
            finalOutput = resolution.content
            if (saveCheckpoint) await saveCheckpoint()
            return {
              output: resolution.content,
              tokensUsed,
              toolCalls,
              brainCalls,
              completionTokensReserved,
              actionReceipts,
              requestId: lastRequestId,
              reasoning,
            }
          }
          if (!resolution.isError && resolution.resolvedToolId) {
            fallbackToolIds.set(resolution.resolvedToolId, failedTool?.id || action.tool)
            history.push({
              role: 'user',
              content: `Capability resolution registered "${resolution.resolvedToolId}". Use that tool to satisfy the task instead of repeating "${action.tool}".`,
            })
            lastAction = ''
            repeatedActionCount = 0
            if (saveCheckpoint) await saveCheckpoint()
            continue
          }
          const resolutionFailure = resolution.isError
            ? ` Automatic capability resolution failed: ${resolution.content}`
            : ' Automatic capability resolution did not register a usable tool.'
          await this.reportBrainComplaint(completion.requestId, `${reason}.${resolutionFailure}`, context.missionId)
          throw new Error(`${reason}.${resolutionFailure}`)
        }
        const resolutionReceipt = capabilityResolutionAttempted
          ? [...actionReceipts].reverse().find((receipt) =>
            receipt.toolId === CREATE_TOOL_ACTION
            && receipt.fallbackForToolId === (failedTool?.id || action.tool),
          )
          : undefined
        const failureDetail = previousFailure
          ? ` Previous tool result: ${previousFailure.content.slice(0, 500)}.`
          : ''
        const resolutionDetail = resolutionReceipt?.isError
          ? ` Capability resolution also failed: ${resolutionReceipt.content.slice(0, 500)}.`
          : ''
        const blockedResolutionDetail = previousFailure
          && !capabilityResolutionAttempted
          && toolPolicy.mode !== 'allowlist'
          && toolCalls >= policy.maxActions
          ? ` Automatic capability resolution was not attempted because the action budget was exhausted (${toolCalls}/${policy.maxActions}).`
          : ''
        const detailedReason = `${reason}.${failureDetail}${resolutionDetail}${blockedResolutionDetail}`
        await this.reportBrainComplaint(completion.requestId, detailedReason, context.missionId)
        throw new Error(detailedReason)
      }
      if (priorActionKeys.has(actionKey)) {
        const previousReceipt = priorActionReceipts.find((receipt) => receipt.actionKey === actionKey)
        history.push({
          role: 'user',
          content: `This exact action already has a persisted result from before the mission interruption and was not repeated. Previous result: ${previousReceipt?.content || 'result unavailable'}. Continue using that result or explain the blocker.`,
        })
        lastAction = ''
        repeatedActionCount = 0
        if (saveCheckpoint) await saveCheckpoint()
        continue
      }

      const selectedTool = tools.find((tool) => tool.id === action.tool || tool.name === action.tool)
      const selectedToolId = selectedTool?.id || action.tool
      const earlierToolFailure = [...actionReceipts].reverse().find(
        (receipt) => (receipt.toolId === action.tool || receipt.toolId === selectedToolId)
          && receipt.outcome === 'failure',
      )
      const earlierResolution = [...actionReceipts].reverse().find(
        (receipt) => receipt.toolId === CREATE_TOOL_ACTION
          && receipt.fallbackForToolId === selectedToolId,
      )
      if (earlierToolFailure && earlierResolution) {
        const alreadyBlocked = actionReceipts.some(
          (receipt) => (receipt.toolId === action.tool || receipt.toolId === selectedToolId)
            && receipt.outcome === 'failure'
            && receipt.content.includes('capability resolution was already attempted'),
        )
        const reason = `Tool '${selectedToolId}' already failed and generic capability resolution was already attempted. Original failure: ${earlierToolFailure.content.slice(0, 400)} Resolution result: ${earlierResolution.content.slice(0, 400)}`
        if (alreadyBlocked) {
          await this.reportBrainComplaint(completion.requestId, reason, context.missionId)
          throw new Error(reason)
        }
        actionReceipts.push({
          toolId: action.tool,
          isError: true,
          content: reason,
          outcome: 'failure',
          actionKey,
        })
        history.push({
          role: 'user',
          content: `${reason} Do not call this tool again. Use the registered alternative if one was resolved, or report the exact remaining blocker.`,
        })
        lastAction = ''
        repeatedActionCount = 0
        if (saveCheckpoint) await saveCheckpoint()
        continue
      }

      if (toolCalls >= policy.maxActions) {
        const reason = `Agent ${definition.id} exhausted its ${policy.maxActions}-action execution budget before executing '${action.tool}'.`
        await this.reportBrainComplaint(completion.requestId, reason, context.missionId)
        throw new Error(reason)
      }

      toolCalls++
      if (action.tool === DELEGATE_ACTION) delegations++
      if (saveCheckpoint) await saveCheckpoint(signature)
      const previousConfigurationFailure = configurationFailures.get(action.tool)
      let result: ToolResult = previousConfigurationFailure
        ? {
          isError: true,
          outcome: 'failure' as const,
          content: `Tool '${action.tool}' was already blocked by missing configuration: ${previousConfigurationFailure}. Do not retry it or invent credentials; use another capability or report the blocker.`,
        }
        : await this.executeAction(action, tools, definition, context, toolPolicy, completion.requestId)
      actionReceipts.push({
        toolId: action.tool,
        isError: result.isError,
        content: result.content.slice(0, MAX_ACTION_RECEIPT_CHARS),
        outcome: result.outcome || (result.isError ? 'failure' : 'success'),
        actionKey,
        ...(fallbackToolIds.has(action.tool) ? { fallbackForToolId: fallbackToolIds.get(action.tool) } : {}),
      })
      const missingModule = result.isError ? getMissingRuntimeModule(result.content) : undefined
      const failedTool = tools.find((tool) => tool.id === action.tool || tool.name === action.tool)
      const failedToolId = failedTool?.id || action.tool
      const failedCallsForTool = actionReceipts.filter(
        (receipt) => receipt.isError
          && receipt.outcome === 'failure'
          && (receipt.toolId === action.tool || receipt.toolId === failedToolId),
      ).length
      const repeatedToolFailure = Boolean(
        result.isError
        && result.outcome !== 'denied'
        && result.outcome !== 'question_asked'
        && !isConfigurationFailure(result.content)
        && failedTool
        && failedCallsForTool >= 2,
      )
      const unavailableRequestedTool = result.isError
        && !failedTool
        && result.content.includes(`Tool '${action.tool}' is not in the live system catalog.`)
      const capabilityDescription = failedTool
        ? `${failedTool.name} ${failedTool.description}`
        : action.tool.replace(/[_-]+/g, ' ')
      const capabilityResolutionAttempted = actionReceipts.some(
        (receipt) => receipt.toolId === CREATE_TOOL_ACTION
          && receipt.fallbackForToolId === failedToolId,
      )
      const needsCapabilityResolution = Boolean(
        (missingModule && failedTool)
        || unavailableRequestedTool
        || repeatedToolFailure,
      )
      if (
        needsCapabilityResolution
        && !capabilityResolutionAttempted
        && toolPolicy.mode !== 'allowlist'
        && toolCalls < policy.maxActions
      ) {
        const taskGoal = typeof task.input.prompt === 'string' ? task.input.prompt.trim().slice(0, 1_000) : ''
        const capabilitySource = failedTool
          ? `${failedTool.name} ${failedTool.description}`.slice(0, 1_500)
          : capabilityDescription
        const capability = capabilitySource
          .match(/[a-z0-9]+/gi)
          ?.join(' ')
          || action.tool
        const resolutionArgs = {
          capability,
          description: [
            `Resolve the capability "${capability}".`,
            failedTool
              ? `The available tool "${failedTool.name}" (${failedTool.id}) failed${missingModule ? ` because runtime package "${missingModule}" is unavailable` : repeatedToolFailure ? ' repeatedly without progress' : ''}.`
              : `The requested tool identifier "${action.tool}" is not registered.`,
            taskGoal ? `Task goal: "${taskGoal}".` : '',
            'Check registered and approved integrations first; create a compatible implementation only if none is suitable. The replacement must perform the exact task operation, not a similarly named draft, queue, or storage operation.',
            'Do not install unavailable runtime packages or claim success without verified execution.',
          ].filter(Boolean).join(' '),
          requirements: missingModule
            ? [`Do not depend on unavailable runtime package "${missingModule}".`]
            : [],
          excludeToolIds: failedTool ? [failedTool.id] : [action.tool],
        }
        const resolutionSignature = `${CREATE_TOOL_ACTION}:${JSON.stringify(resolutionArgs)}`
        const resolutionActionKey = createHash('sha256').update(resolutionSignature).digest('hex')
        toolCalls++
        if (saveCheckpoint) await saveCheckpoint(resolutionSignature)
        const resolution = await this.executeAction(
          { tool: CREATE_TOOL_ACTION, args: resolutionArgs },
          tools,
          definition,
          context,
          toolPolicy,
          completion.requestId,
        )
        actionReceipts.push({
          toolId: CREATE_TOOL_ACTION,
          isError: resolution.isError,
          content: resolution.content.slice(0, MAX_ACTION_RECEIPT_CHARS),
          outcome: resolution.outcome || (resolution.isError ? 'failure' : 'success'),
          actionKey: resolutionActionKey,
          fallbackForToolId: failedTool?.id || action.tool,
          ...(resolution.resolvedToolId ? { resolvedToolId: resolution.resolvedToolId } : {}),
        })
        if (!resolution.isError && resolution.resolvedToolId) {
          fallbackToolIds.set(resolution.resolvedToolId, failedTool?.id || action.tool)
        }
        priorActionKeys.add(resolutionActionKey)
        if (resolution.outcome === 'permission_required') {
          finalOutput = resolution.content
          if (saveCheckpoint) await saveCheckpoint()
          return {
            output: resolution.content,
            tokensUsed,
            toolCalls,
            brainCalls,
            completionTokensReserved,
            actionReceipts,
            requestId: lastRequestId,
            reasoning,
          }
        }
        result = {
          ...resolution,
          content: resolution.isError
            ? `The requested capability could not be executed by the original tool. Alternative resolution also failed: ${resolution.content}`
            : `The original tool was unavailable or failed. ${resolution.content}`,
        }
      }
      if (result.outcome === 'permission_required') {
        finalOutput = result.content
        if (saveCheckpoint) await saveCheckpoint()
        return {
          output: result.content,
          tokensUsed,
          toolCalls,
          brainCalls,
          completionTokensReserved,
          actionReceipts,
          requestId: lastRequestId,
          reasoning,
        }
      }
      if (result.outcome === 'question_asked') {
        finalOutput = result.content
        if (saveCheckpoint) await saveCheckpoint()
        return {
          output: result.content,
          tokensUsed,
          toolCalls,
          brainCalls,
          completionTokensReserved,
          actionReceipts,
          requestId: lastRequestId,
          reasoning,
        }
      }
      if (result.isError && isConfigurationFailure(result.content)) {
        configurationFailures.set(action.tool, result.content)
      }
      const ignoredNarration = exactAction
        ? ''
        : 'Only the leading action object was considered; all trailing response text was ignored.\n'
      history.push(
        {
          role: 'user',
          content: result.isError
            ? `${ignoredNarration}Action failed: ${boundedActionResult(result.content)}\nIf this is missing user-provided configuration or a credential, ask the user with __ASK_USER__ (use [secret:<key>] for secrets). If this is a missing runtime module, do not attempt installation; the runtime attempts one alternative-capability lookup when policy and action budget allow. If unavailable, use another visible capability or explain the exact blocker. Otherwise choose a safe correction or explain the exact blocker.`
            : `${ignoredNarration}Action result: ${boundedActionResult(result.content)}\nContinue toward the task goal. If complete, return the final answer as plain text.`,
        },
      )
      if (saveCheckpoint) await saveCheckpoint()
    }

    const missingActions = missingRequiredActions(requiredActions, actionReceipts)
    const missingArtifacts = finalOutput === undefined
      ? expectedArtifacts
      : missingExpectedArtifactSections(finalOutput, expectedArtifacts)
    const unmetRequirements = [
      ...missingActions.map((required) => `action ${required.toolId}:${required.outcome}`),
      ...missingArtifacts.map((artifact) => `artifact section "${artifact}"`),
      ...(finalOutput === undefined && missingActions.length === 0 && missingArtifacts.length === 0
        ? ['a final task response']
        : []),
    ]
    throw new Error(
      `Agent ${definition.id} exhausted its ${brainCallLimit}-call Brain execution budget without completing the task`
      + (unmetRequirements.length > 0 ? `; unmet requirements: ${unmetRequirements.join(', ')}` : ''),
    )
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
      // Number.MAX_SAFE_INTEGER is treated as an explicit "unlimited" sentinel.
      const isUnlimited = value === Number.MAX_SAFE_INTEGER
      if (
        !Number.isInteger(value)
        || value < minimum
        || (!isUnlimited && value > maximum)
      ) {
        throw new Error(`Agent execution policy ${name} must be an integer between ${minimum} and ${maximum}, or ${Number.MAX_SAFE_INTEGER} for unlimited`)
      }
    }
    const maxCompletionTokensPerCall = resolved.maxCompletionTokensPerCall ?? DEFAULT_AGENT_EXECUTION_POLICY.maxCompletionTokensPerCall
    if (
      maxCompletionTokensPerCall !== Number.MAX_SAFE_INTEGER
      && resolved.maxCompletionTokens !== Number.MAX_SAFE_INTEGER
      && maxCompletionTokensPerCall > resolved.maxCompletionTokens
    ) {
      throw new Error('Agent execution policy maxCompletionTokensPerCall cannot exceed maxCompletionTokens')
    }
    return { ...resolved, maxCompletionTokensPerCall }
  }

  private buildSystemPrompt(
    base: string,
    tools: ToolDescriptor[],
    requiredActions: RequiredAction[],
    delegationDepth: number,
    policy: AgentExecutionPolicy,
    remainingBrainCalls: number,
    remainingActions: number,
    remainingCompletionTokens: number,
    remainingDelegations: number,
    toolPolicy: AgentToolPolicy,
  ): string {
    const catalog = describeTools(tools)
    const canTakeAction = remainingActions > 0
    const delegation = canTakeAction && delegationDepth < this.maxDelegationDepth && remainingDelegations > 0
      ? `You may delegate a bounded subtask with {"tool":"${DELEGATE_ACTION}","args":{"goal":"...","role":"...","systemPrompt":"..."}}. One delegation runs the child to completion and returns its completed result. Put the full subtask in that one request; do not delegate to discover an Agent ID or make a follow-up delegation just to retrieve its result.`
      : 'You may not delegate further in this execution.'
    const actionInstructions = canTakeAction
      ? [
        'To execute a registered system tool, respond with exactly one raw JSON object: {"tool":"<tool-id>","args":{...}}. Never quote, fence, nest, or describe a tool action; only a sole JSON action object is executed. Do not claim an action succeeded until you receive its result.',
        `Available system tools (${toolPolicy.mode === 'allowlist' ? 'restricted to this Agent allowlist' : 'the live catalog; generated tools appear after registration'}): ${JSON.stringify(catalog)}`,
        `To inspect the current visible tool catalog, respond with {"tool":"${LIST_TOOLS_ACTION}","args":{"query":"<capability>"}}. A query returns matching tool IDs, names, and short descriptions; omit it for a compact list of visible tool IDs.`,
        'Use each tool’s full inputSchema, configSchema, and outputSchema when preparing arguments. For inputs marked "x-stage7-secret": true (or sensitive password fields), provide only the supplied vault:// reference; never ask an LLM to handle or echo the secret value. If a required value is unavailable in task inputs or prior task outputs, ask the user through the mission conversation instead of guessing. Never expose a vault:// reference in user-facing text.',
        'To pause this mission for a missing user-provided value, return exactly __ASK_USER__:{"question":"..."} as your final response. For secrets, prefix the question text with [secret:<lowercase-key>] so the Mission Room saves the answer directly to Vault.',
        toolPolicy.mode === 'allowlist'
          ? 'Tool creation is disabled for this Agent. Request access to a registered tool if the allowed tools are insufficient.'
          : `If no available tool can satisfy a concrete capability need, ask ToolExecutor to resolve it with {"tool":"${CREATE_TOOL_ACTION}","args":{"description":"...","requirements":["..."]}}. Describe the capability and constraints, not implementation details. ToolExecutor checks registered native tools, discovers suitable MCP tools and handles their permission flow, then creates, validates, registers, and persists a reusable plugin only if no suitable tool can be used. Never write tool code yourself or claim resolution succeeded unless the returned tool is registered and available.`,
        'Select a tool only when its description and schemas show it performs the exact requested operation and can verify the outcome. Name similarity is not enough: drafting, queuing, storing, or recording a request is not a substitute for sending, publishing, submitting, or otherwise carrying out the requested action.',
      ]
      : [
        'No tool, tool-generation, or delegation actions are available in this execution. Do not invent, quote, or describe tool actions; return only the requested reasoning result or structured response.',
      ]

    return [
      base || 'You are an autonomous mission agent. Complete the assigned task and report what you did.',
      'You are a mission-scoped Agent, not the persistent domain Assistant. Use Brain and system tools as needed.',
      `Execution policy caps: ${policy.maxBrainCalls} Brain calls, ${policy.maxActions} tool/delegation actions, ${policy.maxCompletionTokens} total generated completion tokens, ${policy.maxCompletionTokensPerCall} tokens per completion, and ${policy.maxDelegations} delegated subtasks.`,
      `Remaining budget: ${remainingBrainCalls} Brain calls, ${remainingActions} actions, ${remainingCompletionTokens} generated completion tokens, and ${remainingDelegations} delegations.`,
      ...(requiredActions.length > 0
        ? [`Required action receipts before completion: ${JSON.stringify(requiredActions)}. Execute each required action and verify its actual result. For an expected denial, make the action request even if it is not listed among available tools.`]
        : []),
      ...actionInstructions,
      delegation,
      'Treat each system-tool result as authoritative. Report the returned value rather than recalculating or replacing it, and never claim a tool succeeded unless its actual result supports that claim.',
      'When a tool fails because its endpoint, provider, or credentials are not configured, do not guess values or repeat that tool. A missing credential response will pause the mission for user input; other failures may trigger one generic capability resolution attempt. If no safe path exists, return a concise explicit blocker naming the missing configuration.',
      'Generated tools that need user-provided secrets must mark those input properties with "x-stage7-secret": true, "format": "password", and "writeOnly": true. The tool receives the plaintext only during execution; generated acceptance tests must use non-secret fixtures and must never request or embed real credentials.',
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
    const buildRequestBody = (candidateHistory: Array<{ role: 'user' | 'assistant'; content: string }>) =>
      JSON.stringify({
        prompt: candidateHistory.map((message) => `${message.role === 'user' ? 'User' : 'Agent'}: ${message.content}`).join('\n\n'),
        systemPrompt,
        options: { optimizeFor: 'accuracy' },
        maxTokens,
        temperature: 0.3,
        missionId,
        entityId: typeof definition.metadata?.entityId === 'string'
          ? definition.metadata.entityId
          : missionId,
        assistantId: typeof definition.metadata?.assistantId === 'string'
          ? definition.metadata.assistantId
          : undefined,
        tenantId: definition.tenantId,
        ...(routingSessionId ? { routingSessionId } : {}),
      })
    // Compact the conversation history until the serialized Brain request fits the
    // service limit. Keep the first user prompt and the most recent turns; drop the
    // oldest middle turns first so the Agent always retains its latest context.
    let compactedHistory = history
    let requestBody = buildRequestBody(compactedHistory)
    while (Buffer.byteLength(requestBody) > MAX_BRAIN_REQUEST_BYTES && compactedHistory.length > 2) {
      const latestHistoryCount = Math.max(1, Math.floor((compactedHistory.length - 1) / 2))
      const nextHistory = [compactedHistory[0], ...compactedHistory.slice(-latestHistoryCount)]
      if (nextHistory.length >= compactedHistory.length) break
      compactedHistory = nextHistory
      requestBody = buildRequestBody(compactedHistory)
    }
    const requestBytes = Buffer.byteLength(requestBody)
    if (requestBytes > MAX_BRAIN_REQUEST_BYTES) {
      throw new Error(
        `Brain request for Agent ${definition.id} remains ${requestBytes} bytes after history compaction, exceeding the ${MAX_BRAIN_REQUEST_BYTES}-byte service limit; reduce the task context or tool output.`,
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
        const cause = error instanceof Error ? `: ${error.message}` : '';
        throw new Error(`Brain request timed out after ${this.brainRequestTimeoutMs}ms${cause}`)
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

  private async reportBrainComplaint(
    requestId: string | undefined,
    reason: string,
    missionId: string,
  ): Promise<void> {
    if (!requestId) {
      logger.warn({ missionId, reason }, 'Cannot report Brain response validation failure without a request ID')
      return
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5_000)
    try {
      const response = await this.fetcher(`${this.brainUrl}/api/brain/complaint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, reason, missionId }),
        signal: controller.signal,
      })
      if (!response.ok) {
        const details = await response.text()
        logger.error(
          { requestId, missionId, status: response.status, details: details.slice(0, 300) },
          'Brain rejected an Agent response quality complaint',
        )
        return
      }
      logger.info({ requestId, missionId, reason }, 'Agent reported a Brain response quality complaint')
    } catch (error) {
      logger.error(
        { requestId, missionId, error: error instanceof Error ? error.message : String(error) },
        'Failed to report an Agent response quality complaint',
      )
    } finally {
      clearTimeout(timeout)
    }
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
      tool.isSkill !== true
      && typeof tool.id === 'string'
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
    requestId?: string,
  ): Promise<ToolResult> {
    if (action.tool === LIST_TOOLS_ACTION) {
      const query = typeof action.args.query === 'string' ? action.args.query.trim().toLocaleLowerCase() : ''
      const queryTerms = query.split(/[^a-z0-9]+/).filter((term) => term.length > 1)
      const matchingTools = queryTerms.length === 0
        ? tools
        : tools.filter((tool) => {
          const searchable = `${tool.id} ${tool.name} ${tool.description}`.toLocaleLowerCase()
          return queryTerms.some((term) => searchable.includes(term))
        })
      const content = queryTerms.length === 0
        ? matchingTools.map((tool) => tool.id).join('\n')
        : matchingTools.slice(0, 25).map((tool) =>
          `${tool.id} | ${tool.name}: ${tool.description.slice(0, 160)}`,
        ).join('\n')
      return {
        isError: false,
        content: content || (query ? 'No visible tools matched the requested query.' : 'No visible tools.'),
      }
    }
    if (action.tool === CREATE_TOOL_ACTION) {
      if (toolPolicy.mode === 'allowlist') {
        await this.reportBrainComplaint(
          requestId,
          'Agent action validation failed: tool creation was requested under a policy that forbids tool creation.',
          context.missionId,
        )
        return {
          isError: true,
          content: 'Tool creation is disabled for Agents with an allowlist policy.',
          outcome: 'denied',
        }
      }
      return this.createTool(action.args, context, definition.id)
    }
    if (action.tool === DELEGATE_ACTION) {
      return this.delegate(action.args, context)
    }

    const tool = tools.find((candidate) => candidate.id === action.tool || candidate.name === action.tool)
    if (!tool) {
      if (toolPolicy.mode === 'allowlist' && !definition.tools.includes(action.tool)) {
        await this.reportBrainComplaint(
          requestId,
          `Agent action validation failed: requested tool '${action.tool}' is outside the Agent allowlist.`,
          context.missionId,
        )
        return {
          isError: true,
          content: `Tool '${action.tool}' is not in this Agent's allowed tool set.`,
          outcome: 'denied',
        }
      }
      await this.reportBrainComplaint(
        requestId,
        `Agent action validation failed: requested tool '${action.tool}' is absent from the live tool catalog.`,
        context.missionId,
      )
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
          context: { missionId: context.missionId, agentId: definition.id, tenantId: definition.tenantId },
        }),
      })
      const result = await response.json() as ToolExecutionResponse
      const credentialRequest = result.request
      if (
        response.status === 428
        && typeof credentialRequest?.executionId === 'string'
        && typeof credentialRequest.toolId === 'string'
        && typeof credentialRequest.toolName === 'string'
        && Array.isArray(credentialRequest.missingCredentials)
      ) {
        const missingCredentials = credentialRequest.missingCredentials.filter(
          (credential): credential is { key: string; label?: string; source?: { vaultSecretId?: string; envVar?: string; configKey?: string } } =>
            typeof credential?.key === 'string' && credential.key.trim().length > 0,
        )
        if (missingCredentials.length > 0) {
          const requiresSecret = missingCredentials.some(
            (credential) => Boolean(credential.source?.vaultSecretId || credential.source?.envVar),
          )
          const fields = missingCredentials.map((credential) =>
            `${credential.label || credential.key} (key: ${credential.key})`,
          )
          const answerFormat = missingCredentials.length === 1
            ? `Provide the value for ${fields[0]}.`
            : `Provide a JSON object with a string value for each exact key: ${missingCredentials.map((credential) => `"${credential.key}"`).join(', ')}.`
          const question = [
            requiresSecret ? '[secret:tool-credentials] ' : '',
            `${credentialRequest.toolName} needs user-provided configuration before it can run. ${answerFormat}`,
          ].join('')
          const safeRequest = {
            executionId: credentialRequest.executionId,
            toolId: credentialRequest.toolId,
            toolName: credentialRequest.toolName,
            missingCredentials: missingCredentials.map(({ key, label }) => ({ key, label: label || key })),
          }
          return {
            isError: true,
            outcome: 'question_asked',
            content: `__ASK_USER__:${JSON.stringify({ question, credentialRequest: safeRequest })}`,
          }
        }
      }
      if (!response.ok || result.status !== 'completed') {
        if (response.status === 400 || response.status === 422) {
          await this.reportBrainComplaint(
            requestId,
            `Agent action validation failed for tool '${tool.id}' (HTTP ${response.status}); the Brain-produced arguments were rejected.`,
            context.missionId,
          )
        }
        return {
          isError: true,
          content: result.error || `Tool '${tool.name}' failed with HTTP ${response.status}`,
          ...(response.status === 403 ? { outcome: 'denied' as const } : {}),
        }
      }
      const output = result.output ?? {}
      const semanticFailure = isToolFailurePayload(output)
      return {
        isError: semanticFailure,
        content: JSON.stringify(output),
        ...(semanticFailure ? { outcome: 'failure' as const } : {}),
      }
    } catch (error) {
      logger.warn(
        { agentId: definition.id, toolId: tool.id, error: error instanceof Error ? error.message : String(error) },
        'Agent tool call failed',
      )
      return { isError: true, content: error instanceof Error ? error.message : String(error) }
    }
  }

  private async createTool(
    args: Record<string, unknown>,
    context: AgentExecutionContext,
    agentId: string,
  ): Promise<ToolResult> {
    const description = typeof args.description === 'string' ? args.description.trim() : ''
    if (!description) return { isError: true, content: 'Tool creation requires a non-empty description.' }
    const capability = typeof args.capability === 'string' ? args.capability.trim() : ''
    const requirements = Array.isArray(args.requirements)
      ? args.requirements.filter((value): value is string => typeof value === 'string')
      : []
    const excludeToolIds = Array.isArray(args.excludeToolIds)
      ? [...new Set(args.excludeToolIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))]
      : []

    try {
      const response = await this.fetcher(`${this.toolExecutorUrl}/api/tool-executor/tools/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(capability ? { capability } : {}),
          description,
          requirements,
          excludeToolIds,
          context: { missionId: context.missionId, agentId },
        }),
      })
      const result = await response.json() as PluginGenerationResponse & {
        permissionRequired?: boolean
        prompt?: string
        request?: unknown
        candidate?: unknown
      }
      if (result.permissionRequired) {
        return {
          isError: true,
          content: `__MISSION_PERMISSION__:${JSON.stringify({
            request: result.request,
            candidate: result.candidate,
            prompt: result.prompt || result.error || 'A discovered MCP tool requires permission before it can be used.',
          })}`,
          outcome: 'permission_required',
        }
      }
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
        resolvedToolId: registered.id,
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
