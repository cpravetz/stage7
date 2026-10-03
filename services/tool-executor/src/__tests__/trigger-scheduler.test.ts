import { TriggerScheduler } from '../services/TriggerScheduler';
import { createInMemoryTriggerRecordStore, type TriggerRecordStore } from '../services/TriggerRecordStore';
import { buildScheduledTriggers, dueTriggers, isDue, scheduleStatus } from '../adk/trigger-schedule';
import { createDynamicTriggerRecord, type DynamicTriggerRecord } from '../adk/triggers';
import type { AssistantWorkflow } from '../adk/workflow-common';
import type { SkillTrigger, Tool, ToolExecution } from '../types';
import { ConfirmationRequiredError, CredentialRequiredError } from '../types';

/**
 * These tests are the reason the scheduler can be trusted to replace the watch
 * loop. The two properties that matter are: a due trigger fires exactly once per
 * period, and a gated Skill stops for a human no matter who started the run.
 */

function tool(overrides: Partial<Tool> & { id: string }): Tool {
  return {
    name: overrides.id,
    description: '',
    type: 'code',
    manifest: {},
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } as Tool;
}

function scheduleTrigger(cron: string, defaultInput?: Record<string, unknown>): SkillTrigger {
  return { kind: 'schedule', cron, ...(defaultInput ? { defaultInput } : {}) };
}

function workflow(assistant: string, skills: Tool[]): AssistantWorkflow {
  return { assistant, productObject: 'thing', flow: '', skills };
}

function execution(overrides: Partial<ToolExecution> = {}): ToolExecution {
  return {
    executionId: 'exec_1',
    toolId: 'x',
    input: {},
    status: 'completed',
    startedAt: new Date(0),
    ...overrides,
  } as ToolExecution;
}

/**
 * Monday 5 October 2026, five minutes after the 09:00 fire every fixture uses.
 *
 * That offset is deliberate. A scheduler that has never fired a trigger only
 * replays one whose time passed inside the catch-up window, so "due" is modelled
 * the way it actually occurs in production: the service coming up shortly after a
 * scheduled time and running the period it missed.
 */
const AT_0905 = new Date(2026, 9, 5, 9, 5, 0, 0);
const LAST_MONDAY = new Date(2026, 8, 28, 9, 5, 0, 0); // Monday 28 September 2026
const NEXT_MONDAY = new Date(2026, 9, 12, 9, 5, 0, 0); // Monday 12 October 2026

describe('buildScheduledTriggers', () => {
  it('turns a blueprint schedule trigger into a schedulable entry and reports nothing wrong', () => {
    const set = buildScheduledTriggers(
      [{ skillId: 'event-planning-budgeting', assistantId: 'event', tier: 'advise', cron: '0 9 * * 1' }],
      [],
    );
    expect(set.issues).toEqual([]);
    expect(set.triggers).toHaveLength(1);
    expect(set.triggers[0]).toMatchObject({
      key: 'blueprint:event-planning-budgeting',
      skillId: 'event-planning-budgeting',
      assistantId: 'event',
      tier: 'advise',
      source: 'blueprint',
      defaultInput: {},
    });
  });

  it('reports an unparseable cron instead of silently dropping the schedule', () => {
    const set = buildScheduledTriggers(
      [{ skillId: 'broken', assistantId: 'event', tier: 'advise', cron: 'every other tuesday' }],
      [],
    );
    expect(set.triggers).toHaveLength(0);
    expect(set.issues).toHaveLength(1);
    expect(set.issues[0].message).toContain('cannot be scheduled');
    expect(set.issues[0].skillId).toBe('broken');
  });

  it('keeps a blueprint schedule and a dynamic adaptation of the same Skill as separate runs', () => {
    const record: DynamicTriggerRecord = createDynamicTriggerRecord({
      id: 'record-1',
      skillId: 'vendor-check',
      assistantId: 'event',
      kind: { kind: 'schedule', cron: '30 9 * * 1' },
      tier: 'represent',
      now: AT_0905,
    });

    const set = buildScheduledTriggers(
      [{ skillId: 'vendor-check', assistantId: 'event', tier: 'represent', cron: '0 9 * * 1' }],
      [record],
    );

    expect(set.triggers).toHaveLength(2);
    expect(set.triggers.map((t) => t.key).sort()).toEqual([
      'blueprint:vendor-check',
      'dynamic:record-1',
    ]);
  });

  it('skips a disabled dynamic record', () => {
    const record = createDynamicTriggerRecord({
      id: 'record-1',
      skillId: 'vendor-check',
      assistantId: 'event',
      kind: { kind: 'schedule', cron: '30 9 * * 1' },
      tier: 'represent',
      now: AT_0905,
    });
    const set = buildScheduledTriggers([], [{ ...record, enabled: false }]);
    expect(set.triggers).toHaveLength(0);
  });

  it('carries the tier forward onto an adaptation so the listing stays honest', () => {
    const record = createDynamicTriggerRecord({
      id: 'record-1',
      skillId: 'vendor-check',
      assistantId: 'event',
      kind: { kind: 'schedule', cron: '30 9 * * 1' },
      tier: 'represent',
      now: AT_0905,
    });
    const set = buildScheduledTriggers([], [record]);
    expect(set.triggers[0].tier).toBe('represent');
    const [status] = scheduleStatus(set.triggers, AT_0905, new Map());
    expect(status.requiresApproval).toBe(true);
  });
});

