import { create } from 'zustand';
import { friendlyMissionError } from '../utils/missionEvents';

export type FeedEventType =
  | 'log'
  | 'tool'
  | 'monologue'
  | 'system'
  | 'mission_started'
  | 'mission_completed'
  | 'mission_failed'
  | 'mission_canceled'
  | 'mission_incomplete'
  | 'mission_needs_review'
  | 'mission_paused'
  | 'mission_resumed'
  | 'plan_generated'
  | 'planner_started'
  | 'planner_progress'
  | 'clarification_needed'
  | 'phase_started'
  | 'phase_completed'
  | 'phase_approved'
  | 'phase_rejected'
  | 'phase_plan_amended'
  | 'approval_requested'
  | 'approval_approved'
  | 'approval_rejected'
  | 'question_asked'
  | 'permission_required'
  | 'user_input_resolved'
  | 'task_started'
  | 'task_completed'
  | 'task_incomplete'
  | 'task_failed'
  | 'cost_estimate'
  | 'assistant'
  | 'user'
  | 'agent_delegation'
  | 'agent_acknowledgement'
  | 'agent_response'
  | 'agent_error';

export interface FeedEvent {
  id: string;
  type: FeedEventType | string;
  source: string;
  message: string;
  timestamp: number;
  missionId?: string;
  metadata?: Record<string, unknown>;
}

interface FeedState {
  events: FeedEvent[];
  connected: boolean;
  ws: WebSocket | null;
  ensureConnected: () => void;
  disconnect: () => void;
  addEvent: (event: FeedEvent) => void;
  addEvents: (events: FeedEvent[]) => void;
  removeMissionEvents: (missionId: string) => void;
  clear: () => void;
}

let reconnectAttempts = 0;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let started = false;

const MAX_RECONNECT_ATTEMPTS = 20;
const RECONNECT_BASE_DELAY = 1000;

function stableId(type: string, timestamp: number, data: Record<string, unknown>): string {
  let str = `${type}|${timestamp}|`;
  const keys = Object.keys(data).sort();
  for (const k of keys) {
    str += `${k}=${JSON.stringify(data[k])}|`;
  }
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return `${timestamp}-${Math.abs(hash).toString(36)}`;
}

