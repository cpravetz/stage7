import { NextFunction, Request, Response } from 'express';
import { NextGenError } from '../src/errors';
import { asyncHandler } from '../src/middleware/asyncHandler';

function request(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    originalUrl: '/api/artifacts/missions/mission-1/plan',
    url: '/api/artifacts/missions/mission-1/plan',
    params: { missionId: 'mission-1' },
    ...overrides,
  } as Request;
}

function response() {
  const res = {
    headersSent: false,
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe('asyncHandler', () => {
  it('reports a known NextGenError with its own status code', async () => {
    const res = response();
    const handler = asyncHandler(async () => {
      throw NextGenError.notFound('Mission not found');
    });

    handler(request(), res, jest.fn() as NextFunction);
    await new Promise((resolve) => setImmediate(resolve));

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: 'Mission not found', statusCode: 404 });
  });

  it('keeps the real failure message instead of masking it as an opaque 500', async () => {
    const res = response();
    const handler = asyncHandler(async () => {
      throw new TypeError("Cannot read properties of undefined (reading 'id')");
    });

    handler(request(), res, jest.fn() as NextFunction);
    await new Promise((resolve) => setImmediate(resolve));

    expect(res.statusCode).toBe(500);
    expect((res.body as { error: string }).error).toContain("reading 'id'");
  });

  it('honours an HTTP status carried by a non-NextGenError', async () => {
    const res = response();
    const handler = asyncHandler(async () => {
      throw Object.assign(new Error('Upstream service error'), { statusCode: 502 });
    });

    handler(request(), res, jest.fn() as NextFunction);
    await new Promise((resolve) => setImmediate(resolve));

    expect(res.statusCode).toBe(502);
    expect(res.body).toMatchObject({ success: false, error: 'Upstream service error', statusCode: 502 });
  });

  it('hands the error to Express when the response has already started', async () => {
    const res = response();
    (res as { headersSent: boolean }).headersSent = true;
    const next = jest.fn() as NextFunction;
    const failure = new Error('stream failed');
    const handler = asyncHandler(async () => {
      throw failure;
    });

    handler(request(), res, next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(next).toHaveBeenCalledWith(failure);
    expect(res.statusCode).toBe(0);
  });
});