describe('isDue', () => {
  const [trigger] = buildScheduledTriggers(
    [{ skillId: 'weekly', assistantId: 'event', tier: 'advise', cron: '0 9 * * 1' }],
    [],
  ).triggers;

  it('does not fire before the next period comes round', () => {
    // Last fired Monday 28th; it is still Tuesday, so the next Monday is ahead.
    expect(isDue(trigger, new Date(2026, 8, 29, 9, 5), LAST_MONDAY)).toBe(false);
  });

  it('fires once the period has passed since the last fire', () => {
    expect(isDue(trigger, new Date(2026, 8, 29, 9, 5), LAST_MONDAY)).toBe(false);
    expect(isDue(trigger, NEXT_MONDAY, LAST_MONDAY)).toBe(true);
  });

  it('does not fire twice inside the same period', () => {
    const first = AT_0905;
    expect(isDue(trigger, first, undefined)).toBe(true);
    // Having just fired at 09:00, a tick at 09:05 on the same Monday must be quiet.
    expect(isDue(trigger, first, new Date(2026, 9, 5, 9, 1))).toBe(false);
  });

  it('collapses several missed periods into a single run', () => {
    const due = dueTriggers(
      [trigger],
      new Date(2026, 9, 26, 9, 5), // four weeks later
      new Map([[trigger.key, LAST_MONDAY]]),
    );
    expect(due).toHaveLength(1);
  });

  it('never fires an expression that can never fire', () => {
    const [impossible] = buildScheduledTriggers(
      [{ skillId: 'nope', assistantId: 'event', tier: 'advise', cron: '0 0 30 2 *' }],
      [],
    ).triggers;
    expect(isDue(impossible, AT_0905)).toBe(false);
  });
});

type ExecuteFn = (
  tool: Tool,
  input: Record<string, unknown>,
  opts: { assistantId: string; workspaceId?: string; context?: Record<string, unknown> },
) => Promise<ToolExecution | CredentialRequiredError>;

interface Harness {
  scheduler: TriggerScheduler;
  calls: Array<{ toolId: string; input: Record<string, unknown>; assistantId: string; context?: Record<string, unknown> }>;
  store: TriggerRecordStore;
  setTools(tools: Tool[]): void;
  setNow(now: Date): void;
}

