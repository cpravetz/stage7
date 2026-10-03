/**
 * Persistence for Dynamic Trigger Records — the "run this every Monday" a user
 * asks for in chat.
 *
 * `DynamicTriggerRecord` has existed in the ADK since it was written
 * (`adk/triggers.ts`), with a comment explaining that a scheduler and an event
 * monitor would evaluate these records alongside the blueprint triggers. It also
 * had no storage, no evaluator and no caller. This module gives it storage, so
 * an adaptation survives a restart instead of living only as long as the
 * process that created it.
 *
 * The persistence shape deliberately mirrors `routes/skill-store.ts`: the
 * Mongo-backed artifacts service first, a local JSON mirror unconditionally, and
 * reads that prefer the remote copy but fall back to the local one. That is what
 * keeps the store from becoming a hard dependency of the scheduler — in local
 * development the artifacts service being down is the common case, not the
 * exception.
 */

import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';
import type { DynamicTriggerRecord } from '../adk/triggers';

const ARTIFACTS_URL = process.env.ARTIFACTS_URL || '';
const LOCAL_STORE_DIR = process.env.TRIGGER_STORE_DIR || '/tmp/stage7-triggers';
const REMOTE_TIMEOUT_MS = Number(process.env.TRIGGER_STORE_TIMEOUT_MS) || 3000;

/** Collection the records live in, alongside `watches` and the skill stores. */
export const TRIGGER_RECORDS_COLLECTION = 'trigger-records';

const SAFE_NAME = /^[A-Za-z0-9._-]{1,128}$/;

function isValidName(value: unknown): value is string {
  return typeof value === 'string' && SAFE_NAME.test(value) && !value.startsWith('.');
}

/**
 * Collection and key arrive over HTTP, so the same traversal guard the skill
 * store uses applies here: a path-safe regex is not enough on its own.
 */
function resolveLocal(recordId: string): string | null {
  if (!isValidName(recordId)) return null;
  const root = path.resolve(LOCAL_STORE_DIR);
  const resolved = path.resolve(path.join(LOCAL_STORE_DIR, `${recordId}.json`));
  return resolved.startsWith(root + path.sep) ? resolved : null;
}

function writeLocal(target: string, record: DynamicTriggerRecord): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(record, null, 2), 'utf8');
}

function readLocal(target: string): DynamicTriggerRecord | null {
  try {
    if (!fs.existsSync(target)) return null;
    const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !isValidName((parsed as any).id)) return null;
    return parsed as DynamicTriggerRecord;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Corrupt local trigger record');
    return null;
  }
}

/**
 * Forward to the artifacts service's document API. Returns null on any failure
 * so callers fall back to local files rather than failing a scheduler tick
 * because persistence is briefly unavailable.
 */
