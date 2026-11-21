import {
  DEFAULT_AGENT_EXECUTION_POLICY,
  AgentExecutionPolicy,
  MissionArtifact,
  sanitizeAgentMessage,
  Plan,
  Phase,
  Task,
} from '@stage7-nextgen/shared';
import { logger } from '@stage7-nextgen/shared';
import {
  applyPhaseReview,
  MissionAgentRuntime,
  MISSION_TASK_EXECUTION_POLICY,
  TaskExecutionResult,
  resolveAgentIdentity,
} from '../agent/MissionAgentRuntime';
import { applyRuntimeTaskRequirements } from '../agent/TaskRequirements';
import { dependencyArtifactGaps, missingDependencyInputs, missingExpectedArtifacts } from '../agent/TaskResultParser';
import {
  CompletedTaskSummary,
  classifyMissionCompletionGaps,
  createCompletedTaskSummary,
  MissionActivityCheckpoint,
  MissionPendingInteraction,
  MissionTaskCheckpoint,
  gapIsDataOrStateIssue,
  recoveryTaskDependencies,
  missionExecutionEvidenceGaps,
  phaseRequirementEvidenceGaps,
  recoveryProgressSignature,
  recoveryEvidenceState,
  hasEvidenceRecoveryProgress,
  isRecoveryTask,
  MAX_DEPENDENCY_INPUT_RERUNS,
  MAX_PHASE_RECOVERY_ROUNDS_SAFETY,
  MAX_MISSION_RECOVERY_ROUNDS_SAFETY,
  MAX_NO_PROGRESS_RECOVERY_ATTEMPTS,
  MAX_COMPLETION_VERIFICATION_RETRIES,
} from '../types/workflow';
import { PlannerProgress } from './MissionPlanner';
import type { MissionPhaseOutput } from '../activities/missionWorkflowActivities';
import type { WorkflowInput } from '../types/workflow';
import { MissionCompletedListener } from '../listeners/MissionCompletedListener';
import { MissionStageCompletedListener } from '../listeners/MissionStageCompletedListener';

/** Structured failure codes propagated from the agent runtime. */
const FAILURE_CODES = {
  REQUEST_TOO_LARGE: 'REQUEST_TOO_LARGE',
  MODEL_EXHAUSTED: 'MODEL_EXHAUSTED',
  TOOL_MISSING: 'TOOL_MISSING',
  CREDENTIAL_REQUIRED: 'CREDENTIAL_REQUIRED',
  OUTCOME_UNKNOWN: 'OUTCOME_UNKNOWN',
  TRANSIENT_SERVICE_ERROR: 'TRANSIENT_SERVICE_ERROR',
  UNKNOWN_FAILURE: 'UNKNOWN_FAILURE',
} as const;

/**
 * Extracts a structured failure code from an error, if present.
 * The agent runtime tags errors with `failureCode` and `failureAdaptation`.
 */
function extractFailureCode(error: unknown): string | undefined {
  if (error instanceof Error) {
    const code = (error as any).failureCode
    if (typeof code === 'string') return code
  }
  const message = error instanceof Error ? error.message : String(error)
  const match = message.match(/\[Failure code: (\w+);/i) || message.match(/\[([A-Z_]+)\]/)
  return match?.[1]
}

function isFatalServiceError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message || String(error);
  const lower = message.toLowerCase();
  const code = extractFailureCode(error)
  if (code === FAILURE_CODES.MODEL_EXHAUSTED) return true
  if (code === FAILURE_CODES.OUTCOME_UNKNOWN) return true
  if (lower.includes('brain') && (
    lower.includes('exhausted every eligible model')
    || lower.includes('all models unavailable')
    || lower.includes('no eligible model')
  )) {
    return true;
  }
  if (lower.includes('brain') && (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('fetch failed') || lower.includes('connection') || lower.includes('unavailable') || lower.includes('timeout') || lower.includes('503') || lower.includes('504'))) {
    return true;
  }
  if ((lower.includes('artifacts') || lower.includes('persist')) && (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('fetch failed') || lower.includes('connection') || lower.includes('unavailable') || lower.includes('timeout') || lower.includes('503') || lower.includes('504'))) {
    return true;
  }
  return false;
}


/**
 * Identical planner updates that arrive within this window are reported once.
 * A burst of identical provider failures is one piece of news, not many.
 */
const PLANNER_PROGRESS_MIN_INTERVAL_MS = 60_000;

/**
 * Derive the broadcast agent identity for a task's planned role, consistent
 * with resolveAgentIdentity / getAgentIdForRole in MissionAgentRuntime and
 * with executeMissionTaskActivity attribution.
 */
function agentIdentityForRole(agentRuntime: MissionAgentRuntime, role: string): { agentId: string; agentName: string; agentRole: string } {
  const identity = resolveAgentIdentity(role);
  return {
    agentId: agentRuntime.getAgentIdForRole(role),
    agentName: identity.agentName,
    agentRole: identity.agentRole,
  };
}

// Replaced fixed cutoffs with progress-aware limits + hard safety ceilings (Task 3).
const MAX_PHASE_RECOVERY_ROUNDS = MAX_PHASE_RECOVERY_ROUNDS_SAFETY;

/**
 * A missing input means the source task did not actually succeed. Before a
 * separate recovery task is created, the source task is retried with a
 * different prompt this many times.
 */
const MAX_SOURCE_TASK_RERUNS = 2;

class MissionUserInterruptionError extends Error {
  constructor(readonly result: { plan: Plan; outputs: any; compensations: Array<{ phaseId: string; action: string }> }) {
    super('Mission is waiting for a user response');
    this.name = 'MissionUserInterruptionError';
  }
}

export interface MissionContext {
  missionId: string;
  prompt: string;
  tenantId?: string;
  assistantId?: string;
  metadata?: Record<string, unknown>;
  retryGuidance?: string;
  agentRuntimeUrl?: string;
  persistenceUrl: string;
  gatewayUrl: string;
  broadcast: (event: { type: string; missionId: string; timestamp: number; data?: any }) => Promise<void>;
  broadcastAll: (event: { type: string; timestamp: number; data?: any }) => Promise<void>;
  waitForApproval: (phaseId: string, question: string) => Promise<{ approved: boolean; reason?: string }>;
  resumePlan?: Plan;
  resumeCheckpoint?: MissionActivityCheckpoint;
  clarificationAnswers?: string[];
  interactionResponse?: string;
  userMessages?: string[];
  executionPolicy?: AgentExecutionPolicy;
  onCheckpoint?: (checkpoint: MissionActivityCheckpoint) => void;
  heartbeat?: () => void;
  controlCheckpoint?: () => Promise<void>;
}

function missionPromptWithMessages(ctx: Pick<MissionContext, 'prompt' | 'userMessages'>): string {
  const messages = ctx.userMessages || [];
  return messages.length
    ? `${ctx.prompt}\n\nSubsequent user messages (in order):\n${JSON.stringify(messages)}`
    : ctx.prompt;
}

export class MissionOrchestrator {
  private agentRuntime: MissionAgentRuntime | null = null;
  private static active = new Map<string, { orchestrator: MissionOrchestrator; ctx: MissionContext }>();
  static register(missionId: string, orchestrator: MissionOrchestrator, ctx: MissionContext) { this.active.set(missionId, { orchestrator, ctx }); }
  static unregister(missionId: string) { this.active.delete(missionId); }
  static getActive(missionId: string) { return this.active.get(missionId); }
  private lastPlannerProgress: { key: string; at: number } | null = null;
  /** The current plan, accessible to handleUserMessage while the mission runs. */
  private currentPlan: Plan | null = null;
  /** Completed task summaries, accessible to handleUserMessage while the mission runs. */
  private completedTaskSummaries: CompletedTaskSummary[] = [];