function harness(options: {
  tools: Tool[];
  workflows: AssistantWorkflow[];
  execute?: ExecuteFn;
  store?: TriggerRecordStore;
  now?: Date;
} = { tools: [], workflows: [] }): Harness {
  let tools = options.tools;
  let now = options.now ?? AT_0905;
  const calls: Harness['calls'] = [];
  const store = options.store ?? createInMemoryTriggerRecordStore();

  const scheduler = new TriggerScheduler({
    getTools: () => tools,
    getWorkflows: () => options.workflows,
    store,
    now: () => now,
    execute: async (skill, input, opts) => {
      calls.push({ toolId: skill.id, input, assistantId: opts.assistantId, ...(opts.context ? { context: opts.context } : {}) });
      return options.execute ? options.execute(skill, input, opts) : execution({ toolId: skill.id });
    },
  });

  return {
    scheduler,
    calls,
    store,
    setTools: (next) => {
      tools = next;
    },
    setNow: (next) => {
      now = next;
    },
  };
}

describe('TriggerScheduler.tick', () => {
  it('fires a due blueprint schedule through the executor, naming its assistant', async () => {
    const weekly = tool({ id: 'weekly-report', tier: 'advise', isSkill: true, triggers: [scheduleTrigger('0 9 * * 1')] });
    const { scheduler, calls } = harness({
      tools: [weekly],
      workflows: [workflow('Event', [weekly])],
    });

    const results = await scheduler.tick();

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ skillId: 'weekly-report', status: 'completed', assistantId: 'event' });
    expect(calls).toHaveLength(1);
    expect(calls[0].assistantId).toBe('event');
    expect(calls[0].context).toMatchObject({ triggeredBy: 'schedule', cron: '0 9 * * 1' });
  });

  it('passes the trigger default input through unchanged', async () => {
    const weekly = tool({
      id: 'weekly-report',
      tier: 'advise',
      isSkill: true,
      triggers: [scheduleTrigger('0 9 * * 1', { task: 'summary', window: '7d' })],
    });
    const { scheduler, calls } = harness({ tools: [weekly], workflows: [workflow('Event', [weekly])] });

    await scheduler.tick();

    expect(calls[0].input).toEqual({ task: 'summary', window: '7d' });
  });

  it('does not fire the same period twice', async () => {
    const weekly = tool({ id: 'weekly-report', tier: 'advise', isSkill: true, triggers: [scheduleTrigger('0 9 * * 1')] });
    const { scheduler, calls } = harness({ tools: [weekly], workflows: [workflow('Event', [weekly])] });

    expect(await scheduler.tick()).toHaveLength(1);
    expect(await scheduler.tick()).toHaveLength(0);
    expect(await scheduler.tick()).toHaveLength(0);
    expect(calls).toHaveLength(1);
  });

  it('fires again in the next period', async () => {
    const weekly = tool({ id: 'weekly-report', tier: 'advise', isSkill: true, triggers: [scheduleTrigger('0 9 * * 1')] });
    const { scheduler, calls, setNow } = harness({ tools: [weekly], workflows: [workflow('Event', [weekly])] });

    await scheduler.tick();
    setNow(NEXT_MONDAY);
    await scheduler.tick();

    expect(calls).toHaveLength(2);
  });

  it('never schedules a Skill that no workflow owns, because a run must name an assistant', async () => {
    const orphan = tool({ id: 'orphan', tier: 'advise', isSkill: true, triggers: [scheduleTrigger('0 9 * * 1')] });
    const { scheduler, calls } = harness({ tools: [orphan], workflows: [] });

    expect(await scheduler.tick()).toHaveLength(0);
    expect(calls).toHaveLength(0);
    expect(scheduler.list().schedules).toHaveLength(0);
  });

  it('stops for confirmation on a gated Skill and never sends confirmation itself', async () => {
    const gated = tool({ id: 'vendor-check', tier: 'represent', isSkill: true, triggers: [scheduleTrigger('0 9 * * 1')] });
    const seen: Array<Record<string, unknown>> = [];
    const { scheduler, calls } = harness({
      tools: [gated],
      workflows: [workflow('Event', [gated])],
      execute: async (skill) => {
        seen.push({ id: skill.id });
        throw new ConfirmationRequiredError(skill);
      },
    });

    const results = await scheduler.tick();

    expect(results[0].status).toBe('confirmation-required');
    expect(results[0].error).toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it('records a failed run instead of swallowing it', async () => {
    const flaky = tool({ id: 'flaky', tier: 'advise', isSkill: true, triggers: [scheduleTrigger('0 9 * * 1')] });
    const { scheduler } = harness({
      tools: [flaky],
      workflows: [workflow('Event', [flaky])],
      execute: async () => execution({ toolId: 'flaky', status: 'failed', error: 'upstream refused' }),
    });

    const results = await scheduler.tick();

    expect(results[0].status).toBe('failed');
    expect(results[0].error).toBe('upstream refused');
    // Still recorded as fired, so one bad period does not retry every tick.
    expect(await scheduler.tick()).toHaveLength(0);
  });

  it('records a thrown error as a failed run', async () => {
    const broken = tool({ id: 'broken', tier: 'advise', isSkill: true, triggers: [scheduleTrigger('0 9 * * 1')] });
    const { scheduler } = harness({
      tools: [broken],
      workflows: [workflow('Event', [broken])],
      execute: async () => {
        throw new Error('connection reset');
      },
    });

    const results = await scheduler.tick();
    expect(results[0]).toMatchObject({ status: 'failed', error: 'connection reset' });
  });

  it('reports a pending credential request rather than treating it as a failure', async () => {
    const external = tool({ id: 'external', tier: 'represent', isSkill: true, triggers: [scheduleTrigger('0 9 * * 1')] });
    const { scheduler } = harness({
      tools: [external],
      workflows: [workflow('Event', [external])],
      execute: async (skill) =>
        new CredentialRequiredError({
          executionId: 'exec_pw',
          toolId: skill.id,
          toolName: skill.name,
          missingCredentials: [{ key: 'token', source: { envVar: 'TOKEN' } }],
          message: 'token is required',
        }),
    });

    const results = await scheduler.tick();
    expect(results[0]).toMatchObject({
      status: 'pending-credentials',
      executionId: 'exec_pw',
      error: 'token is required',
    });
  });

  it('skips a schedule whose Skill has since been unregistered', async () => {
    const weekly = tool({ id: 'weekly-report', tier: 'advise', isSkill: true, triggers: [scheduleTrigger('0 9 * * 1')] });
    const { scheduler, setTools } = harness({ tools: [weekly], workflows: [workflow('Event', [weekly])] });

    // A record persisted yesterday can outlive the Skill it adapted.
    await scheduler.scheduleSkill({
      skillId: 'weekly-report',
      assistantId: 'event',
      cron: '0 9 * * 1',
      id: 'record-1',
    });
    setTools([]);

    // The blueprint trigger disappears with the Skill, because the plan is derived
    // from the registry. The persisted adaptation survives that and is reported as
    // skipped rather than silently vanishing: a user who asked for a schedule that
    // has quietly stopped running deserves to see it listed.
    const results = await scheduler.tick();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      key: 'dynamic:record-1',
      status: 'skipped',
      reason: 'skill is no longer registered',
    });
  });
});

