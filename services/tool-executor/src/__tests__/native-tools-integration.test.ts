import fs from 'fs';
import os from 'os';
import path from 'path';
import { ToolExecutor } from '../services/ToolExecutor';
import { nativeTools } from '../data/nativeTools';
import { legacyGeneralTools } from '../data/generalTools';
import { Tool, ToolExecution, CredentialRequiredError } from '../types';

const ALL_TOOLS: Tool[] = [...nativeTools, ...legacyGeneralTools];

const byId = (id: string): Tool => {
  const found = ALL_TOOLS.find((t) => t.id === id);
  if (!found) throw new Error(`Tool ${id} is not defined`);
  return found;
};

const FORBIDDEN_DISPATCH_FAILURES = [
  'Code tool is missing sourceCode in manifest',
  'MCP server',
  'Unsupported tool type',
];

const GEOCODE_BODY = {
  results: [{ name: 'Berlin', latitude: 52.52, longitude: 13.41, country: 'Germany', admin1: 'Berlin' }],
};
const FORECAST_BODY = {
  current: {
    time: '2026-03-02T08:15',
    temperature_2m: 6.4,
    relative_humidity_2m: 72,
    apparent_temperature: 4.1,
    precipitation: 0.2,
    weather_code: 61,
    wind_speed_10m: 11.5,
    is_day: 1,
  },
};
const SEARCH_BODY = {
  results: [{ title: 'Stage7', url: 'https://stage7.test/', content: 'Deterministic offline result' }],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const requestUrl = (input: unknown): string => {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object' && 'url' in input) return String((input as { url: unknown }).url);
  return String(input);
};

function matchHostname(url: string, expectedHostname: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === expectedHostname || parsed.hostname.endsWith('.' + expectedHostname);
  } catch {
    return false;
  }
}

function defaultFetchImpl(input: unknown): Response {
  const url = requestUrl(input);
  if (matchHostname(url, 'geocoding-api.open-meteo.com')) return jsonResponse(GEOCODE_BODY);
  if (matchHostname(url, 'api.open-meteo.com')) return jsonResponse(FORECAST_BODY);
  return jsonResponse(SEARCH_BODY);
}

const outputOf = (result: ToolExecution): Record<string, unknown> =>
  (result.output || {}) as Record<string, unknown>;

const errorOf = (result: ToolExecution): string =>
  String(outputOf(result).error ?? result.error ?? '');

// A fresh ToolExecutor per call: FileStorageExecutor and CalendarExecutor read their base
// directories in the constructor, so instances must be built after the temp dirs are exported.
async function run(
  tool: Tool,
  input: Record<string, unknown>,
  credentials?: Record<string, string>
): Promise<ToolExecution> {
  const executor = new ToolExecutor();
  const result = credentials
    ? await executor.executeOrRequestCredentials(tool, input, credentials)
    : await executor.execute(tool, input);
  if (result instanceof CredentialRequiredError) {
    throw new Error(`Unexpected credential request for ${tool.id}: ${result.request.message}`);
  }
  return result;
}

const SCRUBBED_ENV = [
  'CALENDAR_BASE_PATH',
  'FILE_STORAGE_BASE_PATH',
  'API_CLIENT_BASE_URL',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'GOOGLE_API_KEY',
  'GOOGLE_SEARCH_ENGINE_ID',
  'LANGSEARCH_API_KEY',
  'LANGSEARCH_API_URL',
  'SEARXNG_URL',
  'JIRA_URL',
  'CONFLUENCE_URL',
  'SLACK_URL',
  'GITHUB_URL',
];

