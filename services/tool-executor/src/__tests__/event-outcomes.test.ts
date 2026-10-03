import { ToolExecutor } from '../services/ToolExecutor';
import { createInMemoryEventLog, type EventLog } from '../services/EventLog';
import { buildCatalog } from '../adk/bootstrap';
import { allBlueprintSkills } from '../adk/types';
import { announcedEventIds, declaredEventIds, isDryRun } from '../adk/events';
import type { Tool } from '../types';

/**
 * A run announces every outcome it produced, not one per run.
 *
 * The first version of this pipeline took a single `emitEvent` string, so a Skill
 * that changed two things announced one of them — which is not a simplification,
 * it asserts the other change did not happen. These tests pin the corrected
 * behaviour, including the hard case: a Skill whose possible outcomes differ per
 * run must not announce all of them every time.
 */

const catalog = buildCatalog();
const realSkills = catalog.order.flatMap((id) => {
  const blueprint = catalog.blueprints.get(id);
  return blueprint ? allBlueprintSkills(blueprint) : [];
});
const assistantOf = (toolId: string): string => {
  const id = catalog.order.find((candidate) => {
    const blueprint = catalog.blueprints.get(candidate);
    return blueprint ? allBlueprintSkills(blueprint).some((tool) => tool.id === toolId) : false;
  });
  return catalog.blueprints.get(id!)!.manifest.id;
};

function executorFor(tools: Tool[], log: EventLog, run: (tool: Tool) => unknown): ToolExecutor {
  const executor = new ToolExecutor(new Map(tools.map((tool) => [tool.id, tool])), undefined, log);
  const stub = executor as unknown as Record<string, unknown>;
  stub.validateConfigSchema = () => null;
  stub.resolveCredentials = async () => ({ resolved: {}, sources: {} });
  stub.ensureWorkspace = () => ({ workspaceId: 'ws-probe', workflow: undefined });
  stub.dispatch = async (tool: Tool) => run(tool);
  stub.nestedExecutorCallback = () => async () => ({ success: true });
  return executor;
}

async function eventsEventually(log: { recent: (limit?: number) => Promise<unknown[]> }, count: number) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const found = await log.recent();
    if (found.length >= count) return found;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return log.recent();
}

const gated = realSkills.find(
  (tool) =>
    tool.confirmBeforeSend === true &&
    typeof (tool.manifest as Record<string, unknown>)?.emitEvent === 'string',
)!;
const confirmed = { confirmation: true };

describe('a Skill may announce more than one outcome', () => {
  it('reads a list of declared ids', () => {
    expect(declaredEventIds(gated)).toEqual([
      (gated.manifest as Record<string, unknown>).emitEvent,
    ]);
  });

  it('publishes one event per declared outcome for a single run', async () => {
    const skill = {
      ...gated,
      manifest: { ...gated.manifest, emitEvent: ['a.b.created', 'a.b.confirmed'] },
    } as Tool;
    const log = createInMemoryEventLog();

    await executorFor([skill], log, () => ({ ok: true })).execute(skill, confirmed, {
      assistantId: assistantOf(gated.id),
    });
    const events = await eventsEventually(log, 2);

    expect(events.map((event) => (event as { id: string }).id).sort()).toEqual([
      'a.b.confirmed',
      'a.b.created',
    ]);
    // One run, so the two announcements are correlatable.
    const ids = new Set(events.map((event) => (event as { executionId?: string }).executionId));
    expect(ids.size).toBe(1);
  });

  it('runs a shared subscriber once even when two outcomes match it', async () => {
    const subscriber = {
      id: 'shared-subscriber',
      name: 'Shared',
      description: 'Subscribes to two outcomes of one run',
      type: 'custom',
      manifest: { sourceCode: 'module.exports = {};' },
      triggers: [
        { kind: 'event', on: 'one', eventId: 'a.b.created' },
        { kind: 'event', on: 'two', eventId: 'a.b.confirmed' },
      ],
    } as unknown as Tool;
    const skill = {
      ...gated,
      manifest: { ...gated.manifest, emitEvent: ['a.b.created', 'a.b.confirmed'] },
    } as Tool;

    let runs = 0;
    const log = createInMemoryEventLog();
    const executor = executorFor([skill, subscriber], log, () => ({ ok: true }));
    (executor as unknown as Record<string, unknown>).nestedExecutorCallback = () => async () => {
      runs += 1;
      return { success: true };
    };

    await executor.execute(skill, confirmed, { assistantId: assistantOf(gated.id) });
    await eventsEventually(log, 2);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(runs).toBe(1);
  });
});

