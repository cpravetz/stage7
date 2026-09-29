import {
  runWatchActivity,
  DEFAULT_WATCH_SKILL,
  WATCH_RESULTS_COLLECTION,
} from '../activities/watchActivity';

const WATCH = {
  enabled: true,
  cadence: '1h',
  skill: 'content-strategy-seo-evaluator',
  assistantId: 'content',
  query: 'local seo',
  locations: ['Seattle'],
  companies: ['acme'],
};

type Handler = (url: string, init?: RequestInit) => Promise<Response> | Response;

let handlers: Record<string, Handler> = {};
let calls: Array<{ url: string; init?: RequestInit }> = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function route(fragment: string, handler: Handler) {
  handlers[fragment] = handler;
}

beforeEach(() => {
  handlers = {};
  calls = [];
  process.env.ARTIFACTS_URL = 'http://artifacts:4200';
  process.env.TOOL_EXECUTOR_URL = 'http://tool-executor:3500';

  // Defaults for the happy path. A test overrides only the leg it cares about.
  route('GET /api/artifacts/documents/watch-1', () => json({ data: WATCH }));
  route('POST /api/artifacts/documents', () => json({ id: 'watch-run-1' }, 201));
  route('PUT /api/artifacts/documents/watch-1', () => json({ ok: true }));

  (global as any).fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const key = `${(init?.method || 'GET').toUpperCase()} ${new URL(String(url)).pathname}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`unrouted fetch: ${key}`);
    return handler(String(url), init);
  });
});

const toolHandler = (body: unknown, status = 200) =>
  route('POST /api/tool-executor/tools/execute', () => json(body, status));

describe('runWatchActivity runs the skill the watch declares', () => {
  it('uses the watch skill instead of a hardcoded default', async () => {
    route('GET /api/artifacts/documents/watch-1', () => json({ data: WATCH }));
    toolHandler({ success: true, output: '{}' });
    route('POST /api/artifacts/documents/search', () => json({ documents: [] }));

    const result = await runWatchActivity({ watchId: 'watch-1' });

    expect(result.skill).toBe('content-strategy-seo-evaluator');
    const toolCall = calls.find((c) => c.url.includes('/api/tool-executor/tools/execute'));
    const body = JSON.parse(String(toolCall!.init!.body));
    expect(body.tool).toEqual({ name: 'content-strategy-seo-evaluator', type: 'code', isSkill: true });
    expect(body.assistantId).toBe('content');
  });

  it('falls back to the legacy default only when the watch names no skill', async () => {
    route('GET /api/artifacts/documents/watch-1', () => json({ data: { ...WATCH, skill: undefined } }));
    toolHandler({ success: true, output: '{}' });
    route('POST /api/artifacts/documents/search', () => json({ documents: [] }));

    const result = await runWatchActivity({ watchId: 'watch-1' });

    expect(result.skill).toBe(DEFAULT_WATCH_SKILL);
    expect(result.success).toBe(true);
  });

  it('forwards extra watch arguments to the skill', async () => {
    route('GET /api/artifacts/documents/watch-1', () =>
      json({ data: { ...WATCH, arguments: { depth: 2 } } }),
    );
    toolHandler({ success: true, output: '{}' });
    route('POST /api/artifacts/documents/search', () => json({ documents: [] }));

    await runWatchActivity({ watchId: 'watch-1' });

    const toolCall = calls.find((c) => c.url.includes('/api/tool-executor/tools/execute'));
    const body = JSON.parse(String(toolCall!.init!.body));
    expect(body.input.depth).toBe(2);
  });

  it('sends a payload the tool-executor execute route accepts', async () => {
    route('GET /api/artifacts/documents/watch-1', () => json({ data: WATCH }));
    toolHandler({ success: true, output: '{}' });
    route('POST /api/artifacts/documents/search', () => json({ documents: [] }));

    await runWatchActivity({ watchId: 'watch-1' });

    const toolCall = calls.find((c) => c.url.includes('/api/tool-executor/tools/execute'));
    const body = JSON.parse(String(toolCall!.init!.body));
    // The execute route validates name+type before consulting the registry, and a skill additionally
    // requires assistant context, so all three must be present or every watch fails validation.
    expect(body.tool.name).toBe(WATCH.skill);
    expect(body.tool.type).toBeTruthy();
    expect(body.tool.isSkill).toBe(true);
    expect(body.assistantId).toBeTruthy();
    const headers = toolCall!.init!.headers as Record<string, string>;
    expect(headers['X-Assistant-Id']).toBeTruthy();
  });

  it('surfaces the HTTP status when the executor rejects the request', async () => {
    route('GET /api/artifacts/documents/watch-1', () => json({ data: WATCH }));
    toolHandler({ error: 'tool.name and tool.type are required' }, 400);
    route('POST /api/artifacts/documents/search', () => json({ documents: [] }));

    const result = await runWatchActivity({ watchId: 'watch-1' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('tool.name and tool.type are required');
  });

  it('reports success for a completed run that carries no top-level success field', async () => {
    // This is the executor's real success shape. Reading a top-level `success` made every
    // successful run look like a failure.
    route('GET /api/artifacts/documents/watch-1', () => json({ data: WATCH }));
    toolHandler({
      executionId: 'exec_1',
      status: 'completed',
      output: { output: JSON.stringify({ success: true, status: 'ok', data: { drafts: [] } }) },
    });
    route('POST /api/artifacts/documents/search', () => json({ documents: [] }));

    const result = await runWatchActivity({ watchId: 'watch-1' });

    expect(result.success).toBe(true);
  });

  it('reports failure when a completed run contains a skill-level error', async () => {
    route('GET /api/artifacts/documents/watch-1', () => json({ data: WATCH }));
    toolHandler({
      executionId: 'exec_2',
      status: 'completed',
      output: { output: JSON.stringify({ success: false, status: 'error', error: 'topic is required' }) },
    });
    route('POST /api/artifacts/documents/search', () => json({ documents: [] }));

    const result = await runWatchActivity({ watchId: 'watch-1' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('topic is required');
  });
});

describe('runWatchActivity reports what actually happened', () => {
  beforeEach(() => {
    route('POST /api/artifacts/documents/search', () => json({ documents: [] }));
  });

  it('reports failure when the tool call reports failure', async () => {
    route('GET /api/artifacts/documents/watch-1', () => json({ data: WATCH }));
    toolHandler({ success: false, error: 'no analytics configured' });

    const result = await runWatchActivity({ watchId: 'watch-1' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('no analytics configured');
    // The run is still recorded, marked as failed, so history is honest.
    expect(result.persisted).toBe(true);
  });

  it('does not claim success when the tool call throws', async () => {
    route('GET /api/artifacts/documents/watch-1', () => json({ data: WATCH }));
    route('POST /api/tool-executor/tools/execute', () => {
      throw new Error('connection refused');
    });

    const result = await runWatchActivity({ watchId: 'watch-1' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('connection refused');
  });

  // fetch resolves for a 500; the old code only caught network errors, so a failed write looked
  // like a successful one and the result was lost without a word.
  it('reports failure when persisting the run record returns an HTTP error', async () => {
    route('GET /api/artifacts/documents/watch-1', () => json({ data: WATCH }));
    toolHandler({ success: true, output: '{}' });
    route('POST /api/artifacts/documents', () => json({ error: 'disk full' }, 500));

    const result = await runWatchActivity({ watchId: 'watch-1' });

    expect(result.persisted).toBe(false);
    expect(result.success).toBe(false);
    expect(result.error).toContain('HTTP 500');
  });

  it('reports failure when the lastRunAt update returns an HTTP error', async () => {
    let docReads = 0;
    route('GET /api/artifacts/documents/watch-1', () => {
      docReads += 1;
      return json({ data: WATCH });
    });
    route('PUT /api/artifacts/documents/watch-1', () => json({ error: 'conflict' }, 409));
    toolHandler({ success: true, output: '{}' });
    route('POST /api/artifacts/documents', () => json({ id: 'watch-run-1' }, 201));

    const result = await runWatchActivity({ watchId: 'watch-1' });

    expect(result.persisted).toBe(true);
    expect(result.lastRunRecorded).toBe(false);
    expect(result.success).toBe(false);
    expect(result.error).toContain('HTTP 409');
  });

  it('fails when the watch document is missing', async () => {
    route('GET /api/artifacts/documents/watch-1', () => new Response('', { status: 404 }));
    await expect(runWatchActivity({ watchId: 'watch-1' })).rejects.toThrow(/not found/);
  });
});

describe('runWatchActivity writes consistent timestamps', () => {
  it('uses the same ISO timestamp for the run record and lastRunAt', async () => {
    let runRecord: any = null;
    let lastRunData: any = null;
    route('GET /api/artifacts/documents/watch-1', () => json({ data: WATCH }));
    route('PUT /api/artifacts/documents/watch-1', (_url, init) => {
      lastRunData = JSON.parse(String(init!.body)).data;
      return json({ ok: true });
    });
    toolHandler({ success: true, output: '{}' });
    route('POST /api/artifacts/documents', (_url, init) => {
      runRecord = JSON.parse(String(init!.body));
      return json({ id: 'run-1' }, 201);
    });

    const result = await runWatchActivity({ watchId: 'watch-1' });

    expect(result.success).toBe(true);
    expect(runRecord.collection).toBe(WATCH_RESULTS_COLLECTION);
    // The run id is the document id, and the record names the skill that produced it.
    expect(runRecord.id).toBe(result.runId);
    expect(runRecord.data.skill).toBe('content-strategy-seo-evaluator');
    expect(runRecord.data.success).toBe(true);
    // Both are ISO strings, and they are the same instant.
    expect(typeof runRecord.data.runAt).toBe('string');
    expect(typeof lastRunData.lastRunAt).toBe('string');
    expect(lastRunData.lastRunAt).toBe(runRecord.data.runAt);
    expect(new Date(lastRunData.lastRunAt).toISOString()).toBe(new Date(runRecord.data.runAt).toISOString());
    expect(lastRunData.lastRunOk).toBe(true);
  });

  it('marks lastRunOk false when the tool failed', async () => {
    let lastRunData: any = null;
    route('GET /api/artifacts/documents/watch-1', () => json({ data: WATCH }));
    route('PUT /api/artifacts/documents/watch-1', (_url, init) => {
      lastRunData = JSON.parse(String(init!.body)).data;
      return json({ ok: true });
    });
    toolHandler({ success: false, error: 'tool down' });
    route('POST /api/artifacts/documents', () => json({ id: 'run-1' }, 201));

    const result = await runWatchActivity({ watchId: 'watch-1' });

    expect(result.success).toBe(false);
    expect(lastRunData.lastRunOk).toBe(false);
  });

  it('writes only the fields the watch feature owns alongside lastRunAt', async () => {
    let lastRunData: any = null;
    route('GET /api/artifacts/documents/watch-1', () => json({ data: WATCH }));
    route('PUT /api/artifacts/documents/watch-1', (_url, init) => {
      lastRunData = JSON.parse(String(init!.body)).data;
      return json({ ok: true });
    });
    toolHandler({ success: true, output: '{}' });
    route('POST /api/artifacts/documents', () => json({ id: 'run-1' }, 201));

    await runWatchActivity({ watchId: 'watch-1' });

    // Existing watch fields survive the write.
    expect(lastRunData.query).toBe('local seo');
    expect(lastRunData.companies).toEqual(['acme']);
    expect(lastRunData.skill).toBe('content-strategy-seo-evaluator');
  });
});
