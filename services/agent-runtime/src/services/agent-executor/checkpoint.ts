import { DELEGATE_ACTION, MAX_AGENT_CHECKPOINT_BYTES } from './constants'
import { parseAction, parseLeadingAction } from './actionParser'
import { compactReceiptForPersistence, parseActionReceipts } from './receipts'
import type { AgentExecutionCheckpoint } from './types'
import { asRecord } from './util'

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
    throw new Error('The saved progress for this task is not supported or could not be read')
  }

  const history: AgentExecutionCheckpoint['history'] = checkpoint.history.map((message) => {
    const item = asRecord(message)
    const role = item?.role
    const content = item?.content
    if (
      (role !== 'user' && role !== 'assistant')
      || typeof content !== 'string'
    ) {
      throw new Error('The saved progress for this task includes an invalid conversation entry')
    }
    return { role, content }
  })
  if (checkpoint.pendingAction !== undefined && typeof checkpoint.pendingAction !== 'string') {
    throw new Error('The saved progress for this task includes an invalid pending action')
  }
  if (checkpoint.finalOutput !== undefined && typeof checkpoint.finalOutput !== 'string') {
    throw new Error('The saved progress for this task includes an invalid final result')
  }
  if (checkpoint.incompleteReason !== undefined && typeof checkpoint.incompleteReason !== 'string') {
    throw new Error('The saved progress for this task includes an invalid incomplete reason')
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
    ...(typeof checkpoint.incompleteReason === 'string' ? { incompleteReason: checkpoint.incompleteReason } : {}),
    ...(typeof checkpoint.lastRequestId === 'string' ? { lastRequestId: checkpoint.lastRequestId } : {}),
  }
}

/** The action recorded as the last assistant turn of a checkpoint, if any. */
export function lastAssistantAction(checkpoint: AgentExecutionCheckpoint) {
  const lastMessage = checkpoint.history[checkpoint.history.length - 1]
  return lastMessage?.role === 'assistant'
    ? parseAction(lastMessage.content) || parseLeadingAction(lastMessage.content)
    : undefined
}

export function isResumableDelegationCheckpoint(value: unknown): boolean {
  const checkpoint = parseAgentExecutionCheckpoint(value)
  if (checkpoint?.version !== 2 || !checkpoint.pendingAction) return false
  const action = lastAssistantAction(checkpoint)
  return action?.tool === DELEGATE_ACTION
    && checkpoint.pendingAction === `${action.tool}:${JSON.stringify(action.args)}`
}

/**
 * Shrinks a checkpoint to fit the storage limit: receipts are reduced to their
 * durable form, then the oldest middle turns are dropped (keeping the first user
 * prompt and the most recent turns). Throws if it still cannot fit.
 */
export function compactCheckpointForStorage(next: AgentExecutionCheckpoint): AgentExecutionCheckpoint {
  // Compact the persisted checkpoint when it grows large: keep the first user
  // prompt, the most recent turns, and all action receipts, dropping the
  // oldest middle turns. Receipts are reduced to their durable form first —
  // the full reconciliation/binding objects are transient runtime metadata
  // that only the active executor needs, and they were the vector that pushed
  // checkpoints past the storage limit across repeated failed task retries.
  const compactedReceipts = (next.actionReceipts ?? []).map(compactReceiptForPersistence)
  let checkpointHistory = next.history
  const receiptsBudget = Buffer.byteLength(JSON.stringify(compactedReceipts), 'utf8')
  const overhead = Buffer.byteLength(JSON.stringify({ ...next, history: [], actionReceipts: [] }), 'utf8')
  const historyBudget = Math.max(0, MAX_AGENT_CHECKPOINT_BYTES - receiptsBudget - overhead - 256)
  let currentSize = checkpointHistory.reduce((sum, m) => sum + Buffer.byteLength(m.content, 'utf8') + 12, 0)
  while (currentSize > historyBudget && checkpointHistory.length > 2) {
    const dropIndex = 1 + Math.floor((checkpointHistory.length - 2) / 2)
    const dropped = checkpointHistory[dropIndex]!
    currentSize -= Buffer.byteLength(dropped.content, 'utf8') + 12
    checkpointHistory = [checkpointHistory[0]!, ...checkpointHistory.slice(dropIndex + 1)]
  }
  const compacted = { ...next, history: checkpointHistory, actionReceipts: compactedReceipts }
  const size = Buffer.byteLength(JSON.stringify(compacted), 'utf8')
  if (size > MAX_AGENT_CHECKPOINT_BYTES) {
    throw new Error(`The saved progress for this task became too large to store (${MAX_AGENT_CHECKPOINT_BYTES} bytes)`)
  }
  return compacted
}
