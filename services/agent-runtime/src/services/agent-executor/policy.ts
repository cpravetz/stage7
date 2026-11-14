import { DEFAULT_AGENT_EXECUTION_POLICY, type AgentExecutionPolicy } from '../../types'
import {
  DEFAULT_COMPLETION_TOKENS_PER_CALL,
  MAX_COMPLETION_TOKENS_PER_CALL,
  RESUME_COMPLETION_TOKEN_BONUS,
} from './constants'

/** Validates a policy and fills in `maxCompletionTokensPerCall`. `Number.MAX_SAFE_INTEGER` means "unlimited". */
export function resolvePolicy(policy?: AgentExecutionPolicy): AgentExecutionPolicy {
  const resolved = policy || DEFAULT_AGENT_EXECUTION_POLICY
  const limits: Array<[keyof AgentExecutionPolicy, number, number]> = [
    ['maxBrainCalls', resolved.maxBrainCalls, DEFAULT_AGENT_EXECUTION_POLICY.maxBrainCalls],
    ['maxActions', resolved.maxActions, DEFAULT_AGENT_EXECUTION_POLICY.maxActions],
    ['maxCompletionTokens', resolved.maxCompletionTokens, DEFAULT_AGENT_EXECUTION_POLICY.maxCompletionTokens],
    ['maxCompletionTokensPerCall', resolved.maxCompletionTokensPerCall ?? DEFAULT_AGENT_EXECUTION_POLICY.maxCompletionTokensPerCall, MAX_COMPLETION_TOKENS_PER_CALL],
    ['maxDelegations', resolved.maxDelegations, DEFAULT_AGENT_EXECUTION_POLICY.maxDelegations],
  ]
  for (const [name, value, maximum] of limits) {
    const minimum = name === 'maxDelegations' || name === 'maxActions' ? 0 : 1
    // Number.MAX_SAFE_INTEGER is treated as an explicit "unlimited" sentinel.
    const isUnlimited = value === Number.MAX_SAFE_INTEGER
    if (
      !Number.isInteger(value)
      || value < minimum
      || (!isUnlimited && value > maximum)
    ) {
      throw new Error(`Agent execution policy ${name} must be an integer between ${minimum} and ${maximum}, or ${Number.MAX_SAFE_INTEGER} for unlimited`)
    }
  }
  const maxCompletionTokensPerCall = resolved.maxCompletionTokensPerCall ?? DEFAULT_AGENT_EXECUTION_POLICY.maxCompletionTokensPerCall
  if (
    maxCompletionTokensPerCall !== Number.MAX_SAFE_INTEGER
    && resolved.maxCompletionTokens !== Number.MAX_SAFE_INTEGER
    && maxCompletionTokensPerCall > resolved.maxCompletionTokens
  ) {
    throw new Error('Agent execution policy maxCompletionTokensPerCall cannot exceed maxCompletionTokens')
  }
  return { ...resolved, maxCompletionTokensPerCall }
}

export interface RunLimits {
  brainCallLimit: number
  completionTokenLimit: number
}

/**
 * Turns a policy into this run's hard limits. A task resumed from a checkpoint
 * gets one extra Brain call and a token bonus, once.
 *
 * Behaviour carried over unchanged from the original executor, flagged for review:
 *  - `maxBrainCalls === MAX_SAFE_INTEGER` ("unlimited") also bypasses `maxIterations`,
 *    so the executor's own iteration cap does not apply to unlimited policies.
 *  - `completionTokenLimit` is keyed on `maxBrainCalls`, not `maxCompletionTokens`, so an
 *    unlimited Brain-call policy makes the token budget unlimited too.
 */
export function computeRunLimits(
  policy: AgentExecutionPolicy,
  maxIterations: number,
  grantResumeAllowance: boolean,
): RunLimits {
  const brainCallLimit =
    policy.maxBrainCalls === Number.MAX_SAFE_INTEGER
      ? Number.MAX_SAFE_INTEGER
      : Math.min(maxIterations, policy.maxBrainCalls + Number(grantResumeAllowance))
  const completionTokenLimit =
    policy.maxBrainCalls === Number.MAX_SAFE_INTEGER
      ? Number.MAX_SAFE_INTEGER
      : policy.maxCompletionTokens + (grantResumeAllowance ? RESUME_COMPLETION_TOKEN_BONUS : 0)
  return { brainCallLimit, completionTokenLimit }
}

/**
 * Per-call token cap. Even an "unlimited" policy gets a sane ceiling so the Brain
 * request body stays within service limits and the model has a bounded budget.
 */
export function maxTokensForCall(policy: AgentExecutionPolicy, remainingCompletionTokens: number): number {
  return Math.min(
    policy.maxCompletionTokensPerCall === Number.MAX_SAFE_INTEGER
      ? DEFAULT_COMPLETION_TOKENS_PER_CALL
      : policy.maxCompletionTokensPerCall,
    remainingCompletionTokens === Number.MAX_SAFE_INTEGER
      ? MAX_COMPLETION_TOKENS_PER_CALL
      : remainingCompletionTokens,
  )
}
