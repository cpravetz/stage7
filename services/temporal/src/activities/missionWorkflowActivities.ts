import { Context } from '@temporalio/activity';
import {
  DEFAULT_AGENT_EXECUTION_POLICY,
  Plan,
  Phase,
  Task,
} from '@stage7-nextgen/shared';
import { logger } from '@stage7-nextgen/shared';
import { MissionAgentRuntime, TaskExecutionResult } from '../agent/MissionAgentRuntime';
import { MissionOrchestrator } from '../planner/MissionOrchestrator';
import { WorkflowInput } from '../types/workflow';

export interface MissionTaskActivityInput {
  input: WorkflowInput;
  plan: Plan;
  phase: Phase;
  task: Task;
}

export interface MissionPhaseActivityInput {
  input: WorkflowInput;
  phase: Phase;
}

export interface MissionApprovalActivityInput extends MissionPhaseActivityInput {
  question: string;
}

export interface MissionApprovalResult {
  approved: boolean;
  reason?: string;
}

export interface MissionPhaseOutput {
  phaseId: string;
  name: string;
  tasks: Array<{
    taskId: string;
    status: 'completed';
    artifacts: TaskExecutionResult['artifacts'];
  }>;
}

export interface MissionCompletionActivityInput {
  input: WorkflowInput;
  plan: Plan;
  phases: MissionPhaseOutput[];
  compensations: Array<{ phaseId: string; action: string }>;
}

