import type { BrainClient } from './BrainClient'
import {
  asksForProviderSetup,
  asksUserToManageTools,
  CAPABILITY_RESOLUTION_GUIDANCE,
  extractAskUserQuestion,
  hasTriedToolAfterResolution,
} from './askUser'
import { containsToolAction } from './actionParser'
import { ASK_USER_MARKER, MAX_ARTIFACT_CORRECTION_ATTEMPTS } from './constants'
import { assessCompletion, composeCorrection, type CompletionGaps } from './requirements'
import { NEXT_TURN, returnWith, type RunContext, type TurnEnd } from './RunContext'
import type { AgentExecutionResult, BrainReply } from './types'

function artifactBlocker(missingArtifacts: string[]): string {
  return `Could not produce required deliverable section(s) in the expected format after ${MAX_ARTIFACT_CORRECTION_ATTEMPTS} correction attempts: ${missingArtifacts.join(', ')}.`
}

/** Tells the Brain which parts of its answer failed validation. `subject` is how the answer is named in the complaint. */
async function reportCompletionGaps(
  brain: BrainClient,
  requestId: string | undefined,
  gaps: CompletionGaps,
  subject: 'final output' | 'output',
  missionId: string,
): Promise<void> {
  if (gaps.missingActions.length > 0) {
    await brain.reportComplaint(
      requestId,
      `Agent response validation failed: missing required action receipt(s): ${gaps.missingActions.map((action) => `${action.toolId}:${action.outcome}`).join(', ')}.`,
      missionId,
    )
  }
  if (gaps.missingExternalAction) {
    await brain.reportComplaint(
      requestId,
      'Agent response validation failed: no successful external-operation receipt was recorded.',
      missionId,
    )
  }
  if (gaps.missingArtifacts.length > 0) {
    await brain.reportComplaint(
      requestId,
      `Agent response validation failed: ${subject} omitted required artifact section(s): ${gaps.missingArtifacts.join(', ')}.`,
      missionId,
    )
  }
}

/**
 * A checkpoint that already holds a final answer is re-checked against the task
 * contract. Returns a result when the answer can be returned as-is; otherwise queues a
 * correction and returns `undefined` so the loop can ask the Brain for a better one.
 */
export async function replayFinishedCheckpoint(rc: RunContext): Promise<AgentExecutionResult | undefined> {
  const { state, spec, deps, context } = rc
  const finalOutput = state.finalOutput
  if (finalOutput === undefined) return undefined

  if (state.incompleteReason) {
    return state.result(finalOutput, { incompleteReason: state.incompleteReason })
  }
  if (containsToolAction(finalOutput)) {
    await deps.brain.reportComplaint(state.lastRequestId, 'Agent response validation failed: checkpoint contains an unexecuted tool-action-shaped response.', context.missionId)
    state.tell('The previous response described a tool action but was not executed. Return exactly one raw JSON action with "tool" and "args", or a verified final answer. Do not claim that the proposed action succeeded.')
    state.finalOutput = undefined
    await state.save()
    return undefined
  }
  const gaps = assessCompletion(spec, finalOutput, state.actionReceipts)
  if (gaps.complete) return state.result(finalOutput, { reasoning: undefined })

  await reportCompletionGaps(deps.brain, state.lastRequestId, gaps, 'final output', context.missionId)
  // Carried over unchanged: `artifactCorrectionAttempts` starts at 0 for a resumed run, so the
  // limit below can only trigger if a future change raises the starting value.
  state.artifactCorrectionAttempts++
  if (gaps.missingArtifacts.length > 0 && state.artifactCorrectionAttempts > MAX_ARTIFACT_CORRECTION_ATTEMPTS) {
    const blocker = artifactBlocker(gaps.missingArtifacts)
    return state.result(finalOutput || blocker, { incompleteReason: blocker })
  }
  // Drop the invalid final response before retrying so corrections don't accumulate prior bad outputs.
  if (gaps.missingArtifacts.length > 0 && state.history[state.history.length - 1]?.role === 'assistant') {
    state.history = state.history.slice(0, -1)
  }
  state.tell(composeCorrection(gaps, spec.missionGoal))
  state.finalOutput = undefined
  return undefined
}

