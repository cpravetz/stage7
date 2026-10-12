import { proxyActivities } from '@temporalio/workflow';
import { logger } from '@stage7-nextgen/shared';
import type { MissionActivities } from '../activities/missionActivity';
import { MissionTaskCheckpoint, WorkflowInput, WorkflowResult } from '../types/workflow';

const planActivities = proxyActivities<MissionActivities>({
  startToCloseTimeout: '10m',
  retry: {
    maximumAttempts: 1,
  },
});

const taskActivities = proxyActivities<MissionActivities>({
  startToCloseTimeout: '2h',
  heartbeatTimeout: '2m',
  retry: {
    maximumAttempts: 2,
    initialInterval: '10s',
    backoffCoefficient: 2,
    maximumInterval: '1m',
  },
});

const phaseActivities = proxyActivities<MissionActivities>({
  startToCloseTimeout: '5m',
  retry: {
    maximumAttempts: 3,
    initialInterval: '5s',
    backoffCoefficient: 2,
    maximumInterval: '30s',
  },
});

const approvalActivities = proxyActivities<MissionActivities>({
  startToCloseTimeout: '25h',
  heartbeatTimeout: '1m',
  retry: {
    maximumAttempts: 1,
  },
});

function shouldSkipPhase(phaseId: string, completedPhases: string[] | undefined): boolean {
  return !!completedPhases?.includes(phaseId);
}

function shouldSkipTask(taskId: string, phaseId: string, completedTasks: MissionTaskCheckpoint[] | undefined): boolean {
  return !!completedTasks?.some((t) => t.phaseId === phaseId && t.taskId === taskId);
}

export async function missionWorkflow(input: WorkflowInput): Promise<WorkflowResult> {
  const startedAt = Date.now();
  const isResume = !!input.resumeFromPhaseId || !!input.completedPhases?.length || !!input.completedTasks?.length;

  if (isResume) {
    logger.info('Mission workflow resuming', {
      missionId: input.missionId,
      resumeFromPhaseId: input.resumeFromPhaseId,
      completedPhases: input.completedPhases,
      completedTasksCount: input.completedTasks?.length,
    });
  }

  try {
    logger.info('Mission workflow started', { missionId: input.missionId });
    const plan = await planActivities.prepareMissionActivity(input);

    if (plan.requiresClarification && plan.clarificationQuestions.length > 0) {
      const result = {
        plan,
        outputs: { status: 'awaiting_clarification', questions: plan.clarificationQuestions },
        compensations: [],
      };
      return {
        missionId: input.missionId,
        status: 'awaiting_review',
        output: result,
        startedAt,
        completedAt: Date.now(),
      };
    }

    const phases: Array<{
      phaseId: string;
      name: string;
      tasks: Array<{
        taskId: string;
        status: 'completed';
        artifacts: Array<{ name: string; type: string; content: string }>;
      }>;
    }> = [];
    const compensations: Array<{ phaseId: string; action: string }> = [];

    for (const phase of plan.phases) {
      // Skip already-completed phases
      if (shouldSkipPhase(phase.id, input.completedPhases)) {
        logger.info('Skipping completed phase', { missionId: input.missionId, phaseId: phase.id });
        continue;
      }

      await phaseActivities.startMissionPhaseActivity({ input, phase });
      const phaseOutput = { phaseId: phase.id, name: phase.name, tasks: [] as typeof phases[number]['tasks'] };

      for (const task of phase.tasks) {
        // Skip already-completed tasks
        if (shouldSkipTask(task.id, phase.id, input.completedTasks)) {
          logger.info('Skipping completed task', { missionId: input.missionId, phaseId: phase.id, taskId: task.id });
          continue;
        }

        const result = await taskActivities.executeMissionTaskActivity({ input, plan, phase, task });
        phaseOutput.tasks.push({
          taskId: task.id,
          status: 'completed',
          artifacts: result.artifacts,
        });
        compensations.push({ phaseId: phase.id, action: `revert-phase-${phase.id}` });
      }

      await phaseActivities.finishMissionPhaseActivity({ input, phase, tasks: phaseOutput.tasks });
      if (phase.requiresApproval) {
        const question = phase.approvalQuestion || `Phase "${phase.name}" complete. Approve to continue?`;
        const decision = await approvalActivities.awaitMissionPhaseApprovalActivity({
          input,
          phase,
          question,
        });
        await phaseActivities.recordMissionPhaseApprovalActivity({ input, phase, decision });
        if (!decision.approved) {
          const result = {
            plan,
            outputs: {
              phases,
              status: 'rejected_at_phase',
              phaseId: phase.id,
              reason: decision.reason,
            },
            compensations,
          };
          return {
            missionId: input.missionId,
            status: 'awaiting_review',
            output: result,
            startedAt,
            completedAt: Date.now(),
          };
        }
      }
      phases.push(phaseOutput);
    }

    const result = await phaseActivities.completeMissionActivity({
      input,
      plan,
      phases,
      compensations,
    });
    const status: WorkflowResult['status'] = result.outputs.status === 'incomplete' ? 'incomplete' : 'completed';
    logger.info('Mission workflow completed', { missionId: input.missionId, status });
    return {
      missionId: input.missionId,
      status,
      output: result,
      startedAt,
      completedAt: Date.now(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Mission workflow failed', { missionId: input.missionId, error: message });
    return {
      missionId: input.missionId,
      status: 'failed',
      error: message,
      startedAt,
      completedAt: Date.now(),
    };
  }
}