export function normalize(raw: unknown): FeedEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const type = (r.type as string) || 'log';
  if (type === 'welcome') return null;
  const data = (r.data as Record<string, unknown> | undefined) || {};
  const timestamp = (r.timestamp as number) || Date.now();
  const missionId = (r.missionId as string) || (data.missionId as string) || undefined;

  let source = (r.source as string) || 'mission';
  if (!r.source) {
    // For task/agent events, prioritize agentRole as the source for proper grouping
    if ((data.agentRole as string) || (data.assistantId as string)) {
      source = (data.agentRole as string) || (data.assistantId as string);
    } else if (missionId) {
      source = `mission:${missionId}`;
    } else if (type.startsWith('mission_') || type.startsWith('phase_') || type.startsWith('task_') || type.startsWith('planner_') || type.startsWith('plan_') || type === 'brain_error') {
      source = 'orchestrator';
    }
  }

  let message = (r.message as string) || '';
  if (!message) {
    switch (type) {
      case 'planner_started':
        message = (typeof data.reason === 'string' && data.reason.trim()) || (typeof data.thought === 'string' && data.thought.trim()) || `Planning mission...`;
        break;
      case 'planner_progress': {
        const attempt = data.attempt !== undefined ? ` (attempt ${String(data.attempt)})` : '';
        const reason = String(data.reason || data.thought || data.text || '').trim();
        message = reason ? `Planning update${attempt}: ${reason.slice(0, 200)}` : `Planning update${attempt}`;
        break;
      }
      case 'clarification_needed':
        message = `The planner needs clarification: ${(data.questions as string[])?.join(' ') || ''}`.trim();
        break;
      case 'phase_plan_amended':
        {
          const gaps = Array.isArray(data.gaps)
            ? data.gaps.filter((gap): gap is string => typeof gap === 'string').slice(0, 2)
            : [];
          const task = data.task && typeof data.task === 'object'
            ? data.task as Record<string, unknown>
            : undefined;
          const taskTitle = typeof task?.title === 'string' ? task.title.trim() : '';
          message = `Phase plan amended: ${(data.phaseId as string) || ''}`
            + (gaps.length > 0 ? ` — Phase review found: ${gaps.join('; ').slice(0, 240)}.` : '')
            + (taskTitle ? ` Follow-up task added: ${taskTitle}.` : '');
          break;
        }
        break;
      case 'cost_estimate':
        message = `Model call: ${(data.model as string) || 'unknown model'}${data.tokensUsed ? ` (${String(data.tokensUsed)} tokens)` : ''}`;
        break;
      case 'plan_generated': {
        const planSource = typeof data.planSource === 'string' ? data.planSource : (typeof (data.data as Record<string, unknown> | undefined)?.planSource === 'string' ? String((data.data as Record<string, unknown>).planSource) : '');
        const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
        message = reason || (planSource === 'loaded' ? 'Plan loaded' : 'Plan generated');
        break;
      }
      case 'phase_started':
        message = `Phase started: ${(data.phaseName as string) || (data.phaseId as string) || ''}`.trim();
        break;
      case 'phase_completed':
        message = `Phase completed: ${(data.phaseName as string) || (data.phaseId as string) || ''}`.trim();
        break;
      case 'phase_approved':
        message = `Phase approved: ${(data.phaseId as string) || ''}`.trim();
        break;
      case 'phase_rejected':
        message = `Phase rejected: ${(data.phaseId as string) || ''} — ${(data.reason as string) || ''}`.trim();
        break;
      case 'approval_requested':
        message = `Approval requested: ${(data.phaseName as string) || (data.phaseId as string) || ''}`;
        if (data.question) message += ` — ${(data.question as string)}`;
        break;
      case 'question_asked':
        message = `Agent needs your input${typeof data.question === 'string' ? `: ${data.question.replace(/^\s*\[secret:[a-z0-9_-]+\]\s*/i, '')}` : ''}`;
        break;
      case 'permission_required':
        message = `Agent requests permission${typeof data.permission === 'object' && data.permission && typeof (data.permission as Record<string, unknown>).toolName === 'string' ? ` to use ${(data.permission as Record<string, unknown>).toolName}` : ''}`;
        break;
      case 'approval_approved':
        message = `Phase approved: ${(data.phaseId as string) || ''}`;
        break;
      case 'approval_rejected':
        message = `Phase rejected: ${(data.phaseId as string) || ''} — ${(data.reason as string) || ''}`.trim();
        break;
      case 'task_started':
        message = `Task: ${(data.taskTitle as string) || (data.taskId as string) || ''}${data.agentRole ? ` (${data.agentRole})` : ''}`.trim();
        break;
      case 'task_completed':
        message = `Task completed: ${(data.taskTitle as string) || (data.taskId as string) || ''}`.trim();
        break;
      case 'task_incomplete':
        message = `Task incomplete: ${(data.taskTitle as string) || (data.taskId as string) || ''} — ${friendlyMissionError((data.error as string) || '')}`.trim();
        break;
      case 'task_failed':
        message = `Task failed: ${(data.taskTitle as string) || (data.taskId as string) || ''} — ${friendlyMissionError((data.error as string) || '')}`.trim();
        break;
      case 'user':
      case 'user_message':
        message = (data.content as string) || (data.message as string) || '';
        break;
      case 'brain_error':
        message = `Brain error${(data.provider as string) ? ` (${data.provider})` : ''}: ${(data.error as string) || ''}`.trim();
        break;
      case 'mission_started':
        message = 'Mission started';
        break;
      case 'mission_completed':
        message = 'Mission completed';
        break;
      case 'mission_canceled':
        message = 'Mission canceled';
        break;
      case 'mission_paused':
        message = 'Mission paused';
        break;
      case 'mission_resumed':
        message = 'Mission resumed';
        break;
      case 'mission_failed':
        message = `Mission failed: ${friendlyMissionError((r.error as string) || (data.error as string) || '')}`.trim();
        break;
      case 'mission_incomplete': {
        const reason = typeof data.reason === 'string'
          ? data.reason
          : Array.isArray(data.gaps)
            ? Array.from(new Set(data.gaps.filter((gap): gap is string => typeof gap === 'string'))).join('; ')
            : '';
        message = reason
          ? `Mission incomplete: ${reason} — retry this mission to address the unmet requirements.`
          : 'Mission incomplete';
        break;
      }
      case 'agent_delegation': {
        const to = typeof data.to === 'string' ? data.to : typeof data.agentId === 'string' ? data.agentId : '';
        const content = typeof data.content === 'string' ? data.content : typeof data.message === 'string' ? data.message : '';
        message = content || (to ? `Delegated to ${to}` : 'Delegated user request');
        break;
      }
      case 'agent_acknowledgement': {
        const content = typeof data.content === 'string' ? data.content : typeof data.message === 'string' ? data.message : typeof data.text === 'string' ? data.text : '';
        message = content || 'Acknowledged';
        break;
      }
      case 'agent_response': {
        const content = typeof data.content === 'string' ? data.content : typeof data.response === 'string' ? data.response : typeof data.message === 'string' ? data.message : '';
        message = content || 'Agent response';
        break;
      }
      case 'agent_error': {
        const err = typeof data.error === 'string' ? data.error : typeof data.message === 'string' ? data.message : '';
        message = err ? `Agent error: ${friendlyMissionError(err)}` : 'Agent error';
        break;
      }
      case 'tool':
        message = (data.tool as string) || (data.name as string) || 'Tool call';
        break;
      case 'monologue':
        message = (data.text as string) || (data.thought as string) || (data.content as string) || 'Thinking...';
        break;
      case 'system':
        message = (data.message as string) || (r.message as string) || 'System event';
        break;
      default:
        if (data.message) message = String(data.message);
        else if (data.prompt) message = `Prompt: ${String(data.prompt).slice(0, 80)}`;
        else message = type;
    }
  }

  const normalizedMeta: Record<string, unknown> = data && Object.keys(data).length ? { ...data } : {};
  const nested = normalizedMeta.data as Record<string, unknown> | undefined;
  if (typeof normalizedMeta.thought !== 'string' && nested && typeof nested.thought === 'string') normalizedMeta.thought = nested.thought;
  if (typeof normalizedMeta.reason !== 'string' && nested && typeof nested.reason === 'string') normalizedMeta.reason = nested.reason;
  if (typeof normalizedMeta.text !== 'string' && nested && typeof nested.text === 'string') normalizedMeta.text = nested.text;
  if (type === 'planner_progress' && typeof normalizedMeta.thought !== 'string' && typeof normalizedMeta.reason === 'string') {
    normalizedMeta.thought = normalizedMeta.reason;
  }

  return {
    id: (r.id as string) || stableId(type, timestamp, data),
    type,
    source,
    message,
    timestamp,
    missionId,
    metadata: Object.keys(normalizedMeta).length ? normalizedMeta : undefined,
  };
}