describe('native tool integration: every advertised tool is reachable', () => {
  const originalFetch = global.fetch;
  const savedEnv: Record<string, string | undefined> = {};
  let fetchMock: jest.Mock;
  let fileBaseDir: string;
  let calendarBaseDir: string;

  beforeAll(() => {
    for (const key of SCRUBBED_ENV) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    fileBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage7-native-files-'));
    calendarBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage7-native-cal-'));
    process.env.FILE_STORAGE_BASE_PATH = fileBaseDir;
    process.env.CALENDAR_BASE_PATH = calendarBaseDir;
  });

  afterAll(() => {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(fileBaseDir, { recursive: true, force: true });
    fs.rmSync(calendarBaseDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    fetchMock = jest.fn();
    fetchMock.mockImplementation(defaultFetchImpl);
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // -------------------------------------------------------------------------
  // Group 1 - core regression
  // -------------------------------------------------------------------------

  const PROBES: Array<{ id: string; input: Record<string, unknown> }> = [
    { id: 'get_weather', input: { location: 'Berlin' } },
    { id: 'calculate', input: { expression: '2 + 3 * 4' } },
    { id: 'search_web', input: { query: 'stage7', maxResults: 3 } },
    { id: 'api_client', input: { path: 'probe' } },
    { id: 'file_ops', input: { operation: 'exists', path: 'probe.txt' } },
    { id: 'jira_issue_track', input: { operation: 'query_issues' } },
    { id: 'confluence_docs', input: { operation: 'search' } },
    { id: 'data_analysis', input: { dataset: [{ v: 1 }, { v: 2 }], analysisType: 'summary' } },
    { id: 'email_sender', input: { to: 'someone@example.org', subject: 'probe' } },
    { id: 'calendar_manager', input: { action: 'list', calendarPath: 'probe.ics' } },
    { id: 'slack_messaging', input: { operation: 'list_channels' } },
    { id: 'github_integration', input: { operation: 'list_issues', repo: 'acme/widgets' } },
    { id: 'database_query', input: { engine: 'postgres', query: 'SELECT 1' } },
    { id: 'file_storage', input: { operation: 'exists', path: 'probe.txt' } },
    { id: 'webhook_dispatcher', input: { url: 'https://hooks.acme.test/ping', event: 'probe' } },
  ];

  it('advertises exactly the 15 previously-unreachable tools, all natively bound', () => {
    expect(ALL_TOOLS).toHaveLength(15);
    expect(new Set(ALL_TOOLS.map((t) => t.id)).size).toBe(15);
    for (const tool of ALL_TOOLS) {
      expect(tool.type).toBe('native');
      expect(tool.manifest.executor).toBeTruthy();
    }
    expect(PROBES.map((p) => p.id).sort()).toEqual(ALL_TOOLS.map((t) => t.id).sort());
  });

  it.each(PROBES.map((p) => [p.id, p.input] as [string, Record<string, unknown>]))(
    'dispatches %s without falling through to a routing failure',
    async (id, input) => {
      const tool = byId(id);
      const result = await run(tool, input);
      const serialized = JSON.stringify({
        status: result.status,
        error: result.error,
        output: result.output,
      });
      for (const forbidden of FORBIDDEN_DISPATCH_FAILURES) {
        expect(serialized).not.toContain(forbidden);
      }
    }
  );

  // -------------------------------------------------------------------------
  // Group 2 - real offline results
  // -------------------------------------------------------------------------

  it('calculate reaches MathExecutor and evaluates real arithmetic', async () => {
    const result = await run(byId('calculate'), { expression: '2 + 3 * 4' });
    expect(result.status).toBe('completed');
    expect(outputOf(result).error).toBeUndefined();
    expect(outputOf(result).result).toBe(14);

    const precedence = await run(byId('calculate'), { expression: '(2 + 3) * 4' });
    expect(outputOf(precedence).result).toBe(20);

    const listOp = await run(byId('calculate'), { values: [2, 4, 4, 4, 5, 5, 7, 9], operation: 'mean' });
    expect(outputOf(listOp).result).toBeCloseTo(5, 10);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('data_analysis reaches DataAnalysisExecutor and computes real statistics', async () => {
    const csv = ['region,revenue', 'North,100', 'South,200', 'East,300'].join('\n');
    const result = await run(byId('data_analysis'), { dataset: csv, analysisType: 'summary' });

    expect(result.status).toBe('completed');
    expect(outputOf(result).error).toBeUndefined();
    expect(outputOf(result).rowCount).toBe(3);
    expect(outputOf(result).columnCount).toBe(2);

    const summary = outputOf(result).summary as {
      columns: Array<{ name: string; numeric?: { mean: number; min: number; max: number } }>;
    };
    const revenue = summary.columns.find((c) => c.name === 'revenue');
    expect(revenue).toBeDefined();
    expect(revenue!.numeric!.mean).toBeCloseTo(200, 10);
    expect(revenue!.numeric!.min).toBe(100);
    expect(revenue!.numeric!.max).toBe(300);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calendar_manager round-trips an event through the temp calendar path', async () => {
    const created = await run(byId('calendar_manager'), {
      action: 'create',
      calendarPath: 'integration.ics',
      summary: 'Integration review',
      start: '2026-03-02T09:00:00Z',
      durationMinutes: 60,
      location: 'Room Z',
    });
    expect(created.status).toBe('completed');
    const event = outputOf(created).event as { uid: string; end: string };
    expect(event.uid).toBeTruthy();
    expect(event.end).toBe('2026-03-02T10:00:00.000Z');

    const onDisk = path.join(calendarBaseDir, 'integration.ics');
    expect(fs.existsSync(onDisk)).toBe(true);
    expect(fs.readFileSync(onDisk, 'utf-8')).toContain('BEGIN:VCALENDAR');

    const listed = await run(byId('calendar_manager'), { action: 'list', calendarPath: 'integration.ics' });
    const events = outputOf(listed).events as Array<{ summary: string; location: string }>;
    expect(events).toHaveLength(1);
    expect(events[0].summary).toBe('Integration review');
    expect(events[0].location).toBe('Room Z');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('file_ops writes and reads back a real file under the temp base path', async () => {
    const content = 'stage7 native executor round-trip\nline two\n';
    const written = await run(byId('file_ops'), {
      operation: 'write',
      path: 'nested/report.txt',
      content,
    });
    expect(written.status).toBe('completed');
    const writeData = outputOf(written).data as { path: string; bytes: number };
    expect(writeData.path).toBe(path.join(fileBaseDir, 'nested', 'report.txt'));
    expect(writeData.bytes).toBe(content.length);
    expect(fs.readFileSync(writeData.path, 'utf-8')).toBe(content);

    const read = await run(byId('file_ops'), { operation: 'read', path: 'nested/report.txt' });
    expect(read.status).toBe('completed');
    expect(outputOf(read).data).toBe(content);

    const listed = await run(byId('file_ops'), { operation: 'list', path: 'nested' });
    expect(outputOf(listed).data).toEqual([
      { name: 'report.txt', isDirectory: false, size: Buffer.byteLength(content) },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Group 3 - mocked global.fetch
  // -------------------------------------------------------------------------

  it('get_weather returns the mocked geocoded forecast through the executor binding', async () => {
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(GEOCODE_BODY))
      .mockResolvedValueOnce(jsonResponse(FORECAST_BODY));

    const result = await run(byId('get_weather'), { location: 'Berlin' });
    expect(result.status).toBe('completed');
    const weather = outputOf(result).weather as {
      location: string; temperature: number; condition: string; isDay: boolean; units: string;
    };
    expect(weather.location).toBe('Berlin, Berlin, Germany');
    expect(weather.temperature).toBeCloseTo(6.4, 10);
    expect(weather.condition).toBe('Slight rain');
    expect(weather.isDay).toBe(true);
    expect(weather.units).toBe('metric');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const geo = new URL(String(fetchMock.mock.calls[0][0]));
    expect(geo.origin + geo.pathname).toBe('https://geocoding-api.open-meteo.com/v1/search');
    expect(geo.searchParams.get('name')).toBe('Berlin');
    const forecast = new URL(String(fetchMock.mock.calls[1][0]));
    expect(forecast.origin + forecast.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(forecast.searchParams.get('latitude')).toBe('52.52');
    expect(forecast.searchParams.get('longitude')).toBe('13.41');
  });

  it('search_web is a declared core tool and returns mocked provider results', async () => {
    const tool = byId('search_web');
    expect(tool.manifest.executor).toBe('search');

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      jsonResponse({
        results: [
          { title: 'Stage7 release notes', url: 'https://stage7.test/releases', content: 'v1 shipped' },
          { title: 'Stage7 architecture', url: 'https://stage7.test/arch', content: 'how it works' },
        ],
      })
    );

    const result = await run(tool, { query: 'stage7 platform', maxResults: 2 });
    expect(result.status).toBe('completed');
    expect(outputOf(result).error).toBeUndefined();

    const results = outputOf(result).results as Array<{ title: string; url: string; snippet: string }>;
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe('Stage7 release notes');
    expect(results[0].url).toBe('https://stage7.test/releases');
    expect(results[0].snippet).toBe('v1 shipped');
    expect(results.map((r) => r.url)).toEqual([
      'https://stage7.test/releases',
      'https://stage7.test/arch',
    ]);

    // One provider (SearxNG, the highest-scoring unconfigured one) satisfied the query,
    // so the executor did not silently fall through to a second network call.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/search?q=stage7+platform');
  });

  it('api_client builds the request from the api_base_url credential', async () => {
    const tool = byId('api_client');
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 7, name: 'widget' }, 200));

    const result = await run(
      tool,
      { path: 'users/7', query: { verbose: true, page: 2 } },
      { api_base_url: 'https://api.acme.test/v1' }
    );

    expect(result.status).toBe('completed');
    expect(outputOf(result).error).toBeUndefined();
    expect(outputOf(result).status).toBe(200);
    expect(outputOf(result).data).toEqual({ id: 7, name: 'widget' });

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe('https://api.acme.test/v1/users/7');
    expect(url.searchParams.get('verbose')).toBe('true');
    expect(url.searchParams.get('page')).toBe('2');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('GET');
  });

  it('api_client reports an actionable error when no base URL is configured', async () => {
    delete process.env.API_CLIENT_BASE_URL;
    const result = await run(byId('api_client'), { path: 'users/7' });
    expect(result.status).toBe('completed');
    expect(errorOf(result)).toBe(
      "No API base URL configured. Provide the 'api_base_url' credential or set API_CLIENT_BASE_URL."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('api_client definition carries no placeholder host', () => {
    const serialized = JSON.stringify(byId('api_client'));
    expect(serialized).not.toMatch(/example\.(com|org|net)/i);
    expect(serialized).not.toMatch(/\bhttps?:\/\/(your|my|replace|placeholder|changeme|insert)[-_.a-z0-9]*/i);
    expect(serialized).not.toMatch(/YOUR_[A-Z0-9_]+/);
    expect(serialized).toContain('api_base_url');
  });

  // -------------------------------------------------------------------------
  // Group 4 - credential-gated tools fail honestly
  // -------------------------------------------------------------------------

  it.each([
    ['email_sender', { to: 'someone@example.org', subject: 'hi' }, /Missing SMTP credentials/i],
    ['jira_issue_track', { operation: 'query_issues' }, /^Missing jira credentials: baseUrl and apiToken are required$/],
    ['confluence_docs', { operation: 'search' }, /^Missing confluence credentials: baseUrl and apiToken are required$/],
    ['slack_messaging', { operation: 'list_channels' }, /^Missing slack credentials: baseUrl and apiToken are required$/],
    ['github_integration', { operation: 'list_issues', repo: 'acme/widgets' }, /^Missing github credentials: baseUrl and apiToken are required$/],
    [
      'database_query',
      { engine: 'postgres', query: 'SELECT 1' },
      // Either the explicit credentials gate, or the optional driver that a configured
      // connection string would need. Both name the missing setup; neither is a routing failure.
      /Connection string or database credentials are required|Cannot find module '(pg|mysql2)'/i,
    ],
    ['webhook_dispatcher', {}, /^Webhook URL is required$/],
  ])('%s names what is missing or unconfigured instead of failing to route', async (id, input, expected) => {
    const result = await run(byId(id as string), input as Record<string, unknown>);
    // 'completed' proves dispatch returned: the executor produced its own error rather than
    // the ToolExecutor rejecting the tool as unregistered.
    expect(result.status).toBe('completed');
    const error = errorOf(result);
    expect(error).toBeTruthy();
    expect(error).not.toContain('MCP server');
    expect(error).not.toContain('Unsupported tool type');
    expect(error).toMatch(expected as RegExp);
  });

  // -------------------------------------------------------------------------
  // Group 5 - legacy name-heuristic path still works
  // -------------------------------------------------------------------------

  it('a tool with no manifest.executor but "search" in its name still reaches SearchExecutor', async () => {
    const legacySearchTool: Tool = {
      id: 'legacy_search_probe',
      name: 'search',
      description: 'Legacy skill whose name matches the historical search heuristic',
      type: 'native',
      manifest: {},
      inputSchema: { type: 'object', properties: {} },
      outputSchema: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(legacySearchTool.manifest.executor).toBeUndefined();

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      jsonResponse({
        results: [{ title: 'Legacy hit', url: 'https://legacy.test/1', content: 'via name heuristic' }],
      })
    );

    const result = await run(legacySearchTool, { query: 'legacy path' });
    expect(result.status).toBe('completed');
    expect(outputOf(result).error).toBeUndefined();

    const results = outputOf(result).results as Array<{ title: string; url: string; snippet: string }>;
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Legacy hit');
    expect(results[0].url).toBe('https://legacy.test/1');
    expect(results[0].snippet).toBe('via name heuristic');
    expect(outputOf(result).count).toBe(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/search?q=legacy+path');
  });

  it('the suite never issues a real network request', () => {
    // A leaked real fetch would show up as a network error rather than a jest.fn() call.
    expect(jest.isMockFunction(global.fetch)).toBe(true);
  });
});
