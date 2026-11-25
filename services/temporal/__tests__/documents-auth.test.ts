import { DistillationKnowledgeStore } from '../src/services/DistillationKnowledgeStore';
import type { HeuristicEntry } from '@stage7-nextgen/shared';

/**
 * DistillationKnowledgeStore writes through the artifacts documents API, which
 * now 401s without a bearer token; every request it makes must carry the
 * service-account Authorization header.
 */
jest.mock('@stage7-nextgen/shared', () => ({
  ...jest.requireActual('@stage7-nextgen/shared'),
  getServiceAuthorizationHeaders: jest.fn(async () => ({ Authorization: 'Bearer svc-temporal-test-token' })),
}));

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? undefined : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const HEURISTIC: HeuristicEntry = {
  id: 'heuristic-1',
  rule: 'Prefer streaming responses for long summaries.',
  source: 'distillation',
};

describe('DistillationKnowledgeStore documents calls carry service auth', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('attaches the Authorization header to the search, existence check, and create', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      // Existence check: 404 so persist() proceeds to create.
      if (method === 'GET') return jsonResponse(404, { error: 'Document not found' });
      return jsonResponse(200, url.includes('/search') ? { documents: [] } : { id: 'knowledge-acquired-x' });
    });

    await DistillationKnowledgeStore.getInstance().persist({
      assistantId: 'assistant-1',
      tenantId: 'system',
      heuristics: [HEURISTIC],
    });

    expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
    for (const call of fetchSpy.mock.calls) {
      const [url, init] = call as [string, RequestInit];
      expect(url).toContain('/api/artifacts/documents');
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer svc-temporal-test-token');
    }
  });
});