  async run(ctx: MissionContext): Promise<{ plan: Plan; outputs: any; compensations: Array<{ phaseId: string; action: string }> }> {
    const compensations: Array<{ phaseId: string; action: string }> = [];
    let activePlan: Plan | undefined;
    let pendingInteraction = ctx.resumeCheckpoint?.pendingInteraction;
    const workflowInput: WorkflowInput = {
      missionId: ctx.missionId,
      tenantId: ctx.tenantId || 'tenant-1',
      assistantId: ctx.assistantId || 'general',
      prompt: ctx.prompt,
      metadata: {
        ...ctx.metadata,
        assistantId: ctx.assistantId || 'general',
        entityId: typeof ctx.metadata?.entityId === 'string' && ctx.metadata.entityId.trim()
          ? ctx.metadata.entityId.trim()
          : ctx.missionId,
      },
    };
    MissionOrchestrator.register(ctx.missionId, this, ctx);
    try {
    const plannerAgentId = `agent-${ctx.missionId}-planner`;
    await ctx.controlCheckpoint?.();

    const agentRuntime = new MissionAgentRuntime({
      missionId: ctx.missionId,
      tenantId: ctx.tenantId || 'tenant-1',
      metadata: ctx.metadata,
      agentRuntimeUrl: ctx.agentRuntimeUrl,
      broadcast: ctx.broadcastAll,
    });
    this.agentRuntime = agentRuntime;

    await ctx.broadcast({
      type: 'planner_started',
      missionId: ctx.missionId,
      timestamp: Date.now(),
      data: {
        prompt: ctx.prompt,
        agentId: plannerAgentId,
        agentName: 'Mission Planner',
        agentRole: 'planner',
        status: 'planning',
      },
    });

    // The Mission Planner owns the plan-or-load decision. Never silently reuse
    // a persisted/resume/checkpoint plan; evaluate it and emit the reasoning.
    let planSource: 'loaded' | 'generated' = 'generated';
    let plan: Plan;
    const hasInteractionResponse = Boolean(ctx.interactionResponse && ctx.interactionResponse.trim().length > 0);

    if (pendingInteraction && ctx.resumeCheckpoint?.plan && !hasInteractionResponse) {
      // No interaction response - the pending task and its receipts must survive until its response is consumed.
      plan = ctx.resumeCheckpoint.plan;
      planSource = 'loaded';
    } else if (pendingInteraction && ctx.resumeCheckpoint?.plan && hasInteractionResponse) {
      // User provided a direct answer to the pending question - continue with existing plan
      plan = ctx.resumeCheckpoint.plan;
      planSource = 'loaded';
    } else {
      // User provided feedback (userMessages without interactionResponse) or there's no pending interaction
      // let the planner decide whether to load the existing plan or generate a new one.
      const evaluation = await this.agentRuntime!.evaluatePlanLoad({
        missionId: ctx.missionId,
        prompt: missionPromptWithMessages(ctx),
        context: ctx.metadata,
        existingPlan: ctx.resumePlan || ctx.resumeCheckpoint?.plan,
        isResume: !!(ctx.resumePlan || ctx.resumeCheckpoint?.plan),
      });
      if (evaluation.loadExisting && evaluation.plan) {
        plan = evaluation.plan;
        planSource = 'loaded';
      } else {
        plan = await this.generatePlan(ctx);
      }
    }
    activePlan = plan;
    this.currentPlan = plan;
    const completedTasks = new Map<string, MissionTaskCheckpoint>(
      (ctx.resumeCheckpoint?.completedTasks || []).map((checkpoint) => [
        JSON.stringify([checkpoint.phaseId, checkpoint.taskId]),
        checkpoint,
      ]),
    );
    const completedTaskSummaries = new Map<string, CompletedTaskSummary>();
    for (const completedPhase of plan.phases) {
      for (const completedTask of completedPhase.tasks) {
        if (
          completedTask.status === 'completed'
          && (completedTask.output || completedTask.artifacts.length > 0)
        ) {
          completedTaskSummaries.set(
            completedTask.id,
            createCompletedTaskSummary(
              completedTask.id,
              completedTask.output || '',
              completedTask.artifacts,
              completedTask.requiredActions,
              completedTask.requiresExternalAction,
            ),
          );
        }
      }
    }
    this.completedTaskSummaries = [...completedTaskSummaries.values()];
    const completedPhases = new Set(ctx.resumeCheckpoint?.completedPhases || []);
    // The Mission Director owns the decision to normalize an adopted plan for
    // execution. This is visible reasoning, not silent surgery.
    await agentRuntime.emitMonologue({
      agentRole: 'mission-director',
      thought: `The plan for mission "${ctx.missionId}" has been adopted (${plan.phases.length} phase(s), source ${planSource}). Before execution I normalize per-run execution state without changing the adopted plan's intent: I clear plan-level requiresClarification/clarificationQuestions, reset every phase's requiresApproval/approvalQuestion, clear each task's requiredActions and re-apply runtime task requirements, and strip message/delivery-status expected artifacts only when the mission goal does not reference messages or deliveries. These are execution-state resets so stale pending-interaction or approval markers from a prior run do not block execution; the phase/task goals, ordering, and artifacts are preserved.`,
      text: `Normalizing adopted plan for execution (clearing clarification/approval markers and stale required actions).`,
      data: { source: planSource, phaseCount: plan.phases.length, normalization: 'execution_state_reset' },
    });
    plan.requiresClarification = false;
    plan.clarificationQuestions = [];

    const sharedMissionAgentId = await agentRuntime.getOrCreateAgent('mission-executor', `You are a mission execution agent. Complete each assigned task sequentially to achieve the mission goal: ${ctx.prompt}. Do not invent missing information. Try authorized alternatives first; if a specific required value is unavailable and no safe alternative can complete the outcome, ask one focused question for that value.`);

    if (plan.phases.length === 0) {
      plan.summary = plan.summary.trim() || ctx.prompt;
      plan.phases = [{
        id: 'phase-1',
        name: 'Complete requested outcome',
        goal: ctx.prompt,
        requiresApproval: false,
        status: 'pending',
        tasks: [{
          id: 'phase-1-task-1',
          title: 'Complete the requested outcome',
          description: ctx.prompt,
agentRole: 'mission-executor',
          systemPrompt: `Achieve the requested outcome: ${ctx.prompt}. Do not invent missing information. Try authorized alternatives first; if a specific required value is unavailable and no safe alternative can complete the outcome, ask one focused question for that value.`,
          dependsOnTaskIds: [],
          expectedArtifacts: [],
          requiredActions: [],
          status: 'pending',
          artifacts: [],
        }],
      }];
    }
    for (const phase of plan.phases) {
      phase.requiresApproval = false;
      phase.approvalQuestion = undefined;
      for (const task of phase.tasks) {
        task.requiredActions = [];
        applyRuntimeTaskRequirements(task, ctx.prompt);
        if (!/\b(?:message|delivery)[-_ ]?(?:message[-_ ]?)?(?:id|status)\b/i.test(ctx.prompt)) {
          task.expectedArtifacts = (task.expectedArtifacts || []).filter((artifact) =>
            !/\b(?:sms|text|email|message|delivery)[-_ ]?(?:message[-_ ]?)?(?:id|status)\b/i.test(
              artifact.replace(/[_-]+/g, ' '),
            ),
          );
        }
      }
    }
    const saveCheckpoint = () => ctx.onCheckpoint?.({
      version: 1,
      plan,
      completedTasks: [...completedTasks.values()],
      completedPhases: [...completedPhases],
      ...(pendingInteraction ? { pendingInteraction } : {}),
    });
    saveCheckpoint();
    activePlan = plan;
    this.currentPlan = plan;
    await ctx.broadcast({
      type: 'plan_generated',
      missionId: ctx.missionId,
      timestamp: Date.now(),
      data: {
        plan,
        agentId: plannerAgentId,
        agentName: 'Mission Planner',
        agentRole: 'planner',
        status: 'completed',
        source: planSource,
      },
    });

    try {
      await this.persistPlan(ctx, plan);
    } catch (err) {
      if (isFatalServiceError(err)) throw err;
      logger.error({ missionId: ctx.missionId, err: err instanceof Error ? err.message : String(err) }, 'Failed to persist plan');
      // Non-fatal - continue
    }

    const outputs: any = { phases: [] };
    let uncertainActionIssue = '';
    for (let phaseIndex = 0; phaseIndex < plan.phases.length; phaseIndex++) {
      let phase = plan.phases[phaseIndex]!;
      let phaseIsComplete = completedPhases.has(phase.id);
      if (phaseIsComplete && phase.tasks.some((task) =>
        !completedTasks.has(JSON.stringify([phase.id, task.id])),
      )) {
        logger.warn(
          { missionId: ctx.missionId, phaseId: phase.id },
          'Checkpoint marked a phase complete without all task results; resuming the missing work',
        );
        phaseIsComplete = false;
        completedPhases.delete(phase.id);
      }
      if (!phaseIsComplete) {
        await ctx.broadcast({ type: 'phase_started', missionId: ctx.missionId, timestamp: Date.now(), data: { phaseId: phase.id, phaseName: phase.name } });
        await this.updatePhase(ctx, phase.id, { status: 'in_progress' });
        phase.status = 'in_progress';
      }

      const phaseOutput: any = {
        phaseId: phase.id,
        name: phase.name,
        status: 'completed',
        tasks: phaseIsComplete
          ? phase.tasks.map((task) => ({
            taskId: task.id,
            status: task.status,
            artifacts: task.artifacts || [],
            output: task.output || '',
          }))
          : [],
      };
      const completedInPhase = new Set<string>();
      // Guidance injected when a completed dependency is reopened for a bounded rerun
      // because it did not produce a declared artifact (a missing input).
      const taskRerunGuidance = new Map<string, string>();
const executeTask = async (task: Task, savedTask: MissionTaskCheckpoint | undefined) => {
        ctx.heartbeat?.();
        const taskKey = JSON.stringify([phase.id, task.id]);
        if (!savedTask) {
          const startedAt = Date.now();
          await ctx.broadcast({
            type: 'task_started',
            missionId: ctx.missionId,
            timestamp: Date.now(),
            data: {
              phaseId: phase.id,
              taskId: task.id,
              taskTitle: task.title,
              ...agentIdentityForRole(agentRuntime, task.agentRole),
            },
          });
          await this.updateTask(ctx, phase.id, task.id, { status: 'in_progress', startedAt });
          task.status = 'in_progress';
          task.startedAt = startedAt;
        }

        let result: TaskExecutionResult;
        const previousInteraction = ctx.resumeCheckpoint?.pendingInteraction;
        const continuationInteraction = previousInteraction
          ? {
              ...previousInteraction,
              actionReceipts: previousInteraction.actionReceipts?.filter((receipt) =>
                !(receipt.toolId === '__create_tool' && receipt.outcome === 'permission_required')
                && !(previousInteraction.credentialRequest
                  && receipt.toolId === previousInteraction.credentialRequest.toolId
                  && receipt.outcome === 'question_asked'),
              ),
            }
          : undefined;
        const continuation = previousInteraction
          && continuationInteraction
          && previousInteraction.phaseId === phase.id
          && previousInteraction.taskId === task.id
          && ctx.interactionResponse
          ? { response: ctx.interactionResponse, pendingInteraction: continuationInteraction }
          : undefined;
        try {
          const agentId = sharedMissionAgentId;
          const executionArgs: [
            string,
            Task,
            Phase,
            Plan,
            boolean,
            AgentExecutionPolicy,
            CompletedTaskSummary[],
          ] = [
            agentId,
            task,
            phase,
            plan,
            !!savedTask,
            ctx.executionPolicy || MISSION_TASK_EXECUTION_POLICY,
            [...completedTaskSummaries.values()],
          ];
          const taskRetryGuidance = taskRerunGuidance.get(task.id)
            ?? (savedTask ? ctx.retryGuidance : undefined);
          try {
            result = taskRetryGuidance
              ? await agentRuntime.executeTask(...executionArgs, taskRetryGuidance, continuation, ctx.prompt, ctx.userMessages)
              : continuation
                ? await agentRuntime.executeTask(...executionArgs, undefined, continuation, ctx.prompt, ctx.userMessages)
                : await agentRuntime.executeTask(...executionArgs, undefined, undefined, ctx.prompt, ctx.userMessages);
          } catch (err) {
            if (savedTask) throw err;
            const firstError = err instanceof Error ? err.message : String(err);
            if (/saved progress for this task became too large to store/i.test(firstError)) throw err;
            logger.warn(
              { missionId: ctx.missionId, phaseId: phase.id, taskId: task.id, error: firstError },
              'Retrying failed mission task from its persisted safe checkpoint',
            );
            const retryGuidance = [
              `The previous attempt failed: ${firstError}`,
              'Continue from the work saved so far.',

              'Do not repeat external actions whose outcome is already recorded or uncertain.',
            ].join(' ');
            result = continuation
              ? await agentRuntime.executeTask(...executionArgs, retryGuidance, continuation, ctx.prompt, ctx.userMessages)
              : await agentRuntime.executeTask(...executionArgs, retryGuidance, undefined, ctx.prompt, ctx.userMessages);
          }

          // Agent owns the task outcome: if the agent could not accomplish the
          // task within its execution budget, give it one bounded recovery turn
          // framed as its responsibility to retry differently, ask for help, or
          // delegate — instead of the overseer marking the task failed and moving on.
          if (result.incompleteReason && !savedTask
            && !/\buncertain\b|outcome.?unknown/i.test(result.incompleteReason)) {
            const agentRecoveryGuidance = [
              `You did not accomplish this task: ${result.incompleteReason}`,
              'Retry the task with a different approach, ask for help, or delegate to another agent.',
              'Do not repeat actions whose outcome is already recorded or uncertain.',
            ].join(' ');
            try {
              result = await agentRuntime.executeTask(...executionArgs, agentRecoveryGuidance, undefined, ctx.prompt, ctx.userMessages);
            } catch (recoveryErr) {
              if (recoveryErr instanceof MissionUserInterruptionError) throw recoveryErr;
              if (isFatalServiceError(recoveryErr)) throw recoveryErr;
              // The recovery turn did not produce a completion; record the outcome below.
            }
          }

        } catch (err) {
          if (err instanceof MissionUserInterruptionError) throw err;
          if (isFatalServiceError(err)) throw err;
          if (!savedTask) {
            const error = err instanceof Error ? err.message : String(err);
            const completedAt = Date.now();
            try {
              await this.updateTask(ctx, phase.id, task.id, { status: 'failed', completedAt, output: error });
            } catch (e) {
              if (isFatalServiceError(e)) throw e;
            }
            task.status = 'failed';
            task.completedAt = completedAt;
            task.output = error;
            await ctx.broadcast({
              type: 'task_failed',
              missionId: ctx.missionId,
              timestamp: Date.now(),
              data: {
                phaseId: phase.id,
                taskId: task.id,
                taskTitle: task.title,
                ...agentIdentityForRole(agentRuntime, task.agentRole),
                error,
              },
            });
          }
          // For non-saved tasks or general failures, don't abort mission - mark failed and continue
          if (!savedTask) {
            const taskKey = JSON.stringify([phase.id, task.id]);
            const error = err instanceof Error ? err.message : String(err);
            if (!completedTasks.has(taskKey)) {
              completedTasks.set(taskKey, { phaseId: phase.id, taskId: task.id });
              saveCheckpoint();
            }
            phaseOutput.tasks.push({ taskId: task.id, status: 'failed' as any, artifacts: task.artifacts || [] });
            compensations.push({ phaseId: phase.id, action: `revert-phase-${phase.id}` });
            completedInPhase.add(task.id);
            completedTaskSummaries.set(
              task.id,
              createCompletedTaskSummary(task.id, task.output || error, task.artifacts || [], task.requiredActions, task.requiresExternalAction),
            );
            this.completedTaskSummaries = [...completedTaskSummaries.values()];
            return;
          }
          throw err;
        }

        if (result.interruption) {
          const interruption = result.interruption;
          pendingInteraction = {
            kind: interruption.kind,
            phaseId: phase.id,
            taskId: task.id,
            taskTitle: task.title,
            agentRole: task.agentRole,
            ...(interruption.question ? { question: interruption.question } : {}),
            ...(interruption.credentialRequest ? { credentialRequest: interruption.credentialRequest } : {}),
            ...(interruption.requestId ? { requestId: interruption.requestId } : {}),
            ...(interruption.permission ? { permission: interruption.permission } : {}),
            actionReceipts: result.actionReceipts || [],
            resumeCount: continuation?.pendingInteraction.resumeCount
              ? continuation.pendingInteraction.resumeCount + 1
              : 0,
          };
          task.status = 'pending';
          task.output = interruption.question || interruption.permission?.explanation || 'Mission is waiting for your response.';
          await this.updateTask(ctx, phase.id, task.id, {
            status: 'pending',
            output: task.output,
          });
          saveCheckpoint();
          // Persist mission state with pendingInteraction BEFORE broadcasting the question,
          // so the frontend can immediately fetch the interaction details.
          const missionStartedAt = task.startedAt || Date.now();
          await this.persistMissionStateOnInterruption(ctx, plan, outputs, pendingInteraction, missionStartedAt);
          await ctx.broadcast({
            type: interruption.kind === 'user_input' ? 'question_asked' : 'permission_required',
            missionId: ctx.missionId,
            timestamp: Date.now(),
            data: {
              phaseId: phase.id,
              taskId: task.id,
              taskTitle: task.title,
              agentRole: task.agentRole,
              ...(interruption.question ? { question: interruption.question } : {}),
              ...(interruption.requestId ? { requestId: interruption.requestId } : {}),
              ...(interruption.credentialRequest ? { credentialRequest: interruption.credentialRequest } : {}),
              ...(interruption.permission ? { permission: interruption.permission } : {}),
            },
          });
          const interruptedPhaseOutput: MissionPhaseOutput = {
            ...phaseOutput,
            status: 'incomplete',
            tasks: [
              ...phaseOutput.tasks,
              {
                taskId: task.id,
                status: 'pending',
                artifacts: result.artifacts,
                output: task.output,
              },
            ],
          };
          outputs.phases.push(interruptedPhaseOutput);
          await this.updatePhase(ctx, phase.id, { status: 'in_progress' });
          throw new MissionUserInterruptionError({
            plan,
            outputs: {
              ...outputs,
              status: interruption.kind === 'user_input' ? 'awaiting_user_input' : 'awaiting_permission',
              pendingInteraction,
            },
            compensations,
          });
        }

        if (continuation) {
          await ctx.broadcast({
            type: 'user_input_resolved',
            missionId: ctx.missionId,
            timestamp: Date.now(),
            data: {
              phaseId: phase.id,
              taskId: task.id,
              response: continuation.response.length > 2000
                ? `${continuation.response.slice(0, 1997)}...`
                : continuation.response,
            },
          });
          pendingInteraction = undefined;
        }
        if (!savedTask) {
          completedTasks.set(taskKey, { phaseId: phase.id, taskId: task.id });
        }

        const completedAt = Date.now();
        const taskStatus = result.incompleteReason ? 'incomplete' : 'completed';
        const recordedOutput = result.incompleteReason && /\buncertain\b|outcome.?unknown/i.test(result.incompleteReason)
          ? result.incompleteReason : result.output;
        await this.updateTask(ctx, phase.id, task.id, {
          status: taskStatus,
          completedAt,
          output: recordedOutput,
          artifacts: result.artifacts,
        });
        task.status = taskStatus;
        task.completedAt = completedAt;
        task.output = recordedOutput;
        task.artifacts = result.artifacts;
        if (!savedTask) saveCheckpoint();
        if (!savedTask) {
          await ctx.broadcast({
            type: taskStatus === 'completed' ? 'task_completed' : 'task_incomplete',
            missionId: ctx.missionId,
            timestamp: Date.now(),
            data: {
              phaseId: phase.id,
              taskId: task.id,
              taskTitle: task.title,
              ...agentIdentityForRole(agentRuntime, task.agentRole),
              artifacts: result.artifacts,
              output: sanitizeAgentMessage(result.output, '').text.slice(0, 4_000),
              ...(result.incompleteReason
                ? { error: sanitizeAgentMessage(result.incompleteReason, 'The Agent did not produce a readable result.').text }
                : {}),
              tokensUsed: result.tokensUsed,
            },
          });
        }
        phaseOutput.tasks.push({ taskId: task.id, status: taskStatus, artifacts: result.artifacts, output: task.output });
        compensations.push({ phaseId: phase.id, action: `revert-phase-${phase.id}` });
        completedInPhase.add(task.id);
        completedTaskSummaries.set(
          task.id,
          createCompletedTaskSummary(task.id, result.output, result.artifacts, task.requiredActions, task.requiresExternalAction),
        );
        this.completedTaskSummaries = [...completedTaskSummaries.values()];
        ctx.heartbeat?.();
      };

      for (const task of phase.tasks) {
        const savedTask = completedTasks.get(JSON.stringify([phase.id, task.id]));
        if (savedTask) await executeTask(task, savedTask);
      }

      const executePendingTasks = async () => {
      // Per-phase count of bounded reruns granted to a dependency whose completion
      // did not produce its declared artifact (a missing input). Prevents a
      // dependency that keeps failing to emit its artifact from looping forever.
      const dependencyRerunCounts = new Map<string, number>();
      const buildTaskById = (): Map<string, Task> =>
        new Map(plan.phases.flatMap((entry) => entry.tasks.map((candidate) => [candidate.id, candidate] as [string, Task])));
      // A pending task is blocked by a dependency that finished without
      // producing its declared artifact (a missing input), and that dependency
      // lives in this phase and still has rerun budget left → reopen it so it
      // can produce the artifact. A dependency that ended incomplete or failed
      // is also reopened: a missing input means the source task did not succeed.
      const findMissingInputRerun = (taskById: Map<string, Task>): Task | undefined => {
        const finished = new Set(['completed', 'incomplete', 'failed']);
        for (const candidate of phase.tasks) {
          if (completedInPhase.has(candidate.id) || isRecoveryTask(candidate.id)) continue;
          for (const dependencyId of candidate.dependsOnTaskIds || []) {
            const dependency = taskById.get(dependencyId);
            if (!dependency || !finished.has(String(dependency.status))) continue;
            if (!phase.tasks.includes(dependency)) continue;
            if ((dependencyRerunCounts.get(dependency.id) || 0) >= MAX_DEPENDENCY_INPUT_RERUNS) continue;
            if (dependency.status !== 'completed' || dependencyArtifactGaps(dependency).length > 0) return dependency;
          }
        }
        return undefined;
      };
      while (completedInPhase.size < phase.tasks.length) {
        await ctx.controlCheckpoint?.();
        const taskById = buildTaskById();
        const terminalTaskIds = [...completedTasks.values()].map((task) => task.taskId);
        const completedTaskIds = terminalTaskIds.filter((id) =>
          plan.phases.some((entry) => entry.tasks.some((candidate) => candidate.id === id && candidate.status === 'completed')),
        );
        const pendingTasks = phase.tasks.filter((task) => !completedInPhase.has(task.id));
        const rerunDependency = findMissingInputRerun(taskById);
        const readyTasks = phase.tasks.filter((task) =>
          !completedInPhase.has(task.id)
          && (task.dependsOnTaskIds || []).every((dependencyId) =>
            (task.id.startsWith(`${phase.id}-amendment-`) ? terminalTaskIds : completedTaskIds).includes(dependencyId),
          )
          // A task is not ready while a dependency that completed without producing
          // its declared artifact is a missing input (recovery tasks are exempt:
          // they exist to repair gaps and run after all phase tasks regardless).
          && (isRecoveryTask(task.id) || missingDependencyInputs(task, taskById).length === 0),
        );
        if (readyTasks.length === 0) {
          if (rerunDependency) {
            const missing = dependencyArtifactGaps(rerunDependency);
            const previousReason = sanitizeAgentMessage(rerunDependency.output || '', '').text.trim();
            const attempt = (dependencyRerunCounts.get(rerunDependency.id) || 0) + 1;
            dependencyRerunCounts.set(rerunDependency.id, attempt);
            completedInPhase.delete(rerunDependency.id);
            completedTasks.delete(JSON.stringify([phase.id, rerunDependency.id]));
            completedTaskSummaries.delete(rerunDependency.id);
            phaseOutput.tasks = phaseOutput.tasks.filter((entry: { taskId: string }) => entry.taskId !== rerunDependency.id);
            rerunDependency.status = 'pending';
            rerunDependency.completedAt = undefined;
            taskRerunGuidance.set(
              rerunDependency.id,
              [
                missing.length > 0
                  ? `This task was reopened because a downstream task needs required artifact(s) it did not produce: ${missing.join(', ')}.`
                  : 'This task was reopened because it did not complete successfully and a downstream task needs its result.',
                previousReason ? `The previous attempt reported: ${previousReason.slice(0, 500)}.` : '',
                'Retry with a different approach. Produce the missing result with real content. Do not repeat side-effect actions whose outcome is already recorded; if you cannot produce it, explain the specific blocker.',
              ].filter(Boolean).join(' '),
            );
            logger.warn(
              { missionId: ctx.missionId, phaseId: phase.id, taskId: rerunDependency.id, missing, attempt, max: MAX_DEPENDENCY_INPUT_RERUNS },
              'Reopening a dependency with a missing input for a bounded rerun',
            );
            await agentRuntime.emitMonologue({
              agentRole: 'mission-director',
              phaseId: phase.id,
              taskId: rerunDependency.id,
              thought: `Task "${rerunDependency.title}" finished without providing the input a downstream task needs${missing.length > 0 ? ` (${missing.join(', ')})` : ''}. A missing input means this task did not succeed, so I am retrying it (attempt ${attempt}/${MAX_DEPENDENCY_INPUT_RERUNS}) with a different approach before any downstream task proceeds.`,
              text: `Missing input from "${rerunDependency.title}"; retrying the source task to produce the required result.`,
              data: { rerunTaskId: rerunDependency.id, missing, attempt, reason: 'missing_dependency_input' },
            }).catch((error) => logger.warn({ missionId: ctx.missionId, taskId: rerunDependency.id, error: error instanceof Error ? error.message : String(error) }, 'Failed to broadcast missing-input rerun monologue'));
            saveCheckpoint();
            continue;
          }
          logger.error({ missionId: ctx.missionId, phaseId: phase.id }, 'Mission phase has pending tasks but no dependency-ready task');
          for (const pendingTask of pendingTasks) {
            if (!completedInPhase.has(pendingTask.id)) {
              const taskKey = JSON.stringify([phase.id, pendingTask.id]);
              await this.updateTask(ctx, phase.id, pendingTask.id, { status: 'failed', completedAt: Date.now(), output: 'No dependency-ready task available' });
              pendingTask.status = 'failed';
              pendingTask.completedAt = Date.now();
              pendingTask.output = 'No dependency-ready task available';
              await ctx.broadcast({
                type: 'task_failed',
                missionId: ctx.missionId,
                timestamp: Date.now(),
                data: {
                  phaseId: phase.id,
                  taskId: pendingTask.id,
                  taskTitle: pendingTask.title,
                  ...agentIdentityForRole(agentRuntime, pendingTask.agentRole),
                  error: 'No dependency-ready task available',
                },
              });
              completedTasks.set(taskKey, { phaseId: phase.id, taskId: pendingTask.id });
              saveCheckpoint();
              phaseOutput.tasks.push({ taskId: pendingTask.id, status: 'failed' as any, artifacts: pendingTask.artifacts || [] });
              compensations.push({ phaseId: phase.id, action: `revert-phase-${phase.id}` });
              completedInPhase.add(pendingTask.id);
              completedTaskSummaries.set(
                pendingTask.id,
                createCompletedTaskSummary(pendingTask.id, pendingTask.output, pendingTask.artifacts || [], pendingTask.requiredActions, pendingTask.requiresExternalAction),
              );
            }
          }
          break;
        }
        let task: Task | undefined;
        if (pendingInteraction?.phaseId === phase.id) {
          task = readyTasks.find((candidate) => candidate.id === pendingInteraction?.taskId);
          if (!task) {
            // The interrupted task is not yet dependency-ready. The Mission
            // Director decides to run another ready task first; emit a single
            // consolidated monologue for this scheduling decision.
            if (readyTasks.length === 1) {
              task = readyTasks[0]!;
              await agentRuntime.emitMonologue({
                agentRole: 'mission-director',
                phaseId: phase.id,
                thought: `The interrupted task "${pendingInteraction?.taskId}" is waiting on prerequisites. Only one task is dependency-ready: "${task.id}" (${task.title}). I am selecting it to make progress while the interrupted task becomes ready.`,
                text: `Interrupted task not ready; selecting sole ready task "${task.title}".`,
                data: { interruptedTaskId: pendingInteraction?.taskId, selectedTaskId: task.id, selectedTaskTitle: task.title, reason: 'interrupted_not_ready_sole_task' },
              });
            } else {
              try {
                task = await agentRuntime.selectNextTask(
                  missionPromptWithMessages(ctx),
                  plan,
                  phase,
                  completedTaskIds,
                  [...completedTaskSummaries.values()].slice(-10),
                );
                // selectNextTask emits its own monologue; no additional trace needed here
              } catch (err) {
                if (isFatalServiceError(err)) throw err;
                // Director owns the fallback decision with visible reasoning.
                const fallback = readyTasks.find((candidate) => !completedInPhase.has(candidate.id));
                if (!fallback) throw err;
                await agentRuntime.emitMonologue({
                  agentRole: 'mission-director',
                  phaseId: phase.id,
                  thought: `The interrupted task "${pendingInteraction?.taskId}" is waiting on prerequisites. Task selection failed: ${err instanceof Error ? err.message : String(err)}. I am falling back to the first dependency-ready task "${fallback.id}" (${fallback.title}) to avoid stalling the phase.`,
                  text: `Task selection failed; falling back to "${fallback.title}".`,
                  data: { interruptedTaskId: pendingInteraction?.taskId, selectedTaskId: fallback.id, selectedTaskTitle: fallback.title, reason: 'selector_failure_fallback', error: err instanceof Error ? err.message : String(err) },
                });
                task = fallback;
              }
            }
          }
        } else {
          if (readyTasks.length === 1) {
            task = readyTasks[0]!;
            // Single ready task: emit a concise selection monologue (selectNextTask
            // would also emit one, but we avoid the round-trip for the trivial case).
            await agentRuntime.emitMonologue({
              agentRole: 'mission-director',
              phaseId: phase.id,
              thought: `Only one task is dependency-ready in phase "${phase.name}": "${task.id}" (${task.title}). Selecting it to keep the phase moving.`,
              text: `Selecting sole ready task "${task.title}".`,
              data: { selectedTaskId: task.id, selectedTaskTitle: task.title, reason: 'sole_ready_task' },
            });
          } else {
            try {
              task = await agentRuntime.selectNextTask(
                missionPromptWithMessages(ctx),
                plan,
                phase,
                completedTaskIds,
                [...completedTaskSummaries.values()].slice(-10),
              );
              // selectNextTask emits its own monologue; no additional trace needed here
            } catch (err) {
              if (isFatalServiceError(err)) throw err;
              // Director owns the fallback decision with visible reasoning.
              const fallback = readyTasks.find((candidate) => !completedInPhase.has(candidate.id));
              if (!fallback) throw err;
              await agentRuntime.emitMonologue({
                agentRole: 'mission-director',
                phaseId: phase.id,
                thought: `Task selection failed: ${err instanceof Error ? err.message : String(err)}. I could not get a reasoned selection from the director selector, so I am falling back to the first dependency-ready task "${fallback.id}" (${fallback.title}) to avoid stalling the phase.`,
                text: `Task selection failed; falling back to "${fallback.title}".`,
                data: { selectedTaskId: fallback.id, selectedTaskTitle: fallback.title, reason: 'selector_failure_fallback', error: err instanceof Error ? err.message : String(err) },
              });
              task = fallback;
            }
          }
        }
        if (!task || !readyTasks.some((candidate) => candidate.id === task!.id)) {
          logger.error({ missionId: ctx.missionId, phaseId: phase.id }, 'Mission task selector chose a task that is not ready');
          task = readyTasks.find((t) => !completedInPhase.has(t.id));
          if (!task) {
            // mark all pending as failed
            for (const pendingTask of pendingTasks) {
              if (!completedInPhase.has(pendingTask.id)) {
                const taskKey = JSON.stringify([phase.id, pendingTask.id]);
                await this.updateTask(ctx, phase.id, pendingTask.id, { status: 'failed', completedAt: Date.now(), output: 'Task selector invalid' });
                pendingTask.status = 'failed';
                pendingTask.completedAt = Date.now();
                pendingTask.output = 'Task selector invalid';
                await ctx.broadcast({
                  type: 'task_failed',
                  missionId: ctx.missionId,
                  timestamp: Date.now(),
                  data: {
                    phaseId: phase.id,
                    taskId: pendingTask.id,
                    taskTitle: pendingTask.title,
                    ...agentIdentityForRole(agentRuntime, pendingTask.agentRole),
                    error: 'Task selector invalid',
                  },
                });
                completedTasks.set(taskKey, { phaseId: phase.id, taskId: pendingTask.id });
                saveCheckpoint();
                phaseOutput.tasks.push({ taskId: pendingTask.id, status: 'failed' as any, artifacts: pendingTask.artifacts || [] });
                compensations.push({ phaseId: phase.id, action: `revert-phase-${phase.id}` });
                completedInPhase.add(pendingTask.id);
                completedTaskSummaries.set(
                  pendingTask.id,
                  createCompletedTaskSummary(pendingTask.id, pendingTask.output, pendingTask.artifacts || [], pendingTask.requiredActions, pendingTask.requiresExternalAction),
                );
              }
            }
            break;
          }
        }
        const progressTimer = setInterval(() => {
          ctx.heartbeat?.();
          void agentRuntime.emitMonologue({
            agentRole: task!.agentRole,
            phaseId: phase.id,
            taskId: task!.id,
            thought: `Task "${task!.title}" is still running; waiting for the Agent Runtime. No user response has been requested.`,
            text: `Still working on "${task!.title}"; no user response is needed.`,
            data: { status: 'running', kind: 'waiting_for_agent_runtime' },
          }).catch((error) => logger.warn({ missionId: ctx.missionId, taskId: task!.id, error: error instanceof Error ? error.message : String(error) }, 'Failed to broadcast task status'));
        }, 60_000);
        try {
          await executeTask(task, undefined);
          if (task.status !== 'completed' && /\buncertain\b|outcome.?unknown/i.test(task.output || '')) break;
        } catch (err) {
          if (err instanceof MissionUserInterruptionError) throw err;
          if (isFatalServiceError(err)) throw err;
          logger.error({ missionId: ctx.missionId, phaseId: phase.id, taskId: task.id, err: err instanceof Error ? err.message : String(err) }, 'Task execution failed');
          const taskKey = JSON.stringify([phase.id, task.id]);
          const error = err instanceof Error ? err.message : String(err);
          await this.updateTask(ctx, phase.id, task.id, { status: 'failed', completedAt: Date.now(), output: error });
          task.status = 'failed';
          task.completedAt = Date.now();
          task.output = error;
          await ctx.broadcast({
            type: 'task_failed',
            missionId: ctx.missionId,
            timestamp: Date.now(),
            data: {
              phaseId: phase.id,
              taskId: task.id,
              taskTitle: task.title,
              ...agentIdentityForRole(agentRuntime, task.agentRole),
              error,
            },
          });
          completedTasks.set(taskKey, { phaseId: phase.id, taskId: task.id });
          saveCheckpoint();
          phaseOutput.tasks.push({ taskId: task.id, status: 'failed' as any, artifacts: task.artifacts || [] });
          compensations.push({ phaseId: phase.id, action: `revert-phase-${phase.id}` });
          completedInPhase.add(task.id);
          completedTaskSummaries.set(
            task.id,
            createCompletedTaskSummary(task.id, task.output, task.artifacts || [], task.requiredActions, task.requiresExternalAction),
          );
        } finally {
          clearInterval(progressTimer);
        }
      }
      };

      const findUncertainAction = (): string => phaseOutput.tasks
        .filter((task: { status: string }) => task.status !== 'completed')
        .map((task: { output?: string }) => task.output || '')
        .find((output: string) => /\buncertain\b|outcome.?unknown/i.test(output)) || '';
      await executePendingTasks();
      await ctx.controlCheckpoint?.();
      uncertainActionIssue = findUncertainAction();
      if (uncertainActionIssue) {
        phaseOutput.status = 'incomplete';
        outputs.phases.push(phaseOutput);
        break;
      }
      let phaseReviewSatisfied = phaseIsComplete;
      if (!phaseIsComplete) {
        const existingAmendmentCount = phase.tasks.filter((task) =>
          task.id.startsWith(`${phase.id}-amendment-`),
        ).length;
        let lastReviewSignature: string | undefined;
        let noProgressCount = 0;
        for (
          let reviewIndex = existingAmendmentCount + 1;
          reviewIndex <= existingAmendmentCount + MAX_PHASE_RECOVERY_ROUNDS;
          reviewIndex++
        ) {
          try {
            let review = await agentRuntime.reviewPhase(
              missionPromptWithMessages(ctx),
              plan,
              phase,
              [...completedTaskSummaries.values()],
              reviewIndex,
            );
            if (review.satisfied) {
              const evidenceGaps = phaseRequirementEvidenceGaps(plan, phase.id, phaseOutput);
              if (evidenceGaps.length > 0) {
                logger.warn({ missionId: ctx.missionId, phaseId: phase.id, gaps: evidenceGaps }, 'Phase review contradicted required execution evidence');
                review = { satisfied: false, gaps: evidenceGaps };
              }
            }
            // The Mission Director owns how phase-review results are applied.
            // Emit decision BEFORE applying mutations.
            await agentRuntime.emitMonologue({
              agentRole: 'mission-director',
              phaseId: phase.id,
              thought: `Phase review ${reviewIndex} for "${phase.name}" returned ${review.satisfied ? 'satisfied' : 'not satisfied'}. The Phase Reviewer identified ${review.gaps.length} gap(s): ${review.gaps.slice(0, 5).join('; ')}. I will apply this review to the plan${review.followUpTask ? ` and adopt the proposed follow-up task "${review.followUpTask.title}"` : ''}.`,
              text: `Phase review ${reviewIndex}: ${review.satisfied ? 'satisfied' : `${review.gaps.length} gap(s) found`}.`,
              data: { reviewIndex, satisfied: review.satisfied, gaps: review.gaps, followUpTaskTitle: review.followUpTask?.title },
            });
            const applied = applyPhaseReview(plan, phase.id, review);
            plan = applied.plan;
                  activePlan = plan;
                  this.currentPlan = plan;
            phase = applied.phase;
            if (applied.satisfied) {
              phaseReviewSatisfied = true;
              break;
            }
            const reviewSignature = recoveryProgressSignature({
              gaps: applied.gaps,
              completedTaskIds: phase.tasks.filter((t) => t.status === 'completed').map((t) => t.id),
              completedTaskStatuses: phase.tasks.map((t) => `${t.id}:${t.status}`),
              ...recoveryEvidenceState(phaseOutput.tasks, phase.tasks.filter((t) => !t.id.includes('-amendment-'))
                .flatMap((t) => t.expectedArtifacts || [])),
              outputs: [...completedTaskSummaries.values()].map((s) => s.output),
            });
            const madeProgress = hasEvidenceRecoveryProgress(lastReviewSignature, reviewSignature);
            lastReviewSignature = reviewSignature;
            noProgressCount = madeProgress ? 0 : noProgressCount + 1;
            if (!madeProgress && noProgressCount >= MAX_NO_PROGRESS_RECOVERY_ATTEMPTS) {
              logger.error(
                { missionId: ctx.missionId, phaseId: phase.id, gaps: applied.gaps, noProgressCount },
                'Mission phase review made no observable progress after approach changes; pausing for review (safety ceiling)',
              );
              break;
            }
            const noProgressGuidance = !madeProgress
              ? ' Previous attempts made no observable progress on the same gaps; use a different authorized approach and do not repeat the same recovery steps. If a required value or authorization is missing, ask the user for it and wait.'
              : '';
            if (applied.amendment && noProgressGuidance) {
              // Director decision: amend system prompt with no-progress guidance
              await agentRuntime.emitMonologue({
                agentRole: 'mission-director',
                phaseId: phase.id,
                thought: `No observable progress was made on the same gaps in review ${reviewIndex}. I am updating the recovery task's system prompt with no-progress guidance to require a different authorized approach.`,
                text: `Adding no-progress guidance to recovery task.`,
                data: { reviewIndex, gaps: applied.gaps, reason: 'no_progress_guidance' },
              });
              applied.amendment.systemPrompt = `${applied.amendment.systemPrompt}
${noProgressGuidance}`;
              plan = { ...plan, phases: plan.phases.map((p) => p.id === phase.id ? { ...phase, tasks: [...phase.tasks] } : p) };
            }
            if (!applied.amendment) {
              // The Mission Director creates a recovery task when the Phase
              // Reviewer did not propose one, with visible rationale.
              await agentRuntime.emitMonologue({
                agentRole: 'mission-director',
                phaseId: phase.id,
                thought: `The Phase Reviewer reported ${applied.gaps.length} gap(s) for phase "${phase.name}" but did not propose an actionable follow-up task. I am creating a recovery task to address the gaps: ${applied.gaps.slice(0, 5).join('; ')}.`,
                text: `Creating recovery task for unresolved phase gaps.`,
                data: { reviewIndex, gaps: applied.gaps, reason: 'reviewer_no_followup' },
              });
              logger.error({ missionId: ctx.missionId, phaseId: phase.id, gaps: applied.gaps }, 'Mission phase remains incomplete and reviewer provided no actionable follow-up task');
              const amendmentIndex = phase.tasks.filter((t: any) => t.id.startsWith(`${phase.id}-amendment-`)).length + 1;
              const amendmentTask: Task = {
                id: `${phase.id}-amendment-${amendmentIndex}`,
                title: `Address phase gaps (review ${reviewIndex})`,
                description: `Address remaining gaps: ${(applied.gaps || []).join('; ') || 'unspecified gaps'}`,
agentRole: 'mission-executor',
                systemPrompt: `Mission goal: ${ctx.prompt}\nPhase goal: ${phase.name} — ${phase.goal}\nResolve the following gaps using the available context and recorded task outputs: ${(applied.gaps || []).join('; ') || 'unspecified gaps'}. Focus only on accomplishing the requested mission outcome or reporting a concrete blocker. Do not invent unrelated work, and do not create or request design documents, plans, or substitute artifacts unless the mission goal explicitly requires them as deliverables.${noProgressGuidance}`,
                dependsOnTaskIds: phase.tasks.map((t: any) => t.id),
                expectedArtifacts: [],
                requiredActions: [],
                status: 'pending',
                artifacts: [],
              } as Task;
              applyRuntimeTaskRequirements(amendmentTask, ctx.prompt);
              phase.tasks.push(amendmentTask);
              plan.phases = plan.phases.map((p: any) => p.id === phase.id ? phase : p);
              activePlan = plan;
              this.currentPlan = plan;
              saveCheckpoint();
              try {
                await this.persistPlan(ctx, plan);
              } catch (err) {
                if (isFatalServiceError(err)) throw err;
                logger.error({ missionId: ctx.missionId, err: err instanceof Error ? err.message : String(err) }, 'Failed to persist amended plan');
              }
              await ctx.broadcast({
                type: 'phase_plan_amended',
                missionId: ctx.missionId,
                timestamp: Date.now(),
                data: {
                  phaseId: phase.id,
                  reviewIndex,
                  gaps: applied.gaps.map((gap) => sanitizeAgentMessage(gap, '').text).filter(Boolean),
                  task: amendmentTask,
                  plan,
                  agentId: agentRuntime.getAgentIdForRole('mission-director'),
                  agentName: 'Mission Director',
                  agentRole: 'mission-director',
                },
              });
              await executePendingTasks();
              await ctx.controlCheckpoint?.();
              uncertainActionIssue = findUncertainAction();
              if (uncertainActionIssue) break;
              continue;
            }
            saveCheckpoint();
            try {
              await this.persistPlan(ctx, plan);
            } catch (err) {
              if (isFatalServiceError(err)) throw err;
              logger.error({ missionId: ctx.missionId, err: err instanceof Error ? err.message : String(err) }, 'Failed to persist amended plan');
            }
            // Director decision: adopt reviewer's proposed amendment
            await agentRuntime.emitMonologue({
              agentRole: 'mission-director',
              phaseId: phase.id,
              thought: `The Phase Reviewer proposed an actionable follow-up task "${applied.amendment.title}" for review ${reviewIndex}. I am adopting this amendment and scheduling it to address the identified gaps: ${applied.gaps.slice(0, 5).join('; ')}.`,
              text: `Adopting reviewer's follow-up task "${applied.amendment.title}".`,
              data: { reviewIndex, amendmentId: applied.amendment.id, amendmentTitle: applied.amendment.title, gaps: applied.gaps, reason: 'reviewer_followup_adopted' },
            });
            await ctx.broadcast({
              type: 'phase_plan_amended',
              missionId: ctx.missionId,
              timestamp: Date.now(),
              data: {
                phaseId: phase.id,
                reviewIndex,
                gaps: applied.gaps.map((gap) => sanitizeAgentMessage(gap, '').text).filter(Boolean),
                task: applied.amendment,
                plan,
                agentId: agentRuntime.getAgentIdForRole('mission-director'),
                agentName: 'Mission Director',
                agentRole: 'mission-director',
              },
            });
            await executePendingTasks();
            await ctx.controlCheckpoint?.();
            uncertainActionIssue = findUncertainAction();
            if (uncertainActionIssue) break;
          } catch (err) {
            if (isFatalServiceError(err)) throw err;
            logger.error({ missionId: ctx.missionId, phaseId: phase.id, err: err instanceof Error ? err.message : String(err) }, 'Phase review failed');
            await new Promise((resolve) => setTimeout(
              resolve,
              Math.min(60_000, 1_000 * 2 ** Math.min(reviewIndex - 1, 6)),
            ));
            await ctx.controlCheckpoint?.();
          }
        }
      }

      if (!phaseReviewSatisfied) {
        logger.error({ missionId: ctx.missionId, phaseId: phase.id }, 'Mission phase was not completed because its review did not confirm the phase goal');
        phaseOutput.status = 'incomplete';
        await this.updatePhase(ctx, phase.id, { status: 'in_progress' });
        phase.status = 'in_progress';
        outputs.phases.push(phaseOutput);
        break;
      }

      if (!phaseIsComplete) {
        await agentRuntime.emitMonologue({
          agentRole: 'mission-director',
          phaseId: phase.id,
          thought: `Phase "${phase.name}" review is satisfied: its tasks are completed and the phase reviewer confirmed the phase goal. The phase is complete. I am marking it awaiting_approval so the completion is persisted before the mission continues to the next phase.`,
          text: `Phase "${phase.name}" is complete; moving to awaiting_approval.`,
          data: { phaseId: phase.id, phaseName: phase.name, decision: 'phase_complete_awaiting_approval' },
        });
        await this.updatePhase(ctx, phase.id, { status: 'awaiting_approval' });
        phase.status = 'awaiting_approval';
        await ctx.broadcast({ type: 'phase_completed', missionId: ctx.missionId, timestamp: Date.now(), data: { phaseId: phase.id, phaseName: phase.name, artifacts: phaseOutput.tasks.flatMap((t: any) => t.artifacts) } });
      }

      if (phaseIsComplete) {
        outputs.phases.push(phaseOutput);
        await new MissionStageCompletedListener().onStageCompleted(
          workflowInput,
          plan,
          phaseOutput as MissionPhaseOutput,
        );
        continue;
      }

      if (phase.requiresApproval) {
        const question = phase.approvalQuestion || `Phase "${phase.name}" complete. Approve to continue?`;
        const approvalId = `approval-${ctx.missionId}-${phase.id}-${Date.now()}`;
        await agentRuntime.emitMonologue({
          agentRole: 'mission-director',
          phaseId: phase.id,
          thought: `Phase "${phase.name}" is complete and its plan requires explicit approval before the mission continues. I am requesting approval with question: "${question}". The mission will pause here until the user approves or rejects.`,
          text: `Requesting approval for phase "${phase.name}".`,
          data: { phaseId: phase.id, phaseName: phase.name, decision: 'approval_requested' },
        });
        await this.updatePhase(ctx, phase.id, { approvalQuestion: question });
        phase.approvalQuestion = question;
        await ctx.broadcast({
          type: 'approval_requested',
          missionId: ctx.missionId,
          timestamp: Date.now(),
          data: { approvalId, phaseId: phase.id, phaseName: phase.name, question },
        });
        const decision = await ctx.waitForApproval(phase.id, question);
        if (!decision.approved) {
          await agentRuntime.emitMonologue({
            agentRole: 'mission-director',
            phaseId: phase.id,
            thought: `The user rejected phase "${phase.name}": ${decision.reason}. I am halting the mission at this phase with status rejected_at_phase; no further phases will execute.`,
            text: `Phase "${phase.name}" rejected by user; mission halted.`,
            data: { phaseId: phase.id, reason: decision.reason, decision: 'approval_rejected' },
          });
          await this.updatePhase(ctx, phase.id, { status: 'rejected', rejectionReason: decision.reason });
          phase.status = 'rejected';
          phase.rejectionReason = decision.reason;
          await ctx.broadcast({ type: 'approval_rejected', missionId: ctx.missionId, timestamp: Date.now(), data: { phaseId: phase.id, reason: decision.reason } });
          return { plan, outputs: { ...outputs, status: 'rejected_at_phase', phaseId: phase.id, reason: decision.reason }, compensations };
        }
        await agentRuntime.emitMonologue({
          agentRole: 'mission-director',
          phaseId: phase.id,
          thought: `The user approved phase "${phase.name}". I am marking the phase approved and the mission will continue to the next phase.`,
          text: `Phase "${phase.name}" approved by user.`,
          data: { phaseId: phase.id, decision: 'approval_approved' },
        });
        await this.updatePhase(ctx, phase.id, { status: 'approved', approvedAt: Date.now(), approvedBy: 'user' });
        phase.status = 'approved';
        phase.approvedBy = 'user';
        await ctx.broadcast({ type: 'approval_approved', missionId: ctx.missionId, timestamp: Date.now(), data: { phaseId: phase.id } });
      } else {
        await agentRuntime.emitMonologue({
          agentRole: 'mission-director',
          phaseId: phase.id,
          thought: `Phase "${phase.name}" is complete and does not require separate approval. I am marking it completed and the mission will continue to the next phase.`,
          text: `Phase "${phase.name}" marked completed (no approval required).`,
          data: { phaseId: phase.id, decision: 'phase_auto_completed' },
        });
        await this.updatePhase(ctx, phase.id, { status: 'completed' });
        phase.status = 'completed';
      }

      completedPhases.add(phase.id);
      saveCheckpoint();
      outputs.phases.push(phaseOutput);
      if (phaseOutput.status === 'completed') {
        await new MissionStageCompletedListener().onStageCompleted(
          workflowInput,
          plan,
          phaseOutput as MissionPhaseOutput,
        );
      }
    }

    await ctx.controlCheckpoint?.();
    let lastCompletionSignature: string | undefined;
    let completionNoProgress = 0;
    let completionVerified = false;
    let completionGaps: string[] = [];
    let reviewReason = '';
    let lastRecoveryIssue = '';
    let recoveryIndex = 0;
    let completionVerificationRetries = 0;
    let completionVerificationFailed = false;
    const sourceTaskRerunCounts = new Map<string, number>();
    while (true) {
      if (uncertainActionIssue) {
        completionGaps = [uncertainActionIssue];
        reviewReason = 'An action outcome is uncertain and must be reconciled before retrying.';
        lastRecoveryIssue = uncertainActionIssue;
        break;
      }
      recoveryIndex += 1;
      const completionReview = await this.evaluateMissionCompletion(ctx, plan, outputs);
      if (completionReview.satisfied) {
        completionVerified = true;
        break;
      }

      // A verification failure means the reviewer could not produce a valid
      // verdict (e.g. malformed output after its own retries) — not that the
      // mission is incomplete. This is recoverable: retry the review with a
      // fresh routing session instead of spawning a futile recovery task or
      // aborting the mission.
      if (completionReview.verificationFailed) {
        completionVerificationFailed = true;
        if (completionVerificationRetries < MAX_COMPLETION_VERIFICATION_RETRIES) {
          completionVerificationRetries += 1;
          logger.warn(
            { missionId: ctx.missionId, attempt: completionVerificationRetries, gaps: completionReview.gaps },
            'Mission completion review could not produce a valid verdict; retrying the review',
          );
          await new Promise((resolve) => setTimeout(resolve, 1_000 * completionVerificationRetries));
          continue;
        }
        completionGaps = completionReview.gaps.length
          ? completionReview.gaps
          : ['Mission completion could not be automatically verified.'];
        reviewReason = 'Mission completion could not be automatically verified after repeated review attempts; it needs review rather than being marked incomplete.';
        await agentRuntime.emitMonologue({
          agentRole: 'mission-director',
          thought: `Mission completion could not be automatically verified after ${MAX_COMPLETION_VERIFICATION_RETRIES + 1} review attempts: ${completionGaps.join('; ')}. The mission needs review rather than being marked incomplete.`,
          text: 'Mission needs review: completion could not be automatically verified.',
          data: { decision: 'mission_needs_review', gaps: completionGaps, reason: 'completion_verification_failed' },
        });
        break;
      }

      const gaps = completionReview.gaps.length
        ? completionReview.gaps
        : ['Mission completion has not been verified from the recorded task evidence.'];
      completionGaps = gaps;

      // A missing input or incomplete source task means the earlier task did
      // not actually succeed. Data/state problems are not mission failures:
      // retry the source task itself with a different prompt before creating a
      // separate recovery task that lacks the missing input.
      const missingInputSource = plan.phases
        .flatMap((candidatePhase) => candidatePhase.tasks.map((candidateTask) => ({
          phase: candidatePhase,
          task: candidateTask,
        })))
        .find(({ task }) =>
          !/-amendment-\d+|-mission-recovery-\d+/i.test(task.id)
          && ((sourceTaskRerunCounts.get(task.id) ?? 0) < MAX_SOURCE_TASK_RERUNS)
          && gaps.some((gap) => gap.includes(task.id) || gap.includes(task.title))
          && (task.status !== 'completed'
            || gapIsDataOrStateIssue(gaps.find((gap) => gap.includes(task.id) || gap.includes(task.title)) || '')
            || gaps.some((gap) => /is missing expected artifact/i.test(gap)
              && (gap.includes(task.id) || gap.includes(task.title)))));
      if (missingInputSource) {
        const { phase: sourcePhase, task: sourceTask } = missingInputSource;
        const attempt = (sourceTaskRerunCounts.get(sourceTask.id) || 0) + 1;
        sourceTaskRerunCounts.set(sourceTask.id, attempt);
        const previousReason = sanitizeAgentMessage(sourceTask.output || '', '').text.trim();
        const sourceKey = JSON.stringify([sourcePhase.id, sourceTask.id]);
        completedTasks.delete(sourceKey);
        completedTaskSummaries.delete(sourceTask.id);
        completedPhases.delete(sourcePhase.id);
        sourceTask.status = 'pending';
        sourceTask.completedAt = undefined;
        sourcePhase.status = 'in_progress';
        let sourceOutput = (outputs.phases as MissionPhaseOutput[])
          .find((candidate) => candidate.phaseId === sourcePhase.id);
        if (!sourceOutput) {
          sourceOutput = { phaseId: sourcePhase.id, name: sourcePhase.name, status: 'incomplete', tasks: [] };
          (outputs.phases as MissionPhaseOutput[]).push(sourceOutput);
        }
        sourceOutput.status = 'incomplete';
        sourceOutput.tasks = sourceOutput.tasks.filter((entry) => entry.taskId !== sourceTask.id);
        await this.updateTask(ctx, sourcePhase.id, sourceTask.id, { status: 'pending' });
        await this.updatePhase(ctx, sourcePhase.id, { status: 'in_progress' });
        const sourceGuidance = [
          `This task is being retried because its earlier result did not satisfy the mission requirement and a dependent step needs its output.`,
          previousReason ? `The previous attempt reported: ${previousReason.slice(0, 500)}.` : 'The previous attempt produced no usable result.',
          'Use a different approach: produce the required result or deliverable with real content, or work around the obstacle.',
          'Do not return internal data (tool manifests, plans, or receipts) as the task result; report the outcome in plain language.',
          'Do not repeat side-effect actions whose outcome is already recorded or uncertain.',
        ].filter(Boolean).join(' ');
        await agentRuntime.emitMonologue({
          agentRole: 'mission-director',
          phaseId: sourcePhase.id,
          taskId: sourceTask.id,
          thought: `The mission cannot be verified because task "${sourceTask.title}" did not actually produce its result (attempt ${attempt}/${MAX_SOURCE_TASK_RERUNS}). A missing input means the earlier task was not successful, so I am retrying that source task with a different prompt rather than failing the mission.`,
          text: `Retrying source task "${sourceTask.title}" to produce the missing result.`,
          data: { rerunTaskId: sourceTask.id, attempt, reason: 'missing_input_retry_source_task', gaps },
        });
        try {
          const rerunResult = await agentRuntime.executeTask(
            sharedMissionAgentId,
            sourceTask,
            sourcePhase,
            plan,
            false,
            ctx.executionPolicy || MISSION_TASK_EXECUTION_POLICY,
            [...completedTaskSummaries.values()],
            sourceGuidance,
            undefined,
            ctx.prompt,
            ctx.userMessages,
          );
          if (rerunResult.interruption) {
            const interruption = rerunResult.interruption;
            pendingInteraction = {
              kind: interruption.kind,
              phaseId: sourcePhase.id,
              taskId: sourceTask.id,
              taskTitle: sourceTask.title,
              agentRole: sourceTask.agentRole,
              ...(interruption.question ? { question: interruption.question } : {}),
              ...(interruption.credentialRequest ? { credentialRequest: interruption.credentialRequest } : {}),
              ...(interruption.requestId ? { requestId: interruption.requestId } : {}),
              ...(interruption.permission ? { permission: interruption.permission } : {}),
              actionReceipts: rerunResult.actionReceipts || [],
              resumeCount: 0,
            };
            sourceTask.status = 'pending';
            sourceTask.output = interruption.question || interruption.permission?.explanation || 'Mission is waiting for your response.';
            await this.updateTask(ctx, sourcePhase.id, sourceTask.id, {
              status: 'pending',
              output: sourceTask.output,
            });
            sourceOutput.tasks.push({
              taskId: sourceTask.id,
              status: 'pending',
              artifacts: rerunResult.artifacts,
              output: sourceTask.output,
            });
            await this.persistMissionStateOnInterruption(ctx, plan, outputs, pendingInteraction, sourceTask.startedAt || Date.now());
            await ctx.broadcast({
              type: interruption.kind === 'user_input' ? 'question_asked' : 'permission_required',
              missionId: ctx.missionId,
              timestamp: Date.now(),
              data: {
                phaseId: sourcePhase.id,
                taskId: sourceTask.id,
                taskTitle: sourceTask.title,
                agentRole: sourceTask.agentRole,
                ...(interruption.question ? { question: interruption.question } : {}),
                ...(interruption.requestId ? { requestId: interruption.requestId } : {}),
                ...(interruption.credentialRequest ? { credentialRequest: interruption.credentialRequest } : {}),
                ...(interruption.permission ? { permission: interruption.permission } : {}),
              },
            });
            throw new MissionUserInterruptionError({
              plan,
              outputs: {
                ...outputs,
                status: interruption.kind === 'user_input' ? 'awaiting_user_input' : 'awaiting_permission',
                pendingInteraction,
              },
              compensations,
            });
          }
          const rerunStatus = rerunResult.incompleteReason ? 'incomplete' : 'completed';
          const completedAt = Date.now();
          sourceTask.status = rerunStatus;
          sourceTask.completedAt = completedAt;
          sourceTask.output = rerunResult.output;
          sourceTask.artifacts = rerunResult.artifacts;
          await this.updateTask(ctx, sourcePhase.id, sourceTask.id, {
            status: rerunStatus,
            completedAt,
            output: rerunResult.output,
            artifacts: rerunResult.artifacts,
          });
          sourceOutput.tasks.push({
            taskId: sourceTask.id,
            status: rerunStatus,
            artifacts: rerunResult.artifacts,
            output: rerunResult.output,
          });
          completedTasks.set(sourceKey, { phaseId: sourcePhase.id, taskId: sourceTask.id });
          if (rerunStatus === 'completed') {
            sourcePhase.status = 'completed';
            sourceOutput.status = 'completed';
            completedPhases.add(sourcePhase.id);
          }
          completedTaskSummaries.set(
            sourceTask.id,
            createCompletedTaskSummary(
              sourceTask.id,
              rerunResult.output,
              rerunResult.artifacts,
              sourceTask.requiredActions,
              sourceTask.requiresExternalAction,
            ),
          );
          await ctx.broadcast({
            type: rerunStatus === 'completed' ? 'task_completed' : 'task_incomplete',
            missionId: ctx.missionId,
            timestamp: completedAt,
            data: {
              phaseId: sourcePhase.id,
              taskId: sourceTask.id,
              taskTitle: sourceTask.title,
              ...agentIdentityForRole(agentRuntime, sourceTask.agentRole),
              artifacts: rerunResult.artifacts,
              output: sanitizeAgentMessage(rerunResult.output, '').text.slice(0, 4_000),
              ...(rerunResult.incompleteReason
                ? { error: sanitizeAgentMessage(rerunResult.incompleteReason, 'The Agent did not produce a readable result.').text }
                : {}),
              tokensUsed: rerunResult.tokensUsed,
            },
          });
          lastRecoveryIssue = rerunResult.incompleteReason || '';
        } catch (rerunError) {
          if (rerunError instanceof MissionUserInterruptionError) throw rerunError;
          if (isFatalServiceError(rerunError)) throw rerunError;
          lastRecoveryIssue = rerunError instanceof Error ? rerunError.message : String(rerunError);
        }
        saveCheckpoint();
        await ctx.controlCheckpoint?.();
        continue;
      }

      if (recoveryIndex > MAX_MISSION_RECOVERY_ROUNDS_SAFETY) {
        reviewReason = 'Automatic recovery reached its safety limit.';
        await agentRuntime.emitMonologue({
          agentRole: 'mission-director',
          thought: `Mission completion recovery reached its safety limit with unresolved gaps: ${gaps.join('; ')}. The mission needs review.`,
          text: 'Mission needs review: recovery reached its safety limit.',
          data: { decision: 'mission_needs_review', gaps, reason: 'recovery_safety_ceiling' },
        });
        break;
      }
      const allEvidenceTasks = (outputs.phases as MissionPhaseOutput[]).flatMap((output) => output.tasks);
      const completionSignature = recoveryProgressSignature({
        gaps,
        completedTaskIds: allEvidenceTasks.filter((t) => t.status === 'completed').map((t) => t.taskId),
        completedTaskStatuses: allEvidenceTasks.map((t) => `${t.taskId}:${t.status}`),
        ...recoveryEvidenceState(allEvidenceTasks, plan.phases.flatMap((phase) =>
          phase.tasks.filter((task) => !/-amendment-\d+|-mission-recovery-\d+/i.test(task.id))
            .flatMap((task) => task.expectedArtifacts || []))),
        outputs: allEvidenceTasks.map((t) => t.output || ''),
      });
      const madeProgress = hasEvidenceRecoveryProgress(lastCompletionSignature, completionSignature);
      lastCompletionSignature = completionSignature;
      completionNoProgress = madeProgress ? 0 : completionNoProgress + 1;
      const recoveryPhase = plan.phases.find((phase) =>
        gaps.some((gap) =>
          gap.includes(phase.id)
          || gap.includes(phase.name)
          || phase.tasks.some((task) => gap.includes(task.id)),
        ),
      ) || plan.phases.at(-1);
      if (!recoveryPhase) {
        reviewReason = 'No phase is available to address the remaining issues.';
        await agentRuntime.emitMonologue({
          agentRole: 'mission-director',
          thought: `No phase is available to address the unmet requirements (${gaps.join('; ')}). The mission needs review.`,
          text: 'Mission needs review: no recovery phase is available.',
          data: { decision: 'mission_needs_review', gaps, reason: 'no_recovery_phase' },
        });
        break;
      }
      let phaseOutput = (outputs.phases as MissionPhaseOutput[])
        .find((candidate) => candidate.phaseId === recoveryPhase.id);
      if (!phaseOutput) {
        phaseOutput = { phaseId: recoveryPhase.id, name: recoveryPhase.name, status: 'completed', tasks: [] };
        (outputs.phases as MissionPhaseOutput[]).push(phaseOutput);
      }
      // Task 7 linkage: identify original unmet requirements (planned tasks referenced by gaps)
      // so recovery work/evidence is credited against the original requirement.
      const targetTaskIds = [...new Set(
        recoveryPhase.tasks
          .filter((task) => !task.id.includes('-mission-recovery-') && gaps.some((gap) => gap.includes(task.id) || gap.includes(task.title)))
          .map((task) => task.id),
      )];

      if (completionNoProgress >= MAX_NO_PROGRESS_RECOVERY_ATTEMPTS) {
        reviewReason = 'Automatic recovery could not resolve the issues after several approaches.';
        await agentRuntime.emitMonologue({
          agentRole: 'mission-director',
          thought: `Mission completion recovery has not resolved the gaps after ${MAX_NO_PROGRESS_RECOVERY_ATTEMPTS} attempts: ${gaps.join('; ')}. The mission needs review.`,
          text: 'Mission needs review: recovery has not resolved the remaining gaps.',
          data: { decision: 'mission_needs_review', gaps, reason: 'no_progress_ceiling', completionNoProgress },
        });
        break;
      }
      const noProgressGuidance = [
        !madeProgress
          ? ' Previous attempts made no observable progress on the same gaps; use a different authorized approach and do not repeat the same recovery steps. If a required value or authorization is missing, ask the user for it and wait.'
          : '',
        lastRecoveryIssue ? ` The previous recovery attempt reported: ${lastRecoveryIssue.slice(0, 1000)}. Address that specific blocker; do not repeat a failed tool call unchanged.` : '',
      ].join('');

      const availableArtifacts = phaseOutput.tasks
        .filter((task) => task.status === 'completed')
        .flatMap((task) => task.artifacts);
      const gapArtifactNames = [...new Set(gaps.flatMap((gap) => {
        const matches = gap.match(/"([^"]+\.(?:json|md|txt|csv|ya?ml|html))"/gi) || [];
        return matches.map((m) => m.replace(/"/g, '')).filter((name) => name.toLocaleLowerCase() !== 'system-action-receipts.json');
      }))];
      const targetedExpectedArtifacts = [...new Set([
        ...recoveryPhase.tasks
          .filter((task) => targetTaskIds.includes(task.id))
          .flatMap((task) => task.expectedArtifacts || []),
        ...gapArtifactNames,
      ])].filter((name) => !availableArtifacts.some((artifact) => missingExpectedArtifacts([artifact], [name]).length === 0));
      const expectedArtifacts = targetedExpectedArtifacts.length > 0
        ? targetedExpectedArtifacts.slice(0, 5)
        : [];
      const taskIds = recoveryTaskDependencies(
        recoveryPhase.tasks,
        completedTaskSummaries.values(),
        targetTaskIds,
      );
      const existingTaskIds = new Set(plan.phases.flatMap((phase) => phase.tasks.map((task) => task.id)));
      let taskNumber = recoveryIndex;
      while (existingTaskIds.has(`${recoveryPhase.id}-mission-recovery-${taskNumber}`)) taskNumber++;
      const taskId = `${recoveryPhase.id}-mission-recovery-${taskNumber}`;
      // The Mission Director decides to create a recovery task with visible
      // rationale: the Mission Evaluator reported unmet requirements.
      await agentRuntime.emitMonologue({
        agentRole: 'mission-director',
        phaseId: recoveryPhase.id,
        thought: `The Mission Evaluator reported ${gaps.length} unmet mission completion requirement(s) in phase "${recoveryPhase.name}": ${gaps.slice(0, 5).join('; ')}. I am creating a recovery task (attempt ${recoveryIndex}) to resolve these gaps before the mission can complete.`,
        text: `Creating mission recovery task (attempt ${recoveryIndex}) for ${gaps.length} gap(s).`,
        data: { recoveryIndex, gaps, targetTaskIds, reason: 'completion_gaps' },
      });
      const recoveryTask: Task = {
        id: taskId,
        title: `Resolve mission completion gaps (attempt ${recoveryIndex})`,
        description: `Resolve missing deliverables: ${expectedArtifacts.join(', ') || 'required artifacts'}.`,
        agentRole: 'mission-executor',
        systemPrompt: `Resolve the remaining gaps for tasks: ${targetTaskIds.join(', ') || 'none identified'}. Mission goal: "${ctx.prompt}". Phase: "${recoveryPhase.name}". Produce ${expectedArtifacts.join(', ') || 'the required results'}. Use recorded task outputs as context. Perform the work yourself; use tools when needed, but do not substitute a plan or ask the user to produce the deliverable.${noProgressGuidance}`,
        dependsOnTaskIds: taskIds,
        expectedArtifacts,
        requiredActions: [],
        status: 'pending',
        artifacts: [],
      };
      applyRuntimeTaskRequirements(recoveryTask, ctx.prompt);
      recoveryPhase.tasks.push(recoveryTask);
      recoveryPhase.status = 'in_progress';
      completedPhases.delete(recoveryPhase.id);
      phaseOutput.status = 'incomplete';
      activePlan = plan;
      this.currentPlan = plan;
      saveCheckpoint();
      await this.updatePhase(ctx, recoveryPhase.id, { status: 'in_progress' });
      await this.persistPlan(ctx, plan);
      await ctx.broadcast({
        type: 'phase_plan_amended',
        missionId: ctx.missionId,
        timestamp: Date.now(),
        data: {
          phaseId: recoveryPhase.id,
          reviewIndex: recoveryIndex,
          gaps: gaps.map((gap) => sanitizeAgentMessage(gap, '').text).filter(Boolean),
          task: recoveryTask,
          plan,
          agentId: agentRuntime.getAgentIdForRole('mission-director'),
          agentName: 'Mission Director',
          agentRole: 'mission-director',
        },
      });

      const startedAt = Date.now();
      await this.updateTask(ctx, recoveryPhase.id, recoveryTask.id, { status: 'in_progress', startedAt });
      let result: TaskExecutionResult | undefined;
      let failure = '';
      let failureCode: string | undefined;
      let recoveryAttempted = false;
      try {
        const agentId = sharedMissionAgentId;
        const args: [
          string,
          Task,
          Phase,
          Plan,
          boolean,
          AgentExecutionPolicy,
          CompletedTaskSummary[],
        ] = [
          agentId,
          recoveryTask,
          recoveryPhase,
          plan,
          false,
          ctx.executionPolicy || MISSION_TASK_EXECUTION_POLICY,
          [...completedTaskSummaries.values()],
        ];
        try {
          result = await agentRuntime.executeTask(...args, undefined, undefined, ctx.prompt, ctx.userMessages);
        } catch (error) {
          failureCode = extractFailureCode(error) || undefined;
          if (failureCode === FAILURE_CODES.OUTCOME_UNKNOWN || failureCode === FAILURE_CODES.MODEL_EXHAUSTED
            || failureCode === FAILURE_CODES.CREDENTIAL_REQUIRED) throw error;
          if (isFatalServiceError(error)) throw error;
          const firstError = error instanceof Error ? error.message : String(error);
          // Adapt recovery guidance based on failure classification.
          const retryGuidance = failureCode === FAILURE_CODES.REQUEST_TOO_LARGE
            ? `The previous attempt failed: ${firstError}. Reduce the task scope and context size; do not repeat the full request. Continue from recorded outputs, do not repeat successful or uncertain side effects, and use a smaller, more focused approach.`
            : failureCode === FAILURE_CODES.TOOL_MISSING
              ? `The previous attempt failed: ${firstError}. A required tool or capability is missing. Search the live tool catalog, use an authorized alternative, or create a compatible tool. Do not repeat the exact same failing call.`
              : failureCode === FAILURE_CODES.CREDENTIAL_REQUIRED
                ? `The previous attempt failed: ${firstError}. A required secret or authorization is missing. Ask the user for the exact named value or permission and wait; never ask the user to choose, install, or configure tools.`
                : failureCode === FAILURE_CODES.OUTCOME_UNKNOWN
                  ? `The previous attempt failed: ${firstError}. The outcome of a side effect is unknown and must not be repeated. Use recorded receipts to verify what happened, and use another authorized approach if one path is blocked.`
                  : failureCode === FAILURE_CODES.TRANSIENT_SERVICE_ERROR
                    ? `The previous attempt failed: ${firstError}. A transient service error occurred. Retry with a different approach after a brief delay; do not repeat the identical failing call.`
                    : `The previous attempt failed: ${firstError}. Continue from recorded outputs, do not repeat successful or uncertain side effects, and use another authorized approach.`;
          result = await agentRuntime.executeTask(
            ...args,
            retryGuidance,
            undefined,
            ctx.prompt,
            ctx.userMessages,
          );
          recoveryAttempted = true;
        };
      } catch (error) {
        failureCode = extractFailureCode(error) || failureCode;
        if (isFatalServiceError(error) && failureCode !== FAILURE_CODES.OUTCOME_UNKNOWN
          && failureCode !== FAILURE_CODES.CREDENTIAL_REQUIRED) throw error;
        failure = error instanceof Error ? error.message : String(error);
      }

      if (result?.interruption) {
        const interruption = result.interruption;
        pendingInteraction = {
          kind: interruption.kind,
          phaseId: recoveryPhase.id,
          taskId: recoveryTask.id,
          taskTitle: recoveryTask.title,
          agentRole: recoveryTask.agentRole,
          ...(interruption.question ? { question: interruption.question } : {}),
          ...(interruption.credentialRequest ? { credentialRequest: interruption.credentialRequest } : {}),
          ...(interruption.requestId ? { requestId: interruption.requestId } : {}),
          ...(interruption.permission ? { permission: interruption.permission } : {}),
          actionReceipts: result.actionReceipts || [],
          resumeCount: 0,
        };
        recoveryTask.status = 'pending';
        recoveryTask.output = interruption.question || interruption.permission?.explanation || 'Mission is waiting for your response.';
        await this.updateTask(ctx, recoveryPhase.id, recoveryTask.id, {
          status: 'pending',
          output: recoveryTask.output,
        });
        phaseOutput.tasks.push({
          taskId: recoveryTask.id,
          status: 'pending',
          artifacts: result.artifacts,
          output: recoveryTask.output,
        });
        saveCheckpoint();
        // Persist mission state with pendingInteraction BEFORE broadcasting the question,
        // so the frontend can immediately fetch the interaction details.
        const missionStartedAt = recoveryTask.startedAt || Date.now();
        await this.persistMissionStateOnInterruption(ctx, plan, outputs, pendingInteraction, missionStartedAt);
        await ctx.broadcast({
          type: interruption.kind === 'user_input' ? 'question_asked' : 'permission_required',
          missionId: ctx.missionId,
          timestamp: Date.now(),
          data: {
            phaseId: recoveryPhase.id,
            taskId: recoveryTask.id,
            taskTitle: recoveryTask.title,
            agentRole: recoveryTask.agentRole,
            ...(interruption.question ? { question: interruption.question } : {}),
            ...(interruption.requestId ? { requestId: interruption.requestId } : {}),
            ...(interruption.credentialRequest ? { credentialRequest: interruption.credentialRequest } : {}),
            ...(interruption.permission ? { permission: interruption.permission } : {}),
          },
        });
        throw new MissionUserInterruptionError({
          plan,
          outputs: {
            ...outputs,
            status: interruption.kind === 'user_input' ? 'awaiting_user_input' : 'awaiting_permission',
            pendingInteraction,
          },
          compensations,
        });
      }

      const completedAt = Date.now();
      recoveryTask.status = result ? (result.incompleteReason ? 'incomplete' : 'completed') : 'failed';
      recoveryTask.completedAt = completedAt;
      recoveryTask.output = result?.output || failure;
      lastRecoveryIssue = failure || result?.incompleteReason || '';
      recoveryTask.artifacts = result?.artifacts || [];
      await this.updateTask(ctx, recoveryPhase.id, recoveryTask.id, {
        status: recoveryTask.status,
        completedAt,
        output: recoveryTask.output,
        artifacts: recoveryTask.artifacts,
      });
      const taskEvidence = {
        taskId: recoveryTask.id,
        status: recoveryTask.status,
        artifacts: recoveryTask.artifacts,
        output: recoveryTask.output,
      };
      phaseOutput.tasks.push(taskEvidence);
      completedTasks.set(JSON.stringify([recoveryPhase.id, recoveryTask.id]), {
        phaseId: recoveryPhase.id,
        taskId: recoveryTask.id,
      });
      completedTaskSummaries.set(
        recoveryTask.id,
        createCompletedTaskSummary(
          recoveryTask.id,
          recoveryTask.output || '',
          recoveryTask.artifacts,
          recoveryTask.requiredActions,
          recoveryTask.requiresExternalAction,
          undefined,
          { taskIds: targetTaskIds, gaps },
        ),
      );
      recoveryPhase.status = 'completed';
      phaseOutput.status = 'completed';
      completedPhases.add(recoveryPhase.id);
      saveCheckpoint();
      await this.updatePhase(ctx, recoveryPhase.id, { status: 'completed' });
      await ctx.broadcast({
        type: recoveryTask.status === 'completed' ? 'task_completed' : recoveryTask.status === 'incomplete' ? 'task_incomplete' : 'task_failed',
        missionId: ctx.missionId,
        timestamp: completedAt,
        data: {
          phaseId: recoveryPhase.id,
          taskId: recoveryTask.id,
          taskTitle: recoveryTask.title,
          ...agentIdentityForRole(agentRuntime, recoveryTask.agentRole),
          ...(result
            ? {
              artifacts: result.artifacts,
              output: sanitizeAgentMessage(result.output, '').text.slice(0, 4_000),
              tokensUsed: result.tokensUsed,
              ...(result.incompleteReason
                ? { error: sanitizeAgentMessage(result.incompleteReason, 'The Agent did not produce a readable result.').text }
                : {}),
            }
            : { error: sanitizeAgentMessage(failure, 'The Agent did not produce a readable result.').text }),
        },
      });
      await ctx.controlCheckpoint?.();
      if (failureCode === FAILURE_CODES.MODEL_EXHAUSTED
        || (result?.incompleteReason && /\bmodel exhausted\b|all models unavailable|model selection exhausted/i.test(result.incompleteReason))) {
        // Loss of the Brain is fatal, not a recoverable mission outcome.
        throw new Error(`Mission recovery aborted because the Brain is unavailable: ${lastRecoveryIssue || result?.incompleteReason || 'model exhausted'}`);
      }
      if (failureCode === FAILURE_CODES.OUTCOME_UNKNOWN
        || failureCode === FAILURE_CODES.CREDENTIAL_REQUIRED
        || (result?.incompleteReason && /\buncertain\b|outcome.?unknown/i.test(result.incompleteReason))) {
        reviewReason = 'Automatic recovery stopped because a blocker needs attention.';
        completionGaps = [...gaps, `Recovery task "${recoveryTask.id}" requires review: ${lastRecoveryIssue || 'unresolved blocker'}`];
        await agentRuntime.emitMonologue({
          agentRole: 'mission-director',
          thought: `Recovery cannot safely continue: ${lastRecoveryIssue || 'unresolved blocker'}`,
          text: failureCode === FAILURE_CODES.CREDENTIAL_REQUIRED ? 'Mission needs review: a required secret or authorization is missing.' : 'Mission stopped: recovery is blocked by an unresolved execution issue.',
          data: { decision: failureCode === FAILURE_CODES.CREDENTIAL_REQUIRED ? 'mission_needs_review' : 'mission_incomplete', gaps: completionGaps, failureCode },
        });
        break;
      }
      if (recoveryTask.status !== 'completed') {
        const review = await this.evaluateMissionCompletion(ctx, plan, outputs);
        await agentRuntime.emitMonologue({
          agentRole: 'mission-director',
          thought: `The mission recovery task "${recoveryTask.id}" did not complete successfully (status: ${recoveryTask.status}). Continuing auto-recovery with another approach rather than awaiting review.`,
          text: `Continuing auto-recovery: recovery task did not complete.`,
          data: { decision: 'mission_autorecover', gaps: review.gaps, reason: 'recovery_failed', recoveryTaskId: recoveryTask.id },
        });
        continue;
      }
    }
    if (completionVerified) {
      await agentRuntime.emitMonologue({
        agentRole: 'mission-director',
        thought: `Mission completion is verified: all completion criteria are met and no gaps remain. I am marking the mission status as completed.`,
        text: `Mission completed: all criteria met.`,
        data: { decision: 'mission_completed' },
      });
      outputs.status = 'completed';
      await new MissionCompletedListener().onMissionCompleted(
        workflowInput,
        plan,
        outputs.phases as MissionPhaseOutput[],
      );
    } else {
      // A completion-review verification failure is recoverable, not a
      // mission-incomplete: route it to a resumable review state instead of
      // aborting the mission.
      const terminal = completionVerificationFailed
        ? {
          status: 'awaiting_review' as const,
          reason: reviewReason || 'Mission completion could not be automatically verified; the mission needs review.',
          question: undefined as string | undefined,
        }
        : classifyMissionCompletionGaps(ctx.prompt, completionGaps, { failureCode: extractFailureCode(lastRecoveryIssue) });
      const userFacingGaps = completionGaps
        .map((gap) => sanitizeAgentMessage(gap, '').text)
        .filter(Boolean);
      outputs.status = terminal.status;
      outputs.gaps = userFacingGaps.length > 0 ? userFacingGaps : completionGaps;
      outputs.reason = sanitizeAgentMessage(reviewReason || terminal.reason, 'The mission needs review before it can finish.').text;
      if (terminal.status === 'awaiting_review' && terminal.question) {
        (outputs as any).question = sanitizeAgentMessage(terminal.question, 'The mission needs your review.').text;
      }
      await agentRuntime.emitMonologue({
        agentRole: 'mission-director',
        thought: terminal.status === 'awaiting_review'
          ? `Mission requires user attention before it can continue: ${terminal.reason}`
          : `Mission could not be completed automatically; remaining issues are agent-execution failures rather than user actions: ${(completionGaps.slice(0, 5).join('; ') || terminal.reason)}`,
        text: terminal.status === 'awaiting_review' ? 'Mission needs user review/input.' : 'Mission ended incomplete due to unresolved execution issues.',
        data: { decision: terminal.status === 'awaiting_review' ? 'mission_needs_review' : 'mission_incomplete', gaps: completionGaps, reason: outputs.reason },
      });
    }

    // Stop all mission agents when mission completes (success or incomplete)
    try {
      if (this.agentRuntime) {
        await this.agentRuntime.stopAllAgents();
      }
    } catch (err) {
      logger.warn({ missionId: ctx.missionId, err: err instanceof Error ? err.message : String(err) }, 'Failed to stop agents on mission completion');
    }

    MissionOrchestrator.unregister(ctx.missionId);
    return { plan, outputs, compensations };
    } catch (error) {
      if (error instanceof MissionUserInterruptionError) return error.result;
      if (activePlan && pendingInteraction) {
        logger.error(
          { missionId: ctx.missionId, taskId: pendingInteraction.taskId },
          'Mission stopped with a persisted pending user interaction',
        );
      }
      throw error;
    } finally {
      MissionOrchestrator.unregister(ctx.missionId);
    }
  }

  private async generatePlan(ctx: MissionContext): Promise<Plan> {
    if (!this.agentRuntime) {
      throw new Error(`Mission Agent Runtime is not initialized for mission ${ctx.missionId}`);
    }
    const missionPrompt = missionPromptWithMessages(ctx);
    const prompt = ctx.clarificationAnswers && ctx.clarificationAnswers.length > 0
      ? `${missionPrompt}\n\nClarification answers:\n${ctx.clarificationAnswers.map((a, i) => `${i + 1}. ${a}`).join('\n')}`
      : missionPrompt;
    return this.agentRuntime.generatePlan(prompt, ctx.metadata, async (progress) => {
      await this.reportPlannerProgress(ctx, progress);
    });
  }

  private async reportPlannerProgress(ctx: MissionContext, progress: PlannerProgress): Promise<void> {
    // The report repeats the request path and the attempt number, so the
    // numbers are masked to recognize an update that says the same thing.
    const key = `${progress.status}|${progress.reason.replace(/\d+/g, '#')}`;
    const now = Date.now();
    const last = this.lastPlannerProgress;
    if (
      last
      && last.key === key
      && now - last.at < PLANNER_PROGRESS_MIN_INTERVAL_MS
    ) {
      return;
    }
    this.lastPlannerProgress = { key, at: now };
    try {
      await ctx.broadcast({
        type: 'planner_progress',
        missionId: ctx.missionId,
        timestamp: now,
        data: {
          attempt: progress.attempt,
          status: progress.status,
          reason: progress.reason,
          transient: progress.transient,
          agentId: `agent-${ctx.missionId}-planner`,
          agentName: 'Mission Planner',
          agentRole: 'planner',
        },
      });
    } catch (err) {
      logger.warn(
        { missionId: ctx.missionId, err: err instanceof Error ? err.message : String(err) },
        'Failed to report planner progress',
      );
    }
  }

  private async persistPlan(ctx: MissionContext, plan: Plan): Promise<void> {
    const url = `${ctx.persistenceUrl}/api/artifacts/missions/${ctx.missionId}/plan`;
    const body = JSON.stringify(plan);
    try {
      logger.info({ missionId: ctx.missionId, url, bodyLength: body.length }, 'Persisting plan to artifacts service');
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const text = await res.text();
      logger.info({ missionId: ctx.missionId, status: res.status, responsePreview: text && text.length > 2000 ? text.slice(0, 2000) : text }, 'Persist plan response');
      if (!res.ok) {
        const err = new Error(`Persist plan failed: ${res.status} ${res.statusText} - ${text}`);
        if (isFatalServiceError(err) || res.status >= 500 || res.status === 503 || res.status === 504 || res.status === 429) {
          throw err;
        }
        logger.error({ missionId: ctx.missionId }, 'Non-fatal persistence failure, continuing');
        return;
      }
    } catch (err) {
      if (isFatalServiceError(err)) throw err;
      logger.error({ missionId: ctx.missionId, err: err instanceof Error ? err.message : String(err) }, 'Error persisting plan to artifacts');
      return;
    }
  }

  private async updatePhase(ctx: MissionContext, phaseId: string, update: Partial<Phase>): Promise<void> {
    const url = `${ctx.persistenceUrl}/api/artifacts/missions/${encodeURIComponent(ctx.missionId)}/phases/${encodeURIComponent(phaseId)}`;
    const body = JSON.stringify(update);
    try {
      logger.debug({ missionId: ctx.missionId, phaseId, url, bodyLength: body.length }, 'Updating phase in artifacts service');
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const text = await res.text();
      if (!res.ok) {
        const err = new Error(`Phase persistence failed (${res.status}): ${text.slice(0, 500)}`);
        if (isFatalServiceError(err) || res.status >= 500 || res.status === 503 || res.status === 504) {
          throw err;
        }
        logger.error({ missionId: ctx.missionId, phaseId }, 'Non-fatal phase persistence failure');
        return;
      }
    } catch (err) {
      if (isFatalServiceError(err)) throw err;
      logger.error({ missionId: ctx.missionId, phaseId, err: err instanceof Error ? err.message : String(err) }, 'Error updating phase');
      return;
    }
  }

  private async updateTask(ctx: MissionContext, phaseId: string, taskId: string, update: Partial<Task>): Promise<void> {
    const url = `${ctx.persistenceUrl}/api/artifacts/missions/${encodeURIComponent(ctx.missionId)}/tasks/${encodeURIComponent(taskId)}`;
    const body = JSON.stringify({ ...update, phaseId });
    try {
      logger.debug({ missionId: ctx.missionId, phaseId, taskId, url, bodyLength: body.length }, 'Updating task in artifacts service');
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const text = await res.text();
      if (!res.ok) {
        const err = new Error(`Task persistence failed (${res.status}): ${text.slice(0, 500)}`);
        if (isFatalServiceError(err) || res.status >= 500 || res.status === 503 || res.status === 504) {
          throw err;
        }
        logger.error({ missionId: ctx.missionId, phaseId, taskId }, 'Non-fatal task persistence failure');
        return;
      }
    } catch (err) {
      if (isFatalServiceError(err)) throw err;
      logger.error({ missionId: ctx.missionId, phaseId, taskId, err: err instanceof Error ? err.message : String(err) }, 'Error updating task');
      return;
    }
  }

  private async persistMissionStateOnInterruption(
    ctx: MissionContext,
    plan: Plan,
    outputs: any,
    pendingInteraction: any,
    startedAt: number,
  ): Promise<void> {
    const url = `${ctx.persistenceUrl}/api/artifacts/missions/${encodeURIComponent(ctx.missionId)}`;
    const state = {
      missionId: ctx.missionId,
      tenantId: ctx.tenantId || '',
      assistantId: ctx.assistantId || '',
      status: 'awaiting_review',
      controlState: 'running',
      currentStep: 1,
      totalSteps: 1,
      history: [
        {
          step: 0,
          status: 'awaiting_review',
          startedAt,
          completedAt: Date.now(),
        },
      ],
      input: {
        missionId: ctx.missionId,
        tenantId: ctx.tenantId || '',
        assistantId: ctx.assistantId || '',
        prompt: ctx.prompt,
        metadata: ctx.metadata,
        clarificationAnswers: ctx.clarificationAnswers,
        interactionResponse: ctx.interactionResponse,
        userMessages: ctx.userMessages,
      },
      output: {
        plan,
        outputs: {
          ...outputs,
          pendingInteraction,
        },
      },
      startedAt,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
      if (!res.ok) {
        const text = await res.text();
        logger.warn({ missionId: ctx.missionId, status: res.status, text: text.slice(0, 500) }, 'Failed to persist mission state on interruption');
      }
    } catch (err) {
      logger.warn({ missionId: ctx.missionId, err: err instanceof Error ? err.message : String(err) }, 'Error persisting mission state on interruption');
    }
  }

  async handleUserMessage(ctx: MissionContext, content: string): Promise<{ acknowledgement: string; response: string }> {
    (ctx.userMessages ||= []).push(content);
    if (!this.agentRuntime) {
      const rt = new MissionAgentRuntime({
        missionId: ctx.missionId,
        tenantId: ctx.tenantId || 'tenant-1',
        metadata: ctx.metadata,
        agentRuntimeUrl: ctx.agentRuntimeUrl,
        broadcast: ctx.broadcastAll,
      });
      this.agentRuntime = rt;
    }
    const agentRuntime = this.agentRuntime!;
    const directorIdentity = { agentId: '', agentName: 'Mission Director', agentRole: 'mission-director' };

    const directorSystemPrompt = [
      'You are the mission director: the conversational link between the user and the mission.',
      'You do not run tools or perform actions yourself. The mission\'s task agents create any required tools through the tool executor and carry out actions during task execution.',
      '',
      'Classify the user message and respond appropriately:',
      '1. If the user is ASKING A QUESTION (e.g. "what\'s the status?", "what have you done?", "why did X happen?"), answer it directly from the mission context provided in the task. Be specific and factual.',
      '2. If the user is PROVIDING A FACT OR VALUE (e.g. "send it to john@example.com", "the budget is $500"), acknowledge it, confirm it is recorded, and note it will be available to subsequent mission tasks.',
      '3. If the user is CHANGING THE GOAL OR SCOPE (e.g. "actually, also include a PDF", "change the recipient to jane"), acknowledge the change, explain what will be different, and note it will be incorporated into the mission plan.',
      '4. Only ask a clarifying question if an essential factual value is genuinely missing (e.g. an email address with no recipient) and cannot be reasonably inferred. If the mission asks agents to evaluate alternatives or recommend what is most likely to succeed, do not ask the user for preferences; have the agents decide based on the mission goals and evidence. Never ask the user to choose a tool, configure a provider, or perform setup.',
      '',
      'Never mention execution limits, action or tool "budgets", remaining actions, or claim that you are unable to create or use tools: that is an internal detail of your relay role and is not a mission-wide restriction.',
      '',
      'Return JSON {"acknowledgement":"...","response":"..."}. The response should directly address what the user asked or said.',
    ].join('\n');

    const agentId = await agentRuntime.getOrCreateAgent('mission-director', directorSystemPrompt);
    directorIdentity.agentId = agentId;

    // Build mission context so the director can answer questions directly
    const plan = this.currentPlan;
    const phaseSummary = plan?.phases
      ?.map((p) => `${p.name || p.id}: ${p.status || 'unknown'}`)
      .join('; ') || 'No plan loaded yet';
    const completedTaskCount = this.completedTaskSummaries.length;
    const totalTaskCount = plan?.phases?.reduce((sum, p) => sum + (p.tasks?.length || 0), 0) || 0;
    const recentMessages = (ctx.userMessages || []).slice(-5).join('\n');

    const taskPrompt = [
      `User message: ${content}`,
      '',
      `Mission goal: ${ctx.prompt}`,
      `Plan progress: ${completedTaskCount}/${totalTaskCount} tasks completed. Phases: ${phaseSummary}`,
      recentMessages ? `Recent conversation:\n${recentMessages}` : '',
    ].filter(Boolean).join('\n');

    let result: { output: string };
    try {
      result = await agentRuntime.executePromptTask(agentId, {
        taskId: `${ctx.missionId}:user-message:${Date.now()}`,
        type: 'user-message',
        prompt: taskPrompt,
        phaseId: 'user-message',
        context: { [ 'missionId' ]: ctx.missionId },
        executionPolicy: { ...DEFAULT_AGENT_EXECUTION_POLICY, maxActions: 0, maxCompletionTokens: 1024, maxCompletionTokensPerCall: 512, maxDelegations: 0 },
      });
    } catch (err) {
      await ctx.broadcast({ type: 'agent_error', missionId: ctx.missionId, timestamp: Date.now(), data: { error: err instanceof Error ? err.message : String(err), ...directorIdentity } });
      return { acknowledgement: 'Message received.', response: 'I received your message but could not process it right now.' };
    }
    let acknowledgement = 'Message received.';
    let response = result.output || 'I received your message.';
    try {
      const parsed = JSON.parse(result.output.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
      if (parsed.acknowledgement) acknowledgement = parsed.acknowledgement;
      if (parsed.response) response = parsed.response;
    } catch {}
    // The director is asked for a short plain-text reply; anything else (raw
    // tool manifests, execution receipts) is internal output, not conversation.
    if (!response.trim()) response = 'I received your message.';
    const acknowledgementText = sanitizeAgentMessage(acknowledgement, 'Message received.').text;
    const responseText = sanitizeAgentMessage(response, 'I received your message.').text;
    await ctx.broadcast({ type: 'agent_acknowledgement', missionId: ctx.missionId, timestamp: Date.now(), data: { content: acknowledgementText, ...directorIdentity } });
    await ctx.broadcast({ type: 'agent_response', missionId: ctx.missionId, timestamp: Date.now(), data: { content: responseText, ...directorIdentity } });
    return { acknowledgement: acknowledgementText, response: responseText };
  }

  async evaluateMissionCompletion(
    ctx: Pick<MissionContext, 'missionId' | 'prompt' | 'tenantId' | 'metadata' | 'agentRuntimeUrl' | 'userMessages'>,
    plan: Plan,
    outputs: {
      phases?: Array<{
        phaseId?: string;
        status?: string;
        tasks?: Array<{
          taskId?: string;
          status?: string;
          artifacts?: MissionArtifact[];
          output?: string;
        }>;
      }>;
    },
  ): Promise<{ satisfied: boolean; gaps: string[]; verificationFailed?: boolean }> {
    const phases = outputs?.phases || [];
    if (!plan.phases.length) {
      return { satisfied: false, gaps: ['The mission plan contains no phases.'] };
    }
    const malformedEvidenceGaps: string[] = [];
    const evidencePhases = phases.flatMap((phase) => {
      if (typeof phase.phaseId !== 'string') {
        malformedEvidenceGaps.push('An execution result is missing its phase ID.');
        return [];
      }
      const tasks = (phase.tasks || []).flatMap((task) => {
        if (typeof task.taskId !== 'string') {
          malformedEvidenceGaps.push(`A task result in phase "${phase.phaseId}" is missing its task ID.`);
          return [];
        }
        return [{
          taskId: task.taskId,
          status: task.status || 'unknown',
          artifacts: task.artifacts || [],
          output: task.output,
        }];
      });
      return [{ phaseId: phase.phaseId, status: phase.status || 'unknown', tasks }];
    });
    const evidenceGaps = [
      ...malformedEvidenceGaps,
      ...missionExecutionEvidenceGaps(plan, evidencePhases),
    ];
    if (evidenceGaps.length > 0) {
      logger.warn(
        { missionId: ctx.missionId, gaps: evidenceGaps },
        'Mission completion review refused because planned task evidence is incomplete',
      );
      return { satisfied: false, gaps: evidenceGaps };
    }

    const agentRuntime = this.agentRuntime || new MissionAgentRuntime({
      missionId: ctx.missionId,
      tenantId: ctx.tenantId || 'tenant-1',
      metadata: ctx.metadata,
      agentRuntimeUrl: ctx.agentRuntimeUrl,
    });
    const plannedTasks = new Map(plan.phases.flatMap((phase) =>
      phase.tasks.map((task) => [JSON.stringify([phase.id, task.id]), task] as const),
    ));
    const completedTaskSummaries: CompletedTaskSummary[] = phases.flatMap((phase, phaseIndex) =>
      (phase.tasks || []).map((task, taskIndex) => {
        const artifacts = task.artifacts || [];
        const taskId = task.taskId || `phase-${phaseIndex + 1}-task-${taskIndex + 1}`;
        return {
          taskId,
          status: task.status,
          output: task.output || '',
          artifactNames: artifacts.map((artifact) => artifact.name),
          artifacts,
          expectedArtifacts: plannedTasks.get(JSON.stringify([phase.phaseId, taskId]))?.expectedArtifacts || [],
          requiredActions: plannedTasks.get(JSON.stringify([phase.phaseId, taskId]))?.requiredActions || [],
          requiresExternalAction: plannedTasks.get(JSON.stringify([phase.phaseId, taskId]))?.requiresExternalAction,
        };
      }),
    );
    const review = await agentRuntime.reviewMissionCompletion(
      missionPromptWithMessages(ctx),
      plan.summary || '',
      completedTaskSummaries,
    );
    // The Mission Evaluator owns the completion-review decision; broadcast it
    // as an attributed monologue so the reasoning is visible in the UI.
    try {
      await agentRuntime.emitMonologue({
        agentRole: 'mission-evaluator',
        thought: review.satisfied
          ? `Mission completion review: I evaluated the observed task outputs and artifacts against the mission goal "${ctx.prompt.slice(0, 120)}" and found all requirements satisfied. The mission may complete.`
          : `Mission completion review: I evaluated the observed task outputs and artifacts against the mission goal "${ctx.prompt.slice(0, 120)}" and found ${review.gaps.length} unmet requirement(s): ${review.gaps.join('; ')}. The mission must not be marked complete.`,
        text: review.satisfied
          ? 'Mission completion review: all requirements satisfied.'
          : `Mission completion review: ${review.gaps.length} unmet requirement(s) found.`,
        kind: 'completion-review',
        data: { satisfied: review.satisfied, gaps: review.gaps },
      });
    } catch (err) {
      logger.warn({ missionId: ctx.missionId, err: err instanceof Error ? err.message : String(err) }, 'Failed to emit completion-review monologue');
    }
    if (!review.satisfied) {
      logger.warn(
        { missionId: ctx.missionId, gaps: review.gaps },
        'Mission completion review identified unmet requirements',
      );
    }
    return review;
  }
}