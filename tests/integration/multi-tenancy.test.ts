import request from 'supertest';
import express from 'express';
import authRoutes, { adminSeedReady } from '../../services/auth/src/routes/auth';
import agentRoutes from '../../services/agent-runtime/src/routes/agents';
import artifactsRoutes from '../../services/artifacts/src/routes/missions';
import { ArtifactsService } from '../../services/artifacts/src/services/ArtifactsService';

describe('Integration: Multi-Tenancy Isolation', () => {
  let app: express.Application;
  let artifactsService: ArtifactsService;

  // Login is fail-closed since PR #161: it bcrypt-verifies against the
  // ADMIN_PASSWORD hash seeded at module load — await the seed before login.
  beforeAll(async () => {
    await adminSeedReady;
  });

  beforeEach(() => {
    artifactsService = new ArtifactsService();
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/agent-runtime', agentRoutes);
    app.use('/api/artifacts/missions', artifactsRoutes);
  });

  describe('Auth token carries tenantId', () => {
    it('should issue token with correct tenantId', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com',
          // Matches the ADMIN_PASSWORD jest.config.js sets for the admin seed.
          password: process.env.ADMIN_PASSWORD,
          tenantId: 'tenant-1',
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.token).toBeDefined();
      expect(loginRes.body.user.tenantId).toBe('tenant-1');

      // Fail-closed contract: wrong password is rejected with a generic 401.
      const badRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.com', password: 'wrong-password', tenantId: 'tenant-1' });
      expect(badRes.status).toBe(401);
      expect(badRes.body.error).toBe('Invalid credentials');
    });
  });

  describe('Agent creation isolated by tenantId', () => {
    it('should only list agents for requesting tenant', async () => {
      await request(app).post('/api/agent-runtime/missions/test-mission/agents').send({
        id: 'tenant-a-agent',
        tenantId: 'tenant-a',
        name: 'Tenant A Agent',
        description: 'A agent',
        type: 'worker',
        systemPrompt: 'You are A.',
        tools: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await request(app).post('/api/agent-runtime/missions/test-mission/agents').send({
        id: 'tenant-b-agent',
        tenantId: 'tenant-b',
        name: 'Tenant B Agent',
        description: 'B agent',
        type: 'worker',
        capabilities: ['chat'],
        systemPrompt: 'You are B.',
        tools: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const tenantARes = await request(app).get('/api/agent-runtime/missions/test-mission/agents?tenantId=tenant-a');
      const tenantBRes = await request(app).get('/api/agent-runtime/missions/test-mission/agents?tenantId=tenant-b');

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
        .post('/api/artifacts/missions/test-mission/artifacts')
        .send({
          id: 'agent-state-tenant-a',
          name: 'agent-state',
          type: 'json',
          content: JSON.stringify({ agentId: 'tenant-a-agent', tenantId: 'tenant-a', missionId: 'mission-1', status: 'running' }),
        });

      expect(saveRes.status).toBe(201);

      const getRes = await request(app).get('/api/artifacts/missions/test-mission/artifacts');
      expect(getRes.status).toBe(200);
      const body = getRes.body as any;
      expect(body.artifacts).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'agent-state-tenant-a', name: 'agent-state' }),
      ]));
    });
  });
});