describe('TriggerScheduler adaptations', () => {
  it('creates a persisted record that then becomes schedulable', async () => {
    const weekly = tool({ id: 'weekly-report', tier: 'advise', isSkill: true, triggers: [{ kind: 'user', phrase_examples: ['weekly'] }] });
    const { scheduler, calls, store } = harness({ tools: [weekly], workflows: [workflow('Event', [weekly])] });

    expect(scheduler.list().schedules).toHaveLength(0);

    const record = await scheduler.scheduleSkill({
      skillId: 'weekly-report',
      assistantId: 'event',
      cron: '0 9 * * 1',
      skillInput: { window: '7d' },
      origin: 'chat: "run this every Monday"',
    });

    expect(record.enabled).toBe(true);
    expect(record.tier).toBe('advise');
    expect(await scheduler.listRecords()).toHaveLength(1);

    const results = await scheduler.tick();
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('completed');
    expect(calls[0].input).toEqual({ window: '7d' });
    // The record outlives this scheduler instance.
    expect(await store.get(record.id)).not.toBeNull();
  });

  it('refuses to schedule an unknown Skill', async () => {
    const { scheduler } = harness({ tools: [], workflows: [] });
    await expect(
      scheduler.scheduleSkill({ skillId: 'nope', assistantId: 'event', cron: '0 9 * * 1' }),
    ).rejects.toThrow('Unknown skill: nope');
  });

  it('stops scheduling a paused record and resumes it unchanged', async () => {
    const weekly = tool({ id: 'weekly-report', tier: 'advise', isSkill: true });
    const { scheduler, setNow, calls } = harness({ tools: [weekly], workflows: [workflow('Event', [weekly])] });

    const record = await scheduler.scheduleSkill({ skillId: 'weekly-report', assistantId: 'event', cron: '0 9 * * 1' });
    await scheduler.tick();
    expect(calls).toHaveLength(1);

    await scheduler.setRecordEnabled(record.id, false);
    setNow(NEXT_MONDAY);
    expect(await scheduler.tick()).toHaveLength(0);

    await scheduler.setRecordEnabled(record.id, true);
    expect(await scheduler.tick()).toHaveLength(1);
    expect(calls).toHaveLength(2);
  });

  it('deletes a record so it stops firing', async () => {
    const weekly = tool({ id: 'weekly-report', tier: 'advise', isSkill: true });
    const { scheduler } = harness({ tools: [weekly], workflows: [workflow('Event', [weekly])] });

    const record = await scheduler.scheduleSkill({ skillId: 'weekly-report', assistantId: 'event', cron: '0 9 * * 1' });
    expect(await scheduler.deleteRecord(record.id)).toBe(true);
    expect(await scheduler.listRecords()).toHaveLength(0);
    expect(await scheduler.tick()).toHaveLength(0);
    expect(await scheduler.deleteRecord(record.id)).toBe(false);
  });

  it('reports a schedule whose cron cannot be parsed instead of dropping it silently', async () => {
    const weekly = tool({ id: 'weekly-report', tier: 'advise', isSkill: true, triggers: [scheduleTrigger('soon-ish')] });
    const { scheduler } = harness({ tools: [weekly], workflows: [workflow('Event', [weekly])] });

    const { schedules, issues } = scheduler.list();
    expect(schedules).toHaveLength(0);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('cannot be scheduled');
  });
});

