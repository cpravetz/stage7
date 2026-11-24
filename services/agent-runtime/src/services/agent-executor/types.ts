import type { AgentExecutionPolicy } from '../../types'

// ---------------------------------------------------------------------------
// Public API types (re-exported from ../AgentExecutor)
// ---------------------------------------------------------------------------

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
  missionGoal?: string
  taskObjective?: string
  executionPolicy?: AgentExecutionPolicy
  retryGuidance?: string
  delegate?: (request: AgentDelegateRequest) => Promise<unknown>
  resumeCheckpoint?: AgentExecutionCheckpoint
  saveCheckpoint?: (checkpoint: AgentExecutionCheckpoint) => Promise<void>
}

export type AgentActionOutcome = 'success' | 'failure' | 'denied' | 'question_asked' | 'permission_required'

export interface AgentActionReceipt {
  toolId: string
  isError: boolean
  content: string
  outcome: AgentActionOutcome
  actionKey?: string
  executionId?: string
  operation?: string
  providerRequestId?: string
  outcomeKnown?: boolean
  binding?: Record<string, unknown>
  reconciliation?: Record<string, unknown>
  fallbackForToolId?: string
  resolvedToolId?: string
  [key: string]: unknown
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AgentExecutionCheckpoint {
  version: 1 | 2
  history: ChatMessage[]
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
  incompleteReason?: string
  lastRequestId?: string
}

export interface AgentExecutionResult {
  output: string
  incompleteReason?: string
  tokensUsed: number
  toolCalls: number
  brainCalls: number
  completionTokensReserved: number
  actionReceipts: AgentActionReceipt[]
  requestId?: string
  reasoning?: string
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

export interface ToolDescriptor {
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

export interface ToolCatalogResponse {
  tools?: ToolDescriptor[]
}

export interface BrainResponse {
  content?: string
  tokensUsed?: number
  requestId?: string
  reasoning?: string
}

/** One non-empty Brain reply, as seen by the turn steps. */
export interface BrainReply {
  completion: BrainResponse
  /** Trimmed, non-empty content. */
  content: string
  reasoning: string | undefined
}

export interface BrainErrorResponse {
  error?: string
  details?: { code?: unknown }
}

export interface ToolExecutionResponse {
  status?: string
  output?: unknown
  error?: string
  outcomeKnown?: boolean
  reconciliation?: Record<string, unknown>
  request?: {
    executionId?: string
    toolId?: string
    toolName?: string
    operation?: string
    providerRequestId?: string
    binding?: Record<string, unknown>
    missingCredentials?: Array<{
      key?: string
      label?: string
      source?: { vaultSecretId?: string; envVar?: string; configKey?: string }
    }>
  }
}

export interface PluginGenerationResponse {
  success?: boolean
  error?: string
  tool?: ToolDescriptor
}

export interface RequiredAction {
  toolId: string
  outcome: AgentActionOutcome
  operation?: string
  operations?: string[]
  recipient?: string
  recipients?: string[]
  message?: string
  subject?: string
  body?: string
  binding?: Record<string, unknown>
  [key: string]: unknown
}

/** A single `{"tool": ..., "args": {...}}` action proposed by the Brain. */
export interface AgentAction {
  tool: string
  args: Record<string, unknown>
}

/** The normalised outcome of running one action. */
export interface ToolResult {
  isError: boolean
  content: string
  outcome?: AgentActionOutcome
  executionId?: string
  operation?: string
  providerRequestId?: string
  outcomeKnown?: boolean
  binding?: Record<string, unknown>
  reconciliation?: Record<string, unknown>
  resolvedToolId?: string
}
