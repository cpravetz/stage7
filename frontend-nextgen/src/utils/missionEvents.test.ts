import { describe, it, expect } from 'vitest';

import type { FeedEvent } from '../stores/feedStore';
import { normalize } from '../stores/feedStore';
import {
  buildMissionEvents,
  buildTranscript,
  CONVERSATION_EVENT_TYPES,
  friendlyMissionError,
  summarizeModelUsage,
  TIMELINE_EVENT_TYPES,
} from './missionEvents';
import { derivePhaseStatus, getTaskStatus } from '../pages/MissionRoom';

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

describe('friendlyMissionError', () => {
  it('explains an Agent Runtime planning timeout without exposing the internal route', () => {
    expect(friendlyMissionError(
      'Agent Runtime API /missions/Oct30-2/agents/agent-Oct30-2-planner failed (500): Request timed out after 1860000ms',
    )).toBe('Mission agent request timed out after 31 minute(s). The planner did not finish generating a plan.');
  });

  it('explains when no eligible model provider is available', () => {
    expect(friendlyMissionError(
      'Agent Runtime API /missions/Oct30-2/agents/agent-Oct30-2-planner failed (500): MODEL_SELECTION_EXHAUSTED: Every eligible model was attempted or unavailable.',
    )).toBe('Planning stopped because no eligible LLM provider was available. Restore or configure an eligible provider, then retry.');
  });

  it('explains when model routing detects a repeated candidate', () => {
    expect(friendlyMissionError(
      'Agent Runtime API /missions/Oct30-2/agents/agent-Oct30-2-planner failed (500): Brain model routing made no progress after 2 retry requests.',
    )).toBe('Planning stopped because the Brain model router repeated a candidate without advancing. Check model-provider availability before retrying.');
  });
});

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

  it('shows planner, phase, task, and incomplete milestones in the timeline', () => {
    const liveEvents: FeedEvent[] = [
      feedEvent({ id: 'e1', type: 'mission_started', timestamp: 1 }),
      feedEvent({ id: 'e2', type: 'planner_started', timestamp: 2 }),
      feedEvent({ id: 'e3', type: 'plan_generated', timestamp: 3 }),
      feedEvent({ id: 'e4', type: 'phase_started', timestamp: 4, metadata: { phaseId: 'phase-1' } }),
      feedEvent({ id: 'e5', type: 'task_started', timestamp: 5, metadata: { phaseId: 'phase-1', taskId: 'task-1' } }),
      feedEvent({ id: 'e6', type: 'task_failed', timestamp: 6, metadata: { phaseId: 'phase-1', taskId: 'task-1' } }),
      feedEvent({ id: 'e7', type: 'mission_incomplete', timestamp: 7, metadata: { reason: 'The deliverable is missing.' } }),
    ];
    const events = buildMissionEvents({
      missionId: MISSION_ID,
      liveEvents,
      detail: {
        status: 'incomplete',
        startedAt: 1,
        completedAt: 7,
        output: { outputs: { gaps: ['The deliverable is missing.'] } },
      },
    });

    const timeline = events.filter((event) => TIMELINE_EVENT_TYPES.has(String(event.type)));
    expect(timeline.map((event) => event.type)).toEqual([
      'mission_started',
      'planner_started',
      'plan_generated',
      'phase_started',
      'task_started',
      'task_failed',
      'mission_incomplete',
    ]);
  });

  it('derives an incomplete outcome and reason from persisted mission state', () => {
    const events = buildMissionEvents({
      missionId: MISSION_ID,
      liveEvents: [],
      detail: {
        status: 'incomplete',
        startedAt: 1,
        completedAt: 3,
        output: { outputs: { gaps: ['A planned task did not complete.'] } },
      },
    });

    const incomplete = events.find((event) => event.type === 'mission_incomplete');
    expect(incomplete?.message).toBe('Mission incomplete: A planned task did not complete. — retry this mission to address the unmet requirements.');
  });
});

