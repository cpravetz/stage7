import http from 'http';
import fs from 'fs';
import path from 'path';
import { AddressInfo } from 'net';
import { CodeExecutor } from '../executors/CodeExecutor';
import { resolveAuthValue } from '../adk/shared/stage7-auth';
import {
  SERVICE_API_KEY_ENV,
  SERVICE_ID_ENV,
  resetServiceTokenCache,
} from '../utils/serviceToken';

/**
 * src/adk/shared/stage7-auth.js is the single source of truth for the sandbox
 * `__resolveAuth` prelude. CodeExecutor must inline that file verbatim — these
 * tests pin the copy and the wire behavior it guarantees.
 */
const AUTH_MODULE_PATH = path.resolve(__dirname, '../adk/shared/stage7-auth.js');
const LAST_GENERATED = '/tmp/stage7_last_generated.js';

function authModule(): string {
  return fs.readFileSync(AUTH_MODULE_PATH, 'utf8');
}

/**
 * Fake auth + vault pair: the auth server mints `fake-mint-prefix-N` service
 * tokens, the vault records every request and serves a fixed plaintext for
 * /decrypt. Lets the executor-shaped tests pin that the sandbox's vault
 * decrypt carries the minted bearer token.
 */
async function startFakeAuthAndVault(): Promise<{
  authUrl: string;
  vaultUrl: string;
  mints: number;
  vaultRequests: { method?: string; url?: string; headers: http.IncomingHttpHeaders }[];
  close: () => Promise<void>;
}> {
  const vaultRequests: { method?: string; url?: string; headers: http.IncomingHttpHeaders }[] = [];
  const state = { mints: 0 };

  const authServer = http.createServer((req, res) => {
    if (req.url === '/api/auth/service/auth') {
      state.mints += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, token: `fake-mint-prefix-for-tests-${state.mints}` }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const vaultServer = http.createServer((req, res) => {
    vaultRequests.push({ method: req.method, url: req.url, headers: req.headers });
    // Mirror the real vault (PR #121): unauthenticated decrypts are rejected
    // rather than served.
    if (!req.headers.authorization) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ plaintext: 'sek-ret' }));
  });

  await new Promise<void>((resolve) => authServer.listen(0, '127.0.0.1', resolve));
  await new Promise<void>((resolve) => vaultServer.listen(0, '127.0.0.1', resolve));
  const authUrl = `http://127.0.0.1:${(authServer.address() as AddressInfo).port}`;
  const vaultUrl = `http://127.0.0.1:${(vaultServer.address() as AddressInfo).port}`;
  return {
    authUrl,
    vaultUrl,
    get mints() {
      return state.mints;
    },
    vaultRequests,
    close: () =>
      Promise.all([
        new Promise<void>((resolve) => authServer.close(() => resolve())),
        new Promise<void>((resolve) => vaultServer.close(() => resolve())),
      ]).then(() => undefined),
  };
}

