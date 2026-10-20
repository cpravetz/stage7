import { describe, it, expect } from 'vitest';

import type { FeedEvent } from '../stores/feedStore';
import {
  buildMissionEvents,
  buildTranscript,
  CONVERSATION_EVENT_TYPES,
  summarizeModelUsage,
  TIMELINE_EVENT_TYPES,
} from './missionEvents';

const MISSION_ID = 'mission-1792463149262';

function feedEvent(partial: Partial<FeedEvent> & { id: string; type: string }): FeedEvent {
  return {
    source: 'orchestrator',
    message: partial.type,
    timestamp: 1_700_000_000_000,
    missionId: MISSION_ID,
    ...partial,
  };
}

describe('buildMissionEvents', () => {
  it('does not repeat a mission milestone that the mission already recorded', () => {
    const liveEvents: FeedEvent[] = [
      feedEvent({ id: 'e1', type: 'mission_started', timestamp: 1 }),
      feedEvent({ id: 'e2', type: 'planner_started', timestamp: 2 }),
      feedEvent({ id: 'e3', type: 'mission_failed', timestamp: 3, metadata: { error: 'planner gave up' } }),
    ];

    const events = buildMissionEvents({
      missionId: MISSION_ID,
      liveEvents,
      detail: {
        status: 'failed',
        error: 'planner gave up',
        startedAt: 1,
        completedAt: 3,
        input: { prompt: 'Create an Agent run business' },
      },
    });

    const lifecycle = events.filter((event) => String(event.type).startsWith('mission_'));
    expect(lifecycle.map((event) => event.type)).toEqual(['mission_started', 'mission_failed']);
  });

  it('keeps the derived milestone when the mission has not recorded one', () => {
    const events = buildMissionEvents({
      missionId: MISSION_ID,
      liveEvents: [],
      detail: {
        status: 'failed',
        error: 'planner gave up',
        startedAt: 1,
        completedAt: 3,
        input: { prompt: 'Create an Agent run business' },
      },
    });

    const lifecycle = events.filter((event) => String(event.type).startsWith('mission_'));
    expect(lifecycle.map((event) => event.type)).toEqual(['mission_started', 'mission_failed']);
    expect(lifecycle[1]?.message).toContain('planner gave up');
  });

  it('explains a failure with the reason recorded on the mission', () => {
    const liveEvents: FeedEvent[] = [
      feedEvent({ id: 'e1', type: 'mission_started', timestamp: 1 }),
      feedEvent({ id: 'e2', type: 'mission_failed', timestamp: 3 }),
    ];

    const events = buildMissionEvents({
      missionId: MISSION_ID,
      liveEvents,
      detail: {
        status: 'failed',
        error: 'Planner Agent request failed on attempt 88',
        startedAt: 1,
        completedAt: 3,
        input: { prompt: 'Create an Agent run business' },
      },
    });

    const failure = events.find((event) => event.type === 'mission_failed');
    expect(failure?.message).toBe('Mission failed: Planner Agent request failed on attempt 88');
  });

  it('lists a milestone that was announced twice only once', () => {
    const liveEvents: FeedEvent[] = [
      feedEvent({ id: 'e1', type: 'mission_started', timestamp: 1 }),
      feedEvent({ id: 'e2', type: 'planner_started', timestamp: 2 }),
      feedEvent({ id: 'e3', type: 'mission_started', timestamp: 3 }),
      feedEvent({ id: 'e4', type: 'mission_failed', timestamp: 4 }),
    ];

    const events = buildMissionEvents({
      missionId: MISSION_ID,
      liveEvents,
      detail: { status: 'failed', error: 'planner gave up', startedAt: 1, completedAt: 4 },
    });

    expect(events.filter((event) => event.type === 'mission_started')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'mission_failed')).toHaveLength(1);
  });

  it('does not repeat a phase or task that the mission already recorded', () => {    const liveEvents: FeedEvent[] = [
      feedEvent({ id: 'e1', type: 'mission_started', timestamp: 1 }),
      feedEvent({ id: 'e2', type: 'phase_started', timestamp: 2, metadata: { phaseId: 'phase-1' } }),
      feedEvent({ id: 'e3', type: 'task_completed', timestamp: 3, metadata: { phaseId: 'phase-1', taskId: 'task-1' } }),
      feedEvent({ id: 'e4', type: 'phase_completed', timestamp: 4, metadata: { phaseId: 'phase-1' } }),
    ];

    const events = buildMissionEvents({
      missionId: MISSION_ID,
      liveEvents,
      detail: { status: 'running', startedAt: 1 },
      plan: {
        summary: 'Ship it',
        phases: [{
          id: 'phase-1',
          name: 'Build',
          tasks: [{ id: 'task-1', title: 'Build the thing' }],
        }],
      },
      phaseOutputs: [{
        phaseId: 'phase-1',
        name: 'Build',
        status: 'completed',
        tasks: [{ taskId: 'task-1', status: 'completed' }],
      }],
    });

    expect(events.filter((event) => event.type === 'phase_started')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'task_completed')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'phase_completed')).toHaveLength(1);
  });
});

