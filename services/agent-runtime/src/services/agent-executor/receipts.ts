import { extractReceiptBinding } from '@stage7-nextgen/shared'
import { MAX_ACTION_RECEIPT_CHARS } from './constants'
import { isToolFailurePayload } from './toolFailures'
import type { AgentActionOutcome, AgentActionReceipt, ToolResult } from './types'
import { asRecord } from './util'

export function enrichReceipt(receipt: AgentActionReceipt): AgentActionReceipt {
  const binding = extractReceiptBinding(receipt as any) as any
  return {
    ...receipt,
    ...(binding.operation && !receipt.operation ? { operation: binding.operation } : {}),
    ...(binding.providerRequestId && !receipt.providerRequestId ? { providerRequestId: binding.providerRequestId } : {}),
    ...(typeof binding.outcomeKnown === 'boolean' && receipt.outcomeKnown === undefined ? { outcomeKnown: binding.outcomeKnown } : {}),
    ...(Object.keys(binding).length > 0 ? { binding: { ...(receipt.binding || {}), ...binding } } : {}),
  }
}

/** Builds the receipt recorded for an action that was actually executed. */
export function receiptFromResult(
  toolId: string,
  result: ToolResult,
  actionKey: string,
  extra: Partial<AgentActionReceipt> = {},
): AgentActionReceipt {
  return enrichReceipt({
    toolId,
    isError: result.isError,
    content: result.content.slice(0, MAX_ACTION_RECEIPT_CHARS),
    outcome: result.outcome || (result.isError ? 'failure' : 'success'),
    actionKey,
    ...extra,
  })
}

/**
 * Produces the minimal durable form of a receipt for checkpoint persistence.
 *
 * Receipts are kept intact during an active run because the executor reads
 * `fallbackForToolId`/`resolvedToolId`/`binding` to dedupe in-flight actions.
 * Once a checkpoint is saved for later resume, those transient fields are no
 * longer needed — what matters for resume is the identity of the action
 * (`actionKey`), what it did (`toolId`/`outcome`/`content`), and the provider
 * reference (`providerRequestId`) so a follow-up can look the same thing up.
 *
 * The full reconciliation object is the main bloat vector: each one carries a
 * `lookupOutcome` string (up to 500 chars), a `note`, and a `lookupStatus`.
 * Keeping those intact across dozens of failed task retries is what pushed
 * checkpoints past the storage limit, so the durable form keeps only the fields
 * a resumed run actually consumes.
 */
export function compactReceiptForPersistence(receipt: AgentActionReceipt): AgentActionReceipt {
  // `fallbackForToolId`/`resolvedToolId` are read back at resume time to rebuild
  // the tool-creation dedup map, so they survive compaction even though they are
  // transient during an active run.
  const keepToolLink = receipt.fallbackForToolId || receipt.resolvedToolId
  const trimmedReconciliation = receipt.reconciliation
    ? {
      ...(receipt.reconciliation.provider !== undefined ? { provider: receipt.reconciliation.provider } : {}),
      ...(receipt.reconciliation.outcomeKnown !== undefined ? { outcomeKnown: receipt.reconciliation.outcomeKnown } : {}),
      ...(receipt.reconciliation.providerRequestId !== undefined ? { providerRequestId: receipt.reconciliation.providerRequestId } : {}),
    }
    : undefined
  const trimmedBinding = receipt.binding
    ? {
      ...(receipt.binding.operation !== undefined ? { operation: receipt.binding.operation } : {}),
      ...(receipt.binding.providerRequestId !== undefined ? { providerRequestId: receipt.binding.providerRequestId } : {}),
    }
    : undefined
  return {
    ...receipt,
    ...(keepToolLink ? {} : { fallbackForToolId: undefined, resolvedToolId: undefined }),
    ...(trimmedReconciliation ? { reconciliation: trimmedReconciliation } : {}),
    ...(trimmedBinding ? { binding: trimmedBinding } : {}),
  }
}

const OUTCOMES = ['success', 'failure', 'denied', 'question_asked', 'permission_required']

export function parseActionReceipts(value: unknown): AgentActionReceipt[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    throw new Error('The saved progress for this task includes invalid step records')
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
      || (receipt.executionId !== undefined && (typeof receipt.executionId !== 'string' || !receipt.executionId.trim()))
      || (receipt.operation !== undefined && (typeof receipt.operation !== 'string' || !receipt.operation.trim()))
      || (receipt.providerRequestId !== undefined && (typeof receipt.providerRequestId !== 'string' || !receipt.providerRequestId.trim()))
      || (receipt.outcomeKnown !== undefined && typeof receipt.outcomeKnown !== 'boolean')
      || (receipt.reconciliation !== undefined && (typeof receipt.reconciliation !== 'object' || !receipt.reconciliation || Array.isArray(receipt.reconciliation)))
      || (receipt.binding !== undefined && (typeof receipt.binding !== 'object' || !receipt.binding || Array.isArray(receipt.binding)))
      || (receipt.outcome !== undefined && !OUTCOMES.includes(String(receipt.outcome)))
    ) {
      throw new Error('The saved progress for this task includes an invalid step record')
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
    const base: AgentActionReceipt = {
      toolId: receipt.toolId,
      isError: receipt.isError || semanticFailure || outcome === 'failure' || outcome === 'permission_required',
      content: receipt.content.slice(0, MAX_ACTION_RECEIPT_CHARS),
      outcome,
      ...(typeof receipt.actionKey === 'string' ? { actionKey: receipt.actionKey } : {}),
      ...(typeof receipt.fallbackForToolId === 'string' ? { fallbackForToolId: receipt.fallbackForToolId } : {}),
      ...(typeof receipt.resolvedToolId === 'string' ? { resolvedToolId: receipt.resolvedToolId } : {}),
      ...(typeof receipt.executionId === 'string' ? { executionId: receipt.executionId } : {}),
      ...(typeof receipt.operation === 'string' ? { operation: receipt.operation } : {}),
      ...(typeof receipt.providerRequestId === 'string' ? { providerRequestId: receipt.providerRequestId } : {}),
      ...(typeof receipt.outcomeKnown === 'boolean' ? { outcomeKnown: receipt.outcomeKnown } : {}),
      ...(receipt.reconciliation && typeof receipt.reconciliation === 'object' && !Array.isArray(receipt.reconciliation) ? { reconciliation: receipt.reconciliation as Record<string, unknown> } : {}),
      ...(receipt.binding && typeof receipt.binding === 'object' && !Array.isArray(receipt.binding) ? { binding: receipt.binding as Record<string, unknown> } : {}),
    }
    const binding = extractReceiptBinding(base as any) as any
    return {
      ...base,
      ...(binding.operation && !base.operation ? { operation: binding.operation } : {}),
      ...(binding.providerRequestId && !base.providerRequestId ? { providerRequestId: binding.providerRequestId } : {}),
      ...(Object.keys(binding).length > 0 ? { binding } : {}),
    }
  })
}
