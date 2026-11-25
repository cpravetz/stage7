import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../stores/authStore';
import { deleteResource, fetchJSON, patchJSON, postFormData, postJSON, putJSON } from './api';

/**
 * The gateway's proxy routes are bearer-gated (fail closed since commit
 * 84822c7), so every helper in utils/api must attach the stored login token.
 * These tests fail on the pre-fix client, which sent no Authorization header
 * and therefore 401'd on every authenticated route.
 */

const fetchMock = vi.fn();

const okResponse = () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const headerOf = (callIndex: number): Record<string, string> | undefined =>
  fetchMock.mock.calls[callIndex][1]?.headers as Record<string, string> | undefined;

beforeEach(() => {
  fetchMock.mockReset();
  // Fresh Response per call — a Response body can only be consumed once.
  fetchMock.mockImplementation(() => Promise.resolve(okResponse()));
  vi.stubGlobal('fetch', fetchMock);
  localStorage.clear();
  useAuthStore.setState({ token: null, user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('utils/api bearer token attachment', () => {
  it('attaches Authorization: Bearer from the auth store token on every helper', async () => {
    useAuthStore.setState({ token: 'tok-123' });

    await fetchJSON('/api/probe');
    await postJSON('/api/probe', { a: 1 });
    await putJSON('/api/probe', { a: 1 });
    await patchJSON('/api/probe', { a: 1 });
    await deleteResource('/api/probe');
    await postFormData('/api/probe', new FormData());

    expect(fetchMock.mock.calls).toHaveLength(6);
    for (let i = 0; i < 6; i++) {
      expect(headerOf(i)?.Authorization, `helper call ${i}`).toBe('Bearer tok-123');
    }
  });

  it('omits the header when no token exists, so public paths stay headerless', async () => {
    await fetchJSON('/api/auth/login');
    await postJSON('/api/auth/login', { email: 'e', password: 'p' });
    await deleteResource('/api/probe');

    expect(fetchMock.mock.calls).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(headerOf(i)?.Authorization, `headerless call ${i}`).toBeUndefined();
    }
  });

  it('keeps caller headers alongside the bearer token', async () => {
    useAuthStore.setState({ token: 'tok-123' });

    await postJSON('/api/probe', { a: 1 }, { headers: { 'X-Custom': 'y' } });

    const headers = headerOf(0);
    expect(headers?.Authorization).toBe('Bearer tok-123');
    // Caller-supplied headers replace the defaults wholesale (pre-existing
    // `...init` semantics) — the bearer token must still ride along.
    expect(headers?.['X-Custom']).toBe('y');
  });

  it('reads a token persisted in localStorage through the auth store, as a page refresh would', async () => {
    localStorage.setItem('token', 'stored-tok');
    useAuthStore.setState({ token: localStorage.getItem('token') });

    await fetchJSON('/api/probe');

    expect(headerOf(0)?.Authorization).toBe('Bearer stored-tok');
  });
});
