import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler, healthRouter, NextGenError, logger } from '@stage7-nextgen/shared';
import { TokenService } from '../services/TokenService';
import { RBACService } from '../services/RBACService';
import { LoginRequest, RegisterRequest, ServiceAuthRequest, AuthResult, User, ServiceAccount, TokenPayload } from '../types';
import { PersistentUserStore, PersistentServiceAccountStore } from '../data/stores';

const router: Router = Router();
const tokenService = new TokenService(process.env.JWT_SECRET);
const rbacService = new RBACService();

const userStore = new PersistentUserStore();
const serviceStore = new PersistentServiceAccountStore();

const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const DEFAULT_ADMIN_TENANT = process.env.ADMIN_TENANT || 'tenant-1';

// bcryptjs cost 10 — matches the TokenService.hashApiKey convention.
const BCRYPT_COST = 10;

// Per-IP limits on the credential and token routes (CodeQL: authorization
// routes must be rate-limited). The gateway's 300/min proxy limiter is the
// edge control; it does not forward client IPs, so these aggregate per
// gateway IP in proxied deployments — direct-port access is the primary
// surface blunted here. Limits are sized to stay above real multi-user load.
const AUTH_WINDOW_MS = 15 * 60_000;
const credentialLimiter = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  limit: 50, // login / register / service auth
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
const tokenLimiter = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  limit: 200, // refresh / verify — the 401-recovery cycle is legitimate traffic
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

/** Pure: copy a user without its passwordHash — the hash never leaves the service. */
const stripPasswordHash = (user: User): Omit<User, 'passwordHash'> => {
  const copy: Omit<User, 'passwordHash'> & { passwordHash?: string } = { ...user };
  delete copy.passwordHash;
  return copy;
};

async function ensureDefaultAdmin(): Promise<User> {
  const existing = await userStore.findByEmail(DEFAULT_ADMIN_EMAIL);
  if (existing) return existing;

  // Deliberately fail closed: an admin seeded without ADMIN_PASSWORD has no
  // usable credential (login refuses hash-less accounts) rather than a
  // default password. Set ADMIN_PASSWORD and restart to seed a usable one.
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    logger.warn(
      `[auth] ADMIN_PASSWORD is not set: seeding ${DEFAULT_ADMIN_EMAIL} without a credential. ` +
      'Login for this account will be refused until ADMIN_PASSWORD is set and the service is restarted.'
    );
  }

  return userStore.create({
    id: 'user-admin',
    tenantId: DEFAULT_ADMIN_TENANT,
    orgId: 'org-1',
    email: DEFAULT_ADMIN_EMAIL,
    name: 'Admin User',
    roles: ['admin'],
    permissions: ['read', 'write', 'delete'],
    metadata: {},
    ...(adminPassword ? { passwordHash: await bcrypt.hash(adminPassword, BCRYPT_COST) } : {}),
  });
}

/**
 * Resolves once the module-load admin seed attempt settles. Exported so test
 * harnesses can await seeding deterministically — the seed does real bcrypt
 * work and no longer completes within the first request's microtasks.
 */
export const adminSeedReady: Promise<void> = ensureDefaultAdmin()
  .then(() => undefined)
  .catch((err) => {
    console.error('Failed to seed default admin:', err);
  });

router.use(healthRouter({ service: 'auth' }));

router.post('/login', credentialLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { email, password, tenantId } = req.body as LoginRequest;

  // Mongo filters must never see a non-string field (operator-injection
  // class, e.g. { email: { $ne: null } } from a JSON body).
  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    throw NextGenError.badRequest('Email and password are required');
  }

  const user = await userStore.findByEmail(email);
  if (!user) {
    throw NextGenError.unauthorized('Invalid credentials');
  }

  if (tenantId && user.tenantId !== tenantId) {
    throw NextGenError.unauthorized('Invalid tenant');
  }

  // Fail closed: an account without a stored hash (e.g. seeded without
  // ADMIN_PASSWORD, or created by the bearer-gated admin POST /users) can
  // never authenticate. The real reason is logged server-side only — the
  // response never discloses account state.
  if (!user.passwordHash) {
    logger.error({ email }, 'Login failed: account has no passwordHash set');
    throw NextGenError.unauthorized('Invalid credentials');
  }

  if (!(await bcrypt.compare(password, user.passwordHash))) {
    logger.error({ email }, 'Login failed: password does not match');
    throw NextGenError.unauthorized('Invalid credentials');
  }

  const token = tokenService.generateUserToken(user);
  const result: AuthResult = {
    success: true,
    user: stripPasswordHash(user),
    token,
  };

  res.status(200).json(result);
}));

