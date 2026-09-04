import { create } from 'zustand';

export type FeedEventType =
  | 'log'
  | 'tool'
  | 'monologue'
  | 'system'
  | 'mission_started'
  | 'mission_completed'
  | 'mission_failed'
  | 'phase_started'
  | 'phase_completed'
  | 'phase_rejected'
  | 'phase_approved'
  | 'task_started'
  | 'task_completed'
  | 'task_failed'
  | 'planner_started'
  | 'plan_generated'
  | 'assistant'
  | 'user';

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
  clear: () => void;
}

let reconnectAttempts = 0;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let started = false;

const MAX_RECONNECT_ATTEMPTS = 20;
const RECONNECT_BASE_DELAY = 1000;

function shortId(): string {
  return Math.random().toString(36).slice(2, 10);
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
    if (missionId) source = `mission:${missionId}`;
    else if ((data.agentRole as string) || (data.assistantId as string)) {
      source = (data.agentRole as string) || (data.assistantId as string);
    } else if (type.startsWith('mission_') || type.startsWith('phase_') || type.startsWith('task_') || type.startsWith('planner_') || type.startsWith('plan_')) {
      source = 'orchestrator';
    }
  }

  let message = (r.message as string) || '';
  if (!message) {
    switch (type) {
      case 'planner_started':
        message = `Planning mission${(data.prompt as string) ? `: "${String(data.prompt).slice(0, 80)}"` : ''}`;
        break;
      case 'plan_generated':
        message = 'Plan generated';
        break;
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
      case 'task_started':
        message = `Task: ${(data.taskTitle as string) || (data.taskId as string) || ''}${data.agentRole ? ` (${data.agentRole})` : ''}`.trim();
        break;
      case 'task_completed':
        message = `Task completed: ${(data.taskTitle as string) || (data.taskId as string) || ''}`.trim();
        break;
      case 'task_failed':
        message = `Task failed: ${(data.taskTitle as string) || (data.taskId as string) || ''} — ${(data.error as string) || ''}`.trim();
        break;
      case 'mission_started':
        message = 'Mission started';
        break;
      case 'mission_completed':
        message = 'Mission completed';
        break;
      case 'mission_failed':
        message = `Mission failed: ${(r.error as string) || (data.error as string) || ''}`.trim();
        break;
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

  return {
    id: (r.id as string) || `${timestamp}-${shortId()}`,
    type,
    source,
    message,
    timestamp,
    missionId,
    metadata: data && Object.keys(data).length ? data : undefined,
  };
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
        set((state) => ({ events: [normalized, ...state.events].slice(0, 500) }));
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
    set((state) => ({ events: [event, ...state.events].slice(0, 500) })),
  clear: () => set({ events: [] }),
}));