// User-facing response types that the frontend may render optimistically
// before the backend echoes the persisted copy back over the websocket.
const USER_RESPONSE_TYPES = new Set(['user', 'user_message', 'user_input_resolved']);

/**
 * Removes optimistic placeholders that a persisted user response now replaces,
 * so the user's input is listed once instead of duplicated. An optimistic
 * placeholder matches when it is flagged optimistic, shares the response type
 * and mission, and either has the same rendered message or resolves the same
 * pending interaction (phaseId/taskId) — the backend may synthesize the
 * response text for credential or permission resolutions.
 *
 * Optimistic placeholders are also dropped when the mission lifecycle advances
 * (started/resumed), because a resume means the pending interaction was
 * consumed even if the backend does not echo a matching user response event
 * (e.g. clarification answers).
 */
function reconcileOptimisticPlaceholders(events: FeedEvent[]): FeedEvent[] {
  const persistedResponses = events.filter(
    (e) => e.metadata?.optimistic !== true && USER_RESPONSE_TYPES.has(String(e.type)),
  );
  const lifecycleAdvanced = events.some((e) =>
    e.metadata?.optimistic !== true
    && (e.type === 'mission_started' || e.type === 'mission_resumed')
    && Boolean(e.missionId),
  );
  if (persistedResponses.length === 0 && !lifecycleAdvanced) return events;
  const interactionKey = (e: FeedEvent) =>
    `${e.metadata?.phaseId ?? ''}|${e.metadata?.taskId ?? ''}`;
  return events.filter((e) => {
    if (e.metadata?.optimistic !== true) return true;
    if (lifecycleAdvanced && e.missionId) {
      const advanced = events.some((p) =>
        p.metadata?.optimistic !== true
        && (p.type === 'mission_started' || p.type === 'mission_resumed')
        && p.missionId === e.missionId,
      );
      if (advanced) return false;
    }
    return !persistedResponses.some((persisted) => {
      if (persisted.type !== e.type || persisted.missionId !== e.missionId) return false;
      if (persisted.message === e.message) return true;
      const a = interactionKey(persisted);
      const b = interactionKey(e);
      return a.length > 0 && a === b;
    });
  });
}

