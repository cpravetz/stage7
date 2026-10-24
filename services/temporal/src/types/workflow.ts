import { Plan, Task } from '@stage7-nextgen/shared';

export interface WorkflowInput {
  missionId: string;
  tenantId: string;
  assistantId: string;
  prompt: string;
  contextChunks?: Array<{ content: string; tokens: number; priority: number }>;
  metadata?: Record<string, unknown>;
  // Resume support: skip already-completed phases/tasks
  resumeFromPhaseId?: string;
  resumeFromTaskId?: string;
  completedPhases?: string[];
  completedTasks?: MissionTaskCheckpoint[];
  retryGuidance?: string;
  clarificationAnswers?: string[];
}

export interface MissionTaskCheckpoint {
  phaseId: string;
  taskId: string;
}

export interface CompletedTaskSummary {
  taskId: string;
  output: string;
  artifactNames: string[];
  artifacts?: Array<{ name: string; type: string; content: string }>;
  requiredActions?: NonNullable<Task['requiredActions']>;
}

export function createCompletedTaskSummary(
  taskId: string,
  output: string,
  artifacts: Array<{ name: string; type: string; content: string }>,
  requiredActions?: NonNullable<Task['requiredActions']>,
): CompletedTaskSummary {
  const textLimit = 1_200;
  const receiptLimit = 16_000;
  const artifactLimit = 5;
  const receipts = artifacts.find((artifact) =>
    artifact.name.toLocaleLowerCase() === 'system-action-receipts.json',
  );
  const selectedArtifacts = [
    ...(receipts ? [receipts] : []),
    ...artifacts.filter((artifact) => artifact !== receipts),
  ].slice(0, artifactLimit);
  return {
    taskId,
    output: output.length > textLimit ? `${output.slice(0, textLimit)} [truncated]` : output,
    artifactNames: artifacts.map((artifact) => artifact.name),
    artifacts: selectedArtifacts.map((artifact) => ({
      name: artifact.name,
      type: artifact.type,
      content: artifact.content.length > (artifact === receipts ? receiptLimit : textLimit)
        ? `${artifact.content.slice(0, artifact === receipts ? receiptLimit : textLimit)} [truncated]`
        : artifact.content,
    })),
    ...(requiredActions ? { requiredActions } : {}),
  };
}

export interface MissionActivityCheckpoint {
  version: 1;
  plan?: Plan;
  completedTasks?: MissionTaskCheckpoint[];
  completedPhases?: string[];
}

export interface WorkflowResult {
  missionId: string;
  status: 'completed' | 'failed' | 'canceled' | 'continued-as-new' | 'awaiting_review' | 'incomplete' | 'paused' | 'pausing' | 'canceling';
  output?: unknown;
  error?: string;
  startedAt: number;
  completedAt?: number;
  input?: WorkflowInput;
}

export interface WorkflowState {
  missionId: string;
  currentStep: number;
  totalSteps: number;
  history: Array<{
    step: number;
    status: 'pending' | 'running' | 'completed' | 'failed';
    startedAt?: number;
    completedAt?: number;
    result?: unknown;
    error?: string;
  }>;
}

export interface ActivityResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
