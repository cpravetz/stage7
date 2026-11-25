import { httpRequest, interServiceTimeoutMs, describeRequestError } from './httpClient';
import { logger } from './logger';

/**
 * Service-account token client.
 *
 * Internal callers of the artifacts documents API authenticate with a service
 * JWT minted by the auth service: POST /api/auth/service/auth exchanges
 * per-service credentials (SERVICE_AUTH_ID / SERVICE_API_KEY) for a token with
 * a one-hour expiry. This client performs that exchange on first use and
 * refreshes five minutes before expiry, so a request never reads a token that
 * could be within seconds of dying.
 *
 * When the credentials are not configured the client deliberately returns no
 * Authorization header instead of throwing: the downstream 401 from a gated
 * service surfaces the misconfiguration on the request that needs it, while
 * callers whose artifacts interaction is best-effort keep degrading the way
 * they already do. The missing-configuration warning is emitted once.
 */

/** Refresh five minutes before the one-hour token expiry. */
const SERVICE_TOKEN_TTL_MS = 55 * 60 * 1000;

let cachedToken: { token: string; fetchedAt: number } | null = null;
let inFlight: Promise<string> | undefined;
let warnedUnconfigured = false;

/** True when this service has the credentials needed to mint a service token. */
export function serviceAuthConfigured(): boolean {
  return Boolean(process.env.SERVICE_AUTH_ID && process.env.SERVICE_API_KEY);
}

function authUrl(): string {
  return (process.env.AUTH_URL || 'http://auth:4300').replace(/\/+$/, '');
}

async function requestServiceToken(): Promise<string> {
  const response = await httpRequest(`${authUrl()}/api/auth/service/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceId: process.env.SERVICE_AUTH_ID,
      apiKey: process.env.SERVICE_API_KEY,
    }),
    timeoutMs: interServiceTimeoutMs(),
  });
  if (!response.ok) {
    const details = (await response.text()).slice(0, 300);
    throw new Error(`Service token request failed (${response.status}): ${details}`);
  }
  const data = await response.json() as { token?: string };
  if (!data?.token) {
    throw new Error('Service token response did not include a token');
  }
  return data.token;
}

/**
 * Returns the current service token, exchanging credentials on first use and
 * refreshing before the one-hour expiry. Concurrent callers share one exchange.
 */
export async function getServiceToken(): Promise<string> {
  if (!serviceAuthConfigured()) {
    throw new Error('Service credentials are not configured (SERVICE_AUTH_ID / SERVICE_API_KEY)');
  }
  if (cachedToken && Date.now() - cachedToken.fetchedAt < SERVICE_TOKEN_TTL_MS) {
    return cachedToken.token;
  }
  if (!inFlight) {
    inFlight = requestServiceToken()
      .then((token) => {
        cachedToken = { token, fetchedAt: Date.now() };
        logger.info({ serviceId: process.env.SERVICE_AUTH_ID }, 'Service token acquired');
        return token;
      })
      .finally(() => {
        inFlight = undefined;
      });
  }
  return inFlight;
}

/**
 * Authorization headers for an outbound documents call. Returns an empty
 * object (with a one-time warning) when service credentials are not
 * configured, so callers merge it into their header set unconditionally.
 */
export async function getServiceAuthorizationHeaders(): Promise<Record<string, string>> {
  if (!serviceAuthConfigured()) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      logger.warn(
        { serviceId: process.env.SERVICE_NAME || 'unknown' },
        'SERVICE_AUTH_ID/SERVICE_API_KEY are not set; documents requests will be sent unauthenticated and rejected by gated services',
      );
    }
    return {};
  }
  try {
    return { Authorization: `Bearer ${await getServiceToken()}` };
  } catch (err) {
    logger.warn({ err: describeRequestError(err) }, 'Could not obtain a service token');
    throw err;
  }
}

/** Clears the token cache and the one-time warning; used by tests. */
export function resetServiceAuthForTests(): void {
  cachedToken = null;
  inFlight = undefined;
  warnedUnconfigured = false;
}
