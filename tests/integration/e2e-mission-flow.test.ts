import http from 'http';
import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';

import artifactsMissionRoutes from '../../services/artifacts/src/routes/missions';
import artifactsAgentRoutes from '../../services/artifacts/src/routes/agents';
import artifactsDocumentRoutes from '../../services/artifacts/src/routes/documents';
import agentRoutes from '../../services/agent-runtime/src/routes/agents';
import workerPoolAssistantRoutes from '../../services/worker-pool/src/routes/assistants';
import temporalRoutes from '../../services/temporal/src/routes/missions';
import gatewayRoutes from '../../services/gateway/src/routes/gateway';
import messagingRoutes from '../../services/gateway/src/routes/messaging';
import { WebSocketGateway } from '../../services/gateway/src/services/WebSocketGateway';
import { setWsGateway } from '../../services/gateway/src/utils/sharedInstances';

describe('Integration: End-to-End Mission Flow', () => {
  let persistenceServer: http.Server;
  let agentRuntimeServer: http.Server;
  let workerPoolServer: http.Server;
  let gatewayServer: http.Server;
  let wsGateway: WebSocketGateway;

  let artifactsUrl: string;
  let agentRuntimeUrl: string;
  let workerPoolUrl: string;
  let gatewayUrl: string;

  let app: express.Application;

  beforeAll(async () => {
    const artifactsApp = express();
    artifactsApp.use(express.json());
    artifactsApp.get('/api/artifacts/health', (_req, res) => {
      res.json({ status: 'ok', service: 'artifacts' });
    });
    artifactsApp.use('/api/artifacts/missions', artifactsMissionRoutes);
    artifactsApp.use('/api/artifacts/agents', artifactsAgentRoutes);
    artifactsApp.use('/api/artifacts/documents', artifactsDocumentRoutes);

    const agentRuntimeApp = express();
    agentRuntimeApp.use(express.json());
    agentRuntimeApp.use('/api/agent-runtime', agentRoutes);

    const workerPoolApp = express();
    workerPoolApp.use(express.json());
    workerPoolApp.use('/api/workers', workerPoolAssistantRoutes);

    const gatewayApp = express();
    gatewayApp.use(express.json());
    gatewayApp.use('/api/gateway', gatewayRoutes);
    gatewayApp.use('/api/gateway', messagingRoutes);

    persistenceServer = http.createServer(artifactsApp);
    agentRuntimeServer = http.createServer(agentRuntimeApp);
    workerPoolServer = http.createServer(workerPoolApp);
    gatewayServer = http.createServer(gatewayApp);

    await Promise.all([
      new Promise<void>((resolve) => persistenceServer.listen(0, '127.0.0.1', resolve)),
      new Promise<void>((resolve) => agentRuntimeServer.listen(0, '127.0.0.1', resolve)),
      new Promise<void>((resolve) => workerPoolServer.listen(0, '127.0.0.1', resolve)),
      new Promise<void>((resolve) => gatewayServer.listen(0, '127.0.0.1', resolve)),
    ]);

    const persistenceAddr = persistenceServer.address() as { address: string; port: number };
    const agentRuntimeAddr = agentRuntimeServer.address() as { address: string; port: number };
    const workerPoolAddr = workerPoolServer.address() as { address: string; port: number };
    const gatewayAddr = gatewayServer.address() as { address: string; port: number };

    artifactsUrl = `http://${persistenceAddr.address}:${persistenceAddr.port}`;
    agentRuntimeUrl = `http://${agentRuntimeAddr.address}:${agentRuntimeAddr.port}`;
    workerPoolUrl = `http://${workerPoolAddr.address}:${workerPoolAddr.port}`;
    gatewayUrl = `http://${gatewayAddr.address}:${gatewayAddr.port}`;

    process.env.ARTIFACTS_URL = artifactsUrl;
    process.env.AGENT_RUNTIME_URL = agentRuntimeUrl;
    process.env.WORKER_POOL_URL = workerPoolUrl;
    process.env.GATEWAY_URL = gatewayUrl;
    delete process.env.TEMPORAL_ADDRESS;

    wsGateway = new WebSocketGateway(gatewayServer, '/ws');
    wsGateway.start();
    setWsGateway(wsGateway);

    app = express();
    app.use(express.json());
    app.use('/api/temporal', temporalRoutes);
    app.use('/api/agent-runtime', agentRoutes);
    app.use('/api/workers', workerPoolAssistantRoutes);
    app.use('/api/gateway', gatewayRoutes);
    app.use('/api/gateway', messagingRoutes);

    app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      if ('statusCode' in err && typeof err.statusCode === 'number') {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err.message });
    });
  });

  afterAll(async () => {
    wsGateway.stop();
    setWsGateway(null as any);

    delete process.env.ARTIFACTS_URL;
    delete process.env.AGENT_RUNTIME_URL;
    delete process.env.WORKER_POOL_URL;
    delete process.env.GATEWAY_URL;

    await Promise.all([
      new Promise<void>((resolve) => persistenceServer.close(() => resolve())),
      new Promise<void>((resolve) => agentRuntimeServer.close(() => resolve())),
      new Promise<void>((resolve) => workerPoolServer.close(() => resolve())),
      new Promise<void>((resolve) => gatewayServer.close(() => resolve())),
    ]);
  });

  it('should execute full mission flow with real services (no Temporal mock)', async () => {
    const assistantReg = await request(app)
      .post('/api/workers/assistants')
      .send({
        id: 'e2e-assistant',
        name: 'E2E Assistant',
        model: 'gpt-4',
        systemPrompt: 'You are an end-to-end test assistant.',
        tools: [],
        metadata: {},
        tenantId: 'tenant-1',
      });

    expect(assistantReg.status).toBe(201);
    expect(assistantReg.body.id).toBe('e2e-assistant');

    const agentReg = await request(app)
      .post('/api/agent-runtime/agents')
      .send({
        id: 'e2e-agent',
        tenantId: 'tenant-1',
        name: 'E2E Agent',
        description: 'End-to-end agent',
        type: 'worker',
        systemPrompt: 'You execute missions.',
        model: 'gpt-4',
        tools: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    expect(agentReg.status).toBe(201);

    const missionRes = await request(app)
      .post('/api/temporal/missions')
      .send({
        missionId: 'e2e-mission',
        prompt: 'Execute end-to-end mission',
        tenantId: 'tenant-1',
        assistantId: 'e2e-assistant',
        contextChunks: [],
        metadata: {},
      });

    expect(missionRes.status).toBe(202);
    expect(missionRes.body.workflowId).toBe('mission-e2e-mission');

    const resultRes = await request(app).get('/api/temporal/missions/mission-e2e-mission');
    expect(resultRes.status).toBe(200);
    expect(resultRes.body.status).toBe('completed');

    const agentStateRes = await request(app)
      .post('/api/agent-runtime/agents/e2e-agent/start')
      .send({ missionId: 'e2e-mission' });

    expect(agentStateRes.status).toBe(201);
    expect(agentStateRes.body.status).toBe('running');

    const persistenceCheck = await fetch(
      `${artifactsUrl}/api/artifacts/missions/e2e-mission`,
    );
    expect(persistenceCheck.status).toBe(200);
    const persisted = (await persistenceCheck.json()) as { missionId: string; status: string };
    expect(persisted.missionId).toBe('e2e-mission');
    expect(persisted.status).toBe('completed');
  });
});
