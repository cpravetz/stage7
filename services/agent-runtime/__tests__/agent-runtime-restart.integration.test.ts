import { ChildProcess, spawn } from 'child_process';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import path from 'path';
import { MongoClient } from 'mongodb';

const integrationEnabled = process.env.MONGO_INTEGRATION_TESTS === '1';
const describeMongo = integrationEnabled ? describe : describe.skip;

describeMongo('Agent Runtime Mongo process-restart acceptance', () => {
  let server: Server;
  let mongo: MongoClient;
  let mongoDatabaseCreated = false;
  let mongoDatabase: string;
  let mongoUri: string;
  let agentRuntimePort: number;
  let mockServicePort: number;
  let serviceProcess: ChildProcess | undefined;
  let brainCalls = 0;
  let toolExecutions = 0;
  const brainPrompts: string[] = [];
  const brainSystemPrompts: string[] = [];
  const childOutput: string[] = [];

  jest.setTimeout(90_000);

  beforeAll(async () => {
    mongoUri = process.env.MONGO_URI || '';
    mongoDatabase = process.env.MONGO_DB || '';
    if (
      !mongoUri
      || !/^stage7_agentic_parity_[a-zA-Z0-9_]+$/.test(mongoDatabase)
    ) {
      throw new Error('Mongo integration requires MONGO_URI and a dedicated stage7_agentic_parity_* MONGO_DB');
    }

    mongo = new MongoClient(mongoUri);
    await mongo.connect();
    const databases = await mongo.db('admin').admin().listDatabases();
    if (databases.databases.some((database) => database.name === mongoDatabase)) {
      throw new Error(`Refusing to overwrite existing Mongo integration database ${mongoDatabase}`);
    }

    server = createServer(async (request, response) => {
      const url = new URL(request.url || '/', 'http://localhost');
      response.setHeader('Content-Type', 'application/json');
      if (url.pathname === '/api/tool-executor/tools' && request.method === 'GET') {
        response.end(JSON.stringify({
          tools: [
            { id: 'safe_counter', name: 'Safe Counter', description: 'Record one test event', type: 'code' },
            { id: 'forbidden_action', name: 'Forbidden Action', description: 'Must not be exposed or executed', type: 'code' },
          ],
        }));
        return;
      }
      if (url.pathname === '/api/brain/complete' && request.method === 'POST') {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const body = JSON.parse(Buffer.concat(chunks).toString()) as {
          prompt?: string;
          systemPrompt?: string;
        };
        brainCalls++;
        brainPrompts.push([body.systemPrompt, body.prompt].filter(Boolean).join('\n'));
        brainSystemPrompts.push(body.systemPrompt || '');
        const childVerifier = body.systemPrompt?.includes('You are the child verifier') === true;
        if (body.systemPrompt?.includes('same-tenant memory probe')) {
          response.end(JSON.stringify({ content: 'The persisted guidance was available after restart.', tokensUsed: 4 }));
          return;
        }
        if (body.systemPrompt?.includes('different-tenant memory probe')) {
          response.end(JSON.stringify({ content: 'No other tenant guidance was included.', tokensUsed: 4 }));
          return;
        }
        const parentTurn = brainSystemPrompts.filter((prompt) => !prompt.includes('You are the child verifier')).length;
        const content = childVerifier
          ? 'The saved result confirms exactly one event.'
          : [
            '{"tool":"forbidden_action","args":{}}',
            '{"tool":"safe_counter","args":{"value":"once"}}',
            '{"tool":"__delegate","args":{"goal":"Verify that the recorded event count is one.","role":"verifier","systemPrompt":"You are the child verifier. Check the parent result."}}',
            'The event was recorded exactly once and independently verified.',
          ][parentTurn - 1] || 'Unexpected extra Brain request.';
        response.end(JSON.stringify({ content, tokensUsed: 8 }));
        return;
      }
      if (url.pathname === '/api/tool-executor/tools/execute' && request.method === 'POST') {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const body = JSON.parse(Buffer.concat(chunks).toString()) as {
          id?: string;
          input?: Record<string, unknown>;
        };
        if (body.id !== 'safe_counter' || body.input?.value !== 'once') {
          response.statusCode = 400;
          response.end(JSON.stringify({ error: 'Unexpected or disallowed tool execution' }));
          return;
        }
        toolExecutions++;
        response.end(JSON.stringify({ status: 'completed', output: { eventsRecorded: toolExecutions } }));
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ error: 'Not found' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    mockServicePort = (server.address() as AddressInfo).port;
    agentRuntimePort = await getFreePort();
  });

  afterAll(async () => {
    await stopService();
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
    if (mongoDatabaseCreated) {
      await mongo.db(mongoDatabase).dropDatabase();
    }
    await mongo?.close();
  });

  it('restores a completed task receipt after a real service process restart', async () => {
    const serviceEntrypoint = path.resolve(__dirname, '../../dist/index.js');
    const missionId = `restart-${process.pid}-${Date.now()}`;
    const agentId = `agent-${missionId}`;
    const taskId = `${missionId}:phase-1:task-1`;
    const baseUrl = `http://127.0.0.1:${agentRuntimePort}/api/agent-runtime`;
    const definition = {
      id: agentId,
      tenantId: 'parity-integration-tenant',
      name: 'Restart Acceptance Agent',
      description: 'Exercises policy enforcement and task receipt recovery.',
      type: 'worker',
      systemPrompt: 'Complete the assigned task using only permitted tools.',
      tools: ['safe_counter'],
      toolPolicy: { mode: 'allowlist' },
      metadata: { missionId },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    serviceProcess = await startService(serviceEntrypoint);
    mongoDatabaseCreated = true;
    await registerAndStartAgent(baseUrl, missionId, definition);
    const learningGuidance = 'Verify a permitted tool result before reporting task completion.';
    const learning = await jsonRequest(`${baseUrl}/missions/${missionId}/agents/${agentId}/learnings`, 'POST', {
      domain: 'work',
      guidance: learningGuidance,
      evidence: 'An operator reviewed a prior task receipt and confirmed the action result was useful.',
      source: 'human_feedback',
      sourceRef: `${missionId}:feedback-1`,
      recordedBy: 'parity-test-operator',
      confidence: 0.9,
    });
    expect(learning.tenantId).toBe(definition.tenantId);
    expect(learning.sourceRef).toBe(`${missionId}:feedback-1`);
    await jsonRequest(`${baseUrl}/missions/${missionId}/agents/${agentId}/tasks`, 'POST', {
      taskId,
      type: 'work',
      input: { prompt: 'Record the approved test event once.', context: { domain: 'work' } },
      priority: 1,
      status: 'pending',
    });
    const firstExecution = await jsonRequest(
      `${baseUrl}/missions/${missionId}/agents/${agentId}/tasks/${taskId}/execute`,
      'POST',
      {},
    );

    expect(firstExecution.result.output).toBe('The event was recorded exactly once and independently verified.');
    expect(firstExecution.result.toolCalls).toBe(3);
    expect(toolExecutions).toBe(1);
    expect(brainCalls).toBe(5);
    expect(brainPrompts[0]).toContain('"safe_counter"');
    expect(brainPrompts[0]).not.toContain('Forbidden Action');
    expect(brainPrompts[0]).toContain(learningGuidance);

    await stopService();
    serviceProcess = await startService(serviceEntrypoint);
    await registerAndStartAgent(baseUrl, missionId, definition);
    await jsonRequest(`${baseUrl}/missions/${missionId}/agents/${agentId}/tasks`, 'POST', {
      taskId,
      type: 'work',
      input: { prompt: 'Record the approved test event once.', context: {} },
      priority: 1,
      status: 'pending',
    });
    const recoveredExecution = await jsonRequest(
      `${baseUrl}/missions/${missionId}/agents/${agentId}/tasks/${taskId}/execute`,
      'POST',
      {},
    );

    expect(recoveredExecution.status).toBe('completed');
    expect(recoveredExecution.result.output).toBe('The event was recorded exactly once and independently verified.');
    expect(toolExecutions).toBe(1);
    expect(brainCalls).toBe(5);

    const state = await jsonRequest(`${baseUrl}/missions/${missionId}/agents/${agentId}/state`);
    expect(state.context.taskReceipts[taskId].status).toBe('completed');

    const sameTenantMissionId = `${missionId}-same-tenant`;
    const sameTenantAgentId = `${agentId}-same-tenant`;
    await registerAndStartAgent(baseUrl, sameTenantMissionId, {
      ...definition,
      id: sameTenantAgentId,
      name: 'Same Tenant Memory Probe',
      systemPrompt: 'You are a same-tenant memory probe.',
    });
    const sameTenantTaskId = `${sameTenantMissionId}:task-1`;
    await jsonRequest(`${baseUrl}/missions/${sameTenantMissionId}/agents/${sameTenantAgentId}/tasks`, 'POST', {
      taskId: sameTenantTaskId,
      type: 'work',
      input: { prompt: 'Complete a later task.', context: { domain: 'work' } },
      priority: 1,
      status: 'pending',
    });
    const sameTenantResult = await jsonRequest(
      `${baseUrl}/missions/${sameTenantMissionId}/agents/${sameTenantAgentId}/tasks/${sameTenantTaskId}/execute`,
      'POST',
      {},
    );
    expect(sameTenantResult.result.output).toBe('The persisted guidance was available after restart.');
    const sameTenantPrompt = brainPrompts.find((prompt) => prompt.includes('same-tenant memory probe'));
    expect(sameTenantPrompt).toContain(learningGuidance);

    const otherTenantMissionId = `${missionId}-other-tenant`;
    const otherTenantAgentId = `${agentId}-other-tenant`;
    await registerAndStartAgent(baseUrl, otherTenantMissionId, {
      ...definition,
      id: otherTenantAgentId,
      tenantId: 'other-parity-integration-tenant',
      name: 'Different Tenant Memory Probe',
      systemPrompt: 'You are a different-tenant memory probe.',
    });
    const otherTenantTaskId = `${otherTenantMissionId}:task-1`;
    await jsonRequest(`${baseUrl}/missions/${otherTenantMissionId}/agents/${otherTenantAgentId}/tasks`, 'POST', {
      taskId: otherTenantTaskId,
      type: 'work',
      input: { prompt: 'Complete an isolated task.', context: { domain: 'work' } },
      priority: 1,
      status: 'pending',
    });
    const otherTenantResult = await jsonRequest(
      `${baseUrl}/missions/${otherTenantMissionId}/agents/${otherTenantAgentId}/tasks/${otherTenantTaskId}/execute`,
      'POST',
      {},
    );
    expect(otherTenantResult.result.output).toBe('No other tenant guidance was included.');
    const otherTenantPrompt = brainPrompts.find((prompt) => prompt.includes('different-tenant memory probe'));
    expect(otherTenantPrompt).not.toContain(learningGuidance);
    expect(brainCalls).toBe(7);
  });

  async function registerAndStartAgent(
    baseUrl: string,
    missionId: string,
    definition: Record<string, unknown>,
  ): Promise<void> {
    const metadata = definition.metadata && typeof definition.metadata === 'object'
      ? definition.metadata as Record<string, unknown>
      : {}
    await jsonRequest(`${baseUrl}/missions/${missionId}/agents`, 'POST', {
      ...definition,
      metadata: { ...metadata, missionId },
    });
    await jsonRequest(`${baseUrl}/missions/${missionId}/agents/${String(definition.id)}/start`, 'POST', {});
  }

  async function startService(serviceEntrypoint: string): Promise<ChildProcess> {
    const child = spawn(process.execPath, [serviceEntrypoint], {
      env: {
        ...process.env,
        PORT: String(agentRuntimePort),
        MONGO_URI: mongoUri,
        MONGO_DB: mongoDatabase,
        BRAIN_URL: `http://127.0.0.1:${mockServicePort}`,
        TOOL_EXECUTOR_URL: `http://127.0.0.1:${mockServicePort}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (chunk: Buffer) => childOutput.push(chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => childOutput.push(chunk.toString()));

    try {
      await waitForService(child);
    } catch (error) {
      await stopSpecificService(child);
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n${childOutput.join('').slice(-4_000)}`,
      );
    }
    return child;
  }

  async function waitForService(child: ChildProcess): Promise<void> {
    const deadline = Date.now() + 20_000;
    let lastError: unknown;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Agent Runtime exited early (${child.exitCode})`);
      try {
        const response = await fetch(`http://127.0.0.1:${agentRuntimePort}/api/agent-runtime/health`);
        if (response.ok) return;
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Agent Runtime did not become ready: ${String(lastError || 'timeout')}`);
  }

  async function stopService(): Promise<void> {
    if (!serviceProcess) return;
    await stopSpecificService(serviceProcess);
    serviceProcess = undefined;
  }

  async function stopSpecificService(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null || child.killed) return;
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    let timeout: NodeJS.Timeout | undefined;
    child.kill('SIGTERM');
    await Promise.race([
      exited,
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, 5_000);
      }),
    ]);
    if (timeout) clearTimeout(timeout);
    if (child.exitCode === null) {
      child.kill('SIGKILL');
      await exited;
    }
  }
});

async function getFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  return port;
}

async function jsonRequest<T = any>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) as T : {} as T;
}
