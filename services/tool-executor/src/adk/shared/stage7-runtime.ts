/**
 * Stage7 Shared JS Runtime for Code Skills.
 * Loaded by spawned Node.js skill processes via require('stage7-runtime').
 */

import fs from 'fs';
import path from 'path';
import { STORE_WRITE_LOG } from '../events';
import type { StoreWrite } from '../events';

declare const __tool_input: any;
declare const __execute_tool: any;
/** Resolved Skill configuration, injected by the executor next to __tool_input. */
declare const __skill_config: any;
/**
 * Resolved credentials, keyed by the logical key the Skill's manifest declares in
 * `credentialSource`. Injected by the executor so a handler never reads
 * process.env: secrets arrive through the credential provider (vault, or the
 * Skill's own configuration), not through the process environment.
 */
declare const __skill_credentials: any;

export interface RuntimeOptions {
  persistenceEnvVar?: string;
  /**
   * Operator-supplied Skill configuration for this run. Passed explicitly
   * because this module can be loaded with require(), which gives it a scope of
   * its own that cannot see the calling script's variables.
   */
  config?: Record<string, unknown>;
  /** Secrets resolved by the executor's credential provider for this run. */
  credentials?: Record<string, string | undefined>;
}

/** Fallback directory for the inter-skill collection store when no env dir is set. */
const GLOBAL_STORE_DIR = '/tmp/stage7-store';
/** Remote skill-store calls are best-effort; never let them stall a skill past this. */
const REMOTE_TIMEOUT_MS = 2000;

/**
 * `HOTEL_HOME` -> `hotel`, `LEGAL_HOME` -> `legal`. Used as the Mongo-backed
 * collection name on the artifacts service so each domain gets its own bucket.
 */
function deriveCollection(persistenceEnvVar: string): string {
  return persistenceEnvVar.replace(/_HOME$/i, '').replace(/^STORAGE_DIR$/i, 'default').toLowerCase() || 'default';
}

/**
 * Every store write this process made, in order, for the executor to turn into
 * events once the run is known to have succeeded.
 *
 * Module-scoped on purpose: a code Skill runs in its own spawned process, so the
 * lifetime of this array is exactly the lifetime of one run and it cannot leak
 * between runs. The executor still discards it on failure — a run that wrote three
 * records and then threw changed nothing this module can vouch for.
 */
const writeLog: StoreWrite[] = [];

/** Whether the key already exists, so a save can be told apart from a create. */
function existedBefore(filePaths: string[]): boolean {
  return filePaths.some((filePath) => {
    try {
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  });
}

function recordWrite(key: string, existed: boolean): void {
  writeLog.push({ key, operation: existed ? 'updated' : 'created' });
  // Also flushed per write rather than only on exit: a Skill that calls
  // `process.exit()` from inside a handler skips the `exit` handler, and a run that
  // wrote real data would then be announced as having written none.
  flushWriteLog();
}

/**
 * Write the log to the sidecar the executor reads after the process closes.
 *
 * Synchronous on purpose, and safe to call repeatedly: it runs on `exit` (which
 * permits only sync work) and on the write path (which cannot await without making
 * `save` async, which ~60 call sites depend on).
 */
function flushWriteLog(): void {
  const dir = process.env.STAGE7_SANDBOX_DIR || '';
  if (!dir) return;
  try {
    fs.writeFileSync(path.join(dir, STORE_WRITE_LOG), JSON.stringify(writeLog), 'utf8');
  } catch {
    // Best effort: a missing log costs the run its derived events, never its result.
  }
}

if (typeof process !== 'undefined' && typeof process.on === 'function') {
  process.on('exit', flushWriteLog);
}

function artifactsUrl(): string {
  return (typeof process !== 'undefined' && process.env && process.env.ARTIFACTS_URL) || '';
}

/**
 * Fire-and-forget remote call against the artifacts skill-store API.
 *
 * Never rejects: persistence is an optimization layered on top of the local
 * file write, so an unreachable artifacts service must not fail the skill. The
 * request is left in flight on purpose — an un-awaited fetch keeps the Node
 * event loop alive, so the spawned skill process waits for it to settle instead
 * of exiting mid-write.
 */
function remoteCall(method: string, collection: string, key: string, body?: any): Promise<any> {
  const base = artifactsUrl();
  if (!base) return Promise.resolve(null);
  const url = `${base}/api/skill-store/${encodeURIComponent(collection)}/${encodeURIComponent(key)}`;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS) : null;
  return (fetch as any)(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: controller ? controller.signal : undefined,
  })
    .then((res: any) => (res && res.ok ? res.json().catch(() => null) : null))
    .catch(() => null)
    .finally(() => {
      if (timer) clearTimeout(timer);
    });
}

