import { Plan } from '@stage7-nextgen/shared';
import { MissionActivityCheckpoint } from '../types/workflow';

export interface MissionResumeProgress {
  checkpoint: MissionActivityCheckpoint;
  resumeFromPhaseId?: string;
  resumeFromTaskId?: string;
}

export function getMissionResumeProgress(plan: Plan): MissionResumeProgress {
  const completedTasks = plan.phases.flatMap((phase) =>
    phase.tasks
      .filter((task) => task.status === 'completed')
      .map((task) => ({ phaseId: phase.id, taskId: task.id })),
  );
  const completedTaskKeys = new Set(
    completedTasks.map((task) => JSON.stringify([task.phaseId, task.taskId])),
  );
  const completedPhases = plan.phases
    .filter((phase) =>
      phase.status === 'completed'
      && phase.tasks.every((task) => completedTaskKeys.has(JSON.stringify([phase.id, task.id]))),
    )
    .map((phase) => phase.id);

  let resumeFromPhaseId: string | undefined;
  let resumeFromTaskId: string | undefined;
  for (const phase of plan.phases) {
    const firstIncompleteTask = phase.tasks.find((task) => task.status !== 'completed');
    if (firstIncompleteTask) {
      resumeFromPhaseId = phase.id;
      resumeFromTaskId = firstIncompleteTask.id;
      break;
    }
    if (phase.status !== 'completed' && phase.tasks.length === 0) {
      resumeFromPhaseId = phase.id;
      break;
    }
  }

  return {
    checkpoint: { version: 1, plan, completedTasks, completedPhases },
    ...(resumeFromPhaseId ? { resumeFromPhaseId } : {}),
    ...(resumeFromTaskId ? { resumeFromTaskId } : {}),
  };
}
