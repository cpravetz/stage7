import { create } from 'zustand';
import { fetchJSON, deleteResource } from '../utils/api';
import { normalize, FeedEvent, useFeedStore } from './feedStore';

export interface MissionRow {
  workflowId: string;
  status: string;
  missionId: string;
  prompt?: string;
  assistantId?: string;
  startedAt?: string;
  completedAt?: string;
  timestamp?: number;
  retriedFrom?: string;
  retryCount?: number;
  retryGuidance?: string;
}

export interface MissionDetail {
  missionId: string;
  status: string;
  artifacts?: unknown[];
  artifactLoadError?: string;
  output?: {
    plan?: unknown;
    outputs?: { phases?: MissionPhaseOutput[]; status?: string; phaseId?: string; reason?: string };
  };
  error?: string;
  startedAt?: number | string;
  completedAt?: number | string;
  input?: {
    prompt?: string;
    missionId?: string;
    tenantId?: string;
    assistantId?: string;
    metadata?: Record<string, unknown>;
  };
}

export interface MissionPhaseOutput {
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

export interface PendingApproval {
  missionId: string;
  phaseId: string;
  question: string;
  phaseName?: string;
  assistantId?: string;
  tasks?: Array<{
    id: string;
    title: string;
    status: string;
    artifacts?: any[];
  }>;
}

interface MissionsState {
  missions: MissionRow[];
  missionsLoaded: boolean;
  missionsLoading: boolean;
  missionsError: string | null;

  details: Record<string, MissionDetail>;
  detailLoading: Record<string, boolean>;
  detailError: Record<string, string | null>;

  pendingApprovals: PendingApproval[];
  pendingApprovalsLoading: boolean;
  pendingApprovalsError: string | null;

  fetchMissions: () => Promise<void>;
  fetchMissionDetail: (workflowId: string) => Promise<void>;
  refreshDetail: (workflowId: string) => Promise<void>;
  fetchPendingApprovals: () => Promise<void>;
  deleteMission: (workflowId: string) => Promise<void>;
  deleteMissions: (workflowIds: string[]) => Promise<void>;
  retryMission: (workflowId: string, retryPrompt?: string) => Promise<{ workflowId: string; status: string; retriedFrom: string; retryCount: number }>;
  addMission: (mission: MissionRow) => void;
  updateMissionStatus: (identifier: string, status: string, extra?: Partial<MissionRow>) => void;
  clearDetail: (workflowId: string) => void;
}

const STATUS_EVENT_MAP: Record<string, string> = {
  mission_started: 'running',
  mission_paused: 'paused',
  mission_resumed: 'running',
  mission_completed: 'completed',
  mission_failed: 'failed',
  mission_canceled: 'canceled',
  mission_needs_review: 'awaiting_review',
  mission_incomplete: 'incomplete',
};

const LIFECYCLE_EVENTS = new Set([
  'mission_paused',
  'mission_resumed',
  'mission_completed',
  'mission_failed',
  'mission_canceled',
  'mission_incomplete',
  'mission_needs_review',
  'phase_completed',
  'phase_approved',
  'phase_rejected',
  'approval_approved',
  'approval_rejected',
  'task_completed',
  'task_failed',
]);

const POLL_INTERVAL = 15000;

const REFRESH_DEBOUNCE = 2000;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let feedUnsub: (() => void) | null = null;
let processedCount = 0;
const lastRefreshByMission = new Map<string, number>();

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    const state = useMissionsStore.getState();
    if (!state.missionsLoaded) return;
    state.fetchMissions();
    state.fetchPendingApprovals();
  }, POLL_INTERVAL);
}

function findDetailKey(missionId: string): string | undefined {
  const store = useMissionsStore.getState();
  return Object.keys(store.details).find(
    (k) => store.details[k]?.missionId === missionId
  );
}

function processFeedEvents(newEvents: FeedEvent[]) {
  const store = useMissionsStore.getState();
  const updates: Array<{
    identifier: string;
    status: string;
    extra?: Partial<MissionRow>;
  }> = [];

  for (const evt of newEvents) {
    const newStatus = STATUS_EVENT_MAP[evt.type as string];
    if (!newStatus) continue;

    const eventMissionId = evt.missionId;
    if (!eventMissionId) continue;

    const existing = store.missions.find(
      (m) => m.missionId === eventMissionId || m.workflowId === eventMissionId
    );

    if (existing && existing.status !== newStatus) {
      const extra: Partial<MissionRow> = {};
      if (
        newStatus === 'completed' ||
        newStatus === 'failed' ||
        newStatus === 'canceled'
      ) {
        extra.completedAt = new Date(evt.timestamp).toISOString();
      } else if (newStatus === 'running') {
        extra.startedAt =
          existing.startedAt || new Date(evt.timestamp).toISOString();
      }
      updates.push({ identifier: existing.workflowId, status: newStatus, extra });
    }
  }

  if (updates.length > 0) {
    useMissionsStore.setState((s) => ({
      missions: s.missions.map((m) => {
        const upd = updates.find(
          (u) => m.workflowId === u.identifier || m.missionId === u.identifier
        );
        return upd ? { ...m, status: upd.status, ...upd.extra } : m;
      }),
    }));
  }

  const now = Date.now();

  for (const evt of newEvents) {
    if (!LIFECYCLE_EVENTS.has(evt.type as string) && evt.type !== 'approval_requested') continue;
    const eventMissionId = evt.missionId;
    if (!eventMissionId) continue;

    const detailKey = findDetailKey(eventMissionId);
    if (!detailKey) continue;

    const lastRefresh = lastRefreshByMission.get(detailKey) || 0;
    if (evt.type !== 'approval_requested' && now - lastRefresh < REFRESH_DEBOUNCE) continue;
    lastRefreshByMission.set(detailKey, now);

    const loading = store.detailLoading[detailKey];
    if (loading) continue;

    void useMissionsStore.getState().refreshDetail(detailKey);
  }
}

