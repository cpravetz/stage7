/**
 * Stage7 Shared JS Runtime for Code Skills.
 *
 * Plain CommonJS twin of `stage7-runtime.ts`. CodeExecutor copies THIS file
 * verbatim into the sandbox as `${sandboxDir}/stage7-runtime.js`; the generated
 * skill script lives at `${sandboxDir}/main.js`, so it pulls the runtime in
 * with `require('./stage7-runtime')`.
 *
 * It must stay free of ES module syntax and type annotations: Node parses it
 * directly in CommonJS mode, with no build step in between.
 *
 * Globals injected by CodeExecutor into the sandbox:
 * - __tool_input: the tool's input object
 * - __execute_tool: callback for delegating to other tools
 * - process.env.ARTIFACTS_URL: artifacts service URL (optional)
 * - process.env[persistenceEnvVar] (e.g. HOTEL_HOME, STORAGE_DIR): local persistence dir
 */

const fs = require('fs');
const path = require('path');

/** Fallback directory for the inter-skill collection store when no env dir is set. */
const GLOBAL_STORE_DIR = '/tmp/stage7-store';
/** Remote skill-store calls are best-effort; never let them stall a skill past this. */
const REMOTE_TIMEOUT_MS = 2000;

/**
 * `HOTEL_HOME` -> `hotel`, `LEGAL_HOME` -> `legal`. Used as the Mongo-backed
 * collection name on the artifacts service so each domain gets its own bucket.
 */
function deriveCollection(persistenceEnvVar) {
  return persistenceEnvVar.replace(/_HOME$/i, '').replace(/^STORAGE_DIR$/i, 'default').toLowerCase() || 'default';
}

function artifactsUrl() {
  return (typeof process !== 'undefined' && process.env && process.env.ARTIFACTS_URL) || '';
}

/**
 * Fire-and-forget remote call against the artifacts skill-store API.
 *
 * Never rejects: persistence is an optimization layered on top of the local
 * file write, so an unreachable artifacts service must not fail the skill. The
 * request is left in flight on purpose - an un-awaited fetch keeps the Node
 * event loop alive, so the spawned skill process waits for it to settle instead
 * of exiting mid-write.
 */
function remoteCall(method, collection, key, body) {
  const base = artifactsUrl();
  if (!base) return Promise.resolve(null);
  const url = `${base}/api/skill-store/${encodeURIComponent(collection)}/${encodeURIComponent(key)}`;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS) : null;
  return fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: controller ? controller.signal : undefined,
  })
    .then((res) => (res && res.ok ? res.json().catch(() => null) : null))
    .catch(() => null)
    .finally(() => {
      if (timer) clearTimeout(timer);
    });
}

function createRuntimeContext(opts) {
  const options = opts || {};
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const persistenceEnvVar = options.persistenceEnvVar || 'STORAGE_DIR';
  const baseDir = (typeof process !== 'undefined' && process.env && process.env[persistenceEnvVar]) || '/tmp/stage7';
  const collection = deriveCollection(persistenceEnvVar);

  function readLocal(key, defaultValue) {
    const fallback = defaultValue === undefined ? [] : defaultValue;
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
    return fallback;
  }

  function writeLocal(key, data) {
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
    getFilePath(key) {
      return path.join(baseDir, `${key}.json`);
    },
    /**
     * Synchronous read from the local file, falling back to the global
     * collection store. Stays synchronous on purpose: ~40 skill handlers call
     * `ctx.store.load(...)` and use the return value directly, so returning a
     * Promise here would hand every one of them a Promise to iterate. Use
     * `loadAsync` when the caller can await and wants the Mongo copy first.
     */
    load(key, defaultValue) {
      return readLocal(key, defaultValue);
    },
    /**
     * Remote-first read: prefers the Mongo-backed artifacts copy and falls back
     * to the local file when artifacts is unset, unreachable, or missing the key.
     */
    async loadAsync(key, defaultValue) {
      const remote = await remoteCall('GET', collection, key);
      if (remote && typeof remote === 'object' && remote.data !== undefined) {
        // Refresh the local mirror so later synchronous loads stay consistent.
        writeLocal(key, remote.data);
        return remote.data;
      }
      return readLocal(key, defaultValue);
    },
    save(key, data) {
      writeLocal(key, data);
      // Mirror to Mongo. Intentionally not awaited: `save` is sync by contract.
      void remoteCall('POST', collection, key, {
        data,
        persistedAt: new Date().toISOString(),
        source: `skill:${key}`,
      });
    },
    /** Remove both the local files and the remote Mongo copy. Best effort. */
    delete(key) {
      for (const filePath of [path.join(baseDir, `${key}.json`), path.join(GLOBAL_STORE_DIR, `${key}.json`)]) {
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (e) {
          // Best effort delete
        }
      }
      void remoteCall('DELETE', collection, key);
    },
    /** Remote copy only - does not touch local files. */
    async list() {
      const base = artifactsUrl();
      if (!base) return [];
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS) : null;
        const res = await fetch(`${base}/api/skill-store/${encodeURIComponent(collection)}`, {
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
    success(result) {
      const res = result || {};
      const output = {
        success: true,
        data: res.data || null,
        status: res.status || 'ok',
        error: res.error || null,
        present: res.present || [],
        ...res,
      };
      console.log(JSON.stringify(output));
      return output;
    },
    failure(error, result) {
      const res = result || {};
      const message = typeof error === 'string' ? error : (error && error.message) || String(error);
      const output = {
        success: false,
        data: res.data || null,
        status: res.status || 'failed',
        error: message,
        present: res.present || [
          {
            id: 'error-summary',
            title: 'Error',
            kind: 'text',
            body: message,
          },
        ],
        ...res,
      };
      console.log(JSON.stringify(output));
      return output;
    },
    notConnected(reason, details) {
      const why = reason === undefined ? 'Required endpoint or configuration is missing' : reason;
      const extra = details === undefined ? '' : details;
      const output = {
        success: false,
        status: 'not-connected',
        data: null,
        error: `Not connected: ${why}`,
        present: [
          {
            id: 'not-connected',
            title: 'Connection required',
            kind: 'text',
            body: extra ? `${why}\n${extra}` : why,
          },
        ],
      };
      console.log(JSON.stringify(output));
      return output;
    },
  };

  const delegate = async (toolId, toolInput) => {
    if (typeof __execute_tool === 'function') {
      return await __execute_tool(toolId, toolInput);
    }
    throw new Error(`Tool execution environment does not support delegation to ${toolId}`);
  };

  const render = {
    text(id, title, bodyOrLines) {
      const body = Array.isArray(bodyOrLines) ? bodyOrLines.join('\n') : String(bodyOrLines);
      return { id, title, kind: 'text', body };
    },
    markdown(id, title, bodyOrLines) {
      const body = Array.isArray(bodyOrLines) ? bodyOrLines.join('\n') : String(bodyOrLines);
      return { id, title, kind: 'markdown', body };
    },
    list(id, title, items) {
      const body = items.map((i) => `- ${i}`).join('\n');
      return { id, title, kind: 'text', body };
    },
  };

  return {
    input,
    store,
    emit,
    delegate,
    render,
  };
}

module.exports = {
  context: createRuntimeContext,
  createRuntimeContext,
};
