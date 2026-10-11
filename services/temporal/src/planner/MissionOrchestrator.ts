import { Plan, Phase, Task } from '@stage7-nextgen/shared';
import { logger } from '@stage7-nextgen/shared';
import { MissionAgentRuntime, MissionAgentConfig, TaskExecutionResult } from '../agent/MissionAgentRuntime';

const PLANNER_SYSTEM_PROMPT = `You are a mission planner for an AI agent platform. Given a user's goal, you produce a structured plan with phases, tasks, and the agent roles needed to execute them.

Your job is to:
1. Understand the goal.
2. Decide if you need clarification. If the goal is ambiguous, set requiresClarification=true and ask 2-4 focused questions. Otherwise set requiresClarification=false.
3. Decompose the goal into 3-7 phases. Each phase has a clear deliverable.
4. For each phase, break it into specific tasks (1-5 per phase). Each task has a single agent role, a clear description, and expected artifacts.
5. For each task, write a systemPrompt for the agent that will execute it.
6. Mark requiresApproval=true on phases that produce something the user should review before continuing.

Agent roles should be chosen based on the actual goal — e.g. "researcher" for research tasks, "coder" for software tasks, "writer" for content, "analyst" for data tasks, "planner" for strategy, "reviewer" for quality checks, "judge" for evaluation, "artist" for creative, "curator" for selection, or any persona appropriate to the task. Do not default to business/startup roles unless the goal is explicitly about business.

Output a single JSON object matching the schema. Do not include any prose outside the JSON.`;

function buildFallbackPlan(prompt: string): Plan {
  const trimmed = prompt.trim();
  return {
    summary: `Plan for: ${trimmed.slice(0, 100)}`,
    estimatedDuration: '1-2 days',
    estimatedCost: 'TBD',
    requiresClarification: false,
    clarificationQuestions: [],
    phases: [
      {
        id: 'phase-1',
        name: 'Planning',
        goal: `Break down and plan the execution of: ${trimmed.slice(0, 80)}`,
        tasks: [
          {
            id: 'task-1-1',
            title: 'Analyze goal and create execution plan',
            description: `Analyze the goal and create a concrete, step-by-step execution plan for: ${trimmed}`,
            agentRole: 'planner',
            systemPrompt: 'You are a planning agent. Analyze the goal and create a concrete, step-by-step execution plan. Be thorough and consider edge cases.',
            expectedArtifacts: ['plan.md'],
            status: 'pending',
            artifacts: [],
          },
        ],
        requiresApproval: true,
        status: 'pending',
      },
      {
        id: 'phase-2',
        name: 'Execution',
        goal: `Execute the plan to accomplish: ${trimmed.slice(0, 80)}`,
        tasks: [
          {
            id: 'task-2-1',
            title: 'Execute the plan',
            description: `Execute the previously created plan to accomplish: ${trimmed}`,
            agentRole: 'worker',
            systemPrompt: 'You are an execution agent. Execute the plan thoroughly and produce the required artifacts. If you need tools, use the available tool execution interface.',
            expectedArtifacts: ['output.md'],
            status: 'pending',
            artifacts: [],
          },
        ],
        requiresApproval: false,
        status: 'pending',
      },
      {
        id: 'phase-3',
        name: 'Review',
        goal: 'Review output quality and completeness',
        tasks: [
          {
            id: 'task-3-1',
            title: 'Review and refine output',
            description: 'Review the execution output for completeness, accuracy, and quality. Refine or request follow-up tasks if needed.',
            agentRole: 'reviewer',
            systemPrompt: 'You are a reviewer agent. Evaluate outputs for completeness, accuracy, and quality. Identify gaps and suggest improvements.',
            expectedArtifacts: ['review.md'],
            status: 'pending',
            artifacts: [],
          },
        ],
        requiresApproval: true,
        status: 'pending',
      },
    ],
  };
}

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
  broadcastAll: (event: { type: string; timestamp: number; data?: any }) => Promise<void>;
  waitForApproval: (phaseId: string, question: string) => Promise<{ approved: boolean; reason?: string }>;
}

export class MissionOrchestrator {
  private agentRuntime: MissionAgentRuntime | null = null;
  private brainUrl: string;

  constructor() {
    this.brainUrl = process.env.BRAIN_URL || 'http://brain:3100';
  }

