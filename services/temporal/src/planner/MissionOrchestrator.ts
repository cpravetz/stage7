import { Plan, Phase, Task } from '@stage7-nextgen/shared';
import { logger } from '@stage7-nextgen/shared';
import { MissionPlanner } from './MissionPlanner';
import { WorkerAgent } from './WorkerAgent';

export interface MissionContext {
  missionId: string;
  prompt: string;
  tenantId?: string;
  assistantId?: string;
  metadata?: Record<string, unknown>;
  brainUrl: string;
  workerPoolUrl?: string;
  agentRuntimeUrl?: string;
  persistenceUrl: string;
  gatewayUrl: string;
  broadcast: (event: { type: string; missionId: string; timestamp: number; data?: any }) => Promise<void>;
  waitForApproval: (phaseId: string, question: string) => Promise<{ approved: boolean; reason?: string }>;
}

export class MissionOrchestrator {
  private planner: MissionPlanner;
  private worker: WorkerAgent;

  constructor() {
    const brainUrl = process.env.BRAIN_URL || 'http://brain:3100';
    this.planner = new MissionPlanner(brainUrl);
    this.worker = new WorkerAgent(brainUrl);
  }

  async run(ctx: MissionContext): Promise<{ plan: Plan; outputs: any }> {
    await ctx.broadcast({ type: 'planner_started', missionId: ctx.missionId, timestamp: Date.now(), data: { prompt: ctx.prompt } });
    const plan = await this.planner.generatePlan(ctx.prompt, ctx.metadata);
    await ctx.broadcast({ type: 'plan_generated', missionId: ctx.missionId, timestamp: Date.now(), data: { plan } });
    await this.persistPlan(ctx, plan);

    if (plan.requiresClarification && plan.clarificationQuestions.length > 0) {
      await ctx.broadcast({
        type: 'clarification_needed',
        missionId: ctx.missionId,
        timestamp: Date.now(),
        data: { questions: plan.clarificationQuestions },
      });
      return { plan, outputs: { status: 'awaiting_clarification', questions: plan.clarificationQuestions } };
    }

    const outputs: any = { phases: [] };
    for (const phase of plan.phases) {
      await ctx.broadcast({ type: 'phase_started', missionId: ctx.missionId, timestamp: Date.now(), data: { phaseId: phase.id, phaseName: phase.name } });
      await this.updatePhase(ctx, phase.id, { status: 'in_progress' });

      const phaseOutput: any = { phaseId: phase.id, name: phase.name, tasks: [] };

      for (const task of phase.tasks) {
        await ctx.broadcast({ type: 'task_started', missionId: ctx.missionId, timestamp: Date.now(), data: { phaseId: phase.id, taskId: task.id, taskTitle: task.title, agentRole: task.agentRole } });
        await this.updateTask(ctx, phase.id, task.id, { status: 'in_progress', startedAt: Date.now() });

        try {
          const result = await this.worker.executeTask(task, phase, plan, ctx.missionId);
          await this.updateTask(ctx, phase.id, task.id, {
            status: 'completed',
            completedAt: Date.now(),
            output: result.output,
            artifacts: result.artifacts,
          });
          await ctx.broadcast({
            type: 'task_completed',
            missionId: ctx.missionId,
            timestamp: Date.now(),
            data: { phaseId: phase.id, taskId: task.id, artifacts: result.artifacts, tokensUsed: result.tokensUsed },
          });
          phaseOutput.tasks.push({ taskId: task.id, status: 'completed', artifacts: result.artifacts });
        } catch (err: any) {
          await this.updateTask(ctx, phase.id, task.id, { status: 'failed', completedAt: Date.now(), output: `Error: ${err.message}` });
          await ctx.broadcast({ type: 'task_failed', missionId: ctx.missionId, timestamp: Date.now(), data: { phaseId: phase.id, taskId: task.id, error: err.message } });
          throw err;
        }
      }

      await this.updatePhase(ctx, phase.id, { status: 'awaiting_approval' });
      await ctx.broadcast({ type: 'phase_completed', missionId: ctx.missionId, timestamp: Date.now(), data: { phaseId: phase.id, phaseName: phase.name, artifacts: phaseOutput.tasks.flatMap((t: any) => t.artifacts) } });

      if (phase.requiresApproval) {
        const question = phase.approvalQuestion || `Phase "${phase.name}" complete. Approve to continue?`;
        const decision = await ctx.waitForApproval(phase.id, question);
        if (!decision.approved) {
          await this.updatePhase(ctx, phase.id, { status: 'rejected', rejectionReason: decision.reason });
          await ctx.broadcast({ type: 'phase_rejected', missionId: ctx.missionId, timestamp: Date.now(), data: { phaseId: phase.id, reason: decision.reason } });
          return { plan, outputs: { ...outputs, status: 'rejected_at_phase', phaseId: phase.id, reason: decision.reason } };
        }
        await this.updatePhase(ctx, phase.id, { status: 'approved', approvedAt: Date.now() });
        await ctx.broadcast({ type: 'phase_approved', missionId: ctx.missionId, timestamp: Date.now(), data: { phaseId: phase.id } });
      } else {
        await this.updatePhase(ctx, phase.id, { status: 'completed' });
      }

      outputs.phases.push(phaseOutput);
    }

    return { plan, outputs };
  }

  private async persistPlan(ctx: MissionContext, plan: Plan): Promise<void> {
    await fetch(`${ctx.persistenceUrl}/api/artifacts/missions/${ctx.missionId}/plan`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(plan),
    });
  }

  private async updatePhase(ctx: MissionContext, phaseId: string, update: Partial<Phase>): Promise<void> {
    await fetch(`${ctx.persistenceUrl}/api/artifacts/missions/${ctx.missionId}/phases/${phaseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
  }

  private async updateTask(ctx: MissionContext, phaseId: string, taskId: string, update: Partial<Task>): Promise<void> {
    await fetch(`${ctx.persistenceUrl}/api/artifacts/missions/${ctx.missionId}/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...update, phaseId }),
    });
  }
}
