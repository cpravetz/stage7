import { buildCatalog } from '../adk/bootstrap';
import { allBlueprintSkills } from '../adk/types';
import { validateCatalog } from '../adk/catalog';
import { altersData, announcedEventIds, emittedEventIds, hasDeclaredEvent } from '../adk/events';
import type { Tool } from '../types';

/**
 * The event graph, checked as a whole rather than Skill by Skill.
 *
 * Each of these assertions is a way the graph silently rotted before:
 *
 * - A `mutating` Skill with no declared event announces only "this run finished".
 * - A trigger naming prose matches nothing, so the edge never fires.
 * - A trigger naming an id nothing publishes looks like a working integration
 *   and fires nothing at all — worse than prose, because it reassures you.
 * - A Skill subscribing to its own event re-runs itself, which for a
 *   `represent` Skill performs the action twice.
 *
 * These run against the real shipped catalogue, so a regression goes red here
 * instead of quietly shipping.
 */
describe('the shipped event graph is sound', () => {
  const catalog = buildCatalog();
  const blueprints = catalog.order.flatMap((id) => {
    const blueprint = catalog.blueprints.get(id);
    return blueprint ? [blueprint] : [];
  });
  const skills = blueprints.flatMap((blueprint) =>
    [...blueprint.canonicalSkills, ...blueprint.lowerOrderTools].map(
      (tool) => ({ assistantId: blueprint.manifest.id, tool }),
    ),
  );

  const reports = validateCatalog(catalog);
  const findingsOf = (rule: string) =>
    reports.flatMap((report) => report.findings.filter((finding) => finding.rule === rule));

  it('reports no event-graph findings at all', () => {
    const graphRules = [
      'matchable-event-trigger',
      'emit-event-declared',
      'unresolvable-event-id',
      'self-subscribing-event-trigger',
      'declared-emit-event-unreachable',
      'redundant-delegation-subscription',
    ];
    const offenders = graphRules.flatMap((rule) =>
      findingsOf(rule).map((finding) => `${finding.rule}: ${finding.assistantId} ${finding.location}`),
    );
    expect(offenders).toEqual([]);
  });

  it('has every mutating Skill announce a business event, not just "finished"', () => {
    const vague = skills
      .filter(({ tool }) => altersData(tool) && !hasDeclaredEvent(tool))
      .map(({ assistantId, tool }) => `${assistantId}/${tool.id}`);
    expect(vague).toEqual([]);
  });

  it('resolves every subscription to an id some Skill actually publishes', () => {
    const published = new Set<string>();
    for (const { assistantId, tool } of skills) {
      for (const id of emittedEventIds(tool, assistantId)) published.add(id);
      // A Skill's own failure and abort are announced too, so they are subscribable.
      published.add(`${assistantId}.${tool.id}.failed`);
      published.add(`${assistantId}.${tool.id}.aborted`);
    }

    const dangling: string[] = [];
    for (const { assistantId, tool } of skills) {
      for (const trigger of tool.triggers ?? []) {
        if (trigger.kind !== 'event') continue;
        const eventId = (trigger.eventId ?? '').trim();
        if (eventId === '') continue;
        // An external producer is a declared contract, not a Skill in this repo.
        if (trigger.externalEvent) continue;
        if (!published.has(eventId)) dangling.push(`${assistantId}/${tool.id} -> ${eventId}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it('has no Skill subscribed to the event it announces itself', () => {
    const selfEdges: string[] = [];
    for (const { assistantId, tool } of skills) {
      const own = emittedEventIds(tool, assistantId);
      for (const trigger of tool.triggers ?? []) {
        if (trigger.kind === 'event' && own.includes((trigger.eventId ?? '').trim())) {
          selfEdges.push(`${assistantId}/${tool.id}`);
        }
      }
    }
    expect(selfEdges).toEqual([]);
  });

  it('has no Skill both delegated to and subscribed to the same producer', () => {
    // The delegation already runs this Skill, so the subscription runs it again.
    // For a `represent` Skill that means allocating resources or sending a
    // message twice for one upstream run.
    const published = new Map<string, Tool[]>();
    for (const { assistantId, tool } of skills) {
      for (const eventId of emittedEventIds(tool, assistantId)) {
        published.set(eventId, [...(published.get(eventId) ?? []), tool]);
      }
    }
    const lower = (skill: Tool): string[] => {
      const value = (skill.manifest as Record<string, unknown>).lowerOrderTools;
      return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
    };

    const doubled: string[] = [];
    for (const { tool } of skills) {
      for (const trigger of tool.triggers ?? []) {
        if (trigger.kind !== 'event' || trigger.externalEvent) continue;
        const eventId = (trigger.eventId ?? '').trim();
        if (eventId === '') continue;
        for (const producer of published.get(eventId) ?? []) {
          if (producer.id === tool.id) continue;
          if (lower(producer).includes(tool.id) || lower(tool).includes(producer.id)) {
            doubled.push(`${tool.id} <- ${producer.id}`);
          }
        }
      }
    }
    expect(doubled).toEqual([]);
  });

  it('has no two Skills announce the same outcome id', () => {
    // Overlapping ids would double-fire any subscriber: the delegation runs one
    // Skill, which announces the id, and the orchestrator announces the same id for
    // the same change.
    const owners = new Map<string, string[]>();
    for (const { assistantId, tool } of skills) {
      for (const eventId of emittedEventIds(tool, assistantId)) {
        owners.set(eventId, [...(owners.get(eventId) ?? []), `${assistantId}/${tool.id}`]);
      }
    }
    const shared = [...owners.entries()].filter(([, who]) => who.length > 1).map(([id, who]) => `${id} <- ${who.join(', ')}`);
    expect(shared).toEqual([]);
  });

  it('has a Skill that declares several outcomes narrow them per run', () => {
    // A Skill declaring several ids and never narrowing them announces changes it
    // did not make on every run, which is the failure that motivated per-run
    // reporting in the first place.
    const offenders: string[] = [];
    for (const { assistantId, tool } of skills) {
      const declared = emittedEventIds(tool, assistantId);
      if (declared.length < 2) continue;
      const result = announcedEventIds(tool, assistantId, { emittedEvents: declared.slice(1) });
      // Reporting a subset must narrow to exactly what was reported; if a Skill
      // declaring four outcomes cannot say "only the second one", the declaration
      // is unsafe and every run announces changes it did not make.
      if (result.ids.length !== declared.length - 1) offenders.push(`${assistantId}/${tool.id}`);
    }
    expect(offenders).toEqual([]);
  });

  it('uses a distinct event id per Skill within an assistant', () => {
    // Two Skills in one assistant announcing the same id cannot be told apart by
    // a subscriber, so one of the two changes becomes invisible.
    const byAssistant = new Map<string, Map<string, string[]>>();
    for (const { assistantId, tool } of skills) {
      if (!altersData(tool) || !hasDeclaredEvent(tool)) continue;
      const eventId = emittedEventIds(tool, assistantId).join(',');
      const ids = byAssistant.get(assistantId) ?? new Map<string, string[]>();
      ids.set(eventId, [...(ids.get(eventId) ?? []), tool.id]);
      byAssistant.set(assistantId, ids);
    }

    const collisions: string[] = [];
    for (const [assistantId, ids] of byAssistant) {
      for (const [eventId, owners] of ids) {
        if (owners.length > 1) collisions.push(`${assistantId}: ${eventId} <- ${owners.join(', ')}`);
      }
    }
    expect(collisions).toEqual([]);
  });
});
