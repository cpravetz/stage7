import request from 'supertest';
import express from 'express';
import vaultRoutes from '../../services/vault/src/routes/vault';
import toolRoutes from '../../services/tool-executor/src/routes/tools';

describe('Integration: Vault → Tool Executor Secret Flow', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/vault', vaultRoutes);
    app.use('/api/tools', toolRoutes);
  });

  describe('Secret encryption → tool registration with encrypted config', () => {
    it('should encrypt secret and register tool with encrypted config', async () => {
      const encryptRes = await request(app)
        .post('/api/vault/encrypt')
        .send({ plaintext: 'my-secret-key' });

      expect(encryptRes.status).toBe(200);
      expect(encryptRes.body.ciphertext).toBeDefined();
      expect(encryptRes.body.keyId).toBe('master-key');

      const toolRes = await request(app)
        .post('/api/tools/tools')
        .send({
          id: 'tool-1',
          name: 'Secure Tool',
          description: 'Tool with secrets',
          type: 'code',
          manifest: {},
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
        });

      expect(toolRes.status).toBe(201);
      expect(toolRes.body.id).toBe('tool-1');

      const listRes = await request(app).get('/api/tools/tools');
      expect(listRes.status).toBe(200);
      expect(listRes.body.tools).toBeDefined();
      expect(listRes.body.tools.length).toBeGreaterThanOrEqual(1);
      expect(listRes.body.tools.some((t: any) => t.id === 'tool-1')).toBe(true);
    });
  });

  describe('Tool execution with decrypted secret', () => {
    it('should execute tool and decrypt config at runtime', async () => {
      await request(app)
        .post('/api/tools/tools')
        .send({
          id: 'tool-2',
          name: 'Runtime Tool',
          description: 'Runtime tool',
          type: 'code',
          manifest: {},
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
        });

      const execRes = await request(app)
        .post('/api/tools/tools/tool-2/execute')
        .send({ input: { data: 'test' } });

      expect(execRes.status).toBe(200);
      expect(execRes.body.status).toBe('completed');
    });
  });
});
