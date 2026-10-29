import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useFeedStore, FeedEvent } from '../stores/feedStore';
import AgentOutputsPanel from '../components/AgentOutputsPanel';
import { useMissionsStore } from '../stores/missionsStore';
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

function isMissionComplete(plan: Plan | null, phaseOutputs: PhaseOutput[], missionEvents: FeedEvent[]): boolean {
  if (!plan || !plan.phases || plan.phases.length === 0) return false;
  const allPhasesComplete = plan.phases.every((phase) => {
    const output = phaseOutputs.find((p) => p.phaseId === phase.id);
    if (output && output.status === 'completed') return true;
    // check tasks
    const tasks = phase.tasks || [];
    if (tasks.length === 0) return false;
    const allTasksDone = tasks.every((task) => {
      const taskOut = output?.tasks?.find((t) => t.taskId === task.id);
      if (taskOut?.status === 'completed' || taskOut?.status === 'failed') {
        // failed might count as done? but instruction says "all plan phases have all tasks completed"
        return taskOut.status === 'completed';
      }
      // check events
      const te = missionEvents.find((e) => e.metadata?.phaseId === phase.id && e.metadata?.taskId === task.id && (e.type === 'task_completed' || e.type === 'task_failed'));
      if (te?.type === 'task_completed') return true;
      return false;
    });
    return allTasksDone;
  });
  return allPhasesComplete;
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
  if (type.startsWith('task_')) return type === 'task_failed' ? '❌' : '✅';
  if (type.startsWith('phase_')) return '📦';
  if (type.startsWith('approval_')) return type === 'approval_approved' ? '✅' : type === 'approval_rejected' ? '❌' : '⏸️';
  if (type.startsWith('plan_') || type.startsWith('planner_')) return '🧭';
  if (type === 'tool') return '🔧';
  if (type === 'monologue') return '💭';
  if (type === 'user' || type === 'user_message') return '🧑';
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
      && ['task_started', 'task_completed', 'task_failed'].includes(event.type))
    .sort((left, right) => left.timestamp - right.timestamp);
  const latestTaskEvent = taskEvents[taskEvents.length - 1];
  if (latestTaskEvent) {
    return latestTaskEvent.type === 'task_started'
      ? 'in_progress'
      : latestTaskEvent.type === 'task_failed' ? 'failed' : 'completed';
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
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);
  const [clarificationAnswer, setClarificationAnswer] = useState('');
  const [clarificationSubmitting, setClarificationSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [retryGuidance, setRetryGuidance] = useState('');
  const [showRetryDialog, setShowRetryDialog] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    ensureConnected();
  }, [ensureConnected]);

  useEffect(() => {
    if (workflowId) {
      fetchMissionDetail(workflowId);
    }
  }, [workflowId, fetchMissionDetail]);

  useEffect(() => {
    if (detail?.status !== 'running') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [detail?.status]);

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
    let effectiveStatus = detail?.status || 'unknown';
    if (detail && (detail.status === 'running' || detail.status === 'started')) {
      if (isMissionComplete(plan, phaseOutputs, [])) {
        effectiveStatus = 'completed';
      }
    }
    return buildMissionEvents({
      missionId,
      liveEvents: events,
      detail: detail
        ? {
            status: effectiveStatus,
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

  const missionDuration = useMemo(() => {
    if (!detail?.startedAt) return null;
    const start = new Date(detail.startedAt).getTime();
    const end = detail.completedAt ? new Date(detail.completedAt).getTime() : now;
    const ms = Math.max(0, end - start);
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor(ms / 60_000) % 60;
    const seconds = Math.floor(ms / 1000) % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }, [detail?.startedAt, detail?.completedAt, now]);

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
      const result = await retryMission(workflowId, retryGuidance);
      window.location.href = `/missions/${encodeURIComponent(result.workflowId)}`;
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRetrying(false);
      setShowRetryDialog(false);
      setRetryGuidance('');
    }
  };

  const handleClarificationSubmit = async () => {
    const answer = clarificationAnswer.trim();
    if (!answer || clarificationSubmitting) return;
    setClarificationSubmitting(true);
    setControlError(null);
    try {
      const result = await postJSON<{ status: string }>(
        `/api/temporal/missions/${encodeURIComponent(workflowId)}/start`,
        { clarificationAnswers: [answer] },
      );
      updateMissionStatus(workflowId, result.status);
      setClarificationAnswer('');
      await refreshDetail(workflowId);
    } catch (error) {
      setControlError(error instanceof Error ? error.message : 'Failed to submit clarification');
    } finally {
      setClarificationSubmitting(false);
    }
  };

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [transcript.length]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await postJSON<{ status: string }>(
        `/api/temporal/missions/${encodeURIComponent(workflowId)}/messages`,
        { missionId, content: text, role: 'user' },
      );
      setInput('');
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const rawStatus = detail?.status || 'unknown';
  let effectiveStatus = rawStatus;
  if ((rawStatus === 'running' || rawStatus === 'started') && isMissionComplete(plan, phaseOutputs, missionEvents)) {
    effectiveStatus = 'completed';
  }
  const status = effectiveStatus;
  const badge = STATUS_BADGE[status] || status;
  const artifactCount = artifactItems.length;
  const startedAtMs = detail?.startedAt ? new Date(detail.startedAt).getTime() : undefined;
  const completedAtMs = detail?.completedAt ? new Date(detail.completedAt).getTime() : undefined;
  const wallClockMs =
    startedAtMs && completedAtMs
      ? completedAtMs - startedAtMs
      : startedAtMs && (rawStatus === 'running' || rawStatus === 'started' || !completedAtMs)
        ? now - startedAtMs
        : null;
  const wallClockLabel = wallClockMs != null ? formatDuration(wallClockMs) : null;

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
                {['paused', 'pending'].includes(status) && (
                 <button onClick={async () => {
                   setControlError(null);
                   try {
                     const result = await postJSON<{ status: string }>(
                       `/api/temporal/missions/${encodeURIComponent(workflowId)}/start`,
                       {},
                     );
                     updateMissionStatus(workflowId, result.status);
                     await refreshDetail(workflowId);
                   } catch (error) {
                     setControlError(error instanceof Error ? error.message : 'Failed to resume mission');
                   }
                 }}>Start</button>
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
                   if (!confirm('Stop mission after the current Agent task reaches a safe checkpoint?')) return;
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
              {plan.clarificationQuestions.map((question, index) => <li key={index}>{question}</li>)}
            </ol>
          )}
          <p className="muted" style={{ margin: '6px 0' }}>
            Do not enter passwords or API tokens here. Add secrets through the secure tool or credential settings.
          </p>
          <textarea
            aria-label="Clarification answers"
            placeholder="Answer the questions above"
            value={clarificationAnswer}
            onChange={(event) => setClarificationAnswer(event.target.value)}
            rows={3}
            style={{ width: '100%', marginTop: 6 }}
          />
          <button
            onClick={handleClarificationSubmit}
            disabled={clarificationSubmitting || !clarificationAnswer.trim()}
            style={{ marginTop: 8 }}
          >
            {clarificationSubmitting ? 'Continuing...' : 'Continue mission'}
          </button>
          {controlError && <div className="error-banner">{controlError}</div>}
        </div>
      )}

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
            value={retryGuidance}
            onChange={(e) => setRetryGuidance(e.target.value)}
            rows={3}
            style={{ width: '100%', marginTop: 8, marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleRetry} disabled={retrying}>
              {retrying ? 'Retrying...' : 'Retry Mission'}
            </button>
            <button className="secondary" onClick={() => { setShowRetryDialog(false); setRetryGuidance(''); }}>
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
        {wallClockLabel && (
          <span>
            <strong>Duration:</strong> {wallClockLabel}
          </span>
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
              <div className="transcript" ref={transcriptRef}>
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
                        <span className="turn-line-text">{line.text}</span>
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
              placeholder="Send messages to the mission (agent outputs stream here)..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
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
              <button onClick={sendMessage} disabled={sending || !input.trim()}>
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
                {missionDuration && (
                  <span>
                    <strong>Duration:</strong> {missionDuration}
                  </span>
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
                                       Expected: {artifact}
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

export default MissionRoom;