/**
 * Public self-registration — the only path that creates an account with a
 * usable credential. The gateway allowlists `auth/register`; POST /users
 * stays the bearer-gated admin path (it discards passwords and therefore
 * creates only fail-closed accounts).
 */
router.post('/register', credentialLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { email, password, name, tenantId } = req.body as RegisterRequest;

  if (
    !email || !password || password.length < 8 ||
    typeof email !== 'string' || typeof password !== 'string'
  ) {
    throw NextGenError.badRequest('Email and a password of at least 8 characters are required');
  }

  if (await userStore.findByEmail(email)) {
    throw new NextGenError('Email already registered', 409);
  }

  const user = await userStore.create({
    id: `user-${Date.now()}`,
    tenantId: typeof tenantId === 'string' && tenantId.trim() ? tenantId.trim() : 'tenant-1',
    orgId: 'org-1',
    email,
    name: name || email,
    roles: ['user'],
    permissions: ['read'],
    metadata: {},
    passwordHash: await bcrypt.hash(password, BCRYPT_COST),
  });

  // The register flow stores the returned session and lands on the
  // Dashboard, so the response mints the token the same way login does.
  const token = tokenService.generateUserToken(user);
  res.status(201).json({ success: true, user: stripPasswordHash(user), token });
}));

router.post('/service/auth', credentialLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { serviceId, apiKey } = req.body as ServiceAuthRequest;

  if (!serviceId || !apiKey) {
    throw NextGenError.badRequest('serviceId and apiKey are required');
  }

  const service = await serviceStore.findByServiceId(serviceId);
  if (!service || !tokenService.compareApiKey(apiKey, service.apiKeyHash)) {
    throw NextGenError.unauthorized('Invalid service credentials');
  }

  const token = tokenService.generateServiceToken(service);
  const result: AuthResult = {
    success: true,
    service,
    token,
  };

  res.status(200).json(result);
}));

// Expired-but-well-signed tokens are accepted (deliberate: no rotation yet,
// OD-9 trade-off); anything the JWT cannot verify at all — malformed or bad
// signature — is a plain 401, never a 500.
const decodeExpiredToken = (token: string): TokenPayload | null => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-key', { ignoreExpiration: true }) as TokenPayload;
  } catch {
    return null;
  }
};

router.post('/refresh', tokenLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body;

  if (!token) {
    throw NextGenError.badRequest('Token is required');
  }

  const payload = tokenService.verifyToken(token) || decodeExpiredToken(token);
  if (!payload) {
    throw NextGenError.unauthorized('Invalid or expired token');
  }

  const user = await userStore.findById(payload.sub);
  if (!user) {
    throw NextGenError.unauthorized('User not found');
  }

  const newToken = tokenService.generateUserToken(user);
  res.status(200).json({ success: true, token: newToken });
}));

router.get('/verify', tokenLimiter, asyncHandler(async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw NextGenError.unauthorized('Missing token');
  }

  const token = authHeader.slice(7);
  const payload = tokenService.verifyToken(token);
  if (!payload) {
    throw NextGenError.unauthorized('Invalid or expired token');
  }

  res.status(200).json({ success: true, payload });
}));

router.post('/users/:id/roles', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.id as string;
  const { role } = req.body;

  if (!role) {
    throw NextGenError.badRequest('Role is required');
  }

  rbacService.assignRole(userId, role);
  res.status(200).json({ success: true, userId, roles: rbacService.getRoles(userId) });
}));

router.post('/users', asyncHandler(async (req: Request, res: Response) => {
  const { email, password, name, tenantId, roles, permissions } = req.body;

  if (!email || !password) {
    throw NextGenError.badRequest('Email and password are required');
  }

  const existing = await userStore.findByEmail(email);
  if (existing) {
    throw NextGenError.badRequest('User already exists');
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
  res.json({ users: users.map(stripPasswordHash) });
}));

router.post('/services', asyncHandler(async (req: Request, res: Response) => {
  const { name, serviceId, scopes, apiKey, tenantId } = req.body;

  if (!name || !serviceId) {
    throw NextGenError.badRequest('name and serviceId are required');
  }

  const existing = await serviceStore.findByServiceId(serviceId);
  if (existing) {
    throw NextGenError.badRequest('Service already exists');
  }

  const keyHash = tokenService.hashApiKey(apiKey || `sk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  const service: ServiceAccount = {
    id: `service-${Date.now()}`,
    // A service token carries its tenant (vault derives tenant identity from
    // the verified token), so the caller may register the account in the
    // tenant it serves; 'tenant-1' stays the default for operator convenience.
    tenantId: typeof tenantId === 'string' && tenantId.trim() ? tenantId.trim() : 'tenant-1',
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