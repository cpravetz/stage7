import type { FeedEvent } from '../stores/feedStore';

export interface MissionEventPlanPhase {
  id: string;
  name?: string;
  status?: string;
  tasks?: Array<{ id: string; title?: string; status?: string; output?: string }>;
}

export interface MissionEventPlan {
  summary?: string;
  phases?: MissionEventPlanPhase[];
}

export interface MissionEventPhaseOutput {
  phaseId: string;
  name?: string;
  status?: string;
  tasks?: Array<{ taskId: string; status?: string; output?: string }>;
}

export interface MissionEventDetail {
  status?: string;
  error?: string;
  startedAt?: string | number;
  completedAt?: string | number;
  input?: { prompt?: string };
  output?: { outputs?: { phases?: MissionEventPhaseOutput[]; gaps?: string[] } };
}

export const CONVERSATION_EVENT_TYPES = new Set([
  'user',
  'user_message',
  'monologue',
  'tool',
  'assistant',
  'planner_started',
  'planner_progress',
  'plan_generated',
  'clarification_needed',
  'phase_started',
  'phase_completed',
  'phase_approved',
  'phase_rejected',
  'phase_plan_amended',
  'task_started',
  'task_completed',
  'task_failed',
  'mission_started',
  'mission_completed',
  'mission_failed',
  'mission_canceled',
  'mission_incomplete',
  'mission_needs_review',
  'mission_paused',
  'mission_resumed',
  'approval_requested',
  'approval_approved',
  'approval_rejected',
]);

export const TIMELINE_EVENT_TYPES = new Set([
  'mission_started',
  'mission_completed',
  'mission_failed',
  'mission_canceled',
  'mission_incomplete',
  'mission_needs_review',
  'mission_paused',
  'mission_resumed',
  'planner_started',
  'planner_progress',
  'plan_generated',
  'phase_started',
  'phase_completed',
  'phase_plan_amended',
  'phase_approved',
  'phase_rejected',
  'task_started',
  'task_completed',
  'task_failed',
  'approval_requested',
  'approval_approved',
  'approval_rejected',
]);

const FAILURE_LIFECYCLE_TYPES = new Set([
  'mission_failed',
  'mission_canceled',
  'mission_incomplete',
  'mission_needs_review',
]);

/**
 * A mission milestone is announced once. A mission that is restarted after a
 * crash, or retried, announces its start again, and the room must not list
 * the same milestone twice.
 */
const MILESTONE_EVENT_TYPES = new Set([
  'mission_started',
  'mission_completed',
  'mission_failed',
  'mission_canceled',
  'mission_incomplete',
  'mission_needs_review',
]);

const FAILURE_LABELS: Record<string, string> = {
  mission_failed: 'Mission failed',
  mission_canceled: 'Mission canceled',
  mission_incomplete: 'Mission incomplete',
  mission_needs_review: 'Mission needs review',
};

