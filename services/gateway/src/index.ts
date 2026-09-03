import http from 'http';
import express from 'express';
import gatewayRoutes from './routes/gateway';
import proxyRoutes from './routes/proxy';
import messagingRoutes from './routes/messaging';
import workersRoutes from './routes/workers';
import { gatewayRegistry, gatewayProxy, setWsGateway } from './utils/sharedInstances';
import { ServiceDefinition } from './utils/serviceRegistry';
import { logger } from '@stage7-nextgen/shared';
import { WebSocketGateway } from './services/WebSocketGateway';

const app: express.Application = express();

const NEXTGEN_SERVICES: ServiceDefinition[] = [
  { id: 'brain', name: 'Brain / LLM Layer', baseUrl: 'http://brain:3100', healthPath: '/api/brain/health' },
  { id: 'workers', name: 'Worker Pool', baseUrl: 'http://worker-pool:3200', healthPath: '/api/workers/health' },
  { id: 'mcp-runtime', name: 'MCP Runtime', baseUrl: 'http://mcp-runtime:3300', healthPath: '/api/mcp-runtime/health' },
  { id: 'agent-runtime', name: 'Agent Runtime', baseUrl: 'http://agent-runtime:3400', healthPath: '/api/agent-runtime/health' },
  { id: 'tool-executor', name: 'Tool Executor', baseUrl: 'http://tool-executor:3500', healthPath: '/api/tool-executor/health' },
  { id: 'temporal', name: 'Temporal Workflow Engine', baseUrl: 'http://temporal:4100', healthPath: '/api/temporal/health' },
  { id: 'vault', name: 'Vault', baseUrl: 'http://vault:4000', healthPath: '/api/vault/health' },
  { id: 'artifacts', name: 'Artifacts', baseUrl: 'http://artifacts:4200', healthPath: '/api/artifacts/health' },
  { id: 'auth', name: 'Auth', baseUrl: 'http://auth:4300', healthPath: '/api/auth/health' },
];

NEXTGEN_SERVICES.forEach((svc) => {
  gatewayRegistry.register(svc);
  gatewayProxy.registerProxy(svc.id, svc.baseUrl);
  logger.info({ serviceId: svc.id, baseUrl: svc.baseUrl }, 'Registered NextGen service');
});

app.use('/api/gateway', express.json(), gatewayRoutes);
app.use('/api/gateway', express.json(), messagingRoutes);
app.use('/api', proxyRoutes);

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
const wsGateway = new WebSocketGateway(server, '/ws');
setWsGateway(wsGateway);

server.listen(PORT, () => {
  wsGateway.start();
  logger.info({ port: PORT, services: gatewayRegistry.list().map((s) => s.id) }, 'Gateway service listening');
});

export default app;
