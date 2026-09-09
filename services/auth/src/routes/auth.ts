import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthError } from '../utils/errors';
import { TokenService } from '../services/TokenService';
import { RBACService } from '../services/RBACService';
import { LoginRequest, ServiceAuthRequest, AuthResult, User, ServiceAccount } from '../types';
import { PersistentUserStore, PersistentServiceAccountStore } from '../data/stores';

const router: Router = Router();
const tokenService = new TokenService();
const rbacService = new RBACService();

const userStore = new PersistentUserStore();
const serviceStore = new PersistentServiceAccountStore();

const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me-in-production';
const DEFAULT_ADMIN_TENANT = process.env.ADMIN_TENANT || 'tenant-1';

async function ensureDefaultAdmin(): Promise<User> {
  const existing = await userStore.findByEmail(DEFAULT_ADMIN_EMAIL);
  if (existing) return existing;
  return userStore.create({
    id: 'user-admin',
    tenantId: DEFAULT_ADMIN_TENANT,
    orgId: 'org-1',
    email: DEFAULT_ADMIN_EMAIL,
    name: 'Admin User',
    roles: ['admin'],
    permissions: ['read', 'write', 'delete'],
    metadata: {},
  });
}

ensureDefaultAdmin().catch((err) => {
  console.error('Failed to seed default admin:', err);
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth' });
});

router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { email, password, tenantId } = req.body as LoginRequest;

  if (!email || !password) {
    throw AuthError.badRequest('Email and password are required');
  }

  const user = await userStore.findByEmail(email);
  if (!user) {
    throw AuthError.unauthorized('Invalid credentials');
  }

  if (tenantId && user.tenantId !== tenantId) {
    throw AuthError.unauthorized('Invalid tenant');
  }

  const token = tokenService.generateUserToken(user);
  const result: AuthResult = {
    success: true,
    user,
    token,
  };

  res.status(200).json(result);
}));

router.post('/service/auth', asyncHandler(async (req: Request, res: Response) => {
  const { serviceId, apiKey } = req.body as ServiceAuthRequest;

  if (!serviceId || !apiKey) {
    throw AuthError.badRequest('serviceId and apiKey are required');
  }

  const service = await serviceStore.findByServiceId(serviceId);
  if (!service || !tokenService.compareApiKey(apiKey, service.apiKeyHash)) {
    throw AuthError.unauthorized('Invalid service credentials');
  }

  const token = tokenService.generateServiceToken(service);
  const result: AuthResult = {
    success: true,
    service,
    token,
  };

  res.status(200).json(result);
}));

router.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body;

  if (!token) {
    throw AuthError.badRequest('Token is required');
  }

  const payload = tokenService.verifyToken(token);
  if (!payload) {
    throw AuthError.unauthorized('Invalid or expired token');
  }

  const user = await userStore.findById(payload.sub);
  if (!user) {
    throw AuthError.unauthorized('User not found');
  }

  const newToken = tokenService.generateUserToken(user);
  res.status(200).json({ success: true, token: newToken });
}));

router.get('/verify', asyncHandler(async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw AuthError.unauthorized('Missing token');
  }

  const token = authHeader.slice(7);
  const payload = tokenService.verifyToken(token);
  if (!payload) {
    throw AuthError.unauthorized('Invalid or expired token');
  }

  res.status(200).json({ success: true, payload });
}));

router.post('/users/:id/roles', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.id as string;
  const { role } = req.body;

  if (!role) {
    throw AuthError.badRequest('Role is required');
  }

  rbacService.assignRole(userId, role);
  res.status(200).json({ success: true, userId, roles: rbacService.getRoles(userId) });
}));

router.post('/users', asyncHandler(async (req: Request, res: Response) => {
  const { email, password, name, tenantId, roles, permissions } = req.body;

  if (!email || !password) {
    throw AuthError.badRequest('Email and password are required');
  }

  const existing = await userStore.findByEmail(email);
  if (existing) {
    throw AuthError.badRequest('User already exists');
  }

  const user = await userStore.create({
    id: `user-${Date.now()}`,
    tenantId: tenantId || 'tenant-1',
    orgId: 'org-1',
    email,
    name: name || email,
    roles: roles || ['user'],
    permissions: permissions || ['read'],
    metadata: {},
  });

  res.status(201).json({ success: true, user });
}));

router.get('/users', asyncHandler(async (_req: Request, res: Response) => {
  const users = await userStore.list();
  res.json({ users });
}));

router.post('/services', asyncHandler(async (req: Request, res: Response) => {
  const { name, serviceId, scopes, apiKey } = req.body;

  if (!name || !serviceId) {
    throw AuthError.badRequest('name and serviceId are required');
  }

  const existing = await serviceStore.findByServiceId(serviceId);
  if (existing) {
    throw AuthError.badRequest('Service already exists');
  }

  const keyHash = tokenService.hashApiKey(apiKey || `sk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  const service: ServiceAccount = {
    id: `service-${Date.now()}`,
    tenantId: 'tenant-1',
    name,
    serviceId,
    scopes: scopes || ['read'],
    apiKeyHash: keyHash,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await serviceStore.create(service);
  res.status(201).json({ success: true, service: { id: service.id, name: service.name, serviceId: service.serviceId, scopes: service.scopes } });
}));

router.get('/services', asyncHandler(async (_req: Request, res: Response) => {
  const services = await serviceStore.list();
  res.json({ services });
}));

export default router;