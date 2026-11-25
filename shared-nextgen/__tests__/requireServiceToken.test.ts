import request from 'supertest';
import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import { requireServiceToken, verifyTokenWithAuthService } from '../src/middleware/requireServiceToken';
import { TokenPayload } from '../src/types/auth';

const SERVICE_PAYLOAD: TokenPayload = {
  sub: 'service-1',
  tenantId: 'tenant-1',
  orgId: 'tenant-1',
  roles: [],
  permissions: ['read'],
  type: 'service',
  iat: 0,
  exp: 0,
};

const USER_PAYLOAD: TokenPayload = { ...SERVICE_PAYLOAD, sub: 'user-1', type: 'user' };

describe('requireServiceToken', () => {
  let authService: http.Server;
  let authUrl: string;
  let previousAuthUrl: string | undefined;
  let seenAuthHeader: string | undefined;

  const buildApp = (middleware: RequestHandler): express.Application => {
    const app = express();
    app.use(express.json());
    app.get('/protected', middleware, (req: Request, res: Response) => {
      res.json({ ok: true, payload: req.serviceTokenPayload ?? null });
    });
    return app;
  };

  beforeAll(async () => {
    authService = http.createServer((req, res) => {
      seenAuthHeader = req.headers.authorization;
      const token = seenAuthHeader?.slice('Bearer '.length);
      if (token === 'valid-service-token') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, payload: SERVICE_PAYLOAD }));
        return;
      }
      if (token === 'valid-user-token') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, payload: USER_PAYLOAD }));
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

  it('rejects requests without a bearer token', async () => {
    const response = await request(buildApp(requireServiceToken())).get('/protected');
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Missing bearer token');
  });

  it('rejects requests with a malformed authorization header', async () => {
    const response = await request(buildApp(requireServiceToken()))
      .get('/protected')
      .set('Authorization', 'Basic abc');
    expect(response.status).toBe(401);
  });

  it('rejects tokens the auth service does not verify', async () => {
    const response = await request(buildApp(requireServiceToken()))
      .get('/protected')
      .set('Authorization', 'Bearer forged');
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid or expired authentication token');
  });

  it('forwards the bearer token to the auth service and attaches the payload', async () => {
    const app = buildApp(requireServiceToken({ authServiceUrl: authUrl }));
    const response = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid-service-token');
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.payload.sub).toBe('service-1');
    expect(response.body.payload.type).toBe('service');
    expect(seenAuthHeader).toBe('Bearer valid-service-token');
  });

  it('accepts user tokens by default so login-issued tokens keep working', async () => {
    const app = buildApp(requireServiceToken({ authServiceUrl: authUrl }));
    const response = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid-user-token');
    expect(response.status).toBe(200);
    expect(response.body.payload.type).toBe('user');
  });

  it('rejects token types outside acceptedTypes', async () => {
    const app = buildApp(requireServiceToken({ authServiceUrl: authUrl, acceptedTypes: ['service'] }));
    const response = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid-user-token');
    expect(response.status).toBe(403);
  });

  it('fails closed when the auth service is unreachable', async () => {
    const app = buildApp(requireServiceToken({ authServiceUrl: 'http://127.0.0.1:1' }));
    const response = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid-service-token');
    expect(response.status).toBe(401);
  });

  it('verifyTokenWithAuthService resolves the payload and undefined on rejection', async () => {
    await expect(verifyTokenWithAuthService('valid-service-token')).resolves.toMatchObject({ sub: 'service-1' });
    await expect(verifyTokenWithAuthService('forged')).resolves.toBeUndefined();
  });

  it('calls next with the error surface as a 401 response, never an unhandled rejection', async () => {
    const app = express();
    const crashingNext: NextFunction = jest.fn();
    app.use('/protected', requireServiceToken(), crashingNext);
    const response = await request(app).get('/protected');
    expect(response.status).toBe(401);
    expect(crashingNext).not.toHaveBeenCalled();
  });
});
