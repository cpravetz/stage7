/**
 * Skill store HTTP API.
 *
 * Skills run in spawned sandbox processes whose only durable write today is a
 * JSON file under `STORAGE_DIR`. This router gives those writes a Mongo-backed
 * home so a skill's state outlives the container: `POST/GET/DELETE
 * /api/skill-store/:collection/:key`, plus a key listing per collection.
 *
 * Persistence is layered rather than authoritative. Every write also lands in a
 * local JSON file under `LOCAL_STORE_DIR`, and a read prefers the remote copy
 * but falls back to the local one. That keeps the API usable when the artifacts
 * service is down, which is the common case in local development — the whole
 * point of the fallback is that the store never becomes a hard dependency of
 * skill execution.
 */

import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

const router: Router = Router();

const ARTIFACTS_URL = process.env.ARTIFACTS_URL || '';
const LOCAL_STORE_DIR = process.env.SKILL_STORE_DIR || '/tmp/stage7-store';
const REMOTE_TIMEOUT_MS = Number(process.env.SKILL_STORE_TIMEOUT_MS) || 3000;

/** Collection and key come straight off the URL, so they must be path-safe. */
const SAFE_NAME = /^[A-Za-z0-9._-]{1,128}$/;

function isValidName(value: unknown): value is string {
  return typeof value === 'string' && SAFE_NAME.test(value) && !value.startsWith('.');
}

function localPath(collection: string, key?: string): string {
  return path.join(LOCAL_STORE_DIR, collection, key ? `${key}.json` : '');
}

/**
 * Resolve a path and confirm it stays inside the store root. Guards against
 * traversal via a crafted `collection`/`key` even if the regex ever loosens.
 */
function resolveLocal(collection: string, key?: string): string | null {
  const target = localPath(collection, key);
  const resolved = path.resolve(target);
  const root = path.resolve(LOCAL_STORE_DIR);
  return resolved === root || resolved.startsWith(root + path.sep) ? resolved : null;
}

function writeLocal(target: string, record: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(record, null, 2), 'utf8');
}

function readLocal(target: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(target)) return null;
    const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Corrupt local skill-store record');
    return null;
  }
}

/**
 * Forward to the artifacts service's document API, which is the Mongo-backed
 * store. Returns null on any failure so callers fall back to local files rather
 * than surfacing an outage to a skill.
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

function requireName(value: unknown, field: string, res: Response): string | null {
  if (!isValidName(value)) {
    res.status(400).json({ success: false, error: `Invalid ${field}` });
    return null;
  }
  return value;
}

/**
 * Load the stored record for `${collection}:${key}` from whichever layer has it.
 *
 * The record is the wrapper we wrote in `POST /:collection/:key` —
 * `{ key, collection, data, persistedAt, source, updatedAt }` — and the skill's
 * actual payload lives under `record.data`. Reads prefer the Mongo-backed
 * artifacts copy and fall back to the local mirror, matching the GET route.
 */
async function loadRecord(collection: string, key: string): Promise<Record<string, unknown> | null> {
  const remote = await artifactsFetch(`/${encodeURIComponent(`${collection}:${key}`)}`);
  if (remote && remote.data !== undefined && typeof remote.data === 'object') {
    return remote.data as Record<string, unknown>;
  }
  const target = resolveLocal(collection, key);
  return target ? readLocal(target) : null;
}

/**
 * Persist an updated record back to both layers. The remote write is a PUT
 * against the documents API (which merges under `data`); the local mirror is
 * rewritten unconditionally so a later read that loses the artifacts service
 * still sees the filtered array.
 */
