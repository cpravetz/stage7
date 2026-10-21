import { patched, proxyActivities } from '@temporalio/workflow';
import { logger } from '@stage7-nextgen/shared';
import type { MissionActivities } from '../activities/missionActivity';
import {
  CompletedTaskSummary,
  createCompletedTaskSummary,
  MissionTaskCheckpoint,
  WorkflowInput,
  WorkflowResult,
} from '../types/workflow';

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


const planActivities = proxyActivities<MissionActivities>({
  // The planner asks Brain for a plan, and Brain may spend its whole
  // completion deadline on a slow provider before it answers. This has to
  // outlast the Brain completion deadline plus the Agent Runtime grace
  // period, or the activity is killed while Brain is still working.
  startToCloseTimeout: '35m',
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
    const completedTaskSummaries = new Map<string, CompletedTaskSummary>();
    for (const savedPhase of plan.phases) {
      for (const savedTask of savedPhase.tasks) {
        if (
          savedTask.status === 'completed'
          && (savedTask.output || savedTask.artifacts.length > 0)
        ) {
          completedTaskSummaries.set(
            savedTask.id,
            createCompletedTaskSummary(
              savedTask.id,
              savedTask.output || '',
              savedTask.artifacts,
              savedTask.requiredActions,
            ),
          );
        }
      }
    }

    for (let phaseIndex = 0; phaseIndex < plan.phases.length; phaseIndex++) {
      let phase = plan.phases[phaseIndex]!;
      // Skip already-completed phases
      if (shouldSkipPhase(phase.id, input.completedPhases)) {
        logger.info('Skipping completed phase', { missionId: input.missionId, phaseId: phase.id });
        continue;
      }

      await phaseActivities.startMissionPhaseActivity({ input, phase });
      phase.status = 'in_progress';
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
            logger.error({ missionId: input.missionId, phaseId: phase.id }, 'Mission phase has pending tasks but no dependency-ready task');
            for (const pendingTask of pendingTasks) {
              if (!completedInPhase.has(pendingTask.id)) {
                pendingTask.status = 'failed';
                pendingTask.output = pendingTask.output || 'No dependency-ready task available (dependency deadlock or missing prerequisite)';
                phaseOutput.tasks.push({
                  taskId: pendingTask.id,
                  status: 'failed' as any,
                  artifacts: pendingTask.artifacts || [],
                });
                completedInPhase.add(pendingTask.id);
              }
            }
            break;
          }
          let selectedTaskId: string | undefined;
          try {
            selectedTaskId = useAgentTaskSelection && readyTasks.length > 1
              ? await selectionActivities.selectNextMissionTaskActivity({
                input,
                plan,
                phase,
                completedTaskIds: [...completedTaskIds],
                completedTaskSummaries: [...completedTaskSummaries.values()].slice(-10),
              })
              : readyTasks[0]?.id;
          } catch (err) {
            if (isFatalServiceError(err)) throw err;
            logger.error({ missionId: input.missionId, phaseId: phase.id, err: err instanceof Error ? err.message : String(err) }, 'Task selection failed; falling back to first ready task');
            selectedTaskId = readyTasks[0]?.id;
          }
          let task: any = phase.tasks.find((candidate) => candidate.id === selectedTaskId);
          if (!task || completedInPhase.has(task.id)) {
            logger.error({ missionId: input.missionId, phaseId: phase.id, selectedTaskId }, 'Mission task selector returned an invalid or already completed task');
            // pick first ready task as fallback
            task = readyTasks.find((t) => !completedInPhase.has(t.id));
            if (!task) {
              for (const pendingTask of pendingTasks) {
                if (!completedInPhase.has(pendingTask.id)) {
                  pendingTask.status = 'failed';
                  pendingTask.output = pendingTask.output || 'Task selection returned invalid task';
                  phaseOutput.tasks.push({
                    taskId: pendingTask.id,
                    status: 'failed' as any,
                    artifacts: pendingTask.artifacts || [],
                  });
                  completedInPhase.add(pendingTask.id);
                }
              }
              break;
            }
          }
          if (!task) {
            for (const pendingTask of pendingTasks) {
              if (!completedInPhase.has(pendingTask.id)) {
                pendingTask.status = 'failed';
                pendingTask.output = pendingTask.output || 'No task selected';
                phaseOutput.tasks.push({
                  taskId: pendingTask.id,
                  status: 'failed' as any,
                  artifacts: pendingTask.artifacts || [],
                });
                completedInPhase.add(pendingTask.id);
                completedTaskIds.add(pendingTask.id);
              }
            }
            break;
          }
          const unmetDependency = (task.dependsOnTaskIds || [])
            .find((dependencyId: string) => !completedTaskIds.has(dependencyId));
          if (unmetDependency) {
            logger.error({ missionId: input.missionId, phaseId: phase.id, taskId: task.id, unmetDependency }, 'Mission task selector chose task before dependency completed');
            // try to pick a dependency-ready task instead
            const fallback = readyTasks.find((t: any) => (t.dependsOnTaskIds || []).every((d: string) => completedTaskIds.has(d)) && t.id !== task.id);
            if (fallback) {
              task = fallback;
            } else {
              task.status = 'failed';
              task.output = task.output || `Chose before dependency ${unmetDependency} completed`;
              phaseOutput.tasks.push({
                taskId: task.id,
                status: 'failed' as any,
                artifacts: task.artifacts || [],
              });
              completedInPhase.add(task.id);
              completedTaskIds.add(task.id);
              continue;
            }
          }
          try {
            if (!task) break;
            const result = await taskActivities.executeMissionTaskActivity({
              input,
              plan,
              phase,
              task,
              completedTaskSummaries: [...completedTaskSummaries.values()],
            });
            task.status = 'completed';
            task.output = result.output;
            task.artifacts = result.artifacts;
            phaseOutput.tasks.push({
              taskId: task.id,
              status: 'completed',
              artifacts: result.artifacts,
            });
            compensations.push({ phaseId: phase.id, action: `revert-phase-${phase.id}` });
            completedInPhase.add(task.id);
            completedTaskIds.add(task.id);
            completedTaskSummaries.set(
              task.id,
              createCompletedTaskSummary(task.id, result.output, result.artifacts, task.requiredActions),
            );
          } catch (err) {
            if (isFatalServiceError(err)) throw err;
            if (!task) break;
            logger.error({ missionId: input.missionId, phaseId: phase.id, taskId: task.id, err: err instanceof Error ? err.message : String(err) }, 'Task execution failed');
            task.status = 'failed';
            task.output = err instanceof Error ? err.message : String(err);
            task.artifacts = task.artifacts || [];
            phaseOutput.tasks.push({
              taskId: task.id,
              status: 'failed' as any,
              artifacts: task.artifacts || [],
            });
            compensations.push({ phaseId: phase.id, action: `revert-phase-${phase.id}` });
            completedInPhase.add(task.id);
            completedTaskIds.add(task.id);
            completedTaskSummaries.set(
              task.id,
              createCompletedTaskSummary(task.id, task.output, task.artifacts, task.requiredActions),
            );
          }
        }
      };

      await executePendingTasks();
      if (useAgentPhaseAmendments) {
        for (let reviewIndex = 1; reviewIndex <= 10; reviewIndex++) {
          try {
            const review = await phaseReviewActivities.reviewAndAmendMissionPhaseActivity({
              input,
              plan,
              phase,
              completedTaskSummaries: [...completedTaskSummaries.values()],
              reviewIndex,
            });
            plan = review.plan;
            phase = review.phase;
            if (review.satisfied) break;
            if (!review.amendment) {
              logger.error({ missionId: input.missionId, phaseId: phase.id, gaps: review.gaps }, 'Mission phase remains incomplete and reviewer provided no actionable follow-up task');
              // Try to create a simple follow-up task for remaining gaps
              const amendmentIndex = phase.tasks.filter((t: any) => t.id.startsWith(`${phase.id}-amendment-`)).length + 1;
              const amendmentTask: any = {
                id: `${phase.id}-amendment-${amendmentIndex}`,
                title: `Address phase gaps (review ${reviewIndex})`,
                description: `Address remaining gaps: ${(review.gaps || []).join('; ') || 'unspecified gaps'}`,
                agentRole: 'engineer',
                systemPrompt: `Resolve the following gaps for phase ${phase.name}: ${(review.gaps || []).join('; ')}. Use available context and produce concrete artifacts.`,
                dependsOnTaskIds: phase.tasks.map((t: any) => t.id),
                expectedArtifacts: [],
                requiredActions: [],
                status: 'pending',
                artifacts: [],
              };
              phase.tasks.push(amendmentTask);
              plan.phases = plan.phases.map((p: any) => p.id === phase.id ? phase : p);
              await executePendingTasks();
              continue;
            }
            await executePendingTasks();
          } catch (err) {
            if (isFatalServiceError(err)) throw err;
            logger.error({ missionId: input.missionId, phaseId: phase.id, err: err instanceof Error ? err.message : String(err) }, 'Phase review failed');
            break;
          }
        }
      }

      await phaseActivities.finishMissionPhaseActivity({ input, phase, tasks: phaseOutput.tasks });
      if (phase.requiresApproval) {
        const question = phase.approvalQuestion || `Phase "${phase.name}" complete. Approve to continue?`;
        phase.status = 'awaiting_approval';
        phase.approvalQuestion = question;
        const decision = await approvalActivities.awaitMissionPhaseApprovalActivity({
          input,
          phase,
          question,
        });
        await phaseActivities.recordMissionPhaseApprovalActivity({ input, phase, decision });
        if (!decision.approved) {
          phase.status = 'rejected';
          phase.rejectionReason = decision.reason;
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
        phase.status = 'approved';
      } else {
        phase.status = 'completed';
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