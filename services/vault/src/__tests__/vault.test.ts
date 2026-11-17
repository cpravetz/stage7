import request from 'supertest';
import express from 'express';
import vaultRoutes from '../routes/vault';

describe('Vault', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/vault', vaultRoutes);
  });

  describe('POST /api/vault/encrypt', () => {
    it('should encrypt plaintext', async () => {
      const response = await request(app)
        .post('/api/vault/encrypt')
        .send({ plaintext: 'secret-data' });

      expect(response.status).toBe(200);
      expect(response.body.ciphertext).toBeDefined();
      expect(response.body.keyId).toBe('master-key');
    });

    it('should reject missing plaintext', async () => {
      const response = await request(app)
        .post('/api/vault/encrypt')
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/vault/decrypt', () => {
    it('should decrypt ciphertext', async () => {
      const encryptResponse = await request(app)
        .post('/api/vault/encrypt')
        .send({ plaintext: 'secret-data' });

      const decryptResponse = await request(app)
        .post('/api/vault/decrypt')
        .send(encryptResponse.body);

      expect(decryptResponse.status).toBe(200);
      expect(decryptResponse.body.plaintext).toBe('secret-data');
    });

    it('should reject missing ciphertext', async () => {
      const response = await request(app)
        .post('/api/vault/decrypt')
        .send({});

      expect(response.status).toBe(400);
    });

    it('persists a secret before returning its reference and never returns plaintext metadata', async () => {
      const createResponse = await request(app)
        .post('/api/vault/secrets')
        .set('X-Tenant-Id', 'tenant-test')
        .send({ name: 'mission-test-token', plaintext: 'secret-data' });

      expect([200, 201]).toContain(createResponse.status);
      expect(createResponse.body.id).toBeDefined();
      expect(createResponse.body.tenantId).toBe('tenant-test');
      expect(createResponse.body.plaintext).toBeUndefined();

      const decryptResponse = await request(app)
        .get(`/api/vault/secrets/${createResponse.body.id}/decrypt`)
        .set('X-Tenant-Id', 'tenant-test');

      expect(decryptResponse.status).toBe(200);
      expect(decryptResponse.body.plaintext).toBe('secret-data');
    });
  });

  describe('Tenant-scoped discovery and durable reconciliation', () => {
    it('requires tenant context for secret listing', async () => {
      const response = await request(app).get('/api/vault/secrets');
      expect(response.status).toBe(401);
    });

    it('discovers secrets for authenticated tenant context', async () => {
      await request(app)
        .post('/api/vault/secrets')
        .set('X-Tenant-Id', 'tenant-a')
        .send({ name: 'disc-secret', plaintext: 'a' });

      const response = await request(app)
        .get('/api/vault/discovery')
        .set('X-Tenant-Id', 'tenant-a');

      expect(response.status).toBe(200);
      expect(response.body.tenantId).toBe('tenant-a');
      expect(response.body.authenticated).toBe(true);
      expect(response.body.secrets.some((s: any) => s.name === 'disc-secret')).toBe(true);
    });

    it('reconciles duplicate create/ensure attempts durably', async () => {
      const first = await request(app)
        .post('/api/vault/secrets/ensure')
        .set('X-Tenant-Id', 'tenant-r')
        .send({ name: 'same-secret', plaintext: 'one' });
      expect([200, 201]).toContain(first.status);

      const second = await request(app)
        .post('/api/vault/secrets/ensure')
        .set('X-Tenant-Id', 'tenant-r')
        .send({ name: 'same-secret', plaintext: 'two' });
      expect(second.status).toBe(200);
      expect(second.body.id).toBe(first.body.id);
      expect(second.body.existed).toBe(true);

      const list = await request(app)
        .get('/api/vault/secrets')
        .set('X-Tenant-Id', 'tenant-r');
      expect(list.status).toBe(200);
      const matches = list.body.secrets.filter((s: any) => s.name === 'same-secret');
      expect(matches).toHaveLength(1);
    });

    it('isolates secrets by tenant', async () => {
      await request(app)
        .post('/api/vault/secrets')
        .set('X-Tenant-Id', 'tenant-x')
        .send({ name: 'scoped', plaintext: 'x' });
      const other = await request(app)
        .get('/api/vault/secrets/name/scoped')
        .set('X-Tenant-Id', 'tenant-y');
      expect(other.status).toBe(404);
    });
  });
});
