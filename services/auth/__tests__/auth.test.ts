import request from 'supertest';
import express from 'express';
import authRoutes from '../src/routes/auth';
import { TokenService } from '../src/services/TokenService';
import { RBACService } from '../src/services/RBACService';

describe('Auth', () => {
  let app: express.Application;
  const tokenService = new TokenService('test-secret');

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
  });

  describe('TokenService', () => {
    it('should generate and verify user token', () => {
      const token = tokenService.generateUserToken({
        id: 'user-1',
        tenantId: 'tenant-1',
        orgId: 'org-1',
        email: 'spammail@pravetz.net',
        name: 'Test User',
        roles: ['admin'],
        permissions: ['read'],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      const payload = tokenService.verifyToken(token);
      expect(payload).not.toBeNull();
      expect(payload?.sub).toBe('user-1');
      expect(payload?.type).toBe('user');
      expect(payload?.roles).toEqual(['admin']);
    });

    it('should generate and verify service token', () => {
      const token = tokenService.generateServiceToken({
        id: 'service-1',
        tenantId: 'tenant-1',
        name: 'Test Service',
        serviceId: 'svc-1',
        scopes: ['read', 'write'],
        apiKeyHash: 'hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(token).toBeDefined();

      const payload = tokenService.verifyToken(token);
      expect(payload).not.toBeNull();
      expect(payload?.sub).toBe('service-1');
      expect(payload?.type).toBe('service');
    });

    it('should return null for invalid token', () => {
      const payload = tokenService.verifyToken('invalid-token');
      expect(payload).toBeNull();
    });
  });

  describe('TokenService secret resolution', () => {
    afterEach(() => {
      delete process.env.JWT_SECRET;
      jest.restoreAllMocks();
    });

    function freshAuthApp(): express.Application {
      let router: express.Router | undefined;
      jest.isolateModules(() => {
        router = require('../src/routes/auth').default;
      });
      const app = express();
      app.use(express.json());
      app.use('/api/auth', router as express.Router);
      return app;
    }

    it('signs route tokens with JWT_SECRET from the environment when set', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      process.env.JWT_SECRET = 'route-level-secret';
      const app = freshAuthApp();

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.com', password: 'change-me-in-production' });

      expect(response.status).toBe(200);
      expect(new TokenService('route-level-secret').verifyToken(response.body.token)).not.toBeNull();
      // Guards the regression: the token must no longer be signed with the
      // well-known development default when JWT_SECRET is configured.
      expect(new TokenService('dev-secret-key').verifyToken(response.body.token)).toBeNull();
      expect(warn).not.toHaveBeenCalled();
    });

    it('warns once and falls back to the development default when JWT_SECRET is absent', async () => {
      delete process.env.JWT_SECRET;
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const app = freshAuthApp();

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.com', password: 'change-me-in-production' });

      expect(response.status).toBe(200);
      expect(new TokenService('dev-secret-key').verifyToken(response.body.token)).not.toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('JWT_SECRET');
      expect(String(warn.mock.calls[0][0])).toContain('not deployment-secured');
    });
  });

  describe('RBACService', () => {
    it('should assign and check permissions', () => {
      const rbac = new RBACService();
      rbac.assignRole('user-1', 'admin');
      rbac.assignRole('user-2', 'viewer');

      expect(rbac.hasPermission('user-1', 'write')).toBe(true);
      expect(rbac.hasPermission('user-2', 'write')).toBe(false);
    });

    it('should revoke roles', () => {
      const rbac = new RBACService();
      rbac.assignRole('user-1', 'admin');
      rbac.revokeRole('user-1', 'admin');
      expect(rbac.getRoles('user-1')).toEqual([]);
    });

    it('should get roles', () => {
      const rbac = new RBACService();
      rbac.assignRole('user-1', 'admin');
      rbac.assignRole('user-1', 'editor');
      expect(rbac.getRoles('user-1')).toEqual(['admin', 'editor']);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.com', password: 'change-me-in-production' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.user.email).toBe('admin@example.com');
    });

    it('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'wrong@example.com', password: 'password' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should reject missing fields', async () => {
      const response = await request(app).post('/api/auth/login').send({});

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/service/auth', () => {
    it('should authenticate service with valid API key', async () => {
      const serviceId = `svc-${Date.now()}`;
      const apiKey = `sk-${Date.now()}`;
      const apiKeyHash = tokenService.hashApiKey(apiKey);

      await request(app)
        .post('/api/auth/services')
        .send({ name: 'Test Service', serviceId, apiKey, scopes: ['read', 'write'] });

      const response = await request(app)
        .post('/api/auth/service/auth')
        .send({ serviceId, apiKey });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
    });

    it('should reject invalid service credentials', async () => {
      const response = await request(app)
        .post('/api/auth/service/auth')
        .send({ serviceId: 'svc-1', apiKey: 'wrong-key' });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/auth/verify', () => {
    it('should verify valid token', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.com', password: 'change-me-in-production' });

      const token = loginResponse.body.token;
      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.payload.sub).toBe('user-admin');
    });

    it('should reject missing token', async () => {
      const response = await request(app).get('/api/auth/verify');
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh valid token', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.com', password: 'change-me-in-production' });

      const token = loginResponse.body.token;
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ token });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
    });
  });

  describe('POST /api/auth/users/:id/roles', () => {
    it('should assign role to user', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.com', password: 'change-me-in-production' });

      const userId = loginResponse.body.user.id;
      const response = await request(app)
        .post(`/api/auth/users/${userId}/roles`)
        .send({ role: 'editor' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.roles).toEqual(['editor']);
    });
  });
});