export const useFeedStore = create<FeedState>((set, get) => ({
  events: [],
  connected: false,
  ws: null,
  ensureConnected: () => {
    if (typeof window === 'undefined') return;
    if (get().ws || started) return;
    started = true;
    reconnectAttempts = 0;

    const connectWs = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      ws.onopen = () => {
        set({ connected: true, ws });
        reconnectAttempts = 0;
        ws.send(JSON.stringify({ type: 'subscribe-all' }));
      };
      ws.onmessage = (msg) => {
        let payload: unknown;
        try {
          payload = JSON.parse(msg.data);
        } catch {
          set((state) => ({
            events: [
              {
                id: `raw-${Date.now()}`,
                type: 'log',
                source: 'system',
                message: typeof msg.data === 'string' ? msg.data : JSON.stringify(msg.data),
                timestamp: Date.now(),
              },
              ...state.events,
            ].slice(0, 500),
          }));
          return;
        }
        if (
          payload &&
          typeof payload === 'object' &&
          (payload as { type?: string }).type === 'welcome'
        ) {
          return;
        }
        const normalized = normalize(payload);
        if (!normalized) return;
        set((state) => {
          const reconciled = reconcileOptimisticPlaceholders([normalized, ...state.events]);
          return { events: reconciled.slice(0, 500) };
        });
      };
      ws.onclose = () => {
        set({ connected: false, ws: null });
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          const delay = RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts - 1);
          reconnectTimeout = setTimeout(connectWs, Math.min(delay, 30000));
        } else {
          started = false;
        }
      };
      ws.onerror = () => {
        set({ connected: false, ws: null });
      };
    };

    connectWs();
  },
       disconnect: () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    reconnectAttempts = MAX_RECONNECT_ATTEMPTS + 1;
    started = false;
    get().ws?.close();
    set({ ws: null, connected: false });
  },
  addEvent: (event: FeedEvent) =>
    set((state) => {
      if (state.events.some((e) => e.id === event.id)) return state;
      const reconciled = reconcileOptimisticPlaceholders([event, ...state.events]);
      return { events: reconciled.slice(0, 500) };
    }),
  addEvents: (newEvents: FeedEvent[]) => {
    if (newEvents.length === 0) return;
    set((state) => {
      const existing = new Set(state.events.map((e) => e.id));
      const filtered = newEvents.filter((e) => !existing.has(e.id));
      if (filtered.length === 0) return state;
      const reconciled = reconcileOptimisticPlaceholders([...filtered, ...state.events]);
      return { events: reconciled.slice(0, 500) };
    });
  },
  clear: () => set({ events: [] }),
  removeMissionEvents: (missionId: string) =>
    set((state) => {
      if (!missionId) return state;
      const remaining = state.events.filter((e) => e.missionId !== missionId);
      if (remaining.length === state.events.length) return state;
      return { events: remaining };
    }),
}));