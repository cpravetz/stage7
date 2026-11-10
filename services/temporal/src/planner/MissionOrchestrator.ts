import {
  DEFAULT_AGENT_EXECUTION_POLICY,
  AgentExecutionPolicy,
  MissionArtifact,
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
} from '../agent/MissionAgentRuntime';
import { applyRuntimeTaskRequirements } from '../agent/TaskRequirements';
import {
  CompletedTaskSummary,
  createCompletedTaskSummary,
  MissionActivityCheckpoint,
  MissionPendingInteraction,
  MissionTaskCheckpoint,
  completedTaskIdsWithSummaries,
  isConfigurationBlocker,
  missionConfigurationQuestion,
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
  executionPolicy?: AgentExecutionPolicy;
  onCheckpoint?: (checkpoint: MissionActivityCheckpoint) => void;
  heartbeat?: () => void;
  controlCheckpoint?: () => Promise<void>;
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

    let plan = ctx.resumePlan || ctx.resumeCheckpoint?.plan || await this.generatePlan(ctx);
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
    plan.requiresClarification = false;
    plan.clarificationQuestions = [];
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
    let configurationRequestIndex = 0;
    const createConfigurationTask = (phase: Phase): Task => {
      let id = `${phase.id}-configuration-request-${++configurationRequestIndex}`;
      const taskIds = new Set(plan.phases.flatMap((candidate) => candidate.tasks.map((task) => task.id)));
      while (taskIds.has(id)) id = `${phase.id}-configuration-request-${++configurationRequestIndex}`;
      return {
        id,
        title: 'Provide required service configuration',
        description: 'Provide the configuration needed to continue using an authorized service.',
        agentRole: 'assistant',
        systemPrompt: `Continue the original mission after receiving the user's provider configuration: ${ctx.prompt}. Do not repeat successful or uncertain side effects.`,
        dependsOnTaskIds: phase.tasks.map((task) => task.id),
        expectedArtifacts: [],
        requiredActions: [],
        status: 'pending',
        artifacts: [],
      };
    };
    const pauseForConfiguration = async (
      phase: Phase,
      task: Task,
      phaseOutput: MissionPhaseOutput,
    ): Promise<never> => {
      const question = missionConfigurationQuestion(ctx.prompt);
      pendingInteraction = {
        kind: 'user_input',
        phaseId: phase.id,
        taskId: task.id,
        taskTitle: task.title,
        agentRole: task.agentRole,
        question,
        resumeCount: 0,
      };
      task.status = 'pending';
      task.output = question;
      phase.status = 'in_progress';
      phaseOutput.status = 'incomplete';
      if (!phaseOutput.tasks.some((phaseTask) => phaseTask.taskId === task.id)) {
        phaseOutput.tasks.push({
          taskId: task.id,
          status: 'pending',
          artifacts: task.artifacts || [],
          output: question,
        });
      } else {
        const phaseTask = phaseOutput.tasks.find((candidate) => candidate.taskId === task.id)!;
        phaseTask.status = 'pending';
        phaseTask.output = question;
      }
      if (!outputs.phases.includes(phaseOutput)) outputs.phases.push(phaseOutput);
      await this.updateTask(ctx, phase.id, task.id, { status: 'pending', output: question });
      await this.updatePhase(ctx, phase.id, { status: 'in_progress' });
      saveCheckpoint();
      await ctx.broadcast({
        type: 'question_asked',
        missionId: ctx.missionId,
        timestamp: Date.now(),
        data: {
          phaseId: phase.id,
          taskId: task.id,
          taskTitle: task.title,
          agentRole: task.agentRole,
          question,
        },
      });
      throw new MissionUserInterruptionError({
        plan,
        outputs: { ...outputs, status: 'awaiting_user_input', pendingInteraction },
        compensations,
      });
    };
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
              agentId: agentRuntime.getAgentIdForRole(task.agentRole),
              agentName: `${task.agentRole.replace(/\s+Agent$/i, '')} Agent`,
              agentRole: task.agentRole,
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
              !(receipt.toolId === '__create_tool' && receipt.outcome === 'permission_required'),
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
          const agentId = await agentRuntime.getOrCreateAgent(task.agentRole, task.systemPrompt);
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
              ? await agentRuntime.executeTask(...executionArgs, taskRetryGuidance, continuation, ctx.prompt)
              : continuation
                ? await agentRuntime.executeTask(...executionArgs, undefined, continuation, ctx.prompt)
                : await agentRuntime.executeTask(...executionArgs, undefined, undefined, ctx.prompt);
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
              ? await agentRuntime.executeTask(...executionArgs, retryGuidance, continuation, ctx.prompt)
              : await agentRuntime.executeTask(...executionArgs, retryGuidance, undefined, ctx.prompt);
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
              result = await agentRuntime.executeTask(...executionArgs, agentRecoveryGuidance, undefined, ctx.prompt);
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
            if (isConfigurationBlocker([error])) {
              await pauseForConfiguration(phase, task, phaseOutput);
              return;
            }
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
                agentId: agentRuntime.getAgentIdForRole(task.agentRole),
                agentName: `${task.agentRole.replace(/\s+Agent$/i, '')} Agent`,
                agentRole: task.agentRole,
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
              agentId: agentRuntime.getAgentIdForRole(task.agentRole),
              agentName: `${task.agentRole.replace(/\s+Agent$/i, '')} Agent`,
              agentRole: task.agentRole,
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
                  agentId: agentRuntime.getAgentIdForRole(pendingTask.agentRole),
                  agentName: `${pendingTask.agentRole.replace(/\s+Agent$/i, '')} Agent`,
                  agentRole: pendingTask.agentRole,
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
            logger.warn(
              { missionId: ctx.missionId, phaseId: phase.id, taskId: pendingInteraction.taskId },
              'Interrupted task is waiting on prerequisites; executing another ready task first',
            );
            task = readyTasks[0];
          }
        } else {
          try {
            task = readyTasks.length === 1
              ? readyTasks[0]!
              : await agentRuntime.selectNextTask(
                ctx.prompt,
                plan,
                phase,
                completedTaskIds,
                [...completedTaskSummaries.values()].slice(-10),
              );
          } catch (err) {
            if (isFatalServiceError(err)) throw err;
            logger.error({ missionId: ctx.missionId, phaseId: phase.id, err: err instanceof Error ? err.message : String(err) }, 'Task selection failed');
            task = readyTasks[0];
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
                    agentId: agentRuntime.getAgentIdForRole(pendingTask.agentRole),
                    agentName: `${pendingTask.agentRole.replace(/\s+Agent$/i, '')} Agent`,
                    agentRole: pendingTask.agentRole,
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
              agentId: agentRuntime.getAgentIdForRole(task.agentRole),
              agentName: `${task.agentRole.replace(/\s+Agent$/i, '')} Agent`,
              agentRole: task.agentRole,
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
              ctx.prompt,
              plan,
              phase,
              [...completedTaskSummaries.values()],
              reviewIndex,
            );
            const applied = applyPhaseReview(plan, phase.id, review);
            plan = applied.plan;
                  activePlan = plan;
            phase = applied.phase;
            if (applied.satisfied) {
              phaseReviewSatisfied = true;
              break;
            }
            const reviewEvidence = [
              ...applied.gaps,
              ...[...completedTaskSummaries.values()].map((summary) => summary.output),
            ];
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
            if (isConfigurationBlocker(reviewEvidence) && noProgressCount >= 1) {
              let awaitingTask = applied.amendment?.status === 'pending'
                ? applied.amendment
                : phase.tasks.find((candidate) => candidate.status === 'pending');
              if (!awaitingTask) {
                awaitingTask = createConfigurationTask(phase);
                phase.tasks.push(awaitingTask);
                plan.phases = plan.phases.map((candidate) => candidate.id === phase.id ? phase : candidate);
              }
              await pauseForConfiguration(phase, awaitingTask, phaseOutput);
            }
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
              applied.amendment.systemPrompt = `${applied.amendment.systemPrompt}
${noProgressGuidance}`;
              plan = { ...plan, phases: plan.phases.map((p) => p.id === phase.id ? { ...phase, tasks: [...phase.tasks] } : p) };
            }
            if (!applied.amendment) {
              logger.error({ missionId: ctx.missionId, phaseId: phase.id, gaps: applied.gaps }, 'Mission phase remains incomplete and reviewer provided no actionable follow-up task');
              const amendmentIndex = phase.tasks.filter((t: any) => t.id.startsWith(`${phase.id}-amendment-`)).length + 1;
              const amendmentTask: Task = {
                id: `${phase.id}-amendment-${amendmentIndex}`,
                title: `Address phase gaps (review ${reviewIndex})`,
                description: `Address remaining gaps: ${(applied.gaps || []).join('; ') || 'unspecified gaps'}`,
                agentRole: 'engineer',
                systemPrompt: `Resolve the following gaps for phase ${phase.name}: ${(applied.gaps || []).join('; ')}. Use available context and produce concrete artifacts.${noProgressGuidance}`,
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
                  agentId: agentRuntime.getAgentIdForRole('phase-reviewer'),
                  agentName: 'Phase Reviewer Agent',
                  agentRole: 'phase-reviewer',
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
                agentId: agentRuntime.getAgentIdForRole('phase-reviewer'),
                agentName: 'Phase Reviewer Agent',
                agentRole: 'phase-reviewer',
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
          await this.updatePhase(ctx, phase.id, { status: 'rejected', rejectionReason: decision.reason });
          phase.status = 'rejected';
          phase.rejectionReason = decision.reason;
          await ctx.broadcast({ type: 'approval_rejected', missionId: ctx.missionId, timestamp: Date.now(), data: { phaseId: phase.id, reason: decision.reason } });
          return { plan, outputs: { ...outputs, status: 'rejected_at_phase', phaseId: phase.id, reason: decision.reason }, compensations };
        }
        await this.updatePhase(ctx, phase.id, { status: 'approved', approvedAt: Date.now(), approvedBy: 'user' });
        phase.status = 'approved';
        phase.approvedBy = 'user';
        await ctx.broadcast({ type: 'approval_approved', missionId: ctx.missionId, timestamp: Date.now(), data: { phaseId: phase.id } });
      } else {
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
      const recoveryEvidence = [
        ...gaps,
        ...allEvidenceTasks.map((task) => task.output || ''),
      ];
      const recoveryPhase = plan.phases.find((phase) =>
        gaps.some((gap) =>
          gap.includes(phase.id)
          || gap.includes(phase.name)
          || phase.tasks.some((task) => gap.includes(task.id)),
        ),
      ) || plan.phases.at(-1);
      if (!recoveryPhase) {
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

      if (isConfigurationBlocker(recoveryEvidence) && completionNoProgress >= 1) {
        const requestTask = createConfigurationTask(recoveryPhase);
        recoveryPhase.tasks.push(requestTask);
        plan.phases = plan.phases.map((candidate) => candidate.id === recoveryPhase.id ? recoveryPhase : candidate);
        await pauseForConfiguration(recoveryPhase, requestTask, phaseOutput);
      }
      if (!madeProgress && completionNoProgress >= MAX_NO_PROGRESS_RECOVERY_ATTEMPTS) {
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
      const recoveryTask: Task = {
        id: taskId,
        title: `Resolve mission completion gaps (attempt ${recoveryIndex})`,
        description: `Address the remaining mission completion gaps: ${gaps.join('; ')}`,
        agentRole: 'assistant',
        systemPrompt: `Resolve the mission completion gaps below for the mission goal "${ctx.prompt}" and phase "${recoveryPhase.name}". Use the recorded outputs from tasks ${taskIds.join(', ') || 'none'} as authoritative context. Produce any missing user deliverables named ${expectedArtifacts.join(', ') || 'by the gaps'} and return concrete evidence that the mission outcome is satisfied. Never create a receipt or evidence document to stand in for an action; actual tool results are recorded internally. Check the live tool catalog, execute a suitable tool, and use capability resolution to find or create one when permitted. If required credentials or configuration are missing, ask the user to provide them through the secure tool configuration form and wait. If required input from an earlier task is missing, ask that task's Agent to provide the artifact or rerun the source task. Do not repeat successfully completed or uncertain side effects; use another authorized approach if one path is blocked.\n\nGaps:\n${gaps.join('\n')}`,
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
          agentId: agentRuntime.getAgentIdForRole('assistant'),
          agentName: 'Mission Recovery Agent',
          agentRole: 'assistant',
        },
      });

      const startedAt = Date.now();
      await this.updateTask(ctx, recoveryPhase.id, recoveryTask.id, { status: 'in_progress', startedAt });
      let result: TaskExecutionResult | undefined;
      let failure = '';
      try {
        const agentId = await agentRuntime.getOrCreateAgent('assistant', recoveryTask.systemPrompt);
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
          result = await agentRuntime.executeTask(...args, undefined, undefined, ctx.prompt);
        } catch (error) {
          if (isFatalServiceError(error)) throw error;
          const firstError = error instanceof Error ? error.message : String(error);
          result = await agentRuntime.executeTask(
            ...args,
            `The previous attempt failed: ${firstError}. Continue from recorded outputs, do not repeat successful or uncertain side effects, and use another authorized approach.`,
            undefined,
            ctx.prompt,
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
          agentId: agentRuntime.getAgentIdForRole('assistant'),
          agentName: 'Mission Recovery Agent',
          agentRole: 'assistant',
          ...(result
            ? { artifacts: result.artifacts, output: result.output.slice(0, 4_000), tokensUsed: result.tokensUsed, ...(result.incompleteReason ? { error: result.incompleteReason } : {}) }
            : { error: failure }),
        },
      });
      await ctx.controlCheckpoint?.();
      if (recoveryTask.status !== 'completed') {
        const review = await this.evaluateMissionCompletion(ctx, plan, outputs);
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
        return {
          plan,
          outputs: { ...outputs, status: 'awaiting_review', gaps: finalCompletionReview.gaps },
          compensations,
        };
      }
    }
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
    const prompt = ctx.clarificationAnswers && ctx.clarificationAnswers.length > 0
      ? `${ctx.prompt}\n\nClarification answers:\n${ctx.clarificationAnswers.map((a, i) => `${i + 1}. ${a}`).join('\n')}`
      : ctx.prompt;
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
    const agentId = await agentRuntime.getOrCreateAgent('mission-director', 'You are the mission primary agent. Process user messages during a mission: understand intent, forward to another agent if needed by describing the delegation, formulate a brief acknowledgement, and provide a real helpful response. Return JSON {"acknowledgement":"...","response":"...","forwardTo":"..."}.');
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
      await ctx.broadcast({ type: 'agent_error', missionId: ctx.missionId, timestamp: Date.now(), data: { error: err instanceof Error ? err.message : String(err) } });
      return { acknowledgement: 'Message received.', response: 'I received your message but could not process it right now.' };
    }
    let acknowledgement = 'Message received.';
    let response = result.output || 'I received your message.';
    let forwardTo: string | undefined;
    try {
      const parsed = JSON.parse(result.output.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
      if (parsed.acknowledgement) acknowledgement = parsed.acknowledgement;
      if (parsed.response) response = parsed.response;
      if (parsed.forwardTo) forwardTo = String(parsed.forwardTo);
    } catch {}
    if (!response.trim()) response = 'I received your message.';
    if (forwardTo) {
      await ctx.broadcast({ type: 'agent_delegation', missionId: ctx.missionId, timestamp: Date.now(), data: { from: 'mission-director', to: forwardTo, content } });
    }
    await ctx.broadcast({ type: 'agent_acknowledgement', missionId: ctx.missionId, timestamp: Date.now(), data: { content: acknowledgement } });
    await ctx.broadcast({ type: 'agent_response', missionId: ctx.missionId, timestamp: Date.now(), data: { content: response } });
    return { acknowledgement, response };
  }

  async evaluateMissionCompletion(
    ctx: Pick<MissionContext, 'missionId' | 'prompt' | 'tenantId' | 'metadata' | 'agentRuntimeUrl'>,
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
      ctx.prompt,
      plan.summary || '',
      completedTaskSummaries,
    );
    if (!review.satisfied) {
      logger.warn(
        { missionId: ctx.missionId, gaps: review.gaps },
        'Mission completion review identified unmet requirements',
      );
    }
    return review;
  }
}