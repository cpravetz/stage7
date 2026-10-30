import { Context } from '@temporalio/activity';
import {
  DEFAULT_AGENT_EXECUTION_POLICY,
  Plan,
  PlanSchema,
  Phase,
  Task,
} from '@stage7-nextgen/shared';
import { logger } from '@stage7-nextgen/shared';
import { MissionAgentRuntime, MissionAgentConfig, TaskExecutionResult } from '../agent/MissionAgentRuntime';
import { applyPhaseReview, MissionPhaseReview } from '../agent/MissionAgentRuntime';
import { isHumanAgentRole } from '../planner/MissionPlanner';
import { MissionOrchestrator } from '../planner/MissionOrchestrator';
import { CompletedTaskSummary, WorkflowInput } from '../types/workflow';

export interface MissionTaskActivityInput {
  input: WorkflowInput;
  plan: Plan;
  phase: Phase;
  task: Task;
  completedTaskSummaries?: CompletedTaskSummary[];
}

export interface MissionTaskSelectionActivityInput {
  input: WorkflowInput;
  plan: Plan;
  phase: Phase;
  completedTaskIds: string[];
  completedTaskSummaries: CompletedTaskSummary[];
}

export interface MissionPhaseReviewActivityInput {
  input: WorkflowInput;
  plan: Plan;
  phase: Phase;
  completedTaskSummaries: CompletedTaskSummary[];
  reviewIndex: number;
}

