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
import { MissionActivityCheckpoint, MissionTaskCheckpoint } from '../types/workflow';

const MISSION_REVIEWER_SYSTEM_PROMPT =
  'You are an objective mission evaluator. Determine whether the produced artifacts fully satisfy the stated mission goal. Answer with only "yes" or "no".';
const MISSION_REVIEWER_EXECUTION_POLICY: AgentExecutionPolicy = {
  ...DEFAULT_AGENT_EXECUTION_POLICY,
  maxBrainCalls: 1,
  maxActions: 0,
  maxCompletionTokens: 256,
  maxCompletionTokensPerCall: 256,
  maxDelegations: 0,
};

export interface MissionContext {
  missionId: string;
  prompt: string;
  tenantId?: string;
  metadata?: Record<string, unknown>;
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

  async run(ctx: MissionContext): Promise<{ plan: Plan; outputs: any; compensations: Array<{ phaseId: string; action: string }> }> {
    const compensations: Array<{ phaseId: string; action: string }> = [];
    const plannerAgentId = `agent-${ctx.missionId}-planner`;
    await ctx.controlCheckpoint?.();

    const agentRuntime = new MissionAgentRuntime({
      missionId: ctx.missionId,
      tenantId: ctx.tenantId || 'tenant-1',
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
    const completedTaskSummaries = new Map<string, { taskId: string; output: string; artifactNames: string[] }>();
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
      logger.error({ missionId: ctx.missionId, err: err instanceof Error ? err.message : String(err) }, 'Failed to persist plan');
      throw err;
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
      }

      const phaseOutput: any = { phaseId: phase.id, name: phase.name, tasks: [] };
      const completedInPhase = new Set<string>();
      const executeTask = async (task: Task, savedTask: MissionTaskCheckpoint | undefined) => {
        ctx.heartbeat?.();
        const taskKey = JSON.stringify([phase.id, task.id]);
        if (!savedTask) {
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
          await this.updateTask(ctx, phase.id, task.id, { status: 'in_progress', startedAt: Date.now() });

        }

        let result: TaskExecutionResult;
        try {
          const agentId = await agentRuntime.getOrCreateAgent(task.agentRole, task.systemPrompt);
          result = await agentRuntime.executeTask(
            agentId,
            task,
            phase,
            plan,
            !!savedTask,
            ctx.executionPolicy || DEFAULT_AGENT_EXECUTION_POLICY,
          );
        } catch (err) {
          if (!savedTask) {
            const error = err instanceof Error ? err.message : String(err);
            await this.updateTask(ctx, phase.id, task.id, { status: 'failed', completedAt: Date.now(), output: error });
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
          throw err;
        }

        if (!savedTask) {
          completedTasks.set(taskKey, { phaseId: phase.id, taskId: task.id });
          saveCheckpoint();
        }

        await this.updateTask(ctx, phase.id, task.id, {
          status: 'completed',
          completedAt: Date.now(),
          output: result.output,
          artifacts: result.artifacts,
        });
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
        completedTaskSummaries.set(task.id, {
          taskId: task.id,
          output: result.output.slice(0, 1_200),
          artifactNames: result.artifacts.slice(0, 20).map((artifact) => artifact.name),
        });
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
        const readyTasks = phase.tasks.filter((task) =>
          !completedInPhase.has(task.id)
          && (task.dependsOnTaskIds || []).every((dependencyId) => completedTaskIds.includes(dependencyId)),
        );
        if (readyTasks.length === 0) {
          throw new Error(`Mission phase ${phase.id} has pending tasks but no dependency-ready task`);
        }
        const task = readyTasks.length === 1
          ? readyTasks[0]!
          : await agentRuntime.selectNextTask(
            ctx.prompt,
            plan,
            phase,
            completedTaskIds,
            [...completedTaskSummaries.values()].slice(-10),
          );
        if (!readyTasks.some((candidate) => candidate.id === task.id)) {
          throw new Error(`Mission task selector chose a task that is not ready in phase ${phase.id}`);
        }
        await executeTask(task, undefined);
      }
      };

      await executePendingTasks();
      await ctx.controlCheckpoint?.();
      if (!phaseIsComplete) {
        const existingAmendmentCount = phase.tasks.filter((task) =>
          task.id.startsWith(`${phase.id}-amendment-`),
        ).length;
        for (let reviewIndex = existingAmendmentCount + 1; ; reviewIndex++) {
          const review = await agentRuntime.reviewPhase(
            ctx.prompt,
            plan,
            phase,
            [...completedTaskSummaries.values()].slice(-10),
            reviewIndex,
          );
          const applied = applyPhaseReview(plan, phase.id, review);
          plan = applied.plan;
          phase = applied.phase;
          if (applied.satisfied) break;
          if (!applied.amendment) {
            throw new Error(
              `Mission phase ${phase.id} remains incomplete after bounded amendments: ${applied.gaps.join('; ') || 'no review details supplied'}`,
            );
          }
          saveCheckpoint();
          await this.persistPlan(ctx, plan);
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
        }
      }

      if (!phaseIsComplete) {
        await this.updatePhase(ctx, phase.id, { status: 'awaiting_approval' });
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
        await ctx.broadcast({
          type: 'approval_requested',
          missionId: ctx.missionId,
          timestamp: Date.now(),
          data: { approvalId, phaseId: phase.id, phaseName: phase.name, question },
        });
        const decision = await ctx.waitForApproval(phase.id, question);
        if (!decision.approved) {
          await this.updatePhase(ctx, phase.id, { status: 'rejected', rejectionReason: decision.reason });
          await ctx.broadcast({ type: 'approval_rejected', missionId: ctx.missionId, timestamp: Date.now(), data: { phaseId: phase.id, reason: decision.reason } });
          return { plan, outputs: { ...outputs, status: 'rejected_at_phase', phaseId: phase.id, reason: decision.reason }, compensations };
        }
        await this.updatePhase(ctx, phase.id, { status: 'approved', approvedAt: Date.now(), approvedBy: 'user' });
        await ctx.broadcast({ type: 'approval_approved', missionId: ctx.missionId, timestamp: Date.now(), data: { phaseId: phase.id } });
        await ctx.broadcast({ type: 'phase_approved', missionId: ctx.missionId, timestamp: Date.now(), data: { phaseId: phase.id } });
      } else {
        await this.updatePhase(ctx, phase.id, { status: 'completed' });
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
    return this.agentRuntime.generatePlan(ctx.prompt, ctx.metadata);
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
      if (!res.ok) throw new Error(`Persist plan failed: ${res.status} ${res.statusText} - ${text}`);
    } catch (err) {
      logger.error({ missionId: ctx.missionId, err: err instanceof Error ? err.message : String(err) }, 'Error persisting plan to artifacts');
      throw err;
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
        throw new Error(`Phase persistence failed (${res.status}): ${text.slice(0, 500)}`);
      }
    } catch (err) {
      logger.error({ missionId: ctx.missionId, phaseId, err: err instanceof Error ? err.message : String(err) }, 'Error updating phase');
      throw err;
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
        throw new Error(`Task persistence failed (${res.status}): ${text.slice(0, 500)}`);
      }
    } catch (err) {
      logger.error({ missionId: ctx.missionId, phaseId, taskId, err: err instanceof Error ? err.message : String(err) }, 'Error updating task');
      throw err;
    }
  }

  async evaluateMissionCompletion(
    ctx: Pick<MissionContext, 'missionId' | 'prompt' | 'tenantId' | 'agentRuntimeUrl'>,
    plan: Plan,
    outputs: { phases?: Array<{ tasks?: Array<{ artifacts?: unknown[]; output?: string }> }> },
  ): Promise<boolean> {
    const phases = outputs?.phases || [];
    if (!plan.phases.length || phases.length === 0) return false;
    const artifacts = phases.flatMap((p) => (p.tasks || []).flatMap((t) => t.artifacts || []));
    const artifactSummary = artifacts.length
      ? artifacts.map((a) => `- ${typeof a === 'string' ? a : JSON.stringify(a)}`).join('\n')
      : '(none)';

    const agentRuntime = this.agentRuntime || new MissionAgentRuntime({
      missionId: ctx.missionId,
      tenantId: ctx.tenantId || 'tenant-1',
      agentRuntimeUrl: ctx.agentRuntimeUrl,
    });
    const reviewerAgentId = await agentRuntime.getOrCreateAgent(
      'mission-evaluator',
      MISSION_REVIEWER_SYSTEM_PROMPT,
    );
    const review = await agentRuntime.executePromptTask(reviewerAgentId, {
      taskId: `${ctx.missionId}:review:completion`,
      type: 'review',
      prompt: [
        `Mission goal: ${ctx.prompt}`,
        `Plan summary: ${plan.summary || ''}`,
        'Produced artifacts:',
        artifactSummary,
        'Do these artifacts fully satisfy the mission goal? Answer exactly "yes" or "no".',
      ].join('\n'),
      phaseId: 'mission-review',
      executionPolicy: MISSION_REVIEWER_EXECUTION_POLICY,
    });
    const answer = review.output.trim().toLowerCase();
    if (answer !== 'yes' && answer !== 'no') {
      throw new Error(`Mission evaluator returned an invalid decision: ${review.output.slice(0, 200)}`);
    }
    return answer === 'yes';
  }
}