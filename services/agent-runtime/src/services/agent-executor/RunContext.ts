import type { AgentDefinition, AgentExecutionPolicy, AgentTask, AgentToolPolicy } from '../../types'
import type { ActionExecutor } from './ActionExecutor'
import type { BrainClient } from './BrainClient'
import type { ExecutionState } from './ExecutionState'
import type { ToolCatalogClient } from './toolCatalog'
import type { RunLimits } from './policy'
import type { TaskSpec } from './requirements'
import type { ActionFingerprint } from './fingerprint'
import type { ReplyShape } from './actionParser'
import type {
  AgentAction,
  AgentExecutionCheckpoint,
  AgentExecutionContext,
  AgentExecutionResult,
  BrainReply,
  ToolDescriptor,
} from './types'

/** Long-lived collaborators and limits shared by every run of one `AgentExecutor`. */
export interface ExecutorDeps {
  brain: BrainClient
  catalog: ToolCatalogClient
  actions: ActionExecutor
  maxIterations: number
  maxDelegationDepth: number
}

/** Everything one `execute()` call needs, assembled once up front. */
export interface RunContext {
  deps: ExecutorDeps
  definition: AgentDefinition
  task: AgentTask
  context: AgentExecutionContext
  toolPolicy: AgentToolPolicy
  policy: AgentExecutionPolicy
  limits: RunLimits
  spec: TaskSpec
  state: ExecutionState
  resume: {
    checkpoint?: AgentExecutionCheckpoint
    /** A resumed task gets one extra Brain call, once. */
    grantResumeAllowance: boolean
    /** A delegation that was in flight when the previous run stopped. */
    interruptedDelegation?: AgentAction
    retryGuidanceMessage?: string
  }
}

/**
 * How a step ends the current turn. A step that returns `undefined` lets the turn
 * carry on to its next step.
 */
export type TurnEnd =
  /** Abandon this turn and start the next loop iteration. */
  | { kind: 'next-turn' }
  /** Leave the loop; `state.finalOutput` already holds the blocker to report. */
  | { kind: 'stop-loop' }
  /** Finish the whole run with this result. */
  | { kind: 'return'; result: AgentExecutionResult }

export const NEXT_TURN: TurnEnd = { kind: 'next-turn' }
export const STOP_LOOP: TurnEnd = { kind: 'stop-loop' }
export const returnWith = (result: AgentExecutionResult): TurnEnd => ({ kind: 'return', result })

/** One turn that produced an executable action, as it flows through the guards and into execution. */
export interface ActionTurn {
  reply: BrainReply
  /** The tools visible this turn. */
  tools: ToolDescriptor[]
  action: AgentAction
  /** How the action was recovered from the reply. */
  shape: ReplyShape
  fingerprint: ActionFingerprint
}
