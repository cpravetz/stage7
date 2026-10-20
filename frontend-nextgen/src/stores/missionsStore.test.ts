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
