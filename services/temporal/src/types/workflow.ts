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
  userMessages?: string[];
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
  status?: string;
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

export function recoveryTaskDependencies(
  tasks: Task[],
  summaries: Iterable<Pick<CompletedTaskSummary, 'taskId'>>,
  targetTaskIds: string[],
): string[] {
  const summarized = new Set(Array.from(summaries, (summary) => summary.taskId));
  const completed = tasks.filter((task) => task.status === 'completed' && summarized.has(task.id));
  const original = completed.filter((task) => !/-mission-recovery-\d+/i.test(task.id));
  const targets = new Set(targetTaskIds);
  const prioritized = [...original.filter((task) => targets.has(task.id)), ...original.filter((task) => !targets.has(task.id))];
  const recentRecovery = completed.filter((task) => /-mission-recovery-\d+/i.test(task.id)).slice(-6);
  return [...prioritized.slice(0, 12 - recentRecovery.length), ...recentRecovery].map((task) => task.id);
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

export function phaseRequirementEvidenceGaps(
  plan: Plan,
  phaseId: string,
  phaseOutput: MissionPhaseEvidence,
): string[] {
  const phase = plan.phases.find((candidate) => candidate.id === phaseId);
  if (!phase) return [`Phase ${phaseId} is missing from the plan.`];
  const requiredTasks = phase.tasks.filter((task) =>
    task.requiresExternalAction
    || (task.requiredActions || []).length > 0
    || (task.expectedArtifacts || []).some((name) => name.toLocaleLowerCase() !== 'system-action-receipts.json'),
  );
  if (requiredTasks.length === 0) return [];
  return missionExecutionEvidenceGaps(
    { ...plan, phases: [phase] },
    [{ ...phaseOutput, status: 'completed' }],
  ).filter((gap) => requiredTasks.some((task) => gap.includes(`(${task.id})`)));
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

export function recoveryEvidenceState(
  tasks: MissionPhaseEvidence['tasks'],
  expectedArtifacts: string[],
): Pick<RecoveryProgressObservation, 'artifactNames' | 'receiptOps'> {
  const expected = new Set(expectedArtifacts.map((name) => name.trim().toLocaleLowerCase()));
  const artifactNames: string[] = [];
  const receiptOps: string[] = [];
  for (const task of tasks) {
    for (const artifact of task.artifacts || []) {
      const name = artifact.name.trim().toLocaleLowerCase();
      if (name === 'system-action-receipts.json') {
        for (const receipt of receiptsFromArtifact(artifact)) {
          if (receipt.outcome !== 'success' || receipt.isError || receipt.outcomeKnown === false
            || receipt.toolId === '__list_tools' || receipt.toolId === '__delegate') continue;
          receiptOps.push(JSON.stringify([receipt.toolId, receipt.operation, receipt.providerRequestId, receipt.executionId]));
        }
      } else if (expected.has(name) && artifact.status !== 'blocked' && artifact.purpose !== 'execution-outcome'
        && ((typeof artifact.content === 'string' && artifact.content.trim()) || artifact.url !== undefined || artifact.data !== undefined)) {
        artifactNames.push(name);
      }
    }
  }
  return { artifactNames: [...new Set(artifactNames)], receiptOps: [...new Set(receiptOps)] };
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

export function hasEvidenceRecoveryProgress(previous: string | undefined, current: string): boolean {
  return !previous || previous.split('::')[1] !== current.split('::')[1];
}

// Hard safety ceilings (anti-runaway). Blind count cutoffs replaced by progress-aware logic + ceilings.
export const MAX_PHASE_RECOVERY_ROUNDS_SAFETY = 12;
export const MAX_MISSION_RECOVERY_ROUNDS_SAFETY = 12;
export const MAX_NO_PROGRESS_RECOVERY_ATTEMPTS = 3;
// A completion-review verification failure (the reviewer could not produce a
// valid verdict) is recoverable, not a mission-incomplete: retry the review a
// few times before falling back to a resumable review state instead of aborting.
export const MAX_COMPLETION_VERIFICATION_RETRIES = 2;

/** Bounded reruns of a dependency whose completion did not produce its declared artifact (a missing input). */
export const MAX_DEPENDENCY_INPUT_RERUNS = 2;

/** A recovery/amendment/configuration-scaffold task id (not a normally-planned task). */
export function isRecoveryTask(taskId: string): boolean {
  return /-mission-recovery-\d+|-amendment-\d+|-configuration-request-\d+/i.test(taskId);
}


export function isConfigurationBlocker(evidence: string[]): boolean {
  const text = evidence.join('\n');
  // Only a missing secret or an authorization decision is a user blocker. A
  // missing tool/capability is self-service: the system must discover, compose,
  // or create and verify it, so tool/catalog/provider/configuration subjects are
  // deliberately excluded here.
  const missingSignal = /\b(?:missing|required|needed|not provided|not supplied|denied|forbidden|not authorized)\b/i;
  const secretSignal = /\b(?:api ?key|access ?key|secret|token|password|credential|authentication|authorization|permission)\b/i;
  return missingSignal.test(text) && secretSignal.test(text);
}

export function missionConfigurationQuestion(missionGoal: string): string {
  return `I could not complete "${missionGoal}" because a required secret or authorization is missing. I have already tried to discover, resolve, or create the needed capability automatically. Provide the specific requested value (for example an API key or token) or grant the required permission, then reply here so I can resume.`;
}

function gapRequiresUserInput(gap: string): boolean {
  return /\b(?:ask(?:ing)? (?:you|the user)|user (?:must|needs to|should)|provide (?:your|a) (?:value|answer|decision|approval)|approval required|requires? (?:your|user) (?:approval|decision|input|response)|question requiring|waiting for (?:your|user))\b/i.test(gap);
}

export function classifyMissionCompletionGaps(
  missionGoal: string,
  gaps: string[],
  options?: { pendingUserInteraction?: boolean; failureCode?: string },
): { status: 'awaiting_review' | 'incomplete'; reason: string; question?: string } {
  const evidence = gaps.filter(Boolean);
  if (options?.pendingUserInteraction || evidence.some(gapRequiresUserInput)) {
    return {
      status: 'awaiting_review',
      reason: evidence[0] || 'User input is required before the mission can continue.',
      question: evidence.find(gapRequiresUserInput) || evidence[0],
    };
  }

  const configFailure = options?.failureCode === 'CREDENTIAL_REQUIRED'
    || options?.failureCode === 'CONFIGURATION_REQUIRED'
    || isConfigurationBlocker(evidence);
  if (configFailure) {
    return {
      status: 'awaiting_review',
      reason: evidence[0] || 'Required configuration is missing.',
      question: missionConfigurationQuestion(missionGoal),
    };
  }

  const detail = evidence.slice(0, 8).join(' ');
  return {
    status: 'incomplete',
    reason: detail || 'The mission could not be completed automatically because required work or deliverables remain unresolved.',
  };
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
    let hasLaterCompletedRecovery = false;
    const laterCompletedRecovery = new Set<string>();
    for (const candidate of [...plannedPhase.tasks].reverse()) {
      if (hasLaterCompletedRecovery) laterCompletedRecovery.add(candidate.id);
      if (/-mission-recovery-\d+/i.test(candidate.id) && tasksById.get(candidate.id)?.status === 'completed') {
        hasLaterCompletedRecovery = true;
      }
    }
    for (const plannedTask of plannedPhase.tasks) {
      const task = tasksById.get(plannedTask.id);
      if (/-mission-recovery-\d+/i.test(plannedTask.id)
        && laterCompletedRecovery.has(plannedTask.id)
        && (task?.status === 'failed' || task?.status === 'incomplete')
        && !plannedTask.requiresExternalAction
        && !(plannedTask.requiredActions || []).length
        && !(plannedTask.expectedArtifacts || []).length) {
        const receiptArtifact = task?.artifacts.find((artifact) =>
          artifact.name.toLocaleLowerCase() === 'system-action-receipts.json',
        );
        let uncertainRecovery = /\b(?:unknown outcome|outcome unknown|outcome uncertain)\b/i.test(task?.output || '');
        if (typeof receiptArtifact?.content === 'string') {
          try {
            const receipts: unknown = JSON.parse(receiptArtifact.content);
            uncertainRecovery ||= !Array.isArray(receipts) || receipts.some((value: unknown) =>
              !isActionReceiptLike(value) || value.outcomeKnown === false || /outcome.?unknown/i.test(value.content || ''),
            );
          } catch {
            uncertainRecovery = true;
          }
        } else if (receiptArtifact) {
          uncertainRecovery = true;
        }
        if (!uncertainRecovery) continue;
      }
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
