import { DELEGATE_ACTION, ASK_USER_MARKER } from './constants'
import { recoverFromToolFailure } from './capabilityRecovery'
import { receiptFromResult } from './receipts'
import { returnWith, type ActionTurn, type RunContext, type TurnEnd } from './RunContext'
import { findTool } from './toolCatalog'
import { getMissingRuntimeModule, isConfigurationFailure, classifyFailure, FAILURE_CODES } from './toolFailures'
import type { ToolResult } from './types'
import { boundedActionResult } from './util'

const isHandoffToUser = (result: ToolResult): boolean =>
  result.outcome === 'permission_required' || result.outcome === 'question_asked'

/**
 * Executes the (already vetted) action, records its receipt, and reports the
 * result back to the Brain. Returns a `TurnEnd` only when the run must stop here
 * (the user has to answer or grant permission).
 */
export async function performAction(rc: RunContext, turn: ActionTurn): Promise<TurnEnd | undefined> {
  const { state, deps, definition, context, toolPolicy } = rc
  const { action, tools, reply, fingerprint, shape } = turn

  state.toolCalls++
  if (action.tool === DELEGATE_ACTION) state.delegations++
  await state.save(fingerprint.signature)

  const previousConfigurationFailure = state.configurationFailures.get(action.tool)
  let result: ToolResult = previousConfigurationFailure
    ? {
      isError: true,
      outcome: 'failure' as const,
      content: `Tool '${action.tool}' was already blocked by missing configuration: ${previousConfigurationFailure}. Do not retry it or invent credentials; use another capability or report the blocker.`,
    }
    : await deps.actions.execute(action, tools, definition, context, toolPolicy, reply.completion.requestId)
  state.actionReceipts.push(receiptFromResult(action.tool, result, fingerprint.actionKey, {
    ...(state.fallbackToolIds.has(action.tool) ? { fallbackForToolId: state.fallbackToolIds.get(action.tool) } : {}),
  }))

  if (result.isError && (result.outcomeKnown === false || classifyFailure(result.content).code === FAILURE_CODES.OUTCOME_UNKNOWN)) {
    const reason = `The outcome of tool "${action.tool}" is uncertain; reconcile the recorded action before attempting another operation. ${boundedActionResult(result.content)}`
    state.finalOutput = reason
    state.incompleteReason = reason
    await state.save()
    return returnWith(state.result(reason, { incompleteReason: reason, reasoning: reply.reasoning }))
  }

  // A failure may be fixable by resolving a different capability.
  const missingModule = result.isError ? getMissingRuntimeModule(result.content) : undefined
  const failedTool = findTool(tools, action.tool)
  const knownFailure = result.isError
    && (!result.outcome || result.outcome === 'failure')
    && result.outcomeKnown !== false
    && classifyFailure(result.content).code !== FAILURE_CODES.OUTCOME_UNKNOWN
  const configurationFailure = knownFailure && isConfigurationFailure(result.content)
  if (configurationFailure) state.configurationFailures.set(action.tool, result.content)
  const failedToolId = failedTool?.id || action.tool
  const failedCallsForTool = state.actionReceipts.filter(
    (receipt) => receipt.isError
      && receipt.outcome === 'failure'
      && (receipt.toolId === action.tool || receipt.toolId === failedToolId),
  ).length
  const repeatedToolFailure = Boolean(
    knownFailure
    && !isConfigurationFailure(result.content)
    && failedTool
    && failedCallsForTool >= 2,
  )
  const unavailableRequestedTool = result.isError
    && !failedTool
    && result.content.includes(`Tool '${action.tool}' is not in the live system catalog.`)
  const recovery = knownFailure ? await recoverFromToolFailure(rc, turn, {
    missingModule,
    repeatedToolFailure,
    unavailableRequestedTool,
    configurationFailure,
    failedTool,
  }) : undefined
  if (recovery && 'end' in recovery) return recovery.end
  if (recovery) result = recovery.result

  if (isHandoffToUser(result)) {
    await state.save()
    return returnWith(state.result(result.content, { reasoning: reply.reasoning }))
  }
  if (result.isError && result.outcomeKnown !== false && result.outcome === 'failure'
    && classifyFailure(result.content).code !== FAILURE_CODES.OUTCOME_UNKNOWN && isConfigurationFailure(result.content)) {
    state.configurationFailures.set(action.tool, result.content)
  }
  const ignoredNarration = shape === 'exact'
    ? ''
    : 'Only the leading action object was considered; all trailing response text was ignored.\n'

  // Propagate structured failure classification for downstream recovery paths.
  // Never repeat the identical failing call without changed conditions.
  const classified = result.isError ? classifyFailure(result.content) : null
  const failureContext = classified
    ? `\n[Failure code: ${classified.code}; retryable: ${classified.retryable}; adaptation: ${classified.adaptation}]`
    : ''

  state.tell(result.isError
    ? `${ignoredNarration}Action failed: ${boundedActionResult(result.content)}${failureContext}\nDo not repeat the failed call. Re-read the mission for provided values, then check existing configuration, the tool catalog and capability resolution. A missing runtime module is not a credential and must not be installed. Only as a last resort, reply with one line: ${ASK_USER_MARKER} <question naming the exact value, the tool needing it, and why>.`
    : `${ignoredNarration}Action result: ${boundedActionResult(result.content)}\nContinue toward the task goal. If complete, return the final answer as plain text.`)
  await state.save()
  return undefined
}
