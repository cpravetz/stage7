import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useFeedStore, FeedEvent } from '../stores/feedStore';
import AgentOutputsPanel from '../components/AgentOutputsPanel';
import { MissionDetail, useMissionsStore } from '../stores/missionsStore';
import { postFormData, postJSON } from '../utils/api';
import MissionArtifactContent from '../components/MissionArtifactContent';
import {
  getArtifactMediaCategory,
  groupMissionArtifactVersions,
  getArtifactPurpose,
  MissionArtifact,
} from '../types/missionArtifact';
import { missionIdFromWorkflowId } from '../utils/missionId';
import {
  buildMissionEvents,
  buildTranscript,
  CONVERSATION_EVENT_TYPES,
  friendlyMissionError,
  summarizeModelUsage,
  TIMELINE_EVENT_TYPES,
} from '../utils/missionEvents';

function renderTextWithLinks(text: string) {
  const parts: React.ReactNode[] = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <Link
        key={`link-${match.index}`}
        to={match[2]}
        rel="noreferrer"
        style={{ color: 'inherit', textDecoration: 'underline' }}
      >
        {match[1]}
      </Link>
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : text;
}

interface Plan {
  summary?: string;
  estimatedDuration?: string;
  estimatedCost?: string;
  requiresClarification?: boolean;
  clarificationQuestions?: string[];
  artifacts?: unknown[];
  phases: PlanPhase[];
}

interface PlanPhase {
  id: string;
  name: string;
  goal?: string;
  requiresApproval?: boolean;
  artifacts?: unknown[];
  tasks: PlanTask[];
}

interface PlanTask {
  id: string;
  title: string;
  description?: string;
  agentRole?: string;
  status?: string;
  expectedArtifacts?: string[];
  artifacts?: unknown[];
}

interface PhaseOutput {
  phaseId: string;
  name?: string;
  status?: string;
  tasks?: Array<{
    taskId: string;
    status: string;
    output?: string;
    artifacts?: unknown[];
  }>;
}

type Tab = 'conversation' | 'timeline' | 'plan' | 'artifacts' | 'agents';
type PendingInteraction = NonNullable<
  NonNullable<NonNullable<MissionDetail['output']>['outputs']>['pendingInteraction']
>;

function secretKeysForInteraction(pending: PendingInteraction): string[] {
  const requestedKeys = pending.credentialRequest?.missingCredentials.map(({ key }) => key) || [];
  const taggedKeys = Array.from(
    pending.question?.matchAll(/\[secret:([a-z0-9_-]+)\]/gi) || [],
    (match) => match[1],
  ).filter((key): key is string => Boolean(key));
  return [...new Set([...requestedKeys, ...taggedKeys])];
}

function secretLabelForInteraction(pending: PendingInteraction, key: string): string {
  return pending.credentialRequest?.missingCredentials.find((credential) => credential.key === key)?.label
    || key.replace(/[_-]/g, ' ');
}

function displayInteractionQuestion(pending: PendingInteraction): string {
  let text = pending.question || '';
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && typeof (parsed as Record<string, unknown>).question === 'string') {
      text = (parsed as Record<string, unknown>).question as string;
    }
  } catch {
    // not JSON
  }
  const secret = text.match(/^\s*\[secret:([a-z0-9_-]+)\]\s*(.*)$/i);
  if (secret) text = secret[2] || text;
  text = text.replace(/__ASK_USER__:\s*/g, '');
  text = text.replace(/\{[\s\S]*?"question"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/gi, '$1');
  text = text.replace(/"\s*question"\s*:\s*"\.\.\."?/gi, '');
  text = text.replace(/\{[\s\S]*\.\.\.[\s\S]*\}/g, '');
  text = text.replace(/[{}]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) {
    if (pending.kind === 'user_input') {
      const missing = pending.credentialRequest?.missingCredentials?.map((c) => c.label || c.key).filter(Boolean);
      if (missing && missing.length > 0) {
        return `Configuration needed for ${pending.credentialRequest?.toolName || 'a tool'}: ${missing.join(', ')}. Configure the required values in Tools or Vault, then continue.`;
      }
      return 'The agent needs specific information to continue. Review the task details and provide the requested value or configuration.';
    }
    return pending.permission?.explanation || 'The agent is waiting for input.';
  }
  return text;
}

const STATUS_BADGE: Record<string, string> = {
  running: 'running',
  pausing: 'running',
  canceling: 'running',
  stopping: 'running',
  resuming: 'running',
  paused: 'paused',
  completed: 'completed',
  failed: 'failed',
  canceled: 'canceled',
  pending: 'pending',
  started: 'running',
  awaiting_review: 'review',
  incomplete: 'incomplete',
};

function getMissionStatusLabel(status: string): string {
  switch (status) {
    case 'running': return 'Running';
    case 'pausing': return 'Pausing after current task';
    case 'canceling': return 'Stopping after current task';
    case 'stopping': return 'Stopping after current task';
    case 'resuming': return 'Resuming';
    case 'completed': return 'Completed';
    case 'failed': return 'Failed';
    case 'canceled': return 'Canceled';
    case 'awaiting_review': return 'Needs Review';
    case 'incomplete': return 'Incomplete';
    case 'paused': return 'Paused';
    default: return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

export function derivePhaseStatus(phase: PlanPhase, phaseOutputs: PhaseOutput[], missionEvents: FeedEvent[], missionStatus?: string): string | undefined {
  const output = phaseOutputs.find((p) => p.phaseId === phase.id);
  if (output?.status) {
    if (output.status === 'completed') return 'completed';
    if (output.status === 'failed') return 'failed';
    if (output.status === 'in_progress' || output.status === 'running') return 'running';
  }
  const tasks = phase.tasks || [];
  if (tasks.length === 0) return output?.status;
  let hasFailed = false;
  let hasRunning = false;
  let allCompleted = true;
  for (const task of tasks) {
    const tstatus = getTaskStatus(task, phase.id, phaseOutputs, missionEvents, missionStatus);
    if (tstatus === 'failed') hasFailed = true;
    if (tstatus === 'in_progress' || tstatus === 'running') hasRunning = true;
    if (tstatus !== 'completed') allCompleted = false;
  }
  if (allCompleted && tasks.length > 0) return 'completed';
  if (hasFailed) return 'failed';
  if (hasRunning) return 'running';
  return output?.status;
}



function iconForType(type: string): string {
  if (type.startsWith('task_')) return type === 'task_failed' ? '❌' : type === 'task_incomplete' ? '⚠️' : '✅';
  if (type.startsWith('phase_')) return '📦';
  if (type.startsWith('approval_')) return type === 'approval_approved' ? '✅' : type === 'approval_rejected' ? '❌' : '⏸️';
  if (type.startsWith('plan_') || type.startsWith('planner_')) return '🧭';
  if (type === 'tool') return '🔧';
  if (type === 'monologue') return '💭';
  if (type === 'user' || type === 'user_message' || type === 'user_input_resolved') return '🧑';
  if (type === 'question_asked') return '❓';
  if (type === 'permission_required') return '🔐';
  if (type === 'mission_completed') return '🏁';
  if (type === 'mission_failed') return '💥';
  if (type === 'mission_incomplete') return '⚠️';
  if (type === 'mission_needs_review') return '⏳';
  if (type === 'mission_started') return '🚀';
  return '📋';
}

interface MissionArtifactItem extends MissionArtifact {
  id: string;
  name: string;
  kind: 'expected' | 'produced';
}

function toMissionArtifactItem(
  value: unknown,
  kind: MissionArtifactItem['kind'],
  phaseId?: string,
  taskId?: string,
): MissionArtifactItem | null {
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'system-action-receipts.json') return null;
    return {
      id: `${kind}-${phaseId || ''}-${taskId || ''}-${value}`,
      name: value,
      phaseId,
      taskId,
      kind,
      purpose: 'deliverable',
      isDeliverable: true,
    };
  }
  if (!value || typeof value !== 'object') return null;

  const artifact = value as Record<string, unknown>;
  const name = typeof artifact.name === 'string'
    ? artifact.name
    : typeof artifact.id === 'string'
      ? artifact.id
      : 'artifact';
  if (name.toLowerCase() === 'system-action-receipts.json') return null;
  const rawContent = artifact.content ?? artifact.text ?? artifact.body;
  const isBlocker = typeof rawContent === 'string'
    && /^\s*(?:\*\*)?Blocker(?:\*\*)?\s*:/i.test(rawContent);
  return {
    ...artifact,
    id: typeof artifact.id === 'string'
      ? artifact.id
      : `${kind}-${phaseId || ''}-${taskId || ''}-${name}`,
    name,
    phaseId: typeof artifact.phaseId === 'string' ? artifact.phaseId : phaseId,
    taskId: typeof artifact.taskId === 'string' ? artifact.taskId : taskId,
    kind,
    content: rawContent,
    ...(isBlocker && typeof artifact.status !== 'string' ? { status: 'blocked' } : {}),
  };
}

