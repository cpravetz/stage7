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
  TaskExecutionResult,
} from '../agent/MissionAgentRuntime';
import {
  CompletedTaskSummary,
  createCompletedTaskSummary,
  MissionActivityCheckpoint,
  MissionPendingInteraction,
  MissionTaskCheckpoint,
  missionExecutionEvidenceGaps,
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
            ),
          );
        }
      }
    }
    const completedPhases = new Set(ctx.resumeCheckpoint?.completedPhases || []);
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

    if (plan.requiresClarification && plan.clarificationQuestions.length > 0) {
      await ctx.broadcast({
        type: 'clarification_needed',
        missionId: ctx.missionId,
        timestamp: Date.now(),
        data: { questions: plan.clarificationQuestions },
      });
      return { plan, outputs: { status: 'awaiting_clarification', questions: plan.clarificationQuestions }, compensations: [] };
    }

    const outputs: any = { phases: [] };
    for (let phaseIndex = 0; phaseIndex < plan.phases.length; phaseIndex++) {
      let phase = plan.phases[phaseIndex]!;
      const phaseIsComplete = completedPhases.has(phase.id);
      if (phaseIsComplete && phase.tasks.some((task) =>
        !completedTasks.has(JSON.stringify([phase.id, task.id])),
      )) {
        throw new Error(`Checkpoint marks phase ${phase.id} complete but omits a task result`);
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
            ctx.executionPolicy || DEFAULT_AGENT_EXECUTION_POLICY,
            [...completedTaskSummaries.values()],
          ];
          const taskRetryGuidance = savedTask ? ctx.retryGuidance : undefined;
          try {
            result = taskRetryGuidance
              ? await agentRuntime.executeTask(...executionArgs, taskRetryGuidance, continuation)
              : continuation
                ? await agentRuntime.executeTask(...executionArgs, undefined, continuation)
                : await agentRuntime.executeTask(...executionArgs);
          } catch (err) {
            if (savedTask) throw err;
            const firstError = err instanceof Error ? err.message : String(err);
            logger.warn(
              { missionId: ctx.missionId, phaseId: phase.id, taskId: task.id, error: firstError },
              'Retrying failed mission task from its persisted safe checkpoint',
            );
            const retryGuidance = [
              `The previous attempt failed: ${firstError}`,
              'Continue from the persisted safe checkpoint and action receipts.',
              'Do not repeat external actions whose outcome is already recorded or uncertain.',
            ].join(' ');
            result = continuation
              ? await agentRuntime.executeTask(...executionArgs, retryGuidance, continuation)
              : await agentRuntime.executeTask(...executionArgs, retryGuidance);
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
              createCompletedTaskSummary(task.id, task.output || error, task.artifacts || [], task.requiredActions),
            );
            return;
          }
          throw err;
        }

        if (result.interruption) {
          const interruption: MissionPendingInteraction = {
            ...result.interruption,
            phaseId: phase.id,
            taskId: task.id,
            taskTitle: task.title,
            agentRole: task.agentRole,
            actionReceipts: result.actionReceipts || [],
            resumeCount: previousInteraction?.phaseId === phase.id && previousInteraction.taskId === task.id
              ? previousInteraction.resumeCount + 1
              : 0,
          };
          pendingInteraction = interruption;
          task.status = 'pending';
          task.output = '';
          phaseOutput.status = 'pending';
          phaseOutput.tasks.push({ taskId: task.id, status: 'pending', artifacts: [] });
          outputs.phases.push(phaseOutput);
          outputs.status = interruption.kind === 'user_input' ? 'awaiting_user_input' : 'awaiting_permission';
          outputs.pendingInteraction = interruption;
          await this.updateTask(ctx, phase.id, task.id, { status: 'pending', output: '' });
          await this.persistPlan(ctx, plan);
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
              ...(interruption.permission ? { permission: interruption.permission } : {}),
            },
          });
          throw new MissionUserInterruptionError({ plan, outputs, compensations });
        }

        if (continuation) pendingInteraction = undefined;
        if (!savedTask) {
          completedTasks.set(taskKey, { phaseId: phase.id, taskId: task.id });
          saveCheckpoint();
        }

        const completedAt = Date.now();
        await this.updateTask(ctx, phase.id, task.id, {
          status: 'completed',
          completedAt,
          output: result.output,
          artifacts: result.artifacts,
        });
        task.status = 'completed';
        task.completedAt = completedAt;
        task.output = result.output;
        task.artifacts = result.artifacts;
        if (!savedTask) {
          await ctx.broadcast({
            type: 'task_completed',
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
              tokensUsed: result.tokensUsed,
            },
          });
        }
        phaseOutput.tasks.push({ taskId: task.id, status: 'completed', artifacts: result.artifacts });
        compensations.push({ phaseId: phase.id, action: `revert-phase-${phase.id}` });
        completedInPhase.add(task.id);
        completedTaskSummaries.set(
          task.id,
          createCompletedTaskSummary(task.id, result.output, result.artifacts, task.requiredActions),
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
                createCompletedTaskSummary(pendingTask.id, pendingTask.output, pendingTask.artifacts || [], pendingTask.requiredActions),
              );
            }
          }
          break;
        }
        let task: Task | undefined;
        if (pendingInteraction?.phaseId === phase.id) {
          task = readyTasks.find((candidate) => candidate.id === pendingInteraction?.taskId);
          if (!task) {
            throw new Error(`Interrupted task ${pendingInteraction.taskId} is no longer dependency-ready`);
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
                  createCompletedTaskSummary(pendingTask.id, pendingTask.output, pendingTask.artifacts || [], pendingTask.requiredActions),
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
            createCompletedTaskSummary(task.id, task.output, task.artifacts || [], task.requiredActions),
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
        for (let reviewIndex = existingAmendmentCount + 1; reviewIndex <= 10; reviewIndex++) {
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
              phaseReviewSatisfied = phaseOutput.tasks.every((task: any) => task.status === 'completed');
              break;
            }
            if (!applied.amendment) {
              logger.error({ missionId: ctx.missionId, phaseId: phase.id, gaps: applied.gaps }, 'Mission phase remains incomplete and reviewer provided no actionable follow-up task');
              const amendmentIndex = phase.tasks.filter((t: any) => t.id.startsWith(`${phase.id}-amendment-`)).length + 1;
              const amendmentTask: Task = {
                id: `${phase.id}-amendment-${amendmentIndex}`,
                title: `Address phase gaps (review ${reviewIndex})`,
                description: `Address remaining gaps: ${(applied.gaps || []).join('; ') || 'unspecified gaps'}`,
                agentRole: 'engineer',
                systemPrompt: `Resolve the following gaps for phase ${phase.name}: ${(applied.gaps || []).join('; ')}. Use available context and produce concrete artifacts.`,
                dependsOnTaskIds: phase.tasks.map((t: any) => t.id),
                expectedArtifacts: [],
                requiredActions: [],
                status: 'pending',
                artifacts: [],
              } as Task;
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
            break;
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
    const completionReview = await this.evaluateMissionCompletion(ctx, plan, outputs);
    if (completionReview.satisfied) {
      outputs.status = 'completed';
      await new MissionCompletedListener().onMissionCompleted(
        workflowInput,
        plan,
        outputs.phases as MissionPhaseOutput[],
      );
    } else {
      outputs.status = 'incomplete';
      outputs.gaps = completionReview.gaps;
      await ctx.broadcast({
        type: 'mission_incomplete',
        missionId: ctx.missionId,
        timestamp: Date.now(),
        data: {
          reason: completionReview.gaps.join('; '),
          gaps: completionReview.gaps,
        },
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