function toTimestamp(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function eventPhaseId(event: FeedEvent): string | undefined {
  const phaseId = event.metadata?.phaseId;
  return typeof phaseId === 'string' ? phaseId : undefined;
}

function eventTaskId(event: FeedEvent): string | undefined {
  const taskId = event.metadata?.taskId;
  return typeof taskId === 'string' ? taskId : undefined;
}

function agentLabel(metadata: Record<string, unknown>): string | undefined {
  if (typeof metadata.agentName === 'string' && metadata.agentName.trim()) {
    return metadata.agentName.trim();
  }
  if (typeof metadata.agentRole === 'string' && metadata.agentRole.trim()) {
    const role = metadata.agentRole.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
    return `${role.replace(/\b\w/g, (letter) => letter.toLocaleUpperCase())} Agent`;
  }
  return undefined;
}

/**
 * Builds the ordered event list of a mission.
 *
 * The mission room receives the real mission events (persisted by the
 * artifacts service and streamed over the websocket) plus a few events that
 * are derived from the persisted mission state. The derived events are only
 * fallbacks: when the real event exists, the derived copy is dropped so a
 * milestone is never listed twice.
 */
export function buildMissionEvents(options: {
  missionId: string;
  liveEvents: FeedEvent[];
  detail?: MissionEventDetail | null;
  plan?: MissionEventPlan | null;
  phaseOutputs?: MissionEventPhaseOutput[];
}): FeedEvent[] {
  const { missionId, liveEvents, detail, plan, phaseOutputs = [] } = options;
  const live = liveEvents.filter((event) => event.missionId === missionId);
  const derived: FeedEvent[] = [];

  const hasLive = (types: string[], match?: (event: FeedEvent) => boolean): boolean =>
    live.some(
      (event) => types.includes(String(event.type)) && (!match || match(event)),
    );

  const startedAt = toTimestamp(detail?.startedAt) ?? Date.now();
  const input = detail?.input as { prompt?: string; metadata?: Record<string, unknown> } | undefined;
  const isRestarted = Boolean(input?.metadata?.retriedFrom);

  const originalPrompt = detail?.input?.prompt;
  if (originalPrompt && !hasLive(['user', 'user_message'], (event) => event.message === originalPrompt)) {
    derived.push({
      id: `derived-user-prompt-${startedAt}`,
      type: 'user',
      source: 'user',
      message: originalPrompt,
      timestamp: startedAt,
      missionId,
    });
  }

  if (!hasLive(['mission_started'])) {
    derived.push({
      id: `derived-mission-started-${startedAt}`,
      type: 'mission_started',
      source: 'orchestrator',
      message: isRestarted ? 'Mission restarted' : 'Mission started',
      timestamp: startedAt,
      missionId,
    });
  }

  const hasLivePlannerStarted = hasLive(['planner_started']);
  const hasLivePlanGenerated = hasLive(['plan_generated']);
  const planPhases = plan?.phases || [];

  if (plan && planPhases.length > 0) {
    if (!hasLivePlannerStarted) {
      derived.push({
        id: `derived-planner-started-${startedAt + 1}`,
        type: 'planner_started',
        source: 'orchestrator',
        message: `Planning: ${plan.summary || 'mission plan'}`,
        timestamp: startedAt + 1,
        missionId,
        metadata: { agentId: `agent-${missionId}-planner`, agentName: 'Mission Planner', agentRole: 'planner' },
      });
    }
    if (!hasLivePlanGenerated) {
      derived.push({
        id: `derived-plan-generated-${startedAt + 2}`,
        type: 'plan_generated',
        source: 'orchestrator',
        message: `Plan generated (${planPhases.length} phases)`,
        timestamp: startedAt + 2,
        missionId,
      });
    }
  } else if (detail?.status === 'running' && !hasLivePlannerStarted) {
    derived.push({
      id: `derived-planner-started-${startedAt + 1}`,
      type: 'planner_started',
      source: 'orchestrator',
      message: 'The planning agent is developing a plan for this mission.',
      timestamp: startedAt + 1,
      missionId,
      metadata: {
        agentId: `agent-${missionId}-planner`,
        agentName: 'Mission Planner',
        agentRole: 'planner',
        status: 'planning',
      },
    });
  }

  const taskTitleById = new Map<string, string>();
  for (const phase of planPhases) {
    for (const task of phase.tasks || []) {
      if (task.title) taskTitleById.set(task.id, task.title);
    }
  }
  const taskLabel = (taskId: string): string => {
    const title = taskTitleById.get(taskId);
    return title && title.length > 0 ? (title.length > 80 ? `${title.slice(0, 77)}…` : title) : taskId;
  };

  let phases = phaseOutputs;
  if (phases.length === 0 && planPhases.length > 0) {
    phases = planPhases.map((phase) => ({
      phaseId: phase.id,
      name: phase.name,
      status: phase.status || (detail?.status === 'completed' ? 'completed' : 'planned'),
      tasks: (phase.tasks || []).map((task) => ({
        taskId: task.id,
        status: task.status || 'planned',
        output: task.output,
      })),
    }));
  }

  for (const phase of phases) {
    const phaseStartedAt = toTimestamp((phase as { startedAt?: string | number }).startedAt) ?? startedAt;
    const phaseCompletedAt = toTimestamp((phase as { completedAt?: string | number }).completedAt) ?? phaseStartedAt + 1000;
    const hasLivePhaseStarted = hasLive(['phase_started'], (event) => eventPhaseId(event) === phase.phaseId);
    const hasLivePhaseCompleted = hasLive(['phase_completed'], (event) => eventPhaseId(event) === phase.phaseId);

    if (
      !hasLivePhaseStarted
      && (phase.status === 'in_progress'
        || phase.status === 'completed'
        || phase.status === 'awaiting_approval'
        || phase.status === 'approved')
    ) {
      derived.push({
        id: `derived-phase-started-${phase.phaseId}`,
        type: 'phase_started',
        source: 'orchestrator',
        message: `Phase started: ${phase.name || phase.phaseId}`,
        timestamp: phaseStartedAt,
        missionId,
        metadata: { phaseId: phase.phaseId, phaseName: phase.name },
      });
    }

    let taskCursor = phaseStartedAt + 1;
    for (const task of phase.tasks || []) {
      const taskCompletedAt = toTimestamp((task as { completedAt?: string | number }).completedAt) ?? taskCursor;
      const hasLiveTask = hasLive(
        ['task_started', 'task_completed', 'task_failed'],
        (event) => eventPhaseId(event) === phase.phaseId && eventTaskId(event) === task.taskId,
      );
      const derivedTaskType = task.status === 'completed'
        ? 'task_completed'
        : task.status === 'failed'
          ? 'task_failed'
          : task.status === 'in_progress'
            ? 'task_started'
            : undefined;
      if (!hasLiveTask && derivedTaskType) {
        derived.push({
          id: `derived-task-${phase.phaseId}-${task.taskId}`,
          type: derivedTaskType,
          source: 'orchestrator',
          message: `${derivedTaskType === 'task_failed' ? 'Task failed' : derivedTaskType === 'task_started' ? 'Task started' : 'Task completed'}: ${taskLabel(task.taskId)}`,
          timestamp: taskCompletedAt,
          missionId,
          metadata: { phaseId: phase.phaseId, taskId: task.taskId, output: task.output },
        });
      }
      taskCursor = taskCompletedAt + 1;
    }

    if (
      !hasLivePhaseCompleted
      && (phase.status === 'completed' || phase.status === 'awaiting_approval' || phase.status === 'approved')
    ) {
      derived.push({
        id: `derived-phase-completed-${phase.phaseId}`,
        type: 'phase_completed',
        source: 'orchestrator',
        message: `Phase completed: ${phase.name || phase.phaseId}`,
        timestamp: phaseCompletedAt,
        missionId,
        metadata: { phaseId: phase.phaseId, phaseName: phase.name },
      });
    }
  }

  if (detail?.status === 'completed') {
    const completedAt = toTimestamp(detail?.completedAt) ?? startedAt + 1000;
    if (!hasLive(['mission_completed'])) {
      derived.push({
        id: `derived-mission-completed-${completedAt}`,
        type: 'mission_completed',
        source: 'orchestrator',
        message: 'Mission completed',
        timestamp: completedAt,
        missionId,
      });
    }
  } else if (detail?.status === 'failed' || detail?.status === 'canceled') {
    const failedAt = toTimestamp(detail?.completedAt) ?? startedAt + 1000;
    if (!hasLive(['mission_failed', 'mission_canceled'])) {
      derived.push({
        id: `derived-mission-failed-${failedAt}`,
        type: 'mission_failed',
        source: 'orchestrator',
        message: `Mission ${detail.status}: ${detail.error || ''}`.trim(),
        timestamp: failedAt,
        missionId,
        metadata: { error: detail.error },
      });
    }
  } else if (detail?.status === 'incomplete') {
    const completedAt = toTimestamp(detail.completedAt) ?? startedAt + 1000;
    if (!hasLive(['mission_incomplete'])) {
      const gaps = detail.output?.outputs?.gaps || [];
      const reason = gaps.join('; ');
      derived.push({
        id: `derived-mission-incomplete-${completedAt}`,
        type: 'mission_incomplete',
        source: 'orchestrator',
        message: reason
          ? `Mission incomplete: ${reason} — retry this mission to address the unmet requirements.`
          : 'Mission incomplete',
        timestamp: completedAt,
        missionId,
        metadata: gaps.length > 0 ? { reason, gaps } : undefined,
      });
    }
  }

  const merged = new Map<string, FeedEvent>();
  for (const event of derived) merged.set(event.id, event);
  for (const event of live) {
    const key = event.id || `${event.type}-${event.timestamp}-${event.source || ''}`;
    if (!merged.has(key)) merged.set(key, event);
  }

  let events = Array.from(merged.values());
  events = dedupeTaskEvents(events);
  events = dedupePlannerProgress(events);
  events = dedupePlannerAndReasoningEvents(events);
  events = listMilestonesOnce(events);
  events = dedupeTerminalAndApprovalEvents(events, detail?.status);

  // A retried/restarted mission announces its start again; surface that so the
  // room reads "Mission restarted" instead of "Mission started".
  if (isRestarted) {
    events = events.map((event) =>
      event.type === 'mission_started'
        ? { ...event, message: 'Mission restarted' }
        : event,
    );
  }

  // Strict chronological order: oldest first, newest at the bottom.
  events.sort((left, right) => left.timestamp - right.timestamp);
  return applyMissionError(events, detail?.error);
}

/**
 * Deduplicate task_completed/task_failed events by phaseId+taskId keeping the latest timestamp.
 */
function dedupeTaskEvents(events: FeedEvent[]): FeedEvent[] {
  const taskTypes = new Set(['task_completed', 'task_failed']);
  const latest = new Map<string, FeedEvent>();
  const others: FeedEvent[] = [];
  for (const event of events) {
    const type = String(event.type);
    if (taskTypes.has(type)) {
      const phaseId = eventPhaseId(event) || '';
      const taskId = eventTaskId(event) || '';
      const key = `${type}|${phaseId}|${taskId}`;
      const existing = latest.get(key);
      if (!existing || event.timestamp >= existing.timestamp) {
        latest.set(key, event);
      }
      continue;
    }
    others.push(event);
  }
  const result = [...others, ...Array.from(latest.values())];
  result.sort((left, right) => left.timestamp - right.timestamp);
  return result;
}

/**
 * Deduplicate planner_progress events, keeping the last announcement of each
 * distinct status|reason key (digits masked) so a stalled planner does not
 * flood the feed while at least one update per state is preserved.
 */
function dedupePlannerProgress(events: FeedEvent[]): FeedEvent[] {
  const lastByKey = new Map<string, number>();
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (String(event.type) !== 'planner_progress') continue;
    const data = event.metadata || {};
    const key = String(data.status || '') + '|' + String(data.reason || '').replace(/\\d+/g, '#');
    lastByKey.set(key, i);
  }
  const keep = new Set(Array.from(lastByKey.values()));
  return events.filter((_, i) => String(events[i].type) !== 'planner_progress' || keep.has(i));
}

