import { Context } from '@temporalio/activity';
import { logger } from '@stage7-nextgen/shared';
import { PlanSchema } from '@stage7-nextgen/shared';
import { MissionOrchestrator } from '../planner/MissionOrchestrator';
import { MissionActivityCheckpoint, MissionTaskCheckpoint, WorkflowInput } from '../types/workflow';
import {
  awaitMissionPhaseApprovalActivity,
  completeMissionActivity,
  executeMissionTaskActivity,
  finishMissionPhaseActivity,
  prepareMissionActivity,
  recordMissionPhaseApprovalActivity,
  reviewAndAmendMissionPhaseActivity,
  selectNextMissionTaskActivity,
  startMissionPhaseActivity,
} from './missionWorkflowActivities';

interface MissionExecutionOptions {
  checkpoint?: MissionActivityCheckpoint;
  heartbeat?: (checkpoint: MissionActivityCheckpoint) => void;
  controlCheckpoint?: () => Promise<void>;
}

function parseCheckpoint(value: unknown): MissionActivityCheckpoint | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) {
    throw new Error('Mission activity received an unsupported heartbeat checkpoint');
  }
  const checkpoint = value as { version: 1; plan?: unknown };
  const plan = checkpoint.plan === undefined ? undefined : PlanSchema.parse(checkpoint.plan);
  const completedTasksValue = (value as { completedTasks?: unknown }).completedTasks;
  if (completedTasksValue !== undefined && !Array.isArray(completedTasksValue)) {
    throw new Error('Mission activity checkpoint contains invalid completed task data');
  }
  const completedTasks = (completedTasksValue || []).map((task): MissionTaskCheckpoint => {
    if (!task || typeof task !== 'object') {
      throw new Error('Mission activity checkpoint contains an invalid task entry');
    }
    const entry = task as Record<string, unknown>;
    if (typeof entry.phaseId !== 'string' || typeof entry.taskId !== 'string') {
      throw new Error('Mission activity checkpoint contains an invalid completed task reference');
    }
    return {
      phaseId: entry.phaseId,
      taskId: entry.taskId,
    };
  });
  const completedPhasesValue = (value as { completedPhases?: unknown }).completedPhases;
  if (
    completedPhasesValue !== undefined
    && (!Array.isArray(completedPhasesValue) || !completedPhasesValue.every((id) => typeof id === 'string'))
  ) {
    throw new Error('Mission activity checkpoint contains invalid completed phase data');
  }
  if (!plan && (completedTasks.length > 0 || (completedPhasesValue as unknown[] | undefined)?.length)) {
    throw new Error('Mission activity checkpoint contains progress without a plan');
  }
  if (plan) {
    const taskKeys = new Set<string>();
    for (const completedTask of completedTasks) {
      const taskKey = JSON.stringify([completedTask.phaseId, completedTask.taskId]);
      if (taskKeys.has(taskKey)) {
        throw new Error(`Mission activity checkpoint duplicates task ${completedTask.taskId}`);
      }
      taskKeys.add(taskKey);
      if (!plan.phases.some((phase) =>
        phase.id === completedTask.phaseId && phase.tasks.some((task) => task.id === completedTask.taskId),
      )) {
        throw new Error(`Mission activity checkpoint references unknown task ${completedTask.taskId}`);
      }
    }
    const phaseIds = new Set<string>();
    for (const phaseId of (completedPhasesValue || []) as string[]) {
      const phase = plan.phases.find((entry) => entry.id === phaseId);
      if (phaseIds.has(phaseId) || !phase) {
        throw new Error(`Mission activity checkpoint references invalid phase ${phaseId}`);
      }
      phaseIds.add(phaseId);
      if (phase.tasks.some((task) => !taskKeys.has(JSON.stringify([phaseId, task.id])))) {
        throw new Error(`Mission activity checkpoint marks incomplete phase ${phaseId} complete`);
      }
    }
  }
  return {
    version: 1,
    ...(plan ? { plan } : {}),
    completedTasks,
    completedPhases: (completedPhasesValue || []) as string[],
  };
}

