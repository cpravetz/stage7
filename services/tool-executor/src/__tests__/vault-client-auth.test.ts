import http from 'http';
import { AddressInfo } from 'net';
import {
  decryptVaultSecret,
  ensureVaultSecret,
  listVaultSecretNames,
  storeVaultSecret,
} from '../utils/vaultClient';
import {
  SERVICE_API_KEY_ENV,
  SERVICE_ID_ENV,
  getServiceToken,
  isTokenFresh,
  resetServiceTokenCache,
  serviceCredentials,
} from '../utils/serviceToken';

/**
 * Since PR #121 the vault derives tenant identity from verified service
 * tokens only — client-supplied X-Tenant-Id headers are no longer honored and
 * unauthenticated calls fail with 401. These tests pin the migrated wire
 * behavior of the canonical vault client: every call carries the process's
 * service token as a bearer credential and no tenant header.
 */

interface CapturedRequest {
  method?: string;
  url?: string;
  headers: http.IncomingHttpHeaders;
  body?: string;
}

interface FakeServers {
  authUrl: string;
  vaultUrl: string;
  /** Mint count since the last `resetMints()` — per-test, not cumulative. */
  mints: number;
  requests: CapturedRequest[];
  close: () => Promise<void>;
}

const MINTED_TOKEN = 'svc-token-abc123';

async function startFakeServers(): Promise<FakeServers> {
  const requests: CapturedRequest[] = [];
  const servers: FakeServers = {
    authUrl: '',
    vaultUrl: '',
    mints: 0,
    requests,
    close: async () => undefined,
  };

  const readBody = (req: http.IncomingMessage): Promise<string | undefined> =>
    new Promise((resolve) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : undefined));
    });

  const authServer = http.createServer(async (req, res) => {
    const body = await readBody(req);
    requests.push({ method: req.method, url: req.url, headers: req.headers, body });
    if (req.url === '/api/auth/service/auth') {
      servers.mints += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, token: `${MINTED_TOKEN}-${servers.mints}` }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const vaultServer = http.createServer(async (req, res) => {
    const body = await readBody(req);
    requests.push({ method: req.method, url: req.url, headers: req.headers, body });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.url === '/api/vault/secrets' && req.method === 'POST') {
      res.end(JSON.stringify({ id: 'secret-1' }));
    } else if (req.url === '/api/vault/secrets') {
      res.end(JSON.stringify({ secrets: [{ name: 'secret:apiKey' }] }));
    } else if (req.url?.endsWith('/decrypt')) {
      res.end(JSON.stringify({ plaintext: 'hunter2' }));
    } else if (req.url === '/api/vault/secrets/ensure') {
      res.end(JSON.stringify({ existed: true, name: 'secret:apiKey' }));
    } else {
      res.end(JSON.stringify({ id: 'secret-1' }));
    }
  });

  await new Promise<void>((resolve) => authServer.listen(0, '127.0.0.1', resolve));
  await new Promise<void>((resolve) => vaultServer.listen(0, '127.0.0.1', resolve));

  const authUrl = `http://127.0.0.1:${(authServer.address() as AddressInfo).port}`;
  const vaultUrl = `http://127.0.0.1:${(vaultServer.address() as AddressInfo).port}`;
  servers.authUrl = authUrl;
  servers.vaultUrl = vaultUrl;
  servers.close = () =>
    Promise.all([
      new Promise<void>((resolve) => authServer.close(() => resolve())),
      new Promise<void>((resolve) => vaultServer.close(() => resolve())),
    ]).then(() => undefined);

  return servers;
}

describe('vault client service-token auth', () => {
  let servers: FakeServers;
  const previousEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    servers = await startFakeServers();
  });

  afterAll(async () => {
    await servers.close();
  });

  beforeEach(() => {
    for (const key of ['VAULT_URL', 'AUTH_URL', SERVICE_ID_ENV, SERVICE_API_KEY_ENV]) {
      previousEnv[key] = process.env[key];
    }
    process.env.VAULT_URL = servers.vaultUrl;
    process.env.AUTH_URL = servers.authUrl;
    process.env[SERVICE_ID_ENV] = 'tool-executor';
    process.env[SERVICE_API_KEY_ENV] = 'test-api-key';
    servers.requests.length = 0;
    servers.mints = 0;
    resetServiceTokenCache();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetServiceTokenCache();
  });

  const vaultRequests = (): CapturedRequest[] => servers.requests.filter((r) => r.url?.includes('/api/vault/'));

  it('sends the minted service token as the credential and no X-Tenant-Id header', async () => {
    const names = await listVaultSecretNames();

    expect(names).toEqual(['secret:apiKey']);
    const [request] = vaultRequests();
    expect(request?.url).toBe('/api/vault/secrets');
    expect(request?.headers.authorization).toBe(`Bearer ${MINTED_TOKEN}-1`);
    expect(request?.headers['x-tenant-id']).toBeUndefined();
  });

  it('decrypts by name with the bearer token and reuses the cached token across calls', async () => {
    const byName = await decryptVaultSecret({ byName: 'secret:apiKey' });
    const list = await listVaultSecretNames();

    expect(byName).toMatchObject({ ok: true, plaintext: 'hunter2' });
    expect(list).toEqual(['secret:apiKey']);
    expect(vaultRequests()).toHaveLength(2);
    for (const request of vaultRequests()) {
      expect(request.headers.authorization).toBe(`Bearer ${MINTED_TOKEN}-1`);
      expect(request.headers['x-tenant-id']).toBeUndefined();
    }
    // One mint covers both vault calls.
    expect(servers.mints).toBe(1);
  });

  it('keeps the body tenantId assertion on ensure and store while authenticating with the token', async () => {
    await ensureVaultSecret('secret:apiKey', 'system', 'value');
    await storeVaultSecret('value', 'system', 'secret:apiKey');

    const [ensure, store] = vaultRequests();
    expect(ensure?.method).toBe('POST');
    expect(JSON.parse(ensure?.body ?? '{}')).toMatchObject({ name: 'secret:apiKey', tenantId: 'system' });
    expect(ensure?.headers.authorization).toBe(`Bearer ${MINTED_TOKEN}-1`);
    expect(store?.headers.authorization).toBe(`Bearer ${MINTED_TOKEN}-1`);
    expect(store?.headers['x-tenant-id']).toBeUndefined();
  });

  it('fails loudly when the service credentials are not configured', () => {
    delete process.env[SERVICE_ID_ENV];
    expect(() => serviceCredentials()).toThrow(/TOOL_EXECUTOR_SERVICE_ID/);
  });

  it('re-mints after the freshness window expires', async () => {
    const first = await getServiceToken(1_000);
    expect(servers.mints).toBe(1);

    // Inside the window (minted at t=1000, TTL 50min): cached, no second mint.
    await expect(getServiceToken(1000 + 49 * 60 * 1000)).resolves.toBe(first);
    expect(servers.mints).toBe(1);

    // Past the window (minted at t=1000, TTL 50min): re-minted.
    await expect(getServiceToken(1000 + 51 * 60 * 1000)).resolves.not.toBe(first);
    expect(servers.mints).toBe(2);
  });

  it('treats an unconfigured cache entry as stale, not fresh', () => {
    expect(isTokenFresh(undefined, Date.now())).toBe(false);
  });
});
