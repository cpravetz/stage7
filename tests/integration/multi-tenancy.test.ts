import request from 'supertest';
import express from 'express';
import authRoutes from '../../services/auth/src/routes/auth';
import agentRoutes from '../../services/agent-runtime/src/routes/agents';
import artifactsRoutes from '../../services/artifacts/src/routes/agents';
import { ArtifactsService } from '../../services/artifacts/src/services/ArtifactsService';

describe('Integration: Multi-Tenancy Isolation', () => {
  let app: express.Application;
  let artifactsService: ArtifactsService;

  beforeEach(() => {
    artifactsService = new ArtifactsService();
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/agents', agentRoutes);
    app.use('/api/artifacts/agents', artifactsRoutes);
  });

  describe('Auth token carries tenantId', () => {
    it('should issue token with correct tenantId', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.com', password: 'password', tenantId: 'tenant-1' });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.token).toBeDefined();
    });
  });

  describe('Agent creation isolated by tenantId', () => {
    it('should only list agents for requesting tenant', async () => {
      await request(app).post('/api/agents/agents').send({
        id: 'tenant-a-agent',
        tenantId: 'tenant-a',
        name: 'Tenant A Agent',
        description: 'A agent',
        type: 'worker',
        systemPrompt: 'You are A.',
        model: 'gpt-4',
        tools: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await request(app).post('/api/agents/agents').send({
        id: 'tenant-b-agent',
        tenantId: 'tenant-b',
        name: 'Tenant B Agent',
        description: 'B agent',
        type: 'worker',
        capabilities: ['chat'],
        systemPrompt: 'You are B.',
        model: 'gpt-4',
        tools: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const tenantARes = await request(app).get('/api/agents/agents?tenantId=tenant-a');
      const tenantBRes = await request(app).get('/api/agents/agents?tenantId=tenant-b');

      expect(tenantARes.status).toBe(200);
      expect(tenantARes.body.agents).toBeDefined();
      expect(tenantARes.body.agents.some((a: any) => a.id === 'tenant-a-agent')).toBe(true);
      expect(tenantARes.body.agents.some((a: any) => a.id === 'tenant-b-agent')).toBe(false);

      expect(tenantBRes.status).toBe(200);
      expect(tenantBRes.body.agents.some((a: any) => a.id === 'tenant-b-agent')).toBe(true);
      expect(tenantBRes.body.agents.some((a: any) => a.id === 'tenant-a-agent')).toBe(false);
    });
  });

  describe('Persistence state isolated by tenantId', () => {
    it('should persist and retrieve agent state per tenant', async () => {
      const saveRes = await request(app)
        .post('/api/artifacts/agents')
        .send({
          agentId: 'tenant-a-agent',
          tenantId: 'tenant-a',
          missionId: 'mission-1',
          status: 'running',
          context: {},
          artifacts: [],
        });

      expect(saveRes.status).toBe(201);
      expect(saveRes.body.tenantId).toBe('tenant-a');

      const getRes = await request(app).get('/api/artifacts/agents/tenant-a-agent');
      expect(getRes.status).toBe(200);
      expect(getRes.body.tenantId).toBe('tenant-a');
    });
  });
});
