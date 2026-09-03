import request from 'supertest';
import express from 'express';
import agentsRoutes from '../../services/agent-runtime/src/routes/agents';
import { AgentRuntime } from '../../services/agent-runtime/src/services/AgentRuntime';

describe('Integration: Agent Runtime Collaboration & Specialization', () => {
  let app: express.Application;
  let runtime: AgentRuntime;

  beforeEach(() => {
    runtime = new AgentRuntime();
    app = express();
    app.use(express.json());
    app.use('/api/agents', agentsRoutes);
  });

  describe('Agent lifecycle', () => {
    it('should register agent, start, submit task, complete task, and deregister', async () => {
      const agentDef = {
        id: 'collab-agent-1',
        tenantId: 'tenant-1',
        name: 'Collab Agent',
        description: 'Test collab agent',
        type: 'worker',
        capabilities: ['chat', 'code'],
        systemPrompt: 'You are a test agent.',
        model: 'gpt-4',
        tools: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const regRes = await request(app).post('/api/agents/agents').send(agentDef);
      expect(regRes.status).toBe(201);
      expect(regRes.body.id).toBe('collab-agent-1');

      const startRes = await request(app)
        .post('/api/agents/agents/collab-agent-1/start')
        .send({ missionId: 'mission-collab-1' });

      expect(startRes.status).toBe(201);
      expect(startRes.body.status).toBe('running');

      const taskRes = await request(app)
        .post('/api/agents/agents/collab-agent-1/tasks')
        .send({
          agentId: 'collab-agent-1',
          type: 'completion',
          input: { prompt: 'Hello' },
          priority: 1,
        });

      expect(taskRes.status).toBe(201);
      const taskId = taskRes.body.taskId;

      const completeRes = await request(app)
        .post(`/api/agents/agents/collab-agent-1/tasks/${taskId}/complete`)
        .send({ result: { text: 'done' } });

      expect(completeRes.status).toBe(200);

      const delRes = await request(app).delete('/api/agents/agents/collab-agent-1');
      expect(delRes.status).toBe(204);
    });
  });

  describe('Agent state transitions', () => {
    it('should track agent state through lifecycle', async () => {
      await request(app).post('/api/agents/agents').send({
        id: 'state-agent-1',
        tenantId: 'tenant-1',
        name: 'State Agent',
        description: 'State tracking agent',
        type: 'worker',
        capabilities: ['chat'],
        systemPrompt: 'You are a test agent.',
        model: 'gpt-4',
        tools: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await request(app)
        .post('/api/agents/agents/state-agent-1/start')
        .send({ missionId: 'mission-state-1' });

      const stateRes = await request(app).get('/api/agents/agents/state-agent-1/state');
      expect(stateRes.status).toBe(200);
      expect(stateRes.body.status).toBe('running');
      expect(stateRes.body.missionId).toBe('mission-state-1');
    });
  });

  describe('Collaboration flow', () => {
    it('should create collaboration and send message between agents', async () => {
      await request(app).post('/api/agents/agents').send({
        id: 'collab-a',
        tenantId: 'tenant-1',
        name: 'Agent A',
        description: 'First agent',
        type: 'worker',
        capabilities: ['chat'],
        systemPrompt: 'You are A.',
        model: 'gpt-4',
        tools: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await request(app).post('/api/agents/agents').send({
        id: 'collab-b',
        tenantId: 'tenant-1',
        name: 'Agent B',
        description: 'Second agent',
        type: 'worker',
        capabilities: ['chat'],
        systemPrompt: 'You are B.',
        model: 'gpt-4',
        tools: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const collabRes = await request(app)
        .post('/api/agents/collaborations')
        .send({ participants: ['collab-a', 'collab-b'] });

      expect(collabRes.status).toBe(201);
      expect(collabRes.body.participants).toEqual(['collab-a', 'collab-b']);
      const collabId = collabRes.body.collaborationId;

      const msgRes = await request(app)
        .post(`/api/agents/collaborations/${collabId}/messages`)
        .send({ from: 'collab-a', content: 'Hello from A' });

      expect(msgRes.status).toBe(200);
      expect(msgRes.body.messages.length).toBeGreaterThanOrEqual(1);
      expect(msgRes.body.messages[msgRes.body.messages.length - 1].content).toBe('Hello from A');
    });
  });

  describe('Specialization registration', () => {
    it('should register and retrieve agent specialization', async () => {
      await request(app).post('/api/agents/agents').send({
        id: 'spec-agent-1',
        tenantId: 'tenant-1',
        name: 'Specialized Agent',
        description: 'Specialized',
        type: 'worker',
        capabilities: ['code'],
        systemPrompt: 'You specialize.',
        model: 'gpt-4',
        tools: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const specRes = await request(app)
        .post('/api/agents/agents/spec-agent-1/specializations')
        .send({ domain: 'python', confidence: 0.95, examples: ['def hello():'], lastUsed: new Date() });

      expect(specRes.status).toBe(201);
      expect(specRes.body.domain).toBe('python');

      const getRes = await request(app).get('/api/agents/agents/spec-agent-1/specializations');
      expect(getRes.status).toBe(200);
      expect(getRes.body[0].domain).toBe('python');
    });
  });
});
