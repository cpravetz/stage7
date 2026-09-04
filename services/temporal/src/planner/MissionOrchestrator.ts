import { Plan, Phase, Task, AssistantDefinition } from '@stage7-nextgen/shared';
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
  private agentRuntimeUrl: string | undefined;

  constructor() {
    const brainUrl = process.env.BRAIN_URL || 'http://brain:3100';
    this.agentRuntimeUrl = process.env.AGENT_RUNTIME_URL || undefined;
    this.planner = new MissionPlanner(brainUrl);
    this.worker = new WorkerAgent({ brainUrl, agentRuntimeUrl: this.agentRuntimeUrl });
  }

  async run(ctx: MissionContext): Promise<{ plan: Plan; outputs: any; compensations: Array<{ phaseId: string; action: string }> }> {
    const compensations: Array<{ phaseId: string; action: string }> = [];
    await ctx.broadcast({ type: 'planner_started', missionId: ctx.missionId, timestamp: Date.now(), data: { prompt: ctx.prompt } });
    const plan = await this.planner.generatePlan(ctx.prompt, ctx.metadata);
    await ctx.broadcast({ type: 'plan_generated', missionId: ctx.missionId, timestamp: Date.now(), data: { plan } });
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
        await ctx.broadcast({ type: 'task_started', missionId: ctx.missionId, timestamp: Date.now(), data: { phaseId: phase.id, taskId: task.id, taskTitle: task.title, agentRole: task.agentRole } });
        await this.updateTask(ctx, phase.id, task.id, { status: 'in_progress', startedAt: Date.now() });

        try {
          const useSystemAssistant = !ctx.assistantId && !!ctx.workerPoolUrl;
          const agentDef = await this.ensureAgentForRole(
            ctx.missionId,
            task.agentRole,
            task.systemPrompt,
            useSystemAssistant ? ctx.workerPoolUrl : undefined,
          );
          const worker = new WorkerAgent({
            brainUrl: process.env.BRAIN_URL || 'http://brain:3100',
            agentRuntimeUrl: this.agentRuntimeUrl,
            workerPoolUrl: ctx.workerPoolUrl,
            assistantId: ctx.assistantId || agentDef?.assistantId,
            agentDefinition: agentDef,
          });
          const result = await worker.executeTask(task, phase, plan, ctx.missionId);
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
          compensations.push({ phaseId: phase.id, action: `revert-phase-${phase.id}` });
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
          return { plan, outputs: { ...outputs, status: 'rejected_at_phase', phaseId: phase.id, reason: decision.reason }, compensations };
        }
        await this.updatePhase(ctx, phase.id, { status: 'approved', approvedAt: Date.now() });
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

  async ensureAgentForRole(
    missionId: string,
    agentRole: string,
    systemPrompt: string,
    workerPoolUrl?: string,
  ): Promise<{
    id: string;
    name: string;
    systemPrompt: string;
    tools: string[];
    assistantId?: string;
    workerPoolUrl?: string;
  } | undefined> {
    let definition: { id: string; name: string; systemPrompt: string; tools: string[] } = {
      id: `worker-${agentRole}`,
      name: agentRole,
      systemPrompt,
      tools: [],
    };

    if (this.agentRuntimeUrl) {
      const agentId = `agent-${missionId}-${agentRole}`;
      try {
        const res = await fetch(`${this.agentRuntimeUrl}/api/agent-runtime/agents/${encodeURIComponent(agentId)}`);
        if (res.ok) {
          const data = await res.json() as { agent: { id: string; name: string; systemPrompt: string; tools: string[] } };
          definition = {
            id: data.agent.id,
            name: data.agent.name,
            systemPrompt: data.agent.systemPrompt || systemPrompt,
            tools: data.agent.tools || [],
          };
        } else {
          const res2 = await fetch(`${this.agentRuntimeUrl}/api/agent-runtime/agents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: agentId,
              tenantId: 'tenant-1',
              name: `${agentRole} agent`,
              description: `Dynamic agent for role: ${agentRole}`,
              type: agentRole,
              systemPrompt,
              tools: [],
              metadata: { missionId, agentRole },
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          });
          if (res2.ok) {
            const data2 = await res2.json() as { id: string; name: string; systemPrompt: string; tools: string[] };
            definition = { id: data2.id, name: data2.name, systemPrompt: data2.systemPrompt || systemPrompt, tools: data2.tools || [] };
          }
        }
      } catch {
        // ignore runtime-agent registration errors; fall back to brain-direct identity
      }
    }

    let assistantId: string | undefined;
    if (workerPoolUrl) {
      const asstId = `assistant-${missionId}-${agentRole}`;
      try {
        const getRes = await fetch(`${workerPoolUrl}/api/workers/assistants/${encodeURIComponent(asstId)}`);
        if (getRes.ok) {
          const data = await getRes.json() as { assistant: AssistantDefinition };
          assistantId = data.assistant.id;
        } else {
          const postRes = await fetch(`${workerPoolUrl}/api/workers/assistants`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: asstId,
              tenantId: 'tenant-1',
              name: `${agentRole} agent`,
              description: `System agent for role "${agentRole}" in mission ${missionId}`,
              type: 'agent',
              model: 'openai/gpt-4o-mini',
              systemPrompt,
              tools: [],
              knowledge: [],
              transactionGuidance: [],
              metadata: { missionId, agentRole },
              createdAt: new Date(),
              updatedAt: new Date(),
            } as AssistantDefinition),
          });
          if (postRes.ok) {
            const data2 = await postRes.json() as AssistantDefinition;
            assistantId = data2.id;
          }
        }
      } catch (err) {
        logger.warn({ missionId, agentRole, err: err instanceof Error ? err.message : String(err) }, 'Failed to bind system agent to worker-pool assistant; falling back to brain-direct');
      }
    }

    return { ...definition, assistantId, workerPoolUrl };
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
