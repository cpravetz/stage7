import { logger } from '@stage7-nextgen/shared';
import { ToolCredentials } from '../services/CredentialProvider';

export type ApiClientAuthMode = 'none' | 'bearer' | 'basic' | 'apiKeyHeader';
export type ApiClientMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface ApiClientOptions {
  path: string;
  method?: ApiClientMethod;
  query?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  auth?: ApiClientAuthMode;
  /** When true, non-2xx responses are reported as success (status is still returned). */
  acceptErrorResponses?: boolean;
  idempotencyKey?: string;
  executionId?: string;
  lookupUrl?: string;
  providerRequestIdHeader?: string;
}

export interface ApiClientResult {
  success: boolean;
  status?: number;
  data?: unknown;
  headers?: Record<string, string>;
  durationMs?: number;
  error?: string;
  idempotencyKey?: string;
  providerRequestId?: string;
  outcomeKnown?: boolean;
  reconciliation?: Record<string, unknown>;
}

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TIMEOUT_MS = 120000;
const MAX_BODY_SNIPPET = 2000;
const ALLOWED_METHODS: ApiClientMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const NO_BASE_URL_ERROR =
  "No API base URL configured. Provide the 'api_base_url' credential or set API_CLIENT_BASE_URL.";

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

export class ApiClientExecutor {
  async execute(options: ApiClientOptions, credentials: ToolCredentials): Promise<ApiClientResult> {
    const startTime = Date.now();
    const idempotencyKey = options.idempotencyKey || options.executionId;
    const rawPath = typeof options.path === 'string' ? options.path.trim() : '';

    if (!rawPath && !options.lookupUrl) {
      return { success: false, error: 'path is required', durationMs: Date.now() - startTime, idempotencyKey, outcomeKnown: false };
    }

    const rawBase = (credentials.api_base_url || process.env.API_CLIENT_BASE_URL || '').trim();
    if (!rawBase && !options.lookupUrl) {
      logger.warn({}, 'API client call rejected: no base URL configured');
      return { success: false, error: NO_BASE_URL_ERROR, durationMs: Date.now() - startTime, idempotencyKey, outcomeKnown: false };
    }

    // Reconciliation lookup (explicit URL only, to avoid SSRF surprises beyond configured base).
    if (options.lookupUrl && typeof options.lookupUrl === 'string') {
      try {
        const res = await fetch(options.lookupUrl, { method: 'GET', headers: { Accept: 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) } });
        const text = await res.text().catch(() => '');
        let data: unknown = text;
        try { data = text ? JSON.parse(text) : text; } catch {}
        return {
          success: res.ok,
          status: res.status,
          data,
          headers: headersToRecord(res.headers),
          durationMs: Date.now() - startTime,
          error: res.ok ? undefined : `Lookup failed (${res.status})`,
          idempotencyKey,
          outcomeKnown: res.ok,
          reconciliation: { provider: 'api_client', lookupAttempted: true, lookupStatus: String(res.status), outcomeKnown: res.ok, note: res.ok ? 'API status lookup completed.' : 'API status lookup attempted but did not confirm outcome.' },
        };
      } catch (err) {
        return {
          success: false,
          error: `Lookup error: ${err instanceof Error ? err.message : String(err)}`,
          durationMs: Date.now() - startTime,
          idempotencyKey,
          outcomeKnown: false,
          reconciliation: { provider: 'api_client', lookupAttempted: true, outcomeKnown: false, note: 'API status lookup failed; outcome unknown.' },
        };
      }
    }

    let base: URL;
    try { base = new URL(rawBase); } catch {
      return { success: false, error: `Configured API base URL is not a valid absolute URL: ${rawBase}`, durationMs: Date.now() - startTime, idempotencyKey, outcomeKnown: false };
    }

