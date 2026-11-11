import { Phase, Plan, Task } from '@stage7-nextgen/shared';
import { missionTaskDependencyIssues } from '../planner/MissionPlanner';

export interface MissionPhaseReview {
  satisfied: boolean;
  gaps: string[];
  followUpTask?: {
    title: string;
    description: string;
    agentRole: string;
    systemPrompt: string;
    expectedArtifacts: string[];
    requiredActions?: NonNullable<Task['requiredActions']>;
  };
}

export interface AppliedPhaseReview {
  plan: Plan;
  phase: Phase;
  satisfied: boolean;
  gaps: string[];
  amendment?: Task;
}

export function applyPhaseReview(
  plan: Plan,
  phaseId: string,
  review: MissionPhaseReview,
): AppliedPhaseReview {
  const phase = plan.phases.find((candidate) => candidate.id === phaseId);
  if (!phase) throw new Error(`Cannot amend missing mission phase ${phaseId}`);
  if (review.satisfied) return { plan, phase, satisfied: true, gaps: review.gaps };

  const followUpTask = review.followUpTask;
  if (!followUpTask) {
    return { plan, phase, satisfied: false, gaps: review.gaps };
  }

  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
  const expectedArtifacts = (artifacts: string[] | undefined) => (artifacts || []).map(normalize).sort();
  const repeatedTask = phase.tasks.find((task) =>
    normalize(task.title) === normalize(followUpTask.title)
    && normalize(task.description) === normalize(followUpTask.description)
    && JSON.stringify(expectedArtifacts(task.expectedArtifacts))
      === JSON.stringify(expectedArtifacts(followUpTask.expectedArtifacts))
    && JSON.stringify(task.requiredActions || []) === JSON.stringify(followUpTask.requiredActions || []),
  );
  if (repeatedTask) {
    return {
      plan,
      phase,
      satisfied: false,
      gaps: [...review.gaps, `Reviewer repeated existing task "${repeatedTask.title}"; no new task was added.`],
    };
  }

  const existingTaskIds = new Set(plan.phases.flatMap((entry) => entry.tasks.map((task) => task.id)));
  let amendmentIndex = 1;
  let taskId = `${phase.id}-amendment-${amendmentIndex}`;
  while (existingTaskIds.has(taskId)) {
    amendmentIndex++;
    taskId = `${phase.id}-amendment-${amendmentIndex}`;
  }
  const dependencies = phase.tasks.map((task) => task.id);
  const completedSideEffectActions = new Set(
    phase.tasks
      .filter((task) => task.status === 'completed')
      .flatMap((task) => (task.requiredActions || [])
      .filter((action) => action.outcome === 'success' && action.toolId.toLowerCase() !== '__list_tools')
      .map((action) => action.toolId.toLowerCase())),
  );
  const repeatedSideEffect = followUpTask.requiredActions?.find((action) =>
    action.outcome === 'success'
    && action.toolId.toLowerCase() !== '__list_tools'
    && completedSideEffectActions.has(action.toolId.toLowerCase()),
  );
  if (repeatedSideEffect) {
    return {
      plan,
      phase,
      satisfied: false,
      gaps: [
        ...review.gaps,
        `Reviewer proposed repeating successful side-effect action "${repeatedSideEffect.toolId}"; no new task was added.`,
      ],
    };
  }

  const dependencyInstructions = phase.tasks.map((task) => {
    const evidenceNames = [...new Set([
      ...(task.expectedArtifacts || []),
      ...task.artifacts.map((artifact) => artifact.name),
    ])];
    const evidence = evidenceNames.length > 0 ? `, including ${evidenceNames.join(', ')}` : '';
    return `Use the outputs produced by task ${task.id}${evidence}`;
  });
  const amendment: Task = {
    id: taskId,
    ...followUpTask,
    systemPrompt: `${followUpTask.systemPrompt.trim()}\n\n${dependencyInstructions.join('. ')} as authoritative phase context, and do not repeat completed work. Stay within the stated mission and phase goals: do not invent unrelated work or create design/specification documents or substitute artifacts unless explicitly requested as deliverables.`,
    requiredActions: [],
    dependsOnTaskIds: dependencies,
    status: 'pending',
    artifacts: [],
  };
  const allTaskIds = new Set(
    [...plan.phases.flatMap((entry) => entry.tasks.map((task) => task.id)), taskId]
      .map((existingTaskId) => existingTaskId.toLowerCase()),
  );
  const taskPath = `phase follow-up "${amendment.title}"`;
  const contractIssues = missionTaskDependencyIssues(amendment, allTaskIds, taskPath);
  if (contractIssues.length > 0) {
    throw new Error(`Phase reviewer proposed an invalid follow-up task: ${contractIssues.join('; ')}`);
  }
  const amendedPhase: Phase = { ...phase, tasks: [...phase.tasks, amendment] };
  const amendedPlan: Plan = {
    ...plan,
    phases: plan.phases.map((entry) => entry.id === phaseId ? amendedPhase : entry),
  };
  return { plan: amendedPlan, phase: amendedPhase, satisfied: false, gaps: review.gaps, amendment };
}