function buildMissionArtifactItems(
  plan: Plan | null,
  phaseOutputs: PhaseOutput[],
  events: FeedEvent[],
  storedArtifacts: unknown[] = [],
): MissionArtifactItem[] {
  const items = new Map<string, MissionArtifactItem>();
  const add = (value: unknown, kind: MissionArtifactItem['kind'], phaseId?: string, taskId?: string) => {
    const item = toMissionArtifactItem(value, kind, phaseId, taskId);
    if (!item) return;
    const key = kind === 'expected'
      ? `expected|${item.phaseId || ''}|${item.name.toLocaleLowerCase()}`
      : [
          kind,
          item.artifactId || item.logicalId || item.lineageId || item.id,
          item.version ?? '',
          item.phaseId || '',
          item.taskId || '',
          item.name.toLowerCase(),
          item.url || '',
          typeof item.content === 'string' ? item.content : JSON.stringify(item.content ?? ''),
        ].join('|');
    const existing = items.get(key);
    if (!existing || ((!existing.content && !existing.url) && (item.content || item.url))) {
      items.set(key, item);
    }
  };

  for (const artifact of plan?.artifacts || []) add(artifact, 'produced');
  for (const phase of plan?.phases || []) {
    for (const artifact of phase.artifacts || []) add(artifact, 'produced', phase.id);
    for (const task of phase.tasks || []) {
      for (const expected of task.expectedArtifacts || []) add(expected, 'expected', phase.id, task.id);
      for (const artifact of task.artifacts || []) add(artifact, 'produced', phase.id, task.id);
    }
  }
  for (const artifact of storedArtifacts) {
    const item = toMissionArtifactItem(artifact, 'produced');
    if (item) add(artifact, 'produced', item.phaseId, item.taskId);
  }
  for (const phase of phaseOutputs) {
    for (const task of phase.tasks || []) {
      for (const artifact of task.artifacts || []) add(artifact, 'produced', phase.phaseId, task.taskId);
    }
  }
  for (const event of events) {
    if (event.type !== 'task_completed') continue;
    const rawArtifacts = event.metadata?.artifacts;
    if (!Array.isArray(rawArtifacts)) continue;
    for (const artifact of rawArtifacts) {
      add(
        artifact,
        'produced',
        typeof event.metadata?.phaseId === 'string' ? event.metadata.phaseId : undefined,
        typeof event.metadata?.taskId === 'string' ? event.metadata.taskId : undefined,
      );
    }
  }

  return Array.from(items.values());
}

export function getTaskStatus(
  task: PlanTask,
  phaseId: string,
  phaseOutputs: PhaseOutput[],
  events: FeedEvent[],
  missionStatus?: string,
): string | undefined {
  const taskEvents = events
    .filter((event) => event.metadata?.phaseId === phaseId
      && event.metadata?.taskId === task.id
      && ['task_started', 'task_completed', 'task_incomplete', 'task_failed'].includes(event.type))
    .sort((left, right) => left.timestamp - right.timestamp);
  const latestTaskEvent = taskEvents[taskEvents.length - 1];
  if (latestTaskEvent) {
    return latestTaskEvent.type === 'task_started'
      ? 'in_progress'
      : latestTaskEvent.type === 'task_failed' ? 'failed' : latestTaskEvent.type === 'task_incomplete' ? 'incomplete' : 'completed';
  }
  const outputStatus = phaseOutputs
    .find((phase) => phase.phaseId === phaseId)
    ?.tasks?.find((outputTask) => outputTask.taskId === task.id)?.status;
  if (missionStatus === 'running' && (task.status === 'in_progress' || task.status === 'running' || outputStatus === 'in_progress' || outputStatus === 'running')) {
    return 'in_progress';
  }
  return task.status || outputStatus;
}

