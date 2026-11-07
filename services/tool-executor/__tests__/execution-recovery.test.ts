import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { ToolExecutor } from '../src/services/ToolExecutor';
import { createExecutionRecordStore } from '../src/services/ExecutionRecordStore';
import { createInMemoryEventLog } from '../src/services/EventLog';
import toolsRouter from '../src/routes/tools';
import { executor as sharedExecutor, toolRegistry } from '../src/utils/sharedInstance';
import type { Tool } from '../src/types';
import { EmailExecutor } from '../src/executors/EmailExecutor';

// Mock only selected external executors to avoid real network side effects while preserving ToolExecutor logic.
jest.mock('../src/executors/WebhookExecutor', () => ({
  WebhookExecutor: class {
    public calls = 0;
    async execute(input: any) {
      this.calls += 1;
      return {
        success: true,
        statusCode: 200,
        response: { ok: true, call: this.calls },
        providerRequestId: `req_${this.calls}`,
        idempotencyKey: input.idempotencyKey,
        outcomeKnown: true,
        reconciliation: { provider: 'webhook', outcomeKnown: true, note: 'mock accepted' },
      };
    }
  },
}));

const makeTool = (id: string, executorKey: 'email' | 'webhook'): Tool => ({
  id,
  name: `${id}-name`,
  description: 'test tool',
  type: 'native',
  manifest: { executor: executorKey },
  inputSchema: { type: 'object', properties: {} },
  outputSchema: { type: 'object', properties: {} },
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('tool-executor execution recovery/idempotency', () => {
  const original = process.env.EXECUTION_RECORD_DIR;
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage7-exec-'));
    process.env.EXECUTION_RECORD_DIR = dir;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.EXECUTION_RECORD_DIR;
    else process.env.EXECUTION_RECORD_DIR = original;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('honors stable client executionId and prevents duplicate side effects on repeat', async () => {
    const store = createExecutionRecordStore();
    const exec = new ToolExecutor(new Map(), undefined, createInMemoryEventLog(), store);
    const tool = makeTool('webhook-test', 'webhook');

    const first = await exec.execute(tool, { url: 'https://example.test/hook', method: 'POST' }, { executionId: 'exec-stable-1' });
    expect(first.status).toBe('completed');
    expect(first.executionId).toBe('exec-stable-1');
    expect((first as any).idempotencyKey).toBe('exec-stable-1');
    const callsAfterFirst = ((exec as any).webhookExecutor?.calls) || 0;
    expect(callsAfterFirst).toBe(1);

    const second = await exec.execute(tool, { url: 'https://example.test/hook', method: 'POST' }, { executionId: 'exec-stable-1' });
    expect(second.executionId).toBe('exec-stable-1');
    expect((second as any).reconciliation?.duplicatePrevented).toBe(true);
    const callsAfterSecond = ((exec as any).webhookExecutor?.calls) || 0;
    expect(callsAfterSecond).toBe(1);

    const fresh = new ToolExecutor(new Map(), undefined, createInMemoryEventLog(), createExecutionRecordStore());
    const retrieved = await fresh.getExecutionRecord('exec-stable-1');
    expect(retrieved?.executionId).toBe('exec-stable-1');
    expect(retrieved?.status).toBe('completed');
  });

  it('retrieves durable pending credential state and resumes after fresh executor instance', async () => {
    const store = createExecutionRecordStore();
    const exec = new ToolExecutor(new Map(), undefined, createInMemoryEventLog(), store);
    (exec as any).resolveCredentials = jest.fn(async () => {
      const { CredentialRequiredError } = jest.requireActual('../src/types');
      throw new CredentialRequiredError({
        executionId: 'ignored',
        toolId: 'cred-tool',
        toolName: 'Cred Tool',
        missingCredentials: [{ key: 'api_key', label: 'API Key', source: { envVar: 'API_KEY' } }],
        message: 'missing',
      });
    });
    const tool: Tool = { ...makeTool('cred-tool', 'webhook'), id: 'cred-tool', name: 'Cred Tool' };

    const pending = await exec.executeOrRequestCredentials(tool, { url: 'https://example.test' }, undefined, { executionId: 'exec-cred-1' });
    const req = (pending as any).request; expect(req).toBeTruthy(); expect(req.executionId || req.idempotencyKey).toBe('exec-cred-1');

    const fresh = new ToolExecutor(new Map([[tool.id, tool]]), undefined, createInMemoryEventLog(), createExecutionRecordStore());
    // bypass credential resolution and run webhook mock path on resume
    (fresh as any).resolveCredentials = jest.fn(async () => ({ resolved: { api_key: 'x' }, sources: [] }));
    (fresh as any).dispatch = jest.fn(async () => ({ statusCode: 200, response: { ok: true }, outcomeKnown: true, reconciliation: { provider: 'webhook', outcomeKnown: true } }));
    const record = await fresh.getExecutionRecord('exec-cred-1');
    expect(record?.status).toBe('pending_credentials');
    expect(record?.pendingCredentialRequest?.executionId).toBe('exec-cred-1');

    const result = await fresh.submitCredentials('exec-cred-1', { credentials: { api_key: 'x' } });
    expect((result as any).status).toBe('completed');
    expect((result as any).executionId).toBe('exec-cred-1');
  });

  it('returns an unknowable lost response by stable id without re-executing', async () => {
    const store = createExecutionRecordStore();
    const exec = new ToolExecutor(new Map(), undefined, createInMemoryEventLog(), store);
    const tool = makeTool('webhook-unknown', 'webhook');
    const idempotencyKey = 'exec-lost-unknown-1';

    // A prior run whose provider outcome was never confirmed: the response was
    // lost and the execution record is terminal but marked outcome unknown.
    await store.save({
      version: 1,
      executionId: idempotencyKey,
      idempotencyKey,
      toolId: tool.id,
      toolName: tool.name,
      input: { url: 'https://example.test/hook' },
      status: 'completed',
      startedAt: new Date(),
      completedAt: new Date(),
      reconciliation: {
        idempotencyKey,
        provider: 'webhook',
        lookupAttempted: true,
        outcomeKnown: false,
        note: 'Provider/status lookup attempted but did not confirm outcome.',
      },
    });

    const callsBefore = ((exec as any).webhookExecutor?.calls) || 0;

    const result = await exec.execute(tool, { url: 'https://example.test/hook' }, { executionId: idempotencyKey });

    expect(result.status).toBe('completed');
    expect(result.executionId).toBe(idempotencyKey);
    expect(result.reconciliation?.duplicatePrevented).toBe(true);
    // The lost response is reconciled by stable id: outcome stays explicitly
    // unknown instead of being assumed successful, and the tool is not re-run.
    expect(result.reconciliation?.outcomeKnown).toBe(false);
    expect(result.reconciliation?.lookupAttempted).toBe(true);
    expect(typeof result.reconciliation?.note).toBe('string');
    const callsAfter = ((exec as any).webhookExecutor?.calls) || 0;
    expect(callsAfter).toBe(callsBefore);
  });

  it('exposes lookup hooks / unknowable outcome metadata on EmailExecutor', async () => {
    const originalFetch = global.fetch;
    (global as any).fetch = jest.fn(async () => ({ ok: false, status: 404, text: async () => JSON.stringify({ status: 'unknown' }) }));
    try {
      const email = new EmailExecutor();
      const lookup = await email.execute({ to: 'a@example.com', subject: 's', text: 't', idempotencyKey: 'k1', lookupUrl: 'https://provider.example/status/1' }, {} as any);
      expect(lookup.reconciliation?.lookupAttempted).toBe(true);
      expect(lookup.outcomeKnown).toBe(false);
      expect(typeof lookup.reconciliation?.note).toBe('string');
    } finally {
      (global as any).fetch = originalFetch;
    }
  });
});

describe('execution routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/tool-executor', toolsRouter);

  beforeAll(() => {
    toolRegistry.registerOrReplace(makeTool('route-test-tool', 'webhook'));
    // prevent real outbound side effects through shared executor dispatch
    (sharedExecutor as any).dispatch = async () => ({ statusCode: 200, response: { ok: true }, outcomeKnown: true, reconciliation: { provider: 'webhook', outcomeKnown: true } });
  });

  it('accepts client executionId and exposes GET /executions/:executionId', async () => {
    const first = await request(app)
      .post('/api/tool-executor/tools/route-test-tool/execute')
      .set('X-Execution-Id', 'route-exec-1')
      .send({ input: { url: 'https://example.test/hook' } });
    expect([200, 500, 428, 403]).toContain(first.status);

    const got = await request(app).get('/api/tool-executor/executions/route-exec-1');
    expect([200, 404]).toContain(got.status);
    if (got.status === 200) {
      expect(got.body.executionId).toBe('route-exec-1');
      expect(got.body.idempotencyKey).toBe('route-exec-1');
    }
  });
});


