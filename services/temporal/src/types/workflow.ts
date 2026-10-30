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

export interface MissionCredentialRequest {
  executionId: string;
  toolId: string;
  toolName: string;
  missingCredentials: Array<{ key: string; label: string }>;
}

export interface MissionPendingInteraction {
  kind: 'user_input' | 'mcp_permission';
  phaseId: string;
  taskId: string;
  taskTitle: string;
  agentRole: string;
  question?: string;
  credentialRequest?: MissionCredentialRequest;
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
    fallbackForToolId?: string;
    resolvedToolId?: string;
  }>;
  resumeCount: number;
}

export interface CompletedTaskSummary {
  taskId: string;
  output: string;
  artifactNames: string[];
  artifacts?: MissionArtifact[];
  expectedArtifacts?: string[];
  requiredActions?: NonNullable<Task['requiredActions']>;
}

export interface MissionPhaseEvidence {
  phaseId: string;
  status: string;
  tasks: Array<{
    taskId: string;
    status: string;
    artifacts: MissionArtifact[];
    output?: string;
  }>;
}

export function missionExecutionEvidenceGaps(plan: Plan, phases: MissionPhaseEvidence[]): string[] {
  const gaps: string[] = [];
  const phaseById = new Map(phases.map((phase) => [phase.phaseId, phase]));
  const plannedPhaseIds = new Set(plan.phases.map((phase) => phase.id));
  for (const phase of phases) {
    if (!plannedPhaseIds.has(phase.phaseId)) {
      gaps.push(`Execution returned unplanned phase "${phase.phaseId}".`);
    }
  }

  for (const plannedPhase of plan.phases) {
    const phase = phaseById.get(plannedPhase.id);
    if (!phase) {
      gaps.push(`Phase "${plannedPhase.name}" (${plannedPhase.id}) has no execution result.`);
      continue;
    }
    if (phase.status !== 'completed') {
      gaps.push(`Phase "${plannedPhase.name}" (${plannedPhase.id}) is ${phase.status}, not completed.`);
    }

    const tasksById = new Map(phase.tasks.map((task) => [task.taskId, task]));
    const plannedTaskIds = new Set(plannedPhase.tasks.map((task) => task.id));
    for (const task of phase.tasks) {
      if (!plannedTaskIds.has(task.taskId)) {
        gaps.push(`Phase "${plannedPhase.name}" returned unplanned task "${task.taskId}".`);
      }
    }
    for (const plannedTask of plannedPhase.tasks) {
      const task = tasksById.get(plannedTask.id);
      if (!task) {
        gaps.push(`Task "${plannedTask.title}" (${plannedTask.id}) has no execution result in phase "${plannedPhase.name}".`);
        continue;
      }
      if (task.status !== 'completed') {
        const detail = task.output?.trim();
        gaps.push(
          `Task "${plannedTask.title}" (${plannedTask.id}) is ${task.status}, not completed.`
          + (detail ? ` Reason: ${detail.slice(0, 500)}` : ''),
        );
        continue;
      }

      const artifacts = task.artifacts || [];
      const receiptArtifact = artifacts.find((artifact) =>
        artifact.name.toLocaleLowerCase() === 'system-action-receipts.json',
      );
      let receipts: Array<{ toolId: string; outcome: string; content?: string; fallbackForToolId?: string }> = [];
      if (typeof receiptArtifact?.content === 'string') {
        try {
          const parsed: unknown = JSON.parse(receiptArtifact.content);
          if (Array.isArray(parsed)) {
            receipts = parsed.filter((receipt): receipt is { toolId: string; outcome: string; content?: string; fallbackForToolId?: string } =>
              Boolean(receipt)
              && typeof receipt === 'object'
              && typeof (receipt as Record<string, unknown>).toolId === 'string'
              && typeof (receipt as Record<string, unknown>).outcome === 'string'
              && ((receipt as Record<string, unknown>).fallbackForToolId === undefined
                || typeof (receipt as Record<string, unknown>).fallbackForToolId === 'string')
              && ((receipt as Record<string, unknown>).content === undefined
                || typeof (receipt as Record<string, unknown>).content === 'string'),
            );
          }
        } catch {
          gaps.push(
            `Task "${plannedTask.title}" (${plannedTask.id}) has an unreadable action-receipt record; required actions cannot be verified.`,
          );
        }
      }

      const availableReceipts = [...receipts];
      for (const required of plannedTask.requiredActions || []) {
        const receiptIndex = availableReceipts.findIndex((receipt) =>
          (receipt.toolId === required.toolId
            || (receipt.toolId !== '__create_tool'
              && required.outcome === 'success'
              && receipt.outcome === 'success'
              && receipt.fallbackForToolId === required.toolId))
          && receipt.outcome === required.outcome,
        );
        if (receiptIndex >= 0) {
          availableReceipts.splice(receiptIndex, 1);
          continue;
        }
        const failed = receipts.find((receipt) =>
          receipt.toolId === required.toolId && receipt.outcome !== required.outcome,
        ) || receipts.find((receipt) =>
          receipt.fallbackForToolId === required.toolId && receipt.outcome !== 'success',
        ) || receipts.find((receipt) => receipt.outcome === 'failure');
        gaps.push(
          `Task "${plannedTask.title}" (${plannedTask.id}) did not satisfy required action "${required.toolId}" with outcome "${required.outcome}".`
          + (failed
            ? ` Tool "${failed.toolId}" recorded ${failed.outcome}${failed.content ? `: ${failed.content.slice(0, 500)}` : '.'}`
            : ` No matching action receipt was recorded. Recorded tool IDs: ${receipts.map((receipt) => receipt.toolId).join(', ') || 'none'}.`),
        );
      }

      const normalize = (value: string) => value.trim().toLocaleLowerCase();
      for (const expectedName of plannedTask.expectedArtifacts) {
        if (normalize(expectedName) === 'system-action-receipts.json') continue;
        const artifact = artifacts.find((candidate) => normalize(candidate.name) === normalize(expectedName));
        const artifactContent = typeof artifact?.content === 'string' ? artifact.content.trim() : '';
        const isBlocker = artifactContent.length > 0
          && (
            /^\s*(?:\*\*)?Blocker(?:\*\*)?\s*:/i.test(artifactContent)
            || /^\s*(?:Execution outcome|Artifact status)\b.{0,120}\b(?:blocked|failed|not created)\b/i.test(artifactContent)
          );
        const isDeliverable = artifact
          && artifact.purpose !== 'execution-outcome'
          && artifact.status !== 'blocked'
          && !isBlocker
          && (artifactContent.length > 0 || artifact.url !== undefined || artifact.data !== undefined);
        if (isDeliverable) continue;

        const reason = isBlocker
          ? ` The task reported: ${artifactContent.slice(0, 500)}`
          : artifact?.purpose === 'execution-outcome'
            ? ` The matching record is an execution outcome, not the requested artifact${artifactContent ? `: ${artifactContent.slice(0, 500)}` : '.'}`
            : ' No non-empty deliverable content or file reference was recorded.';
        gaps.push(
          `Task "${plannedTask.title}" (${plannedTask.id}) is missing expected artifact "${expectedName}".${reason}`,
        );
      }
    }
  }
  return [...new Set(gaps)];
}

export function createCompletedTaskSummary(
  taskId: string,
  output: string,
  artifacts: MissionArtifact[],
  requiredActions?: NonNullable<Task['requiredActions']>,
  expectedArtifacts?: string[],
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
    ...(expectedArtifacts ? { expectedArtifacts } : {}),
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