describe('TriggerScheduler lifecycle', () => {
  it('does not run two ticks at once', async () => {
    const weekly = tool({ id: 'weekly-report', tier: 'advise', isSkill: true, triggers: [scheduleTrigger('0 9 * * 1')] });
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;

    const scheduler = new TriggerScheduler({
      getTools: () => [weekly],
      getWorkflows: () => [workflow('Event', [weekly])],
      now: () => AT_0905,
      execute: async () => {
        calls += 1;
        await gate;
        return execution({ toolId: 'weekly-report' });
      },
    });

    const first = scheduler.tick();
    const second = await scheduler.tick();
    expect(second).toHaveLength(0);

    (release as unknown as () => void)();
    expect(await first).toHaveLength(1);
    expect(calls).toBe(1);
  });

  it('keeps a bounded run history for diagnostics', async () => {
    const minutely = tool({ id: 'minutely', tier: 'advise', isSkill: true, triggers: [scheduleTrigger('* * * * *')] });
    const { scheduler, setNow } = harness({ tools: [minutely], workflows: [workflow('Event', [minutely])] });

    for (let i = 0; i < 210; i += 1) {
      setNow(new Date(AT_0905.getTime() + i * 60_000));
      await scheduler.tick();
    }

    expect(scheduler.recentRuns(1000)).toHaveLength(200);
    expect(scheduler.recentRuns(5)).toHaveLength(5);
  });

  it('starts and stops on demand and reports whether it is running', () => {
    const scheduler = new TriggerScheduler({
      getTools: () => [],
      getWorkflows: () => [],
      execute: async () => execution(),
    });

    expect(scheduler.isRunning()).toBe(false);
    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);
    scheduler.start(); // idempotent
    expect(scheduler.isRunning()).toBe(true);
    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });
});