describe('a branching Skill announces only what it did', () => {
  it('narrows the declared set to the outcomes the run reports', () => {
    const skill = {
      ...gated,
      manifest: { ...gated.manifest, emitEvent: ['x.created', 'x.updated', 'x.dispatched'] },
    } as Tool;

    expect(announcedEventIds(skill, 'x', { emittedEvents: ['x.created'] }).ids).toEqual(['x.created']);
    // Nothing reported means every declared outcome happened, which is the
    // single-outcome Skill's existing behaviour.
    expect(announcedEventIds(skill, 'x', { status: 'ok' }).ids).toEqual([
      'x.created',
      'x.updated',
      'x.dispatched',
    ]);
  });

  it('drops an outcome the Skill never declared', () => {
    const skill = { ...gated, manifest: { ...gated.manifest, emitEvent: ['x.created'] } } as Tool;
    const result = announcedEventIds(skill, 'x', { emittedEvents: ['x.created', 'x.typo'] });

    // Publishing the undeclared one would create a real event nothing can be
    // validated against, and no subscriber could be proven to reach it.
    expect(result.ids).toEqual(['x.created']);
    expect(result.rejected).toEqual(['x.typo']);
  });

  it('does not announce a business event when the run lists without changing', async () => {
    const skill = {
      ...gated,
      manifest: { ...gated.manifest, emitEvent: ['x.created', 'x.dispatched'] },
    } as Tool;
    const log = createInMemoryEventLog();

    await executorFor([skill], log, () => ({ emittedEvents: [], workOrders: [] })).execute(
      skill,
      confirmed,
      { assistantId: assistantOf(gated.id) },
    );
    const events = await eventsEventually(log, 1);
    const ids = events.map((event) => (event as { id: string }).id);

    expect(ids).not.toContain('x.created');
    expect(ids).not.toContain('x.dispatched');
    expect(ids).toContain(`${assistantOf(gated.id)}.${gated.id}.completed`);
  });

  it('reports exactly the operation it performed, on the real branching Skills', () => {
    const dispatcher = realSkills.find((tool) => tool.id === 'hotel-housekeeping-manager')!;
    const ids = declaredEventIds(dispatcher);

    expect(ids).toEqual(
      expect.arrayContaining([
        'hotel.housekeeping.task_created',
        'hotel.housekeeping.work_dispatched',
      ]),
    );
    // A create must not announce a dispatch.
    expect(announcedEventIds(dispatcher, 'hotel', { emittedEvents: ['hotel.housekeeping.task_created'] }).ids).toEqual([
      'hotel.housekeeping.task_created',
    ]);
  });
});

describe('a dry run announces that it ran, not that it changed anything', () => {
  it('detects a dry run from the input or from the output', () => {
    expect(isDryRun({ dryRun: true }, { status: 'ok' })).toBe(true);
    expect(isDryRun({}, { status: 'dry-run' })).toBe(true);
    expect(isDryRun({}, { dryRun: true })).toBe(true);
    expect(isDryRun({}, { status: 'ok' })).toBe(false);
    expect(isDryRun(undefined, undefined)).toBe(false);
  });

  it('withholds the declared outcome but still announces completion', async () => {
    const skill = {
      ...gated,
      manifest: { ...gated.manifest, emitEvent: ['y.report.published'] },
    } as Tool;
    const log = createInMemoryEventLog();
    const assistantId = assistantOf(gated.id);

    // This is the `finance.report.published` case: the Skill assembled a report and
    // stopped short of delivering it, and announcing the declared id would tell
    // subscribers a board report was published when nothing left the building.
    await executorFor([skill], log, () => ({ status: 'dry-run', sent: false })).execute(
      skill,
      { ...confirmed, dryRun: true },
      { assistantId },
    );
    const ids = (await eventsEventually(log, 1)).map((event) => (event as { id: string }).id);

    expect(ids).not.toContain('y.report.published');
    expect(ids).toEqual([`${assistantId}.${skill.id}.completed`]);
  });

  it('announces the outcome on a live run of the same Skill', async () => {
    const skill = {
      ...gated,
      manifest: { ...gated.manifest, emitEvent: ['y.report.published'] },
    } as Tool;
    const log = createInMemoryEventLog();

    await executorFor([skill], log, () => ({ status: 'ok', sent: true })).execute(
      skill,
      { ...confirmed, dryRun: false },
      { assistantId: assistantOf(gated.id) },
    );
    const ids = (await eventsEventually(log, 1)).map((event) => (event as { id: string }).id);

    expect(ids).toContain('y.report.published');
  });
});
describe('the real branching Skill announces one outcome, not all of them', () => {
  const housekeeping = realSkills.find((tool) => tool.id === 'hotel-housekeeping-manager')!;

  it('declares every outcome it is capable of producing', () => {
    // All four, so the capability set is statically checkable and a subscriber can
    // name any of them ahead of the run that produces it.
    expect(declaredEventIds(housekeeping).length).toBeGreaterThanOrEqual(4);
  });

  it('reads the outcome out of the envelope a code Skill really returns', async () => {
    // The executor hands back `{ output: "<handler JSON>", exitCode, ... }`, so a
    // handler's own `emittedEvents` is a level down inside a string. Reading only
    // the envelope finds nothing and silently announces every declared outcome —
    // which is the bug this shape check exists to catch.
    const log = createInMemoryEventLog();
    const assistantId = assistantOf(housekeeping.id);
    const executor = executorFor([housekeeping], log, () => ({
      output: JSON.stringify({
        success: true,
        emittedEvents: ['hotel.housekeeping.task_created'],
        data: { operation: 'create' },
      }),
      exitCode: 0,
    }));

    await executor.execute(
      housekeeping,
      { roomId: 'room-101', confirmation: true },
      { assistantId, workspaceId: 'ws-real' },
    );
    const ids = (await eventsEventually(log, 1)).map((event) => (event as { id: string }).id);

    expect(ids).toContain('hotel.housekeeping.task_created');
    // The assertion that matters: it created a task, so it did not also announce
    // a dispatch, an assignment, and an update.
    expect(ids).not.toContain('hotel.housekeeping.work_dispatched');
    expect(ids).not.toContain('hotel.housekeeping.task_assigned');
    expect(ids).not.toContain('hotel.housekeeping.task_updated');
  });
});

