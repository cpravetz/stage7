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
  });
});