function subscribeToFeed() {
  if (feedUnsub) feedUnsub();
  feedUnsub = useFeedStore.subscribe((state, _prevState) => {
    if (state.events.length === 0) {
      processedCount = 0;
      return;
    }
    if (state.events.length > processedCount) {
      const newEvents = state.events.slice(
        0,
        state.events.length - processedCount
      );
      processedCount = state.events.length;
      if (newEvents.length > 0) {
        processFeedEvents(newEvents);
      }
    } else if (state.events.length < processedCount) {
      processedCount = state.events.length;
    }
  });
}

async function loadSupplementary(workflowId: string, data: MissionDetail): Promise<MissionDetail> {
  const missionId = data.missionId || workflowId.replace(/^mission-/, '');
  let enriched = data;

  try {
    const evtRes = await fetchJSON<{ events: unknown[] }>(
      `/api/artifacts/missions/${encodeURIComponent(missionId)}/events`
    );
    const raw = evtRes?.events || [];
    const normalized = raw
      .map((e) => normalize(e))
      .filter((e): e is FeedEvent => e !== null);
    useFeedStore.getState().addEvents(normalized);
  } catch {
    // Events are supplementary; the mission detail remains usable if they are unavailable.
  }

  try {
    const plan = await fetchJSON<unknown>(
      `/api/artifacts/missions/${encodeURIComponent(missionId)}/plan`
    );
    if (plan) {
      enriched = {
        ...enriched,
        output: {
          ...(enriched.output || {}),
          plan,
        },
      };
    }
  } catch {
    // A plan may not have been generated yet.
  }

  try {
    const result = await fetchJSON<{ artifacts: unknown[] }>(
      `/api/artifacts/missions/${encodeURIComponent(missionId)}/artifacts`
    );
    enriched = {
      ...enriched,
      artifacts: result.artifacts || [],
      artifactLoadError: undefined,
    };
  } catch (err) {
    enriched = {
      ...enriched,
      artifactLoadError: err instanceof Error ? err.message : 'Failed to load mission artifacts',
    };
  }

  return enriched;
}

