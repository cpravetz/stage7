import request from 'supertest';
import express from 'express';
import workersRoutes from '../../services/worker-pool/src/routes/assistants';
import { AssistantLoader } from '../../services/worker-pool/src/services/AssistantLoader';
import { AssistantExecutor } from '../../services/worker-pool/src/services/AssistantExecutor';

const originalFetch = global.fetch;
beforeAll(() => {
  global.fetch = jest.fn(async (url: any, init: any) => {
    const urlStr = String(url);
    if (urlStr.includes('/api/brain/complete')) {
      const body = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: '[Brain says] ' + body.prompt,
          model: body.options?.model || 'gpt-4o-mini',
          provider: 'openrouter',
          tokensUsed: 42,
        }),
        text: async () => '',
      } as any;
    }
    return originalFetch(url, init);
  });
});
afterAll(() => {
  global.fetch = originalFetch;
});

describe('Integration: Worker-Pool Assistant Lifecycle', () => {
  let app: express.Application;
  let loader: AssistantLoader;
  let executor: AssistantExecutor;

  beforeEach(() => {
    loader = new AssistantLoader();
    executor = new AssistantExecutor();
    app = express();
    app.use(express.json());

    const router = require('../../services/worker-pool/src/routes/assistants').default;
    app.use('/api/workers', router);
  });

  describe('Assistant CRUD', () => {
    it('should register, list, get, and delete assistant', async () => {
      const def = {
        id: 'wp-asst-1',
        tenantId: 'tenant-1',
        name: 'Worker Pool Assistant',
        description: 'Test assistant in worker pool',
        model: 'gpt-4',
        capabilities: ['chat'],
        systemPrompt: 'You are helpful.',
        tools: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const regRes = await request(app).post('/api/workers/assistants').send(def);
      expect(regRes.status).toBe(201);
      expect(regRes.body.id).toBe('wp-asst-1');

      const listRes = await request(app).get('/api/workers/assistants');
      expect(listRes.status).toBe(200);
      expect(listRes.body.assistants).toBeDefined();
      expect(listRes.body.assistants.length).toBeGreaterThanOrEqual(1);
      expect(listRes.body.assistants.some((a: any) => a.id === 'wp-asst-1')).toBe(true);

      const getRes = await request(app).get('/api/workers/assistants/wp-asst-1');
      expect(getRes.status).toBe(200);
      expect(getRes.body.assistant.name).toBe('Worker Pool Assistant');

      const delRes = await request(app).delete('/api/workers/assistants/wp-asst-1');
      expect(delRes.status).toBe(204);
    });
  });

  describe('Assistant execution', () => {
    it('should execute assistant with prompt', async () => {
      await request(app).post('/api/workers/assistants').send({
        id: 'wp-asst-2',
        tenantId: 'tenant-1',
        name: 'Exec Assistant',
        description: 'Executes prompts',
        model: 'gpt-4',
        capabilities: ['chat'],
        systemPrompt: 'You are helpful.',
        tools: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const execRes = await request(app)
        .post('/api/workers/assistants/wp-asst-2/execute')
        .send({ prompt: 'Hello worker pool' });

      expect(execRes.status).toBe(200);
      expect(execRes.body.assistantId).toBe('wp-asst-2');
      expect(execRes.body.success).toBe(true);
    });
  });
});
