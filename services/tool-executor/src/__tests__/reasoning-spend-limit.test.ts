import express from 'express';
import request from 'supertest';
import { ReasoningExecutor } from '../executors/ReasoningExecutor';
import { SpendLimitReachedError } from '../utils/errors';
import { toolExecutorErrorMiddleware } from '../utils/errorMiddleware';
import type { SpendLimitRefusalPayload } from '@stage7-nextgen/shared';
import type { Tool } from '../types';

/**
 * OD-5 finding B, backend half: a reasoning tool's LLM completion refused by
 * the Brain's spend gate must surface as HTTP 429 with the exact contract
 * body — never a generic 500 — while malformed bodies and other failures stay
 * plain errors.
 */

const REFUSAL: SpendLimitRefusalPayload = {
  error: 'SPEND_LIMIT_REACHED',
  userId: 'usr_owner',
  period: 'month',
  limit: 25,
  spent: 25.03,
  periodEnd: '2026-12-01T00:00:00.000Z',
};

const tool = {
  id: 'reasoner-1',
  name: 'reasoner',
  description: 'A reasoning tool',
  type: 'reasoning',
  manifest: {},
} as Tool;

let fetchMock: jest.SpyInstance;

function mockBrain(status: number, body: string): void {
  fetchMock.mockImplementation(async () => new Response(body, {
    status,
    statusText: status === 429 ? 'Too Many Requests' : 'Internal Server Error',
    headers: { 'Content-Type': 'application/json' },
  }));
}

beforeEach(() => {
  fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response('{}', { status: 500 }));
});

afterEach(() => {
  fetchMock.mockRestore();
});

describe('ReasoningExecutor spend-limit preservation', () => {
  let executor: ReasoningExecutor;

  beforeEach(() => {
    executor = new ReasoningExecutor();
  });

  it('throws SpendLimitReachedError carrying the exact contract body on a Brain 429', async () => {
    mockBrain(429, JSON.stringify(REFUSAL));
    await expect(executor.execute(tool, {})).rejects.toThrow(SpendLimitReachedError);
    // Re-run to inspect the error instance (rejects.toThrow above proves the type).
    let caught: unknown;
    try {
      await executor.execute(tool, {});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SpendLimitReachedError);
    expect((caught as SpendLimitReachedError).payload).toEqual(REFUSAL);
  });

  it('does not fabricate a refusal from a malformed 429 body', async () => {
    mockBrain(429, JSON.stringify({ error: 'SPEND_LIMIT_REACHED' }));
    const promise = executor.execute(tool, {});
    await expect(promise).rejects.toThrow('Brain returned 429');
    let caught: unknown;
    try {
      await promise.catch((err) => { throw err; });
    } catch (err) {
      caught = err;
    }
    expect(caught).not.toBeInstanceOf(SpendLimitReachedError);
  });

  it('does not fabricate a refusal from a non-JSON 429 body', async () => {
    mockBrain(429, 'rate limited');
    await expect(executor.execute(tool, {})).rejects.toThrow('Brain returned 429');
    try {
      await executor.execute(tool, {});
      throw new Error('expected a throw');
    } catch (err) {
      expect(err).not.toBeInstanceOf(SpendLimitReachedError);
    }
  });

  it('keeps non-429 Brain failures plain errors', async () => {
    mockBrain(500, JSON.stringify({ error: 'provider down' }));
    let caught: unknown;
    try {
      await executor.execute(tool, {});
      throw new Error('expected a throw');
    } catch (err) {
      caught = err;
    }
    expect(caught).not.toBeInstanceOf(SpendLimitReachedError);
    expect((caught as Error).message).toContain('Brain returned 500');
  });
});

describe('tool-executor error middleware spend-limit mapping', () => {
  const app = express();
  app.use(express.json());
  app.post('/throw-refusal', () => {
    throw new SpendLimitReachedError(REFUSAL);
  });
  app.post('/throw-generic', () => {
    throw new Error('boom');
  });
  app.use(toolExecutorErrorMiddleware);

  it('answers 429 with the exact contract body for a spend refusal', async () => {
    const response = await request(app).post('/throw-refusal');
    expect(response.status).toBe(429);
    expect(response.body).toEqual(REFUSAL);
  });

  it('keeps generic errors a 500', async () => {
    const response = await request(app).post('/throw-generic');
    expect(response.status).toBe(500);
    expect(response.body.spendRefusal).toBeUndefined();
    expect(response.body.error).toBe('boom');
  });
});

describe('ToolExecutor rethrows the spend refusal instead of converting it to a failed execution', () => {
  it('propagates SpendLimitReachedError out of executeOrRequestCredentials', async () => {
    const { ToolExecutor } = await import('../services/ToolExecutor');
    const toolExecutor = new ToolExecutor();
    jest
      .spyOn((toolExecutor as unknown as { dispatcher: { dispatch: () => Promise<never> } }).dispatcher, 'dispatch')
      .mockRejectedValue(new SpendLimitReachedError(REFUSAL));

    let caught: unknown;
    try {
      await toolExecutor.executeOrRequestCredentials(tool, {});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SpendLimitReachedError);
    expect((caught as SpendLimitReachedError).payload).toEqual(REFUSAL);
  });
});
