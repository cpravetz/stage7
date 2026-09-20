import request from 'supertest';
import app from '../../services/tool-executor/src/index';

describe('Integration: Tool-Executor Workspace Routes', () => {
  describe('GET /api/tool-executor/workspaces', () => {
    it('returns 200 with a workspaces list (regression: was 404 due to wrong mount path)', async () => {
      const res = await request(app)
        .get('/api/tool-executor/workspaces');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('workspaces');
      expect(res.body).toHaveProperty('count');
      expect(Array.isArray(res.body.workspaces)).toBe(true);
    });

    it('returns 200 when filtering by assistant query param (regression: ?assistant=... returned 404)', async () => {
      const res = await request(app)
        .get('/api/tool-executor/workspaces')
        .query({ assistant: 'cto-canonical-assistant' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('workspaces');
      expect(Array.isArray(res.body.workspaces)).toBe(true);
      expect(res.body.workspaces.every((ws: any) => ws.assistant === 'cto-canonical-assistant')).toBe(true);
    });
  });

  describe('POST /api/tool-executor/workspaces', () => {
    it('creates a new workspace when assistant and productObject are provided', async () => {
      const res = await request(app)
        .post('/api/tool-executor/workspaces')
        .send({ assistant: 'TestAssistant', productObject: 'test-object' });

      expect(res.status).toBe(201);
      expect(res.body.workspace.assistant).toBe('TestAssistant');
      expect(res.body.workspace.productObject).toBe('test-object');
      expect(res.body.resumed).toBe(false);
    });

    it('returns 400 when assistant is missing', async () => {
      const res = await request(app)
        .post('/api/tool-executor/workspaces')
        .send({ productObject: 'test-object' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/tool-executor/workspaces/:id', () => {
    it('returns 404 for a non-existent workspace id', async () => {
      const res = await request(app)
        .get('/api/tool-executor/workspaces/non-existent-id');

      expect(res.status).toBe(404);
    });
  });

  describe('Route isolation: no mount-path collision', () => {
    it('does not shadow /api/tool-executor/tools', async () => {
      const res = await request(app)
        .get('/api/tool-executor/tools');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('tools');
    });

    it('does not shadow /api/tool-executor/workflows', async () => {
      const res = await request(app)
        .get('/api/tool-executor/workflows');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('workflows');
    });
  });
});
