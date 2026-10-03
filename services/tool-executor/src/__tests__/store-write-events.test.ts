import {
  announcedEventIds,
  declaredEventIds,
  storeWriteEventId,
  storeWriteEventIds,
  type StoreWrite,
} from '../adk/events';
import type { Tool } from '../types';

/**
 * Data changes are announced from what a run wrote, not from what its author remembered.
 *
 * A run used to announce whatever its Skill declared, so the 36 Skills that write
 * instance data without declaring an id announced nothing at all — their records
 * changed and no subscriber could hear it. `ctx.store.save` and `ctx.store.delete`
 * are the only paths to that data, so the write itself is the event.
 *
 * These tests pin the three properties that make this safe to turn on: a declared id
 * still wins and is never duplicated, a write nobody declared is announced with a
 * deterministic id, and a key that is bookkeeping stays silent.
 */

function skillWith(extra: Record<string, unknown>): Tool {
  return { id: 'demo-skill', name: 'Demo', type: 'code', tier: 'represent', ...extra } as unknown as Tool;
}

const declared = skillWith({ manifest: { emitEvent: 'career.application.created' } });
const undeclared = skillWith({});

describe('storeWriteEventId', () => {
  it('namespaces by assistant so two assistants writing one collection cannot collide', () => {
    const write: StoreWrite = { key: 'tickets', operation: 'updated' };
    expect(storeWriteEventId('career', write)).toBe('career.ticket.updated');
    expect(storeWriteEventId('support', write)).toBe('support.ticket.updated');
  });

  it('separates operations on the same record', () => {
    expect(storeWriteEventId('career', { key: 'tickets', operation: 'created' })).toBe('career.ticket.created');
    expect(storeWriteEventId('career', { key: 'tickets', operation: 'deleted' })).toBe('career.ticket.deleted');
  });

  it('reduces a key to one safe id segment', () => {
    expect(storeWriteEventId('career', { key: 'applications/tracking', operation: 'updated' }))
      .toBe('career.application.updated');
    expect(storeWriteEventId('hotel', { key: 'room_statuses', operation: 'updated' }))
      .toBe('hotel.room-statuses.updated');
  });

  it('maps a misleadingly named key to the record it actually holds', () => {
    // `ctx.store.save('outPath', template)` — the key says "path", the value is a
    // template. Announcing it verbatim would put `career.outPath.updated` in the
    // stream, which describes nothing a subscriber could act on.
    expect(storeWriteEventId('career', { key: 'outPath', operation: 'created' }))
      .toBe('career.template.created');
    expect(storeWriteEventId('career', { key: 'profilePath', operation: 'updated' }))
      .toBe('career.profile.updated');
  });

  it('falls back to the collection segment when a key is grouped under one', () => {
    expect(storeWriteEventId('career', { key: 'listings/default', operation: 'updated' }))
      .toBe('career.listing.updated');
  });
});

describe('storeWriteEventIds', () => {
  it('keeps distinct records apart', () => {
    const ids = storeWriteEventIds('career', [
      { key: 'tickets', operation: 'created' },
      { key: 'leads', operation: 'created' },
    ]);
    expect(ids).toEqual(['career.ticket.created', 'career.lead.created']);
  });

  it('collapses repeated writes to one record', () => {
    // A Skill that saves the same key on every attempt should not announce it once
    // per attempt; the second write says nothing the first did not.
    const ids = storeWriteEventIds('career', [
      { key: 'tickets', operation: 'created' },
      { key: 'tickets', operation: 'updated' },
    ]);
    expect(ids).toEqual(['career.ticket.created', 'career.ticket.updated']);
  });

  it('drops malformed entries rather than inventing events', () => {
    const ids = storeWriteEventIds('career', [
      { key: '', operation: 'updated' },
      { key: 'tickets', operation: 'archived' as unknown as StoreWrite['operation'] },
      { key: 'tickets', operation: 'updated' },
    ]);
    expect(ids).toEqual(['career.ticket.updated']);
  });

  it('returns nothing for a run that wrote nothing', () => {
    expect(storeWriteEventIds('career', undefined)).toEqual([]);
    expect(storeWriteEventIds('career', [])).toEqual([]);
  });
});

describe('announcedEventIds with a write log', () => {
  it('announces a declared id and suppresses the derived one for the same change', () => {
    // The rule that keeps this from double-emitting: curating an id is authoritative
    // for that run. A Skill must not end up with two ids announcing one record.
    const result = announcedEventIds(declared, 'career', { status: 'ok' }, [
      { key: 'applications/tracking', operation: 'updated' },
    ]);
    expect(result.ids).toEqual(['career.application.created']);
    expect(result.ids).not.toContain('career.application.updated');
  });

  it('still narrows a declared id to what the run reported', () => {
    const result = announcedEventIds(declared, 'career', { emittedEvents: [] }, [
      { key: 'tickets', operation: 'updated' },
    ]);
    expect(result.ids).toEqual([]);
  });

  it('announces an undeclared write', () => {
    const result = announcedEventIds(undeclared, 'career', { status: 'ok' }, [
      { key: 'rankPath', operation: 'updated' },
    ]);
    expect(result.ids).toEqual(['career.ranking.updated']);
  });

  it('merges reported and derived ids for an undeclared run', () => {
    const result = announcedEventIds(undeclared, 'career', { emittedEvents: ['career.report.prepared'] }, [
      { key: 'tickets', operation: 'created' },
    ]);
    expect(result.ids).toEqual(['career.report.prepared', 'career.ticket.created']);
  });

  it('does not duplicate an id a run reported and also wrote', () => {
    const result = announcedEventIds(undeclared, 'career', { emittedEvents: ['career.ticket.created'] }, [
      { key: 'tickets', operation: 'created' },
    ]);
    expect(result.ids).toEqual(['career.ticket.created']);
  });

  it('leaves an undeclared run with no writes reporting only what it reported', () => {
    expect(announcedEventIds(undeclared, 'career', { status: 'ok' }).ids).toEqual([]);
    expect(announcedEventIds(undeclared, 'career', { emittedEvents: ['career.x.done'] }).ids)
      .toEqual(['career.x.done']);
  });
});

describe('the shipped catalogue', () => {
  it('needs no declaration for a Skill that only writes data', async () => {
    // The point of the mechanism: an author is not required to know an event id for
    // a change the runtime already observed.
    const { buildCatalog } = await import('../adk/bootstrap');
    const { allBlueprintSkills } = await import('../adk/types');
    const catalog = buildCatalog();
    const writes = catalog.order.flatMap((id) => {
      const blueprint = catalog.blueprints.get(id);
      return blueprint ? allBlueprintSkills(blueprint).map((tool) => ({ tool, blueprint })) : [];
    });
    const undeclared = writes.filter(({ tool }) => declaredEventIds(tool).length === 0);
    expect(undeclared.length).toBeGreaterThan(0);
    for (const { blueprint } of undeclared) {
      const derived = storeWriteEventIds(blueprint.manifest.id, [
        { key: 'tickets', operation: 'updated' },
      ]);
      expect(derived.length).toBeGreaterThan(0);
    }
  });
});
