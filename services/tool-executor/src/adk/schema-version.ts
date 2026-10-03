/**
 * Schema evolution (ADK_OVERVIEW.md §5, ADK_DEVELOPER_GUIDE.md §5).
 *
 * A deployed folder is an immutable blueprint, so there is no migration script
 * to run when a Skill's record shape changes. Instead:
 *
 *   write path — `stampForWrite` adds `_schemaVersion` and `_updatedAt`
 *   read path  — `hydrateDocument` chains the collection's adapters forward,
 *                in memory, only for documents older than the current version
 *
 * Adapters are chained rather than replaced so a v1 document still passes
 * through every intermediate step on its way to v4. That is what makes an
 * upgrade safe when it lands two versions after the last deployment.
 */

export const SCHEMA_VERSION_KEY = '_schemaVersion';
export const UPDATED_AT_KEY = '_updatedAt';

export interface HydrationAdapter {
  /** The version this step produces from the one below it. */
  toVersion: number;
  /** Upgrades one document in place and returns it. Must be pure. */
  upgrade(doc: Record<string, any>): Record<string, any>;
}

export interface HydrationRegistry {
  adapters: Map<string, HydrationAdapter[]>;
}

export function createHydrationRegistry(): HydrationRegistry {
  return { adapters: new Map() };
}

/**
 * Registers the adapter chain for one collection.
 *
 * The chain is sorted by `toVersion`, so call order at registration does not
 * matter and a future adapter can be appended without touching what is there.
 */
export function registerAdapters(
  registry: HydrationRegistry,
  collectionName: string,
  adapters: HydrationAdapter[],
): void {
  if (adapters.length === 0) return;
  const existing = registry.adapters.get(collectionName) ?? [];
  const merged = [...existing, ...adapters].sort((a, b) => a.toVersion - b.toVersion);

  const seen = new Set<number>();
  for (const adapter of merged) {
    if (seen.has(adapter.toVersion)) {
      throw new Error(
        `Duplicate hydration adapter for "${collectionName}" at version ${adapter.toVersion}; adapters are chained by version`,
      );
    }
    seen.add(adapter.toVersion);
  }

  registry.adapters.set(collectionName, merged);
}

export function getAdapters(registry: HydrationRegistry, collectionName: string): HydrationAdapter[] {
  return registry.adapters.get(collectionName) ?? [];
}

export function readSchemaVersion(doc: Record<string, any> | null | undefined): number {
  const raw = doc?.[SCHEMA_VERSION_KEY];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 1;
}

/**
 * Stamps a document for the write path.
 *
 * `_schemaVersion` is set to the Skill's own declared version, not to
 * "latest", so a record can be traced back to the blueprint that wrote it. This
 * runs on every record of every write: a Skill that forgets to call it still
 * gets a correctly stamped document.
 */
export function stampForWrite<T extends Record<string, any>>(doc: T, schemaVersion: number): T & Record<string, any> {
  return {
    ...doc,
    [SCHEMA_VERSION_KEY]: schemaVersion,
    [UPDATED_AT_KEY]: new Date().toISOString(),
  };
}

export interface HydrationOutcome<T = any> {
  doc: T;
  /** The version the document was stored at. */
  from: number;
  /** The version it is now, after chaining. */
  to: number;
  /** True when at least one adapter ran. */
  migrated: boolean;
}

/**
 * Brings a stored document up to `currentVersion` in memory.
 *
 * Nothing is written back: the transform is lazy, so an old record is upgraded
 * every time it is read and the database is untouched until a Skill saves it.
 * A document stored at or above `currentVersion` is returned untouched — a
 * blueprint that has been rolled back must not corrupt records written by a
 * newer one.
 */
export function hydrateDocument<T extends Record<string, any>>(
  doc: T,
  adapters: HydrationAdapter[],
  currentVersion: number,
): HydrationOutcome<T> {
  const from = readSchemaVersion(doc);
  if (from >= currentVersion || adapters.length === 0) {
    return { doc, from, to: from, migrated: false };
  }

  let current: Record<string, any> = { ...doc };
  let version = from;

  for (const adapter of adapters) {
    if (adapter.toVersion <= version) continue;
    if (adapter.toVersion > currentVersion) break;
    current = adapter.upgrade(current);
    version = adapter.toVersion;
  }

  return { doc: { ...current, [SCHEMA_VERSION_KEY]: version } as unknown as T, from, to: version, migrated: version > from };
}

export function hydrateAll<T extends Record<string, any>>(
  docs: T[],
  adapters: HydrationAdapter[],
  currentVersion: number,
): T[] {
  if (adapters.length === 0) return docs;
  return docs.map((doc) => hydrateDocument(doc, adapters, currentVersion).doc);
}