const MissionRoom = () => {
  const { workflowId = '' } = useParams<{ workflowId: string }>();
  const missionId = useMemo(() => missionIdFromWorkflowId(workflowId), [workflowId]);

  const events = useFeedStore((s) => s.events);
  const connected = useFeedStore((s) => s.connected);
  const ensureConnected = useFeedStore((s) => s.ensureConnected);

  const detail = useMissionsStore((s) => s.details[workflowId]);
  const detailLoading = useMissionsStore((s) => s.detailLoading[workflowId]);
  const detailError = useMissionsStore((s) => s.detailError[workflowId]);
  const fetchMissionDetail = useMissionsStore((s) => s.fetchMissionDetail);
  const refreshDetail = useMissionsStore((s) => s.refreshDetail);
  const updateMissionStatus = useMissionsStore((s) => s.updateMissionStatus);
  const retryMission = useMissionsStore((s) => s.retryMission);

  const [tab, setTab] = useState<Tab>('conversation');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);
  const [clarificationSubmitting, setClarificationSubmitting] = useState(false);
  const [interactionSubmitting, setInteractionSubmitting] = useState(false);
  const [interactionAccepted, setInteractionAccepted] = useState(false);
  const [interactionConfigurationReady, setInteractionConfigurationReady] = useState(false);
  const [interactionResponse, setInteractionResponse] = useState('');
  const [permissionScope, setPermissionScope] = useState('');

  const getRespondedInteractions = (): Set<string> => {
    try {
      const stored = sessionStorage.getItem(`mission-responded-interactions:${workflowId}`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  };

  const markInteractionResponded = (interactionId: string) => {
    try {
      const responded = getRespondedInteractions();
      responded.add(interactionId);
      sessionStorage.setItem(`mission-responded-interactions:${workflowId}`, JSON.stringify([...responded]));
    } catch {
      // Ignore storage errors
    }
  };

  const getInteractionId = (pending: NonNullable<typeof pendingInteraction>): string => {
    return pending.requestId || `${pending.phaseId}:${pending.taskId}`;
  };
  const [messageText, setMessageText] = useState('');
  const transcriptRef = useRef<HTMLDivElement>(null);
  const transcriptSticksToBottom = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const clarificationInputs = useRef(new Map<number, HTMLInputElement>());
  const retryGuidanceRef = useRef<HTMLTextAreaElement>(null);
  const [showRetryDialog, setShowRetryDialog] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Persist unsent draft text so navigating away and back (or reloading the
  // page) does not wipe what the user typed. The draft is scoped to the
  // mission so switching missions does not carry text across contexts.
  const draftKey = `mission-draft:${workflowId || 'unknown'}`;
  useEffect(() => {
    if (!workflowId) return;
    try {
      const saved = window.sessionStorage.getItem(draftKey);
      if (saved !== null) setMessageText(saved);
    } catch {
      // sessionStorage unavailable (private mode, quota, etc.): fall back to in-memory state only.
    }
  }, [draftKey, workflowId]);

  useEffect(() => {
    if (!workflowId) return;
    try {
      window.sessionStorage.setItem(draftKey, messageText);
    } catch {
      // Ignore persistence failures; the in-memory state still holds the draft.
    }
  }, [draftKey, messageText]);

  useEffect(() => {
    ensureConnected();
  }, [ensureConnected]);

  const pendingInteraction = detail?.output?.outputs?.pendingInteraction;
  useEffect(() => {
    setInteractionAccepted(false);
    setInteractionConfigurationReady(false);
    setInteractionResponse('');
  }, [pendingInteraction?.taskId, pendingInteraction?.question, pendingInteraction?.requestId]);

  useEffect(() => {
    if (workflowId) {
      fetchMissionDetail(workflowId);
    }
  }, [workflowId, fetchMissionDetail]);

  const plan = useMemo(() => {
    const persistedPlan = (detail?.output?.plan as Plan | undefined) ?? null;
    const liveAmendment = events
      .filter((event) => event.missionId === missionId && event.type === 'phase_plan_amended')
      .sort((left, right) => right.timestamp - left.timestamp)[0];
    const amendedPlan = liveAmendment?.metadata?.plan;
    if (amendedPlan && typeof amendedPlan === 'object' && Array.isArray((amendedPlan as Plan).phases)) {
      return amendedPlan as Plan;
    }
    if (persistedPlan) return persistedPlan;
    const generatedPlan = events.find(
      (event) => event.missionId === missionId && event.type === 'plan_generated',
    )?.metadata?.plan;
    return generatedPlan && typeof generatedPlan === 'object' && Array.isArray((generatedPlan as Plan).phases)
      ? generatedPlan as Plan
      : null;
  }, [detail?.output?.plan, events, missionId]);

  const phaseOutputs: PhaseOutput[] = useMemo(() => {
    return detail?.output?.outputs?.phases || [];
  }, [detail?.output?.outputs?.phases]);

  const missionEvents = useMemo<FeedEvent[]>(() => {
    return buildMissionEvents({
      missionId,
      liveEvents: events,
      detail: detail
        ? {
            status: detail.status,
            error: detail.error,
            startedAt: detail.startedAt,
            completedAt: detail.completedAt,
            input: detail.input,
            output: detail.output,
          }
        : null,
      plan,
      phaseOutputs,
    });
  }, [events, detail, plan, phaseOutputs, missionId]);

  const modelUsage = useMemo(() => summarizeModelUsage(missionEvents), [missionEvents]);
  const totalEstimatedCost = modelUsage.estimatedCost;

  const conversationEvents = useMemo(
    () => missionEvents.filter((e) => CONVERSATION_EVENT_TYPES.has(e.type as string)),
    [missionEvents]
  );

  const timelineEvents = useMemo(
    () => missionEvents.filter((e) => TIMELINE_EVENT_TYPES.has(e.type as string)),
    [missionEvents]
  );

  const artifactItems = useMemo(
    () => buildMissionArtifactItems(plan, phaseOutputs, missionEvents, detail?.artifacts),
    [plan, phaseOutputs, missionEvents, detail?.artifacts],
  );

  const transcript = useMemo(
    () => buildTranscript(conversationEvents),
    [conversationEvents]
  );

  const pendingApproval = useMemo(() => {
    const resolved = new Set<string>();
    for (const e of missionEvents) {
      // consider both approval_* and phase_* resolution events as resolving a pending approval
      if (
        e.type === 'approval_approved' ||
        e.type === 'approval_rejected' ||
        e.type === 'phase_approved' ||
        e.type === 'phase_rejected'
      ) {
        const md = e.metadata || {};
        if (md.phaseId) resolved.add(String(md.phaseId));
      }
    }
    for (const e of missionEvents) {
      if (e.type === 'approval_requested') {
        const md = e.metadata || {};
        const phaseId = String(md.phaseId || '');
        if (!resolved.has(phaseId)) {
          return { phaseId, question: String(md.question || e.message), eventId: e.id };
        }
      }
    }
    return null;
  }, [missionEvents]);

  const pendingPhase = useMemo(
    () => plan?.phases.find((p) => p.id === pendingApproval?.phaseId),
    [plan, pendingApproval?.phaseId],
  );
  const pendingPhaseApprovalState = useMemo(() => {
    if (!pendingApproval || !pendingPhase || pendingPhase.tasks.length === 0) {
      return { ready: false, incompleteTasks: 0, missingArtifacts: 0 };
    }
    let incompleteTasks = 0;
    let missingArtifacts = 0;
    for (const task of pendingPhase.tasks) {
      if (getTaskStatus(task, pendingPhase.id, phaseOutputs, missionEvents, detail?.status) !== 'completed') {
        incompleteTasks += 1;
      }
      const expectedArtifacts = task.expectedArtifacts || [];
      const hasProducedArtifact = artifactItems.some((artifact) =>
        artifact.kind === 'produced'
        && artifact.phaseId === pendingPhase.id
        && artifact.taskId === task.id
      );
      if (expectedArtifacts.length > 0 && !hasProducedArtifact) {
        missingArtifacts += 1;
      }
    }
    return {
      ready: incompleteTasks === 0 && missingArtifacts === 0,
      incompleteTasks,
      missingArtifacts,
    };
  }, [pendingApproval, pendingPhase, phaseOutputs, missionEvents, artifactItems]);

  const [approvalActionError, setApprovalActionError] = useState<string | null>(null);
  const handleApprove = async () => {
    if (!pendingApproval || !pendingPhaseApprovalState.ready) return;
    setApprovalActionError(null);
    try {
      await postJSON(
        `/api/artifacts/missions/${encodeURIComponent(missionId)}/phases/${encodeURIComponent(pendingApproval.phaseId)}/approve`,
        { approvedBy: 'user' },
      );
      refreshDetail(workflowId);
    } catch (err) {
      setApprovalActionError(err instanceof Error ? err.message : 'Approve failed');
    }
  };
  const handleReject = async () => {
    if (!pendingApproval) return;
    setApprovalActionError(null);
    try {
      await postJSON(
        `/api/artifacts/missions/${encodeURIComponent(missionId)}/phases/${encodeURIComponent(pendingApproval.phaseId)}/reject`,
        { reason: 'Rejected by user from Mission Room' },
      );
      refreshDetail(workflowId);
    } catch (err) {
      setApprovalActionError(err instanceof Error ? err.message : 'Reject failed');
    }
  };

  const handleRetry = async () => {
    setRetrying(true);
    setSendError(null);
    try {
      const result = await retryMission(workflowId, retryGuidanceRef.current?.value || '');
      window.location.href = `/missions/${encodeURIComponent(result.workflowId)}`;
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRetrying(false);
      setShowRetryDialog(false);
      if (retryGuidanceRef.current) retryGuidanceRef.current.value = '';
    }
  };

  // Renders a user response in the conversation immediately, before the
  // backend echoes the persisted copy back over the websocket. The feed store
  // reconciles the persisted copy with this optimistic placeholder so the
  // response is listed once instead of duplicated.
  const appendOptimisticUserResponse = (
    message: string,
    type: 'user' | 'user_input_resolved' = 'user',
    phaseId?: string,
    taskId?: string,
  ) => {
    useFeedStore.getState().addEvent({
      id: `optimistic-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      source: 'user',
      message,
      timestamp: Date.now(),
      missionId,
      metadata: {
        content: message,
        role: 'user',
        optimistic: true,
        ...(phaseId ? { phaseId } : {}),
        ...(taskId ? { taskId } : {}),
      },
    });
  };

  const handleClarificationSubmit = async () => {
    const questions = plan?.clarificationQuestions || [];
    const answers = questions.map((_, index) => clarificationInputs.current.get(index)?.value.trim() || '');
    if (clarificationSubmitting) return;
    if (answers.some((answer) => !answer)) {
      setControlError('Please answer each question before continuing.');
      return;
    }
    setClarificationSubmitting(true);
    setControlError(null);
    try {
      const tenantId = detail?.input?.tenantId || 'tenant-1';
      const safeAnswers = await Promise.all(questions.map(async (question, index) => {
        const answer = answers[index];
        const secretQuestion = question.match(/^\s*\[secret:([a-z0-9_-]+)\]\s*(.*)$/i);
        if (!secretQuestion) return `${question}\nAnswer: ${answer}`;
        const [, key, prompt] = secretQuestion;
        const secret = await postJSON<{ id: string }>('/api/vault/secrets', {
          name: `mission-${missionId}-${key}`,
          plaintext: answer,
          tenantId,
        });
        return `[secret-ref:${key}] ${prompt.trim()}\nVault reference: vault://${secret.id}`;
      }));
      appendOptimisticUserResponse(
        `Clarification answers:\n${safeAnswers.map((a, i) => `${i + 1}. ${a}`).join('\n')}`,
      );
      const result = await postJSON<{ status: string }>(
        `/api/temporal/missions/${encodeURIComponent(workflowId)}/start`,
        { clarificationAnswers: safeAnswers },
      );
      updateMissionStatus(workflowId, result.status);
      clarificationInputs.current.forEach((input) => { input.value = ''; });
      clarificationInputs.current.clear();
      await refreshDetail(workflowId);
    } catch (error) {
      setControlError(error instanceof Error ? error.message : 'Failed to submit clarification');
    } finally {
      setClarificationSubmitting(false);
    }
  };

  const handleMissionInteractionSubmit = async (decision?: 'granted' | 'denied') => {
    const pending = detail?.output?.outputs?.pendingInteraction;
    if (!pending || interactionSubmitting) return;
    const secretKeys = pending.kind === 'user_input' ? secretKeysForInteraction(pending) : [];
    const configureInSettings = pending.kind === 'user_input'
      && secretKeys.length > 0;
    const responseText = interactionResponse.trim();
    if (pending.kind === 'user_input' && !configureInSettings && !responseText) {
      setControlError('Enter a response before continuing.');
      return;
    }
    if (configureInSettings && !interactionConfigurationReady) return;
    const responseMessage = pending.kind === 'mcp_permission'
      ? `Permission ${decision === 'granted' ? 'granted' : 'denied'}`
      : configureInSettings
        ? `The required configuration values (${secretKeys.join(', ')}) have been saved in Tools or Vault. Retry the mission using those configured values; do not request the secrets in chat.`
        : responseText;
    setInteractionSubmitting(true);
    setControlError(null);
    appendOptimisticUserResponse(responseMessage, 'user', pending.phaseId, pending.taskId);
    try {
      if (pending.kind === 'mcp_permission') {
        if (!decision) return;
        const result = await postJSON<{ status: string }>(
          `/api/temporal/missions/${encodeURIComponent(workflowId)}/start`,
          {
            permissionDecision: decision,
            ...(decision === 'granted' && permissionScope ? { permissionScope } : {}),
          },
        );
        updateMissionStatus(workflowId, result.status);
      } else {
        if (configureInSettings && pending.credentialRequest) {
          const result = await postJSON<{ status: string }>(
            `/api/temporal/missions/${encodeURIComponent(workflowId)}/start`,
            { useConfiguredCredentials: true },
          );
          updateMissionStatus(workflowId, result.status);
        } else {
          const result = await postJSON<{ status: string }>(
            `/api/temporal/missions/${encodeURIComponent(workflowId)}/start`,
            { interactionResponse: responseMessage },
          );
          updateMissionStatus(workflowId, result.status);
        }
      }
      setInteractionAccepted(true);
      setInteractionResponse('');
      setPermissionScope('');
      if (pending.requestId || (pending.phaseId && pending.taskId)) {
        markInteractionResponded(getInteractionId(pending));
      }
      await refreshDetail(workflowId);
    } catch (error) {
      setControlError(error instanceof Error ? error.message : 'Failed to resume the mission');
    } finally {
      setInteractionSubmitting(false);
    }
  };

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript && transcriptSticksToBottom.current) {
      transcript.scrollTo({ top: transcript.scrollHeight });
    }
  }, [transcript.length]);

  const sendMessage = async () => {
    const text = messageText.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);

    const pending = detail?.output?.outputs?.pendingInteraction;
    const interactionId = pending ? getInteractionId(pending) : null;

    // Optimistically render the user's message immediately instead of waiting
    // for the backend round-trip and websocket broadcast. The backend echoes
    // the same event back; the feed store reconciles the persisted copy with
    // this optimistic placeholder so the sent message is not listed twice.
    const optimisticEvent: FeedEvent = {
      id: `optimistic-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'user',
      source: 'user',
      message: text,
      timestamp: Date.now(),
      missionId,
      metadata: { content: text, role: 'user', optimistic: true },
    };
    useFeedStore.getState().addEvent(optimisticEvent);

    try {
      const result = await postJSON<{ status: string; error?: string }>(
        `/api/temporal/missions/${encodeURIComponent(workflowId)}/messages`,
        { missionId, content: text, role: 'user' },
      );
      if (result?.error) {
        setSendError(result.error);
      } else {
        setMessageText('');
        if (interactionId) {
          markInteractionResponded(interactionId);
        }
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const rawStatus = detail?.status || 'unknown';
  const status = rawStatus;
  const badge = STATUS_BADGE[status] || status;
  const artifactCount = artifactItems.length;
  const missionIsRunning = rawStatus === 'running' || rawStatus === 'started';

  return (
    <div className="page mission-room">

      <div className="mission-room-header">
        <div>
          <Link to="/missions" className="link-button" style={{ marginBottom: 4 }}>
            ← All Missions
          </Link>
          <h1 style={{ margin: 0 }}>Mission Room</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            <code>{workflowId}</code>
          </p>
        </div>
<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
{['paused', 'pending', 'awaiting_review'].includes(status) && (
                  <button onClick={async () => {
                     setControlError(null);
                     try {
                       const pending = detail?.output?.outputs?.pendingInteraction;
                       const hasCredentialRequest = pending?.kind === 'user_input' && Boolean(pending.credentialRequest);
                       const result = await postJSON<{ status: string }>(
                         `/api/temporal/missions/${encodeURIComponent(workflowId)}/start`,
                         hasCredentialRequest ? { useConfiguredCredentials: true } : {},
                       );
                       updateMissionStatus(workflowId, result.status);
                       if (pending && (pending.requestId || (pending.phaseId && pending.taskId))) {
                         markInteractionResponded(getInteractionId(pending));
                       }
                       await refreshDetail(workflowId);
                     } catch (error) {
                       setControlError(error instanceof Error ? error.message : 'Failed to resume mission');
                     }
                   }}>Resume</button>
                )}
               {status === 'running' && (
                 <button onClick={async () => {
                   setControlError(null);
                   try {
                     const result = await postJSON<{ status: string }>(
                       `/api/temporal/missions/${encodeURIComponent(workflowId)}/pause`,
                       {},
                     );
                     updateMissionStatus(workflowId, result.status);
                     await refreshDetail(workflowId);
                   } catch (error) {
                     setControlError(error instanceof Error ? error.message : 'Failed to pause mission');
                   }
                 }}>Pause</button>
               )}
               {['running', 'pausing', 'paused'].includes(status) && (
                 <button className="danger" onClick={async () => {
                   if (!confirm('Stop this mission after the current step finishes safely?')) return;
                   setControlError(null);
                   try {
                     const result = await postJSON<{ status: string }>(
                       `/api/temporal/missions/${encodeURIComponent(workflowId)}/stop`,
                       {},
                     );
                     updateMissionStatus(workflowId, result.status);
                     await refreshDetail(workflowId);
                   } catch (error) {
                     setControlError(error instanceof Error ? error.message : 'Failed to stop mission');
                   }
                 }}>Stop</button>
               )}
               {(status === 'failed' || status === 'incomplete' || status === 'canceled') && (
                 <button onClick={() => setShowRetryDialog(true)} disabled={retrying}>
                   {retrying ? 'Retrying...' : 'Retry'}
                 </button>
               )}
               {controlError && <div className="error-banner">{controlError}</div>}
            </div>
            <span className={`badge ${badge}`}>{getMissionStatusLabel(status)}</span>
             <span className={`connection-status ${connected ? 'online' : 'offline'}`}>
               {connected ? 'Live' : 'Offline'}
             </span>
        </div>
      </div>

      {detailError && <div className="error-banner">{detailError}</div>}
      {detail?.status === 'failed' && detail?.error && (
        <div className="error-banner">Mission failed: {friendlyMissionError(detail.error)}</div>
      )}

      {detail?.output?.outputs?.status === 'awaiting_clarification' && plan?.requiresClarification && (
        <div className="error-banner" style={{ background: 'rgba(245,158,11,0.15)' }}>
          <strong>More information is needed before the mission can continue.</strong>
          {plan.clarificationQuestions && plan.clarificationQuestions.length > 0 && (
            <ol style={{ margin: '8px 0', paddingLeft: 22 }}>
              {plan.clarificationQuestions.map((question, index) => {
                const secretQuestion = question.match(/^\s*\[secret:([a-z0-9_-]+)\]\s*(.*)$/i);
                let label = secretQuestion ? secretQuestion[2] : question;
                try { const p = JSON.parse(label); if (p && typeof p.question === 'string') label = p.question; } catch {}
                label = label.replace(/__ASK_USER__:\s*/g, '').replace(/\{[\s\S]*\.\.\.[\s\S]*\}/g, '').replace(/[{}]/g, ' ').replace(/\s+/g, ' ').trim() || 'Provide the requested information.';
                return (
                  <li key={index} style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block' }}>
                      {label}
                      <input
                        key={`${workflowId}-${index}-${question}`}
                        type={secretQuestion ? 'password' : 'text'}
                        autoComplete={secretQuestion ? 'new-password' : undefined}
                        ref={(element) => {
                          if (element) clarificationInputs.current.set(index, element);
                          else clarificationInputs.current.delete(index);
                        }}
                        style={{ display: 'block', width: '100%', marginTop: 4, boxSizing: 'border-box' }}
                      />
                      {secretQuestion && (
                        <span className="muted">Saved directly to Vault; the value is not sent to the planner or Agents.</span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ol>
          )}
          <button
            onClick={handleClarificationSubmit}
            disabled={clarificationSubmitting}
            style={{ marginTop: 8 }}
          >
            {clarificationSubmitting ? 'Continuing...' : 'Continue mission'}
          </button>
          {controlError && <div className="error-banner">{controlError}</div>}
        </div>
      )}

      {detail?.output?.outputs?.pendingInteraction && !(interactionSubmitting || interactionAccepted) && (() => {
        const pending = detail.output.outputs.pendingInteraction;
        const interactionId = getInteractionId(pending);
        const respondedInteractions = getRespondedInteractions();
        if (respondedInteractions.has(interactionId)) {
          return null;
        }
        const secretKeys = pending.kind === 'user_input' ? secretKeysForInteraction(pending) : [];
        const secretQuestion = pending.kind === 'user_input'
          ? pending.question?.match(/^\s*\[secret:([a-z0-9_-]+)\]\s*(.*)$/i)
          : null;
        const configureInSettings = pending.kind === 'user_input'
          && secretKeys.length > 0;
        const freeTextInput = pending.kind === 'user_input'
          && !configureInSettings
          && !secretQuestion;
        const hasSmtpCredentials = secretKeys.some((key) => key.startsWith('smtp_'));
        const configureToolId = pending.credentialRequest?.toolId
          || (hasSmtpCredentials ? 'email_sender' : undefined);
        const configureToolLabel = pending.credentialRequest?.toolName
          || (hasSmtpCredentials ? 'Email Sender' : 'tool');
        const credentialToolId = pending.credentialRequest?.toolId;
        const toolSettingsUrl = configureToolId
          ? `/tools?tool=${encodeURIComponent(configureToolId)}&tab=configure`
          : '/tools';
        const permission = pending.permission;
        return (
          <section className="warning-banner" style={{ background: '#000000', color: '#ffeb3b', border: '2px solid #ef4444', borderRadius: '6px', padding: '10px 12px', fontSize: '14px' }}>
            <strong>
              {pending.kind === 'user_input'
                ? 'The Agent needs your input to continue.'
                : 'The Agent requests permission to use a discovered tool.'}
            </strong>
            <div style={{ marginTop: 6 }}>
              Task: {pending.taskTitle} · {pending.agentRole}
            </div>
            {pending.kind === 'user_input' && (
              <div style={{ marginTop: 10 }}>
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {secretQuestion ? secretQuestion[2] : displayInteractionQuestion(pending)}
                </div>
                {configureInSettings ? (
                  <>
                    <p className="muted" style={{ margin: '8px 0' }}>
                      Configure these values in Tools or Vault, then return here. Secret values are not collected in mission chat.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {configureToolId && (
                        <Link
                          to={toolSettingsUrl}
                          rel="noreferrer"
                          className="link-button"
                        >
                          Configure {configureToolLabel}
                        </Link>
                      )}
                      {!configureToolId && (
                        <Link to={toolSettingsUrl} rel="noreferrer" className="link-button">
                          Browse tool settings
                        </Link>
                      )}
                      <Link to="/vault" rel="noreferrer" className="link-button">
                        Open Vault secrets
                      </Link>
                    </div>
                    {credentialToolId && (
                      <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                        {secretKeys.map((key) => (
                          <li key={key}>
                            <Link
                              to={`/vault?name=${encodeURIComponent(`tool:${credentialToolId}:${key}`)}`}
                              rel="noreferrer"
                            >
                              Configure {secretLabelForInteraction(pending, key)} in Vault
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                    <label style={{ display: 'block', marginTop: 10 }}>
                      <input
                        type="checkbox"
                        checked={interactionConfigurationReady}
                        onChange={(event) => setInteractionConfigurationReady(event.target.checked)}
                      />
                      {' '}I saved the required configuration and am ready to continue.
                    </label>
                  </>
                ) : secretQuestion ? (
                  <p className="muted" style={{ marginTop: 8 }}>
                    Provide this value in Tools or Vault before continuing.
                  </p>
                ) : (
                  <>
                    <p className="muted" style={{ margin: '8px 0' }}>
                      Reply with the specific information requested above. If this requires tool or service configuration, configure it in Tools or Vault, then explain what you changed so the agent can continue.
                    </p>
                    <textarea
                      value={interactionResponse}
                      onChange={(event) => setInteractionResponse(event.target.value)}
                      placeholder="Provide the specific information or configuration details the agent requested..."
                      rows={3}
                      disabled={interactionSubmitting || interactionAccepted}
                      style={{ display: 'block', width: '100%', marginTop: 8, boxSizing: 'border-box' }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                          event.preventDefault();
                          void handleMissionInteractionSubmit();
                        }
                      }}
                    />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                      <Link to="/tools" className="link-button">Open Tools configuration</Link>
                      <Link to="/vault" className="link-button">Open Vault secrets</Link>
                    </div>
                  </>
                )}
              </div>
            )}
            {pending.kind === 'mcp_permission' && permission && (
              <div style={{ marginTop: 10 }}>
                <h3 style={{ margin: '4px 0' }}>{permission.toolName}</h3>
                {permission.publisher && <div>Publisher: {permission.publisher}</div>}
                {permission.trustTier && <div>Trust tier: {permission.trustTier}</div>}
                {permission.sideEffectClass && <div>Effect: {permission.sideEffectClass.replace(/_/g, ' ')}</div>}
                <div>Data shared: {permission.dataClasses.length ? permission.dataClasses.join(', ') : 'No task data specified'}</div>
                <div>
                  Credentials: {permission.credentials.needed
                    ? `${permission.credentials.keys.join(', ') || 'required'}${permission.credentials.source ? ` (${permission.credentials.source})` : ''}`
                    : 'None required'}
                </div>
                <p style={{ whiteSpace: 'pre-wrap' }}>{permission.explanation}</p>
                {permission.toolDescription && (
                  <p className="muted">Publisher description (unverified): {permission.toolDescription}</p>
                )}
                {permission.availableScopes.length > 1 && (
                  <label>
                    Permission scope
                    <select
                      value={permissionScope || permission.defaultScope}
                      onChange={(event) => setPermissionScope(event.target.value)}
                      style={{ display: 'block', marginTop: 4 }}
                    >
                      {permission.availableScopes.map((scope) => (
                        <option key={scope} value={scope}>{scope.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </label>
                )}
                {permission.expiresAt && (
                  <div className="muted">Request expires {new Date(permission.expiresAt).toLocaleString()}.</div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {pending.kind === 'user_input' ? (
                <button
                  onClick={() => void handleMissionInteractionSubmit()}
                  disabled={
                    interactionSubmitting
                    || interactionAccepted
                    || (configureInSettings && !interactionConfigurationReady)
                    || (freeTextInput && !interactionResponse.trim())
                  }
                >
                  {interactionSubmitting || interactionAccepted
                    ? 'Continuing...'
                    : configureInSettings
                      ? 'Continue after configuration'
                      : 'Send response'}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => void handleMissionInteractionSubmit('granted')}
                    disabled={interactionSubmitting || !pending.requestId}
                  >
                    {interactionSubmitting ? 'Applying decision...' : 'Grant and continue'}
                  </button>
                  <button
                    onClick={() => void handleMissionInteractionSubmit('denied')}
                    disabled={interactionSubmitting || !pending.requestId}
                  >
                    Deny
                  </button>
                </>
              )}
            </div>
            {controlError && <div className="error-banner">{controlError}</div>}
          </section>
        );
      })()}

      {showRetryDialog && (
        <div className="error-banner" style={{ background: 'rgba(56,189,248,0.15)' }}>
          <div>
            <strong style={{ color: '#38bdf8' }}>Retry Mission</strong>
            <p className="muted" style={{ margin: '4px 0' }}>
              Provide guidance to help the agents succeed on retry. This will create a new mission with your guidance appended to the original prompt.
            </p>
          </div>
          <textarea
            placeholder="e.g., 'Focus on the API integration tests, skip the UI components' or 'Use the v2 API endpoints instead of v1'"
            ref={retryGuidanceRef}
            rows={3}
            style={{ width: '100%', marginTop: 8, marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleRetry} disabled={retrying}>
              {retrying ? 'Retrying...' : 'Retry Mission'}
            </button>
            <button className="secondary" onClick={() => {
              setShowRetryDialog(false);
              if (retryGuidanceRef.current) retryGuidanceRef.current.value = '';
            }}>
              Cancel
            </button>
          </div>
          {sendError && <span className="muted" style={{ color: '#ef4444', marginTop: 8 }}>{sendError}</span>}
        </div>
      )}

      {pendingApproval && (
        <div
          className="error-banner"
          style={{ background: 'rgba(245,158,11,0.15)' }}
        >
          <div>
            <strong style={{ color: '#ea5809' }}>Action required:</strong>{' '}
            {pendingApproval.question}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button onClick={handleApprove} disabled={!pendingPhaseApprovalState.ready}>
              Approve phase
            </button>
            <button className="danger" onClick={handleReject}>Reject phase</button>
            <button className="secondary" onClick={() => setTab('plan')}>Open full plan</button>
          </div>
          {!pendingPhaseApprovalState.ready && (
            <div className="muted" style={{ marginTop: 6, fontSize: '12px' }}>
              {pendingPhaseApprovalState.incompleteTasks > 0
                ? `${pendingPhaseApprovalState.incompleteTasks} task(s) are not yet recorded as complete. `
                : ''}
              {pendingPhaseApprovalState.missingArtifacts > 0
                ? `${pendingPhaseApprovalState.missingArtifacts} task(s) still have expected deliverables that have not been published.`
                : ''}
              {!pendingPhase && 'The phase plan is not available yet.'}
            </div>
          )}
          {approvalActionError && <span className="muted">{approvalActionError}</span>}
          {pendingPhase && (
            <details open style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', color: '#38bdf8', fontSize: '13px' }}>
                Review plan and phase deliverables
              </summary>
              {plan?.summary && (
                <p className="muted" style={{ marginTop: 6, fontSize: '13px' }}>{plan.summary}</p>
              )}
              <div style={{ marginTop: 6, fontSize: '13px' }}>
                <strong>{pendingPhase.name}</strong>
                {pendingPhase.goal && <span className="muted"> — {pendingPhase.goal}</span>}
                {pendingPhase.requiresApproval && <span className="badge">requires approval</span>}
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0', fontSize: '13px' }}>
                {pendingPhase.tasks.map((task) => {
                  const taskStatus = getTaskStatus(task, pendingPhase.id, phaseOutputs, missionEvents, detail?.status);
                  const expected = task.expectedArtifacts || [];
                  const produced = artifactItems.filter((artifact) =>
                    artifact.kind === 'produced'
                    && artifact.phaseId === pendingPhase.id
                    && artifact.taskId === task.id
                  );
                  return (
                    <li key={task.id} style={{ padding: '8px 0', borderTop: '1px solid rgba(148,163,184,0.2)' }}>
                      <div>
                        <strong>{task.title}</strong>
                        {task.agentRole && <span className="badge">🤖 {task.agentRole}</span>}
                        {taskStatus && <span className={`badge ${taskStatus}`}>{taskStatus}</span>}
                      </div>
                      {task.description && <p className="muted" style={{ margin: '4px 0' }}>{task.description}</p>}
                      {expected.length > 0 && (
                        <div className="muted" style={{ fontSize: '12px', marginTop: 4 }}>
                          Expected deliverables: {expected.join(', ')}
                        </div>
                      )}
                      {produced.length > 0 ? (
                        <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0' }}>
                          {produced.map((artifact) => (
                            <li key={artifact.id} style={{ marginBottom: 6, padding: 6, background: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
                              <strong style={{ color: '#38bdf8', fontSize: '12px' }}>{artifact.name}</strong>
                              <span className={`badge ${getArtifactPurpose(artifact)}`}>
                                {getArtifactPurpose(artifact) === 'execution-outcome'
                                  ? 'Execution outcome'
                                  : getArtifactPurpose(artifact)}
                              </span>
                              {(artifact.content !== undefined || artifact.data !== undefined || artifact.url) && (
                                <details style={{ marginTop: 4 }}>
                                  <summary style={{ cursor: 'pointer', fontSize: '11px', color: '#94a3b8' }}>View artifact</summary>
                                  <MissionArtifactContent artifact={artifact} />
                                </details>
                              )}
                              {artifact.url && <a href={artifact.url} target="_blank" rel="noreferrer">Open artifact</a>}
                            </li>
                          ))}
                        </ul>
                      ) : expected.length > 0 ? (
                        <div className="muted" style={{ color: '#f59e0b', fontSize: '12px', marginTop: 4 }}>
                          No produced artifact is recorded for this task yet.
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="mission-summary">
        {detail?.input?.prompt && (
          <details style={{ marginRight: 16 }}>
            <summary style={{ cursor: 'pointer', color: '#38bdf8', fontWeight: 500 }}>
              Mission Brief
            </summary>
            <p className="muted" style={{ marginTop: 6, fontSize: '13px', maxWidth: 600 }}>
              {detail.input.prompt}
            </p>
          </details>
        )}
        {detail?.startedAt && (
          <MissionDuration startedAt={detail.startedAt} completedAt={detail.completedAt} active={missionIsRunning} />
        )}
        {plan && <span><strong>Phases:</strong> {plan.phases.length}</span>}
        {modelUsage.calls > 0 && (
          <span>
            <strong>Model calls:</strong> {modelUsage.calls}
            {modelUsage.tokens > 0 ? ` (${modelUsage.tokens.toLocaleString()} tokens)` : ''}
          </span>
        )}
        {totalEstimatedCost > 0 && (
          <span>
            <strong>Estimated Cost:</strong> ${totalEstimatedCost.toFixed(4)} USD
          </span>
        )}
        {modelUsage.calls > 0 && totalEstimatedCost === 0 && (
          <span><strong>Estimated Cost:</strong> Free</span>
        )}
        {artifactCount > 0 && (
          <span>
            <strong>Artifacts:</strong> {artifactCount}
          </span>
        )}
        <span><strong>Events:</strong> {missionEvents.length}</span>
      </div>

      <div className="entity-tabs">
        {(['conversation', 'timeline', 'plan', 'artifacts', 'agents'] as Tab[]).map((t) => (
          <button
            key={t}
            className={tab === t ? 'tab active' : 'tab'}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'artifacts' && artifactCount > 0
              ? ` (${artifactCount})`
              : ''}
            {t === 'plan' && plan?.phases.length
              ? ` (${plan.phases.length})`
              : ''}
            {t === 'conversation' && conversationEvents.length
              ? ` (${conversationEvents.length})`
              : ''}
            {t === 'timeline' && timelineEvents.length
              ? ` (${timelineEvents.length})`
              : ''}
          </button>
        ))}
      </div>

      {tab === 'conversation' && (
        <div className="card mission-conversation">
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div
                className="transcript"
                ref={transcriptRef}
                onScroll={(event) => {
                  const element = event.currentTarget;
                  transcriptSticksToBottom.current =
                    element.scrollHeight - element.scrollTop - element.clientHeight < 48;
                }}
              >
            {detailLoading && !detail ? (
              <div className="loading">Loading mission...</div>
            ) : transcript.length === 0 ? (
              <div className="empty-state">
                <p>No conversation yet.</p>
                <p className="muted">Mission events and your messages will appear here.</p>
              </div>
            ) : (
              transcript.map((turn) => (
                <div key={turn.id} className={`turn turn-${turn.role}`}>
                  <div className="turn-meta">
                    <strong>{turn.label}</strong>
                    <span className="muted">
                      {new Date(turn.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="turn-body">
                    {turn.lines.map((line, idx) => (
                      <div key={idx} className={`turn-line ${line.kind}`}>
                        <span className="turn-icon">{iconForType(line.type)}</span>
                        <span className="turn-line-text">{renderTextWithLinks(line.text)}</span>
                        {line.approval && pendingApproval?.phaseId === line.approval.phaseId && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                            <button
                              onClick={handleApprove}
                              disabled={!pendingPhaseApprovalState.ready || pendingApproval?.phaseId !== line.approval.phaseId}
                            >
                              Approve
                            </button>
                            <button className="danger" onClick={handleReject}>Reject</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
              </div>
            </div>
          </div>
          <div className="composer">
            {sendError && <div className="error-banner">{sendError}</div>}
            <textarea
              ref={inputRef}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Send messages to the mission (agent outputs stream here)..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              rows={3}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="muted">Cmd/Ctrl+Enter to send</span>
              <button onClick={sendMessage} disabled={sending}>
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'timeline' && (
        <div className="card" style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <h3>Mission Timeline</h3>
            <p className="muted" style={{ fontSize: '12px', marginBottom: '12px' }}>
              Lifecycle milestones: mission start/complete, phase approvals, and task outcomes.
            </p>
            {timelineEvents.length === 0 ? (
              <div className="empty-state">No lifecycle events recorded yet.</div>
            ) : (
              <ul className="timeline">
                {timelineEvents.map((evt) => (
                  <li key={evt.id} className={`timeline-item ${evt.type}`}>
                    <span className="timeline-icon">{iconForType(String(evt.type))}</span>
                    <div className="timeline-body">
                      <div className="timeline-meta">
                        <strong>{String(evt.type)}</strong>
                        <span className="muted">
                          {evt.timestamp
                            ? new Date(evt.timestamp).toLocaleString()
                            : ''}
                        </span>
                      </div>
                      <div>{evt.message}</div>
                       {evt.metadata && Object.keys(evt.metadata).length > 0 && (
                         <div className="muted" style={{ fontSize: '11px', marginTop: '4px' }}>
                           {Object.entries(evt.metadata)
                             .filter(([k, v]) => v !== null && v !== undefined && !k.startsWith('_'))
                             .map(([k, v]) => {
                               const label = k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
                               const val = typeof v === 'string' ? v : JSON.stringify(v);
                               const displayVal = val.length > 80 ? `${val.slice(0, 79)}…` : val;
                               return <span key={k} style={{ marginRight: '12px' }}>{label}: {displayVal}</span>;
                             })}
                         </div>
                       )}
                    </div>
                  </li>
                ))}
              </ul>
)}
          </div>
        </div>
      )}

      {tab === 'plan' && (
        <div className="card">
          <h3>Plan</h3>
          {!plan ? (
            <div className="empty-state">
              {detail?.status === 'running' || (
                !['failed', 'completed', 'incomplete', 'canceled'].includes(detail?.status || '') &&
                missionEvents.some((event) => event.type === 'planner_started')
              )
                ? 'The planning agent is developing a plan for this mission. This can take a little while while providers respond.'
                : 'No plan recorded for this mission.'}
            </div>
          ) : (
            <div className="plan-view">
              {plan.summary && (
                <p className="plan-summary">{plan.summary}</p>
              )}
              <div className="plan-meta">
                {detail?.startedAt && (
                  <MissionDuration
                    startedAt={detail.startedAt}
                    completedAt={detail.completedAt}
                    active={missionIsRunning}
                    precise
                  />
                )}
                {totalEstimatedCost > 0 && (
                  <span>
                    <strong>Cost:</strong> ${totalEstimatedCost.toFixed(4)} USD
                  </span>
                )}
                {modelUsage.calls > 0 && totalEstimatedCost === 0 && (
                  <span><strong>Cost:</strong> Free</span>
                )}
                <span>
                  <strong>Phases:</strong> {plan.phases.length}
                </span>
              </div>
              <ol className="plan-phases">
                {plan.phases.map((phase) => {
                  const phaseStatus = derivePhaseStatus(phase, phaseOutputs, missionEvents, detail?.status) || phaseOutputs.find((p) => p.phaseId === phase.id)?.status;
                return (
                  <li
                    key={phase.id}
                    className={`plan-phase ${phaseStatus || ''}`}
                  >
                      <div className="plan-phase-header">
                        <strong>{phase.name}</strong>
                        {phase.requiresApproval && (
                          <span className="badge">requires approval</span>
                        )}
                        {phaseStatus && (
                          <span className={`badge ${phaseStatus}`}>
                            {phaseStatus}
                          </span>
                        )}
                      </div>
                      {phase.goal && <p className="muted">{phase.goal}</p>}
                      <ul className="plan-tasks">
                        {phase.tasks.map((task) => {
                          const taskStatus = getTaskStatus(task, phase.id, phaseOutputs, missionEvents, detail?.status);
                          const taskArtifacts = artifactItems.filter((artifact) =>
                            artifact.kind === 'produced'
                            && artifact.phaseId === phase.id
                            && artifact.taskId === task.id
                          );
                          return (
                            <li
                              key={task.id}
                              className={`plan-task ${taskStatus || ''}`}
                            >
                              <div>
                                <strong>{task.title}</strong>
                                {task.description && (
                                  <p className="muted">{task.description}</p>
                                )}
                              </div>
                              <div className="plan-task-meta">
                                {task.agentRole && (
                                  <span className="badge">🤖 {task.agentRole}</span>
                                )}
                                {taskStatus && (
                                  <span className={`badge ${taskStatus}`}>
                                    {taskStatus}
                                  </span>
                                )}
                                {taskArtifacts.length > 0 && taskArtifacts.map((artifact) => (
                                  <a
                                    key={artifact.id}
                                    href={artifact.url || `#artifact-${artifact.id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="badge"
                                    style={{ textDecoration: 'underline', color: 'inherit' }}
                                  >
                                    📎 {artifact.name}
                                  </a>
                                ))}
                              </div>
                              {(task.expectedArtifacts?.length || taskArtifacts.length > 0) && (
                                <div style={{ marginTop: 4 }}>
                                   {(task.expectedArtifacts || []).filter((artifact) =>
                                     !taskArtifacts.some((produced) => produced.name === artifact),
                                   ).map((artifact) => (
                                     <span key={`expected-${artifact}`} className="badge expected">
                                       Needed: {artifact}
                                     </span>
                                   ))}
                                    {taskArtifacts.map((artifact) => (
                                      <a
                                        key={artifact.id}
                                        href={artifact.url || `#artifact-${artifact.id}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="badge produced"
                                        style={{ textDecoration: 'underline', color: 'inherit', marginLeft: 6 }}
                                      >
                                        Produced: {artifact.name}
                                      </a>
                                    ))}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </div>
      )}

      {tab === 'artifacts' && (
        <div className="card">
          <h3>Artifacts</h3>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 13 }}>
              Upload artifact for mission: <input type="file" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  await postJSON(`/api/artifacts/missions/${encodeURIComponent(missionId)}/artifacts`, {
                    name: file.name,
                    content: text,
                    type: file.type || 'text/plain',
                  });
                  // refresh mission detail to show new artifact
                  await refreshDetail(workflowId);
                } catch (err) {
                  window.alert(err instanceof Error ? err.message : 'Upload failed');
                }
              }} />
            </label>
          </div>
          <ArtifactsView
            missionId={missionId}
            plan={plan ?? null}
            phaseOutputs={phaseOutputs}
            events={missionEvents}
            storedArtifacts={detail?.artifacts || []}
            loadError={detail?.artifactLoadError}
            onRefresh={() => refreshDetail(workflowId)}
          />
        </div>
      )}

      {tab === 'agents' && (
        <div className="card">
          <h3>Agents</h3>
          <p className="muted" style={{ fontSize: '12px', marginBottom: '12px' }}>
            Ephemeral mission agents and their recent outputs.
          </p>
          <AgentOutputsPanel
            missionId={missionId}
            missionStatus={detail?.status}
            plan={plan}
          />
        </div>
      )}
    </div>
  );
};

interface ArtifactsViewProps {
  missionId: string;
  plan: Plan | null;
  phaseOutputs: PhaseOutput[];
  events: FeedEvent[];
  storedArtifacts: unknown[];
  loadError?: string;
  onRefresh: () => void;
}

const ArtifactsView = ({ missionId, plan, phaseOutputs, events, storedArtifacts, loadError, onRefresh }: ArtifactsViewProps) => {
  const items = buildMissionArtifactItems(plan, phaseOutputs, events, storedArtifacts);
  const [purposeFilter, setPurposeFilter] = useState<'all' | 'deliverable' | 'workproduct' | 'execution-outcome'>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'document' | 'pdf' | 'image' | 'audio' | 'video' | 'other'>('all');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const producedGroups = groupMissionArtifactVersions(items.filter((item) => item.kind === 'produced'))
    .filter((group) => {
      const versions = showVersionHistory ? group.artifacts : [group.latest];
      return versions.some((artifact) =>
        (purposeFilter === 'all' || getArtifactPurpose(artifact) === purposeFilter)
        && (statusFilter === 'all' || artifact.status === statusFilter)
        && (typeFilter === 'all' || getArtifactMediaCategory(artifact) === typeFilter),
      );
    });
  const expectedItems = items.filter((item) => item.kind === 'expected')
    .filter((item) =>
      (purposeFilter === 'all' || purposeFilter === 'deliverable')
      && (statusFilter === 'all' || statusFilter === 'expected')
      && (typeFilter === 'all' || getArtifactMediaCategory(item) === typeFilter),
    );

  if (items.length === 0) {
    return (
      <>
        {loadError && <div className="error-banner">Could not load persisted artifacts: {loadError}</div>}
        <div className="empty-state">No artifacts produced or expected for this mission.</div>
      </>
    );
  }

  return (
    <>
      {loadError && <div className="error-banner">Could not load persisted artifacts: {loadError}</div>}
      <div className="mission-start-collapsed" style={{ marginBottom: 12 }}>
        <label>
          Purpose
          <select value={purposeFilter} onChange={(event) => setPurposeFilter(event.target.value as typeof purposeFilter)}>
            <option value="all">All artifacts</option>
            <option value="deliverable">Deliverables</option>
            <option value="workproduct">Workproducts</option>
            <option value="execution-outcome">Execution outcomes</option>
          </select>
        </label>
        <label>
          Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="expected">Expected</option>
            <option value="draft">Draft</option>
            <option value="in_review">Ready for review</option>
            <option value="approved">Approved</option>
            <option value="completed">Completed</option>
            <option value="blocked">Blocked</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        <label>
          File type
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}>
            <option value="all">All file types</option>
            <option value="document">Documents & structured data</option>
            <option value="pdf">PDF</option>
            <option value="image">Images</option>
            <option value="audio">Audio</option>
            <option value="video">Video</option>
            <option value="other">Other files</option>
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={showVersionHistory}
            onChange={(event) => setShowVersionHistory(event.target.checked)}
          />
          Show all versions
        </label>
        <span className="muted">Latest versions are shown first; older revisions stay available in history.</span>
      </div>
      <ul className="artifact-list">
        {expectedItems.map((a) => (
          <li key={a.id} className={`artifact-item ${a.kind}`}>
            <div className="artifact-header">
              <strong>{a.name}</strong>
              <span className="badge expected">Expected deliverable</span>
              {a.phaseId && <span className="muted" title={a.phaseId}>phase: {a.phaseId.slice(-8)}</span>}
              {a.taskId && <span className="muted" title={a.taskId}>task: {a.taskId.slice(-8)}</span>}
            </div>
          </li>
        ))}
        {producedGroups.map((group) => (
          <li key={group.key} className={`artifact-item ${getArtifactPurpose(group.latest)}`}>
            <div className="artifact-header">
              <strong>{group.latest.name}</strong>
              <span className={`badge ${getArtifactPurpose(group.latest)}`}>
                {getArtifactPurpose(group.latest) === 'execution-outcome' ? 'Execution outcome' : getArtifactPurpose(group.latest)}
              </span>
              {group.latest.status && <span className={`badge ${group.latest.status}`}>{group.latest.status.replace('_', ' ')}</span>}
              {group.latest.version !== undefined && <span className="badge">Version {group.latest.version}</span>}
              {group.latest.phaseName && <span className="muted">Phase: {group.latest.phaseName}</span>}
              {group.latest.taskTitle && <span className="muted">Task: {group.latest.taskTitle}</span>}
              {group.latest.createdAt && <time className="muted">{new Date(group.latest.createdAt).toLocaleString()}</time>}
            </div>
            <MissionArtifactContent artifact={group.latest} />
            {group.artifacts.length > 1 && (
              showVersionHistory ? (
                group.artifacts.filter((artifact) => artifact !== group.latest).map((artifact, index) => (
                  <article key={artifact.id || `${artifact.name}-${index}`} style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #334155' }}>
                    <div className="artifact-header">
                  <strong>{artifact.name}</strong>
                  <span className="badge">{artifact.version !== undefined ? `Version ${artifact.version}` : `Revision ${index + 1}`}</span>
                  {artifact.status && <span className={`badge ${artifact.status}`}>{artifact.status.replace('_', ' ')}</span>}
                    </div>
                    <MissionArtifactContent artifact={artifact} />
                  </article>
                ))
              ) : (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer' }}>
                    {group.artifacts.length - 1} previous version{group.artifacts.length === 2 ? '' : 's'}
                  </summary>
                  {group.artifacts.filter((artifact) => artifact !== group.latest).map((artifact, index) => (
                    <article key={artifact.id || `${artifact.name}-${index}`} style={{ padding: '8px 0', borderTop: '1px solid #334155' }}>
                  <div className="artifact-header">
                    <strong>{artifact.name}</strong>
                    <span className="badge">{artifact.version !== undefined ? `Version ${artifact.version}` : `Revision ${index + 1}`}</span>
                    {artifact.status && <span className={`badge ${artifact.status}`}>{artifact.status.replace('_', ' ')}</span>}
                  </div>
                  <MissionArtifactContent artifact={artifact} />
                    </article>
                  ))}
                </details>
              )
            )}
            {getArtifactPurpose(group.latest) !== 'execution-outcome' && (
              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 13 }}>
                  Upload new version: <input type="file" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const body = new FormData();
                    body.append('file', file);
                    const purpose = getArtifactPurpose(group.latest);
                    body.append('purpose', purpose);
                    body.append('isDeliverable', String(group.latest.isDeliverable === true));
                    body.append('status', 'draft');
                    const lineageId = group.latest.artifactId || group.latest.logicalId || group.latest.lineageId || group.latest.id;
                    if (lineageId) body.append('artifactId', lineageId);
                    if (group.latest.id) body.append('versionOf', group.latest.id);
                    if (group.latest.version !== undefined && Number.isFinite(Number(group.latest.version))) {
                  body.append('version', String(Number(group.latest.version) + 1));
                    }
                    if (group.latest.phaseId) body.append('phaseId', group.latest.phaseId);
                    if (group.latest.taskId) body.append('taskId', group.latest.taskId);
                    await postFormData(`/api/artifacts/missions/${encodeURIComponent(missionId)}/artifacts`, body);
                    onRefresh();
                  } catch (err) {
                    window.alert(err instanceof Error ? err.message : 'Upload failed');
                  }
                }} /></label>
              </div>
            )}
          </li>
        ))}
      </ul>
      {expectedItems.length === 0 && producedGroups.length === 0 && (
        <div className="empty-state">No artifacts match this view. Try a different purpose filter.</div>
      )}
    </>
  );
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs ? `${m}m ${rs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

function MissionDuration({
  startedAt,
  completedAt,
  active,
  precise = false,
}: {
  startedAt: string | number;
  completedAt?: string | number;
  active: boolean;
  precise?: boolean;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!active || completedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active, completedAt]);

  const startMs = typeof startedAt === 'number' ? startedAt : new Date(startedAt).getTime();
  if (!Number.isFinite(startMs)) return null;
  const endMs = completedAt !== undefined
    ? (typeof completedAt === 'number' ? completedAt : new Date(completedAt).getTime())
    : now;
  const elapsed = Math.max(0, (Number.isFinite(endMs) ? endMs : now) - startMs);
  let label = formatDuration(elapsed);
  if (precise) {
    const seconds = Math.floor(elapsed / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    const remainingSeconds = seconds % 60;
    label = hours > 0
      ? `${hours}h ${minutes}m ${remainingSeconds}s`
      : minutes > 0
        ? `${minutes}m ${remainingSeconds}s`
        : `${remainingSeconds}s`;
  }

  return (
    <span>
      <strong>Duration:</strong> {label}
    </span>
  );
}

export default MissionRoom;
