import request from 'supertest';
import express from 'express';
import documentRoutes from '../routes/documents';
import { ArtifactsService } from '../services/ArtifactsService';

describe('ArtifactsService', () => {
  let service: ArtifactsService;

  beforeEach(() => {
    service = new ArtifactsService();
  });

  describe('documents', () => {
    it('should create and retrieve a document', async () => {
      const doc = await service.createDocument({
        id: 'doc-1',
        tenantId: 'tenant-1',
        collection: 'test',
        data: { name: 'Test' },
      });

      expect(doc.id).toBe('doc-1');
      expect(await service.getDocument('doc-1')).toBeDefined();
    });

    it('should update a document', async () => {
      await service.createDocument({
        id: 'doc-1',
        tenantId: 'tenant-1',
        collection: 'test',
        data: { name: 'Test' },
      });

      const updated = await service.updateDocument('doc-1', { data: { name: 'Updated' } });
      expect(updated?.data).toEqual({ name: 'Updated' });
    });

    it('should delete a document', async () => {
      await service.createDocument({
        id: 'doc-1',
        tenantId: 'tenant-1',
        collection: 'test',
        data: {},
      });

      expect(await service.deleteDocument('doc-1')).toBe(true);
      expect(await service.getDocument('doc-1')).toBeUndefined();
    });

    it('should query documents', async () => {
      await service.createDocument({
        id: 'doc-1',
        tenantId: 'tenant-1',
        collection: 'users',
        data: { name: 'Alice', age: 30 },
      });
      await service.createDocument({
        id: 'doc-2',
        tenantId: 'tenant-1',
        collection: 'users',
        data: { name: 'Bob', age: 25 },
      });

      const result = await service.queryDocuments({ collection: 'users', limit: 10 });
      expect(result.documents).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });

  describe('missions', () => {
    it('should save and retrieve mission state', async () => {
      const state = {
        missionId: 'mission-1',
        tenantId: 'tenant-1',
        assistantId: 'asst-1',
        status: 'running' as const,
        currentStep: 0,
        totalSteps: 3,
        history: [],
        input: { prompt: 'test' },
        startedAt: new Date(),
      };

      await service.saveMissionState(state);
      const retrieved = await service.getMissionState('mission-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.status).toBe('running');
    });

    it('should delete a mission state', async () => {
      await service.saveMissionState({
        missionId: 'mission-del',
        tenantId: 'tenant-1',
        assistantId: 'asst-1',
        status: 'running' as const,
        currentStep: 0,
        totalSteps: 3,
        history: [],
        input: { prompt: 'test' },
        startedAt: new Date(),
      });

      await service.deleteMissionState('mission-del');
      expect(await service.getMissionState('mission-del')).toBeUndefined();
    });
  });

  describe('agents', () => {
    it('should save and retrieve agent state', async () => {
      const state = {
        agentId: 'agent-1',
        tenantId: 'tenant-1',
        missionId: 'mission-1',
        status: 'active',
        context: {},
        artifacts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await service.saveAgentState(state);
      const retrieved = await service.getAgentState('agent-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.status).toBe('active');
    });
  });
});

describe('Artifacts Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/artifacts/documents', documentRoutes);
  });

  it('should create a document via API', async () => {
    const response = await request(app)
      .post('/api/artifacts/documents')
      .send({
        id: 'api-doc-1',
        tenantId: 'tenant-1',
        collection: 'test',
        data: { name: 'API Test' },
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBe('api-doc-1');
  });

  it('should retrieve a document via API', async () => {
    await request(app)
      .post('/api/artifacts/documents')
      .send({
        id: 'api-doc-2',
        tenantId: 'tenant-1',
        collection: 'test',
        data: { name: 'API Test 2' },
      });

    const response = await request(app).get('/api/artifacts/documents/api-doc-2');
    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe('API Test 2');
  });

  it('should return 404 for missing document', async () => {
    const response = await request(app).get('/api/artifacts/documents/missing');
    expect(response.status).toBe(404);
  });
});