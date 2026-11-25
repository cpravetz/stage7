import { NextFunction, Request, RequestHandler, Response } from 'express';
import { NextGenError } from '../errors';
import { asyncHandler } from './asyncHandler';
import { TokenPayload } from '../types/auth';
import { httpRequest, interServiceTimeoutMs } from '../utils/httpClient';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Payload of the bearer token verified by `requireServiceToken`. */
      serviceTokenPayload?: TokenPayload;
    }
  }
}

interface VerifyResponse {
  success?: boolean;
  payload?: TokenPayload;
}

export interface RequireServiceTokenOptions {
  /** Auth service base URL; defaults to AUTH_URL or the compose service name. */
  authServiceUrl?: string;
  /** Token types accepted; defaults to both user and service tokens. */
  acceptedTypes?: TokenPayload['type'][];
  timeoutMs?: number;
}

function authServiceBaseUrl(explicit?: string): string {
  return (explicit || process.env.AUTH_URL || 'http://auth:4300').replace(/\/+$/, '');
}

/**
 * Verify a bearer token against the auth service's `/verify` endpoint.
 * Resolves to the token payload on success and `undefined` on any failure —
 * missing token, rejected token, or an unreachable auth service — so callers
 * fail closed.
 */
export async function verifyTokenWithAuthService(
  token: string,
  options: RequireServiceTokenOptions = {},
): Promise<TokenPayload | undefined> {
  const url = `${authServiceBaseUrl(options.authServiceUrl)}/api/auth/verify`;
  try {
    const response = await httpRequest(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: options.timeoutMs ?? interServiceTimeoutMs(),
    });
    if (!response.ok) return undefined;
    const data = (await response.json()) as VerifyResponse;
    return data?.payload ?? undefined;
  } catch {
    return undefined;
  }
}

export function requireServiceToken(options: RequireServiceTokenOptions = {}): RequestHandler {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ')
      ? header.slice(7).trim()
      : undefined;
    if (!token) {
      throw NextGenError.unauthorized('Missing bearer token');
    }

    const payload = await verifyTokenWithAuthService(token, options);
    if (!payload) {
      throw NextGenError.unauthorized('Invalid or expired authentication token');
    }
    if (options.acceptedTypes && !options.acceptedTypes.includes(payload.type)) {
      throw NextGenError.forbidden('Token type not accepted for this route');
    }

    req.serviceTokenPayload = payload;
    next();
  });
}
