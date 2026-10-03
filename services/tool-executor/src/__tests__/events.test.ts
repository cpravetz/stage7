import {
  altersData,
  buildCompletionEvents,
  completionEventId,
  emittedEventId,
  emittedEventIds,
  isDryRun,
  hasDeclaredEvent,
  subscriberMatches,
} from '../adk/events';
import { createInMemoryEventLog } from '../services/EventLog';
import { ToolExecutor } from '../services/ToolExecutor';
import { declaresEmitEvent } from '../adk/validate';
import type { Tool } from '../types';

/**
 * The rule under test: every Skill that alters data announces what it did.
 *
 * Before this, `dispatchUpstreamEvents` returned on its first line for every run
 * in the repo, because no Skill declared an event — so these tests exist to fail
 * loudly if emission ever becomes conditional again.
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

const AT = new Date(2026, 9, 5, 9, 0, 0, 0);

describe('completionEventId', () => {
  it('namespaces by assistant and says the run finished', () => {
    expect(completionEventId('event', 'vendor-contract-management')).toBe(
      'event.vendor-contract-management.completed',
    );
  });

  it('normalises the assistant id so casing and spaces cannot fork an event', () => {
    expect(completionEventId('  Event ', 'x')).toBe(completionEventId('event', 'x'));
  });

  it('still produces an id when no assistant is known', () => {
    expect(completionEventId('', 'orphan')).toBe('unassigned.orphan.completed');
  });
});

describe('emittedEventId', () => {
  it('prefers a declared emitEvent over the derived id', () => {
    const declared = tool({ id: 'vendor-contract-management', manifest: { emitEvent: 'vendor.contract.booked' } });
    expect(emittedEventId(declared, 'event')).toBe('vendor.contract.booked');
    expect(hasDeclaredEvent(declared)).toBe(true);
  });

  it('derives an id when nothing is declared', () => {
    const derived = tool({ id: 'vendor-contract-management' });
    expect(emittedEventId(derived, 'event')).toBe('event.vendor-contract-management.completed');
    expect(hasDeclaredEvent(derived)).toBe(false);
  });

  it('ignores a blank declaration rather than emitting an empty event', () => {
    const blank = tool({ id: 'x', manifest: { emitEvent: '   ' } });
    expect(emittedEventId(blank, 'event')).toBe('event.x.completed');
  });

  it('accepts a top-level field for a hand-authored tool', () => {
    const handAuthored = tool({ id: 'x', emitEvent: 'legacy.event' } as Partial<Tool> & { id: string });
    expect(emittedEventId(handAuthored, 'event')).toBe('legacy.event');
  });
});

describe('altersData', () => {
  it('is true for a represent Skill, which acts on external systems', () => {
    expect(altersData(tool({ id: 'x', tier: 'represent' }))).toBe(true);
  });

  it('is false for a read-only Skill even when it calls an external system', () => {
    // The regression this rule exists to prevent: `system` was a proxy for
    // "mutating", and it flagged six read-only analyzers in the shipped
    // catalogue. Calling an analytics endpoint does not change anything.
    expect(altersData(tool({ id: 'x', tier: 'aid', manifest: { system: 'sendgrid' } }))).toBe(false);
    expect(
      altersData(tool({ id: 'x', tier: 'advise', manifest: { system: 'content_intelligence', action: 'analyze' } })),
    ).toBe(false);
  });

  it('is false for an advisory or assisting Skill', () => {
    expect(altersData(tool({ id: 'x', tier: 'advise' }))).toBe(false);
    expect(altersData(tool({ id: 'x', tier: 'aid' }))).toBe(false);
  });
});

describe('subscriberMatches', () => {
  it('matches an exact id only', () => {
    expect(subscriberMatches('event.x.completed', 'event.x.completed')).toBe(true);
    expect(subscriberMatches('event.x.completed', 'event.x.failed')).toBe(false);
    expect(subscriberMatches('event.x', 'event.x.completed')).toBe(false);
  });

  it('never matches on prose, a missing id, or whitespace', () => {
    expect(subscriberMatches('Completion of skill execution', 'event.x.completed')).toBe(false);
    expect(subscriberMatches(undefined, 'event.x.completed')).toBe(false);
    expect(subscriberMatches('   ', 'event.x.completed')).toBe(false);
  });
});

describe('buildCompletionEvent', () => {
  it('describes the run and carries its output for a downstream Skill', () => {
    const [event] = buildCompletionEvents({
      tool: tool({ id: 'vendor-check', name: 'Vendor Check', tier: 'represent' }),
      assistantId: 'event',
      executionId: 'exec_1',
      workspaceId: 'ws_1',
      data: { checked: 3 },
      emittedAt: AT,
    });

    expect(event).toEqual({
      id: 'event.vendor-check.completed',
      kind: 'derived',
      status: 'completed',
      assistantId: 'event',
      skillId: 'vendor-check',
      skillName: 'Vendor Check',
      tier: 'represent',
      executionId: 'exec_1',
      workspaceId: 'ws_1',
      emittedAt: AT.toISOString(),
      data: { checked: 3 },
    });
  });

  it('marks a declared event as declared, so a consumer can tell the two apart', () => {
    const [event] = buildCompletionEvents({
      tool: tool({ id: 'x', manifest: { emitEvent: 'vendor.booked' } }),
      assistantId: 'event',
      emittedAt: AT,
    });
    expect(event.kind).toBe('declared');
    expect(event.id).toBe('vendor.booked');
  });
});

describe('declaresEmitEvent', () => {
  it('reads the source, because the constructed Skill cannot tell a choice from a default', () => {
    expect(declaresEmitEvent("createDeclarativeCodeSkill({ id: 'x', emitEvent: 'a.b' })")).toBe(true);
    expect(declaresEmitEvent("createDeclarativeCodeSkill({ id: 'x' })")).toBe(false);
  });
});

describe('ToolExecutor event emission', () => {
  /**
   * `dispatchUpstreamEvents` is called directly here because it is the point
   * emission happens, and standing up a tool that genuinely executes is the
   * `event-dispatch.test.ts` suite's job — which exercises this same path through
   * a real sandboxed Skill.
   */
  function emitter(log: ReturnType<typeof createInMemoryEventLog>, tools: Tool[] = []) {
    const registry = new Map<string, Tool>(tools.map((entry) => [entry.id, entry]));
    const executor = new ToolExecutor(registry, undefined, log);
    const emit = (executor as unknown as {
      dispatchUpstreamEvents: (t: Tool, o: unknown, w?: string, a?: string, e?: string) => void;
    }).dispatchUpstreamEvents.bind(executor);
    // Emission is fire-and-forget, so let the queued append land before asserting.
    return async (target: Tool, output: unknown, workspaceId?: string, assistantId?: string, executionId?: string) => {
      emit(target, output, workspaceId, assistantId, executionId);
      await new Promise((resolve) => setImmediate(resolve));
    };
  }

  it('emits an event for a run that declared none', async () => {
    const log = createInMemoryEventLog();
    const emit = emitter(log);
    const writer = tool({ id: 'silent-writer', tier: 'represent' });

    await emit(writer, { wrote: 1 }, undefined, 'event');

    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]).toMatchObject({
      skillId: 'silent-writer',
      tier: 'represent',
      kind: 'derived',
    });
    expect(log.entries[0].id).toBe('event.silent-writer.completed');
  });

  it('emits the declared id when the Skill chose one', async () => {
    const log = createInMemoryEventLog();
    const emit = emitter(log);
    const booker = tool({ id: 'booker', tier: 'represent', manifest: { emitEvent: 'vendor.contract.booked' } });

    await emit(booker, {}, undefined, 'event');

    expect(log.entries[0]).toMatchObject({ id: 'vendor.contract.booked', kind: 'declared' });
  });

  it('records the execution id and workspace so the log is traceable', async () => {
    const log = createInMemoryEventLog();
    const emit = emitter(log);
    const writer = tool({ id: 'writer', tier: 'represent' });

    await emit(writer, { wrote: 1 }, 'ws_42', 'event', 'exec_42');

    expect(log.entries[0]).toMatchObject({ workspaceId: 'ws_42', executionId: 'exec_42', assistantId: 'event' });
  });
});