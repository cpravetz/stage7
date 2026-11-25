import request from 'supertest';
import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import proxyRoutes from '../routes/proxy';
import { isPublicProxyPath } from '../routes/proxy';
import { gatewayProxy } from '../utils/sharedInstances';
import { TokenPayload } from '@stage7-nextgen/shared';

/**
 * The gateway proxy must not be an unauthenticated pass-through: every
 * /api/:service/* request needs a bearer token the auth service verifies,
 * except the token-minting auth endpoints and health probes.
 */

const SERVICE_TOKEN_PAYLOAD: TokenPayload = {
  sub: 'service-1',
  tenantId: 'tenant-1',
  orgId: 'tenant-1',
  roles: [],
  permissions: ['read'],
  type: 'service',
  iat: 0,
  exp: 0,
};

const VALID_TOKEN = 'valid-service-token';

describe('Gateway proxy authentication', () => {
  let app: express.Application;
  let authService: http.Server;
  let downstream: http.Server;
  let authUrl: string;
  let downstreamHits: number;
  let previousAuthUrl: string | undefined;

  const startStub = async (handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<{ server: http.Server; url: string }> => {
    const server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    return { server, url: `http://127.0.0.1:${port}` };
  };

  beforeAll(async () => {
    ({ server: authService, url: authUrl } = await startStub((req, res) => {
      const token = req.headers.authorization?.slice('Bearer '.length);
      if (token === VALID_TOKEN) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, payload: SERVICE_TOKEN_PAYLOAD }));
        return;
      }
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid or expired token' }));
    }));

    ({ server: downstream } = await startStub((req, res) => {
      downstreamHits += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, url: req.url }));
    }));

    gatewayProxy.registerProxy('downstream', `http://127.0.0.1:${(downstream.address() as AddressInfo).port}`);
    gatewayProxy.registerProxy('auth', `http://127.0.0.1:${(downstream.address() as AddressInfo).port}`);

    previousAuthUrl = process.env.AUTH_URL;
    process.env.AUTH_URL = authUrl;

    app = express();
    // Production mounts the proxy router without a body parser — a consumed
    // request stream breaks http-proxy forwarding — so the harness matches.
    app.use('/api', proxyRoutes);
  });

  afterAll(async () => {
    if (previousAuthUrl === undefined) delete process.env.AUTH_URL;
    else process.env.AUTH_URL = previousAuthUrl;
    await new Promise<void>((resolve) => authService.close(() => resolve()));
    await new Promise<void>((resolve) => downstream.close(() => resolve()));
  });

  beforeEach(() => {
    downstreamHits = 0;
  });

  it('rejects unauthenticated proxy requests without reaching the service', async () => {
    const response = await request(app).get('/api/downstream/items');
    expect(response.status).toBe(401);
    expect(downstreamHits).toBe(0);
  });

  it('rejects tokens the auth service does not verify', async () => {
    const response = await request(app)
      .get('/api/downstream/items')
      .set('Authorization', 'Bearer forged-token');
    expect(response.status).toBe(401);
    expect(downstreamHits).toBe(0);
  });

  it('forwards requests carrying a valid service token', async () => {
    const response = await request(app)
      .get('/api/downstream/items')
      .set('Authorization', `Bearer ${VALID_TOKEN}`);
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(downstreamHits).toBe(1);
  });

  it('keeps token-minting auth endpoints public', async () => {
    const response = await request(app).post('/api/auth/login');
    expect(response.status).toBe(200);
    expect(downstreamHits).toBe(1);
  });

  it('keeps health probes public', async () => {
    const response = await request(app).get('/api/downstream/health');
    expect(response.status).toBe(200);
    expect(downstreamHits).toBe(1);
  });

  describe('isPublicProxyPath', () => {
    it('keeps token-minting auth endpoints public and normalizes trailing slashes', () => {
      expect(isPublicProxyPath('auth', 'login')).toBe(true);
      expect(isPublicProxyPath('auth', 'service/auth')).toBe(true);
      expect(isPublicProxyPath('auth', 'refresh/')).toBe(true);
      expect(isPublicProxyPath('auth', 'verify')).toBe(true);
      expect(isPublicProxyPath('downstream', 'health')).toBe(true);
    });

    it('keeps everything else — including auth management endpoints — token-gated', () => {
      expect(isPublicProxyPath('auth', 'users')).toBe(false);
      expect(isPublicProxyPath('auth', 'services')).toBe(false);
      expect(isPublicProxyPath('downstream', 'items')).toBe(false);
      expect(isPublicProxyPath('vault', 'secrets')).toBe(false);
    });
  });
});