async function artifactsFetch(route: string, init?: RequestInit): Promise<any | null> {
  if (!ARTIFACTS_URL) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
  try {
    const res = await fetch(`${ARTIFACTS_URL}/api/artifacts/documents${route}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      ...init,
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), route }, 'Artifacts persistence unavailable');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The persisted envelope, so a record round-trips through the documents API. */
interface Envelope {
  collection: string;
  data: DynamicTriggerRecord;
  persistedAt: string;
  source: string;
  updatedAt: string;
}

function envelope(record: DynamicTriggerRecord): Envelope {
  return {
    collection: TRIGGER_RECORDS_COLLECTION,
    data: record,
    persistedAt: record.updatedAt,
    source: 'trigger-store',
    updatedAt: record.updatedAt,
  };
}

export interface TriggerRecordStore {
  list(): Promise<DynamicTriggerRecord[]>;
  get(recordId: string): Promise<DynamicTriggerRecord | null>;
  save(record: DynamicTriggerRecord): Promise<DynamicTriggerRecord>;
  remove(recordId: string): Promise<boolean>;
}

/**
 * The store used in production. `loadAll` reads the whole collection through the
 * search endpoint, which is how the scheduler sees every adaptation at boot
 * without having to know the ids in advance.
 */
export function createTriggerRecordStore(): TriggerRecordStore {
  async function readRecord(recordId: string): Promise<DynamicTriggerRecord | null> {
    const remote = await artifactsFetch(`/${encodeURIComponent(`${TRIGGER_RECORDS_COLLECTION}:${recordId}`)}`);
    const remoteData = remote?.data?.data;
    if (remoteData && typeof remoteData === 'object' && isValidName(remoteData.id)) {
      return remoteData as DynamicTriggerRecord;
    }
    const target = resolveLocal(recordId);
    return target ? readLocal(target) : null;
  }

  return {
    async list(): Promise<DynamicTriggerRecord[]> {
      const result = await artifactsFetch('/search', {
        method: 'POST',
        body: JSON.stringify({ collection: TRIGGER_RECORDS_COLLECTION, limit: 1000 }),
      });
      const records: DynamicTriggerRecord[] = [];
      const seen = new Set<string>();

      for (const doc of (result?.documents as any[]) ?? []) {
        // The documents API nests under `data`; accept a flat record too so a
        // hand-written document is not silently skipped.
        const candidate = doc?.data?.data ?? doc?.data ?? doc;
        if (candidate && isValidName(candidate.id) && candidate.kind) {
          records.push(candidate as DynamicTriggerRecord);
          seen.add(candidate.id);
        }
      }

      // A local-only record is still a record: the remote read may have failed
      // entirely, and dropping adaptations because persistence was down would be
      // the most confusing possible outcome.
      const localFiles = (() => {
        try {
          return fs.existsSync(LOCAL_STORE_DIR) ? fs.readdirSync(LOCAL_STORE_DIR) : [];
        } catch (err) {
          logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Failed to list local trigger records');
          return [] as string[];
        }
      })();
      for (const file of localFiles) {
        if (!file.endsWith('.json')) continue;
        const record = readLocal(path.join(LOCAL_STORE_DIR, file));
        if (record && !seen.has(record.id)) records.push(record);
      }

      return records;
    },

    async get(recordId: string): Promise<DynamicTriggerRecord | null> {
      if (!isValidName(recordId)) return null;
      return readRecord(recordId);
    },

    async save(record: DynamicTriggerRecord): Promise<DynamicTriggerRecord> {
      await artifactsFetch(`/${encodeURIComponent(`${TRIGGER_RECORDS_COLLECTION}:${record.id}`)}`, {
        method: 'PUT',
        body: JSON.stringify({ data: envelope(record) }),
      });
      const target = resolveLocal(record.id);
      if (target) {
        try {
          writeLocal(target, record);
        } catch (err) {
          logger.error({ err: err instanceof Error ? err.message : String(err) }, 'Local trigger record write failed');
        }
      }
      return record;
    },

    async remove(recordId: string): Promise<boolean> {
      if (!isValidName(recordId)) return false;
      await artifactsFetch(`/${encodeURIComponent(`${TRIGGER_RECORDS_COLLECTION}:${recordId}`)}`, {
        method: 'DELETE',
      });
      const target = resolveLocal(recordId);
      if (target) {
        try {
          if (fs.existsSync(target)) fs.unlinkSync(target);
        } catch (err) {
          logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Local trigger record delete failed');
        }
      }
      return true;
    },
  };
}

/** In-memory store for tests and for running without any persistence at all. */
export function createInMemoryTriggerRecordStore(seed: DynamicTriggerRecord[] = []): TriggerRecordStore {
  const records = new Map<string, DynamicTriggerRecord>();
  for (const record of seed) records.set(record.id, record);
  return {
    async list() {
      return [...records.values()];
    },
    async get(recordId) {
      return records.get(recordId) ?? null;
    },
    async save(record) {
      records.set(record.id, record);
      return record;
    },
    async remove(recordId) {
      return records.delete(recordId);
    },
  };
}