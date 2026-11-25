import express from 'express';
import request from 'supertest';
import brainRouter from '../routes/brain';
import { brainInstance } from '../utils/sharedInstance';
import { getSpendGate, SpendLimitReachedError } from '../services/SpendGate';
import type { SpendLimitReachedPayload } from '../services/SpendGate';
import type { UserSpendLimitDoc } from '../data/spendStores';

/**
 * Route contract: the spend-limit refusal maps to HTTP 429 with the spec's
 * exact body, and the per-user limit CRUD answers through the gateway proxy
 * shape (GET/PUT/DELETE /api/brain/spend-limits/me) with the verified user
 * from the bearer token.
 */

jest.mock('../../../../shared-nextgen/src/utils/httpClient', () => ({
  httpRequest: jest.fn(),
  interServiceTimeoutMs: jest.fn(() => 1_000),
}));

import { httpRequest } from '../../../../shared-nextgen/src/utils/httpClient';
const httpRequestMock = httpRequest as jest.Mock;

const app = express();
app.use(express.json());
app.use('/api/brain', brainRouter);

const REFUSAL: SpendLimitReachedPayload = {
  error: 'SPEND_LIMIT_REACHED',
  userId: 'usr_me',
  period: 'month',
  limit: 25,
  spent: 25.03,
  periodEnd: '2026-12-01T00:00:00.000Z',
};

const LIMIT_DOC: UserSpendLimitDoc = {
  userId: 'usr_me',
  limit: 25,
  period: 'month',
  currency: 'USD',
  updatedAt: new Date('2026-11-25T00:00:00Z'),
};

function authHeader(token = 'tok_test'): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

beforeEach(() => {
  httpRequestMock.mockReset();
  jest.restoreAllMocks();
});

describe('POST /api/brain/complete spend refusal', () => {
  it('maps SpendLimitReachedError to HTTP 429 with the exact contract body', async () => {
    jest.spyOn(brainInstance, 'complete').mockRejectedValue(new SpendLimitReachedError(REFUSAL));

    const response = await request(app)
      .post('/api/brain/complete')
      .send({ prompt: 'hello', userId: 'usr_me' });

    expect(response.status).toBe(429);
    expect(response.body).toEqual(REFUSAL);
  });

  it('threads the body userId into the completion options', async () => {
    const complete = jest.spyOn(brainInstance, 'complete').mockResolvedValue({
      content: 'ok', model: 'm', provider: 'p', cached: false, requestId: 'r',
    });

    await request(app)
      .post('/api/brain/complete')
      .send({ prompt: 'hello', userId: 'usr_threaded' });

    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0]?.[1]).toMatchObject({ userId: 'usr_threaded' });
  });

  it('leaves other errors to the generic error mapping', async () => {
    jest.spyOn(brainInstance, 'complete').mockRejectedValue(new Error('provider down'));

    const response = await request(app)
      .post('/api/brain/complete')
      .send({ prompt: 'hello' });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('provider down');
  });
});

describe('GET/PUT/DELETE /api/brain/spend-limits/me', () => {
  it('rejects unauthenticated calls (fail closed)', async () => {
    const response = await request(app).get('/api/brain/spend-limits/me');
    expect(response.status).toBe(401);
  });

  it('returns the stored limit and current usage for the verified user', async () => {
    httpRequestMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/auth/verify')) {
        return { ok: true, status: 200, statusText: 'OK', json: async () => ({ payload: { sub: 'usr_me', tenantId: 't1', type: 'user', roles: [], permissions: [] } }) };
      }
      throw new Error('offline');
    });
    const gate = getSpendGate();
    jest.spyOn(gate, 'getLimit').mockResolvedValue(LIMIT_DOC);
    jest.spyOn(gate, 'usage').mockResolvedValue({
      period: 'month', periodStart: '2026-11-01T00:00:00.000Z', periodEnd: '2026-12-01T00:00:00.000Z', limit: 25, spent: 12.4,
    });

    const response = await request(app).get('/api/brain/spend-limits/me').set(authHeader());

    expect(response.status).toBe(200);
    expect(response.body.limit).toMatchObject({ userId: 'usr_me', limit: 25, period: 'month' });
    expect(response.body.usage).toMatchObject({ spent: 12.4, periodEnd: '2026-12-01T00:00:00.000Z' });
  });

  it('persists a valid PUT for the verified user, ignoring any body identity', async () => {
    httpRequestMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/auth/verify')) {
        return { ok: true, status: 200, statusText: 'OK', json: async () => ({ payload: { sub: 'usr_me', tenantId: 't1', type: 'user', roles: [], permissions: [] } }) };
      }
      throw new Error('offline');
    });
    const gate = getSpendGate();
    const setLimit = jest.spyOn(gate, 'setLimit').mockResolvedValue(LIMIT_DOC);

    const response = await request(app)
      .put('/api/brain/spend-limits/me')
      .set(authHeader())
      .send({ limit: 30, period: 'week', userId: 'usr_spoofed' });

    expect(response.status).toBe(200);
    expect(response.body.limit).toMatchObject({ userId: 'usr_me', limit: 25, period: 'month' });
    expect(setLimit).toHaveBeenCalledWith('usr_me', 30, 'week');
  });

  it('rejects an invalid PUT with a 400 and persists nothing', async () => {
    httpRequestMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/auth/verify')) {
        return { ok: true, status: 200, statusText: 'OK', json: async () => ({ payload: { sub: 'usr_me', tenantId: 't1', type: 'user', roles: [], permissions: [] } }) };
      }
      throw new Error('offline');
    });
    const gate = getSpendGate();
    const setLimit = jest.spyOn(gate, 'setLimit');

    const response = await request(app)
      .put('/api/brain/spend-limits/me')
      .set(authHeader())
      .send({ limit: -5, period: 'fortnight' });

    expect(response.status).toBe(400);
    expect(setLimit).not.toHaveBeenCalled();
  });

  it('clears the limit on DELETE, returning the user to uncapped', async () => {
    httpRequestMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/auth/verify')) {
        return { ok: true, status: 200, statusText: 'OK', json: async () => ({ payload: { sub: 'usr_me', tenantId: 't1', type: 'user', roles: [], permissions: [] } }) };
      }
      throw new Error('offline');
    });
    const gate = getSpendGate();
    const clearLimit = jest.spyOn(gate, 'clearLimit').mockResolvedValue(true);

    const response = await request(app).delete('/api/brain/spend-limits/me').set(authHeader());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ cleared: true });
    expect(clearLimit).toHaveBeenCalledWith('usr_me');
  });
});
