/**
 * Events — what a Skill announces when it has changed something.
 *
 * The rule this module exists to make enforceable is simple: every Skill that
 * saves or alters data emits an event when it completes. Until now the ADK had
 * the plumbing (`manifest.emitEvent`, read by `ToolExecutor` on every successful
 * run, with a matcher for downstream subscribers) and nothing to drive it —
 * `grep emitEvent` across `src/assistants` returned nothing, so
 * `dispatchUpstreamEvents` returned on its first line every time and 57 event
 * subscriptions pointed at prose the matcher deliberately refuses to interpret.
 *
 * Three things fix that without asking 55 `represent` Skills to declare an id they
 * have no reason to care about:
 *
 * 1. **A derived completion event.** Every successful execution announces
 *    `<assistantId>.<skillId>.completed`. A Skill that wants a *different*,
 *    business-meaningful event (a contract booked, an invoice paid) declares
 *    `emitEvent` and the declared id wins. The derived id is deterministic, so a
 *    subscriber can name it without reading the emitter's source.
 * 2. **A durable log.** Emitted events are appended to a Mongo-backed collection
 *    so there is an audit trail of what changed and an event trigger can be
 *    reasoned about after the fact, not just dispatched in-process.
 * 3. **Ids derived from what a run actually wrote**, for Skills that curated none.
 *    See the data-change section below — that one is a change of mind, recorded
 *    here because the reasoning it replaced looks convincing and is wrong.
 *
 * The event is emitted by the executor, not by the Skill's `ctx.store.save`. An
 * earlier version justified that by the burden of instrumenting ~60 `save` call
 * sites, but the burden lands on the wrong side of the ledger: it asks every author
 * to remember an id for a change the runtime already knows about, and the Skills
 * with the most call sites are not the ones that got declarations. Of 50 Skills that
 * write instance data, 36 declared nothing, so their changes reached nobody.
 *
 * The store is now instrumented — once, in one place — and only for Skills that
 * declared no id, so no curated announcement is disturbed.
 */

import type { Tool } from '../types';
import type { GovernanceTier } from './types';

/** Suffix on the derived id of a run that simply finished. */
export const COMPLETION_EVENT_SUFFIX = '.completed';

/** Separator between the namespace parts of a derived event id. */
const NAMESPACE_SEPARATOR = '.';

/**
 * The event a run announces when its Skill did not choose one.
 *
 * Namespaced by assistant so two Skills with the same id in different assistants
 * cannot collide, and suffixed because it says exactly one thing: this run
 * finished. A business-meaningful event (a contract being booked) is a different
 * event and has to be declared.
 */
export function completionEventId(assistantId: string, skillId: string): string {
  const assistant = (assistantId || 'unassigned').trim().toLowerCase();
  return [assistant, skillId].join(NAMESPACE_SEPARATOR) + COMPLETION_EVENT_SUFFIX;
}

/**
 * The event a tool announces on completion.
 *
 * A declared `emitEvent` wins over the derived id: an author who picked an id
 * meant business consumers to key off it, and quietly replacing it with the
 * completion id would break exactly the subscribers the declaration was added for.
 */
export function emittedEventIds(tool: Tool, assistantId?: string): string[] {
  const declared = declaredEventIds(tool);
  return declared.length > 0 ? declared : [completionEventId(assistantId ?? '', tool.id)];
}

/**
 * The first id a run announces.
 *
 * Prefer {@link emittedEventIds}: a Skill that declares several outcomes announces
 * all of them. This exists for call sites that need a single label — a log line, a
 * cycle-guard key — where taking the first is enough.
 */
export function emittedEventId(tool: Tool, assistantId?: string): string {
  return emittedEventIds(tool, assistantId)[0]!;
}

/**
 * The Skill's own result, unwrapped from the executor's envelope.
 *
 * A code Skill's execution output is `{ output: "<json string>", exitCode, ... }`,
 * so anything the handler returned — its `status`, its `emittedEvents` — is a level
 * down inside a string. Reading the envelope directly finds nothing, which is how
 * dry-run suppression and per-run outcome narrowing both silently no-op'd on every
 * real Skill while passing against hand-built fixtures.
 */