describe('CodeExecutor sandbox auth prelude', () => {
  const executor = new CodeExecutor();
  const previousEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ['VAULT_URL', 'AUTH_URL', SERVICE_ID_ENV, SERVICE_API_KEY_ENV]) {
      previousEnv[key] = process.env[key];
    }
    resetServiceTokenCache();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetServiceTokenCache();
  });

  it('generates the sandbox prelude verbatim from stage7-auth.js', async () => {
    const result = await executor.execute({
      language: 'javascript',
      code: 'const r = await __resolveAuth({ type: "bearer", token: "tok_123" });\nconsole.log(JSON.stringify(r));',
    });
    expect(result.success).toBe(true);

    // The generated script embeds the entire module file, byte for byte.
    const generated = fs.readFileSync(LAST_GENERATED, 'utf8');
    expect(generated).toContain(authModule());

    // And the inlined module produced the expected headers in the sandbox.
    expect(JSON.parse(result.output!)).toEqual({
      headers: { Authorization: 'Bearer tok_123' },
      type: 'bearer',
    });
  });

  it('authenticates vault decrypts from the sandbox with the minted service token', async () => {
    // Since PR #121 the vault derives tenant identity from verified bearer
    // tokens only — the sandbox prelude must carry the executor's minted
    // service token, exactly like the Python prelude does. Without it the
    // decrypt 401s and the credential silently degrades to ''.
    const servers = await startFakeAuthAndVault();
    process.env.VAULT_URL = servers.vaultUrl;
    process.env.AUTH_URL = servers.authUrl;
    process.env[SERVICE_ID_ENV] = 'tool-executor';
    process.env[SERVICE_API_KEY_ENV] = 'test-api-key';
    try {
      const result = await executor.execute({
        language: 'javascript',
        code: 'const r = await __resolveAuth({ type: "bearer", token: { vaultSecretId: "abc-123" } });\nconsole.log(JSON.stringify(r));',
      });
      expect(result.success).toBe(true);

      // One mint covers the execution; the sandbox's vault fetch carried the
      // minted token as its bearer credential and no tenant header.
      expect(servers.mints).toBe(1);
      expect(servers.vaultRequests).toHaveLength(1);
      const [request] = servers.vaultRequests;
      expect(request.url).toBe('/api/vault/secrets/abc-123/decrypt');
      expect(request.headers.authorization).toBe('Bearer fake-mint-prefix-for-tests-1');
      expect(request.headers['x-tenant-id']).toBeUndefined();

      // And the credential actually resolved inside the sandbox.
      expect(JSON.parse(result.output!)).toEqual({
        headers: { Authorization: 'Bearer sek-ret' },
        type: 'bearer',
      });
    } finally {
      await servers.close();
    }
  });

  it('degrades vault-backed credentials to empty when the service token cannot be minted', async () => {
    const servers = await startFakeAuthAndVault();
    process.env.VAULT_URL = servers.vaultUrl;
    // No AUTH_URL / service credentials: the mint fails, the prelude carries
    // no token, and the unauthenticated vault call degrades to '' rather than
    // throwing inside generated tool code.
    delete process.env.AUTH_URL;
    delete process.env[SERVICE_ID_ENV];
    delete process.env[SERVICE_API_KEY_ENV];
    try {
      const result = await executor.execute({
        language: 'javascript',
        code: 'const r = await __resolveAuth({ type: "bearer", token: { vaultSecretId: "abc-123" } });\nconsole.log(JSON.stringify(r));',
      });
      expect(result.success).toBe(true);
      expect(JSON.parse(result.output!)).toEqual({ headers: {}, type: 'bearer' });
      // The sandbox still attempted the decrypt — unauthenticated — and the
      // vault rejected it rather than returning a secret.
      expect(servers.vaultRequests).toHaveLength(1);
      expect(servers.vaultRequests[0].headers.authorization).toBeUndefined();
    } finally {
      await servers.close();
    }
  });

  it('degrades missing credentials to empty headers instead of throwing', async () => {
    const result = await executor.execute({
      language: 'javascript',
      code: [
        'const none = await __resolveAuth(undefined);',
        'const bearer = await __resolveAuth({ type: "bearer", token: { envVar: "STAGE7_MISSING_ENV_TEST" } });',
        'const basic = await __resolveAuth({ type: "basic", username: "u", password: { vaultSecretId: "does-not-exist" } });',
        'const custom = await __resolveAuth({ type: "custom", headers: { "X-Trace": "t1", "X-Drop": null } });',
        'console.log(JSON.stringify({ none, bearer, basic, custom }));',
      ].join('\n'),
    });
    expect(result.success).toBe(true);
    expect(JSON.parse(result.output!)).toEqual({
      none: { headers: {}, type: 'none' },
      bearer: { headers: {}, type: 'bearer' },
      basic: { headers: { Authorization: 'Basic dTo=' }, type: 'basic' },
      custom: { headers: { 'X-Trace': 't1' }, type: 'custom' },
    });
  });
});

describe('stage7-auth module', () => {
  it('resolves envVar, configKey, and ${VAR} string references', async () => {
    process.env.STAGE7_AUTH_TEST_VAR = 'from-env-ref';
    process.env.STAGE7_AUTH_TEST_ENVVAR = 'from-envvar';
    try {
      expect(await resolveAuthValue('${STAGE7_AUTH_TEST_VAR}')).toBe('from-env-ref');
      expect(await resolveAuthValue({ envVar: 'STAGE7_AUTH_TEST_ENVVAR' })).toBe('from-envvar');
      expect(await resolveAuthValue({ configKey: 'STAGE7_AUTH_TEST_ENVVAR' })).toBe('from-envvar');
      expect(await resolveAuthValue('plain-value')).toBe('plain-value');
      expect(await resolveAuthValue(undefined)).toBe('');
      // A ${VAR} with no matching environment variable degrades to ''.
      expect(await resolveAuthValue('${STAGE7_AUTH_TEST_MISSING}')).toBe('');
    } finally {
      delete process.env.STAGE7_AUTH_TEST_VAR;
      delete process.env.STAGE7_AUTH_TEST_ENVVAR;
    }
  });
});