export function createRuntimeContext(opts: RuntimeOptions = {}) {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  // Resolved Skill configuration, injected by the executor. configSchema was
  // previously only a presence gate -- the values were validated for existence
  // and then unreachable from the handler, so a scheduled Skill could declare a
  // required selector and never see it. Config is a separate object from input
  // on purpose: it is operator-supplied, not per-run, and handlers should not
  // be able to override it by sending the same key as input.
  // Prefer the values the caller passes in. The globals are only a fallback for
  // direct in-module use: when this module is loaded with require() it has its own
  // scope and cannot see the wrapper script's variables, so reading the globals
  // there would always yield an empty config.
  const config = opts.config ?? (typeof __skill_config !== 'undefined' && __skill_config ? __skill_config : {});
  // Secrets for this run, resolved by the executor's credential provider and
  // scoped to the logical keys the Skill declared. A Skill reads its own key out
  // of here rather than out of the process environment, which is how secrets can
  // be rotated and revoked without redeploying.
  const credentials = opts.credentials
    ?? (typeof __skill_credentials !== 'undefined' && __skill_credentials ? __skill_credentials : {});

  /**
   * Resolve one declared credential, or undefined when it is not configured.
   * Handlers should treat undefined as "not connected" and say so, not guess.
   */
  function getCredential(logicalKey: string): string | undefined {
    const value = credentials[logicalKey];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  const persistenceEnvVar = opts.persistenceEnvVar || 'STORAGE_DIR';
  const baseDir = (typeof process !== 'undefined' && process.env && process.env[persistenceEnvVar]) || '/tmp/stage7';
  const collection = deriveCollection(persistenceEnvVar);

  function readLocal(key: string, defaultValue: any = []): any {
    // Check the domain dir first, then the shared collection store, so a value
    // another skill wrote globally is still visible when this domain dir is cold.
    for (const filePath of [path.join(baseDir, `${key}.json`), path.join(GLOBAL_STORE_DIR, `${key}.json`)]) {
      try {
        if (fs.existsSync(filePath)) {
          return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
      } catch (e) {
        // Fall through to the next candidate / the default
      }
    }
    return defaultValue;
  }

  function writeLocal(key: string, data: any): void {
    try {
      // mkdir on the FILE's dirname, not on baseDir: a key carrying a path
      // segment ('listings/default') resolves to a subdirectory that a bare
      // mkdirSync(baseDir) does not create, so the write threw ENOENT and the
      // save was swallowed by the catch below.
      const filePath = path.join(baseDir, `${key}.json`);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      // Best effort save
    }
    // Also sync to the global persistent collection store for inter-skill access.
    try {
      fs.mkdirSync(GLOBAL_STORE_DIR, { recursive: true });
      fs.writeFileSync(path.join(GLOBAL_STORE_DIR, `${key}.json`), JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      // Best effort sync
    }
  }

  const store = {
    collection,
    getFilePath(key: string) {
      return path.join(baseDir, `${key}.json`);
    },
    /**
     * Synchronous read from the local file, falling back to the global
     * collection store. Stays synchronous on purpose: ~40 skill handlers call
     * `ctx.store.load(...)` and use the return value directly, so returning a
     * Promise here would hand every one of them a Promise to iterate. Use
     * `loadAsync` when the caller can await and wants the Mongo copy first.
     */
    load(key: string, defaultValue: any = []) {
      return readLocal(key, defaultValue);
    },
    /**
     * Remote-first read: prefers the Mongo-backed artifacts copy and falls back
     * to the local file when artifacts is unset, unreachable, or missing the key.
     */
    async loadAsync(key: string, defaultValue: any = []) {
      const remote = await remoteCall('GET', collection, key);
      if (remote && typeof remote === 'object' && remote.data !== undefined) {
        // Refresh the local mirror so later synchronous loads stay consistent.
        writeLocal(key, remote.data);
        return remote.data;
      }
      return readLocal(key, defaultValue);
    },
    save(key: string, data: any) {
      recordWrite(key, existedBefore([path.join(baseDir, `${key}.json`), path.join(GLOBAL_STORE_DIR, `${key}.json`)]));
      writeLocal(key, data);
      // Mirror to Mongo. Intentionally not awaited: `save` is sync by contract.
      void remoteCall('POST', collection, key, {
        data,
        persistedAt: new Date().toISOString(),
        source: `skill:${key}`,
      });
    },
    /** Remove both the local files and the remote Mongo copy. Best effort. */
    delete(key: string) {
      writeLog.push({ key, operation: 'deleted' });
      flushWriteLog();
      for (const filePath of [path.join(baseDir, `${key}.json`), path.join(GLOBAL_STORE_DIR, `${key}.json`)]) {
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (e) {
          // Best effort delete
        }
      }
      void remoteCall('DELETE', collection, key);
    },
    /** Remote copy only — does not touch local files. */
    async list() {
      const base = artifactsUrl();
      if (!base) return [];
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS) : null;
        const res = await (fetch as any)(`${base}/api/skill-store/${encodeURIComponent(collection)}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: controller ? controller.signal : undefined,
        });
        if (timer) clearTimeout(timer);
        if (!res.ok) return [];
        const body = await res.json();
        return (body && Array.isArray(body.keys)) ? body.keys : [];
      } catch (e) {
        return [];
      }
    },
  };

  const emit = {
    success(result: any = {}) {
      const output = {
        success: true,
        data: result.data || null,
        status: result.status || 'ok',
        error: result.error || null,
        present: result.present || [],
        ...result,
      };
      console.log(JSON.stringify(output));
      return output;
    },
    failure(error: any, result: any = {}) {
      const output = {
        success: false,
        data: result.data || null,
        status: result.status || 'failed',
        error: typeof error === 'string' ? error : (error && error.message) || String(error),
        present: result.present || [
          {
            id: 'error-summary',
            title: 'Error',
            kind: 'text',
            body: typeof error === 'string' ? error : (error && error.message) || String(error),
          },
        ],
        ...result,
      };
      console.log(JSON.stringify(output));
      return output;
    },
    notConnected(reason = 'Required endpoint or configuration is missing', details = '') {
      const output = {
        success: false,
        status: 'not-connected',
        data: null,
        error: `Not connected: ${reason}`,
        present: [
          {
            id: 'not-connected',
            title: 'Connection required',
            kind: 'text',
            body: details ? `${reason}\n${details}` : reason,
          },
        ],
      };
      console.log(JSON.stringify(output));
      return output;
    },
  };

  const delegate = async (toolId: string, toolInput: any) => {
    if (typeof __execute_tool === 'function') {
      return await __execute_tool(toolId, toolInput);
    }
    throw new Error(`Tool execution environment does not support delegation to ${toolId}`);
  };

  const render = {
    text(id: string, title: string, bodyOrLines: string | string[]) {
      const body = Array.isArray(bodyOrLines) ? bodyOrLines.join('\n') : String(bodyOrLines);
      return { id, title, kind: 'text', body };
    },
    markdown(id: string, title: string, bodyOrLines: string | string[]) {
      const body = Array.isArray(bodyOrLines) ? bodyOrLines.join('\n') : String(bodyOrLines);
      return { id, title, kind: 'markdown', body };
    },
    list(id: string, title: string, items: string[]) {
      const body = items.map((i) => `- ${i}`).join('\n');
      return { id, title, kind: 'text', body };
    },
  };

  return {
    input,
    config,
    credentials,
    getCredential,
    store,
    emit,
    delegate,
    render,
  };
}

module.exports = {
  context: createRuntimeContext,
};