  async run(ctx: MissionContext): Promise<{ plan: Plan; outputs: any; compensations: Array<{ phaseId: string; action: string }> }> {
    const compensations: Array<{ phaseId: string; action: string }> = [];
    const plannerAgentId = `agent-${ctx.missionId}-planner`;

    this.agentRuntime = new MissionAgentRuntime({
      missionId: ctx.missionId,
      tenantId: ctx.tenantId || 'tenant-1',
      assistantId: ctx.assistantId,
      workerPoolUrl: ctx.workerPoolUrl,
      agentRuntimeUrl: ctx.agentRuntimeUrl,
      broadcast: ctx.broadcastAll,
    });

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

    const plan = await this.generatePlan(ctx);
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
    for (const phase of plan.phases) {
      await ctx.broadcast({ type: 'phase_started', missionId: ctx.missionId, timestamp: Date.now(), data: { phaseId: phase.id, phaseName: phase.name } });
      await this.updatePhase(ctx, phase.id, { status: 'in_progress' });

      const phaseOutput: any = { phaseId: phase.id, name: phase.name, tasks: [] };

      for (const task of phase.tasks) {
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

        let result: TaskExecutionResult;
        try {
          const agentId = await this.agentRuntime.getOrCreateWorkerAgent(task.agentRole, task.systemPrompt);
          result = await this.agentRuntime.executeTask(agentId, task, phase, plan);
        } catch (err) {
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
          throw err;
        }

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
        phaseOutput.tasks.push({ taskId: task.id, status: 'completed', artifacts: result.artifacts });
        compensations.push({ phaseId: phase.id, action: `revert-phase-${phase.id}` });
      }

      await this.updatePhase(ctx, phase.id, { status: 'awaiting_approval' });
      await ctx.broadcast({ type: 'phase_completed', missionId: ctx.missionId, timestamp: Date.now(), data: { phaseId: phase.id, phaseName: phase.name, artifacts: phaseOutput.tasks.flatMap((t: any) => t.artifacts) } });

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

      outputs.phases.push(phaseOutput);
    }

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
    const brainUrl = ctx.brainUrl || this.brainUrl;
    const fallback = (reason: string): Plan => {
      logger.warn({ missionId: ctx.missionId, reason }, 'Planner could not produce a valid plan; using fallback plan');
      return buildFallbackPlan(ctx.prompt);
    };

    try {
      const res = await fetch(`${brainUrl}/api/brain/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `GOAL: ${ctx.prompt}\n\nCONTEXT: ${JSON.stringify(ctx.metadata || {})}`,
          systemPrompt: PLANNER_SYSTEM_PROMPT,
          maxTokens: 4096,
          temperature: 0.3,
          missionId: ctx.missionId,
        }),
      });
      const raw = await res.text();
      if (!res.ok) return fallback(`Brain returned ${res.status}: ${raw.slice(0, 200)}`);

      let data: { content?: string };
      try {
        data = JSON.parse(raw) as { content?: string };
      } catch {
        data = { content: raw };
      }
      const content = data.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return fallback('Brain response did not contain a JSON plan');

      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const { PlanSchema } = await import('@stage7-nextgen/shared');
        const validated = PlanSchema.parse(parsed);
        logger.info({ missionGoal: ctx.prompt.slice(0, 50), phases: validated.phases.length }, 'Plan generated');
        return validated;
      } catch (err) {
        return fallback(`Brain response did not match the plan schema: ${err instanceof Error ? err.message : String(err)}`);
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return fallback(reason);
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
      if (!res.ok) throw new Error(`Persist plan failed: ${res.status} ${res.statusText} - ${text}`);
    } catch (err) {
      logger.error({ missionId: ctx.missionId, err: err instanceof Error ? err.message : String(err) }, 'Error persisting plan to artifacts');
      throw err;
    }
  }

  private async updatePhase(ctx: MissionContext, phaseId: string, update: Partial<Phase>): Promise<void> {
    const url = `${ctx.persistenceUrl}/api/artifacts/missions/${ctx.missionId}/phases/${phaseId}`;
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
        logger.warn({ missionId: ctx.missionId, phaseId, status: res.status, responseText: text }, 'Failed updating phase');
      }
    } catch (err) {
      logger.warn({ missionId: ctx.missionId, phaseId, err: err instanceof Error ? err.message : String(err) }, 'Error updating phase');
    }
  }

  private async updateTask(ctx: MissionContext, phaseId: string, taskId: string, update: Partial<Task>): Promise<void> {
    const url = `${ctx.persistenceUrl}/api/artifacts/missions/${ctx.missionId}/tasks/${taskId}`;
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
        logger.warn({ missionId: ctx.missionId, phaseId, taskId, status: res.status, responseText: text }, 'Failed updating task');
      }
    } catch (err) {
      logger.warn({ missionId: ctx.missionId, phaseId, taskId, err: err instanceof Error ? err.message : String(err) }, 'Error updating task');
    }
  }

  private async evaluateMissionCompletion(
    ctx: MissionContext,
    plan: Plan,
    outputs: { phases?: Array<{ tasks?: Array<{ artifacts?: unknown[]; output?: string }> }> },
  ): Promise<boolean> {
    const phases = outputs?.phases || [];
    if (!plan.phases.length || phases.length === 0) return false;
    const artifacts = phases.flatMap((p) => (p.tasks || []).flatMap((t) => t.artifacts || []));
    const artifactSummary = artifacts.length
      ? artifacts.map((a) => `- ${typeof a === 'string' ? a : JSON.stringify(a)}`).join('\n')
      : '(none)';

    try {
      const prompt = [
        `Mission goal: ${ctx.prompt}`,
        `Plan summary: ${plan.summary || ''}`,
        'Produced artifacts:',
        artifactSummary,
        'Did the produced artifacts fully satisfy the mission goal? Answer only "yes" or "no".',
      ].join('\n');

      const res = await fetch(`${ctx.brainUrl}/api/brain/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          systemPrompt:
            'You are an objective mission evaluator. Determine whether the produced artifacts fully satisfy the stated mission goal. Answer with only "yes" or "no".',
          maxTokens: 256,
          temperature: 0,
          missionId: ctx.missionId,
        }),
      });

      if (!res.ok) {
        logger.warn({ missionId: ctx.missionId, status: res.status }, 'Mission evaluation brain call failed; inferring from artifact presence');
        return artifacts.length > 0;
      }

      const data = await res.json() as { content?: string };
      const answer = (data.content || '').trim().slice(0, 3).toLowerCase();
      return answer.startsWith('y');
    } catch (err) {
      logger.warn(
        { missionId: ctx.missionId, err: err instanceof Error ? err.message : String(err) },
        'Mission evaluation failed; inferring from artifact presence',
      );
      return artifacts.length > 0;
    }
  }
}