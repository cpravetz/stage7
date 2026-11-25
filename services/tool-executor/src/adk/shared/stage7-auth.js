/**
 * Canonical sandbox auth-to-header resolution.
 *
 * This file is the single source of truth for how a code-tool's `auth` config
 * becomes request headers inside a sandbox. CodeExecutor reads it verbatim and
 * inlines it as the prelude of every JavaScript sandbox script (the same way
 * stage7-runtime.js is copied into the sandbox), so there must be no second,
 * hand-maintained copy of this logic in CodeExecutor.ts. The Python prelude in
 * CodeExecutor.ts mirrors this file's semantics — keep the two in sync.
 *
 * Constraints of the sandbox environment:
 * - CommonJS, no imports: the text is inlined into generated scripts and must
 *   run standalone with only globals (fetch, process, Buffer).
 * - No `use strict` directive: the text is concatenated mid-script, where a
 *   directive would be inert at best and confusing at worst.
 * - Identifiers are double-underscore prefixed so generated code can never
 *   collide with them.
 */

const __STAGE7_DEFAULT_VAULT_URL = 'http://vault:4000';

/**
 * Resolve one auth value. Objects may reference the vault (`vaultSecretId`,
 * decrypted over HTTP with the canonical `X-Tenant-Id` tenant convention) or
 * the process environment (`envVar` / `configKey`); strings may use `${VAR}`
 * environment references. Everything that cannot be resolved degrades to ''
 * — a missing credential must never throw inside generated tool code.
 */
async function __resolveAuthValue(val) {
  if (val == null) return '';
  if (typeof val === 'object') {
    if (val.vaultSecretId) {
      try {
        const r = await fetch((process.env.VAULT_URL || __STAGE7_DEFAULT_VAULT_URL) + '/api/vault/secrets/' + val.vaultSecretId + '/decrypt', {
          headers: { 'X-Tenant-Id': 'system' },
        });
        if (r.ok) {
          const d = await r.json();
          return d.plaintext || '';
        }
      } catch {
        // Vault unreachable or a non-OK response: degrade to '' like every
        // other unresolvable auth value.
      }
      return '';
    }
    if (val.envVar) return process.env[val.envVar] || '';
    if (val.configKey) return process.env[val.configKey] || '';
    return '';
  }
  if (typeof val === 'string') {
    const m = val.match(/^\$\{(\w+)\}$/);
    return m ? (process.env[m[1]] || '') : val;
  }
  return '';
}

/**
 * Resolve an auth config into `{ headers, type }`. Supported shapes:
 *
 *   { type: 'bearer',  token: '...' | { envVar | vaultSecretId | '${VAR}' } }
 *   { type: 'basic',   username, password }
 *   { type: 'api_key', header: 'X-API-Key', value }
 *   { type: 'custom',  headers: { 'X-Foo': 'bar' } }
 */
async function __resolveAuth(auth) {
  const type = (auth && auth.type) || 'none';
  const headers = {};
  switch (type) {
    case 'bearer': {
      const t = await __resolveAuthValue(auth.token != null ? auth.token : auth.accessToken);
      if (t) headers['Authorization'] = 'Bearer ' + t;
      break;
    }
    case 'basic': {
      const u = await __resolveAuthValue(auth.username);
      const p = await __resolveAuthValue(auth.password);
      if (u || p) headers['Authorization'] = 'Basic ' + Buffer.from(u + ':' + p).toString('base64');
      break;
    }
    case 'api_key': {
      const hn = auth.header || 'X-API-Key';
      const v = await __resolveAuthValue(auth.value != null ? auth.value : auth.apiKey);
      if (v) headers[hn] = v;
      break;
    }
    case 'custom':
      if (auth.headers) for (const [k, v] of Object.entries(auth.headers)) if (v != null) headers[k] = String(v);
      break;
  }
  return { headers, type };
}

// Exported for direct require in tests and tooling. The guard matters: Node's
// module-syntax detection runs a sandbox script containing top-level `await`
// as an ES module, where `module` is undefined — the inlined copy must not
// reference it unconditionally.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { resolveAuth: __resolveAuth, resolveAuthValue: __resolveAuthValue };
}
