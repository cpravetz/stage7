import { CREATE_TOOL_ACTION } from './constants'
import { keyForSignature } from './fingerprint'
import { receiptFromResult } from './receipts'
import { NEXT_TURN, STOP_LOOP, returnWith, type ActionTurn, type RunContext, type TurnEnd } from './RunContext'
import { findTool } from './toolCatalog'
import { classifyFailure, FAILURE_CODES } from './toolFailures'
import type { AgentActionReceipt, ToolDescriptor, ToolResult } from './types'

/** How many characters of the mission goal are quoted when describing a missing capability. */
const MAX_GOAL_CHARS = 1_000

const taskGoalOf = (rc: RunContext): string => rc.spec.missionGoal?.trim().slice(0, MAX_GOAL_CHARS) ?? ''

const isHandoffToUser = (result: ToolResult): boolean =>
  result.outcome === 'permission_required' || result.outcome === 'question_asked'

/** Most recent receipt (searching from the end) matching `predicate`. */
function lastReceipt(
  receipts: AgentActionReceipt[],
  predicate: (receipt: AgentActionReceipt) => boolean,
): AgentActionReceipt | undefined {
  return [...receipts].reverse().find(predicate)
}

interface ResolutionAttempt {
  resolution: ToolResult
  /** The action key recorded on the resolution's receipt. */
  actionKey: string
}

/**
 * Asks the Tool Executor to resolve a capability (`__create_tool`) as a stand-in for
 * `failedToolId`, charging it against the action budget and recording its receipt.
 */
async function attemptResolution(
  rc: RunContext,
  turn: ActionTurn,
  resolutionArgs: Record<string, unknown>,
  failedToolId: string,
): Promise<ResolutionAttempt> {
  const { state, deps, definition, context, toolPolicy } = rc
  const resolutionSignature = `${CREATE_TOOL_ACTION}:${JSON.stringify(resolutionArgs)}`
  const resolutionActionKey = keyForSignature(resolutionSignature)
  state.toolCalls++
  await state.save(resolutionSignature)
  const resolution = await deps.actions.execute(
    { tool: CREATE_TOOL_ACTION, args: resolutionArgs },
    turn.tools,
    definition,
    context,
    toolPolicy,
    turn.reply.completion.requestId,
  )
  state.actionReceipts.push(receiptFromResult(CREATE_TOOL_ACTION, resolution, resolutionActionKey, {
    fallbackForToolId: failedToolId,
    ...(resolution.resolvedToolId ? { resolvedToolId: resolution.resolvedToolId } : {}),
  }))
  return { resolution, actionKey: resolutionActionKey }
}

const BLOCKER_SUFFIX = 'The phase reviewer should use this blocker to regroup the task.'

// ---------------------------------------------------------------------------
// Recovery 1: the Brain keeps proposing the same action
// ---------------------------------------------------------------------------

/**
 * The same action was proposed three times in a row. If an earlier attempt failed,
 * try to resolve a replacement capability once; otherwise give up with a blocker.
 */
export async function recoverFromRepeatedAction(rc: RunContext, turn: ActionTurn): Promise<TurnEnd> {
  const { state, deps, definition, context, toolPolicy, policy } = rc
  const { action, tools, reply, fingerprint } = turn
  const reason = `Agent ${definition.id} repeated the same action without progress: ${action.tool}`
  const previousFailure = lastReceipt(
    state.actionReceipts,
    (receipt) => receipt.actionKey === fingerprint.actionKey && receipt.isError,
  )
  const failedTool = findTool(tools, action.tool)
  const failedToolId = failedTool?.id || action.tool
  const resolutionReceipt = lastReceipt(
    state.actionReceipts,
    (receipt) => receipt.toolId === CREATE_TOOL_ACTION && receipt.fallbackForToolId === failedToolId,
  )
  const capabilityResolutionAttempted = state.actionReceipts.some(
    (receipt) => receipt.toolId === CREATE_TOOL_ACTION && receipt.fallbackForToolId === failedToolId,
  )

  if (
    previousFailure
    && previousFailure.outcomeKnown !== false
    && classifyFailure(previousFailure.content).code !== FAILURE_CODES.OUTCOME_UNKNOWN
    && !capabilityResolutionAttempted
    && toolPolicy.mode !== 'allowlist'
    && state.toolCalls < policy.maxActions
  ) {
    const taskGoal = taskGoalOf(rc)
    const capability = taskGoal || (failedTool
      ? `${failedTool.name} ${failedTool.description}`
      : action.tool.replace(/[_-]+/g, ' '))
    const { resolution } = await attemptResolution(rc, turn, {
      capability,
      description: [
        `Resolve the capability required by this task: "${capability}".`,
        `The selected tool "${failedTool?.name || action.tool}" failed: ${previousFailure.content.slice(0, 500)}`,
        'Choose a tool that performs the exact requested operation and produces evidence of its result; a similarly named draft, queue, or storage tool is not a substitute for an external action.',
        'Check registered and approved integrations first; create a compatible implementation only if none is suitable.',
        'Do not install unavailable runtime packages or claim success without verified execution.',
      ].join(' '),
      requirements: [],
      excludeToolIds: [failedToolId],
    }, failedToolId)
    if (isHandoffToUser(resolution)) {
      await state.save()
      return returnWith(state.result(resolution.content, { reasoning: reply.reasoning }))
    }
    if (!resolution.isError && resolution.resolvedToolId) {
      state.fallbackToolIds.set(resolution.resolvedToolId, failedToolId)
      state.tell(`Capability resolution registered "${resolution.resolvedToolId}". Use that tool to satisfy the task instead of repeating "${action.tool}".`)
      state.lastAction = ''
      state.repeatedActionCount = 0
      await state.save()
      return NEXT_TURN
    }
    const resolutionFailure = resolution.isError
      ? ` Automatic capability resolution failed: ${resolution.content}`
      : ' Automatic capability resolution did not register a usable tool.'
    await deps.brain.reportComplaint(reply.completion.requestId, `${reason}.${resolutionFailure}`, context.missionId)
    state.finalOutput = `${reason}.${resolutionFailure} ${BLOCKER_SUFFIX}`
    return STOP_LOOP
  }

  const failureDetail = previousFailure
    ? ` Previous tool result: ${previousFailure.content.slice(0, 500)}.`
    : ''
  const resolutionDetail = capabilityResolutionAttempted && resolutionReceipt?.isError
    ? ` Capability resolution also failed: ${resolutionReceipt.content.slice(0, 500)}.`
    : ''
  const blockedResolutionDetail = previousFailure
    && !capabilityResolutionAttempted
    && toolPolicy.mode !== 'allowlist'
    && state.toolCalls >= policy.maxActions
    ? ` Automatic capability resolution was not attempted because the action budget was exhausted (${state.toolCalls}/${policy.maxActions}).`
    : ''
  const detailedReason = `${reason}.${failureDetail}${resolutionDetail}${blockedResolutionDetail}`
  await deps.brain.reportComplaint(reply.completion.requestId, detailedReason, context.missionId)
  state.finalOutput = `${detailedReason} ${BLOCKER_SUFFIX}`
  return STOP_LOOP
}