/**
 * The Brain replied with something that is not an executable action: an
 * `__ASK_USER__` question, a malformed action, or a candidate final answer.
 */
export async function handleReplyWithoutAction(rc: RunContext, reply: BrainReply): Promise<TurnEnd> {
  if (reply.content.includes(ASK_USER_MARKER)) return handleAskUserReply(rc, reply)
  if (containsToolAction(reply.content)) return rejectMalformedAction(rc, reply)
  return checkFinalAnswer(rc, reply)
}

async function handleAskUserReply(rc: RunContext, { content, reasoning }: BrainReply): Promise<TurnEnd> {
  const { state } = rc
  const relevant = extractAskUserQuestion(content)
  if (!relevant) {
    state.tell(`Your response contained no usable question. If you are blocked, reply with exactly one line: ${ASK_USER_MARKER} <your question about one specific missing value>. Otherwise continue the task with a single JSON action. Do not repeat instructions or write your own receipts.`)
    await state.save()
    return NEXT_TURN
  }
  const question = relevant.slice(ASK_USER_MARKER.length)
  const triedResolvedTool = hasTriedToolAfterResolution(state.actionReceipts.map((receipt) => receipt.toolId))
  if (asksUserToManageTools(question) || (!triedResolvedTool && asksForProviderSetup(question))) {
    state.tell(CAPABILITY_RESOLUTION_GUIDANCE)
    await state.save()
    return NEXT_TURN
  }
  await state.save()
  return returnWith(state.result(relevant, { reasoning }))
}

async function rejectMalformedAction(rc: RunContext, { completion }: BrainReply): Promise<TurnEnd> {
  const { state, deps, context } = rc
  const correction = 'Your response included a tool-action object, but it was not the sole valid action response and was not executed. To execute an action, return exactly one raw JSON object in the form {"tool":"<tool-id>","args":{...}} with no surrounding prose, Markdown fence, or nesting. Otherwise return plain text if the task is complete. Never describe or claim an action that was not executed.'
  await deps.brain.reportComplaint(
    completion.requestId,
    'Agent response validation failed: tool-action-shaped content was not a single valid executable action.',
    context.missionId,
  )
  state.tell(`${correction} No proposed action in the previous response was executed. Select the next single action needed for the original task and return only that action; after receiving its result, continue with the remaining work.`)
  await state.save()
  return NEXT_TURN
}

/** Accepts the reply as the final answer, or asks the Brain to fix what is missing from it. */
async function checkFinalAnswer(rc: RunContext, { completion, content, reasoning }: BrainReply): Promise<TurnEnd> {
  const { state, spec, deps, context } = rc
  const gaps = assessCompletion(spec, content, state.actionReceipts)
  if (gaps.complete) {
    state.artifactCorrectionAttempts = 0
    state.finalOutput = content
    await state.save()
    return returnWith(state.result(content, { reasoning }))
  }

  await reportCompletionGaps(deps.brain, completion.requestId, gaps, 'output', context.missionId)
  state.artifactCorrectionAttempts++
  const onlyArtifactsMissing = gaps.missingArtifacts.length > 0
    && gaps.missingActions.length === 0
    && !gaps.missingExternalAction
  if (onlyArtifactsMissing && state.artifactCorrectionAttempts > MAX_ARTIFACT_CORRECTION_ATTEMPTS) {
    const blocker = artifactBlocker(gaps.missingArtifacts)
    state.finalOutput = content
    state.incompleteReason = blocker
    await state.save()
    return returnWith(state.result(content, { incompleteReason: blocker, reasoning }))
  }
  // For artifact-only format corrections, drop the invalid assistant response to avoid
  // prompt bloat and prevent the model from copying its previous malformed output.
  if (onlyArtifactsMissing) state.history = state.history.slice(0, -1)
  state.tell(composeCorrection(gaps, spec.missionGoal))
  await state.save()
  return NEXT_TURN
}
