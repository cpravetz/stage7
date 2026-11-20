/**
 * DEPRECATED / NOT WIRED: the runtime executes missions in-process through
 * MissionOrchestrator (runMissionDirect), which checkpoints to Artifacts.
 * This workflow and the per-step activities it proxies are retained only for
 * the workflow-boundary tests; TemporalClient does not start them on this
 * branch. Do not add new behavior here; change MissionOrchestrator instead.
 */
import { patched, proxyActivities, sleep } from '@temporalio/workflow';
import { logger, type Task } from '@stage7-nextgen/shared';
import type { MissionActivities } from '../activities/missionActivity';
import type { MissionPhaseOutput } from '../activities/missionWorkflowActivities';
import { applyRuntimeTaskRequirements } from '../agent/TaskRequirements';
import { dependencyArtifactGaps, missingDependencyInputs } from '../agent/TaskResultParser';
import {
  CompletedTaskSummary,
  createCompletedTaskSummary,
  MissionPendingInteraction,
  MissionTaskCheckpoint,
  WorkflowInput,
  WorkflowResult,
  recoveryTaskDependencies,
  isConfigurationBlocker,
  missionConfigurationQuestion,
  phaseRequirementEvidenceGaps,
  recoveryGapFingerprint,
  recoveryProgressSignature,
  recoveryEvidenceState,
  hasRecoveryProgress,
  hasEvidenceRecoveryProgress,
  isRecoveryTask,
  MAX_DEPENDENCY_INPUT_RERUNS,
  MAX_PHASE_RECOVERY_ROUNDS_SAFETY,
  MAX_MISSION_RECOVERY_ROUNDS_SAFETY,
  MAX_NO_PROGRESS_RECOVERY_ATTEMPTS,
} from '../types/workflow';

const MAX_PHASE_RECOVERY_ROUNDS = MAX_PHASE_RECOVERY_ROUNDS_SAFETY;
const MAX_MISSION_RECOVERY_ROUNDS = MAX_MISSION_RECOVERY_ROUNDS_SAFETY;

function isFatalServiceError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message || String(error);
  const lower = message.toLowerCase();
  if (lower.includes('brain') && (
    lower.includes('exhausted every eligible model')
    || lower.includes('all models unavailable')
    || lower.includes('no eligible model')
  )) {
    return true;
  }
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

const completionActivities = proxyActivities<MissionActivities>({
  startToCloseTimeout: '35m',
  retry: {
    maximumAttempts: 1,
  },
});