/**
 * Collapses duplicate announcements of the same milestone and conflicting
 * terminal lifecycle events so the conversation shows one outcome.
 */
function dedupeTerminalAndApprovalEvents(events: FeedEvent[], status?: string): FeedEvent[] {
  const terminalTypes = new Set(['mission_completed', 'mission_failed', 'mission_canceled', 'mission_incomplete', 'mission_needs_review']);
  const preferredTerminal = status === 'completed'
    ? 'mission_completed'
    : status === 'failed' || status === 'canceled'
      ? (status === 'canceled' ? 'mission_canceled' : 'mission_failed')
      : status === 'incomplete'
        ? 'mission_incomplete'
        : null;

  const seenApprovalPhases = new Set<string>();
  const result: FeedEvent[] = [];
  for (const event of events) {
    const type = String(event.type);

    // Dedupe phase_approved / approval_approved for the same phase.
    if (type === 'phase_approved' || type === 'approval_approved') {
      const phaseId = eventPhaseId(event);
      const key = phaseId || `${type}-${event.timestamp}`;
      if (seenApprovalPhases.has(key)) continue;
      seenApprovalPhases.add(key);
    }

    // Drop conflicting terminal events.
    if (terminalTypes.has(type)) {
      if (preferredTerminal && type !== preferredTerminal) continue;
      // If no preferred, keep only the first terminal encountered.
      if (!preferredTerminal && result.some((e) => terminalTypes.has(String(e.type)))) continue;
    }

    result.push(event);
  }
  return result;
}

