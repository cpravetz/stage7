import { BRAIN_MODEL_SELECTION_RETRY, logger } from '@stage7-nextgen/shared'
import { MAX_MODEL_SELECTION_RETRIES } from './constants'
import { maxTokensForCall } from './policy'
import { buildSystemPrompt } from './prompt'
import { NEXT_TURN, type RunContext, type TurnEnd } from './RunContext'
import { visibleTools } from './toolCatalog'
import { classifyFailure } from './toolFailures'
import type { BrainReply, BrainResponse, ToolDescriptor } from './types'

export interface PreparedTurn {
  tools: ToolDescriptor[]
  systemPrompt: string
  maxTokens: number
}

/** Reads the live tool catalog, builds this turn's system prompt, and checkpoints before calling the Brain. */
export async function prepareTurn(rc: RunContext): Promise<PreparedTurn> {
  const { state, deps, definition, context, toolPolicy, policy, spec, limits } = rc
  const catalog = policy.maxActions > 0 ? await deps.catalog.list() : []
  const tools = visibleTools(catalog, definition, toolPolicy)
  const remainingCompletionTokens = limits.completionTokenLimit - state.completionTokensReserved
  const systemPrompt = buildSystemPrompt({
    base: definition.systemPrompt,
    tools,
    requiredActions: spec.requiredActions,
    requiresExternalAction: spec.requiresExternalAction,
    delegationDepth: context.delegationDepth,
    maxDelegationDepth: deps.maxDelegationDepth,
    policy,
    toolPolicy,
    remainingBrainCalls: limits.brainCallLimit - state.brainCalls,
    remainingActions: policy.maxActions - state.toolCalls,
    remainingCompletionTokens,
    remainingDelegations: policy.maxDelegations - state.delegations,
  })
  const maxTokens = maxTokensForCall(policy, remainingCompletionTokens)
  await state.save()
  return { tools, systemPrompt, maxTokens }
}

/**
 * Asks the Brain for the agent's next reply and books the spend. Ends the turn
 * (without a reply) when the Brain asks to be retried with another model, or when its reply is empty.
 * Other Brain failures are recorded in the conversation and rethrown with structured classification.
 */
export async function askBrain(
  rc: RunContext,
  { systemPrompt, maxTokens }: PreparedTurn,
): Promise<{ reply: BrainReply } | { end: TurnEnd }> {
  const { state, deps, definition, context, spec } = rc

  let completion: BrainResponse
  try {
    completion = await deps.brain.complete(
      definition,
      context.missionId,
      systemPrompt,
      state.history,
      maxTokens,
      spec.routingSessionId,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.startsWith(BRAIN_MODEL_SELECTION_RETRY)) {
      await retryWithRemainingModels(rc, error, message)
      return { end: NEXT_TURN }
    }
    // Classify the Brain failure for structured downstream recovery.
    const classified = classifyFailure(message)
    const classifiedMessage = `[${classified.code}] ${message}`
    state.history = [...state.history, {
      role: 'user',
      content: `Brain could not complete this turn: ${classifiedMessage}. Reassess the task and continue safely without repeating any action whose outcome is uncertain.`,
    }]
    await state.save()
    // Propagate the classified error so the orchestrator can adapt.
    const classifiedError = new Error(classifiedMessage) as Error & { failureCode?: string; failureAdaptation?: string }
    classifiedError.failureCode = classified.code
    classifiedError.failureAdaptation = classified.adaptation
    throw classifiedError
  }

  state.brainCalls++
  state.completionTokensReserved += maxTokens
  state.tokensUsed += completion.tokensUsed || 0
  state.lastRequestId = completion.requestId
  const reasoning = completion.reasoning || undefined
  const content = (completion.content || '').trim()
  if (!content) {
    await deps.brain.reportComplaint(
      completion.requestId,
      'Agent response validation failed: Brain returned empty content.',
      context.missionId,
    )
    state.tell('Your previous Brain response was empty, so no action was executed. Reassess the task and return one raw JSON action object or a plain-text final answer. Do not claim an action that was not executed.')
    await state.save()
    return { end: NEXT_TURN }
  }

  state.history = [...state.history, { role: 'assistant', content }]
  return { reply: { completion, content, reasoning } }
}

/**
 * The Brain still has untried eligible models/providers. Re-issue the same
 * Brain request (same routing session) so it advances to the remaining
 * candidates instead of aborting the agent task. Gives up if routing stops making progress.
 */
async function retryWithRemainingModels(rc: RunContext, error: unknown, message: string): Promise<void> {
  const { state, context } = rc
  const remainingMatch = message.match(/(\d+) eligible model\(s\) remain untried/i)
  const remainingModelCount = remainingMatch ? Number(remainingMatch[1]) : undefined
  state.modelSelectionRetries++
  if (
    state.modelSelectionRetries > MAX_MODEL_SELECTION_RETRIES
    || (remainingModelCount !== undefined
      && state.previousRemainingModelCount !== undefined
      && remainingModelCount >= state.previousRemainingModelCount)
  ) {
    throw new Error(
      `Brain model routing made no progress after ${state.modelSelectionRetries} retry request(s): ${message}`,
      { cause: error },
    )
  }
  state.previousRemainingModelCount = remainingModelCount
  logger.info({ missionId: context.missionId, reason: message }, 'Brain requested a retry with an untried eligible model; re-issuing Brain call')
  state.history = [...state.history, {
    role: 'user',
    content: 'The previous Brain attempt could not complete yet because some eligible models were not tried. Retry the Brain request now; it will continue with the remaining eligible models.',
  }]
  await state.save()
}
