import http from 'http';
import express from 'express';
import { AddressInfo } from 'net';
import request from 'supertest';
import { NextGenError } from '@stage7-nextgen/shared';
import { resolveTenantContext } from '../utils/tenant';

/**
 * Tenant resolution must never trust a client-supplied X-Tenant-Id header:
 * identity comes only from a bearer token the auth service verifies, with
 * query/body remaining as explicit internal fallbacks.
 */
describe('vault tenant resolution', () => {
  let authService: http.Server;
  let authUrl: string;
  let previousAuthUrl: string | undefined;

  beforeAll(async () => {
    authService = http.createServer((req, res) => {
      const token = req.headers.authorization?.slice('Bearer '.length);
      if (token === 'valid-token') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          payload: { sub: 'user-1', tenantId: 'tenant-verified', orgId: 'org-1', type: 'user' },
        }));
        return;
      }
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false }));
    });
    await new Promise<void>((resolve) => authService.listen(0, '127.0.0.1', resolve));
    authUrl = `http://127.0.0.1:${(authService.address() as AddressInfo).port}`;
    previousAuthUrl = process.env.AUTH_URL;
    process.env.AUTH_URL = authUrl;
  });

  afterAll(async () => {
    if (previousAuthUrl === undefined) delete process.env.AUTH_URL;
    else process.env.AUTH_URL = previousAuthUrl;
    await new Promise<void>((resolve) => authService.close(() => resolve()));
  });

  it('resolves the tenant from a verified bearer token', async () => {
    const app = express();
    app.use(express.json());
    app.get('/probe', async (req, res) => {
      try {
        res.json(await resolveTenantContext(req));
      } catch (err) {
        res.status(err instanceof NextGenError ? err.statusCode : 500).json({ error: String(err) });
      }
    });
    const response = await request(app)
      .get('/probe')
      .set('Authorization', 'Bearer valid-token');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ tenantId: 'tenant-verified', source: 'bearer', subject: 'user-1' });
  });

  it('throws unauthorized when the bearer token is rejected', async () => {
    const app = express();
    app.use(express.json());
    app.get('/probe', async (req, res) => {
      try {
        res.json(await resolveTenantContext(req));
      } catch (err) {
        res.status(err instanceof NextGenError ? err.statusCode : 500).json({ error: String(err) });
      }
    });
    const response = await request(app)
      .get('/probe')
      .set('Authorization', 'Bearer forged');
    expect(response.status).toBe(401);
  });

  it('does not trust the X-Tenant-Id header alone', async () => {
    const app = express();
    app.use(express.json());
    app.get('/probe', async (req, res) => {
      const context = await resolveTenantContext(req);
      res.json(context ?? null);
    });
    const response = await request(app)
      .get('/probe')
      .set('X-Tenant-Id', 'tenant-spoofed');
    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
  });

  it('still resolves explicit query and body fallbacks for internal callers', async () => {
    const app = express();
    app.use(express.json());
    app.all('/probe', async (req, res) => {
      const context = await resolveTenantContext(req);
      res.json(context ?? null);
    });
    const queryResponse = await request(app).get('/probe?tenantId=tenant-q');
    expect(queryResponse.body).toMatchObject({ tenantId: 'tenant-q', source: 'query' });

    const bodyResponse = await request(app).post('/probe').send({ tenantId: 'tenant-b' });
    expect(bodyResponse.body).toMatchObject({ tenantId: 'tenant-b', source: 'body' });
  });
});
