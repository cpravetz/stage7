import {
  MissionArtifact,
  Plan,
  Task,
  extractReceiptBinding,
  receiptMatchesRequiredAction,
  describeRequiredAction,
  type ActionReceiptLike,
  type RequiredActionLike,
} from '@stage7-nextgen/shared';

export interface WorkflowInput {
  missionId: string;
  tenantId: string;
  assistantId: string;
  prompt: string;
  contextChunks?: Array<{ content: string; tokens: number; priority: number }>;
  metadata?: Record<string, unknown>;
  startedAt?: number;
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
  actionReceipts?: Array<ActionReceiptLike & {
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
  requiresExternalAction?: boolean;
  /** Task 7: original unmet requirement(s) this recovery work/evidence targets. */
  resolvesTaskIds?: string[];
  resolvesGaps?: string[];
}

export function completedTaskIdsWithSummaries(
  taskIds: string[],
  summaries: Iterable<Pick<CompletedTaskSummary, 'taskId'>>,
): string[] {
  const summarizedTaskIds = new Set(Array.from(summaries, (summary) => summary.taskId));
  return taskIds.filter((taskId) => summarizedTaskIds.has(taskId));
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

export function recoveryGapFingerprint(gaps: string[]): string {
  return [...new Set(gaps.map((gap) =>
    gap
      .toLocaleLowerCase()
      .replace(/\b(?:attempt|review)\s+\d+\b/g, '')
      .replace(/\bphase-[\w-]+\b/g, '<phase>')
      .replace(/\btask-[\w-]+\b/g, '<task>')
      .replace(/\s+/g, ' ')
      .trim(),
  ))]
    .sort()
    .join('|');
}
function normalizeEvidenceToken(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

export interface RecoveryProgressObservation {
  gaps: string[];
  completedTaskIds?: string[];
  completedTaskStatuses?: string[];
  artifactNames?: string[];
  receiptOps?: string[];
  outputs?: string[];
}

export function recoveryProgressSignature(obs: RecoveryProgressObservation): string {
  const gapFp = recoveryGapFingerprint(obs.gaps);
  // Exclude recovery/amendment/config scaffolding so adding a recovery task that
  // doesn't resolve anything is not misread as progress. Include only resolution
  // evidence state (non-scaffold task outcomes + artifacts/receipts), not free-form
  // recovery outputs which can vary without resolving the gap.
  const isScaffold = (id: string) =>
    /-mission-recovery-\d+|-amendment-\d+|-configuration-request-\d+/i.test(id);
  const state = [
    ...(obs.completedTaskIds || []).filter((v) => !isScaffold(v)).map((v) => `t:${normalizeEvidenceToken(v)}`),
    ...(obs.completedTaskStatuses || []).filter((v) => !isScaffold(v)).map((v) => `s:${normalizeEvidenceToken(v)}`),
    ...(obs.artifactNames || []).map((v) => `a:${normalizeEvidenceToken(v)}`),
    ...(obs.receiptOps || []).map((v) => `r:${normalizeEvidenceToken(v)}`),
  ].sort().join('|');
  return `${gapFp}::${state}`;
}

export function hasRecoveryProgress(previous: string | undefined, current: string): boolean {
  return !previous || previous !== current;
}

// Hard safety ceilings (anti-runaway). Blind count cutoffs replaced by progress-aware logic + ceilings.
export const MAX_PHASE_RECOVERY_ROUNDS_SAFETY = 12;
export const MAX_MISSION_RECOVERY_ROUNDS_SAFETY = 12;
export const MAX_NO_PROGRESS_RECOVERY_ATTEMPTS = 3;


export function isConfigurationBlocker(evidence: string[]): boolean {
  const text = evidence.join('\n');
  // Only explicit missing user-provided credentials/secrets that cannot be
  // resolved by capability resolution (__create_tool) should trigger a
  // user-configuration pause. Missing/unregistered/unavailable tools or
  // services alone are NOT blockers — the agent must try capability
  // resolution first.
  return /\b(?:missing|required|needed|not provided|not supplied)\b.{0,120}\b(?:api ?key|access ?key|secret|token|password|credential|authentication|authorization|account ?credential)\b/i.test(text)
    || /\b(?:api ?key|access ?key|secret|token|password|credential|authentication|authorization)\b.{0,120}\b(?:missing|required|needed|not provided|not supplied)\b/i.test(text)
    || /\bcredential[s]?\s+(?:missing|required|needed|not provided|not supplied)\b/i.test(text)
    || /\b(?:no|missing)\s+(?:valid\s+)?(?:api ?key|access ?key|secret|token|password|credential)\b/i.test(text);
}

export function missionConfigurationQuestion(missionGoal: string): string {
  return `I could not complete "${missionGoal}" because specific credentials or configuration required by the needed tool/service are missing. I have already tried to discover, resolve, or create the needed tools automatically. Please configure the required credentials or settings for the relevant tool in Tools or Vault (use the exact fields shown for that tool), then reply here to continue.`;
}

const NON_ACTION_RECEIPT_TOOL_IDS = new Set([
  '__list_tools',
  '__create_tool',
  '__delegate',
]);

function isActionReceiptLike(value: unknown): value is ActionReceiptLike {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const receipt = value as Record<string, unknown>;
  return typeof receipt.toolId === 'string' && typeof receipt.outcome === 'string';
}

function receiptChannelAlignsWithTask(receipt: ActionReceiptLike, plannedTask: Task): boolean {
  const binding = extractReceiptBinding(receipt);
  const op = (binding.operation || receipt.toolId || '').toLowerCase();
  const taskText = `${plannedTask.title}\n${plannedTask.description}`.toLowerCase();
  const taskEmail = /\bemail\b/.test(taskText);
  const taskSms = /\b(sms|text message|\btext\b)\b/.test(taskText);
  const receiptEmail = /email/.test(op) || /email/.test(receipt.toolId.toLowerCase());
  const receiptSms = /sms|twilio|text/.test(op) || /sms|twilio|text/.test(receipt.toolId.toLowerCase());
  if (taskEmail && !taskSms) return receiptEmail && !receiptSms;
  if (taskSms && !taskEmail) return receiptSms && !receiptEmail;
  return true; // non-comm or ambiguous: rely on explicit binding matching
}

function receiptHasSpecificExternalBinding(receipt: ActionReceiptLike, plannedTask: Task): boolean {
  const binding = extractReceiptBinding(receipt);
  const hasRecipient = !!(binding.recipients && binding.recipients.length > 0);
  const hasMessage = !!(binding.subject || binding.body || binding.message);
  const hasProviderOrExecution = !!(binding.providerRequestId || binding.executionId);
  const op = (binding.operation || '').toLowerCase();
  const hasOperation = /(send|deliver|transmit|publish|post|submit|execute|email|sms|text|message)/.test(op);
  const taskText = `${plannedTask.title}\n${plannedTask.description}`.toLowerCase();
  const isCommunicationTask = /\b(email|sms|text message|text)\b/.test(taskText) || ['email','sms'].includes(op) || /email|sms|text/.test(receipt.toolId.toLowerCase());
  if (isCommunicationTask) {
    // Communication evidence must bind operation + destination/message + authoritative provider/execution signal.
    return hasOperation && hasRecipient && hasMessage && hasProviderOrExecution && receiptChannelAlignsWithTask(receipt, plannedTask);
  }
  return hasOperation && (hasRecipient || hasMessage || hasProviderOrExecution);
}

function receiptsFromArtifact(artifact?: MissionArtifact): ActionReceiptLike[] {
  if (typeof artifact?.content !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(artifact.content);
    return Array.isArray(parsed) ? parsed.filter(isActionReceiptLike) : [];
  } catch {
    return [];
  }
}

/**
 * Binding-aware, recovery-aware evidence gaps (Task 6/7).
 * - Planned task statuses are checked per task (no sibling success masking).
 * - Required/external actions: satisfied by an authoritative matching receipt produced
 *   by the task itself OR by any recovery/amendment/completed task whose evidence
 *   satisfies the same binding-specific requirement (links recovery to original unmet requirement).
 * - Deliverables: phase-pooled, plus global fallback for recovery-produced artifacts.
 * - Authoritative binding checks are preserved (op/recipient/message/provider; comms strict).
 */
export function missionExecutionEvidenceGaps(plan: Plan, phases: MissionPhaseEvidence[]): string[] {
  const gaps: string[] = [];
  const phaseById = new Map(phases.map((phase) => [phase.phaseId, phase]));
  const plannedPhaseIds = new Set(plan.phases.map((phase) => phase.id));
  for (const phase of phases) {
    if (!plannedPhaseIds.has(phase.phaseId)) {
      gaps.push(`Execution returned unplanned phase "${phase.phaseId}".`);
    }
  }

  // Global pools for recovery linkage (Task 7): evidence from any task can satisfy a
  // binding-specific requirement of an incomplete original task.
  const globalReceipts: ActionReceiptLike[] = phases.flatMap((phase) =>
    phase.tasks.flatMap((task) =>
      receiptsFromArtifact((task.artifacts || []).find((a) => a.name.toLocaleLowerCase() === 'system-action-receipts.json')),
    ),
  );
  const globalArtifacts: MissionArtifact[] = phases.flatMap((phase) =>
    phase.tasks.flatMap((task) => task.artifacts || []),
  );

  for (const plannedPhase of plan.phases) {
    const phase = phaseById.get(plannedPhase.id);
    if (!phase) {
      gaps.push(`Phase "${plannedPhase.name}" (${plannedPhase.id}) has no execution result.`);
      continue;
    }
    // The phase "not completed" gap is only reported when the phase has at least one
    // unresolved task. A phase whose requirements are all satisfied - including by
    // recovery evidence produced for an incomplete original task (Task 7) - is treated
    // as resolved even if its persisted status is still in_progress.
    let phaseHadTaskGap = false;

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
        phaseHadTaskGap = true;
        gaps.push(`Task "${plannedTask.title}" (${plannedTask.id}) has no execution result in phase "${plannedPhase.name}".`);
        continue;
      }

      const phaseArtifacts = phase.tasks.flatMap((phaseTask) => phaseTask.artifacts || []);
      const ownReceiptArtifact = (task.artifacts || []).find((artifact) =>
        artifact.name.toLocaleLowerCase() === 'system-action-receipts.json',
      );
      const unreadableOwnReceipt = typeof ownReceiptArtifact?.content === 'string' && (() => {
        try { JSON.parse(ownReceiptArtifact.content); return false; } catch { return true; }
      })();
      const ownReceipts = receiptsFromArtifact(ownReceiptArtifact);

      // Task 7: a later recovery task may have satisfied this original requirement with
      // authoritative evidence. Accept only binding-matching authoritative receipts.
      const crossTaskReceipts = globalReceipts.filter((r) => !ownReceipts.includes(r) && receiptChannelAlignsWithTask(r, plannedTask));
      const evidenceReceipts = [...ownReceipts, ...crossTaskReceipts];

      const requirementGaps: string[] = [];
      if (unreadableOwnReceipt) {
        requirementGaps.push(
          `Task "${plannedTask.title}" (${plannedTask.id}) has an unreadable action-receipt record; required actions cannot be verified.`,
        );
      }

      const availableReceipts = [...evidenceReceipts];
      for (const required of ((plannedTask.requiredActions || []) as RequiredActionLike[]).filter(
        (action) => action.toolId !== '__external_action__',
      )) {
        const receiptIndex = availableReceipts.findIndex((receipt) =>
          receiptMatchesRequiredAction(receipt, required),
        );
        if (receiptIndex >= 0) {
          availableReceipts.splice(receiptIndex, 1);
          continue;
        }

        const toolMatched = evidenceReceipts.filter((receipt) =>
          receipt.toolId === required.toolId || receipt.fallbackForToolId === required.toolId,
        );
        const failed = toolMatched.find((receipt) => receipt.outcome !== required.outcome)
          || evidenceReceipts.find((receipt) => receipt.outcome === 'failure');
        const bindingHint = toolMatched.length > 0 && required.outcome === 'success'
          ? ` A receipt for "${required.toolId}" exists but did not match the required operation/recipient/message binding.`
          : '';
        requirementGaps.push(
          `Task "${plannedTask.title}" (${plannedTask.id}) did not complete the required step "${describeRequiredAction(required)}" with the expected result (${required.outcome}).`
          + bindingHint
          + (failed
            ? ` The step "${failed.toolId}" finished with result ${failed.outcome}${failed.content ? `: ${failed.content.slice(0, 500)}` : '.'}`
            : ` No matching receipt was found. Steps that ran: ${evidenceReceipts.map((receipt) => receipt.toolId).join(', ') || 'none'}.`),
        );
      }

      const externalActionRequired = plannedTask.requiresExternalAction
        || plannedTask.requiredActions?.some((action) => action.toolId === '__external_action__');
      if (externalActionRequired) {
        const requiredExternalActions = ((plannedTask.requiredActions || []) as RequiredActionLike[])
          .filter((action) => action.toolId === '__external_action__' && action.outcome === 'success');
        let externalSatisfied = false;
        // Explicit binding requirements: own task evidence + channel-aligned cross-task receipts
        // are eligible (Task 7 recovery linkage) but only if binding matches. A receipt with
        // no binding fields cannot satisfy an explicit binding requirement via cross-task credit.
        const externalPool = evidenceReceipts;
        if (requiredExternalActions.length > 0) {
          externalSatisfied = requiredExternalActions.every((required) =>
            externalPool.some((receipt) =>
              receipt.outcome === 'success'
              && !NON_ACTION_RECEIPT_TOOL_IDS.has(receipt.toolId)
              && receiptMatchesRequiredAction(receipt, required)
              && receiptHasSpecificExternalBinding(receipt, plannedTask),
            ),
          );
        } else {
          // Generic external action: allow recovery linkage via channel-aligned receipts.
          externalSatisfied = externalPool.some((receipt) =>
            receipt.outcome === 'success'
            && !NON_ACTION_RECEIPT_TOOL_IDS.has(receipt.toolId)
            && receipt.toolId !== '__external_action__'
            && receiptHasSpecificExternalBinding(receipt, plannedTask),
          );
        }
        if (!externalSatisfied) {
          requirementGaps.push(
            `Task "${plannedTask.title}" (${plannedTask.id}) did not complete a verified action outside the system. Looking up tools, creating tools, or handing work off to another agent does not count as completing that action.`
            + ` No matching authoritative action receipt was found. Steps that ran: ${evidenceReceipts.map((receipt) => receipt.toolId).join(', ') || 'none'}.`,
          );
        }
      }

      const normalize = (value: string) => value.trim().toLocaleLowerCase();
      const expectedArtifactsList = Array.isArray((plannedTask as any).expectedArtifacts) ? (plannedTask as any).expectedArtifacts as string[] : [];
      for (const expectedName of expectedArtifactsList) {
        if (normalize(expectedName) === 'system-action-receipts.json') continue;
        const artifact = [...phaseArtifacts, ...globalArtifacts].find((candidate) => normalize(candidate.name) === normalize(expectedName));
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
        requirementGaps.push(
          `Task "${plannedTask.title}" (${plannedTask.id}) is missing expected artifact "${expectedName}".${reason}`,
        );
      }

      // Compute whether this task had verifiable requirements that recovery evidence can satisfy.
      const hasVerifiableRequirements = ((plannedTask.requiredActions || []).length > 0)
        || !!(plannedTask.requiresExternalAction || plannedTask.requiredActions?.some((a) => a.toolId === '__external_action__'))
        || ((plannedTask as any).expectedArtifacts || []).some((n: string) => n.toLocaleLowerCase() !== 'system-action-receipts.json');

      if (requirementGaps.length === 0) {
        // Task 7: if binding/deliverable requirements are satisfied (possibly by recovery
        // evidence), credit resolution even when the original task record is incomplete.
        // A completed task with satisfied requirements also passes.
        if (task.status === 'completed' || hasVerifiableRequirements) continue;
      }

      // Not resolved: report status and requirement detail.
      phaseHadTaskGap = true;
      if (task.status !== 'completed') {
        const detail = task.output?.trim();
        gaps.push(
          `Task "${plannedTask.title}" (${plannedTask.id}) is ${task.status}, not completed.`
          + (detail ? ` Reason: ${detail.slice(0, 500)}` : ''),
        );
      }
      gaps.push(...requirementGaps);
    }

    if (phase.status !== 'completed' && phaseHadTaskGap) {
      gaps.push(`Phase "${plannedPhase.name}" (${plannedPhase.id}) is ${phase.status}, not completed.`);
    }
  }
  return [...new Set(gaps)];
}

export function createCompletedTaskSummary(
  taskId: string,
  output: string,
  artifacts: MissionArtifact[],
  requiredActions?: NonNullable<Task['requiredActions']>,
  requiresExternalAction = false,
  expectedArtifacts?: string[],
  resolves?: { taskIds?: string[]; gaps?: string[] },
): CompletedTaskSummary {
  const externalActionRequired = requiresExternalAction
    || (requiredActions || []).some((action) => action.toolId === '__external_action__');
  const normalizedRequiredActions = requiredActions?.filter(
    (action) => action.toolId !== '__external_action__',
  );
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
    ...(normalizedRequiredActions ? { requiredActions: normalizedRequiredActions } : {}),
    ...(externalActionRequired ? { requiresExternalAction: true } : {}),
    ...(resolves?.taskIds?.length ? { resolvesTaskIds: resolves.taskIds } : {}),
    ...(resolves?.gaps?.length ? { resolvesGaps: resolves.gaps.slice(0, 20) } : {}),
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
