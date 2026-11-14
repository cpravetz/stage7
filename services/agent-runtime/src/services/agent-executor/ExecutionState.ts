import { compactCheckpointForStorage } from './checkpoint'
import { CREATE_TOOL_ACTION } from './constants'
import { isConfigurationFailure } from './toolFailures'
import type {
  AgentActionReceipt,
  AgentExecutionCheckpoint,
  AgentExecutionResult,
  ChatMessage,
} from './types'

export interface ExecutionStateInit {
  /** The initial conversation (the task prompt, or a resumed checkpoint's history). */
  history: ChatMessage[]
  checkpoint?: AgentExecutionCheckpoint
  /** Receipts recorded by earlier attempts at this task. */
  priorActionReceipts: AgentActionReceipt[]
  /** Persists a checkpoint; absent when the host does not support resuming. */
  persist?: (checkpoint: AgentExecutionCheckpoint) => Promise<void>
}

/**
 * Everything that changes while an agent works on one task: the conversation,
 * budgets spent, receipts earned, and bookkeeping used to detect loops.
 * It is also the unit that is checkpointed and resumed.
 */
export class ExecutionState {
  history: ChatMessage[]
  tokensUsed: number
  toolCalls: number
  brainCalls: number
  completionTokensReserved: number
  delegations: number
  lastAction: string
  repeatedActionCount: number
  finalOutput: string | undefined
  incompleteReason: string | undefined
  lastRequestId: string | undefined

  readonly actionReceipts: AgentActionReceipt[]
  readonly priorActionReceipts: AgentActionReceipt[]
  /** Action keys that already have a persisted result from before an interruption. */
  readonly priorActionKeys: Set<string>
  /** resolved (generated) tool id -> the failing tool id it stands in for. */
  readonly fallbackToolIds: Map<string, string>
  /** tool id -> the configuration failure it hit; such tools are never retried. */
  readonly configurationFailures = new Map<string, string>()

  modelSelectionRetries = 0
  previousRemainingModelCount: number | undefined
  artifactCorrectionAttempts = 0

  private readonly persist?: (checkpoint: AgentExecutionCheckpoint) => Promise<void>

  constructor({ history, checkpoint, priorActionReceipts, persist }: ExecutionStateInit) {
    this.persist = persist
    this.history = history
    this.tokensUsed = checkpoint?.tokensUsed || 0
    this.toolCalls = checkpoint?.toolCalls || 0
    this.brainCalls = checkpoint?.brainCalls || 0
    this.completionTokensReserved = checkpoint?.completionTokensReserved || 0
    this.delegations = checkpoint?.delegations || 0
    this.lastAction = checkpoint?.lastAction || ''
    this.repeatedActionCount = checkpoint?.repeatedActionCount || 0
    this.finalOutput = checkpoint?.finalOutput
    this.incompleteReason = checkpoint?.incompleteReason
    this.lastRequestId = checkpoint?.lastRequestId

    this.priorActionReceipts = priorActionReceipts
    this.priorActionKeys = new Set(
      priorActionReceipts.flatMap((receipt) => receipt.actionKey ? [receipt.actionKey] : []),
    )
    this.actionReceipts = [...(checkpoint?.actionReceipts || []), ...priorActionReceipts]
    this.fallbackToolIds = new Map(
      this.actionReceipts.flatMap((receipt) => receipt.toolId === CREATE_TOOL_ACTION
        && receipt.fallbackForToolId
        && receipt.resolvedToolId
        ? [[receipt.resolvedToolId, receipt.fallbackForToolId] as [string, string]]
        : []),
    )
    for (const receipt of this.actionReceipts) {
      if (receipt.outcome === 'failure' && isConfigurationFailure(receipt.content)) {
        this.configurationFailures.set(receipt.toolId, receipt.content)
      }
    }
  }

  /** Adds a message from the runtime (feedback, correction, result) to the conversation. */
  tell(content: string): void {
    this.history.push({ role: 'user', content })
  }

  /** Saves progress so the task can be resumed. A no-op when the host does not persist checkpoints. */
  async save(pendingAction?: string): Promise<void> {
    if (!this.persist) return
    const next: AgentExecutionCheckpoint = {
      version: 2,
      history: this.history,
      tokensUsed: this.tokensUsed,
      toolCalls: this.toolCalls,
      brainCalls: this.brainCalls,
      completionTokensReserved: this.completionTokensReserved,
      delegations: this.delegations,
      lastAction: this.lastAction,
      repeatedActionCount: this.repeatedActionCount,
      actionReceipts: this.actionReceipts,
      lastRequestId: this.lastRequestId,
      ...(pendingAction ? { pendingAction } : {}),
      ...(this.finalOutput !== undefined ? { finalOutput: this.finalOutput } : {}),
      ...(this.incompleteReason !== undefined ? { incompleteReason: this.incompleteReason } : {}),
    }
    await this.persist(compactCheckpointForStorage(next))
  }

  /** Builds the value `execute` resolves with, snapshotting the current counters. */
  result(
    output: string,
    extra: Pick<Partial<AgentExecutionResult>, 'incompleteReason' | 'reasoning'> = {},
  ): AgentExecutionResult {
    return {
      output,
      ...extra,
      tokensUsed: this.tokensUsed,
      toolCalls: this.toolCalls,
      brainCalls: this.brainCalls,
      completionTokensReserved: this.completionTokensReserved,
      actionReceipts: this.actionReceipts,
      requestId: this.lastRequestId,
    }
  }
}
