import {
  asksForProviderSetup,
  asksUserToManageTools,
  CAPABILITY_RESOLUTION_GUIDANCE,
  hasTriedToolAfterResolution,
} from './askUser'
import { CREATE_TOOL_ACTION, DELEGATE_ACTION, isAskUserTool } from './constants'
import { recoverFromRepeatedAction } from './capabilityRecovery'
import { enrichReceipt } from './receipts'
import { NEXT_TURN, STOP_LOOP, type ActionTurn, type RunContext, type TurnEnd } from './RunContext'
import { findTool } from './toolCatalog'

/**
 * A guard inspects a proposed action before it runs. It returns a `TurnEnd` to
 * veto the action (the Brain is told why, or the run stops), or `undefined` to let it through.
 */
export type ActionGuard = (rc: RunContext, turn: ActionTurn) => Promise<TurnEnd | undefined>

const BLOCKER_SUFFIX = 'The phase reviewer should use this blocker to regroup the task.'

/** The agent must find missing capabilities itself, not delegate that work to the user. */
const refuseToolManagementQuestion: ActionGuard = async ({ state }, { action }) => {
  const triedResolvedTool = hasTriedToolAfterResolution(state.actionReceipts.map((receipt) => receipt.toolId))
  if (
    isAskUserTool(action.tool)
    && typeof action.args.question === 'string'
    && (
      asksUserToManageTools(action.args.question)
      || (!triedResolvedTool && asksForProviderSetup(action.args.question))
    )
  ) {
    state.tell(CAPABILITY_RESOLUTION_GUIDANCE)
    await state.save()
    return NEXT_TURN
  }
  return undefined
}

const enforceDelegationBudget: ActionGuard = async ({ state, policy, context, deps }, { action }) => {
  if (
    action.tool === DELEGATE_ACTION
    && (state.delegations >= policy.maxDelegations || context.delegationDepth >= deps.maxDelegationDepth)
  ) {
    state.tell('The delegation budget exhausted for this execution. Do not delegate; complete the task directly or explain the blocker.')
    await state.save()
    return NEXT_TURN
  }
  return undefined
}

/** A required side effect that already succeeded must not be performed twice. */
const refuseRepeatOfCompletedAction: ActionGuard = async ({ state, spec, deps, context }, { action, reply }) => {
  const alreadySatisfied = spec.requiredActions.some(
    (required) => required.toolId === action.tool && required.outcome === 'success',
  ) && state.actionReceipts.some(
    (receipt) => receipt.toolId === action.tool && receipt.outcome === 'success',
  )
  if (!alreadySatisfied) return undefined
  if (!alreadySatisfied) return undefined

  const reason = `Agent response validation failed: action "${action.tool}" already has a successful persisted receipt; the repeated action was not executed.`
  await deps.brain.reportComplaint(reply.completion.requestId, reason, context.missionId)
  state.actionReceipts.push(enrichReceipt({
    toolId: action.tool,
    isError: true,
    content: reason,
    outcome: 'denied',
  }))
  state.tell(`${reason} The previous action result is already in the conversation. Return the required task artifacts using the already-completed action results without repeating any side-effect action.`)
  await state.save()
  return NEXT_TURN
}

/** Tracks consecutive identical actions; the third in a row is handled as "no progress". */
const detectNoProgress: ActionGuard = async (rc, turn) => {
  const { state } = rc
  const { signature } = turn.fingerprint
  state.repeatedActionCount = signature === state.lastAction ? state.repeatedActionCount + 1 : 0
  state.lastAction = signature
  if (state.repeatedActionCount >= 2) return recoverFromRepeatedAction(rc, turn)
  return undefined
}

/** An action whose result was persisted before an interruption is replayed from that result, not re-run. */
const reuseResultFromBeforeInterruption: ActionGuard = async ({ state }, { fingerprint }) => {
  if (!state.priorActionKeys.has(fingerprint.actionKey)) return undefined
  const previousReceipt = state.priorActionReceipts.find((receipt) => receipt.actionKey === fingerprint.actionKey)
  state.tell(`This exact action already has a persisted result from before the mission interruption and was not repeated. Previous result: ${previousReceipt?.content || 'result unavailable'}. Continue using that result or explain the blocker.`)
  state.lastAction = ''
  state.repeatedActionCount = 0
  await state.save()
  return NEXT_TURN
}