function handlerResult(output: unknown): Record<string, unknown> | undefined {
  if (typeof output !== 'object' || output === null) return undefined;
  const envelope = output as Record<string, unknown>;
  if (typeof envelope.output !== 'string') return envelope;
  try {
    const parsed: unknown = JSON.parse(envelope.output);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    // Not JSON, so there is no handler result to read. The envelope's own fields
    // are still meaningful.
    return undefined;
  }
}

/** Reads an `emitEvent` declaration that may be one id or a list of them. */
function normalizeEmitEvent(value: unknown): string[] {
  const one = (entry: unknown): string[] =>
    typeof entry === 'string' && entry.trim() !== '' ? [entry.trim()] : [];
  return Array.isArray(value) ? value.flatMap(one) : one(value);
}

/**
 * Every event id this Skill declares, in declaration order.
 *
 * A Skill may declare more than one because a run may change more than one thing.
 * Restricting a Skill to a single id would mean a coordinator that books an
 * appointment *and* sends the confirmation announces only the first, and every
 * subscriber of the second is left watching a change it was never told about.
 */
export function declaredEventIds(tool: Tool): string[] {
  const manifest = (tool.manifest as Record<string, unknown> | undefined) ?? {};
  return [
    ...normalizeEmitEvent(manifest.emitEvent),
    // Tolerate a top-level field so a hand-authored tool works without nesting.
    ...normalizeEmitEvent((tool as unknown as Record<string, unknown>).emitEvent),
  ];
}

/** Whether the declared id is one the author chose, rather than a derived completion. */
export function hasDeclaredEvent(tool: Tool): boolean {
  return declaredEventIds(tool).length > 0;
}

/**
 * Where an event's id came from: one the Skill's author chose, or one derived
 * from the Skill's identity.
 *
 * This is deliberately separate from `status`. "Declared" and "derived" describe
 * provenance; "completed", "failed", and "aborted" describe what happened to the
 * run. Collapsing them into one field is what made a failed run's event look
 * like a business change.
 */
/*
 * Data-change events, derived from what a run actually wrote.
 *
 * Declaration answers "which business outcome does this Skill announce?", and it
 * is the only answer available for an effect nobody can observe from inside the
 * process — `marketing-email` sends a request and returns; nothing in the runtime
 * ever holds the message that was sent. That is why every authored `emitEvent` in
 * the catalogue sits on an external effect, and why none of them can be taken away.
 *
 * A data change is the opposite case. `ctx.store.save` and `ctx.store.delete` are
 * the only paths by which a Skill changes instance data, so they are a place where
 * the truth is already known, and deriving from them is both more complete and more
 * honest than asking the author to remember. Measured against the built catalogue,
 * 36 Skills that write instance data declare no event at all, so their changes are
 * announced to nobody today; a skill that updates five records in a loop announces
 * a single event, and no completion-time declaration can capture a deletion or
 * announce five records separately without the author enumerating them by hand.
 *
 * So the two sources are kept, not merged. A declared id is authoritative for its
 * own run and suppresses derived ids for that run, so a Skill that curated an id
 * never ends up with two ids announcing one change. A Skill that declared nothing
 * gets ids derived from its writes.
 */

/** What a run did to one stored record. */
export type WriteOperation = 'created' | 'updated' | 'deleted';

/** One write a run performed, as reported by the Skill's own store. */
export interface StoreWrite {
  /** The stored key, which carries its collection as its leading segment. */
  key: string;
  operation: WriteOperation;
}

/** Sidecar name the Skill process writes its write log to on exit. */
export const STORE_WRITE_LOG = '.stage7-store-writes.json';

