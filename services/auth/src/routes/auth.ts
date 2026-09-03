import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthError } from '../utils/errors';
import { TokenService } from '../services/TokenService';
import { RBACService } from '../services/RBACService';
import { LoginRequest, ServiceAuthRequest, AuthResult, User, ServiceAccount } from '../types';

const router: Router = Router();
const tokenService = new TokenService();
const rbacService = new RBACService();

const mockUsers: User[] = [
  {
    id: 'user-1',
    tenantId: 'tenant-1',
    orgId: 'org-1',
    email: 'admin@example.com',
    name: 'Admin User',
    roles: ['admin'],
    permissions: ['read', 'write', 'delete'],
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const mockServices: ServiceAccount[] = [
  {
    id: 'service-1',
    tenantId: 'tenant-1',
    name: 'Test Service',
    serviceId: 'svc-1',
    scopes: ['read', 'write'],
    apiKeyHash: tokenService.hashApiKey('secret-api-key'),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth' });
});

router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { email, password, tenantId } = req.body as LoginRequest;

  if (!email || !password) {
    throw AuthError.badRequest('Email and password are required');
  }

  const user = mockUsers.find((u) => u.email === email);
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

  const service = mockServices.find((s) => s.serviceId === serviceId);
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

  const newToken = tokenService.generateUserToken({
    id: payload.sub,
    tenantId: payload.tenantId,
    orgId: payload.orgId,
    email: '',
    name: '',
    roles: payload.roles || [],
    permissions: payload.permissions || [],
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });

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

export default router;
