/**
 * Durable execution records for tool-executor.
 *
 * Stores execution lifecycle + results keyed by a stable execution/idempotency ID
 * so callers can retrieve status after lost responses/restarts and so repeated
 * executes with the same key do not duplicate side effects.
 *
 * Persistence mirrors TriggerRecordStore/EventLog: artifacts service first, local
 * JSON mirror always, reads prefer remote but fall back to local. Local mirror is
 * required for restart survival in dev/test and when artifacts is unavailable.
 */

import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';
import type { ExecutionRecord } from '../types';

const ARTIFACTS_URL = process.env.ARTIFACTS_URL || '';
function localStoreDir(): string { return process.env.EXECUTION_RECORD_DIR || '/tmp/stage7-executions'; }
const REMOTE_TIMEOUT_MS = Number(process.env.EXECUTION_RECORD_TIMEOUT_MS) || 3000;

export const EXECUTION_RECORDS_COLLECTION = 'tool-executions';
const SAFE_ID = /^[A-Za-z0-9._:-]{1,200}$/;

function isValidId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value) && !value.includes('..');
}

function resolveLocal(recordId: string): string | null {
  if (!isValidId(recordId)) return null;
  const root = path.resolve(localStoreDir());
  const resolved = path.resolve(path.join(localStoreDir(), `${encodeURIComponent(recordId)}.json`));
  return resolved.startsWith(root + path.sep) ? resolved : null;
}

function writeLocal(target: string, record: ExecutionRecord): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2), 'utf8');
  fs.renameSync(tmp, target);
}

function readLocal(target: string): ExecutionRecord | null {
  try {
    if (!fs.existsSync(target)) return null;
    return JSON.parse(fs.readFileSync(target, 'utf8')) as ExecutionRecord;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), target }, 'Corrupt local execution record');
    return null;
  }
}

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
    logger.warn({ err: err instanceof Error ? err.message : String(err), route }, 'Execution record persistence unavailable');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function envelope(record: ExecutionRecord) {
  return {
    collection: EXECUTION_RECORDS_COLLECTION,
    data: record,
    persistedAt: new Date().toISOString(),
    source: 'execution-record-store',
    updatedAt: record.updatedAt,
  };
}

export interface ExecutionRecordStore {
  get(executionId: string): Promise<ExecutionRecord | null>;
  save(record: ExecutionRecord): Promise<ExecutionRecord>;
  remove(executionId: string): Promise<boolean>;
}

export function createExecutionRecordStore(): ExecutionRecordStore {
  return {
    async get(executionId: string): Promise<ExecutionRecord | null> {
      if (!isValidId(executionId)) return null;
      const remote = await artifactsFetch(`/${encodeURIComponent(`${EXECUTION_RECORDS_COLLECTION}:${executionId}`)}`);
      const remoteData = remote?.data?.data ?? remote?.data;
      if (remoteData && typeof remoteData.executionId === 'string') return remoteData as ExecutionRecord;
      const target = resolveLocal(executionId);
      return target ? readLocal(target) : null;
    },

    async save(record: ExecutionRecord): Promise<ExecutionRecord> {
      const target = resolveLocal(record.executionId);
      if (target) {
        try { writeLocal(target, record); } catch (err) {
          logger.warn({ err: err instanceof Error ? err.message : String(err), executionId: record.executionId }, 'Local execution record write failed');
        }
      }
      const docId = `${EXECUTION_RECORDS_COLLECTION}:${record.executionId}`;
      const existing = await artifactsFetch(`/${encodeURIComponent(docId)}`);
      if (existing) {
        await artifactsFetch(`/${encodeURIComponent(docId)}`, { method: 'PUT', body: JSON.stringify({ data: envelope(record) }) });
      } else {
        await artifactsFetch('/', {
          method: 'POST',
          body: JSON.stringify({ id: docId, tenantId: 'default', collection: EXECUTION_RECORDS_COLLECTION, data: envelope(record) }),
        });
      }
      return record;
    },

    async remove(executionId: string): Promise<boolean> {
      if (!isValidId(executionId)) return false;
      await artifactsFetch(`/${encodeURIComponent(`${EXECUTION_RECORDS_COLLECTION}:${executionId}`)}`, { method: 'DELETE' });
      const target = resolveLocal(executionId);
      if (target && fs.existsSync(target)) {
        try { fs.unlinkSync(target); } catch {}
      }
      return true;
    },
  };
}

export function createInMemoryExecutionRecordStore(seed: ExecutionRecord[] = []): ExecutionRecordStore & { entries: Map<string, ExecutionRecord> } {
  const entries = new Map<string, ExecutionRecord>(seed.map(r => [r.executionId, r]));
  return {
    entries,
    async get(id) { return entries.get(id) ?? null; },
    async save(record) { entries.set(record.executionId, record); return record; },
    async remove(id) { return entries.delete(id); },
  };
}
