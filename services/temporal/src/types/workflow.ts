import { MissionArtifact, Plan, Task } from '@stage7-nextgen/shared';

export interface WorkflowInput {
  missionId: string;
  tenantId: string;
  assistantId: string;
  prompt: string;
  cronSchedule?: string;
  contextChunks?: Array<{ content: string; tokens: number; priority: number }>;
  metadata?: Record<string, unknown>;
  // Resume support: skip already-completed phases/tasks
  resumeFromPhaseId?: string;
  resumeFromTaskId?: string;
  completedPhases?: string[];
  completedTasks?: MissionTaskCheckpoint[];
  retryGuidance?: string;
  clarificationAnswers?: string[];
  interactionResponse?: string;
}

export interface MissionTaskCheckpoint {
  phaseId: string;
  taskId: string;
}

export interface MissionPendingInteraction {
  kind: 'user_input' | 'mcp_permission';
  phaseId: string;
  taskId: string;
  taskTitle: string;
  agentRole: string;
  question?: string;
  requestId?: string;
  permission?: {
    toolName: string;
    toolDescription?: string;
    publisher?: string;
    trustTier?: string;
    sideEffectClass?: string;
    dataClasses: string[];
    credentials: { needed: boolean; source?: string; keys: string[] };
    defaultScope: string;
    availableScopes: string[];
    expiresAt?: string;
    explanation: string;
  };
  actionReceipts?: Array<{
    toolId: string;
    isError: boolean;
    content: string;
    outcome: 'success' | 'failure' | 'denied' | 'question_asked' | 'permission_required';
    actionKey?: string;
  }>;
  resumeCount: number;
}

export interface CompletedTaskSummary {
  taskId: string;
  output: string;
  artifactNames: string[];
  artifacts?: MissionArtifact[];
  requiredActions?: NonNullable<Task['requiredActions']>;
}

export function createCompletedTaskSummary(
  taskId: string,
  output: string,
  artifacts: MissionArtifact[],
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
    artifacts: selectedArtifacts.map((artifact) => {
      if (typeof artifact.content === 'string') {
        const contentLimit = artifact === receipts ? receiptLimit : textLimit;
        const mediaType = artifact.mediaType || artifact.mimeType || artifact.contentType || artifact.type || '';
        const isBinary = artifact.contentEncoding === 'base64'
          || (mediaType.includes('/') && !mediaType.startsWith('text/') && !mediaType.includes('json') && !mediaType.includes('xml'));
        return {
          ...artifact,
          content: isBinary
            ? undefined
            : artifact.content.length > contentLimit
              ? `${artifact.content.slice(0, contentLimit)} [truncated]`
              : artifact.content,
          ...(isBinary ? { contentOmitted: true } : {}),
        };
      }
      if (artifact.content !== undefined) {
        const serialized = JSON.stringify(artifact.content);
        const contentLimit = artifact === receipts ? receiptLimit : textLimit;
        return {
          ...artifact,
          content: serialized.length > contentLimit
            ? `${serialized.slice(0, contentLimit)} [truncated]`
            : artifact.content,
        };
      }
      return artifact;
    }),
    ...(requiredActions ? { requiredActions } : {}),
  };
}

export interface MissionActivityCheckpoint {
  version: 1;
  plan?: Plan;
  completedTasks?: MissionTaskCheckpoint[];
  completedPhases?: string[];
  pendingInteraction?: MissionPendingInteraction;
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
