import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';

import { useMissionsStore, type MissionRow } from './missionsStore';
import { useFeedStore, type FeedEvent } from './feedStore';

const mission = (workflowId: string, missionId: string): MissionRow => ({
  workflowId,
  missionId,
  status: 'completed',
});

const feedEvent = (id: string, missionId?: string): FeedEvent => ({
  id,
  type: 'log',
  source: missionId ? `mission:${missionId}` : 'system',
  message: id,
  timestamp: 1,
  missionId,
});

describe('missionsStore.deleteMissions', () => {
  let requested: string[];
  let failTemporalFor: string | null;

  beforeEach(() => {
    requested = [];
    failTemporalFor = null;

    useMissionsStore.setState({
      missions: [mission('wf-1', 'm-1'), mission('wf-2', 'm-2')],
      details: {
        'wf-1': {
          missionId: 'm-1',
          status: 'completed',
        },
      },
      missionsError: null,
    });

    useFeedStore.setState({
      events: [feedEvent('e1', 'm-1'), feedEvent('e2', 'm-2'), feedEvent('e3')],
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requested.push(url);
        if (url.startsWith('/api/temporal/missions/') && failTemporalFor && url.includes(failTemporalFor)) {
          return { ok: false, status: 500, statusText: 'Server Error' };
        }
        return { ok: true, status: 200, statusText: 'OK' };
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('deletes every selected mission through the workflow engine', async () => {
    await useMissionsStore.getState().deleteMissions(['wf-1', 'wf-2']);

    expect(requested).toContain('/api/temporal/missions/wf-1');
    expect(requested).toContain('/api/temporal/missions/wf-2');

    expect(useMissionsStore.getState().missions).toHaveLength(0);
    expect(useMissionsStore.getState().details['wf-1']).toBeUndefined();
    expect(useMissionsStore.getState().missionsError).toBeNull();
  });

  it('leaves the persisted artifacts to the workflow engine', async () => {
    // The engine owns the mission state while a mission winds down, so the
    // client must not delete it directly: that would let the runner
    // resurrect the mission.
    await useMissionsStore.getState().deleteMissions(['wf-1']);

    expect(requested.filter((url) => url.startsWith('/api/artifacts/'))).toEqual([]);
  });

  it('removes the deleted mission from the live feed', async () => {
    await useMissionsStore.getState().deleteMissions(['wf-1']);

    expect(useFeedStore.getState().events.map((e) => e.id)).toEqual(['e2', 'e3']);
  });

  it('keeps a mission that could not be deleted and reports the failure', async () => {
    failTemporalFor = 'wf-1';

    await useMissionsStore.getState().deleteMissions(['wf-1', 'wf-2']);

    expect(useMissionsStore.getState().missions.map((m) => m.workflowId)).toEqual(['wf-1']);
    expect(useMissionsStore.getState().missionsError).toBeTruthy();
    // The failed mission keeps its live feed events.
    expect(useFeedStore.getState().events.map((e) => e.id)).toContain('e1');
  });
});

describe('missionsStore partial failures', () => {
  beforeEach(() => {
    useMissionsStore.setState({
      missions: [mission('wf-1', 'm-1')],
      details: {},
      missionsError: null,
    });
    useFeedStore.setState({ events: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetch(handlers: Array<{ url: string; status: number; body?: unknown }>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const match = handlers.find((h) => url.includes(h.url));
        if (!match) {
          return { ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify({ missionId: 'm-1', status: 'running', input: { prompt: 'hi' } }) };
        }
        if (match.body === undefined) {
          return { ok: false, status: match.status, statusText: 'Error' };
        }
        return {
          ok: match.status >= 200 && match.status < 300,
          status: match.status,
          statusText: 'OK',
          text: async () => (match.body === '' ? '' : JSON.stringify(match.body)),
        };
      })
    );
  }

  it('retains the complete mission history even when the global feed is capped', async () => {
    const events = Array.from({ length: 501 }, (_, index) => ({
      id: `event-${index}`, missionId: 'm-1', type: 'task_completed', timestamp: index + 1, data: {},
    }));
    mockFetch([
      { url: '/events', status: 200, body: { events } },
      { url: '/plan', status: 200, body: { phases: [] } },
      { url: '/artifacts', status: 200, body: { artifacts: [] } },
    ]);

    await useMissionsStore.getState().fetchMissionDetail('wf-1');

    expect(useFeedStore.getState().events).toHaveLength(500);
    expect(useMissionsStore.getState().details['wf-1'].persistedEvents).toHaveLength(501);
    expect(useMissionsStore.getState().details['wf-1'].persistedEvents?.[500].id).toBe('event-500');
  });

  it('reports history load errors and keeps previously loaded history on refresh', async () => {
    const persistedEvents = [feedEvent('old', 'm-1')];
    useMissionsStore.setState({ details: { 'wf-1': { missionId: 'm-1', status: 'failed', persistedEvents } } });
    mockFetch([
      { url: '/events', status: 500 },
      { url: '/plan', status: 200, body: { phases: [] } },
      { url: '/artifacts', status: 200, body: { artifacts: [] } },
    ]);

    await useMissionsStore.getState().refreshDetail('wf-1');

    expect(useMissionsStore.getState().details['wf-1'].persistedEvents).toEqual(persistedEvents);
    expect(useMissionsStore.getState().details['wf-1'].eventsLoadError).toContain('500');
  });

  it('keeps detail/events when the plan endpoint fails and reports a scoped planLoadError', async () => {
    mockFetch([
      { url: '/plan', status: 502 },
      { url: '/artifacts', status: 200, body: { artifacts: [] } },
    ]);

    await useMissionsStore.getState().fetchMissionDetail('wf-1');

    const detail = useMissionsStore.getState().details['wf-1'];
    expect(detail?.planLoadError).toContain('502');
    expect(detail?.artifactLoadError).toBeUndefined();
    // Persisted conversation events remain visible even though plan failed.
    expect(useFeedStore.getState().events.length).toBeGreaterThanOrEqual(0);
  });

  it('keeps detail/events when artifacts endpoint fails and reports a scoped artifactLoadError', async () => {
    mockFetch([
      { url: '/plan', status: 200, body: { phases: [] } },
      { url: '/artifacts', status: 500 },
    ]);

    await useMissionsStore.getState().fetchMissionDetail('wf-1');

    const detail = useMissionsStore.getState().details['wf-1'];
    expect(detail?.artifactLoadError).toContain('500');
    expect(detail?.planLoadError).toBeUndefined();
  });

  it('preserves the previous detail when a subsequent detail refresh fails', async () => {
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        callCount += 1;
        if (url.startsWith('/api/temporal/missions/wf-1') && callCount === 1) {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            text: async () => JSON.stringify({ missionId: 'm-1', status: 'completed', input: { prompt: 'hi' } }),
          };
        }
        return { ok: false, status: 503, statusText: 'Service Unavailable' };
      })
    );

    await useMissionsStore.getState().fetchMissionDetail('wf-1');
    expect(useMissionsStore.getState().details['wf-1']?.status).toBe('completed');

    await useMissionsStore.getState().refreshDetail('wf-1');

    const detail = useMissionsStore.getState().details['wf-1'];
    // Previous detail is preserved, not wiped.
    expect(detail?.status).toBe('completed');
    expect(useMissionsStore.getState().detailError['wf-1']).toBeTruthy();
  });

  it('treats an empty/304 body as a specific error rather than crashing', async () => {
    mockFetch([
      { url: '/plan', status: 304 },
      { url: '/artifacts', status: 200, body: '' },
    ]);

    await useMissionsStore.getState().fetchMissionDetail('wf-1');

    const detail = useMissionsStore.getState().details['wf-1'];
    expect(detail?.planLoadError).toBeTruthy();
    expect(detail?.artifactLoadError).toBeTruthy();
  });
});
