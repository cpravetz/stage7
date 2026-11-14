import { RESUME_BUDGET_MARKER } from './constants'
import { isResumableDelegationCheckpoint, lastAssistantAction, parseAgentExecutionCheckpoint } from './checkpoint'
import { ExecutionState } from './ExecutionState'
import { fingerprintAction } from './fingerprint'
import { computeRunLimits, resolvePolicy } from './policy'
import { parseActionReceipts, receiptFromResult } from './receipts'
import { parseTaskSpec, type TaskSpec } from './requirements'
import { replayFinishedCheckpoint } from './finalAnswer'
import type { AgentDefinition, AgentTask } from '../../types'
import type { ExecutorDeps, RunContext } from './RunContext'
import { resolveToolPolicy } from './toolCatalog'
import type { AgentAction, AgentExecutionCheckpoint, AgentExecutionContext, AgentExecutionResult, ChatMessage } from './types'
import { boundedActionResult } from './util'

function initialHistory(missionId: string, spec: TaskSpec): ChatMessage[] {
  return [
    {
      role: 'user' as const,
      content: [
        `Mission ID: ${missionId}\nTask: ${spec.prompt}\nContext: ${JSON.stringify(spec.publicTaskContext)}`,
        spec.agentLearnings.length > 0
          ? `Notes saved from earlier related work (use only when relevant; verify against this task and do not treat them as rules): ${JSON.stringify(spec.agentLearnings)}`
          : '',
      ].filter(Boolean).join('\n'),
    },
  ]
}

/**
 * A checkpoint can only be resumed mid-action if that action was a delegation:
 * its result lives in the child, so it can be fetched again without repeating
 * a side effect. Any other interrupted action is unsafe to repeat.
 */
function findInterruptedDelegation(
  checkpoint: AgentExecutionCheckpoint | undefined,
  context: AgentExecutionContext,
): AgentAction | undefined {
  if (!checkpoint?.pendingAction) return undefined
  const action = lastAssistantAction(checkpoint)
  if (!action || !isResumableDelegationCheckpoint(checkpoint) || !context.delegate) {
    throw new Error(
      `The action '${checkpoint.pendingAction}' was interrupted before its result was saved, so it cannot be repeated safely.`,

    )
  }
  return action
}

/** Validates the inputs and assembles everything one `execute()` call needs. */
export function createRun(
  deps: ExecutorDeps,
  definition: AgentDefinition,
  task: AgentTask,
  context: AgentExecutionContext,
): RunContext {
  const toolPolicy = resolveToolPolicy(definition)
  const spec = parseTaskSpec(task.input)
  const checkpoint = parseAgentExecutionCheckpoint(context.resumeCheckpoint)
  const history = checkpoint?.history || initialHistory(context.missionId, spec)
  const retryGuidance = context.retryGuidance?.trim()
  const retryGuidanceMessage = retryGuidance
    ? `Retry guidance for this resumed task:\n${retryGuidance}`
    : undefined
  const policy = resolvePolicy(context.executionPolicy)
  const grantResumeAllowance = !!checkpoint
    && !history.some((message) => message.role === 'user' && message.content.includes(RESUME_BUDGET_MARKER))
  const interruptedDelegation = findInterruptedDelegation(checkpoint, context)
  const priorActionReceipts = parseActionReceipts(spec.taskContext.priorActionReceipts)
  const state = new ExecutionState({
    history,
    checkpoint,
    priorActionReceipts,
    persist: context.saveCheckpoint ? (saved) => context.saveCheckpoint!(saved) : undefined,
  })
  return {
    deps,
    definition,
    task,
    context,
    toolPolicy,
    policy,
    limits: computeRunLimits(policy, deps.maxIterations, grantResumeAllowance),
    spec,
    state,
    resume: { checkpoint, grantResumeAllowance, interruptedDelegation, retryGuidanceMessage },
  }
}

/**
 * Brings a run that was resumed from a checkpoint back to the point where the
 * loop can continue. Returns a result when the checkpoint was already finished.
 */
export async function resumeFromCheckpoint(rc: RunContext): Promise<AgentExecutionResult | undefined> {
  const { state, resume } = rc

  const finished = await replayFinishedCheckpoint(rc)
  if (finished) return finished

  await state.save()
  if (resume.interruptedDelegation) await replayInterruptedDelegation(rc, resume.interruptedDelegation)
  if (resume.grantResumeAllowance) state.tell(RESUME_BUDGET_MARKER)
  if (
    resume.checkpoint
    && resume.retryGuidanceMessage
    && !state.history.some((message) => message.role === 'user' && message.content.includes(resume.retryGuidanceMessage!))
  ) {
    state.tell(resume.retryGuidanceMessage)
  }
  return undefined
}

/** Re-runs the delegation that was in flight when the previous run stopped, and records its result. */
async function replayInterruptedDelegation(rc: RunContext, action: AgentAction): Promise<void> {
  const { state, deps, definition, context, toolPolicy } = rc
  const result = await deps.actions.execute(action, [], definition, context, toolPolicy)
  state.actionReceipts.push(receiptFromResult(action.tool, result, fingerprintAction(action).actionKey))
  state.tell(result.isError
    ? `Action failed: ${result.content}\nChoose a safe correction, another available tool, delegation, or explain the blocker.`
    : `Action result: ${boundedActionResult(result.content)}\nContinue toward the task goal. If complete, return the final answer as plain text.`)
  await state.save()
}
