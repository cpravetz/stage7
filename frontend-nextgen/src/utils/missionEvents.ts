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
  'question_asked',
  'permission_required',
  'user_input_resolved',
  'phase_started',
  'phase_completed',
  'phase_approved',
  'phase_rejected',
  'phase_plan_amended',
  'task_started',
  'task_completed',
  'task_incomplete',
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
  'agent_delegation',
  'agent_acknowledgement',
  'agent_response',
  'agent_error',
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
  'question_asked',
  'permission_required',
  'user_input_resolved',
  'phase_started',
  'phase_completed',
  'phase_plan_amended',
  'phase_approved',
  'phase_rejected',
  'task_started',
  'task_completed',
  'task_incomplete',
  'task_failed',
  'approval_requested',
  'approval_approved',
  'approval_rejected',
  'agent_delegation',
  'agent_acknowledgement',
  'agent_response',
  'agent_error',
]);

const FAILURE_LIFECYCLE_TYPES = new Set([
  'mission_failed',
  'mission_canceled',
  'mission_incomplete',
  'mission_needs_review',
  'task_failed',
  'task_incomplete',
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
  task_failed: 'Task failed',
  task_incomplete: 'Task incomplete',
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
    const raw = metadata.agentRole.trim();
    const norm = raw.toLowerCase().replace(/[_\s]+/g, '-');
    if (norm === 'planner') return 'Mission Planner';
    if (norm === 'mission-director' || norm === 'director') return 'Mission Director';
    if (norm === 'phase-reviewer' || norm === 'phase-review') return 'Phase Reviewer';
    if (norm === 'mission-evaluator') return 'Mission Evaluator';
    const role = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
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
        ['task_started', 'task_completed', 'task_incomplete', 'task_failed'],
        (event) => eventPhaseId(event) === phase.phaseId && eventTaskId(event) === task.taskId,
      );
      const derivedTaskType = task.status === 'completed'
        ? 'task_completed'
        : task.status === 'incomplete'
          ? 'task_incomplete'
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
          message: `${derivedTaskType === 'task_failed' ? 'Task failed' : derivedTaskType === 'task_incomplete' ? 'Task incomplete' : derivedTaskType === 'task_started' ? 'Task started' : 'Task completed'}: ${taskLabel(task.taskId)}`,
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
        message: `Mission ${detail.status}: ${friendlyMissionError(detail.error || '')}`.trim(),
        timestamp: failedAt,
        missionId,
        metadata: { error: detail.error },
      });
    }
  } else if (detail?.status === 'awaiting_review') {
    const completedAt = toTimestamp(detail.completedAt) ?? startedAt + 1000;
    if (!hasLive(['mission_needs_review'])) {
      const gaps = Array.from(new Set(detail.output?.outputs?.gaps || []));
      derived.push({
        id: `derived-mission-needs-review-${completedAt}`,
        type: 'mission_needs_review',
        source: 'orchestrator',
        message: gaps.length > 0
          ? `Mission needs review: ${gaps.join('; ')}`
          : 'Mission needs review before it can be completed.',
        timestamp: completedAt,
        missionId,
        metadata: gaps.length > 0 ? { gaps } : undefined,
      });
    }
  } else if (detail?.status === 'incomplete') {
    const completedAt = toTimestamp(detail.completedAt) ?? startedAt + 1000;
    if (!hasLive(['mission_incomplete'])) {
      const gaps = Array.from(new Set(detail.output?.outputs?.gaps || []));
      derived.push({
        id: `derived-mission-incomplete-${completedAt}`,
        type: 'mission_incomplete',
        source: 'orchestrator',
        message: 'Mission not finished yet. Resume it to continue working through the remaining steps.',
        timestamp: completedAt,
        missionId,
        metadata: gaps.length > 0 ? { gaps } : undefined,
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
  events = dedupeQuestionAsked(events);
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
  const taskTypes = new Set(['task_completed', 'task_incomplete', 'task_failed']);
  const latest = new Map<string, { event: FeedEvent; index: number }>();
  events.forEach((event, index) => {
    const type = String(event.type);
    if (!taskTypes.has(type)) return;
    const phaseId = eventPhaseId(event) || '';
    const taskId = eventTaskId(event) || '';
    const key = `${type}|${phaseId}|${taskId}`;
    const existing = latest.get(key);
    if (!existing || event.timestamp >= existing.event.timestamp) latest.set(key, { event, index });
  });
  const retainedIndexes = new Set(Array.from(latest.values(), ({ index }) => index));
  return events.filter((event, index) =>
    !taskTypes.has(String(event.type)) || retainedIndexes.has(index),
  );
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
    const key = String(data.status || '') + '|' + String(data.reason || '').replace(/\d+/g, '#');
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
    : status === 'awaiting_review'
      ? 'mission_needs_review'
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
 *
 * Dedupe key includes agent identity/role, phase/task context, kind/decision/id
 * from metadata when available, with stable timestamp bucket as fallback.
 */
function dedupePlannerAndReasoningEvents(events: FeedEvent[]): FeedEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const type = String(event.type);
    if (type === 'planner_started' || type === 'plan_generated' || type === 'monologue') {
      const data = event.metadata || {};
      const nested = data.data && typeof data.data === 'object' && !Array.isArray(data.data)
        ? (data.data as Record<string, unknown>)
        : undefined;
      const planSource = typeof data.planSource === 'string'
        ? data.planSource
        : (typeof nested?.planSource === 'string' ? String(nested.planSource) : '');
      if (type === 'monologue') {
        const agentId = typeof data.agentId === 'string' ? data.agentId : (typeof event.source === 'string' ? event.source : '');
        const agentRole = typeof data.agentRole === 'string' ? data.agentRole : '';
        const phaseId = typeof data.phaseId === 'string' ? data.phaseId : (typeof nested?.phaseId === 'string' ? String(nested.phaseId) : '');
        const taskId = typeof data.taskId === 'string' ? data.taskId : (typeof nested?.taskId === 'string' ? String(nested.taskId) : '');
        const kind = typeof data.kind === 'string' ? data.kind : (typeof nested?.kind === 'string' ? String(nested.kind) : '');
        const decision = typeof data.decision === 'string' ? data.decision : (typeof nested?.decision === 'string' ? String(nested.decision) : '');
        const stableId = typeof event.id === 'string' && event.id
          ? event.id
          : (typeof data.id === 'string' ? data.id : `${Math.floor((event.timestamp || 0) / 1000)}`);
        const key = `${type}|${agentId}|${agentRole}|${phaseId}|${taskId}|${kind}|${decision}|${stableId}|${event.message}`;
        if (seen.has(key)) return false;
        seen.add(key);
      } else {
        const key = `${type}|${planSource}|${event.message}`;
        if (seen.has(key)) return false;
        seen.add(key);
      }
    }
    return true;
  });
}

/**
 * Dedupe question_asked events by question text so a repeated ask for the
 * same missing value doesn't flood the conversation.
 */
function dedupeQuestionAsked(events: FeedEvent[]): FeedEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (String(event.type) !== 'question_asked') return true;
    const question = interactionQuestionText(event);
    const key = `question_asked|${event.metadata?.missionId ?? ''}|${question}`;
    if (seen.has(key)) return false;
    seen.add(key);
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

  // Try to parse structured JSON error payloads for more specific messages
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      // Try to extract a meaningful error message from common shapes
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.error === 'string' && parsed.error.trim()) {
          const inner = parsed.error.trim();
          if (parsed.message && typeof parsed.message === 'string' && parsed.message.trim()) {
            const msg = parsed.message.trim();
            // If error is very generic and message is more specific, use message
            if (/^(error|something went wrong|failed)$/i.test(inner) && msg.length > inner.length) {
              return msg;
            }
          }
          // Check if inner is also JSON
          if (inner.startsWith('{')) {
            try {
              const innerParsed = JSON.parse(inner);
              if (innerParsed && typeof innerParsed === 'object' && typeof innerParsed.message === 'string') {
                return innerParsed.message.trim();
              }
              if (innerParsed && typeof innerParsed === 'object' && typeof innerParsed.error === 'string') {
                return innerParsed.error.trim();
              }
            } catch {}
          }
          return inner;
        }
        if (typeof parsed.message === 'string' && parsed.message.trim()) {
          return parsed.message.trim();
        }
        if (typeof parsed.reason === 'string' && parsed.reason.trim()) {
          return parsed.reason.trim();
        }
      }
    } catch {
      // Fall through to pattern matching
    }
  }

  if (/fetch failed|Agent Runtime API|network error|ECONNREFUSED|ENOTFOUND|timeout|status(?:Code)?:?\s*\d{3}|\{.*"success"\s*:/i.test(trimmed)) {
    const runtimeFailure = trimmed.match(/^Agent Runtime API \S+ failed \((\d{3})\):\s*(.+)$/i);
    if (runtimeFailure) {
      const detail = runtimeFailure[2].trim();
      const timeout = detail.match(/timed out after (\d+)ms/i);
      if (timeout) {
        const milliseconds = Number(timeout[1]);
        const duration = milliseconds >= 60_000
          ? `${Math.round(milliseconds / 60_000)} minute(s)`
          : `${Math.round(milliseconds / 1_000)} second(s)`;
        return `Mission agent request timed out after ${duration}. The planner did not finish generating a plan.`;
      }
      if (/MODEL_SELECTION_EXHAUSTED|No models are eligible|No model available|none completed the request/i.test(detail)) {
        return 'Planning stopped because no eligible LLM provider was available. Restore or configure an eligible provider, then retry.';
      }
      if (/Brain model routing made no progress/i.test(detail)) {
        return 'Planning stopped because the Brain model router repeated a candidate without advancing. Check model-provider availability before retrying.';
      }
      return `Mission agent request failed (HTTP ${runtimeFailure[1]}). Check the mission activity for details.`;
    }
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

function isMachineReadable(value: string): boolean {
  return /^\s*[\[{]/.test(value);
}

function friendlyTaskMessage(value: string): string {
  if (/Agent response validation failed|verified external[- ]operation receipt|artifact section|missing (?:expected )?(?:artifact|receipt)/i.test(value)) {
    return 'I could not verify this step yet, so I am checking another approved way to finish it.';
  }
  return value;
}

function friendlyMonologueMessage(value: string): string {
  if (/\b(?:missing|unavailable|not configured)\b.{0,80}\b(?:tool|service|credential|configuration)\b/i.test(value)) {
    return 'I am checking whether an approved service or setup is available.';
  }
  if (/\b(?:review|verify|evidence|receipt|artifact)\b/i.test(value)) {
    return 'I am checking the results before continuing.';
  }
  return 'Working on the requested task.';
}

function friendlyTaskOutput(value: string): string {
  const trimmed = value.trim();
  if (/^\s*Task output is incomplete:\s*Agent response validation failed/i.test(trimmed)) {
    return 'I could not verify this step yet, so I am checking another approved way to finish it.';
  }
  if (/^\s*\{\s*"satisfied"\s*:/i.test(trimmed)) {
    return 'I reviewed the completed work and am addressing the remaining gap.';
  }
  const receiptStart = trimmed.search(/\n?\s*\[\s*\{\s*\\?"toolId\\?"\s*:/);
  const readable = receiptStart >= 0 ? trimmed.slice(0, receiptStart).trim() : trimmed;
  return readable || 'The task is still in progress.';
}

function friendlyToolMessage(value: string): string {
  if (!isMachineReadable(value)) return value;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const tool = (parsed as Record<string, unknown>).tool;
      if (tool === '__list_tools') return 'Checking which services are available.';
      if (tool === '__create_tool') return 'Setting up a service for this task.';
      if (typeof tool === 'string' && tool.trim()) return 'Using a configured service to complete the requested step.';
    }
  } catch {
    return 'Working on the requested task.';
  }
  return 'Working on the requested task.';
}

function friendlyPlanMessage(type: string, value: string): string {
  if (
    type === 'phase_plan_amended'
    && /verified external[- ]operation receipt|system-action-receipts|artifact section|did not complete a verified action/i.test(value)
  ) {
    return 'I could not confirm that the requested action was completed, so I am checking another approved way to finish it.';
  }
  return value;
}

function collapsePlannerProgress(turns: TranscriptTurn[]): TranscriptTurn[] {
  const progressIndexes = turns.flatMap((turn, index) =>
    turn.label === 'Planner' && turn.lines.some((line) => line.type === 'planner_progress')
      ? [index]
      : [],
  );
  if (progressIndexes.length <= MAX_PLANNER_PROGRESS_LINES) return turns;

  const collapsed = progressIndexes.slice(0, progressIndexes.length - MAX_PLANNER_PROGRESS_LINES);
  const dropped = collapsed.length;
  const firstTurn = turns[collapsed[0]];
  const summaryTurn: TranscriptTurn = {
    ...firstTurn,
    id: `${firstTurn.id}-collapsed`,
    lines: [{
      kind: 'text',
      type: 'planner_progress',
      text: `${dropped} earlier planning update${dropped === 1 ? '' : 's'}`,
    }],
  };
  const collapsedIndexes = new Set(collapsed);
  return turns.flatMap((turn, index) =>
    index === collapsed[0]
      ? [summaryTurn]
      : collapsedIndexes.has(index)
        ? []
        : [turn],
  );
}

const ASK_USER_MARKER = '__ASK_USER__:';

function stripAskUserMarker(text: string): string {
  if (!text.startsWith(ASK_USER_MARKER)) return text;
  try {
    const parsed = JSON.parse(text.slice(ASK_USER_MARKER.length));
    if (parsed && typeof parsed === 'object' && typeof (parsed as { question?: unknown }).question === 'string') {
      return String((parsed as { question: string }).question);
    }
  } catch {
    // fall through to plain-text strip below
  }
  return text.slice(ASK_USER_MARKER.length);
}

function stripSecretPrefix(text: string): string {
  return text.replace(/^\s*\[secret:[a-z0-9_-]+\]\s*/i, '');
}

function interactionQuestionText(event: FeedEvent): string {
  const data = event.metadata || {};
  if (typeof data.question === 'string' && data.question.trim()) return stripSecretPrefix(data.question.trim());
  if (typeof event.message === 'string' && event.message.trim()) return stripSecretPrefix(stripAskUserMarker(event.message.trim()));
  if (event.type === 'permission_required') {
    const permission = data.permission;
    if (permission && typeof permission === 'object' && typeof (permission as { explanation?: unknown }).explanation === 'string') {
      return stripSecretPrefix(String((permission as { explanation: string }).explanation).trim());
    }
    return 'An Agent is waiting for permission to use a tool.';
  }
  return 'An Agent needs information to continue.';
}

export function buildTranscript(events: FeedEvent[]): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];
  let current: TranscriptTurn | null = null;
  const orderedEvents = events
    .map((event, index) => ({ event, index }))
    .sort((left, right) => left.event.timestamp - right.event.timestamp || left.index - right.index)
    .map(({ event }) => event);

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

  for (const evt of orderedEvents) {
    const type = String(evt.type);
    const ts = evt.timestamp || Date.now();
    const data = evt.metadata || {};
    if (type === 'user' || type === 'user_message') {
      current = startTurn('user', 'You', ts, evt.id);
      current.lines.push({ kind: 'text', type, text: evt.message });
      continue;
    }
    if (type === 'question_asked' || type === 'permission_required') {
      const label = agentLabel(data) || (type === 'permission_required' ? 'Mission' : 'Agent');
      current = startTurn('assistant', label, ts, evt.id);
      current.lines.push({ kind: 'text', type, text: interactionQuestionText(evt) });
      continue;
    }
    if (type === 'user_input_resolved') {
      const response = typeof data.response === 'string' && data.response.trim()
        ? data.response.trim()
        : typeof evt.message === 'string' && evt.message.trim()
          ? evt.message.trim()
          : 'Input provided.';
      current = startTurn('user', 'You', ts, evt.id);
      current.lines.push({ kind: 'text', type, text: response });
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
        : agentLabel(data) || 'Mission Director';
      current = startTurn('assistant', label, ts, evt.id);
      current.lines.push({ kind: 'plan', type, text: friendlyPlanMessage(type, evt.message) });
      const nested = data.data as Record<string, unknown> | undefined;
      const thought = [data.thought, nested?.thought, data.reason, nested?.reason, data.text, nested?.text]
        .find((v): v is string => typeof v === 'string' && v.trim().length > 0);
      if (thought && thought.trim() !== evt.message.trim()) {
        current.lines.push({ kind: 'text', type: `${type}_thought`, text: thought.trim() });
      }
      continue;
    }
    if (type.startsWith('task_')) {
      const label = agentLabel(data) || 'Agent';
      current = startTurn('assistant', label, ts, evt.id);
      current.lines.push({ kind: 'task', type, text: friendlyTaskMessage(evt.message) });
      if ((type === 'task_completed' || type === 'task_incomplete') && typeof data.output === 'string' && data.output.trim()) {
        current.lines.push({
          kind: 'text',
          type: 'task_output',
          text: friendlyTaskOutput(data.output).slice(0, 8_000),
        });
      }
      continue;
    }
    if (type === 'tool' || type === 'monologue') {
      current = startTurn('assistant', agentLabel(data) || 'Agent', ts, evt.id);
      current.lines.push({
        kind: type === 'tool' ? 'tool' : 'text',
        type,
        text: type === 'tool'
          ? friendlyToolMessage(evt.message)
          : friendlyMonologueMessage(evt.message),
      });
      continue;
    }
    if (
      type === 'agent_delegation'
      || type === 'agent_acknowledgement'
      || type === 'agent_response'
      || type === 'agent_error'
    ) {
      const label = agentLabel(data) || (type === 'agent_delegation' ? 'Mission Director' : 'Agent');
      current = startTurn('assistant', label, ts, evt.id);
      const text = stripSecretPrefix(stripAskUserMarker(String(evt.message || '').trim()));
      current.lines.push({ kind: 'text', type, text: text || type.replace(/^agent_/, 'Agent ') });
      const nested = data.data as Record<string, unknown> | undefined;
      const thought = [data.thought, nested?.thought, data.reason, nested?.reason, data.text, nested?.text]
        .find((v): v is string => typeof v === 'string' && v.trim().length > 0);
      if (thought && thought.trim() !== text) {
        current.lines.push({ kind: 'text', type: `${type}_thought`, text: thought.trim() });
      }
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
    current = startTurn(type === 'assistant' ? 'assistant' : 'system', type === 'assistant' ? agentLabel(data) || 'Assistant' : 'Mission', ts, evt.id);
    let text = typeof evt.message === 'string' ? evt.message : String(evt.message ?? '');
    text = stripSecretPrefix(stripAskUserMarker(text));
    current.lines.push({ kind: 'text', type, text });
  }

  return collapsePlannerProgress(turns);
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