describe('finance.report.published fires only when a report is actually published', () => {
  const reporting = realSkills.find((tool) => tool.id === 'reporting-data-ops')!;

  it('declares the publish outcome', () => {
    expect(declaredEventIds(reporting)).toContain('finance.report.published');
  });

  const runWith = async (handlerResult: Record<string, unknown>, input: Record<string, unknown>) => {
    const log = createInMemoryEventLog();
    const executor = executorFor([reporting], log, () => ({
      output: JSON.stringify(handlerResult),
      exitCode: 0,
    }));
    await executor.execute(reporting, { ...input, confirmation: true }, {
      assistantId: assistantOf(reporting.id),
    });
    return (await eventsEventually(log, 1)).map((event) => (event as { id: string }).id);
  };

  it('says nothing about publishing when the Skill staged a dry run', async () => {
    // This is the real result shape from `reporting-data-ops`: `dryRun` defaults to
    // true, and the handler reports `status: 'dry-run', sent: false` without ever
    // setting `dryRun` on the input.
    const ids = await runWith({ success: true, status: 'dry-run', data: { sent: false } }, {});

    expect(ids).not.toContain('finance.report.published');
    expect(ids).toContain(`${assistantOf(reporting.id)}.reporting-data-ops.completed`);
  });

  it('announces the publish on a live run that actually sent', async () => {
    const ids = await runWith(
      { success: true, status: 'ok', data: { sent: true } },
      { dryRun: false, confirmation: true },
    );

    expect(ids).toContain('finance.report.published');
  });
});

describe('no dry run announces the change it declined to make', () => {
  // Every Skill here can dry-run, and every one declares a business event. Before
  // `isDryRun` read the executor envelope instead of the handler result, all of
  // them announced their event on a run that deliberately changed nothing.
  const DRY_RUN_CAPABLE = [
    'reporting-data-ops',
    'career-application-execution',
    'budget-tracking',
    'sales-crm-sync',
    'bill-pay-rebalancing',
    'investment-market-data',
    'hr-assess-candidate',
    'pipeline-ops',
  ];

  it.each(DRY_RUN_CAPABLE)('%s withholds its event on a dry run', async (skillId) => {
    const skill = realSkills.find((tool) => tool.id === skillId)!;
    const ids = declaredEventIds(skill);
    expect(ids.length).toBeGreaterThan(0);

    const log = createInMemoryEventLog();
    const assistantId = assistantOf(skillId);
    const executor = executorFor([skill], log, () => ({
      output: JSON.stringify({ success: true, status: 'dry-run', data: { sent: false, staged: true } }),
      exitCode: 0,
    }));

    await executor.execute(skill, { confirmation: true }, { assistantId });
    const announced = (await eventsEventually(log, 1)).map((event) => (event as { id: string }).id);

    for (const id of ids) expect(announced).not.toContain(id);
    // The run still happened, and is still observable as a completion.
    expect(announced).toContain(`${assistantId}.${skill.id}.completed`);
  });
});
