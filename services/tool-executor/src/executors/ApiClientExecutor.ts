import { logger } from '@stage7-nextgen/shared';
import { ToolCredentials, CredentialProvider } from '../services/CredentialProvider';

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
}

export interface ApiClientResult {
  success: boolean;
  status?: number;
  data?: unknown;
  headers?: Record<string, string>;
  durationMs?: number;
  error?: string;
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
  private credentialProvider = CredentialProvider;

  async execute(options: ApiClientOptions, credentials: ToolCredentials): Promise<ApiClientResult> {
    const startTime = Date.now();
    const rawPath = typeof options.path === 'string' ? options.path.trim() : '';

    if (!rawPath) {
      return { success: false, error: 'path is required', durationMs: Date.now() - startTime };
    }

    const rawBase = (credentials.api_base_url || process.env.API_CLIENT_BASE_URL || '').trim();
    if (!rawBase) {
      logger.warn({}, 'API client call rejected: no base URL configured');
      return { success: false, error: NO_BASE_URL_ERROR, durationMs: Date.now() - startTime };
    }

    let base: URL;
    try {
      base = new URL(rawBase);
    } catch {
      return {
        success: false,
        error: `Configured API base URL is not a valid absolute URL: ${rawBase}`,
        durationMs: Date.now() - startTime,
      };
    }

    if (base.username || base.password) {
      return {
        success: false,
        error: 'Configured API base URL must not embed credentials; use auth options instead',
        durationMs: Date.now() - startTime,
      };
    }

    if (base.protocol !== 'http:' && base.protocol !== 'https:') {
      return {
        success: false,
        error: `Configured API base URL must use http or https, received '${base.protocol}'`,
        durationMs: Date.now() - startTime,
      };
    }

    // SSRF guard 1: the path may not itself be an absolute URL or carry a scheme.
    if (rawPath.includes('://') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawPath) || rawPath.startsWith('//')) {
      logger.warn({ path: rawPath }, 'API client call rejected: absolute URL in path');
      return {
        success: false,
        error: `path must be a relative path appended to the configured base URL, received '${rawPath}'`,
        durationMs: Date.now() - startTime,
      };
    }

    const method = (options.method || 'GET').toUpperCase() as ApiClientMethod;
    if (!ALLOWED_METHODS.includes(method)) {
      return {
        success: false,
        error: `Unsupported HTTP method '${options.method}'. Allowed: ${ALLOWED_METHODS.join(', ')}`,
        durationMs: Date.now() - startTime,
      };
    }

    const basePrefix = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
    let target: URL;
    try {
      target = new URL(rawPath.replace(/^\/+/, ''), `${base.origin}${basePrefix}`);
    } catch {
      return { success: false, error: `Could not build a request URL from path '${rawPath}'`, durationMs: Date.now() - startTime };
    }

    // SSRF guard 2: the resolved URL must stay on the configured origin.
    if (target.origin !== base.origin) {
      logger.warn({ path: rawPath, origin: target.origin }, 'API client call rejected: origin escape attempt');
      return {
        success: false,
        error: `Resolved URL origin '${target.origin}' does not match configured base origin '${base.origin}'`,
        durationMs: Date.now() - startTime,
      };
    }

    if (target.username || target.password) {
      return { success: false, error: 'Credentials embedded in the request URL are not allowed', durationMs: Date.now() - startTime };
    }

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

    try {
      switch (authMode) {
        case 'bearer': {
          const token = credentials.api_token;
          if (!token) return { success: false, error: "auth 'bearer' requires the 'api_token' credential", durationMs: Date.now() - startTime };
          requestHeaders.Authorization = `Bearer ${token}`;
          break;
        }
        case 'basic': {
          const username = credentials.api_username;
          const password = credentials.api_password;
          if (!username || !password) {
            return { success: false, error: "auth 'basic' requires the 'api_username' and 'api_password' credentials", durationMs: Date.now() - startTime };
          }
          requestHeaders.Authorization = `Basic ${Buffer.from(`${username}:${password}`, 'utf-8').toString('base64')}`;
          break;
        }
        case 'apiKeyHeader': {
          const key = credentials.api_key;
          const headerName = credentials.api_key_header;
          if (!key || !headerName) {
            return { success: false, error: "auth 'apiKeyHeader' requires the 'api_key' and 'api_key_header' credentials", durationMs: Date.now() - startTime };
          }
          requestHeaders[headerName] = key;
          break;
        }
        case 'none':
          break;
        default:
          return { success: false, error: `Unsupported auth mode '${String(authMode)}'`, durationMs: Date.now() - startTime };
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, durationMs: Date.now() - startTime };
    }

    const timeoutMs = Math.min(
      Math.max(typeof options.timeoutMs === 'number' && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TIMEOUT_MS, 1),
      MAX_TIMEOUT_MS
    );

    const hasBody = method !== 'GET' && method !== 'HEAD';
    let payload: string | undefined;
    if (hasBody && options.body !== undefined && options.body !== null) {
      if (typeof options.body === 'string') {
        payload = options.body;
      } else {
        payload = JSON.stringify(options.body);
        if (!Object.keys(requestHeaders).some((h) => h.toLowerCase() === 'content-type')) {
          requestHeaders['Content-Type'] = 'application/json';
        }
      }
    }

    logger.info({ method, path: target.pathname + target.search, auth: authMode, timeoutMs }, 'API client request started');

    let response: Response;
    try {
      response = await fetch(target.toString(), {
        method,
        headers: requestHeaders,
        body: payload,
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error({ method, path: target.pathname, error }, 'API client request failed');
      return { success: false, error: `Request failed: ${error}`, durationMs: Date.now() - startTime };
    }

    const durationMs = Date.now() - startTime;
    const responseHeaders = headersToRecord(response.headers);
    const contentType = responseHeaders['content-type'] || '';

    let data: unknown;
    let bodySnippet: string | undefined;
    if (method === 'HEAD' || response.status === 204) {
      data = null;
    } else {
      const text = await response.text().catch(() => '');
      bodySnippet = text.slice(0, MAX_BODY_SNIPPET);
      if (text === '') {
        data = null;
      } else if (contentType.includes('json') || /^[[{]/.test(text.trim())) {
        try {
          data = JSON.parse(text) as unknown;
        } catch {
          data = text;
        }
      } else {
        data = text;
      }
    }

    if (response.ok) {
      logger.info({ method, path: target.pathname, status: response.status, durationMs }, 'API client request completed');
      return { success: true, status: response.status, data, headers: responseHeaders, durationMs };
    }

    if (options.acceptErrorResponses) {
      logger.warn({ method, path: target.pathname, status: response.status }, 'API client returned an error status (accepted)');
      return { success: true, status: response.status, data, headers: responseHeaders, durationMs };
    }

    logger.warn({ method, path: target.pathname, status: response.status }, 'API client returned an error status');
    return {
      success: false,
      status: response.status,
      data,
      headers: responseHeaders,
      durationMs,
      error: `HTTP ${response.status} ${response.statusText || ''}`.trim() + (bodySnippet ? `: ${bodySnippet}` : ''),
    };
  }
}
