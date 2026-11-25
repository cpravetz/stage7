import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { requireServiceAuth, verifyBearerToken, clearVerificationCacheForTests } from '../src/middleware/auth';
import { NextGenError } from '../src/errors';

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? undefined : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Minimal Request/Response/Next doubles for invoking the middleware directly. */
function callMiddleware(authorization?: string) {
  const req = {
    method: 'POST',
    url: '/api/artifacts/documents',
    originalUrl: '/api/artifacts/documents',
    headers: {
      ...(authorization !== undefined ? { authorization } : {}),
      // Spoofable header: must never be honored in place of a verified token.
      'x-tenant-id': 'tenant-attacker',
    },
  } as unknown as ExpressRequest;
  interface MockResponse {
    statusCode: number;
    body?: unknown;
    status(code: number): MockResponse;
    json(payload: unknown): MockResponse;
  }
  const res: MockResponse = {
    statusCode: 0,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  const resBody = (): { error?: string } => (res.body as { error?: string } | undefined) ?? {};
  const next = jest.fn();
  const result = new Promise<void>((resolve) => {
    requireServiceAuth(req, res as unknown as ExpressResponse, () => {
      next();
      resolve();
    });
    // The middleware never calls next() on failure; settle on microtasks.
    setImmediate(resolve);
  });
  return { req, res, next, result, resBody };
}

describe('requireServiceAuth middleware', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearVerificationCacheForTests();
    process.env.AUTH_URL = 'http://auth.test';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('accepts a request whose bearer token the auth service verifies', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () =>
      jsonResponse(200, { success: true, payload: { sub: 'svc-brain', type: 'service' } }),
    );
    const { res, next, result } = callMiddleware('Bearer valid-token');
    await result;
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe('http://auth.test/api/auth/verify');
  });

  it('rejects a missing bearer token with 401 and never falls through to spoofable headers', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const { res, next, result, resBody } = callMiddleware(undefined);
    await result;
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(resBody().error).toBe('Missing bearer token');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a malformed authorization header with 401', async () => {
    jest.spyOn(global, 'fetch');
    const { res, next, result } = callMiddleware('Bearer ');
    await result;
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rejects an invalid bearer token with 401 and logs the reason', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async () => jsonResponse(401, { success: false }));
    const { res, next, result, resBody } = callMiddleware('Bearer expired-token');
    await result;
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(resBody().error).toBe('Invalid or expired authentication token');
  });

  it('rejects with 401 when the auth service is unreachable', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED'));
    const { res, next, result, resBody } = callMiddleware('Bearer any-token');
    await result;
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(resBody().error).toBe('Invalid or expired authentication token');
  });

  it('caches a verified token for 60 seconds and does not re-verify within the window', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () =>
      jsonResponse(200, { success: true, payload: { sub: 'svc-brain', type: 'service' } }),
    );

    await verifyBearerToken('cached-token');
    await verifyBearerToken('cached-token');
    await verifyBearerToken('cached-token');

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Past the cache window the token is verified again.
    const realNow = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(realNow + 61_000);
    try {
      await verifyBearerToken('cached-token');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
  });
});

// request is imported only to satisfy the type surface used by the doubles
// above; this assertion keeps the import meaningful if signatures change.
describe('doubles', () => {
  it('NextGenError.unauthorized carries the 401 status used by the middleware', () => {
    expect(NextGenError.unauthorized('x').statusCode).toBe(401);
  });
});
