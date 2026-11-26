import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import api from './api';

/**
 * The axios response interceptor is the one client-side 401-recovery path
 * (the main.tsx fetch wrapper was removed). These tests drive the registered
 * rejection handler directly with a stubbed axios adapter so no real HTTP
 * happens.
 */

type FakeConfig = {
  url: string;
  method?: string;
  headers: Record<string, unknown>;
  _retry?: boolean;
};

type FakeError = { response?: { status: number }; config: FakeConfig };

const getRejectedHandler = (): ((error: FakeError) => Promise<unknown>) => {
  const handlers = (
    api.interceptors.response as unknown as {
      handlers: Array<{ rejected?: (error: FakeError) => Promise<unknown> }>;
    }
  ).handlers;
  const handler = handlers.find((h) => typeof h.rejected === 'function');
  if (!handler?.rejected) throw new Error('No response rejection interceptor registered');
  return handler.rejected;
};

const originalAdapter = axios.defaults.adapter;
const originalInstanceAdapter = api.defaults.adapter;
// The refresh call goes through the global axios defaults; the retried
// request goes through the api instance's own defaults — stub both.
const stubAdapter = (handler: (config: FakeConfig) => Promise<unknown>): void => {
  const adapter = (config: FakeConfig) => handler(config);
  (axios.defaults as unknown as { adapter: unknown }).adapter = adapter;
  (api.defaults as unknown as { adapter: unknown }).adapter = adapter;
};

const refreshUrl = '/api/auth/refresh';

describe('api response interceptor (the one refresh path)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    axios.defaults.adapter = originalAdapter;
    api.defaults.adapter = originalInstanceAdapter;
  });

  it('refreshes once and retries the original request with the new token', async () => {
    localStorage.setItem('token', 'stale-token');
    const seen: FakeConfig[] = [];
    stubAdapter(async (config) => {
      seen.push(config);
      if (config.url === refreshUrl) {
        return { data: { token: 'fresh-token' }, status: 200, statusText: 'OK', headers: {}, config };
      }
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
    });

    const result = (await getRejectedHandler()({
      response: { status: 401 },
      config: { url: '/api/brain/things', method: 'get', headers: {} },
    })) as { data: { ok: boolean } };

    expect(result.data.ok).toBe(true);
    expect(localStorage.getItem('token')).toBe('fresh-token');
    expect(seen.filter((c) => c.url === refreshUrl)).toHaveLength(1);
    const retry = seen.find((c) => c.url === '/api/brain/things');
    expect(retry).toBeDefined();
    const authHeader = (retry!.headers as { get?: (k: string) => string }).get?.('Authorization') ??
      retry!.headers.Authorization;
    expect(authHeader).toBe('Bearer fresh-token');
  });

  it('clears the token and redirects to /login exactly once when refresh fails', async () => {
    localStorage.setItem('token', 'stale-token');
    const location = { href: '' };
    Object.defineProperty(window, 'location', { configurable: true, value: location });
    stubAdapter(async (config) => {
      if (config.url === refreshUrl) throw new Error('refresh refused');
      return { data: { ok: true }, status: 200, headers: {} };
    });

    await expect(
      getRejectedHandler()({
        response: { status: 401 },
        config: { url: '/api/brain/things', method: 'get', headers: {} },
      })
    ).rejects.toBeDefined();

    expect(localStorage.getItem('token')).toBeNull();
    expect(location.href).toBe('/login');
    expect(console.error).toHaveBeenCalled();
  });

  it('does not redirect when a 401 arrives with no stored token — credential errors surface on the form', async () => {
    const location = { href: '' };
    Object.defineProperty(window, 'location', { configurable: true, value: location });
    const seen: FakeConfig[] = [];
    stubAdapter(async (config) => {
      seen.push(config);
      return { data: {}, status: 200, headers: {} };
    });

    const error: FakeError = {
      response: { status: 401 },
      config: { url: '/api/auth/login', method: 'post', headers: {} },
    };
    await expect(getRejectedHandler()(error)).rejects.toBeDefined();

    expect(seen).toHaveLength(0);
    expect(location.href).toBe('');
  });

  it('does not refresh again when the request is already a retry (_retry flag)', async () => {
    localStorage.setItem('token', 'stale-token');
    const seen: FakeConfig[] = [];
    stubAdapter(async (config) => {
      seen.push(config);
      return { data: {}, status: 200, headers: {} };
    });

    await expect(
      getRejectedHandler()({
        response: { status: 401 },
        config: { url: '/api/brain/things', method: 'get', headers: {}, _retry: true },
      })
    ).rejects.toBeDefined();

    expect(seen).toHaveLength(0);
    expect(localStorage.getItem('token')).toBe('stale-token');
  });
});