async function saveRecord(collection: string, key: string, record: Record<string, unknown>): Promise<void> {
  const id = `${collection}:${key}`;
  await artifactsFetch(`/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ data: record }),
  });
  const target = resolveLocal(collection, key);
  if (target) {
    try {
      writeLocal(target, record);
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err), collection, key }, 'Local skill-store item delete write failed');
    }
  }
}

router.post('/:collection/:key', async (req, res) => {
  const collection = requireName(req.params.collection, 'collection', res);
  if (!collection) return;
  const key = requireName(req.params.key, 'key', res);
  if (!key) return;

  const body = req.body ?? {};
  const data = body.data !== undefined ? body.data : body;
  const record = {
    key,
    collection,
    data,
    persistedAt: body.persistedAt || new Date().toISOString(),
    source: body.source || 'skill-store-api',
    updatedAt: new Date().toISOString(),
  };

  const remote = await artifactsFetch('', {
    method: 'POST',
    body: JSON.stringify({ id: `${collection}:${key}`, tenantId: 'stage7', collection, data: record }),
  });

  // Always mirror locally, even when the remote write succeeded: a later read
  // that loses the artifacts service should still find the value.
  const target = resolveLocal(collection, key);
  if (target) {
    try {
      writeLocal(target, record);
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err), collection, key }, 'Local skill-store write failed');
    }
  }

  res.status(201).json({ success: true, persisted: remote !== null, ...record });
});

router.get('/:collection/:key', async (req, res) => {
  const collection = requireName(req.params.collection, 'collection', res);
  if (!collection) return;
  const key = requireName(req.params.key, 'key', res);
  if (!key) return;

  const remote = await artifactsFetch(`/${encodeURIComponent(`${collection}:${key}`)}`);
  if (remote && remote.data !== undefined) {
    return res.json({ success: true, source: 'artifacts', ...remote });
  }

  const target = resolveLocal(collection, key);
  const local = target ? readLocal(target) : null;
  if (!local) {
    return res.status(404).json({ success: false, error: 'Key not found' });
  }
  res.json({ success: true, source: 'local', ...local });
});

// Registered before the key-level delete below so the three-segment path is always
// matched by this handler. Express' default `:key` pattern stops at a `/`, so the
// two-segment route would not match anyway, but the explicit order keeps intent
// unambiguous if a wildcard is ever added at mount time.
router.delete('/:collection/:key/:itemId', async (req, res) => {
  const collection = requireName(req.params.collection, 'collection', res);
  if (!collection) return;
  const key = requireName(req.params.key, 'key', res);
  if (!key) return;
  const itemId = requireName(req.params.itemId, 'itemId', res);
  if (!itemId) return;

  const record = await loadRecord(collection, key);
  if (!record || !Array.isArray(record.data)) {
    // Nothing to filter: the key either doesn't exist or doesn't hold an array.
    // Report success — delete is idempotent and the UX must not surface a 404.
    return res.json({ success: true, removed: false, collection, key, itemId });
  }

  const items = record.data as unknown[];
  const before = items.length;
  const remaining = items.filter(
    (item) => !(item && typeof item === 'object' && (
      (item as Record<string, unknown>).id === itemId ||
      (item as Record<string, unknown>).name === itemId
    )),
  );
  const removed = remaining.length < before;

  if (removed) {
    record.data = remaining;
    record.updatedAt = new Date().toISOString();
    await saveRecord(collection, key, record);
  }

  res.json({ success: true, removed, collection, key, itemId, remaining: remaining.length });
});

router.delete('/:collection/:key', async (req, res) => {
  const collection = requireName(req.params.collection, 'collection', res);
  if (!collection) return;
  const key = requireName(req.params.key, 'key', res);
  if (!key) return;

  await artifactsFetch(`/${encodeURIComponent(`${collection}:${key}`)}`, { method: 'DELETE' });

  const target = resolveLocal(collection, key);
  let removedLocal = false;
  if (target) {
    try {
      if (fs.existsSync(target)) {
        fs.unlinkSync(target);
        removedLocal = true;
      }
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err), collection, key }, 'Local skill-store delete failed');
    }
  }

  // Report success even when nothing existed: delete is idempotent, and the
  // delete-buttons UX should not surface a 404 for an already-gone key.
  res.json({ success: true, removedLocal });
});

router.get('/:collection', async (req, res) => {
  const collection = requireName(req.params.collection, 'collection', res);
  if (!collection) return;

  const keys = new Set<string>();
  const remote = await artifactsFetch('/search', {
    method: 'POST',
    body: JSON.stringify({ collection, limit: 1000 }),
  });
  const docs = (remote && remote.documents) || remote || [];
  if (Array.isArray(docs)) {
    for (const doc of docs) {
      const raw = doc && doc.data && doc.data.key;
      if (typeof raw === 'string') keys.add(raw);
    }
  }

  const dir = resolveLocal(collection);
  if (dir) {
    try {
      if (fs.existsSync(dir)) {
        for (const file of fs.readdirSync(dir)) {
          if (file.endsWith('.json')) keys.add(file.slice(0, -'.json'.length));
        }
      }
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err), collection }, 'Local skill-store listing failed');
    }
  }

  res.json({ success: true, collection, keys: [...keys].sort() });
});

export default router;
