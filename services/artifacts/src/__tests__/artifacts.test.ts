import request from 'supertest';
import express from 'express';
import documentRoutes from '../routes/documents';
import missionRoutes from '../routes/missions';
import { ArtifactsService } from '../services/ArtifactsService';
import { InMemoryStore } from '../services/InMemoryStore';
import { MongoStore } from '../services/MongoStore';

describe('ArtifactsService', () => {
  let service: ArtifactsService;

  beforeEach(() => {
    service = new ArtifactsService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
    it('blocks phase approval until tasks and expected artifacts are persisted', async () => {
      const app = express();
      app.use(express.json());
      app.use('/api/artifacts/missions', missionRoutes);
      const base = '/api/artifacts/missions/mission-approval-gate';

      await request(app).put(`${base}/plan`).send({
        phases: [{
          id: 'phase-1',
          name: 'Review',
          requiresApproval: true,
          tasks: [{
            id: 'task-1',
            title: 'Prepare report',
            status: 'pending',
            expectedArtifacts: ['report'],
          }],
        }],
      }).expect(200);
      await request(app).put(`${base}/phases/phase-1`)
        .send({ status: 'awaiting_approval' })
        .expect(200);

      const blocked = await request(app)
        .post(`${base}/phases/phase-1/approve`)
        .send({ approvedBy: 'test' });
      expect(blocked.status).toBe(409);

      await request(app).put(`${base}/tasks/task-1`).send({
        status: 'completed',
        artifacts: [{ name: 'report', content: 'Published report contents' }],
      }).expect(200);
      const approved = await request(app)
        .post(`${base}/phases/phase-1/approve`)
        .send({ approvedBy: 'test' });
      expect(approved.status).toBe(200);
      expect(approved.body.status).toBe('approved');
    });

    it('waits for mission-state persistence to finish before resolving', async () => {
      let finishWrite!: () => void;
      const write = new Promise<void>((resolve) => { finishWrite = resolve; });
      jest.spyOn(InMemoryStore.prototype, 'saveMissionState').mockReturnValue(write);
      const state = {
        missionId: 'mission-write-order',
        tenantId: 'tenant-1',
        assistantId: 'assistant-1',
        status: 'running' as const,
        currentStep: 0,
        totalSteps: 1,
        history: [],
        input: { prompt: 'test' },
        startedAt: new Date(),
      };
      let resolved = false;

      const pending = service.saveMissionState(state).then(() => { resolved = true; });
      await Promise.resolve();
      expect(resolved).toBe(false);
      finishWrite();
      await pending;
      expect(resolved).toBe(true);
    });

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

      await service.saveMissionPlan('mission-del', { phases: [] });
      await service.updateMissionPhase('mission-del', 'phase-1', { name: 'Phase 1' });
      await service.updateMissionTask('mission-del', 'task-1', { name: 'Task 1' });
      await service.appendMissionEvent('mission-del', { type: 'test' });

      await service.deleteMissionState('mission-del');
       expect(await service.getMissionState('mission-del')).toBeUndefined();
       expect(await service.getMissionPlan('mission-del')).toBeUndefined();
       expect(await service.getMissionPhase('mission-del', 'phase-1')).toBeUndefined();
       expect(await service.getMissionTask('mission-del', 'task-1')).toBeUndefined();
       expect(await service.listMissionEvents('mission-del')).toEqual([]);
     });

    it('should list pending approvals with assistantId', async () => {
      await service.saveMissionState({
        missionId: 'mission-appr-1',
        tenantId: 'tenant-1',
        assistantId: 'asst-pm',
        status: 'running' as const,
        currentStep: 0,
        totalSteps: 3,
        history: [],
        input: { prompt: 'test' },
        startedAt: new Date(),
      });

      await service.updateMissionPhase('mission-appr-1', 'phase-1', {
        name: 'Planning',
        status: 'awaiting_approval',
        approvalQuestion: 'Approve planning phase?',
      });

      const approvals = await (service as any).store.listPendingApprovals();
      expect(approvals).toHaveLength(1);
      expect(approvals[0].missionId).toBe('mission-appr-1');
      expect(approvals[0].phaseId).toBe('phase-1');
      expect(approvals[0].assistantId).toBe('asst-pm');
      expect(approvals[0].question).toBe('Approve planning phase?');
    });

    it('should list pending approvals with undefined assistantId when mission has no assistantId', async () => {
      await service.saveMissionState({
        missionId: 'mission-appr-2',
        tenantId: 'tenant-1',
        assistantId: '',
        status: 'running' as const,
        currentStep: 0,
        totalSteps: 3,
        history: [],
        input: { prompt: 'test' },
        startedAt: new Date(),
      });

      await service.updateMissionPhase('mission-appr-2', 'phase-1', {
        name: 'Planning',
        status: 'awaiting_approval',
        approvalQuestion: 'Approve?',
      });

      const approvals = await (service as any).store.listPendingApprovals();
      expect(approvals).toHaveLength(1);
      expect(approvals[0].assistantId).toBe('');
    });
  });

  describe('agents', () => {
    it('waits for agent-state persistence to finish before resolving', async () => {
      let finishWrite!: () => void;
      const write = new Promise<void>((resolve) => { finishWrite = resolve; });
      jest.spyOn(InMemoryStore.prototype, 'saveAgentState').mockReturnValue(write);
      const state = {
        agentId: 'agent-write-order',
        tenantId: 'tenant-1',
        missionId: 'mission-1',
        status: 'running' as const,
        context: {},
        artifacts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      let resolved = false;

      const pending = service.saveAgentState(state).then(() => { resolved = true; });
      await Promise.resolve();
      expect(resolved).toBe(false);
      finishWrite();
      await pending;
      expect(resolved).toBe(true);
    });

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

describe('MongoStore state upserts', () => {
  it('matches mission state replacements by their stable Mongo id', async () => {
    const store = new MongoStore();
    const replaceOne = jest.fn().mockResolvedValue({ matchedCount: 1 });
    Object.defineProperty(store, 'missions', { value: { replaceOne } });
    const state = {
      missionId: 'mission-stable-id',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      status: 'running' as const,
      currentStep: 0,
      totalSteps: 1,
      history: [],
      input: { prompt: 'test' },
      startedAt: new Date(),
    };

    await store.saveMissionState(state);

    expect(replaceOne).toHaveBeenCalledWith(
      { _id: state.missionId },
      expect.objectContaining({ _id: state.missionId }),
      { upsert: true },
    );
  });

  it('matches agent state replacements by their stable Mongo id', async () => {
    const store = new MongoStore();
    const replaceOne = jest.fn().mockResolvedValue({ matchedCount: 1 });
    Object.defineProperty(store, 'agents', { value: { replaceOne } });
    const state = {
      agentId: 'agent-stable-id',
      tenantId: 'tenant-1',
      missionId: 'mission-1',
      status: 'running' as const,
      context: {},
      artifacts: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await store.saveAgentState(state);

    expect(replaceOne).toHaveBeenCalledWith(
      { _id: state.agentId },
      expect.objectContaining({ _id: state.agentId }),
      { upsert: true },
    );
  });
});