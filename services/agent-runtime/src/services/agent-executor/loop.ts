import { logger } from '@stage7-nextgen/shared'
import { askBrain, prepareTurn } from './brainTurn'
import { interpretReply } from './actionParser'
import { handleReplyWithoutAction } from './finalAnswer'
import { fingerprintAction } from './fingerprint'
import { ACTION_GUARDS } from './guards'
import { performAction } from './performAction'
import { hasExternalActionReceipt, missingExpectedArtifactSections, missingRequiredActions } from './requirements'
import type { ActionTurn, RunContext, TurnEnd } from './RunContext'
import type { AgentExecutionResult } from './types'

/**
 * The agent's think-act loop. Each turn asks the Brain for one reply, then either
 * executes the action it proposed or treats the reply as a candidate final answer.
 * The loop ends with a result, or when a budget is spent / a blocker is recorded,
 * in which case an incomplete result is returned so the phase reviewer can regroup.
 */
export async function runAgentLoop(rc: RunContext): Promise<AgentExecutionResult> {
  const { state, limits } = rc
  while (state.brainCalls < limits.brainCallLimit && state.completionTokensReserved < limits.completionTokenLimit) {
    const end = await runTurn(rc)
    if (end?.kind === 'return') return end.result
    if (end?.kind === 'stop-loop') break
  }
  return finishIncomplete(rc)
}

async function runTurn(rc: RunContext): Promise<TurnEnd | undefined> {
  const { state, deps, context } = rc

  const prepared = await prepareTurn(rc)
  const brain = await askBrain(rc, prepared)
  if ('end' in brain) return brain.end
  const { reply } = brain

  const interpreted = interpretReply(reply.content)
  if (!interpreted) return handleReplyWithoutAction(rc, reply)

  const { action, shape } = interpreted
  if (shape !== 'exact') {
    await deps.brain.reportComplaint(
      reply.completion.requestId,
      shape === 'wrapped'
        ? 'Agent response validation failed: a single unambiguous JSON-wrapped tool action was normalized; no other response content was executed.'
        : 'Agent response validation failed: a tool action was mixed with trailing narration; only the leading action was executed.',
      context.missionId,
    )
    state.history[state.history.length - 1] = { role: 'assistant', content: JSON.stringify(action) }
  }

  const turn: ActionTurn = { reply, tools: prepared.tools, action, shape, fingerprint: fingerprintAction(action) }
  for (const guard of ACTION_GUARDS) {
    const vetoed = await guard(rc, turn)
    if (vetoed) return vetoed
  }
  return performAction(rc, turn)
}

/** The loop ran out of budget (or was stopped with a blocker): hand back what was achieved. */
async function finishIncomplete(rc: RunContext): Promise<AgentExecutionResult> {
  const { state, limits, spec, definition, context } = rc
  const exhaustedBudget = state.brainCalls >= limits.brainCallLimit
    ? `${limits.brainCallLimit}-call Brain execution budget`
    : `${limits.completionTokenLimit}-token Brain completion budget`
  const output = state.finalOutput
    || `Agent ${definition.id} exhausted its ${exhaustedBudget} before completing the task. The phase reviewer should use the recorded results to continue the remaining work.`
  state.finalOutput = output
  state.incompleteReason = 'The agent could not verify all required task results.'
  await state.save()
  logger.warn(
    {
      agentId: definition.id,
      missionId: context.missionId,
      missingActions: missingRequiredActions(spec.requiredActions, state.actionReceipts).map((action) => `${action.toolId}:${action.outcome}`),
      missingExternalAction: spec.requiresExternalAction && !hasExternalActionReceipt(state.actionReceipts as any, spec.requiredActions as any),
      missingArtifacts: missingExpectedArtifactSections(output, spec.expectedArtifacts),
    },
    'Returning an incomplete task result for phase-level recovery instead of failing the mission',
  )
  return state.result(output, { incompleteReason: state.incompleteReason, reasoning: undefined })
}
