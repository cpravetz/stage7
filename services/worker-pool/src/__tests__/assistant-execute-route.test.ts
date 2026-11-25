import express from 'express';
import request from 'supertest';
import assistantRouter from '../routes/assistants';
import { assistantLoader, assistantExecutor } from '../utils/sharedInstance';
import type { AssistantDefinition, SpendLimitRefusalPayload } from '@stage7-nextgen/shared';

/**
 * Finding B of the OD-5 rework — the execute route maps an assistant run
 * refused by the Brain's spend gate to HTTP 429 with the exact refusal
 * contract body, so the frontend's existing 429 handler (and its
 * limit-reached notice) fires on assistant chat too.
 */

const REFUSAL: SpendLimitRefusalPayload = {
  error: 'SPEND_LIMIT_REACHED',
  userId: 'usr_owner',
  period: 'month',
  limit: 25,
  spent: 25.03,
  periodEnd: '2026-12-01T00:00:00.000Z',
};

function definition(): AssistantDefinition {
  return {
    id: 'assistant-capped',
    tenantId: 'tenant-1',
    name: 'Capped Assistant',
    description: 'An assistant whose owner is capped',
    systemPrompt: 'You are a helpful assistant.',
    tools: [],
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const app = express();
app.use(express.json());
app.use('/api/workers', assistantRouter);

describe('POST /api/workers/assistants/:id/execute spend refusal', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('responds 429 with the exact contract body when the run was refused', async () => {
    jest.spyOn(assistantLoader, 'get').mockReturnValue(definition());
    jest.spyOn(assistantExecutor, 'execute').mockResolvedValue({
      assistantId: 'assistant-capped',
      success: false,
      error: 'Brain returned 429: LLM spending limit reached',
      spendRefusal: REFUSAL,
    });

    const response = await request(app)
      .post('/api/workers/assistants/assistant-capped/execute')
      .send({ prompt: 'Hello' });

    expect(response.status).toBe(429);
    expect(response.body).toEqual(REFUSAL);
  });

  it('keeps a plain failure a 200 result (no fabricated refusals)', async () => {
    jest.spyOn(assistantLoader, 'get').mockReturnValue(definition());
    jest.spyOn(assistantExecutor, 'execute').mockResolvedValue({
      assistantId: 'assistant-capped',
      success: false,
      error: 'Brain returned 503: provider down',
    });

    const response = await request(app)
      .post('/api/workers/assistants/assistant-capped/execute')
      .send({ prompt: 'Hello' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(false);
    expect(response.body.spendRefusal).toBeUndefined();
  });

  it('keeps a successful run a 200 result', async () => {
    jest.spyOn(assistantLoader, 'get').mockReturnValue(definition());
    jest.spyOn(assistantExecutor, 'execute').mockResolvedValue({
      assistantId: 'assistant-capped',
      success: true,
      output: 'done',
    });

    const response = await request(app)
      .post('/api/workers/assistants/assistant-capped/execute')
      .send({ prompt: 'Hello' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});

describe('POST /api/workers/assistants/:id/tools/execute spend refusal', () => {
  const tool = { name: 'reasoner', arguments: {} as Record<string, unknown> };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('responds 429 with the exact contract body when the tool run was refused', async () => {
    jest.spyOn(assistantExecutor, 'executeToolCall').mockResolvedValue({
      content: [{ type: 'text', text: 'LLM spending limit reached: 25.03 of 25 USD spent this month' }],
      isError: true,
      spendRefusal: REFUSAL,
    });

    const response = await request(app)
      .post('/api/workers/assistants/assistant-capped/tools/execute')
      .send(tool);

    expect(response.status).toBe(429);
    expect(response.body).toEqual(REFUSAL);
  });

  it('keeps a plain tool failure a 200 result (no fabricated refusals)', async () => {
    jest.spyOn(assistantExecutor, 'executeToolCall').mockResolvedValue({
      content: [{ type: 'text', text: 'Tool executor returned 500: boom' }],
      isError: true,
    });

    const response = await request(app)
      .post('/api/workers/assistants/assistant-capped/tools/execute')
      .send(tool);

    expect(response.status).toBe(200);
    expect(response.body.isError).toBe(true);
    expect(response.body.spendRefusal).toBeUndefined();
  });

  it('keeps a successful tool run a 200 result', async () => {
    jest.spyOn(assistantExecutor, 'executeToolCall').mockResolvedValue({
      content: [{ type: 'text', text: '{"ok":true}' }],
    });

    const response = await request(app)
      .post('/api/workers/assistants/assistant-capped/tools/execute')
      .send(tool);

    expect(response.status).toBe(200);
    expect(response.body.isError).toBeUndefined();
  });
});
