import { patched, proxyActivities } from '@temporalio/workflow';
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

const selectionActivities = proxyActivities<MissionActivities>({
  startToCloseTimeout: '2h',
  heartbeatTimeout: '2m',
  retry: {
    maximumAttempts: 1,
  },
});

const phaseReviewActivities = proxyActivities<MissionActivities>({
  startToCloseTimeout: '2h',
  heartbeatTimeout: '2m',
  retry: {
    maximumAttempts: 1,
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
    let plan = await planActivities.prepareMissionActivity(input);

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
    const useAgentTaskSelection = patched('agent-owned-task-selection-v1');
    const useAgentPhaseAmendments = patched('bounded-phase-amendments-v1');
    const completedTaskIds = new Set((input.completedTasks || []).map((task) => task.taskId));
    const completedTaskSummaries = new Map<string, { taskId: string; output: string; artifactNames: string[] }>();

    for (let phaseIndex = 0; phaseIndex < plan.phases.length; phaseIndex++) {
      let phase = plan.phases[phaseIndex]!;
      // Skip already-completed phases
      if (shouldSkipPhase(phase.id, input.completedPhases)) {
        logger.info('Skipping completed phase', { missionId: input.missionId, phaseId: phase.id });
        continue;
      }

      await phaseActivities.startMissionPhaseActivity({ input, phase });
      const phaseOutput = { phaseId: phase.id, name: phase.name, tasks: [] as typeof phases[number]['tasks'] };

      const completedInPhase = new Set(phase.tasks
        .filter((task) => shouldSkipTask(task.id, phase.id, input.completedTasks))
        .map((task) => task.id));

      const executePendingTasks = async () => {
        while (completedInPhase.size < phase.tasks.length) {
          const pendingTasks = phase.tasks.filter((task) => !completedInPhase.has(task.id));
          const readyTasks = pendingTasks.filter((task) =>
            (task.dependsOnTaskIds || []).every((dependencyId) => completedTaskIds.has(dependencyId)),
          );
          if (readyTasks.length === 0) {
            throw new Error(`Mission phase ${phase.id} has pending tasks but no dependency-ready task`);
          }
          const selectedTaskId = useAgentTaskSelection && readyTasks.length > 1
            ? await selectionActivities.selectNextMissionTaskActivity({
              input,
              plan,
              phase,
              completedTaskIds: [...completedTaskIds],
              completedTaskSummaries: [...completedTaskSummaries.values()].slice(-10),
            })
            : readyTasks[0]?.id;
          const task = phase.tasks.find((candidate) => candidate.id === selectedTaskId);
          if (!task || completedInPhase.has(task.id)) {
            throw new Error(`Mission task selector returned an invalid or already completed task for phase ${phase.id}`);
          }
          const unmetDependency = (task.dependsOnTaskIds || [])
            .find((dependencyId) => !completedTaskIds.has(dependencyId));
          if (unmetDependency) {
            throw new Error(`Mission task selector chose ${task.id} before dependency ${unmetDependency} completed`);
          }
          const result = await taskActivities.executeMissionTaskActivity({ input, plan, phase, task });
          phaseOutput.tasks.push({
            taskId: task.id,
            status: 'completed',
            artifacts: result.artifacts,
          });
          compensations.push({ phaseId: phase.id, action: `revert-phase-${phase.id}` });
          completedInPhase.add(task.id);
          completedTaskIds.add(task.id);
          completedTaskSummaries.set(task.id, {
            taskId: task.id,
            output: result.output.slice(0, 1_200),
            artifactNames: result.artifacts.slice(0, 20).map((artifact) => artifact.name),
          });
        }
      };

      await executePendingTasks();
      if (useAgentPhaseAmendments) {
        for (let reviewIndex = 1; ; reviewIndex++) {
          const review = await phaseReviewActivities.reviewAndAmendMissionPhaseActivity({
            input,
            plan,
            phase,
            completedTaskSummaries: [...completedTaskSummaries.values()].slice(-10),
            reviewIndex,
          });
          plan = review.plan;
          phase = review.phase;
          if (review.satisfied) break;
          if (!review.amendment) {
            throw new Error(
              `Mission phase ${phase.id} remains incomplete after bounded amendments: ${review.gaps.join('; ') || 'no review details supplied'}`,
            );
          }
          await executePendingTasks();
        }
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