export const useMissionsStore = create<MissionsState>((set, get) => ({
  missions: [],
  missionsLoaded: false,
  missionsLoading: false,
  missionsError: null,

  details: {},
  detailLoading: {},
  detailError: {},

  pendingApprovals: [],
  pendingApprovalsLoading: false,
  pendingApprovalsError: null,

  fetchMissions: async () => {
    const hasCached = get().missions.length > 0;
    if (!hasCached) {
      set({ missionsLoading: true });
    }
    try {
      const data = await fetchJSON<{ missions: MissionRow[] }>(
        '/api/temporal/missions'
      );
      const missions = data.missions || [];
      set({
        missions,
        missionsLoaded: true,
        missionsError: null,
        missionsLoading: false,
      });
      useFeedStore.getState().ensureConnected();
    } catch (err) {
      set({
        missionsError:
          err instanceof Error ? err.message : 'Failed to load missions',
        missionsLoading: false,
      });
    }
  },

  fetchMissionDetail: async (workflowId: string) => {
    set((s) => ({
      detailLoading: { ...s.detailLoading, [workflowId]: true },
      detailError: { ...s.detailError, [workflowId]: null },
    }));
    try {
      const data = await fetchJSON<MissionDetail>(
        `/api/temporal/missions/${encodeURIComponent(workflowId)}`
      );
      const enriched = await loadSupplementary(workflowId, data);
      set((s) => ({
        details: { ...s.details, [workflowId]: enriched },
        detailLoading: { ...s.detailLoading, [workflowId]: false },
        detailError: { ...s.detailError, [workflowId]: null },
      }));
      useFeedStore.getState().ensureConnected();
    } catch (err) {
      set((s) => ({
        detailError: {
          ...s.detailError,
          [workflowId]:
            err instanceof Error ? err.message : 'Failed to load mission',
        },
        detailLoading: { ...s.detailLoading, [workflowId]: false },
      }));
    }
  },

  refreshDetail: async (workflowId: string) => {
    const hasCached = !!get().details[workflowId];
    if (!hasCached) {
      await get().fetchMissionDetail(workflowId);
      return;
    }
    set((s) => ({
      detailLoading: { ...s.detailLoading, [workflowId]: true },
      detailError: { ...s.detailError, [workflowId]: null },
    }));
    try {
      const data = await fetchJSON<MissionDetail>(
        `/api/temporal/missions/${encodeURIComponent(workflowId)}`
      );
      const enriched = await loadSupplementary(workflowId, data);
      set((s) => ({
        details: { ...s.details, [workflowId]: enriched },
        detailLoading: { ...s.detailLoading, [workflowId]: false },
        detailError: { ...s.detailError, [workflowId]: null },
      }));
    } catch (err) {
      set((s) => ({
        detailError: {
          ...s.detailError,
          [workflowId]:
            err instanceof Error
              ? err.message
              : 'Failed to refresh mission',
        },
        detailLoading: { ...s.detailLoading, [workflowId]: false },
      }));
    }
  },

  fetchPendingApprovals: async () => {
    set({ pendingApprovalsLoading: true, pendingApprovalsError: null });
    try {
      const data = await fetchJSON<{ approvals: PendingApproval[] }>(
        '/api/artifacts/missions/approvals'
      );
      set({
        pendingApprovals: data.approvals || [],
        pendingApprovalsLoading: false,
      });
    } catch (err) {
      set({
        pendingApprovalsError:
          err instanceof Error ? err.message : 'Failed to load approvals',
        pendingApprovals: [],
        pendingApprovalsLoading: false,
      });
    }
  },

  deleteMission: async (workflowId: string) => {
    await get().deleteMissions([workflowId]);
  },

  /**
   * Deletes missions from the workflow engine. The engine removes the
   * persisted artifacts of each mission, including the live feed events
   * recorded in the artifacts service, so a deleted mission does not keep a
   * live feed. The events are also dropped from the local feed so the live
   * feed view stops showing a mission that no longer exists.
   */
  deleteMissions: async (workflowIds: string[]) => {
    if (workflowIds.length === 0) return;

    const targets = workflowIds.map((workflowId) => ({
      workflowId,
      missionId: get().missions.find((m) => m.workflowId === workflowId)?.missionId,
    }));

    const errors: string[] = [];
    const removedMissionIds: string[] = [];
    const deleted = new Set<string>();

    for (const { workflowId, missionId } of targets) {
      try {
        await deleteResource(
          `/api/temporal/missions/${encodeURIComponent(workflowId)}`
        );
      } catch (err) {
        errors.push(
          err instanceof Error
            ? err.message
            : `Failed to delete mission ${workflowId}`
        );
        continue;
      }

      deleted.add(workflowId);
      if (missionId) removedMissionIds.push(missionId);
    }

    set((s) => ({
      missions: s.missions.filter((m) => !deleted.has(m.workflowId)),
      details: Object.fromEntries(
        Object.entries(s.details).filter(([k]) => !deleted.has(k))
      ),
      missionsError: errors.length > 0 ? errors.join('; ') : null,
    }));

    for (const missionId of removedMissionIds) {
      useFeedStore.getState().removeMissionEvents(missionId);
    }
  },

  retryMission: async (workflowId: string, retryPrompt?: string) => {
    try {
      const res = await fetchJSON<{ workflowId: string; status: string; retriedFrom: string; retryCount: number }>(
        `/api/temporal/missions/${encodeURIComponent(workflowId)}/retry`,
        { method: 'POST', body: JSON.stringify({ retryPrompt }) }
      );
      return res;
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to retry mission');
    }
  },

  addMission: (mission: MissionRow) => {
    set((s) => {
      const existingIdx = s.missions.findIndex(
        (m) => m.workflowId === mission.workflowId
      );
      if (existingIdx >= 0) {
        const missions = [...s.missions];
        missions[existingIdx] = { ...missions[existingIdx], ...mission };
        return { missions };
      }
      return { missions: [mission, ...s.missions] };
    });
  },

  updateMissionStatus: (identifier, status, extra) => {
    set((s) => ({
      missions: s.missions.map((m) =>
        m.missionId === identifier || m.workflowId === identifier
          ? { ...m, status, ...extra }
          : m
      ),
    }));
  },

  clearDetail: (workflowId: string) => {
    set((s) => {
      const { [workflowId]: _omit, ...restDetails } = s.details;
      const { [workflowId]: _o2, ...restLoading } = s.detailLoading;
      const { [workflowId]: _o3, ...restError } = s.detailError;
      void _omit; void _o2; void _o3;
      return {
        details: restDetails,
        detailLoading: restLoading,
        detailError: restError,
      };
    });
  },
}));

export function initMissionsStore() {
  subscribeToFeed();
  startPolling();
}

export function getMissionStatusFromEvent(type: string): string | null {
  return STATUS_EVENT_MAP[type] || null;
}

export { processFeedEvents };