async function executeMissionActivity(
  input: WorkflowInput,
  options: MissionExecutionOptions = {},
): Promise<any> {
  logger.info({ missionId: input.missionId }, 'Mission activity started');
  let checkpoint = options.checkpoint || { version: 1 as const };
  const heartbeat = () => options.heartbeat?.(checkpoint);
  const saveCheckpoint = (next: MissionActivityCheckpoint) => {
    checkpoint = next;
    heartbeat();
  };
  heartbeat();

  const broadcast = async (event: { type: string; missionId: string; timestamp: number; data?: any }) => {
    const gatewayUrl = process.env.GATEWAY_URL;
    const persistenceUrl = process.env.ARTIFACTS_URL;
    // Persist event to persistence for replay/audit
    if (persistenceUrl) {
      try {
        await fetch(`${persistenceUrl}/api/artifacts/missions/${input.missionId}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        });
      } catch (err) {
        logger.warn({ missionId: input.missionId, err: (err as Error).message }, 'Event persist failed');
      }
    }
    // Broadcast live to mission subscribers
    if (!gatewayUrl) return;
    try {
      await fetch(`${gatewayUrl}/api/gateway/broadcast/mission/${input.missionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
    } catch (err) {
      logger.warn({ missionId: input.missionId, err: (err as Error).message }, 'Broadcast failed');
    }
  };

  const broadcastAll = async (event: { type: string; timestamp: number; data?: any }) => {
    const gatewayUrl = process.env.GATEWAY_URL;
    if (!gatewayUrl) return;
    try {
      await fetch(`${gatewayUrl}/api/gateway/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'Broadcast-all failed');
    }
  };

  const waitForApproval = async (phaseId: string, question: string): Promise<{ approved: boolean; reason?: string }> => {
    logger.info({ missionId: input.missionId, phaseId, question }, 'Phase awaiting approval');
    const persistenceUrl = process.env.ARTIFACTS_URL || 'http://artifacts:4200';
    const startTime = Date.now();
    const timeout = parseInt(process.env.APPROVAL_TIMEOUT_MS || '0', 10) || 24 * 60 * 60 * 1000;
    const pollInterval = parseInt(process.env.APPROVAL_POLL_INTERVAL_MS || '3000', 10);
    let checks = 0;
    const approvalUrl = `${persistenceUrl}/api/artifacts/missions/${input.missionId}/phases/${phaseId}`;
    while (Date.now() - startTime < timeout) {
      await new Promise((r) => setTimeout(r, pollInterval));
      await options.controlCheckpoint?.();
      heartbeat();
      checks++;
      try {
        const controller = new AbortController();
        const fetchPromise = fetch(approvalUrl, { signal: controller.signal });
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetchPromise;
        clearTimeout(timeoutId);
        if (res.ok) {
          const phase = await res.json() as { status: string; rejectionReason?: string };
          if (phase.status === 'approved') return { approved: true };
          if (phase.status === 'rejected') return { approved: false, reason: phase.rejectionReason };
        } else {
          const text = await res.text();
          logger.warn({ missionId: input.missionId, phaseId, status: res.status, checks, url: approvalUrl, body: text.slice(0, 200) }, 'Approval poll returned non-ok');
        }
      } catch (err) {
        logger.warn({ missionId: input.missionId, phaseId, checks, url: approvalUrl, err: (err as Error).message, stack: (err as Error).stack?.slice(0, 300) }, 'Approval poll fetch failed');
      }
    }
    logger.warn({ missionId: input.missionId, phaseId, checks, url: approvalUrl }, 'Approval timeout');
    return { approved: false, reason: 'Approval timeout' };
  };

const orchestrator = new MissionOrchestrator();
  const result = await orchestrator.run({
    missionId: input.missionId,
    prompt: input.prompt,
    tenantId: input.tenantId,
    metadata: input.metadata,
     persistenceUrl: process.env.ARTIFACTS_URL || 'http://artifacts:4200',
     gatewayUrl: process.env.GATEWAY_URL || 'http://gateway:3000',
     agentRuntimeUrl: process.env.AGENT_RUNTIME_URL,
     broadcast,
     broadcastAll,
     waitForApproval,
     ...(options.checkpoint ? { resumeCheckpoint: options.checkpoint } : {}),
     onCheckpoint: saveCheckpoint,
     heartbeat,
     controlCheckpoint: options.controlCheckpoint,
   });

  logger.info({ missionId: input.missionId, phases: result.plan.phases.length }, 'Mission activity completed');
  return result;
}

export async function runMissionActivity(input: WorkflowInput): Promise<any> {
  const activityContext = Context.current();
  const checkpoint = parseCheckpoint(activityContext.info.heartbeatDetails);
  return executeMissionActivity(input, {
    checkpoint,
    heartbeat: (details) => activityContext.heartbeat(details),
  });
}

export async function runMissionDirect(
  input: WorkflowInput,
  checkpoint?: MissionActivityCheckpoint,
  controlCheckpoint?: () => Promise<void>,
): Promise<any> {
  return executeMissionActivity(input, { checkpoint, controlCheckpoint });
}

export const missionActivities = {
  runMissionActivity,
  prepareMissionActivity,
  startMissionPhaseActivity,
  selectNextMissionTaskActivity,
  reviewAndAmendMissionPhaseActivity,
  executeMissionTaskActivity,
  finishMissionPhaseActivity,
  awaitMissionPhaseApprovalActivity,
  recordMissionPhaseApprovalActivity,
  completeMissionActivity,
};
export type MissionActivities = typeof missionActivities;

export async function recordActivityMetrics(missionId: string): Promise<void> {
  logger.info({ missionId }, 'Recording activity metrics');
}

export async function cleanupActivity(missionId: string): Promise<void> {
  logger.info({ missionId }, 'Cleaning up activity resources');
}