describe('mission conversation', () => {
  it('attributes task output to the named Agent and preserves multiline content', () => {
    const taskEvent = feedEvent({
      id: 'named-agent-output',
      type: 'task_completed',
      message: 'Task completed: Send message',
      metadata: {
        taskTitle: 'Send message',
        agentId: 'agent-mission-sms-specialist',
        agentName: 'SMS Specialist Agent',
        agentRole: 'sms-specialist',
        output: 'To: 347-882-8389\nMessage: Watson, come here.',
      },
    });

    const transcript = buildTranscript([taskEvent]);

    expect(transcript[0]?.label).toBe('SMS Specialist Agent');
    expect(transcript[0]?.lines.at(-1)?.text).toBe('To: 347-882-8389\nMessage: Watson, come here.');
  });

  it('explains plan amendments and attributes review updates to the reviewer Agent', () => {
    const amended = normalize({
      type: 'phase_plan_amended',
      missionId: MISSION_ID,
      timestamp: 3,
      data: {
        phaseId: 'phase-1',
        gaps: ['SMTP configuration is missing'],
        task: { title: 'Collect email service configuration' },
        agentId: 'agent-mission-phase-reviewer',
        agentName: 'Phase Reviewer Agent',
        agentRole: 'phase-reviewer',
      },
    });

    expect(amended?.message).toContain('Phase review found: SMTP configuration is missing.');
    expect(amended?.message).toContain('Follow-up task added: Collect email service configuration.');
    expect(buildTranscript([amended!])[0]?.label).toBe('Phase Reviewer Agent');
  });

  it('shows completed task output as text and preserves plan amendment gaps', () => {
    const completedTask = feedEvent({
      id: 'task-output',
      type: 'task_completed',
      message: 'Task completed: Draft message',
      timestamp: 2,
      metadata: {
        phaseId: 'phase-1',
        taskId: 'task-1',
        taskTitle: 'Draft message',
        output: 'Subject: Welcome\nBody: Your account is ready.',
      },
    });
    const transcript = buildTranscript([completedTask]);
    expect(transcript[0]?.lines).toContainEqual({
      kind: 'text',
      type: 'task_output',
      text: 'Subject: Welcome\nBody: Your account is ready.',
    });

    const amended = normalize({
      type: 'phase_plan_amended',
      missionId: MISSION_ID,
      timestamp: 3,
      data: { phaseId: 'phase-1', gaps: ['Delivery API unavailable'] },
    });
    expect(amended?.message).toContain('Delivery API unavailable');
  });

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
    expect(timeline.map((event) => event.type)).toEqual(['mission_started', 'planner_started', 'mission_failed']);
  });

  it('keeps the planner updates short when the planner retries a lot', () => {
    const liveEvents: FeedEvent[] = [
      feedEvent({ id: 'e1', type: 'planner_started', timestamp: 1, message: 'Planning mission' }),
      ...Array.from({ length: 18 }, (_, index) => feedEvent({
        id: `p${index}`,
        type: 'planner_progress',
        timestamp: index + 2,
        message: `Planning update (attempt ${index + 1})`,
      })),
    ];

    const turns = buildTranscript(liveEvents);
    const plannerTurn = turns.find((turn) => turn.label === 'Planner');
    const progressLines = plannerTurn?.lines.filter((line) => line.type === 'planner_progress') ?? [];

    expect(progressLines).toHaveLength(13);
    expect(progressLines[0]?.text).toContain('6 earlier planning updates');
  });

  it('reports the model usage of a mission instead of listing every call', () => {
    const liveEvents: FeedEvent[] = [
      feedEvent({ id: 'c1', type: 'cost_estimate', timestamp: 1, metadata: { tokensUsed: 100, estimatedCost: 0.01 } }),
      feedEvent({ id: 'c2', type: 'cost_estimate', timestamp: 2, metadata: { tokensUsed: 250, estimatedCost: 0.02 } }),
    ];

    expect(summarizeModelUsage(liveEvents)).toEqual({ calls: 2, tokens: 350, estimatedCost: 0.03 });
  });
});

describe('task status', () => {
  const task = { id: 'task-1', title: 'Do the thing' } as { id: string; title: string };
  const phaseId = 'phase-1';

  it('marks a task in progress when task_started is the latest event', () => {
    const events: FeedEvent[] = [
      feedEvent({ id: 'e1', type: 'task_started', timestamp: 1, metadata: { phaseId, taskId: 'task-1' } }),
    ];
    expect(getTaskStatus(task as any, phaseId, [], events)).toBe('in_progress');
  });

  it('marks a task completed when task_completed is the latest event', () => {
    const events: FeedEvent[] = [
      feedEvent({ id: 'e1', type: 'task_started', timestamp: 1, metadata: { phaseId, taskId: 'task-1' } }),
      feedEvent({ id: 'e2', type: 'task_completed', timestamp: 2, metadata: { phaseId, taskId: 'task-1' } }),
    ];
    expect(getTaskStatus(task as any, phaseId, [], events)).toBe('completed');
  });

  it('marks a task running when the mission is running and the plan task is in_progress', () => {
    const events: FeedEvent[] = [];
    const planTask = { ...task, status: 'in_progress' } as any;
    expect(getTaskStatus(planTask, phaseId, [], events, 'running')).toBe('in_progress');
  });

  it('marks a task pending when the mission is running but the task never started', () => {
    const events: FeedEvent[] = [];
    const planTask = { ...task, status: 'pending' } as any;
    expect(getTaskStatus(planTask, phaseId, [], events, 'running')).toBe('pending');
  });

  it('derives a phase running when any task is running', () => {
    const phase = { id: 'phase-1', name: 'Build', tasks: [task] } as any;
    const events: FeedEvent[] = [
      feedEvent({ id: 'e1', type: 'task_started', timestamp: 1, metadata: { phaseId, taskId: 'task-1' } }),
    ];
    expect(derivePhaseStatus(phase, [], events, 'running')).toBe('running');
  });
});
