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
import {
  CompletedTaskSummary,
  createCompletedTaskSummary,
  MissionActivityCheckpoint,
  MissionPendingInteraction,
  MissionTaskCheckpoint,
  completedTaskIdsWithSummaries,
  missionExecutionEvidenceGaps,
  recoveryGapFingerprint,
  recoveryProgressSignature,
  hasRecoveryProgress,
  MAX_PHASE_RECOVERY_ROUNDS_SAFETY,
  MAX_MISSION_RECOVERY_ROUNDS_SAFETY,
  MAX_NO_PROGRESS_RECOVERY_ATTEMPTS,
} from '../types/workflow';
import { PlannerProgress } from './MissionPlanner';
import type { MissionPhaseOutput } from '../activities/missionWorkflowActivities';
import type { WorkflowInput } from '../types/workflow';
import { MissionCompletedListener } from '../listeners/MissionCompletedListener';
import { MissionStageCompletedListener } from '../listeners/MissionStageCompletedListener';

function isFatalServiceError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message || String(error);
  const lower = message.toLowerCase();
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
const MAX_MISSION_RECOVERY_ROUNDS = MAX_MISSION_RECOVERY_ROUNDS_SAFETY;

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
    if (pendingInteraction && ctx.resumeCheckpoint?.plan) {
      // The pending task and its receipts must survive until its response is consumed.
      plan = ctx.resumeCheckpoint.plan;
      planSource = 'loaded';
    } else {
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

    const sharedMissionAgentId = await agentRuntime.getOrCreateAgent('assistant', `You are a mission execution agent. Complete each assigned task sequentially to achieve the mission goal: ${ctx.prompt}. Do not invent missing information. Try authorized alternatives first; if a specific required value is unavailable and no safe alternative can complete the outcome, ask one focused question for that value.`);

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
          agentRole: 'assistant',
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
          const taskRetryGuidance = savedTask ? ctx.retryGuidance : undefined;
          try {
            result = taskRetryGuidance
              ? await agentRuntime.executeTask(...executionArgs, taskRetryGuidance, continuation, ctx.prompt, ctx.userMessages)
              : continuation
                ? await agentRuntime.executeTask(...executionArgs, undefined, continuation, ctx.prompt, ctx.userMessages)
                : await agentRuntime.executeTask(...executionArgs, undefined, undefined, ctx.prompt, ctx.userMessages);
          } catch (err) {
            if (savedTask) throw err;
            const firstError = err instanceof Error ? err.message : String(err);
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
          if (result.incompleteReason && !savedTask) {
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
          saveCheckpoint();
        }

        const completedAt = Date.now();
        const taskStatus = result.incompleteReason ? 'incomplete' : 'completed';
        await this.updateTask(ctx, phase.id, task.id, {
          status: taskStatus,
          completedAt,
          output: result.output,
          artifacts: result.artifacts,
        });
        task.status = taskStatus;
        task.completedAt = completedAt;
        task.output = result.output;
        task.artifacts = result.artifacts;
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
              output: result.output.slice(0, 4_000),
              ...(result.incompleteReason ? { error: result.incompleteReason } : {}),
              tokensUsed: result.tokensUsed,
            },
          });
        }
        phaseOutput.tasks.push({ taskId: task.id, status: taskStatus, artifacts: result.artifacts, output: result.output });
        compensations.push({ phaseId: phase.id, action: `revert-phase-${phase.id}` });
        completedInPhase.add(task.id);
        completedTaskSummaries.set(
          task.id,
          createCompletedTaskSummary(task.id, result.output, result.artifacts, task.requiredActions, task.requiresExternalAction),
        );
        ctx.heartbeat?.();
      };

      for (const task of phase.tasks) {
        const savedTask = completedTasks.get(JSON.stringify([phase.id, task.id]));
        if (savedTask) await executeTask(task, savedTask);
      }

      const executePendingTasks = async () => {
      while (completedInPhase.size < phase.tasks.length) {
        await ctx.controlCheckpoint?.();
        const completedTaskIds = [...completedTasks.values()].map((task) => task.taskId);
        const pendingTasks = phase.tasks.filter((task) => !completedInPhase.has(task.id));
        const readyTasks = phase.tasks.filter((task) =>
          !completedInPhase.has(task.id)
          && (task.dependsOnTaskIds || []).every((dependencyId) => completedTaskIds.includes(dependencyId)),
        );
        if (readyTasks.length === 0) {
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
        try {
          await executeTask(task, undefined);
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
        }
      }
      };

      await executePendingTasks();
      await ctx.controlCheckpoint?.();
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
            const review = await agentRuntime.reviewPhase(
              missionPromptWithMessages(ctx),
              plan,
              phase,
              [...completedTaskSummaries.values()],
              reviewIndex,
            );
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
            phase = applied.phase;
            if (applied.satisfied) {
              phaseReviewSatisfied = true;
              break;
            }
            const reviewSignature = recoveryProgressSignature({
              gaps: applied.gaps,
              completedTaskIds: phase.tasks.filter((t) => t.status === 'completed').map((t) => t.id),
              completedTaskStatuses: phase.tasks.map((t) => `${t.id}:${t.status}`),
              artifactNames: phase.tasks.flatMap((t) => (t.artifacts || []).map((a) => a.name)),
              outputs: [...completedTaskSummaries.values()].map((s) => s.output),
            });
            const madeProgress = hasRecoveryProgress(lastReviewSignature, reviewSignature);
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
                agentRole: 'assistant',
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
                  gaps: applied.gaps,
                  task: amendmentTask,
                  plan,
                  agentId: agentRuntime.getAgentIdForRole('mission-director'),
                  agentName: 'Mission Director',
                  agentRole: 'mission-director',
                },
              });
              await executePendingTasks();
              await ctx.controlCheckpoint?.();
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
                gaps: applied.gaps,
                task: applied.amendment,
                plan,
                agentId: agentRuntime.getAgentIdForRole('mission-director'),
                agentName: 'Mission Director',
                agentRole: 'mission-director',
              },
            });
            await executePendingTasks();
            await ctx.controlCheckpoint?.();
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
    for (let recoveryIndex = 1; recoveryIndex <= MAX_MISSION_RECOVERY_ROUNDS; recoveryIndex++) {
      const completionReview = await this.evaluateMissionCompletion(ctx, plan, outputs);
      if (completionReview.satisfied) {
        completionVerified = true;
        break;
      }

      const gaps = completionReview.gaps.length
        ? completionReview.gaps
        : ['Mission completion has not been verified from the recorded task evidence.'];
      const allEvidenceTasks = (outputs.phases as MissionPhaseOutput[]).flatMap((output) => output.tasks);
      const completionSignature = recoveryProgressSignature({
        gaps,
        completedTaskIds: allEvidenceTasks.filter((t) => t.status === 'completed').map((t) => t.taskId),
        completedTaskStatuses: allEvidenceTasks.map((t) => `${t.taskId}:${t.status}`),
        artifactNames: allEvidenceTasks.flatMap((t) => (t.artifacts || []).map((a) => a.name)),
        outputs: allEvidenceTasks.map((t) => t.output || ''),
      });
      const madeProgress = hasRecoveryProgress(lastCompletionSignature, completionSignature);
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
        await agentRuntime.emitMonologue({
          agentRole: 'mission-director',
          thought: `Mission completion could not be routed to a recovery phase: no phase matched the unmet requirements (${gaps.join('; ')}) and there is no fallback phase. I am returning the mission with status awaiting_review so the gaps can be reviewed rather than falsely marking the mission complete.`,
          text: `Mission awaiting review: no recovery phase for unmet requirements.`,
          data: { decision: 'mission_awaiting_review', gaps, reason: 'no_recovery_phase' },
        });
        return {
          plan,
          outputs: {
            ...outputs,
            status: 'awaiting_review',
            gaps,
          },
          compensations,
        };
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

      if (!madeProgress && completionNoProgress >= MAX_NO_PROGRESS_RECOVERY_ATTEMPTS) {
        await agentRuntime.emitMonologue({
          agentRole: 'mission-director',
          thought: `Mission completion recovery reached the safety ceiling (${MAX_NO_PROGRESS_RECOVERY_ATTEMPTS} attempts with no observable progress) for gaps: ${gaps.join('; ')}. I am returning the mission with status awaiting_review rather than continuing to spin; these gaps require user or backend attention.`,
          text: `Mission awaiting review: recovery safety ceiling reached.`,
          data: { decision: 'mission_awaiting_review', gaps, reason: 'no_progress_ceiling' },
        });
        logger.error(
          { missionId: ctx.missionId, gaps, completionNoProgress },
          'Mission completion recovery made no observable progress after approach changes; pausing for review (safety ceiling)',
        );
        return {
          plan,
          outputs: { ...outputs, status: 'awaiting_review', gaps },
          compensations,
        };
      }
      const noProgressGuidance = !madeProgress
        ? ' Previous attempts made no observable progress on the same gaps; use a different authorized approach and do not repeat the same recovery steps. If a required value or authorization is missing, ask the user for it and wait.'
        : '';

      const availableArtifacts = new Set(phaseOutput.tasks.flatMap((task) =>
        task.artifacts.map((artifact) => artifact.name.toLocaleLowerCase()),
      ));
      const expectedArtifacts = [...new Set(recoveryPhase.tasks.flatMap((task) => task.expectedArtifacts || []))]
        .filter((name) => !availableArtifacts.has(name.toLocaleLowerCase()));
      const taskIds = completedTaskIdsWithSummaries(
        recoveryPhase.tasks.map((task) => task.id),
        completedTaskSummaries.values(),
      );
      let taskId = `${recoveryPhase.id}-mission-recovery-${recoveryIndex}`;
      const existingTaskIds = new Set(plan.phases.flatMap((phase) => phase.tasks.map((task) => task.id)));
      while (existingTaskIds.has(taskId)) taskId = `${taskId}-${recoveryIndex}`;
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
        description: `Address the remaining mission completion gaps: ${gaps.join('; ')}`,
        agentRole: 'assistant',
        systemPrompt: `Resolve the mission completion gaps below for the mission goal "${ctx.prompt}" and phase "${recoveryPhase.name}". Use the recorded outputs from tasks ${taskIds.join(', ') || 'none'} as authoritative context. Focus only on accomplishing the requested mission outcome and return concrete evidence that the mission outcome is satisfied. Produce only deliverable files explicitly required by the mission goal${expectedArtifacts.length ? ` (${expectedArtifacts.join(', ')})` : ''}; if no such deliverables were requested, do not create design documents, plans, or substitute artifacts. Never create a receipt or evidence document to stand in for an action; actual tool results are recorded internally. Check the live tool catalog, execute a suitable tool, and use capability resolution to find or create one when permitted. If required credentials or configuration are missing, ask the user to provide them through the secure tool configuration form and wait. If required input from an earlier task is missing, ask that task's Agent to provide the needed result or rerun the source task. Do not repeat successfully completed or uncertain side effects; use another authorized approach if one path is blocked. If an execution or system error occurred, treat it as a blocker to resolve or report accurately, not as a request to produce unrelated documentation.${noProgressGuidance}\n\nGaps:\n${gaps.join('\n')}`,
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
          gaps,
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
          if (isFatalServiceError(error)) throw error;
          const firstError = error instanceof Error ? error.message : String(error);
          result = await agentRuntime.executeTask(
            ...args,
            `The previous attempt failed: ${firstError}. Continue from recorded outputs, do not repeat successful or uncertain side effects, and use another authorized approach.`,
            undefined,
            ctx.prompt,
            ctx.userMessages,
          );
        };
      } catch (error) {
        if (isFatalServiceError(error)) throw error;
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
            ...(interruption.credentialRequest ? { credentialRequest: interruption.credentialRequest } : {}),
            ...(interruption.requestId ? { requestId: interruption.requestId } : {}),
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
            ? { artifacts: result.artifacts, output: result.output.slice(0, 4_000), tokensUsed: result.tokensUsed, ...(result.incompleteReason ? { error: result.incompleteReason } : {}) }
            : { error: failure }),
        },
      });
      await ctx.controlCheckpoint?.();
      if (recoveryTask.status !== 'completed') {
        const review = await this.evaluateMissionCompletion(ctx, plan, outputs);
        await agentRuntime.emitMonologue({
          agentRole: 'mission-director',
          thought: `The mission recovery task "${recoveryTask.id}" did not complete successfully (status: ${recoveryTask.status}). The final completion review found ${review.gaps.length} unmet requirement(s): ${review.gaps.join('; ')}. I am returning the mission with status awaiting_review because recovery did not resolve the completion gaps.`,
          text: `Mission awaiting review: recovery task did not complete.`,
          data: { decision: 'mission_awaiting_review', gaps: review.gaps, reason: 'recovery_failed', recoveryTaskId: recoveryTask.id },
        });
        return {
          plan,
          outputs: {
            ...outputs,
            status: 'awaiting_review',
            gaps: review.gaps.length ? review.gaps : ['Mission recovery did not complete successfully.'],
          },
          compensations,
        };
      }
    }

    if (!completionVerified) {
      const finalCompletionReview = await this.evaluateMissionCompletion(ctx, plan, outputs);
      if (!finalCompletionReview.satisfied) {
        await agentRuntime.emitMonologue({
          agentRole: 'mission-director',
          thought: `The final mission completion review is not satisfied: ${finalCompletionReview.gaps.length} unmet requirement(s) remain: ${finalCompletionReview.gaps.join('; ')}. I am returning the mission with status awaiting_review rather than marking it complete.`,
          text: `Mission awaiting review: final completion review not satisfied.`,
          data: { decision: 'mission_awaiting_review', gaps: finalCompletionReview.gaps, reason: 'final_review_not_satisfied' },
        });
        return {
          plan,
          outputs: { ...outputs, status: 'awaiting_review', gaps: finalCompletionReview.gaps },
          compensations,
        };
      }
    }
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

  /**
   * Shares the planner's progress with the user. A planning run can take a
   * long time while a provider is slow, and a silent mission is
   * indistinguishable from a stalled one.
   */
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
    const directorAgentId = agentRuntime.getAgentIdForRole('mission-director');
    const directorIdentity = { agentId: directorAgentId, agentName: 'Mission Director', agentRole: 'mission-director' };
    const agentId = await agentRuntime.getOrCreateAgent('mission-director', 'You are the mission primary agent. Process user messages during a mission. The message is available to subsequent mission tasks. Acknowledge it without claiming to have forwarded it to an agent or completed an action. Return JSON {"acknowledgement":"...","response":"..."}.');
    let result: { output: string };
    try {
      result = await agentRuntime.executePromptTask(agentId, {
        taskId: `${ctx.missionId}:user-message:${Date.now()}`,
        type: 'user-message',
        prompt: `User message during mission: ${content}\n\nMission goal: ${ctx.prompt}\n\nProcess and respond.`,
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
  ): Promise<{ satisfied: boolean; gaps: string[] }> {
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