export interface MissionPhaseReviewActivityResult {
  plan: Plan;
  phase: Phase;
  satisfied: boolean;
  gaps: string[];
  amendment?: Task;
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
  status: 'completed' | 'incomplete';
  tasks: Array<{
    taskId: string;
    status: 'completed' | 'failed' | 'pending';
    artifacts: TaskExecutionResult['artifacts'];
    output?: string;
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

function agentMemoryMetadata(input: WorkflowInput): Record<string, unknown> {
  return {
    ...input.metadata,
    entityId: typeof input.metadata?.entityId === 'string' && input.metadata.entityId.trim()
      ? input.metadata.entityId.trim()
      : input.missionId,
    assistantId: input.assistantId,
    tenantId: input.tenantId || 'tenant-1',
  };
}

const PLANNER_PROGRESS_MIN_INTERVAL_MS = 60_000;
const plannerProgressByMission = new Map<string, { key: string; at: number }>();

function shouldReportPlannerProgress(missionId: string, status: string, reason: string): boolean {
  // Mirror the orchestrator progress dedup: a 60s window keyed on
  // status|reason with digits masked, so repeated identical planner
  // updates do not spam the feed while at least one is kept.
  const key = `${status}|${reason.replace(/\d+/g, '#')}`;
  const now = Date.now();
  const last = plannerProgressByMission.get(missionId);
  if (last && last.key === key && now - last.at < PLANNER_PROGRESS_MIN_INTERVAL_MS) {
    return false;
  }
  plannerProgressByMission.set(missionId, { key, at: now });
  return true;
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


function createRuntimeBroadcast(input: WorkflowInput): MissionAgentConfig['broadcast'] {
  return async (event) => {
    await broadcast(input, event as { type: string; missionId: string; timestamp: number; data?: unknown });
  };
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

async function persistMissionPlan(input: WorkflowInput, plan: Plan): Promise<void> {
  const persistenceUrl = serviceUrl('ARTIFACTS_URL', 'http://artifacts:4200');
  const response = await fetch(`${persistenceUrl}/api/artifacts/missions/${encodeURIComponent(input.missionId)}/plan`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(plan),
  });
  if (!response.ok) {
    const details = (await response.text()).slice(0, 1000);
    throw new Error(`Persist mission plan failed (${response.status}): ${details}`);
  }
}

export async function prepareMissionActivity(input: WorkflowInput): Promise<Plan> {
  if (input.metadata?.retriedFrom) {
    const persistenceUrl = serviceUrl('ARTIFACTS_URL', 'http://artifacts:4200');
    const response = await fetch(
      `${persistenceUrl}/api/artifacts/missions/${encodeURIComponent(input.missionId)}/plan`,
    );
    if (!response.ok) {
      const details = (await response.text()).slice(0, 1000);
      throw new Error(`Could not load persisted plan for mission retry (${response.status}): ${details}`);
    }
    const plan = PlanSchema.parse(await response.json());
    logger.info({ missionId: input.missionId }, 'Reusing persisted plan for mission retry');
    return plan;
  }

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
    metadata: agentMemoryMetadata(input),
    agentRuntimeUrl: process.env.AGENT_RUNTIME_URL,
    broadcast: createRuntimeBroadcast(input),
  });
  const plan = await plannerRuntime.generatePlan(input.prompt, input.metadata, async (progress) => {
    if (!shouldReportPlannerProgress(input.missionId, progress.status, progress.reason)) return;
    await broadcast(input, {
      type: 'planner_progress',
      missionId: input.missionId,
      timestamp: Date.now(),
      data: {
        attempt: progress.attempt,
        status: progress.status,
        reason: progress.reason,
        transient: progress.transient,
        agentId: `agent-${input.missionId}-planner`,
        agentName: 'Mission Planner',
        agentRole: 'planner',
      },
    });
  });
  await persistMissionPlan(input, plan);

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

export async function selectNextMissionTaskActivity({
  input,
  plan,
  phase,
  completedTaskIds,
  completedTaskSummaries,
}: MissionTaskSelectionActivityInput): Promise<string> {
  const humanTask = phase.tasks.find((task) => isHumanAgentRole(task.agentRole));
  if (humanTask) {
    throw new Error(
      `Mission phase "${phase.id}" contains task "${humanTask.id}" with human agentRole "${humanTask.agentRole}"; use requiresApproval or requiresClarification instead. Refusing to send the phase to the task selector.`,
    );
  }
  const activityContext = Context.current();
  const heartbeatTimer = setInterval(() => {
    activityContext.heartbeat({
      missionId: input.missionId,
      phaseId: phase.id,
      completedTaskIds,
    });
  }, 30_000);
  try {
    const agentRuntime = new MissionAgentRuntime({
      missionId: input.missionId,
      tenantId: input.tenantId || 'tenant-1',
      metadata: agentMemoryMetadata(input),
      agentRuntimeUrl: process.env.AGENT_RUNTIME_URL,
      broadcast: createRuntimeBroadcast(input),
    });
    const selectedTask = await agentRuntime.selectNextTask(
      input.prompt,
      plan,
      phase,
      completedTaskIds,
      completedTaskSummaries,
    );
    return selectedTask.id;
  } finally {
    clearInterval(heartbeatTimer);
  }
}

export async function reviewAndAmendMissionPhaseActivity({
  input,
  plan,
  phase,
  completedTaskSummaries,
  reviewIndex,
}: MissionPhaseReviewActivityInput): Promise<MissionPhaseReviewActivityResult> {
  const activityContext = Context.current();
  const heartbeatTimer = setInterval(() => {
    activityContext.heartbeat({
      missionId: input.missionId,
      phaseId: phase.id,
      reviewIndex,
    });
  }, 30_000);
  try {
    const agentRuntime = new MissionAgentRuntime({
      missionId: input.missionId,
      tenantId: input.tenantId || 'tenant-1',
      metadata: agentMemoryMetadata(input),
      agentRuntimeUrl: process.env.AGENT_RUNTIME_URL,
      broadcast: createRuntimeBroadcast(input),
    });
    const review: MissionPhaseReview = await agentRuntime.reviewPhase(
      input.prompt,
      plan,
      phase,
      completedTaskSummaries,
      reviewIndex,
    );
    const applied = applyPhaseReview(plan, phase.id, review);
    if (applied.amendment) {
      await persistMissionPlan(input, applied.plan);
      await broadcast(input, {
        type: 'phase_plan_amended',
        missionId: input.missionId,
        timestamp: Date.now(),
        data: {
          phaseId: phase.id,
          reviewIndex,
          gaps: applied.gaps,
          task: applied.amendment,
          plan: applied.plan,
          agentId: agentRuntime.getAgentIdForRole('phase-reviewer'),
          agentName: 'Phase Reviewer Agent',
          agentRole: 'phase-reviewer',
        },
      });
    }
    return applied;
  } finally {
    clearInterval(heartbeatTimer);
  }
}

export async function executeMissionTaskActivity({
  input,
  plan,
  phase,
  task,
  completedTaskSummaries = [],
}: MissionTaskActivityInput): Promise<TaskExecutionResult> {
  const activityContext = Context.current();
  const retrying = activityContext.info.attempt > 1;
  const retryGuidance = retrying
    ? input.retryGuidance || 'Resume from the persisted safe checkpoint and action receipts. Do not repeat external actions whose outcome is already recorded or uncertain.'
    : input.retryGuidance;
  const agentRuntime = new MissionAgentRuntime({
    missionId: input.missionId,
    tenantId: input.tenantId || 'tenant-1',
    metadata: agentMemoryMetadata(input),
    agentRuntimeUrl: process.env.AGENT_RUNTIME_URL,
    broadcast: createRuntimeBroadcast(input),
  });
  let agentId = agentRuntime.getAgentIdForRole(task.agentRole);
  const heartbeatTimer = setInterval(() => {
    activityContext.heartbeat({ missionId: input.missionId, phaseId: phase.id, taskId: task.id });
  }, 30_000);

  try {
    if (isHumanAgentRole(task.agentRole)) {
      throw new Error(
        `Mission task "${task.id}" cannot be executed with human agentRole "${task.agentRole}"; represent human decisions with requiresApproval or requiresClarification.`,
      );
    }
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
          agentName: `${task.agentRole.replace(/\s+Agent$/i, '')} Agent`,
          agentRole: task.agentRole,
        },
      });
    }

    const registeredAgentId = await agentRuntime.getOrCreateAgent(task.agentRole, task.systemPrompt);
    agentId = registeredAgentId;
    const executionArgs = [
      registeredAgentId,
      task,
      phase,
      plan,
      retrying,
      DEFAULT_AGENT_EXECUTION_POLICY,
      completedTaskSummaries,
    ] as const;
    const result = retryGuidance
      ? await agentRuntime.executeTask(...executionArgs, retryGuidance)
      : await agentRuntime.executeTask(...executionArgs);
    if (result.interruption) {
      await persistUpdate(input, 'tasks', task.id, {
        phaseId: phase.id,
        status: 'pending',
        output: '',
      });
      await broadcast(input, {
        type: result.interruption.kind === 'user_input' ? 'question_asked' : 'permission_required',
        missionId: input.missionId,
        timestamp: Date.now(),
        data: {
          phaseId: phase.id,
          taskId: task.id,
          taskTitle: task.title,
          agentRole: task.agentRole,
          ...(result.interruption.question ? { question: result.interruption.question } : {}),
          ...(result.interruption.requestId ? { requestId: result.interruption.requestId } : {}),
          ...(result.interruption.permission ? { permission: result.interruption.permission } : {}),
        },
      });
      return result;
    }
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
        agentName: `${task.agentRole.replace(/\s+Agent$/i, '')} Agent`,
        agentRole: task.agentRole,
        artifacts: result.artifacts,
        output: result.output.slice(0, 4_000),
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
        agentName: `${task.agentRole.replace(/\s+Agent$/i, '')} Agent`,
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
  const status = phase.status === 'in_progress'
    ? 'in_progress'
    : phase.requiresApproval
      ? 'awaiting_approval'
      : 'completed';
  await persistUpdate(input, 'phases', phase.id, {
    status,
  });
  if (status === 'in_progress') return;
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
  outputs: { phases: MissionPhaseOutput[]; status: 'completed' | 'incomplete'; gaps?: string[] };
  compensations: Array<{ phaseId: string; action: string }>;
}> {
  const expectedPhaseIds = plan.phases.map((phase) => phase.id);
  const actualPhaseIds = phases.map((phase) => phase.phaseId);
  const expectedTasks = plan.phases.flatMap((phase) => phase.tasks.map((task) => `${phase.id}\u0000${task.id}`));
  const actualTasks = phases.flatMap((phase) => phase.tasks.map((task) => ({
    key: `${phase.phaseId}\u0000${task.taskId}`,
    status: task.status,
  })));
  const gaps: string[] = [];
  if (
    phases.length !== plan.phases.length
    || expectedPhaseIds.some((phaseId) => !actualPhaseIds.includes(phaseId))
    || phases.some((phase) => phase.status !== 'completed')
  ) {
    gaps.push('One or more planned phases are missing or did not complete successfully.');
  }
  if (
    actualTasks.length !== expectedTasks.length
    || actualTasks.some((task) => task.status !== 'completed')
    || expectedTasks.some((taskId) => !actualTasks.some((task) => task.key === taskId))
  ) {
    gaps.push('One or more planned tasks are missing or did not complete successfully.');
  }

  if (gaps.length === 0) {
    const plannedTasks = new Map(plan.phases.flatMap((phase) =>
      phase.tasks.map((task) => [JSON.stringify([phase.id, task.id]), task] as const),
    ));
    const completedTaskSummaries: CompletedTaskSummary[] = phases.flatMap((phase) =>
      phase.tasks.map((task) => {
        const artifacts = task.artifacts || [];
        return {
          taskId: task.taskId,
          output: task.output || '',
          artifactNames: artifacts.map((artifact) => artifact.name),
          artifacts,
          requiredActions: plannedTasks.get(JSON.stringify([phase.phaseId, task.taskId]))?.requiredActions || [],
        };
      }),
    );
    const agentRuntime = new MissionAgentRuntime({
      missionId: input.missionId,
      tenantId: input.tenantId || 'tenant-1',
      metadata: agentMemoryMetadata(input),
      agentRuntimeUrl: process.env.AGENT_RUNTIME_URL,
      broadcast: createRuntimeBroadcast(input),
    });
    const review = await agentRuntime.reviewMissionCompletion(
      input.prompt,
      plan.summary || '',
      completedTaskSummaries,
    );
    if (!review.satisfied) gaps.push(...review.gaps);
  }

  const outputs: { phases: MissionPhaseOutput[]; status: 'completed' | 'incomplete'; gaps?: string[] } = {
    phases,
    status: gaps.length === 0 ? 'completed' : 'incomplete',
    ...(gaps.length > 0 ? { gaps } : {}),
  };
  if (gaps.length > 0) {
    logger.warn({ missionId: input.missionId, gaps }, 'Temporal mission completion review found unmet requirements');
  }
  return { plan, outputs, compensations };
}
