import {
  DEFAULT_AGENT_EXECUTION_POLICY,
  AgentExecutionPolicy,
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
  MissionTaskCheckpoint,
} from '../types/workflow';
import { PlannerProgress } from './MissionPlanner';

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

export interface MissionContext {
  missionId: string;
  prompt: string;
  tenantId?: string;
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
  executionPolicy?: AgentExecutionPolicy;
  onCheckpoint?: (checkpoint: MissionActivityCheckpoint) => void;
  heartbeat?: () => void;
  controlCheckpoint?: () => Promise<void>;
}

export class MissionOrchestrator {
  private agentRuntime: MissionAgentRuntime | null = null;
  private lastPlannerProgress: { key: string; at: number } | null = null;

  async run(ctx: MissionContext): Promise<{ plan: Plan; outputs: any; compensations: Array<{ phaseId: string; action: string }> }> {
    const compensations: Array<{ phaseId: string; action: string }> = [];
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
    });
    saveCheckpoint();
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

      const phaseOutput: any = { phaseId: phase.id, name: phase.name, tasks: [] };
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
              agentId: `agent-${ctx.missionId}-${task.agentRole.toLowerCase()}`,
              agentName: `${task.agentRole} Agent`,
              agentRole: task.agentRole,
            },
          });
          await this.updateTask(ctx, phase.id, task.id, { status: 'in_progress', startedAt });
          task.status = 'in_progress';
          task.startedAt = startedAt;
        }

        let result: TaskExecutionResult;
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
          result = taskRetryGuidance
            ? await agentRuntime.executeTask(...executionArgs, taskRetryGuidance)
            : await agentRuntime.executeTask(...executionArgs);
        } catch (err) {
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
                agentId: `agent-${ctx.missionId}-${task.agentRole.toLowerCase()}`,
                agentName: `${task.agentRole} Agent`,
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
              agentId: `agent-${ctx.missionId}-${task.agentRole.toLowerCase()}`,
              agentName: `${task.agentRole} Agent`,
              agentRole: task.agentRole,
              artifacts: result.artifacts,
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
                  agentId: `agent-${ctx.missionId}-${pendingTask.agentRole.toLowerCase()}`,
                  agentName: `${pendingTask.agentRole} Agent`,
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
                    agentId: `agent-${ctx.missionId}-${pendingTask.agentRole.toLowerCase()}`,
                    agentName: `${pendingTask.agentRole} Agent`,
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
              agentId: `agent-${ctx.missionId}-${task.agentRole.toLowerCase()}`,
              agentName: `${task.agentRole} Agent`,
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
            phase = applied.phase;
            if (applied.satisfied) break;
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

      if (!phaseIsComplete) {
        await this.updatePhase(ctx, phase.id, { status: 'awaiting_approval' });
        phase.status = 'awaiting_approval';
        await ctx.broadcast({ type: 'phase_completed', missionId: ctx.missionId, timestamp: Date.now(), data: { phaseId: phase.id, phaseName: phase.name, artifacts: phaseOutput.tasks.flatMap((t: any) => t.artifacts) } });
      }

      if (phaseIsComplete) {
        outputs.phases.push(phaseOutput);
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
        await ctx.broadcast({ type: 'phase_approved', missionId: ctx.missionId, timestamp: Date.now(), data: { phaseId: phase.id } });
      } else {
        await this.updatePhase(ctx, phase.id, { status: 'completed' });
        phase.status = 'completed';
      }

      completedPhases.add(phase.id);
      saveCheckpoint();
      outputs.phases.push(phaseOutput);
    }

    await ctx.controlCheckpoint?.();
    const satisfied = await this.evaluateMissionCompletion(ctx, plan, outputs);
    if (satisfied) {
      outputs.status = 'completed';
    } else {
      outputs.status = 'incomplete';
      await ctx.broadcast({
        type: 'mission_incomplete',
        missionId: ctx.missionId,
        timestamp: Date.now(),
        data: { reason: 'Produced outputs did not satisfy the mission goal' },
      });
    }

    return { plan, outputs, compensations };
  }

  private async generatePlan(ctx: MissionContext): Promise<Plan> {
    if (!this.agentRuntime) {
      throw new Error(`Mission Agent Runtime is not initialized for mission ${ctx.missionId}`);
    }
    return this.agentRuntime.generatePlan(ctx.prompt, ctx.metadata, async (progress) => {
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

  async evaluateMissionCompletion(
    ctx: Pick<MissionContext, 'missionId' | 'prompt' | 'tenantId' | 'metadata' | 'agentRuntimeUrl'>,
    plan: Plan,
    outputs: {
      phases?: Array<{
        phaseId?: string;
        tasks?: Array<{
          taskId?: string;
          status?: string;
          artifacts?: Array<{ name: string; type: string; content: string }>;
          output?: string;
        }>;
      }>;
    },
  ): Promise<boolean> {
    const phases = outputs?.phases || [];
    if (!plan.phases.length || phases.length !== plan.phases.length) return false;
    const expectedTaskIds = plan.phases.flatMap((phase) =>
      phase.tasks.map((task) => JSON.stringify([phase.id, task.id])),
    );
    const actualTasks = phases.flatMap((phase) =>
      (phase.tasks || []).map((task) => ({
        phaseId: phase.phaseId,
        taskId: task.taskId,
        status: task.status,
      })),
    );
    const actualTaskIds = actualTasks.map((task) => JSON.stringify([task.phaseId, task.taskId]));
    if (
      actualTasks.length !== expectedTaskIds.length
      || actualTasks.some((task) => task.status !== 'completed')
      || expectedTaskIds.some((taskId) => !actualTaskIds.includes(taskId))
    ) {
      logger.warn(
        { missionId: ctx.missionId, expectedTaskIds, actualTasks },
        'Mission completion review refused because the completed task set does not match the plan',
      );
      return false;
    }

    const agentRuntime = this.agentRuntime || new MissionAgentRuntime({
      missionId: ctx.missionId,
      tenantId: ctx.tenantId || 'tenant-1',
      metadata: ctx.metadata,
      agentRuntimeUrl: ctx.agentRuntimeUrl,
    });
    const plannedTasks = new Map(plan.phases.flatMap((phase) =>
      phase.tasks.map((task) => [task.id, task] as const),
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
          requiredActions: plannedTasks.get(taskId)?.requiredActions || [],
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
    return review.satisfied;
  }
}