/** A tool that already prompted the user for credentials without success must not be retried. */
const refuseRetryOfCredentialRequestedTool: ActionGuard = async ({ state, deps, context }, { action, reply, tools }) => {
  const selectedToolId = findTool(tools, action.tool)?.id || action.tool
  const earlierCredentialRequest = [...state.actionReceipts].reverse().find(
    (receipt) => (receipt.toolId === action.tool || receipt.toolId === selectedToolId)
      && receipt.outcome === 'question_asked',
  )
  if (!earlierCredentialRequest) return undefined

  const reason = `Tool '${selectedToolId}' already prompted the user for credentials and the mission resumed without those credentials. Do not retry it; choose a different capability, resolve a replacement tool, or explain the blocker.`
  await deps.brain.reportComplaint(reply.completion.requestId, reason, context.missionId)
  state.actionReceipts.push(enrichReceipt({
    toolId: action.tool,
    isError: true,
    content: reason,
    outcome: 'denied',
  }))
  state.tell(`${reason} The prior credential request did not produce usable credentials. Use another tool or report the exact blocker.`)
  await state.save()
  return NEXT_TURN
}

/** A tool that already failed, and for which resolution was already tried, is not called again. */
const refuseToolThatFailedAfterResolution: ActionGuard = async ({ state, deps, context }, { action, tools, reply, fingerprint }) => {
  const selectedToolId = findTool(tools, action.tool)?.id || action.tool
  const earlierToolFailure = [...state.actionReceipts].reverse().find(
    (receipt) => (receipt.toolId === action.tool || receipt.toolId === selectedToolId)
      && receipt.outcome === 'failure',
  )
  const earlierResolution = [...state.actionReceipts].reverse().find(
    (receipt) => receipt.toolId === CREATE_TOOL_ACTION
      && receipt.fallbackForToolId === selectedToolId,
  )
  if (!earlierToolFailure || !earlierResolution) return undefined

  const alreadyBlocked = state.actionReceipts.some(
    (receipt) => (receipt.toolId === action.tool || receipt.toolId === selectedToolId)
      && receipt.outcome === 'failure'
      && receipt.content.includes('capability resolution was already attempted'),
  )
  const reason = `Tool '${selectedToolId}' already failed and generic capability resolution was already attempted. Original failure: ${earlierToolFailure.content.slice(0, 400)} Resolution result: ${earlierResolution.content.slice(0, 400)}`
  if (alreadyBlocked) {
    await deps.brain.reportComplaint(reply.completion.requestId, reason, context.missionId)
    state.finalOutput = `${reason} ${BLOCKER_SUFFIX}`
    return STOP_LOOP
  }
  state.actionReceipts.push(enrichReceipt({
    toolId: action.tool,
    isError: true,
    content: reason,
    outcome: 'failure',
    actionKey: fingerprint.actionKey,
  }))
  state.tell(`${reason} Do not call this tool again. Use the registered alternative if one was resolved, or report the exact remaining blocker.`)
  state.lastAction = ''
  state.repeatedActionCount = 0
  await state.save()
  return NEXT_TURN
}

const enforceActionBudget: ActionGuard = async ({ state, policy, definition, deps, context }, { action, reply }) => {
  if (state.toolCalls < policy.maxActions) return undefined
  const reason = `Agent ${definition.id} exhausted its ${policy.maxActions}-action execution budget before executing '${action.tool}'.`
  await deps.brain.reportComplaint(reply.completion.requestId, reason, context.missionId)
  state.finalOutput = `${reason} ${BLOCKER_SUFFIX}`
  return STOP_LOOP
}

/** Run in this order: the first guard to return a `TurnEnd` wins. */
export const ACTION_GUARDS: readonly ActionGuard[] = [
  refuseToolManagementQuestion,
  enforceDelegationBudget,
  refuseRepeatOfCompletedAction,
  detectNoProgress,
  reuseResultFromBeforeInterruption,
  refuseToolThatFailedAfterResolution,
  refuseRetryOfCredentialRequestedTool,
  enforceActionBudget,
]