const memoryActivities = proxyActivities<MissionActivities>({
  startToCloseTimeout: '35m',
  retry: { maximumAttempts: 1 },
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
  const startedAt = input.startedAt || Date.now();
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
    plan.requiresClarification = false;
    plan.clarificationQuestions = [];
    if (plan.phases.length === 0) {
      plan.summary = plan.summary.trim() || input.prompt;
      plan.phases = [{
        id: 'phase-1',
        name: 'Complete requested outcome',
        goal: input.prompt,
        requiresApproval: false,
        status: 'pending',
        tasks: [{
          id: 'phase-1-task-1',
          title: 'Complete the requested outcome',
          description: input.prompt,
agentRole: 'mission-executor',
          systemPrompt: `Achieve the requested outcome: ${input.prompt}. Do not invent missing information. Try authorized alternatives first; if a specific required value is unavailable and no safe alternative can complete the outcome, ask one focused question for that value.`,
          dependsOnTaskIds: [],
          expectedArtifacts: [],
          requiredActions: [],
          status: 'pending',
          artifacts: [],
        }],
      }];
    }
    for (const phase of plan.phases) {
      phase.requiresApproval = false;
      phase.approvalQuestion = undefined;
      for (const task of phase.tasks) {
        task.requiredActions = [];
        applyRuntimeTaskRequirements(task, input.prompt);
        if (!/\b(?:message|delivery)[-_ ]?(?:message[-_ ]?)?(?:id|status)\b/i.test(input.prompt)) {
          task.expectedArtifacts = (task.expectedArtifacts || []).filter((artifact) =>
            !/\b(?:sms|text|email|message|delivery)[-_ ]?(?:message[-_ ]?)?(?:id|status)\b/i.test(
              artifact.replace(/[_-]+/g, ' '),
            ),
          );
        }
      }
    }

    const phases: MissionPhaseOutput[] = [];
    const compensations: Array<{ phaseId: string; action: string }> = [];
    const useAgentTaskSelection = patched('agent-owned-task-selection-v1');
    const useAgentPhaseAmendments = true;
    const dependencySuccessRequired = patched('dependency-success-required-v1');
    const terminalTaskIds = new Set((input.completedTasks || []).map((task) => task.taskId));
    const completedTaskIds = new Set((input.completedTasks || []).filter((checkpoint) =>
      !dependencySuccessRequired || plan.phases.some((phase) =>
        phase.tasks.some((task) => task.id === checkpoint.taskId && task.status === 'completed'),
      ),
    ).map((task) => task.taskId));
    const completedTaskSummaries = new Map<string, CompletedTaskSummary>();
    let pendingInteraction: MissionPendingInteraction | undefined;
    let uncertainActionIssue = '';
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
              savedTask.requiresExternalAction,
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
      const phaseOutput: MissionPhaseOutput = {
        phaseId: phase.id,
        name: phase.name,
        status: 'completed' as 'completed' | 'incomplete',
        tasks: phase.tasks
          .filter((task) => shouldSkipTask(task.id, phase.id, input.completedTasks))
          .map((task) => ({
            taskId: task.id,
            status: task.status === 'completed' ? 'completed' as const : 'failed' as const,
            artifacts: task.artifacts || [],
            output: task.output || '',
          })),
      };

      const completedInPhase = new Set(phase.tasks
        .filter((task) => shouldSkipTask(task.id, phase.id, input.completedTasks))
        .map((task) => task.id));
      // Guidance injected when a completed task is reopened for a bounded rerun
      // because it did not produce a declared artifact (a missing input), and the
      // per-phase count of those reruns (anti-runaway).
      const taskRerunGuidance = new Map<string, string>();
      const dependencyRerunCounts = new Map<string, number>();

      const executePendingTasks = async () => {
        // A pending task is blocked by a completed dependency that is missing a
        // declared artifact, and that dependency lives in this phase and still has
        // rerun budget left → reopen it so it can produce the artifact.
        const findMissingInputRerun = (taskById: Map<string, Task>): Task | undefined => {
          for (const candidate of phase.tasks) {
            if (completedInPhase.has(candidate.id) || isRecoveryTask(candidate.id)) continue;
            for (const dependencyId of candidate.dependsOnTaskIds || []) {
              const dependency = taskById.get(dependencyId);
              if (!dependency || dependency.status !== 'completed') continue;
              if (!phase.tasks.includes(dependency)) continue;
              if ((dependencyRerunCounts.get(dependency.id) || 0) >= MAX_DEPENDENCY_INPUT_RERUNS) continue;
              if (dependencyArtifactGaps(dependency).length > 0) return dependency;
            }
          }
          return undefined;
        };
        while (completedInPhase.size < phase.tasks.length) {
          const taskById = new Map<string, Task>(
            plan.phases.flatMap((entry) => entry.tasks.map((candidate) => [candidate.id, candidate] as [string, Task])),
          );
          const pendingTasks = phase.tasks.filter((task) => !completedInPhase.has(task.id));
          const readyTasks = pendingTasks.filter((task) =>
            (task.dependsOnTaskIds || []).every((dependencyId) =>
              dependencySuccessRequired && task.id.startsWith(`${phase.id}-amendment-`)
                ? terminalTaskIds.has(dependencyId)
                : completedTaskIds.has(dependencyId),
            )
            // A task is not ready while a dependency that completed without
            // producing its declared artifact is a missing input (recovery/amendment
            // tasks are exempt: they exist to repair gaps and run after all tasks).
            && (!dependencySuccessRequired || isRecoveryTask(task.id) || missingDependencyInputs(task, taskById).length === 0),
          );
          if (readyTasks.length === 0) {
            const rerunDependency = dependencySuccessRequired ? findMissingInputRerun(taskById) : undefined;
            if (rerunDependency) {
              const missing = dependencyArtifactGaps(rerunDependency);
              const attempt = (dependencyRerunCounts.get(rerunDependency.id) || 0) + 1;
              dependencyRerunCounts.set(rerunDependency.id, attempt);
              completedInPhase.delete(rerunDependency.id);
              completedTaskIds.delete(rerunDependency.id);
              terminalTaskIds.delete(rerunDependency.id);
              completedTaskSummaries.delete(rerunDependency.id);
              phaseOutput.tasks = phaseOutput.tasks.filter((entry) => entry.taskId !== rerunDependency.id);
              rerunDependency.status = 'pending';
              taskRerunGuidance.set(
                rerunDependency.id,
                `This task was reopened because a previous run completed without producing required artifact(s): ${missing.join(', ')}. Produce the missing artifact(s) with real content and return them. Do not repeat side-effect actions whose outcome is already recorded; if you cannot produce them, explain the specific blocker.`,
              );
              logger.warn(
                { missionId: input.missionId, phaseId: phase.id, taskId: rerunDependency.id, missing, attempt, max: MAX_DEPENDENCY_INPUT_RERUNS },
                'Reopening a dependency with a missing input for a bounded rerun',
              );
              continue;
            }
            logger.error({ missionId: input.missionId, phaseId: phase.id }, 'Mission phase has pending tasks but no dependency-ready task');
            for (const pendingTask of pendingTasks) {
              if (!completedInPhase.has(pendingTask.id)) {
                pendingTask.status = 'failed';
                pendingTask.output = pendingTask.output || 'No dependency-ready task available (dependency deadlock or missing prerequisite)';
                phaseOutput.tasks.push({
                  taskId: pendingTask.id,
                  status: 'failed',
                  artifacts: pendingTask.artifacts || [],
                  output: pendingTask.output,
                });
                completedInPhase.add(pendingTask.id);
                terminalTaskIds.add(pendingTask.id);
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
                    status: 'failed',
                    artifacts: pendingTask.artifacts || [],
                    output: pendingTask.output,
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
                  status: 'failed',
                  artifacts: pendingTask.artifacts || [],
                  output: pendingTask.output,
                });
                completedInPhase.add(pendingTask.id);
                terminalTaskIds.add(pendingTask.id);
                if (!dependencySuccessRequired) completedTaskIds.add(pendingTask.id);
              }
            }
            break;
          }
          const dependencySet = dependencySuccessRequired && task.id.startsWith(`${phase.id}-amendment-`)
            ? terminalTaskIds : completedTaskIds;
          const unmetDependency = (task.dependsOnTaskIds || [])
            .find((dependencyId: string) => !dependencySet.has(dependencyId));
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
                status: 'failed',
                artifacts: task.artifacts || [],
                output: task.output,
              });
              completedInPhase.add(task.id);
              terminalTaskIds.add(task.id);
              if (!dependencySuccessRequired) completedTaskIds.add(task.id);
              continue;
            }
          }
          try {
            if (!task) break;
            applyRuntimeTaskRequirements(task, input.prompt);
            const result = await taskActivities.executeMissionTaskActivity({
              input,
              plan,
              phase,
              task,
              completedTaskSummaries: [...completedTaskSummaries.values()],
              ...(taskRerunGuidance.has(task.id) ? { taskRetryGuidance: taskRerunGuidance.get(task.id) } : {}),
            });
            if (result.interruption) {
              const interruption = result.interruption;
              pendingInteraction = {
                kind: interruption.kind,
                phaseId: phase.id,
                taskId: task.id,
                taskTitle: task.title,
                agentRole: task.agentRole,
                ...(interruption.question ? { question: interruption.question } : {}),
                ...(interruption.credentialRequest ? { credentialRequest: interruption.credentialRequest } : {}),
                ...(interruption.requestId ? { requestId: interruption.requestId } : {}),
                ...(interruption.permission ? { permission: interruption.permission } : {}),
                actionReceipts: result.actionReceipts || [],
                resumeCount: 0,
              };
              task.status = 'pending';
              task.output = interruption.question || interruption.permission?.explanation || 'Mission is waiting for your response.';
              phaseOutput.tasks.push({
                taskId: task.id,
                status: 'pending',
                artifacts: result.artifacts,
                output: task.output,
              });
              completedInPhase.add(task.id);
              break;
            }
            const taskStatus = result.incompleteReason ? 'incomplete' : 'completed';
            task.status = taskStatus;
            task.output = dependencySuccessRequired && result.incompleteReason && /\buncertain\b|outcome.?unknown/i.test(result.incompleteReason)
              ? result.incompleteReason : result.output;
            task.artifacts = result.artifacts;
            phaseOutput.tasks.push({
              taskId: task.id,
              status: taskStatus,
              artifacts: result.artifacts,
              output: task.output,
            });
            compensations.push({ phaseId: phase.id, action: `revert-phase-${phase.id}` });
            completedInPhase.add(task.id);
            terminalTaskIds.add(task.id);
            if (!dependencySuccessRequired || taskStatus === 'completed') completedTaskIds.add(task.id);
            completedTaskSummaries.set(
              task.id,
              createCompletedTaskSummary(task.id, result.output, result.artifacts, task.requiredActions, task.requiresExternalAction),
            );
            if (dependencySuccessRequired && taskStatus !== 'completed' && /\buncertain\b|outcome.?unknown/i.test(task.output || '')) {
              uncertainActionIssue = task.output;
              break;
            }
          } catch (err) {
            if (isFatalServiceError(err)) throw err;
            if (!task) break;
            logger.error({ missionId: input.missionId, phaseId: phase.id, taskId: task.id, err: err instanceof Error ? err.message : String(err) }, 'Task execution failed');
            task.status = 'failed';
            task.output = err instanceof Error ? err.message : String(err);
            task.artifacts = task.artifacts || [];
            phaseOutput.tasks.push({
              taskId: task.id,
              status: 'failed',
              artifacts: task.artifacts || [],
              output: task.output,
            });
            compensations.push({ phaseId: phase.id, action: `revert-phase-${phase.id}` });
            completedInPhase.add(task.id);
            terminalTaskIds.add(task.id);
            if (!dependencySuccessRequired) completedTaskIds.add(task.id);
            completedTaskSummaries.set(
              task.id,
              createCompletedTaskSummary(task.id, task.output, task.artifacts, task.requiredActions, task.requiresExternalAction),
            );
          }
        }
      };

      await executePendingTasks();
      if (pendingInteraction) {
        phaseOutput.status = 'incomplete';
        phase.status = 'in_progress';
        await phaseActivities.finishMissionPhaseActivity({ input, phase, tasks: phaseOutput.tasks });
        phases.push(phaseOutput);
        const interactionStatus = pendingInteraction.kind === 'user_input'
          ? 'awaiting_user_input'
          : 'awaiting_permission';
        return {
          missionId: input.missionId,
          status: 'awaiting_review',
          output: {
            plan,
            outputs: {
              phases,
              status: interactionStatus,
              pendingInteraction,
            },
          },
          startedAt,
          completedAt: Date.now(),
        };
      }
      if (uncertainActionIssue) {
        phaseOutput.status = 'incomplete';
        phase.status = 'in_progress';
        await phaseActivities.finishMissionPhaseActivity({ input, phase, tasks: phaseOutput.tasks });
        phases.push(phaseOutput);
        break;
      }
      let phaseReviewSatisfied = !useAgentPhaseAmendments
        && phaseOutput.tasks.every((task) => task.status === 'completed');
      if (useAgentPhaseAmendments) {
        let lastReviewSignature: string | undefined;
        let noProgressCount = 0;
        for (let reviewIndex = 1; reviewIndex <= MAX_PHASE_RECOVERY_ROUNDS; reviewIndex++) {
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
            for (const amendedTask of phase.tasks) applyRuntimeTaskRequirements(amendedTask, input.prompt);
            if (review.satisfied) {
              const evidenceGaps = dependencySuccessRequired
                ? phaseRequirementEvidenceGaps(plan, phase.id, phaseOutput)
                : [];
              if (evidenceGaps.length > 0) {
                logger.warn({ missionId: input.missionId, phaseId: phase.id, gaps: evidenceGaps }, 'Phase review contradicted required execution evidence');
                review.satisfied = false;
                review.gaps = evidenceGaps;
              } else {
                phaseReviewSatisfied = true;
                break;
              }
            }
            const reviewSignature = recoveryProgressSignature({
              gaps: review.gaps,
              completedTaskIds: phase.tasks.filter((t) => t.status === 'completed').map((t) => t.id),
              completedTaskStatuses: phase.tasks.map((t) => `${t.id}:${t.status}`),
              ...(dependencySuccessRequired
                ? recoveryEvidenceState(phaseOutput.tasks, phase.tasks.filter((t) => !t.id.includes('-amendment-'))
                  .flatMap((t) => t.expectedArtifacts || []))
                : { artifactNames: phase.tasks.flatMap((t) => (t.artifacts || []).map((a) => a.name)) }),
              outputs: [...completedTaskSummaries.values()].map((s) => s.output),
            });
            const madeProgress = dependencySuccessRequired
              ? hasEvidenceRecoveryProgress(lastReviewSignature, reviewSignature)
              : hasRecoveryProgress(lastReviewSignature, reviewSignature);
            lastReviewSignature = reviewSignature;
            noProgressCount = madeProgress ? 0 : noProgressCount + 1;
            const noProgressGuidance = !madeProgress
              ? ' Previous attempts made no observable progress on the same gaps; use a different authorized approach and do not repeat the same recovery steps. If a required value or authorization is missing, ask the user for it and wait.'
              : '';
            if (!madeProgress && noProgressCount >= MAX_NO_PROGRESS_RECOVERY_ATTEMPTS) {
              logger.error(
                { missionId: input.missionId, phaseId: phase.id, gaps: review.gaps, noProgressCount },
                'Mission phase review made no observable progress after approach changes; pausing for review (safety ceiling)',
              );
              break;
            }
            // A repeated secret/authorization blocker cannot be resolved by
            // replanning: the user has to supply the named value or grant the
            // permission. Pause visibly instead of looping on the same gap.
            if (!madeProgress && isConfigurationBlocker(review.gaps)) {
              const blockingTask = review.amendment || phase.tasks.at(-1);
              if (blockingTask) {
                const question = missionConfigurationQuestion(input.prompt);
                logger.warn(
                  { missionId: input.missionId, phaseId: phase.id, taskId: blockingTask.id, gaps: review.gaps },
                  'Mission phase is blocked on a missing secret or authorization; pausing for the user',
                );
                await phaseActivities.requestMissionUserInputActivity({ input, plan, phase, task: blockingTask, question });
                const pendingInteraction: MissionPendingInteraction = {
                  kind: 'user_input',
                  phaseId: phase.id,
                  taskId: blockingTask.id,
                  taskTitle: blockingTask.title,
                  agentRole: blockingTask.agentRole,
                  question,
                  actionReceipts: [],
                  resumeCount: 0,
                };
                phaseOutput.status = 'incomplete';
                phase.status = 'in_progress';
                await phaseActivities.finishMissionPhaseActivity({ input, phase, tasks: phaseOutput.tasks });
                phases.push(phaseOutput);
                return {
                  missionId: input.missionId,
                  status: 'awaiting_review',
                  output: {
                    plan,
                    outputs: {
                      phases,
                      status: 'awaiting_user_input',
                      pendingInteraction,
                    },
                  },
                  startedAt,
                  completedAt: Date.now(),
                };
              }
            }
            if (review.amendment && noProgressGuidance) {
              review.amendment.systemPrompt = `${review.amendment.systemPrompt}
${noProgressGuidance}`;
            }
            if (!review.amendment) {
              logger.error({ missionId: input.missionId, phaseId: phase.id, gaps: review.gaps }, 'Mission phase remains incomplete and reviewer provided no actionable follow-up task');
              // Try to create a simple follow-up task for remaining gaps
              const amendmentIndex = phase.tasks.filter((t: any) => t.id.startsWith(`${phase.id}-amendment-`)).length + 1;
              const amendmentTask: any = {
                id: `${phase.id}-amendment-${amendmentIndex}`,
                title: `Address phase gaps (review ${reviewIndex})`,
                description: `Address remaining gaps: ${(review.gaps || []).join('; ') || 'unspecified gaps'}`,
agentRole: 'mission-executor',
                systemPrompt: `Mission goal: ${input.prompt}\nPhase goal: ${phase.name} — ${phase.goal}\nResolve the following gaps using the available context and recorded task outputs: ${(review.gaps || []).join('; ') || 'unspecified gaps'}. Focus only on accomplishing the requested mission outcome or reporting a concrete blocker. Do not invent unrelated work, and do not create or request design documents, plans, or substitute artifacts unless the mission goal explicitly requires them as deliverables.${noProgressGuidance}`,
                dependsOnTaskIds: phase.tasks.map((t: any) => t.id),
                expectedArtifacts: [],
                requiredActions: [],
                status: 'pending',
                artifacts: [],
              };
              applyRuntimeTaskRequirements(amendmentTask, input.prompt);
              phase.tasks.push(amendmentTask);
              plan.phases = plan.phases.map((p: any) => p.id === phase.id ? phase : p);
            }
            await executePendingTasks();
            if (uncertainActionIssue) break;
            await sleep(Math.min(60_000, 1_000 * 2 ** Math.min(reviewIndex - 1, 6)));
          } catch (err) {
            if (isFatalServiceError(err)) throw err;
            logger.error({ missionId: input.missionId, phaseId: phase.id, err: err instanceof Error ? err.message : String(err) }, 'Phase review failed');
            await sleep(Math.min(60_000, 1_000 * 2 ** Math.min(reviewIndex - 1, 6)));
          }
        }
      }

      if (!phaseReviewSatisfied) {
        phaseOutput.status = 'incomplete';
        phase.status = 'in_progress';
        await phaseActivities.finishMissionPhaseActivity({ input, phase, tasks: phaseOutput.tasks });
        phases.push(phaseOutput);
        break;
      }

      phase.status = phase.requiresApproval ? 'awaiting_approval' : 'completed';
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
      if (phaseOutput.status === 'completed') {
        await memoryActivities.rollupEntityMemoryActivity(input, plan, phaseOutput);
      }
    }

    if (uncertainActionIssue) {
      return {
        missionId: input.missionId,
        status: 'incomplete',
        output: { plan, outputs: { phases, status: 'incomplete', gaps: [uncertainActionIssue], reason: 'An action outcome is uncertain and must be reconciled before retrying.' }, compensations },
        startedAt,
        completedAt: Date.now(),
      };
    }
    let result = await completionActivities.completeMissionActivity({
      input,
      plan,
      phases,
      compensations,
    });
    let lastCompletionSignature: string | undefined;
    let completionNoProgress = 0;
    let completionVerified = false;
    for (let recoveryIndex = 1; recoveryIndex <= MAX_MISSION_RECOVERY_ROUNDS; recoveryIndex++) {
      if (recoveryIndex > 1) {
        result = await completionActivities.completeMissionActivity({
          input,
          plan,
          phases,
          compensations,
        });
      }
      if (
        result.outputs.status === 'completed'
        && phases.every((phase) => phase.status === 'completed')
      ) {
        completionVerified = true;
        break;
      }

      const gaps = result.outputs.gaps?.length
        ? result.outputs.gaps
        : ['Mission completion has not been verified from the recorded task evidence.'];
      const gapFingerprint = recoveryGapFingerprint(gaps);
      const completionSignature = recoveryProgressSignature({
        gaps,
        completedTaskIds: phases.flatMap((p) => p.tasks.filter((t) => t.status === 'completed').map((t) => t.taskId)),
        completedTaskStatuses: phases.flatMap((p) => p.tasks.map((t) => `${t.taskId}:${t.status}`)),
        ...(dependencySuccessRequired
          ? recoveryEvidenceState(phases.flatMap((p) => p.tasks), plan.phases.flatMap((phase) =>
            phase.tasks.filter((task) => !/-amendment-\d+|-mission-recovery-\d+/i.test(task.id))
              .flatMap((task) => task.expectedArtifacts || [])))
          : { artifactNames: phases.flatMap((p) => p.tasks.flatMap((t) => (t.artifacts || []).map((a) => a.name))) }),
        outputs: phases.flatMap((p) => p.tasks.map((t) => t.output || '')),
      });
      const stagnantGap = gapFingerprint === (lastCompletionSignature?.split('::')[0] || '') && !!lastCompletionSignature;
      const madeProgress = dependencySuccessRequired
        ? hasEvidenceRecoveryProgress(lastCompletionSignature, completionSignature)
        : hasRecoveryProgress(lastCompletionSignature, completionSignature);
      lastCompletionSignature = completionSignature;
      completionNoProgress = madeProgress && (dependencySuccessRequired || !stagnantGap) ? 0 : completionNoProgress + 1;
      const recoveryPhase = plan.phases.find((candidate) =>
        gaps.some((gap) =>
          gap.includes(candidate.id)
          || gap.includes(candidate.name)
          || candidate.tasks.some((task) => gap.includes(task.id)),
        ),
      ) || plan.phases.at(-1);
      if (!recoveryPhase) {
        return {
          missionId: input.missionId,
          status: 'awaiting_review',
          output: {
            ...result,
            outputs: {
              ...result.outputs,
              status: 'awaiting_review',
              gaps,
            },
          },
          startedAt,
          completedAt: Date.now(),
        };
      }
      let phaseOutput = phases.find((candidate) => candidate.phaseId === recoveryPhase.id);
      if (!phaseOutput) {
        phaseOutput = {
          phaseId: recoveryPhase.id,
          name: recoveryPhase.name,
          status: 'incomplete',
          tasks: [],
        };
        phases.push(phaseOutput);
      }
      // Task 7: link recovery evidence to original unmet requirement(s)
      const targetTaskIds = [...new Set(
        recoveryPhase.tasks
          .filter((task) => !task.id.includes('-mission-recovery-') && gaps.some((gap) => gap.includes(task.id) || gap.includes(task.title)))
          .map((task) => task.id),
      )];

      if (completionNoProgress >= MAX_NO_PROGRESS_RECOVERY_ATTEMPTS) {
        logger.error(
          { missionId: input.missionId, gaps, completionNoProgress },
          'Mission completion recovery made no observable progress after approach changes; pausing for review (safety ceiling)',
        );
        return {
          missionId: input.missionId,
          status: 'awaiting_review',
          output: {
            ...result,
            outputs: { ...result.outputs, status: 'awaiting_review', gaps },
          },
          startedAt,
          completedAt: Date.now(),
        };
      }
      const noProgressGuidance = !madeProgress || stagnantGap
        ? ' Previous attempts made no observable progress on the same gaps; use a different authorized approach and do not repeat the same recovery steps. If a required value or authorization is missing, ask the user for it and wait.'
        : '';

      const availableArtifacts = new Set(phaseOutput.tasks.flatMap((task) =>
        task.artifacts.map((artifact) => artifact.name.toLocaleLowerCase()),
      ));
      const expectedArtifacts = [...new Set(recoveryPhase.tasks.flatMap((task) => task.expectedArtifacts || []))]
        .filter((name) => !availableArtifacts.has(name.toLocaleLowerCase()));
      const taskIds = recoveryTaskDependencies(
        recoveryPhase.tasks,
        completedTaskSummaries.values(),
        targetTaskIds,
      );
      const existingTaskIds = new Set(plan.phases.flatMap((phase) => phase.tasks.map((task) => task.id)));
      let taskNumber = recoveryIndex;
      while (existingTaskIds.has(`${recoveryPhase.id}-mission-recovery-${taskNumber}`)) taskNumber++;
      const recoveryTask: any = {
        id: `${recoveryPhase.id}-mission-recovery-${taskNumber}`,
        title: `Resolve mission completion gaps (attempt ${recoveryIndex})`,
        description: `Resolve missing deliverables: ${expectedArtifacts.join(', ') || 'required artifacts'}.`,
        agentRole: 'mission-executor',
        systemPrompt: `Resolve missing deliverables for mission goal "${input.prompt}" in phase "${recoveryPhase.name}". Produce ${expectedArtifacts.join(', ') || 'the required artifacts'}. Use recorded task outputs as context. Execute tools, not plans.${noProgressGuidance}`,
        expectedArtifacts,
        requiredActions: [],
        dependsOnTaskIds: taskIds,
        status: 'pending',
        artifacts: [],
      };
      applyRuntimeTaskRequirements(recoveryTask, input.prompt);
      recoveryPhase.tasks.push(recoveryTask);
      recoveryPhase.status = 'in_progress';
      phaseOutput.status = 'incomplete';
      await phaseActivities.startMissionPhaseActivity({ input, phase: recoveryPhase });

      let output: string;
      let artifacts: any[] = [];
      let taskStatus: 'completed' | 'incomplete' | 'failed' | 'pending' = 'completed';
      let recoveryInterruption: MissionPendingInteraction | undefined;
      try {
        const recovery = await taskActivities.executeMissionTaskActivity({
          input,
          plan,
          phase: recoveryPhase,
          task: recoveryTask,
          completedTaskSummaries: [...completedTaskSummaries.values()],
        });
        output = recovery.output;
        artifacts = recovery.artifacts;
        if (recovery.incompleteReason) taskStatus = 'incomplete';
        if (recovery.interruption) {
          const interruption = recovery.interruption;
          recoveryInterruption = {
            kind: interruption.kind,
            phaseId: recoveryPhase.id,
            taskId: recoveryTask.id,
            taskTitle: recoveryTask.title,
            agentRole: recoveryTask.agentRole,
            ...(interruption.question ? { question: interruption.question } : {}),
            ...(interruption.credentialRequest ? { credentialRequest: interruption.credentialRequest } : {}),
            ...(interruption.requestId ? { requestId: interruption.requestId } : {}),
            ...(interruption.permission ? { permission: interruption.permission } : {}),
            actionReceipts: recovery.actionReceipts || [],
            resumeCount: 0,
          };
          output = interruption.question || interruption.permission?.explanation || 'Mission is waiting for your response.';
          taskStatus = 'pending';
        }
      } catch (error) {
        if (isFatalServiceError(error)) throw error;
        taskStatus = 'failed';
        output = error instanceof Error ? error.message : String(error);
      }

      recoveryTask.status = taskStatus;
      recoveryTask.output = output;
      recoveryTask.artifacts = artifacts;
      recoveryTask.completedAt = Date.now();
      phaseOutput.tasks.push({
        taskId: recoveryTask.id,
        status: taskStatus,
        artifacts,
        output,
      });
      if (recoveryInterruption) {
        recoveryPhase.status = 'in_progress';
        phaseOutput.status = 'incomplete';
        await phaseActivities.finishMissionPhaseActivity({
          input,
          phase: recoveryPhase,
          tasks: phaseOutput.tasks,
        });
        return {
          missionId: input.missionId,
          status: 'awaiting_review',
          output: {
            plan,
            outputs: {
              phases,
              status: recoveryInterruption.kind === 'user_input'
                ? 'awaiting_user_input'
                : 'awaiting_permission',
              pendingInteraction: recoveryInterruption,
            },
          },
          startedAt,
          completedAt: Date.now(),
        };
      }
      completedTaskIds.add(recoveryTask.id);
      completedTaskSummaries.set(
        recoveryTask.id,
        createCompletedTaskSummary(recoveryTask.id, output, artifacts, recoveryTask.requiredActions, recoveryTask.requiresExternalAction, undefined, { taskIds: targetTaskIds, gaps }),
      );
      recoveryPhase.status = 'completed';
      phaseOutput.status = 'completed';
      await phaseActivities.finishMissionPhaseActivity({
        input,
        phase: recoveryPhase,
        tasks: phaseOutput.tasks,
      });
      if (taskStatus !== 'completed') {
        const incompleteResult = await completionActivities.completeMissionActivity({
          input, plan, phases, compensations,
        });
        return {
          missionId: input.missionId,
          status: 'awaiting_review',
          output: {
            ...incompleteResult,
            outputs: {
              ...incompleteResult.outputs,
              status: 'awaiting_review',
              gaps: incompleteResult.outputs.gaps?.length
                ? incompleteResult.outputs.gaps
                : ['Mission recovery did not complete successfully.'],
            },
          },
          startedAt,
          completedAt: Date.now(),
        };
      }
      await sleep(Math.min(60_000, 1_000 * 2 ** Math.min(recoveryIndex - 1, 6)));
    }
    if (!completionVerified) {
      result = await completionActivities.completeMissionActivity({
        input,
        plan,
        phases,
        compensations,
      });
      if (result.outputs.status !== 'completed') {
        return {
          missionId: input.missionId,
          status: 'awaiting_review',
          output: result,
          startedAt,
          completedAt: Date.now(),
        };
      }
    }
    const hasUnsuccessfulPhase = phases.some((phase) => phase.status !== 'completed');
    const status: WorkflowResult['status'] =
      hasUnsuccessfulPhase ? 'incomplete' : 'completed';
    const workflowGaps = phases.flatMap((phase) => [
      ...(phase.status !== 'completed'
        ? [`Phase "${phase.name}" (${phase.phaseId}) did not complete successfully.`]
        : []),
    ]);
    const output = status === 'incomplete'
      ? {
        ...result,
        outputs: {
          ...result.outputs,
          status: 'incomplete' as const,
          gaps: workflowGaps.length > 0
            ? workflowGaps
            : ['Mission completion validation found an incomplete phase or task not represented in the review result.'],
        },
      }
      : result;
    if (status === 'completed') {
      await completionActivities.notifyMissionCompletedActivity(input, plan, phases);
    }
    logger.info('Mission workflow completed', { missionId: input.missionId, status });
    return {
      missionId: input.missionId,
      status,
      output,
      startedAt,
      completedAt: Date.now(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Mission workflow failed', { missionId: input.missionId, error: message });
    const fatal = isFatalServiceError(error);
    return {
      missionId: input.missionId,
      status: fatal ? 'failed' : 'incomplete',
      ...(fatal
        ? { error: message }
        : {
          output: {
            outputs: {
              status: 'incomplete',
              gaps: ['A recoverable issue stopped this attempt before the mission was complete. Resume the mission to continue.'],
            },
          },
        }),
      startedAt,
      completedAt: Date.now(),
    };
  }
}