function serviceUrl(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

async function broadcast(
  input: WorkflowInput,
  event: { type: string; missionId: string; timestamp: number; data?: unknown },
): Promise<void> {
  const persistenceUrl = serviceUrl('ARTIFACTS_URL', 'http://artifacts:4200');
  try {
    const response = await fetch(`${persistenceUrl}/api/artifacts/missions/${input.missionId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (!response.ok) {
      logger.warn({ missionId: input.missionId, status: response.status }, 'Mission event persistence failed');
    }
  } catch (error) {
    logger.warn({ missionId: input.missionId, error: error instanceof Error ? error.message : String(error) }, 'Mission event persistence failed');
  }

  const gatewayUrl = process.env.GATEWAY_URL;
  if (!gatewayUrl) return;
  try {
    const response = await fetch(`${gatewayUrl}/api/gateway/broadcast/mission/${input.missionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (!response.ok) {
      logger.warn({ missionId: input.missionId, status: response.status }, 'Mission event broadcast failed');
    }
  } catch (error) {
    logger.warn({ missionId: input.missionId, error: error instanceof Error ? error.message : String(error) }, 'Mission event broadcast failed');
  }
}

async function persistUpdate(
  input: WorkflowInput,
  resource: 'phases' | 'tasks',
  id: string,
  update: Record<string, unknown>,
): Promise<void> {
  const persistenceUrl = serviceUrl('ARTIFACTS_URL', 'http://artifacts:4200');
  const url = `${persistenceUrl}/api/artifacts/missions/${encodeURIComponent(input.missionId)}/${resource}/${encodeURIComponent(id)}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    throw new Error(`Mission ${resource.slice(0, -1)} update failed (${response.status}): ${details}`);
  }
}

export async function prepareMissionActivity(input: WorkflowInput): Promise<Plan> {
  await broadcast(input, {
    type: 'planner_started',
    missionId: input.missionId,
    timestamp: Date.now(),
    data: {
      prompt: input.prompt,
      agentId: `agent-${input.missionId}-planner`,
      agentName: 'Mission Planner',
      agentRole: 'planner',
      status: 'planning',
    },
  });

  const plannerRuntime = new MissionAgentRuntime({
    missionId: input.missionId,
    tenantId: input.tenantId || 'tenant-1',
    agentRuntimeUrl: process.env.AGENT_RUNTIME_URL,
  });
  const plan = await plannerRuntime.generatePlan(input.prompt, input.metadata);
  const persistenceUrl = serviceUrl('ARTIFACTS_URL', 'http://artifacts:4200');
  const response = await fetch(`${persistenceUrl}/api/artifacts/missions/${input.missionId}/plan`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(plan),
  });
  if (!response.ok) {
    const details = (await response.text()).slice(0, 1000);
    throw new Error(`Persist mission plan failed (${response.status}): ${details}`);
  }

  await broadcast(input, {
    type: 'plan_generated',
    missionId: input.missionId,
    timestamp: Date.now(),
    data: {
      plan,
      agentId: `agent-${input.missionId}-planner`,
      agentName: 'Mission Planner',
      agentRole: 'planner',
      status: 'completed',
    },
  });
  if (plan.requiresClarification && plan.clarificationQuestions.length > 0) {
    await broadcast(input, {
      type: 'clarification_needed',
      missionId: input.missionId,
      timestamp: Date.now(),
      data: { questions: plan.clarificationQuestions },
    });
  }
  return plan;
}

export async function startMissionPhaseActivity({
  input,
  phase,
}: MissionPhaseActivityInput): Promise<void> {
  await persistUpdate(input, 'phases', phase.id, { status: 'in_progress' });
  await broadcast(input, {
    type: 'phase_started',
    missionId: input.missionId,
    timestamp: Date.now(),
    data: { phaseId: phase.id, phaseName: phase.name },
  });
}

export async function executeMissionTaskActivity({
  input,
  plan,
  phase,
  task,
}: MissionTaskActivityInput): Promise<TaskExecutionResult> {
  const activityContext = Context.current();
  const retrying = activityContext.info.attempt > 1;
  const agentId = `agent-${input.missionId}-${task.agentRole.toLowerCase()}`;
  const agentRuntime = new MissionAgentRuntime({
    missionId: input.missionId,
    tenantId: input.tenantId || 'tenant-1',
    agentRuntimeUrl: process.env.AGENT_RUNTIME_URL,
  });
  const heartbeatTimer = setInterval(() => {
    activityContext.heartbeat({ missionId: input.missionId, phaseId: phase.id, taskId: task.id });
  }, 30_000);

  try {
    await persistUpdate(input, 'tasks', task.id, {
      phaseId: phase.id,
      status: 'in_progress',
      ...(!retrying ? { startedAt: Date.now() } : {}),
    });
    if (!retrying) {
      await broadcast(input, {
        type: 'task_started',
        missionId: input.missionId,
        timestamp: Date.now(),
        data: {
          phaseId: phase.id,
          taskId: task.id,
          taskTitle: task.title,
          agentId,
          agentName: `${task.agentRole} Agent`,
          agentRole: task.agentRole,
        },
      });
    }

    const registeredAgentId = await agentRuntime.getOrCreateAgent(task.agentRole, task.systemPrompt);
    const result = await agentRuntime.executeTask(
      registeredAgentId,
      task,
      phase,
      plan,
      retrying,
      DEFAULT_AGENT_EXECUTION_POLICY,
    );
    await persistUpdate(input, 'tasks', task.id, {
      phaseId: phase.id,
      status: 'completed',
      completedAt: Date.now(),
      output: result.output,
      artifacts: result.artifacts,
    });
    await broadcast(input, {
      type: 'task_completed',
      missionId: input.missionId,
      timestamp: Date.now(),
      data: {
        phaseId: phase.id,
        taskId: task.id,
        taskTitle: task.title,
        agentId,
        agentName: `${task.agentRole} Agent`,
        agentRole: task.agentRole,
        artifacts: result.artifacts,
        tokensUsed: result.tokensUsed,
      },
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await persistUpdate(input, 'tasks', task.id, {
        phaseId: phase.id,
        status: 'failed',
        completedAt: Date.now(),
        output: message,
      });
    } catch (persistenceError) {
      logger.error(
        {
          missionId: input.missionId,
          taskId: task.id,
          error: persistenceError instanceof Error ? persistenceError.message : String(persistenceError),
        },
        'Failed to persist mission task failure',
      );
    }
    await broadcast(input, {
      type: 'task_failed',
      missionId: input.missionId,
      timestamp: Date.now(),
      data: {
        phaseId: phase.id,
        taskId: task.id,
        taskTitle: task.title,
        agentId,
        agentName: `${task.agentRole} Agent`,
        agentRole: task.agentRole,
        error: message,
      },
    });
    throw error;
  } finally {
    clearInterval(heartbeatTimer);
  }
}

export async function finishMissionPhaseActivity({
  input,
  phase,
  tasks,
}: MissionPhaseActivityInput & { tasks: MissionPhaseOutput['tasks'] }): Promise<void> {
  await persistUpdate(input, 'phases', phase.id, {
    status: phase.requiresApproval ? 'awaiting_approval' : 'completed',
  });
  await broadcast(input, {
    type: 'phase_completed',
    missionId: input.missionId,
    timestamp: Date.now(),
    data: {
      phaseId: phase.id,
      phaseName: phase.name,
      artifacts: tasks.flatMap((task) => task.artifacts),
    },
  });
}

export async function awaitMissionPhaseApprovalActivity({
  input,
  phase,
  question,
}: MissionApprovalActivityInput): Promise<MissionApprovalResult> {
  const persistenceUrl = serviceUrl('ARTIFACTS_URL', 'http://artifacts:4200');
  const approvalUrl = `${persistenceUrl}/api/artifacts/missions/${input.missionId}/phases/${phase.id}`;
  const timeout = Number.parseInt(process.env.APPROVAL_TIMEOUT_MS || '', 10) || 24 * 60 * 60 * 1000;
  const pollInterval = Number.parseInt(process.env.APPROVAL_POLL_INTERVAL_MS || '3000', 10);
  const startTime = Date.now();
  let checks = 0;

  await persistUpdate(input, 'phases', phase.id, { approvalQuestion: question });
  await broadcast(input, {
    type: 'approval_requested',
    missionId: input.missionId,
    timestamp: Date.now(),
    data: {
      approvalId: `approval-${input.missionId}-${phase.id}`,
      phaseId: phase.id,
      phaseName: phase.name,
      question,
    },
  });

  while (Date.now() - startTime < timeout) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    Context.current().heartbeat({ missionId: input.missionId, phaseId: phase.id, approvalChecks: ++checks });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(approvalUrl, { signal: controller.signal });
      if (response.ok) {
        const state = await response.json() as { status?: string; rejectionReason?: string };
        if (state.status === 'approved') return { approved: true };
        if (state.status === 'rejected') return { approved: false, reason: state.rejectionReason };
      } else {
        const details = (await response.text()).slice(0, 200);
        logger.warn(
          { missionId: input.missionId, phaseId: phase.id, status: response.status, checks, details },
          'Approval poll returned non-success status',
        );
      }
    } catch (error) {
      logger.warn(
        { missionId: input.missionId, phaseId: phase.id, checks, error: error instanceof Error ? error.message : String(error) },
        'Approval poll failed',
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
  return { approved: false, reason: 'Approval timeout' };
}

export async function recordMissionPhaseApprovalActivity({
  input,
  phase,
  decision,
}: MissionPhaseActivityInput & { decision: MissionApprovalResult }): Promise<void> {
  const approved = decision.approved;
  await persistUpdate(input, 'phases', phase.id, approved
    ? { status: 'approved', approvedAt: Date.now(), approvedBy: 'user' }
    : { status: 'rejected', rejectionReason: decision.reason });
  await broadcast(input, {
    type: approved ? 'approval_approved' : 'approval_rejected',
    missionId: input.missionId,
    timestamp: Date.now(),
    data: { phaseId: phase.id, ...(approved ? {} : { reason: decision.reason }) },
  });
  if (approved) {
    await broadcast(input, {
      type: 'phase_approved',
      missionId: input.missionId,
      timestamp: Date.now(),
      data: { phaseId: phase.id },
    });
  }
}

export async function completeMissionActivity({
  input,
  plan,
  phases,
  compensations,
}: MissionCompletionActivityInput): Promise<{
  plan: Plan;
  outputs: { phases: MissionPhaseOutput[]; status: 'completed' | 'incomplete' };
  compensations: Array<{ phaseId: string; action: string }>;
}> {
  const outputs: { phases: MissionPhaseOutput[]; status: 'completed' | 'incomplete' } = { phases, status: 'incomplete' };
  const satisfied = await new MissionOrchestrator().evaluateMissionCompletion(
    {
      missionId: input.missionId,
      prompt: input.prompt,
      tenantId: input.tenantId,
      agentRuntimeUrl: process.env.AGENT_RUNTIME_URL,
    },
    plan,
    outputs,
  );
  outputs.status = satisfied ? 'completed' : 'incomplete';
  if (!satisfied) {
    await broadcast(input, {
      type: 'mission_incomplete',
      missionId: input.missionId,
      timestamp: Date.now(),
      data: { reason: 'Produced outputs did not satisfy the mission goal' },
    });
  }
  return { plan, outputs, compensations };
}
