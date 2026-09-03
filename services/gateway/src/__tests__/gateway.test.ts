import request from 'supertest';
import express from 'express';
import gatewayRoutes from '../routes/gateway';
import messagingRoutes from '../routes/messaging';
import { ServiceRegistry } from '../utils/serviceRegistryImpl';
import { gatewayRegistry } from '../utils/sharedInstances';

jest.mock('http-proxy', () => {
  return function mockHttpProxy() {
    return {
      createProxyServer: () => ({
        web: (req: any, res: any, _: any, callback: any) => {
          callback(new Error('Proxy not available in tests'));
        },
      }),
    };
  };
});

describe('Gateway', () => {
  let app: express.Application;

  beforeEach(() => {
    gatewayRegistry.list().forEach((s) => gatewayRegistry.unregister(s.id));
    app = express();
    app.use(express.json());
    app.use('/api/gateway', gatewayRoutes);
    app.use('/api/gateway', messagingRoutes);
  });

  afterEach(() => {
    gatewayRegistry.list().forEach((s) => gatewayRegistry.unregister(s.id));
  });

  describe('GET /api/gateway/health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/api/gateway/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok', service: 'gateway' });
    });
  });

  describe('GET /api/gateway/services', () => {
    it('should return empty list when no services', async () => {
      const response = await request(app).get('/api/gateway/services');
      expect(response.status).toBe(200);
      expect(response.body.services).toEqual([]);
    });
  });

  describe('GET /api/gateway/services/:id/health', () => {
    it('should return unhealthy when service is unreachable', async () => {
      gatewayRegistry.register({ id: 'test-svc', name: 'Test Service', baseUrl: 'http://localhost:9999', healthPath: '/health' });
      const gatewayApp = express();
      gatewayApp.use(express.json());
      gatewayApp.use('/api/gateway', gatewayRoutes);
      const res = await request(gatewayApp).get('/api/gateway/services/test-svc/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('unhealthy');
    });

    it('should return healthy when service responds ok', async () => {
      const mockServer = require('http').createServer((req: any, res: any) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      });
      await new Promise<void>((resolve) => mockServer.listen(0, () => resolve()));
      const port = (mockServer.address() as any).port;

      gatewayRegistry.register({ id: 'healthy-svc', name: 'Healthy Service', baseUrl: `http://localhost:${port}`, healthPath: '/health' });
      const gatewayApp = express();
      gatewayApp.use(express.json());
      gatewayApp.use('/api/gateway', gatewayRoutes);
      const res = await request(gatewayApp).get('/api/gateway/services/healthy-svc/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');

      mockServer.close();
    });
  });

  describe('POST /api/gateway/routes', () => {
    it('should register a route', async () => {
      const response = await request(app)
        .post('/api/gateway/routes')
        .send({ recipient: 'new-service', serviceId: 'svc-2' });
      expect(response.status).toBe(201);
      expect(response.body).toEqual({ recipient: 'new-service', serviceId: 'svc-2' });
    });
  });

  describe('GET /api/gateway/routes', () => {
    it('should list registered routes', async () => {
      await request(app)
        .post('/api/gateway/routes')
        .send({ recipient: 'test-service', serviceId: 'svc-1' });

      const response = await request(app).get('/api/gateway/routes');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toContainEqual(['test-service', 'svc-1']);
    });
  });

  describe('POST /api/gateway/message', () => {
    it('should route a message to registered service', async () => {
      await request(app)
        .post('/api/gateway/routes')
        .send({ recipient: 'test-service', serviceId: 'svc-1' });

      const response = await request(app)
        .post('/api/gateway/message')
        .send({ recipient: 'test-service', type: 'test', payload: { data: 'hello' } });

      expect(response.status).toBe(200);
      expect(response.body.serviceId).toBe('svc-1');
      expect(response.body.message).toMatchObject({
        recipient: 'test-service',
        type: 'test',
        payload: { data: 'hello' },
      });
      expect(response.body.message.id).toBeDefined();
      expect(response.body.message.timestamp).toBeDefined();
    });

    it('should return 404 for unknown recipient', async () => {
      const response = await request(app)
        .post('/api/gateway/message')
        .send({ recipient: 'unknown', type: 'test', payload: {} });

      expect(response.status).toBe(404);
    });
  });

  // Proxy tests require a running worker-pool service and are covered in integration tests
});

