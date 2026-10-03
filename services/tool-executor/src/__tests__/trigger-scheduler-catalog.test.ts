import { TriggerScheduler } from '../services/TriggerScheduler';
import { createInMemoryTriggerRecordStore } from '../services/TriggerRecordStore';
import { allWorkflows } from '../data/skills';
import type { Tool, ToolExecution } from '../types';

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

  it('schedules the unambiguous ones and reports the prose ones instead of guessing', () => {
    const { schedules, issues } = scheduler.list();
    const declared = catalogueTools().filter((tool) =>
      (tool.triggers ?? []).some((trigger) => trigger.kind === 'schedule'),
    ).length;

    expect(schedules.length + issues.length).toBe(declared);
    expect(schedules.length).toBeGreaterThan(0);
  });

  it('reports every cadence it could not schedule, naming the cron to write', () => {
    const { issues } = scheduler.list();
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(issue.message).toContain('declare cron with an exact expression');
    }
  });

  it('never invents a frequency from a cadence that does not say when', () => {
    // "Every 5 minutes during configured windows" is conditional. Scheduling it
    // every five minutes unconditionally would fire a Skill the author meant to
    // hold back, so it has to be reported rather than run.
    const { schedules } = schedulerFor().list();
    const crons = schedules.map((schedule) => schedule.cron);
    expect(crons).not.toContain('*/5 * * * *');
    // "daily" does not say when in the day, so it is not a schedule either.
    expect(crons).not.toContain('0 0 * * *');
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