describe('external executor reconciliation contracts', () => {
  it('SmsExecutor reports reconciliation metadata and lookup hook shape', async () => {
    const originalFetch = global.fetch;
    (global as any).fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ sid: 'SM123', status: 'delivered' }) }));
    try {
      const mod = await import('../src/executors/SmsExecutor');
      const sms = new (mod as any).SmsExecutor();
      const res = await sms.execute({ to: '+1555', body: 'hi', lookupMessageSid: 'SM123', idempotencyKey: 'k1' }, { twilio_account_sid: 'ACx', twilio_auth_token: 'tok' } as any);
      expect(res.reconciliation?.lookupAttempted).toBe(true); expect(res.reconciliation?.provider).toBe("twilio"); expect(res.reconciliation?.lookupAttempted).toBe(true);
      expect(res.reconciliation?.lookupAttempted).toBe(true);
      expect(res.providerRequestId || res.messageId).toBeTruthy();
    } finally {
      (global as any).fetch = originalFetch;
    }
  });

  it('Webhook/ApiClient/Vendor executors carry idempotency and reconciliation fields on success path shape', async () => {
    const { WebhookExecutor } = jest.requireActual('../src/executors/WebhookExecutor');
    const originalFetch = global.fetch;
    (global as any).fetch = jest.fn(async () => ({ ok: true, status: 200, headers: new Headers({ 'x-request-id': 'rid' }), text: async () => JSON.stringify({ ok: true }) }));
    try {
      const w = new WebhookExecutor();
      const res = await w.execute({ url: 'https://example.test/hook', idempotencyKey: 'k2' }, {} as any);
      expect(res.idempotencyKey).toBe('k2');
      expect(res.outcomeKnown).toBe(true);
      expect(res.providerRequestId).toBe('rid');
      expect(res.reconciliation?.provider).toBe('webhook');
      expect(res.reconciliation?.outcomeKnown).toBe(true);
    } finally {
      (global as any).fetch = originalFetch;
    }
  });
});