/**
 * Keys that hold a Skill's own bookkeeping, not domain data.
 *
 * Empty in the shipped catalogue, and deliberately so: the six keys that look like
 * internal state — `trackingPath`, `profilePath`, `outPath`, `rankPath`, `listPath`,
 * `cdsPath` — turned out to hold the domain records themselves (`ctx.store.save(
 * 'outPath', template)`, `'profilePath', profile`), so dropping them by name would
 * have silenced six of the data changes this mechanism exists to announce. They are
 * mapped in {@link COLLECTION_NOUNS} instead.
 *
 * The set stays because the distinction is real and an author will eventually need
 * it: a key that records how far a run got, rather than what it produced, has no
 * business in the event stream.
 */
const INTERNAL_STORE_KEYS: ReadonlySet<string> = new Set();

/**
 * Collection -> the domain noun its events should be named after.
 *
 * The convention in {@link storeWriteEventId} produces a faithful but mechanical id
 * (`<assistant>.applications-tracking.updated`) for a key whose leading segment
 * cannot be told apart from its sub-key. That is usually good enough — the id is
 * deterministic, so a subscriber can name it — but an author who cares about the
 * wording can pin it here instead, which is what the entries below do for the
 * collections whose ids are already depended on by prose triggers, and for the
 * `*Path` keys whose names would otherwise be announced verbatim.
 */
const COLLECTION_NOUNS: Readonly<Record<string, string>> = {
  'applications/tracking': 'application',
  'listings/default': 'listing',
  leads: 'lead',
  screening: 'screening',
  templates: 'template',
  tickets: 'ticket',
  // Misleadingly named domain records; see INTERNAL_STORE_KEYS.
  cdsPath: 'clinical-decision',
  listPath: 'job-listing',
  outPath: 'template',
  profilePath: 'profile',
  rankPath: 'ranking',
  trackingPath: 'pipeline-tracking',
};