// ---------------------------------------------------------------------------
// Recovery 2: a tool just failed in a way another tool might fix
// ---------------------------------------------------------------------------

export type FailureRecovery =
  /** Stop here: the run ends (user hand-off) or the turn is over. */
  | { end: TurnEnd }
  /** Use this result in place of the failed tool's result. */
  | { result: ToolResult }

/**
 * After a tool call, decides whether the failure calls for resolving a different
 * capability (missing runtime module, unknown tool, or repeated failure) and, if so, tries once.
 * Returns `undefined` when no recovery applies.
 */
export async function recoverFromToolFailure(
  rc: RunContext,
  turn: ActionTurn,
  failure: { missingModule: string | undefined; repeatedToolFailure: boolean; unavailableRequestedTool: boolean; configurationFailure: boolean; failedTool: ToolDescriptor | undefined },
): Promise<FailureRecovery | undefined> {
  const { state, toolPolicy, policy } = rc
  const { action } = turn
  const { missingModule, repeatedToolFailure, unavailableRequestedTool, configurationFailure, failedTool } = failure
  const failedToolId = failedTool?.id || action.tool
  const capabilityResolutionAttempted = state.actionReceipts.some(
    (receipt) => receipt.toolId === CREATE_TOOL_ACTION && receipt.fallbackForToolId === failedToolId,
  )
  const needsCapabilityResolution = Boolean(
    (missingModule && failedTool)
    || unavailableRequestedTool
    || repeatedToolFailure
    || (configurationFailure && failedTool),
  )
  if (
    !needsCapabilityResolution
    || capabilityResolutionAttempted
    || toolPolicy.mode === 'allowlist'
    || state.toolCalls >= policy.maxActions
  ) {
    return undefined
  }

  const capabilityDescription = failedTool
    ? `${failedTool.name} ${failedTool.description}`
    : action.tool.replace(/[_-]+/g, ' ')
  const taskGoal = taskGoalOf(rc)
  const capabilitySource = failedTool
    ? `${taskGoal} ${failedTool.name} ${failedTool.description}`.slice(0, 1_500)
    : taskGoal || capabilityDescription
  const capability = capabilitySource
    .match(/[a-z0-9]+/gi)
    ?.join(' ')
    || action.tool
  const { resolution, actionKey: resolutionActionKey } = await attemptResolution(rc, turn, {
    capability,
    description: [
      `Resolve the capability "${capability}".`,
      failedTool
        ? `The available tool "${failedTool.name}" (${failedTool.id}) failed${missingModule ? ` because runtime package "${missingModule}" is unavailable` : configurationFailure ? ' because required configuration is missing' : repeatedToolFailure ? ' repeatedly without progress' : ''}.`
        : 'A guessed tool identifier was not registered; derive the capability from the task goal rather than that identifier.',
      taskGoal ? `Task goal: "${taskGoal}".` : '',
      'Check registered and approved integrations first; create a compatible implementation only if none is suitable. The replacement must perform the exact task operation, not a similarly named draft, queue, or storage operation.',
      'Do not install unavailable runtime packages or claim success without verified execution.',
    ].filter(Boolean).join(' '),
    requirements: missingModule
      ? [`Do not depend on unavailable runtime package "${missingModule}".`]
      : [],
    excludeToolIds: failedTool ? [failedTool.id] : [action.tool],
  }, failedToolId)
  if (!resolution.isError && resolution.resolvedToolId) {
    state.fallbackToolIds.set(resolution.resolvedToolId, failedToolId)
  }
  state.priorActionKeys.add(resolutionActionKey)
  if (isHandoffToUser(resolution)) {
    await state.save()
    return { end: returnWith(state.result(resolution.content, { reasoning: turn.reply.reasoning })) }
  }
  return {
    result: {
      ...resolution,
      content: resolution.isError
        ? `The requested capability could not be executed by the original tool. Alternative resolution also failed: ${resolution.content}`
        : `The original tool was unavailable or failed. ${resolution.content}`,
    },
  }
}
