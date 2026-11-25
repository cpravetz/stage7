import { EntityMemoryStore } from '../src/services/EntityMemoryStore';

/**
 * Every artifacts documents request EntityMemoryStore makes must carry the
 * service-account Authorization header — the documents router 401s without it.
 */
jest.mock('@stage7-nextgen/shared', () => ({
  ...jest.requireActual('@stage7-nextgen/shared'),
  getServiceAuthorizationHeaders: jest.fn(async () => ({ Authorization: 'Bearer svc-brain-test-token' })),
}));

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? undefined : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SAMPLE_INPUT = {
  tenantId: 'tenant-1',
  entityId: 'entity-1',
  assistantId: 'assistant-1',
  missionId: 'mission-1',
  summary: 'Prefers concise answers.',
  preferences: ['concise'],
  constraints: [],
  decisions: [],
};

describe('EntityMemoryStore documents calls carry service auth', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('attaches the Authorization header to the search and create round-trip', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () =>
      jsonResponse(200, { documents: [] }),
    );

    await EntityMemoryStore.getInstance().upsert(SAMPLE_INPUT);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    for (const call of fetchSpy.mock.calls) {
      const [url, init] = call as [string, RequestInit];
      expect(url).toContain('/api/artifacts/documents');
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer svc-brain-test-token');
    }
  });

  it('attaches the Authorization header when searching active memories', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () =>
      jsonResponse(200, { documents: [] }),
    );

    await EntityMemoryStore.getInstance().getActive('entity-1', 'assistant-1', 'tenant-1');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer svc-brain-test-token');
  });
});
