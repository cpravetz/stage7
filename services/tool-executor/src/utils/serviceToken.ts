import { httpRequest, interServiceTimeoutMs } from '@stage7-nextgen/shared';

/**
 * Service-token client: mints and caches a bearer token from the auth
 * service's service-account flow (`POST /api/auth/service/auth`).
 *
 * Since PR #121 the vault derives tenant identity from verified bearer tokens
 * only — the client-supplied `X-Tenant-Id` header it used to honor was
 * removed. Every inter-service vault call therefore carries this token as its
 * credential, and the tenant is whatever the service account is registered
 * with, not a caller-supplied value.
 */

/** Tokens are minted with a 1h expiry; re-mint at 50 minutes to stay clear of it. */
const TOKEN_TTL_MS = 50 * 60 * 1000;

export const SERVICE_ID_ENV = 'TOOL_EXECUTOR_SERVICE_ID';
export const SERVICE_API_KEY_ENV = 'TOOL_EXECUTOR_SERVICE_API_KEY';

let cached: { token: string; mintedAt: number } | undefined;

/** True when a minted token is still inside its freshness window. */
export function isTokenFresh(
  entry: { mintedAt: number } | undefined,
  now: number = Date.now(),
): boolean {
  return entry !== undefined && now - entry.mintedAt < TOKEN_TTL_MS;
}

/** Strip a single trailing slash so `AUTH_URL=http://auth:4300/` still joins correctly. */
export function authBaseUrl(explicit?: string): string {
  const base = explicit || process.env.AUTH_URL || 'http://auth:4300';
  return base.replace(/\/+$/, '');
}

/**
 * The service identity this process authenticates as. Throws when
 * unconfigured — vault calls must fail loudly rather than silently skip
 * authentication.
 */
export function serviceCredentials(env: NodeJS.ProcessEnv = process.env): { serviceId: string; apiKey: string } {
  const serviceId = env[SERVICE_ID_ENV];
  const apiKey = env[SERVICE_API_KEY_ENV];
  if (!serviceId || !apiKey) {
    throw new Error(
      `${SERVICE_ID_ENV} and ${SERVICE_API_KEY_ENV} must be configured: ` +
      'the vault requires service-token authentication (hardened in PR #121)',
    );
  }
  return { serviceId, apiKey };
}

/** Mint a fresh token from the auth service. Throws on any failure. */
export async function mintServiceToken(
  credentials = serviceCredentials(),
  authUrl = authBaseUrl(),
): Promise<string> {
  const response = await httpRequest(`${authUrl}/api/auth/service/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
    timeoutMs: interServiceTimeoutMs(),
  });
  if (!response.ok) {
    throw new Error(`Service token minting failed (${response.status})`);
  }
  const data = (await response.json()) as { token?: string };
  if (typeof data.token !== 'string' || data.token.length === 0) {
    throw new Error('Service token minting returned no token');
  }
  return data.token;
}

/**
 * A valid bearer token, minted on first use and reused until the freshness
 * window expires.
 */
export async function getServiceToken(now: number = Date.now()): Promise<string> {
  if (cached && isTokenFresh(cached, now)) return cached.token;
  const token = await mintServiceToken();
  cached = { token, mintedAt: now };
  return token;
}

/** Drop the cached token — used between tests and after auth changes. */
export function resetServiceTokenCache(): void {
  cached = undefined;
}