/** Reduce a stored key to one safe dotted-id segment. */
function keyToSegment(key: string): string {
  return String(key)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The event a run announces for one write it performed.
 *
 * Namespaced by assistant so two assistants writing a same-named collection cannot
 * collide, and suffixed with the operation so a create and an update of the same
 * record are distinguishable to a subscriber — the distinction a single
 * per-completion event cannot make.
 */
export function storeWriteEventId(assistantId: string, write: StoreWrite): string {
  const assistant = (assistantId || 'unassigned').trim().toLowerCase();
  const key = String(write.key ?? '');
  const noun = COLLECTION_NOUNS[key] ?? COLLECTION_NOUNS[key.split('/')[0] ?? ''] ?? keyToSegment(key);
  return [assistant, noun, write.operation].filter(Boolean).join(NAMESPACE_SEPARATOR);
}

/**
 * The distinct events a run's writes deserve, in first-write order.
 *
 * Two writes to the same key collapse to one event: the second says nothing the
 * first did not, and a run that saves the same record on every retry should not
 * announce it repeatedly. Writes to different keys stay separate.
 */
export function storeWriteEventIds(assistantId: string, writes: StoreWrite[] | undefined): string[] {
  if (!Array.isArray(writes)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const write of writes) {
    if (!write || typeof write.key !== 'string' || !write.key) continue;
    if (INTERNAL_STORE_KEYS.has(write.key)) continue;
    if (!['created', 'updated', 'deleted'].includes(write.operation)) continue;
    const id = storeWriteEventId(assistantId, write);
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export type EventKind = 'declared' | 'derived';

/** What happened to the run that produced this event. */
export type RunStatus = 'completed' | 'failed' | 'aborted';

export interface SkillEvent {
  /** Fully qualified event id, e.g. `event.vendor-contract-management.completed`. */
  id: string;
  kind: EventKind;
  status: RunStatus;
  assistantId: string;
  skillId: string;
  skillName: string;
  tier: GovernanceTier;
  executionId?: string;
  workspaceId?: string;
  emittedAt: string;
  /** The run's output, so a downstream Skill does not have to re-read the workspace. */
  data?: unknown;
  /** Why the run failed or was aborted, for `status: 'failed' | 'aborted'`. */
  error?: string;
}

/**
 * Whether this Skill is expected to change something.
 *
 * Used by governance to decide when an undeclared event is worth flagging. A
 * `represent` Skill acts on external systems, so a change it makes is invisible
 * to anything that is not listening for an event.
 *
 * The tier is the whole signal, because it is the question the tier already
 * answers: `represent` acts on the world, `advise` and `aid` present analysis and
 * recommendations. In the shipped catalogue the two agree exactly — all 55 gated
 * Skills are `represent`, and no `advise` or `aid` Skill is gated.
 *
 * An earlier version also read "has an external `system`" as mutating, as a proxy
 * for "calls out to something". That flagged six read-only analyzers
 * (`content-performance-seo`, `education-learner-insight`,
 * `marketing-market-research`, `marketing-audience-insights`,
 * `product-data-analysis-user`, `songwriter_genre_trend_evaluator`) as Skills that
 * change data. Telling a content analytics reader to declare what it changed
 * would have produced six invented business events, which is worse than the false
 * positive it was meant to catch.
 */
export function altersData(tool: Tool): boolean {
  return tool.tier === 'represent';
}

/**
 * Build the events for a completed run: one per declared outcome.
 *
 * A run that changes three things announces three events, all sharing the
 * `executionId` so a consumer can see they came from one run. Limiting a Skill to
 * one announcement would not be a simplification — it would mean asserting that the
 * outcomes it did not announce did not happen.
 *
 * Pass `derivedOnly` for a run that finished but changed nothing — a dry run, where
 * the Skill deliberately stopped short of the change its declared ids name.
 */
export function buildCompletionEvents(options: {
  tool: Tool;
  assistantId: string;
  executionId?: string;
  workspaceId?: string;
  data?: unknown;
  emittedAt: Date;
  derivedOnly?: boolean;
  /**
   * Ids to announce. Omit it to announce every outcome the Skill declares; pass an
   * empty array when the run produced none, which is different from omitting it.
   */
  ids?: string[];
}): SkillEvent[] {
  const { tool } = options;
  const declared = options.derivedOnly ? [] : declaredEventIds(tool);
  // An explicitly empty set still means the run finished, so completion is announced
  // even when no outcome was.
  const ids =
    !options.derivedOnly && options.ids !== undefined
      ? options.ids.length > 0
        ? options.ids
        : [completionEventId(options.assistantId, tool.id)]
      : declared.length > 0
        ? declared
        : [completionEventId(options.assistantId, tool.id)];

  return ids.map((id) => ({
    id,
    kind: declared.length > 0 ? ('declared' as const) : ('derived' as const),
    status: 'completed' as const,
    assistantId: options.assistantId,
    skillId: tool.id,
    skillName: tool.name,
    tier: (tool.tier ?? 'advise') as GovernanceTier,
    ...(options.executionId ? { executionId: options.executionId } : {}),
    ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
    emittedAt: options.emittedAt.toISOString(),
    ...(options.data !== undefined ? { data: options.data } : {}),
  }));
}

/**
 * Which of a Skill's declared outcomes a run actually produced.
 *
 * A Skill declares the set of outcomes it is *capable* of; the run reports which
 * of them it performed. Without this, a Skill that branches would have to pick:
 * declare one id and silently drop the rest, or declare them all and announce
 * changes that did not happen. Neither is acceptable, so the declaration is a
 * capability set and the run narrows it.
 *
 * A reported id that was not declared is dropped rather than published. That keeps
 * the event graph statically checkable — `unresolvable-event-id` can still prove
 * every subscription has a producer — instead of letting a typo in a handler
 * become a real-but-unreachable event.
 */
export function announcedEventIds(
  tool: Tool,
  assistantId: string,
  output: unknown,
  writes?: StoreWrite[],
): { ids: string[]; rejected: string[] } {
  const declared = declaredEventIds(tool);
  const result = handlerResult(output);
  const reportedRaw = result?.emittedEvents ?? (output as Record<string, unknown> | undefined)?.emittedEvents;
  const reported = normalizeEmitEvent(reportedRaw);

  if (declared.length === 0) {
    // A Skill that curated no id is the case the write log exists for: its changes
    // are real but nothing announces them, and they are already known rather than
    // guessed. A declared id would have suppressed this run's ids (see below), so
    // the two never double-emit for the same change.
    const derived = storeWriteEventIds(assistantId, writes);
    if (derived.length === 0) return { ids: reported, rejected: [] };
    return { ids: [...new Set([...reported, ...derived])], rejected: [] };
  }
  // Absent and explicitly empty are different statements. A Skill that says
  // nothing is announcing every outcome it declared; a Skill that says
  // `emittedEvents: []` is stating that this run changed nothing, which is what a
  // list or audit-only run means.
  if (reportedRaw === undefined) return { ids: declared, rejected: [] };

  const accepted = reported.filter((id) => declared.includes(id));
  return { ids: accepted, rejected: reported.filter((id) => !declared.includes(id)) };
}

/**
 * Whether a run finished without performing the change its declared ids name.
 *
 * A dry run is the common case: the Skill assembles, reports, and stops short of
 * sending or writing. Announcing `finance.report.published` then would tell
 * subscribers a board report was delivered when nothing left the building.
 *
 * Both signals are checked because neither alone is sufficient. Some Skills read
 * `input.dryRun` with a default that leaves it undefined, and a Skill can also
 * decide for itself that it staged rather than sent and say so in its own output.
 */
export function isDryRun(input: Record<string, unknown> | undefined, output: unknown): boolean {
  if (input?.dryRun === true) return true;
  const envelope = typeof output === 'object' && output !== null ? (output as Record<string, unknown>) : undefined;
  const result = handlerResult(output) ?? envelope;
  if (result?.dryRun === true) return true;
  const status = result?.status;
  return typeof status === 'string' && status.trim().toLowerCase() === 'dry-run';
}

/**
 * The event a run announces when it did not complete.
 *
 * A failure that is invisible is the failure that gets retried forever, so a run
 * that attempted and broke announces `failed`, and a run that never got to
 * attempt anything — awaiting confirmation, missing credentials, invalid config —
 * announces `aborted`. Downstream Skills and operators subscribe to these exactly
 * as they subscribe to a completion.
 *
 * The id is derived from the Skill's identity rather than from its declared
 * `emitEvent`, and deliberately so. A declared id names a business event
 * ("contract booked"); the run that would have booked it failed, so that event did
 * not happen and must not be published under its name. The failure is a fact
 * about the Skill, so it gets the Skill's own namespace.
 */
export function outcomeEventId(assistantId: string, skillId: string, status: Exclude<RunStatus, 'completed'>): string {
  const assistant = (assistantId || 'unassigned').trim().toLowerCase();
  return [assistant, skillId, status].join(NAMESPACE_SEPARATOR);
}

/** Build the `failed` or `aborted` event for a run that did not complete. */
export function buildOutcomeEvent(options: {
  tool: Tool;
  assistantId: string;
  status: Exclude<RunStatus, 'completed'>;
  error: string;
  executionId?: string;
  workspaceId?: string;
  emittedAt: Date;
}): SkillEvent {
  const { tool } = options;
  return {
    id: outcomeEventId(options.assistantId, tool.id, options.status),
    kind: 'derived',
    status: options.status,
    assistantId: options.assistantId,
    skillId: tool.id,
    skillName: tool.name,
    tier: (tool.tier ?? 'advise') as GovernanceTier,
    ...(options.executionId ? { executionId: options.executionId } : {}),
    ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
    emittedAt: options.emittedAt.toISOString(),
    error: options.error,
  };
}

/**
 * Whether a subscriber's `eventId` matches an emitted event.
 *
 * Exact match only. The prose `on:` text some Skills carry describes an intent
 * ("when a vendor is booked") that cannot be matched against an emit without
 * guessing, and guessing here would mean firing Skills nobody verified.
 */
export function subscriberMatches(subscriberEventId: string | undefined, eventId: string): boolean {
  if (typeof subscriberEventId !== 'string') return false;
  const wanted = subscriberEventId.trim();
  return wanted !== '' && wanted === eventId;
}