import { DistillationKnowledgeStore, PersistHeuristicsInput } from '../src/services/DistillationKnowledgeStore';
import { HeuristicEntry, StoredKnowledgeEntry } from '@stage7-nextgen/shared';

type Call = { url: string; method: string; body?: string };
type FakeDoc = { id: string; data: StoredKnowledgeEntry & { ts: string } };

function jsonResponse(status: number, body?: unknown): Response {
  return {
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  } as unknown as Response;
}

function heuristic(rule: string, overrides: Partial<HeuristicEntry> = {}): HeuristicEntry {
  return { id: `h-${rule}`, rule, rationale: 'because', evidence: ['e1'], ...overrides };
}

function knowledgeDoc(id: string, origin: 'authored' | 'acquired', ts = '2026-01-01T00:00:00.000Z'): FakeDoc {
  return { id, data: { id, title: id, content: id, assistantId: 'ast-1', scope: 'assistant', origin, ts } };
}

/**
 * Fetch mock with stage-based search results: searches before the writes see
 * `initialDocs`, the cap-enforcement search sees `capDocs`.
 */
function installFetch(options: { initialDocs?: FakeDoc[]; capDocs?: FakeDoc[] } = {}) {
  const calls: Call[] = [];
  let searches = 0;
  const getResponses: Record<string, Response> = {};
  const impl = (url: string, init?: RequestInit): Promise<Response> => {
    const call: Call = { url, method: init?.method || 'GET', body: init?.body as string | undefined };
    calls.push(call);
    if (call.url.endsWith('/documents/search')) {
      searches += 1;
      return Promise.resolve(jsonResponse(200, { documents: searches === 1 ? (options.initialDocs ?? []) : (options.capDocs ?? []) }));
    }
    const id = decodeURIComponent(call.url.split('/documents/')[1]);
    if (id in getResponses) return Promise.resolve(getResponses[id]);
    if (call.method === 'GET') return Promise.resolve(jsonResponse(404, { error: 'Document not found' }));
    return Promise.resolve(jsonResponse(call.method === 'POST' ? 201 : 204, call.method === 'POST' ? { id } : undefined));
  };
  jest.spyOn(global, 'fetch').mockImplementation(impl as typeof fetch);
  return {
    calls,
    /** Make a later GET of `id` return a stored document. */
    storeDocument(id: string, origin: 'authored' | 'acquired') {
      getResponses[id] = jsonResponse(200, knowledgeDoc(id, origin));
    },
  };
}

function createCalls(calls: Call[]): Call[] {
  return calls.filter((c) => c.method === 'POST' && c.url.endsWith('/documents'));
}

function persist(overrides: Partial<PersistHeuristicsInput> = {}): Promise<number> {
  const store = new DistillationKnowledgeStore();
  return store.persist({
    assistantId: 'ast-1',
    tenantId: 'tenant-1',
    missionId: 'mission-9',
    heuristics: [heuristic('Retry once on 429 before failing the step')],
    ...overrides,
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('DistillationKnowledgeStore', () => {
  it('persists each heuristic as an acquired assistant-scoped knowledge entry tagged with the mission id', async () => {
    const { calls } = installFetch();
    const created = await persist({
      heuristics: [
        heuristic('Retry once on 429'),
        heuristic('Validate JSON before parsing'),
      ],
    });

    expect(created).toBe(2);
    const posts = createCalls(calls);
    expect(posts).toHaveLength(2);
    const payload = JSON.parse(posts[0].body!);
    expect(payload.collection).toBe('knowledge');
    expect(payload.tenantId).toBe('tenant-1');
    const entry = payload.data;
    expect(entry.origin).toBe('acquired');
    expect(entry.scope).toBe('assistant');
    expect(entry.assistantId).toBe('ast-1');
    expect(entry.source).toBe('distillation');
    expect(entry.tags).toEqual(['distillation', 'mission-9']);
    expect(entry.content).toContain('Retry once on 429');
    expect(entry.content).toContain('Rationale: because');
    expect(entry.content).toContain('Evidence: e1');
    // Deterministic per assistant+rule, so a re-learned rule lands on the same id.
    expect(entry.id).toMatch(/^knowledge-acquired-[0-9a-f]{24}$/);
    expect(entry.ts).toEqual(expect.any(String));
  });

  it('skips a rule that already has an acquired entry instead of duplicating it', async () => {
    const first = installFetch();
    expect(await persist()).toBe(1);
    const storedId = JSON.parse(createCalls(first.calls)[0].body!).data.id as string;

    // Second mission distills the same rule: the store must not duplicate it.
    const second = installFetch({ initialDocs: [knowledgeDoc(storedId, 'acquired')] });
    second.storeDocument(storedId, 'acquired');

    const created = await persist();
    expect(created).toBe(0);
    expect(createCalls(second.calls)).toHaveLength(0);
  });

  it('never overwrites an authored entry whose id collides with a heuristic', async () => {
    const first = installFetch();
    expect(await persist()).toBe(1);
    const storedId = JSON.parse(createCalls(first.calls)[0].body!).data.id as string;

    // An authored entry now occupies the id the heuristic would use.
    const second = installFetch({});
    second.storeDocument(storedId, 'authored');

    const created = await persist();
    expect(created).toBe(0);
    expect(createCalls(second.calls)).toHaveLength(0);
    expect(second.calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
  });

  it('ignores heuristics without a usable rule', async () => {
    const { calls } = installFetch();
    const created = await persist({
      heuristics: [heuristic('   '), undefined as unknown as HeuristicEntry],
    });
    expect(created).toBe(0);
    expect(createCalls(calls)).toHaveLength(0);
  });

  it('evicts the oldest acquired entries once the assistant is over the cap', async () => {
    const atCap = Array.from({ length: 50 }, (_, i) => knowledgeDoc(`k-${i}`, 'acquired', `2026-01-${String(i + 10).padStart(2, '0')}T00:00:00.000Z`));
    const overCap = [knowledgeDoc('oldest', 'acquired', '2026-01-01T00:00:00.000Z'), ...atCap];
    const { calls } = installFetch({ initialDocs: atCap, capDocs: overCap });

    const created = await persist();
    expect(created).toBe(1);
    const deletes = calls.filter((c) => c.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(deletes[0].url.endsWith('/documents/oldest')).toBe(true);
  });
});
