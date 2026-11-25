import http from 'http';
import fs from 'fs';
import path from 'path';
import { AddressInfo } from 'net';
import { CodeExecutor } from '../executors/CodeExecutor';
import { resolveAuthValue } from '../adk/shared/stage7-auth';

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

describe('CodeExecutor sandbox auth prelude', () => {
  const executor = new CodeExecutor();

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

  it('resolves vaultSecretId values over the wire with the canonical tenant header', async () => {
    const seen: { method?: string; url?: string; tenantHeader?: string } = {};
    const server = http.createServer((req, res) => {
      seen.method = req.method;
      seen.url = req.url;
      seen.tenantHeader = req.headers['x-tenant-id'] as string | undefined;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ plaintext: 'sek-ret' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    const previousVaultUrl = process.env.VAULT_URL;
    process.env.VAULT_URL = `http://127.0.0.1:${port}`;
    try {
      const result = await executor.execute({
        language: 'javascript',
        code: 'const r = await __resolveAuth({ type: "bearer", token: { vaultSecretId: "abc-123" } });\nconsole.log(JSON.stringify(r));',
      });
      expect(result.success).toBe(true);
      expect(seen).toEqual({
        method: 'GET',
        url: '/api/vault/secrets/abc-123/decrypt',
        tenantHeader: 'system',
      });
      expect(JSON.parse(result.output!)).toEqual({
        headers: { Authorization: 'Bearer sek-ret' },
        type: 'bearer',
      });
    } finally {
      if (previousVaultUrl === undefined) delete process.env.VAULT_URL;
      else process.env.VAULT_URL = previousVaultUrl;
      await new Promise<void>((resolve) => server.close(() => resolve()));
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
