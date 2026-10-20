import { ChildProcess, spawn } from 'child_process';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import path from 'path';
import { AddressInfo } from 'net';

const describeProcess = describe;

describeProcess('direct Temporal process-restart acceptance', () => {
  let artifactsServer: Server;
  let artifactsPort: number;
  let temporalPort: number;
  let child: ChildProcess | undefined;
  let missionState: Record<string, unknown> | undefined;
  let missionPlan: Record<string, any>;
  let lease: { ownerId: string; expiresAt: number } | undefined;
  let sideEffectCount = 0;
  let waitAtTaskBoundary: () => void = () => {};
  let releaseTask: () => void = () => {};
  let taskBoundaryReached = new Promise<void>((resolve) => { waitAtTaskBoundary = resolve; });
  let releaseTaskPromise = new Promise<void>((resolve) => { releaseTask = resolve; });
  const eventTypes: string[] = [];

  jest.setTimeout(90_000);

  beforeAll(async () => {
    artifactsServer = createServer(async (request, response) => {
      const url = new URL(request.url || '/', 'http://localhost');
      const body = await readJsonBody(request);
      response.setHeader('Content-Type', 'application/json');

      if (url.pathname === '/test/effect' && request.method === 'POST') {
        sideEffectCount++;
        return respond(response, 200, { recorded: true });
      }
      if (url.pathname === '/test/wait-for-release') {
        waitAtTaskBoundary();
        await releaseTaskPromise;
        return respond(response, 200, { released: true });
      }
      if (url.pathname === '/test/task-completed' && request.method === 'POST') {
        const task = missionPlan.phases[0].tasks[0];
        task.status = 'completed';
        task.output = 'Task result was persisted before pausing.';
        missionPlan.phases[0].status = 'completed';
        return respond(response, 200, {});
      }

      if (url.pathname === '/api/artifacts/missions' && request.method === 'POST') {
        missionState = body;
        return respond(response, 201, body);
      }
      if (url.pathname === '/api/artifacts/missions' && request.method === 'GET') {
        return respond(response, 200, { missions: missionState ? [missionState] : [] });
      }

      const missionMatch = url.pathname.match(/^\/api\/artifacts\/missions\/([^/]+)(?:\/(.*))?$/);
      if (!missionMatch) return respond(response, 404, { error: 'Not found' });
      const missionId = decodeURIComponent(missionMatch[1]!);
      const suffix = missionMatch[2] || '';

      if (suffix === 'recovery-lease' && request.method === 'POST') {
        const action = body.action;
        if (action === 'claim') {
          const now = Date.now();
          const claimed = !lease || lease.expiresAt <= now || lease.ownerId === body.ownerId;
          if (claimed) {
            lease = {
              ownerId: body.ownerId,
              expiresAt: now + body.leaseDurationMs,
            };
          }
          return respond(response, 200, { claimed });
        }
        if (action === 'renew') {
          if (lease && lease.ownerId === body.ownerId) {
            lease.expiresAt = Date.now() + Number(body.leaseDurationMs);
            return respond(response, 200, { renewed: true });
          }
          return respond(response, 200, { renewed: false });
        }
        if (action === 'release') {
          const released = lease?.ownerId === body.ownerId;
          if (released) lease = undefined;
          return respond(response, 200, { released });
        }
        return respond(response, 400, { error: 'Invalid lease action' });
      }
      if (suffix === 'plan' && request.method === 'GET') {
        return respond(response, 200, missionPlan);
      }
      if (suffix === 'plan' && request.method === 'PUT') {
        missionPlan = body;
        return respond(response, 200, missionPlan);
      }
      if (suffix === 'events' && request.method === 'POST') {
        eventTypes.push(String(body.type));
        return respond(response, 201, { recorded: true });
      }
      if (suffix && request.method === 'GET') {
        return respond(response, 404, { error: 'Not found' });
      }
      if (!missionState || missionState.missionId !== missionId) {
        return respond(response, 404, { error: 'Mission not found' });
      }
      if (request.method === 'GET') return respond(response, 200, missionState);
      if (request.method === 'PUT') {
        missionState = { ...missionState, ...body, updatedAt: Date.now() };
        return respond(response, 200, missionState);
      }
      return respond(response, 405, { error: 'Method not allowed' });
    });

    missionPlan = {
      summary: 'Complete one durable task',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      phases: [{
        id: 'phase-1',
        name: 'Work',
        goal: 'Complete and persist the task before pausing.',
        requiresApproval: false,
        status: 'in_progress',
        tasks: [{
          id: 'task-1',
          title: 'Record test side effect',
          description: 'Record the test side effect once.',
          agentRole: 'worker',
          systemPrompt: 'Record the test side effect once.',
          expectedArtifacts: [],
          status: 'pending',
          artifacts: [],
        }],
      }],
    };

    await new Promise<void>((resolve) => artifactsServer.listen(0, '127.0.0.1', resolve));
    artifactsPort = (artifactsServer.address() as AddressInfo).port;
    temporalPort = await getFreePort();
  });

  afterAll(async () => {
    await stopChild();
    if (artifactsServer?.listening) {
      await new Promise<void>((resolve, reject) => {
        artifactsServer.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it('finishes and persists the current task, pauses, and resumes in a new process without duplicating the effect', async () => {
    const missionId = `temporal-restart-${process.pid}-${Date.now()}`;
    const workflowId = `mission-${missionId}`;
    const temporalBase = `http://127.0.0.1:${temporalPort}/api/temporal`;
    const childPath = path.resolve(__dirname, 'fixtures/mission-control-child.cjs');
    child = await startChild(childPath);

    const started = await jsonRequest(`${temporalBase}/missions`, 'POST', {
      missionId,
      tenantId: 'parity-integration-tenant',
      assistantId: 'parity-integration-assistant',
      prompt: 'Run the process restart acceptance test.',
    });
    expect(started.workflowId).toBe(workflowId);
    await taskBoundaryReached;
    expect(sideEffectCount).toBe(1);

    await jsonRequest(`${temporalBase}/missions/${workflowId}/pause`, 'POST', {});
    releaseTask();
    await waitFor(() => missionState?.status === 'paused' && missionState?.controlState === 'paused');
    expect(missionPlan.phases[0].tasks[0].status).toBe('completed');

    await stopChild();
    child = await startChild(childPath);
    const blockedResume = await fetch(`${temporalBase}/missions/${workflowId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(blockedResume.status).toBe(409);
    lease!.expiresAt = 0;

    const resumed = await jsonRequest<{ status: string }>(
      `${temporalBase}/missions/${workflowId}/start`,
      'POST',
      {},
    );
    expect(resumed.status).toBe('resuming');
    await waitFor(() => missionState?.status === 'completed');

    expect(sideEffectCount).toBe(1);
    expect(missionState?.controlState).toBe('running');
    expect(missionState?.output).toEqual(expect.objectContaining({
      outputs: expect.objectContaining({ result: 'resumed without repeating the task' }),
    }));
    expect(eventTypes).toEqual(expect.arrayContaining([
      'mission_started',
      'mission_paused',
      'mission_resumed',
      'mission_completed',
    ]));
  });

  async function startChild(childPath: string): Promise<ChildProcess> {
    const childProcess = spawn(process.execPath, [childPath], {
      env: {
        ...process.env,
        PORT: String(temporalPort),
        TEMPORAL_BACKEND: 'direct',
        ARTIFACTS_URL: `http://127.0.0.1:${artifactsPort}`,
        PARITY_FIXTURE_URL: `http://127.0.0.1:${artifactsPort}`,
        GATEWAY_URL: '',
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    await waitFor(async () => {
      if (childProcess.exitCode !== null) throw new Error(`Temporal process exited (${childProcess.exitCode})`);
      const response = await fetch(`http://127.0.0.1:${temporalPort}/api/temporal/health`);
      return response.ok;
    });
    return childProcess;
  }

  async function stopChild(): Promise<void> {
    if (!child || child.exitCode !== null) return;
    const current = child;
    child = undefined;
    current.kill('SIGKILL');
    await new Promise<void>((resolve) => {
      if (current.exitCode !== null) return resolve();
      current.once('exit', () => resolve());
    });
  }
});

async function readJsonBody(request: IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString();
  return raw ? JSON.parse(raw) as Record<string, any> : {};
}

function respond(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.end(JSON.stringify(body));
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

async function getFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  return port;
}

async function waitFor(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 15_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for Temporal process state: ${String(lastError || 'condition not reached')}`);
}
