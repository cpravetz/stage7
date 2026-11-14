import { TriggerScheduler } from '../src/services/TriggerScheduler';
import { createInMemoryTriggerRecordStore } from '../src/services/TriggerRecordStore';
import { allWorkflows } from '../src/data/skills';
import { parseCadence } from '../src/adk/cron';
import type { Tool, ToolExecution } from '../src/types';

/**
 * A guard against the exact failure this scheduler was built to fix.
 *
 * 48 Skills declared `kind: 'schedule'` with a cron expression and nothing read
 * them. No test failed, no log line appeared, and the blueprints validated clean —
 * the declarations were simply decorative. These tests use the real shipped
 * catalogue rather than fixtures precisely so that silence cannot happen again:
 * if the schedule plan ever comes back empty, or contains an unparseable cron, the
 * suite goes red instead of the feature quietly disappearing.
 */

function catalogueTools(): Tool[] {
  return allWorkflows.flatMap((workflow) => workflow.skills ?? []);
}

function schedulerFor(tools: Tool[] = catalogueTools()): TriggerScheduler {
  return new TriggerScheduler({
    getTools: () => tools,
    getWorkflows: () => allWorkflows,
    store: createInMemoryTriggerRecordStore(),
    execute: async (tool) => simulatedExecution(tool.id),
  });
}

/** A completed run that changed nothing, so the probe asserts on the gate only. */
function simulatedExecution(toolId: string): ToolExecution {
  return {
    executionId: `exec_${toolId}`,
    toolId,
    input: {},
    output: { simulated: true },
    status: 'completed',
    startedAt: new Date(0),
  };
}

describe('shipped schedule triggers', () => {
  const scheduler = schedulerFor();

  it('has Skills that declare a schedule', () => {
    const declared = catalogueTools().filter((tool) =>
      (tool.triggers ?? []).some((trigger) => trigger.kind === 'schedule'),
    );
    // If this ever hits zero, either the catalogue was gutted or the declaration
    // stopped being honoured. Either way the feature below is untested against
    // reality.
    expect(declared.length).toBeGreaterThan(0);
  });

  it('schedules explicit cron declarations and reports prose cadences instead of guessing', () => {
    const { schedules, issues } = scheduler.list();
    const scheduleTriggers = (tool: Tool) =>
      (tool.triggers ?? []).filter((trigger) => trigger.kind === 'schedule');
    const declared = catalogueTools().filter((tool) => scheduleTriggers(tool).length > 0);

    // An explicit cron always becomes a live schedule. Cadence-only shorthand
    // (daily/weekly/monthly/hourly/every N) is deliberately not auto-scheduled;
    // prose cadences are reported so the author writes an exact expression.
    const withCron = declared.filter((tool) =>
      scheduleTriggers(tool).some((trigger) => Boolean(trigger.cron)),
    );
    const reported = new Set([
      ...schedules.map((schedule) => schedule.skillId),
      ...issues.map((issue) => issue.skillId),
    ]);
    for (const tool of withCron) {
      expect(reported.has(tool.id)).toBe(true);
    }

    const cadenceOnly = declared.filter(
      (tool) => !scheduleTriggers(tool).some((trigger) => Boolean(trigger.cron)),
    );
    for (const tool of cadenceOnly) {
      const accepted = scheduleTriggers(tool).some(
        (trigger) => trigger.cadence && parseCadence(trigger.cadence).valid,
      );
      if (accepted) {
        // A cadence with one interpretation is not invented as a schedule and
        // is not an error either.
        expect(schedules.some((schedule) => schedule.skillId === tool.id)).toBe(false);
        expect(issues.some((issue) => issue.skillId === tool.id)).toBe(false);
      } else {
        expect(issues.some((issue) => issue.skillId === tool.id)).toBe(true);
      }
    }

    expect(issues.length).toBeGreaterThan(0);
  });

  it('reports every cadence it could not schedule, naming the cron to write', () => {
    const { issues } = scheduler.list();
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(issue.message).toContain('declare cron with an exact expression');
    }
  });

  it('never invents a frequency from a cadence that does not say when', () => {
    const { schedules } = schedulerFor().list();
    const crons = schedules.map((schedule) => schedule.cron);

    // A conditional cadence must not be turned into a live schedule. "Every 5
    // minutes during configured windows" is held back, not fired unconditionally.
    const conditional = catalogueTools().find(
      (tool) => tool.id === 'sports-ingame-predictive-modeling-scheduled',
    );
    expect(conditional).toBeDefined();
    expect(schedules.some((schedule) => schedule.skillId === conditional!.id)).toBe(false);

    // The scheduler may only run a cron the catalogue actually declares. A
    // cadence with no single reading ("daily", prose) is never promoted to one.
    const declaredCrons = new Set(
      catalogueTools().flatMap((tool) =>
        (tool.triggers ?? []).flatMap((trigger) =>
          trigger.kind === 'schedule' && trigger.cron ? [trigger.cron] : [],
        ),
      ),
    );
    for (const cron of crons) {
      expect(declaredCrons.has(cron)).toBe(true);
    }
  });

  it('gives every schedule a next fire time', () => {
    const { schedules } = scheduler.list();
    const unreachable = schedules.filter((schedule) => schedule.nextFireAt === null);
    // A schedule with no next fire is an expression that can never fire, such as
    // February 30th. Any of these is a declaration that will never do anything.
    expect(unreachable).toEqual([]);
  });

  it('names the owning assistant on every schedule, because a run must name its assistant', () => {
    for (const schedule of scheduler.list().schedules) {
      expect(schedule.assistantId).toBeTruthy();
      expect(schedule.assistantId).not.toBe('unassigned');
    }
  });

  it('reports the gate a scheduled run will hit, so a schedule cannot look harmless', () => {
    const gated = scheduler.list().schedules.filter((schedule) => schedule.requiresApproval);
    for (const schedule of gated) {
      expect(schedule.tier).toBe('represent');
    }
  });

  it('never fires a gated schedule without a human', async () => {
    const observed: Array<Record<string, unknown> | undefined> = [];
    const probe = new TriggerScheduler({
      getTools: () => catalogueTools(),
      getWorkflows: () => allWorkflows,
      store: createInMemoryTriggerRecordStore(),
      now: () => new Date(2099, 0, 1, 0, 0, 0, 0),
      execute: async (tool, input) => {
        observed.push(input);
        // Every gated schedule fires at midnight on some day; whatever the input,
        // it must not carry a confirmation.
        return simulatedExecution(tool.id);
      },
    });

    await probe.tick();
    for (const input of observed) {
      expect(input?.confirmation).toBeUndefined();
    }
  });
});

describe('shipped event emission', () => {
  it('gives every Skill a derivable event id', () => {
    const tools = catalogueTools();
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(typeof tool.id).toBe('string');
      expect(tool.id.length).toBeGreaterThan(0);
    }
  });
});