    if (base.username || base.password) return { success: false, error: 'Configured API base URL must not embed credentials; use auth options instead', durationMs: Date.now() - startTime, idempotencyKey, outcomeKnown: false };
    if (base.protocol !== 'http:' && base.protocol !== 'https:') return { success: false, error: `Configured API base URL must use http or https, received '${base.protocol}'`, durationMs: Date.now() - startTime, idempotencyKey, outcomeKnown: false };
    if (rawPath.includes('://') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawPath) || rawPath.startsWith('//')) {
      logger.warn({ path: rawPath }, 'API client call rejected: absolute URL in path');
      return { success: false, error: `path must be a relative path appended to the configured base URL, received '${rawPath}'`, durationMs: Date.now() - startTime, idempotencyKey, outcomeKnown: false };
    }

    const method = (options.method || 'GET').toUpperCase() as ApiClientMethod;
    if (!ALLOWED_METHODS.includes(method)) return { success: false, error: `Unsupported HTTP method '${options.method}'. Allowed: ${ALLOWED_METHODS.join(', ')}`, durationMs: Date.now() - startTime, idempotencyKey, outcomeKnown: false };

    const basePrefix = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
    let target: URL;
    try { target = new URL(rawPath.replace(/^\/+/, ''), `${base.origin}${basePrefix}`); } catch {
      return { success: false, error: `Could not build a request URL from path '${rawPath}'`, durationMs: Date.now() - startTime, idempotencyKey, outcomeKnown: false };
    }
    if (target.origin !== base.origin) {
      logger.warn({ path: rawPath, origin: target.origin }, 'API client call rejected: origin escape attempt');
      return { success: false, error: `Resolved URL origin '${target.origin}' does not match configured base origin '${base.origin}'`, durationMs: Date.now() - startTime, idempotencyKey, outcomeKnown: false };
    }
    if (target.username || target.password) return { success: false, error: 'Credentials embedded in the request URL are not allowed', durationMs: Date.now() - startTime, idempotencyKey, outcomeKnown: false };

    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value === undefined || value === null) continue;
        target.searchParams.set(key, String(value));
      }
    }

    const authMode: ApiClientAuthMode = options.auth || 'none';
    const requestHeaders: Record<string, string> = { Accept: 'application/json' };
    for (const [key, value] of Object.entries(options.headers || {})) {
      if (value === undefined || value === null) continue;
      requestHeaders[key] = String(value);
    }
    if (idempotencyKey) {
      requestHeaders['Idempotency-Key'] = idempotencyKey;
      requestHeaders['X-Idempotency-Key'] = idempotencyKey;
    }

    try {
      switch (authMode) {
        case 'bearer': {
          const token = credentials.api_token;
          if (!token) return { success: false, error: "auth 'bearer' requires the 'api_token' credential", durationMs: Date.now() - startTime, idempotencyKey, outcomeKnown: false };
          requestHeaders.Authorization = `Bearer ${token}`;
          break;
        }
        case 'basic': {
          const username = credentials.api_username;
          const password = credentials.api_password;
          if (!username || !password) return { success: false, error: "auth 'basic' requires the 'api_username' and 'api_password' credentials", durationMs: Date.now() - startTime, idempotencyKey, outcomeKnown: false };
          requestHeaders.Authorization = `Basic ${Buffer.from(`${username}:${password}`, 'utf-8').toString('base64')}`;
          break;
        }
        case 'apiKeyHeader': {
          const key = credentials.api_key;
          const headerName = credentials.api_key_header;
          if (!key || !headerName) return { success: false, error: "auth 'apiKeyHeader' requires the 'api_key' and 'api_key_header' credentials", durationMs: Date.now() - startTime, idempotencyKey, outcomeKnown: false };
          requestHeaders[headerName] = key;
          break;
        }
        case 'none': break;
        default: return { success: false, error: `Unsupported auth mode '${String(authMode)}'`, durationMs: Date.now() - startTime, idempotencyKey, outcomeKnown: false };
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, durationMs: Date.now() - startTime, idempotencyKey, outcomeKnown: false };
    }

    const timeoutMs = Math.min(Math.max(typeof options.timeoutMs === 'number' && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TIMEOUT_MS, 1), MAX_TIMEOUT_MS);
    const hasBody = method !== 'GET' && method !== 'HEAD';
    let payload: string | undefined;
    if (hasBody && options.body !== undefined && options.body !== null) {
      if (typeof options.body === 'string') payload = options.body;
      else {
        payload = JSON.stringify(options.body);
        if (!Object.keys(requestHeaders).some((h) => h.toLowerCase() === 'content-type')) requestHeaders['Content-Type'] = 'application/json';
      }
    }

    logger.info({ method, path: target.pathname + target.search, auth: authMode, timeoutMs, idempotencyKey }, 'API client request started');
    let response: Response | null = null;
    try {
      let currentUrl = target.toString();
      const maxRedirects = 5;
      for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
        response = await fetch(currentUrl, { method, headers: requestHeaders, body: payload, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location || redirectCount >= maxRedirects) break;
          let nextUrl: URL;
          try { nextUrl = new URL(location, currentUrl); } catch { break; }
          if (nextUrl.origin !== base.origin) {
            logger.warn({ from: currentUrl, to: nextUrl.toString() }, 'API client redirect rejected: origin escape attempt');
            return { success: false, error: `Redirect to different origin '${nextUrl.origin}' not allowed`, durationMs: Date.now() - startTime, idempotencyKey, outcomeKnown: false };
          }
          currentUrl = nextUrl.toString();
          continue;
        }
        break;
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error({ method, path: target.pathname, error, idempotencyKey }, 'API client request failed');
      return { success: false, error: `Request failed: ${error}`, durationMs: Date.now() - startTime, idempotencyKey, outcomeKnown: false, reconciliation: { provider: 'api_client', outcomeKnown: false, note: 'Transport/request error; remote API may or may not have accepted the request. Use lookupUrl/provider request status when supported before retrying.' } };
    }

    const res = response!;
    const durationMs = Date.now() - startTime;
    const responseHeaders = headersToRecord(res.headers);
    const contentType = responseHeaders['content-type'] || '';
    const providerRequestId = res.headers.get(options.providerRequestIdHeader || 'x-request-id') || res.headers.get('x-correlation-id') || undefined;

    let data: unknown;
    let bodySnippet: string | undefined;
    if (method === 'HEAD' || res.status === 204) data = null;
    else {
      const text = await res.text().catch(() => '');
      bodySnippet = text.slice(0, MAX_BODY_SNIPPET);
      if (text === '') data = null;
      else if (contentType.includes('json') || /^[[{]/.test(text.trim())) {
        try { data = JSON.parse(text) as unknown; } catch { data = text; }
      } else data = text;
    }

    if (res.ok) {
      logger.info({ method, path: target.pathname, status: res.status, durationMs, idempotencyKey }, 'API client request completed');
      return { success: true, status: res.status, data, headers: responseHeaders, durationMs, idempotencyKey, providerRequestId, outcomeKnown: true, reconciliation: { provider: 'api_client', outcomeKnown: true, providerRequestId, lookupStatus: String(res.status), note: 'API accepted the request. Dedup depends on the remote API honoring Idempotency-Key.' } };
    }

    if (options.acceptErrorResponses) {
      logger.warn({ method, path: target.pathname, status: res.status }, 'API client returned an error status (accepted)');
      return { success: true, status: res.status, data, headers: responseHeaders, durationMs, idempotencyKey, providerRequestId, outcomeKnown: true, reconciliation: { provider: 'api_client', outcomeKnown: true, providerRequestId, lookupStatus: String(res.status), note: 'API returned a non-2xx status but it was accepted by caller configuration.' } };
    }

    logger.warn({ method, path: target.pathname, status: res.status }, 'API client returned an error status');
    return {
      success: false,
      status: res.status,
      data,
      headers: responseHeaders,
      durationMs,
      error: `HTTP ${res.status} ${res.statusText || ''}`.trim() + (bodySnippet ? `: ${bodySnippet}` : ''),
      idempotencyKey,
      providerRequestId,
      outcomeKnown: false,
      reconciliation: { provider: 'api_client', outcomeKnown: false, providerRequestId, lookupStatus: String(res.status), note: 'API returned an error status. If a prior response was lost after acceptance, use lookupUrl/provider request status before retrying.' },
    };
  }
}