describe('mission conversation', () => {
  it('tells the user what happened to a mission that failed while planning', () => {
    const liveEvents: FeedEvent[] = [
      feedEvent({ id: 'e1', type: 'mission_started', timestamp: 1, message: 'Mission started' }),
      feedEvent({ id: 'e2', type: 'planner_started', timestamp: 2, message: 'Planning mission' }),
      feedEvent({ id: 'e3', type: 'mission_failed', timestamp: 3 }),
    ];

    const events = buildMissionEvents({
      missionId: MISSION_ID,
      liveEvents,
      detail: {
        status: 'failed',
        error: 'Planner Agent request failed on attempt 88',
        startedAt: 1,
        completedAt: 3,
        input: { prompt: 'Create an Agent run business' },
      },
    });

    const conversation = events.filter((event) => CONVERSATION_EVENT_TYPES.has(String(event.type)));
    expect(conversation.map((event) => event.type)).toEqual([
      'user',
      'mission_started',
      'planner_started',
      'mission_failed',
    ]);

    const timeline = events.filter((event) => TIMELINE_EVENT_TYPES.has(String(event.type)));
    expect(timeline.map((event) => event.type)).toEqual(['mission_started', 'mission_failed']);
  });

  it('keeps the planner updates short when the planner retries a lot', () => {
    const liveEvents: FeedEvent[] = [
      feedEvent({ id: 'e1', type: 'planner_started', timestamp: 1, message: 'Planning mission' }),
      ...Array.from({ length: 8 }, (_, index) => feedEvent({
        id: `p${index}`,
        type: 'planner_progress',
        timestamp: index + 2,
        message: `Planning update (attempt ${index + 1})`,
      })),
    ];

    const turns = buildTranscript(liveEvents);
    const plannerTurn = turns.find((turn) => turn.label === 'Planner');
    const progressLines = plannerTurn?.lines.filter((line) => line.type === 'planner_progress') ?? [];

    expect(progressLines).toHaveLength(4);
    expect(progressLines[0]?.text).toContain('5 earlier planning updates');
  });

  it('reports the model usage of a mission instead of listing every call', () => {
    const liveEvents: FeedEvent[] = [
      feedEvent({ id: 'c1', type: 'cost_estimate', timestamp: 1, metadata: { tokensUsed: 100, estimatedCost: 0.01 } }),
      feedEvent({ id: 'c2', type: 'cost_estimate', timestamp: 2, metadata: { tokensUsed: 250, estimatedCost: 0.02 } }),
    ];

    expect(summarizeModelUsage(liveEvents)).toEqual({ calls: 2, tokens: 350, estimatedCost: 0.03 });
  });
});
