import { Request, Response, NextFunction } from 'express';
import { NextGenError } from '../errors';
import { httpRequest, interServiceTimeoutMs, describeRequestError } from '../utils/httpClient';
import { logger } from '../utils/logger';

/**
 * Bearer-token verification middleware for internal service routes.
 *
 * Mirrors the vault tenant-resolution semantics (services/vault/src/utils/tenant.ts):
 * a missing bearer token is a 401, and an invalid bearer token is also a 401 —
 * the request never falls through to spoofable headers. Verification happens
 * over HTTP against the auth service's /api/auth/verify, so no service outside
 * auth needs the JWT secret or a jsonwebtoken dependency.
 *
 * Verified tokens are cached in-process for 60 seconds (the token itself lives
 * for one hour), amortizing the network hop for hot paths without letting a
 * revoked token outlive the cache window.
 */

const VERIFICATION_CACHE_TTL_MS = 60_000;
const VERIFICATION_CACHE_MAX_ENTRIES = 1000;

interface VerifyPayload {
  sub?: string;
  tenantId?: string;
  orgId?: string;
  type?: string;
}

interface CacheEntry {
  payload: VerifyPayload;
  verifiedAt: number;
}

const verificationCache = new Map<string, CacheEntry>();

function authUrl(): string {
  return (process.env.AUTH_URL || 'http://auth:4300').replace(/\/+$/, '');
}

/**
 * Verifies a bearer token against the auth service. Returns the token payload,
 * or undefined when the token is invalid/expired or the auth service could not
 * be reached (a verification outage must not be read as a success).
 */
export async function verifyBearerToken(token: string): Promise<VerifyPayload | undefined> {
  const cached = verificationCache.get(token);
  if (cached && Date.now() - cached.verifiedAt < VERIFICATION_CACHE_TTL_MS) {
    return cached.payload;
  }
  try {
    const response = await httpRequest(`${authUrl()}/api/auth/verify`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: interServiceTimeoutMs(),
    });
    if (!response.ok) {
      logger.warn({ status: response.status }, 'Bearer token verification rejected');
      return undefined;
    }
    const data = await response.json() as { success?: boolean; payload?: VerifyPayload };
    if (!data?.payload) {
      logger.warn('Auth verify response did not include a payload');
      return undefined;
    }
    verificationCache.set(token, { payload: data.payload, verifiedAt: Date.now() });
    // Simple insertion-order eviction: verification results are single-use
    // bookkeeping, not a cache worth subtlety.
    while (verificationCache.size > VERIFICATION_CACHE_MAX_ENTRIES) {
      const oldest = verificationCache.keys().next().value;
      if (oldest === undefined) break;
      verificationCache.delete(oldest);
    }
    return data.payload;
  } catch (err) {
    logger.warn({ err: describeRequestError(err) }, 'Auth service unavailable; bearer token could not be verified');
    return undefined;
  }
}

/** Clears the in-process verification cache; used by tests. */
export function clearVerificationCacheForTests(): void {
  verificationCache.clear();
}

async function authorizeRequest(req: Request): Promise<NextGenError | undefined> {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return NextGenError.unauthorized('Missing bearer token');
  }
  const token = header.slice(7).trim();
  if (!token) {
    return NextGenError.unauthorized('Missing bearer token');
  }
  const payload = await verifyBearerToken(token);
  if (!payload) {
    return NextGenError.unauthorized('Invalid or expired authentication token');
  }
  return undefined;
}

/**
 * Express middleware: rejects any request that does not carry a bearer token
 * the auth service verifies. Responds with 401 itself (rather than forwarding
 * an error) so it can sit in a router-level `router.use` in services without
 * a dedicated error-handling middleware.
 */
export const requireServiceAuth: (req: Request, res: Response, next: NextFunction) => void = (req, res, next) => {
  const requestContext = { method: req.method, path: req.originalUrl || req.url };
  authorizeRequest(req)
    .then((failure) => {
      if (!failure) {
        next();
        return;
      }
      logger.warn({ ...requestContext, reason: failure.message }, 'Request rejected: service authentication failed');
      res.status(401).json(failure.toJson());
    })
    .catch((err: unknown) => {
      // authorizeRequest already reports verification failures; reaching here
      // means the middleware itself failed, which is still a 401, never an
      // accidental pass-through.
      logger.warn({ ...requestContext, err: err instanceof Error ? err.message : String(err) }, 'Service authentication middleware error');
      const failure = NextGenError.unauthorized('Service authentication failed');
      res.status(401).json(failure.toJson());
    });
};