/**
 * Keeps only the first occurrence of planner_started and plan_generated per
 * mission, and the first occurrence of each distinct monologue message. This
 * prevents a mission that is re-fetched or recovered from flooding the
 * conversation with duplicated planning and reasoning announcements.
 */
function dedupePlannerAndReasoningEvents(events: FeedEvent[]): FeedEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const type = String(event.type);
    if (type === 'planner_started' || type === 'plan_generated' || type === 'monologue') {
      const key = type === 'monologue' ? `${type}|${event.message}` : type;
      if (seen.has(key)) return false;
      seen.add(key);
    }
    return true;
  });
}

/**
 * Keeps the first announcement of every mission milestone.
 */
function listMilestonesOnce(events: FeedEvent[]): FeedEvent[] {
  const listed = new Set<string>();
  return events.filter((event) => {
    const type = String(event.type);
    if (!MILESTONE_EVENT_TYPES.has(type)) return true;
    if (listed.has(type)) return false;
    listed.add(type);
    return true;
  });
}

/**
 * The failure reason is stored on the mission state. Older mission events were
 * persisted without it, so the reason is taken from the mission state whenever
 * the event itself does not carry one.
 */
export function friendlyMissionError(error: string): string {
  const trimmed = (error || '').trim();
  if (!trimmed) return 'Something went wrong. Please try again.';
  if (/fetch failed|Agent Runtime API|status(?:Code)?:?\s*\d{3}|\{.*"success"\s*:/i.test(trimmed)) {
    return 'Something went wrong while running the mission. Please try again.';
  }
  return trimmed;
}

function applyMissionError(events: FeedEvent[], missionError?: string): FeedEvent[] {
  if (!missionError) return events;
  return events.map((event) => {
    const type = String(event.type);
    if (!FAILURE_LIFECYCLE_TYPES.has(type)) return event;
    const existing = event.metadata?.error ?? event.metadata?.reason;
    if (typeof existing === 'string' && existing.trim().length > 0) return event;
    return {
      ...event,
      message: `${FAILURE_LABELS[type] || 'Mission failed'}: ${friendlyMissionError(missionError)}`,
      metadata: { ...(event.metadata || {}), error: missionError },
    };
  });
}

export interface TranscriptLine {
  kind: 'text' | 'tool' | 'plan' | 'task';
  type: string;
  text: string;
  approval?: { phaseId: string; question: string };
}

export interface TranscriptTurn {
  id: string;
  role: 'user' | 'assistant' | 'system';
  label: string;
  timestamp: number;
  lines: TranscriptLine[];
}

const MAX_PLANNER_PROGRESS_LINES = 12;

function collapsePlannerProgress(lines: TranscriptLine[]): TranscriptLine[] {
  const progressIndexes: number[] = [];
  lines.forEach((line, index) => {
    if (line.type === 'planner_progress') progressIndexes.push(index);
  });
  if (progressIndexes.length <= MAX_PLANNER_PROGRESS_LINES) return lines;

  const collapsed = progressIndexes.slice(0, progressIndexes.length - MAX_PLANNER_PROGRESS_LINES);
  const dropped = collapsed.length;
  const summary: TranscriptLine = {
    kind: 'text',
    type: 'planner_progress',
    text: `${dropped} earlier planning update${dropped === 1 ? '' : 's'}`,
  };
  return [
    ...lines.slice(0, collapsed[0]),
    summary,
    ...lines.slice(collapsed[collapsed.length - 1] + 1),
  ];
}

export function buildTranscript(events: FeedEvent[]): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];
  let current: TranscriptTurn | null = null;

  const startTurn = (
    role: TranscriptTurn['role'],
    label: string,
    ts: number,
    idHint: string
  ): TranscriptTurn => {
    const t: TranscriptTurn = {
      id: `${idHint}-${ts}`,
      role,
      label,
      timestamp: ts,
      lines: [],
    };
    turns.push(t);
    return t;
  };

  for (const evt of events) {
    const type = String(evt.type);
    const ts = evt.timestamp || Date.now();
    const data = evt.metadata || {};
    if (type === 'user' || type === 'user_message') {
      current = startTurn('user', 'You', ts, evt.id);
      current.lines.push({ kind: 'text', type, text: evt.message });
      continue;
    }
    if (
      type === 'planner_started' ||
      type === 'planner_progress' ||
      type === 'plan_generated' ||
      type === 'phase_started' ||
      type === 'phase_completed' ||
      type === 'phase_approved' ||
      type === 'phase_rejected' ||
      type === 'phase_plan_amended' ||
      type === 'clarification_needed'
    ) {
      const label = type === 'planner_started' || type === 'planner_progress' || type === 'plan_generated'
        ? 'Planner'
        : agentLabel(data) || 'Orchestrator';
      if (
        !current ||
        current.role !== 'assistant' ||
        current.label !== label
      ) {
        current = startTurn('assistant', label, ts, evt.id);
      }
      current.lines.push({ kind: 'plan', type, text: evt.message });
      continue;
    }
    if (type.startsWith('task_')) {
      const label = agentLabel(data) || 'Agent';
      if (!current || current.role !== 'assistant' || current.label !== label) {
        current = startTurn('assistant', label, ts, evt.id);
      }
      current.lines.push({ kind: 'task', type, text: evt.message });
      if (type === 'task_completed' && typeof data.output === 'string' && data.output.trim()) {
        current.lines.push({
          kind: 'text',
          type: 'task_output',
          text: data.output.slice(0, 8_000),
        });
      }
      continue;
    }
    if (type === 'tool' || type === 'monologue') {
      if (!current || current.role !== 'assistant') {
        current = startTurn('assistant', 'Agent', ts, evt.id);
      }
      current.lines.push({
        kind: type === 'tool' ? 'tool' : 'text',
        type,
        text: evt.message,
      });
      continue;
    }
    if (
      type === 'mission_started' ||
      type === 'mission_completed' ||
      type === 'mission_failed' ||
      type === 'mission_incomplete' ||
      type === 'mission_needs_review' ||
      type === 'mission_canceled' ||
      type === 'mission_paused' ||
      type === 'mission_resumed' ||
      type === 'approval_requested' ||
      type === 'approval_approved' ||
      type === 'approval_rejected'
    ) {
      current = startTurn('system', 'Mission', ts, evt.id);
      const line: TranscriptLine = { kind: 'text', type, text: evt.message };
      if (type === 'approval_requested') {
        line.approval = {
          phaseId: (data.phaseId as string) || '',
          question: (data.question as string) || evt.message,
        };
      }
      current.lines.push(line);
      continue;
    }
    if (!current) current = startTurn('system', 'Mission', ts, evt.id);
    current.lines.push({ kind: 'text', type, text: evt.message });
  }

  for (const turn of turns) {
    turn.lines = collapsePlannerProgress(turn.lines);
  }

  return turns;
}

export interface ModelUsageSummary {
  calls: number;
  tokens: number;
  estimatedCost: number;
}

/**
 * Aggregates the model usage recorded for a mission. The per-call cost events
 * are bookkeeping, not conversation, so they are summarized instead of listed.
 */
export function summarizeModelUsage(events: FeedEvent[]): ModelUsageSummary {
  let calls = 0;
  let tokens = 0;
  let estimatedCost = 0;
  for (const event of events) {
    if (event.type !== 'cost_estimate') continue;
    calls += 1;
    const data = event.metadata || {};
    const nested = data.data && typeof data.data === 'object' && !Array.isArray(data.data)
      ? (data.data as Record<string, unknown>)
      : undefined;
    const rawTokens = data.tokensUsed ?? nested?.tokensUsed;
    const tokensUsed = typeof rawTokens === 'number' ? rawTokens : Number(rawTokens);
    if (Number.isFinite(tokensUsed)) tokens += tokensUsed;
    const rawCost = data.estimatedCost ?? data.cost ?? nested?.estimatedCost ?? nested?.cost;
    const cost = typeof rawCost === 'number' ? rawCost : Number(rawCost);
    if (Number.isFinite(cost)) estimatedCost += cost;
  }
  return { calls, tokens, estimatedCost };
}
