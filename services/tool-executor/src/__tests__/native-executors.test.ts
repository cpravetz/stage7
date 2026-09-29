import fs from 'fs';
import os from 'os';
import path from 'path';
import { MathExecutor, MathResult } from '../executors/MathExecutor';
import { DataAnalysisExecutor, DataAnalysisResult } from '../executors/DataAnalysisExecutor';
import { CalendarExecutor, CalendarResult } from '../executors/CalendarExecutor';
import { WeatherExecutor, WeatherResult } from '../executors/WeatherExecutor';
import { ApiClientExecutor, ApiClientResult } from '../executors/ApiClientExecutor';
import { ToolCredentials } from '../services/CredentialProvider';

const NO_CREDS: ToolCredentials = {};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// MathExecutor
// ---------------------------------------------------------------------------

describe('MathExecutor', () => {
  const executor = new MathExecutor();

  const evalExpr = async (expression: string): Promise<MathResult> =>
    executor.execute({ expression }, NO_CREDS);

  const expectOk = async (expression: string, expected: number, tolerance = 1e-10): Promise<void> => {
    const result = await evalExpr(expression);
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(typeof result.result).toBe('number');
    expect(result.result as number).toBeCloseTo(expected, Math.max(0, -Math.floor(Math.log10(tolerance))));
  };

  it('respects operator precedence', async () => {
    await expectOk('2 + 3 * 4', 14);
    await expectOk('2 * 3 + 4', 10);
    await expectOk('100 / 5 / 2', 10);
  });

  it('honours parentheses', async () => {
    await expectOk('(2 + 3) * 4', 20);
    await expectOk('((1 + 2) * (3 + 4)) - 5', 16);
  });

  it('handles unary minus and plus', async () => {
    await expectOk('-5 + 2', -3);
    await expectOk('-(3 + 4)', -7);
    await expectOk('+7 - -2', 9);
  });

  it('treats ^ as right-associative and higher precedence than unary minus', async () => {
    await expectOk('2^3^2', 512);
    await expectOk('-2^2', -4);
    await expectOk('2^-1', 0.5);
  });

  it('parses decimals and scientific notation', async () => {
    await expectOk('1.5 * 4', 6);
    await expectOk('1e6', 1000000);
    await expectOk('2.5e-2', 0.025);
  });

  it('supports modulo', async () => {
    await expectOk('7 % 3', 1);
  });

  it('supports constants', async () => {
    await expectOk('pi', Math.PI);
    await expectOk('2 * e', 2 * Math.E);
  });

  it('supports every documented function', async () => {
    await expectOk('abs(-5)', 5);
    await expectOk('ceil(1.2)', 2);
    await expectOk('floor(1.8)', 1);
    await expectOk('round(2.5)', 3);
    await expectOk('round(3.14159, 2)', 3.14);
    await expectOk('sqrt(16)', 4);
    await expectOk('cbrt(27)', 3);
    await expectOk('pow(2, 10)', 1024);
    await expectOk('min(3, 1, 2)', 1);
    await expectOk('max(3, 1, 2)', 3);
    await expectOk('log(1)', 0);
    await expectOk('log2(8)', 3);
    await expectOk('log10(1000)', 3);
    await expectOk('exp(0)', 1);
    await expectOk('sin(0)', 0);
    await expectOk('cos(0)', 1);
    await expectOk('tan(0)', 0);
    await expectOk('asin(1)', Math.PI / 2);
    await expectOk('acos(1)', 0);
    await expectOk('atan(0)', 0);
    await expectOk('atan2(1, 1)', Math.PI / 4);
    await expectOk('sign(-3)', -1);
    await expectOk('hypot(3, 4)', 5);
  });

  it('rejects malicious and out-of-grammar input', async () => {
    const hostile = [
      '__proto__',
      'constructor',
      'process.exit(1)',
      '1;2',
      '[1,2,3].length',
      'require("fs")',
      'foo(1)',
      'this.x',
      '1 & 2',
      'a',
    ];
    for (const expression of hostile) {
      const result = await evalExpr(expression);
      expect(result.success).toBe(false);
      expect(result.result).toBeUndefined();
      expect(result.error).toBeTruthy();
    }
  });

  it('does not allow prototype-chain identifiers as function calls', async () => {
    const result = await evalExpr('constructor(1)');
    expect(result.success).toBe(false);
    expect(result.error).toContain('constructor');
  });

  it('reports an unclosed parenthesis precisely', async () => {
    const result = await evalExpr('(1 + 2');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Unclosed parenthesis opened at position 0');
  });

  it('reports a division by zero', async () => {
    const result = await evalExpr('1 / 0');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Division by zero');
  });

  it('guards sqrt of a negative, log of zero and non-finite results', async () => {
    expect((await evalExpr('sqrt(-1)')).success).toBe(false);
    expect((await evalExpr('log(0)')).success).toBe(false);
    expect((await evalExpr('log(-2)')).success).toBe(false);
    expect((await evalExpr('log10(0)')).success).toBe(false);
    const overflow = await evalExpr('10 ^ 400');
    expect(overflow.success).toBe(false);
    expect(overflow.error).toBeTruthy();
  });

  it('rejects an empty expression and a missing argument', async () => {
    expect((await evalExpr('   ')).success).toBe(false);
    expect((await evalExpr('abs()')).success).toBe(false);
  });

  it('computes list statistics', async () => {
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    const sum = await executor.execute({ values, operation: 'sum' }, NO_CREDS);
    expect(sum).toMatchObject({ success: true, result: 40 });

    const mean = await executor.execute({ values, operation: 'mean' }, NO_CREDS);
    expect(mean.result).toBeCloseTo(5, 10);

    const median = await executor.execute({ values, operation: 'median' }, NO_CREDS);
    expect(median.result).toBeCloseTo(4.5, 10);

    const min = await executor.execute({ values, operation: 'min' }, NO_CREDS);
    expect(min.result).toBe(2);

    const max = await executor.execute({ values, operation: 'max' }, NO_CREDS);
    expect(max.result).toBe(9);

    // Sample stddev (n - 1) of [2,4,4,4,5,5,7,9] is 2.13808993...
    const stddev = await executor.execute({ values, operation: 'stddev' }, NO_CREDS);
    expect(stddev.result).toBeCloseTo(2.138089935, 8);
  });

  it('rejects malformed list inputs', async () => {
    expect((await executor.execute({ values: [], operation: 'sum' }, NO_CREDS)).success).toBe(false);
    expect((await executor.execute({ values: [1, NaN], operation: 'sum' }, NO_CREDS)).success).toBe(false);
    expect((await executor.execute({}, NO_CREDS)).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DataAnalysisExecutor
// ---------------------------------------------------------------------------

describe('DataAnalysisExecutor', () => {
  const executor = new DataAnalysisExecutor();

  const numericSummary = (result: DataAnalysisResult, column: string) => {
    const col = result.summary!.columns.find((c) => c.name === column);
    expect(col).toBeDefined();
    return col!.numeric!;
  };

  it('analyses a JSON array of objects', async () => {
    const dataset = [
      { region: 'North', revenue: 100, units: 5 },
      { region: 'South', revenue: 200, units: 7 },
      { region: 'East', revenue: 300, units: 9 },
    ];
    const result = await executor.execute({ dataset, analysisType: 'summary' }, NO_CREDS);
    expect(result.success).toBe(true);
    expect(result.rowCount).toBe(3);
    expect(result.columnCount).toBe(3);
    expect(result.insights.length).toBeGreaterThan(0);

    const revenue = numericSummary(result, 'revenue');
    expect(revenue.count).toBe(3);
    expect(revenue.mean).toBeCloseTo(200, 10);
    expect(revenue.median).toBeCloseTo(200, 10);
    expect(revenue.min).toBe(100);
    expect(revenue.max).toBe(300);
    expect(revenue.stddev).toBeCloseTo(100, 10);
    expect(revenue.p25).toBeCloseTo(150, 10);
    expect(revenue.p75).toBeCloseTo(250, 10);

    const region = result.summary!.columns.find((c) => c.name === 'region')!;
    expect(region.type).toBe('string');
    expect(region.categorical!.distinctCount).toBe(3);
    expect(region.categorical!.count).toBe(3);
  });

  it('parses CSV including quoted commas, escaped quotes and newlines', async () => {
    const csv = [
      'name,note,val',
      '"Smith, John","He said ""hi""",10',
      '"Multi\nline",plain,20',
      'Jane,,30',
    ].join('\n');
    const result = await executor.execute({ dataset: csv, analysisType: 'summary' }, NO_CREDS);
    expect(result.success).toBe(true);
    expect(result.rowCount).toBe(3);
    const name = result.summary!.columns.find((c) => c.name === 'name')!;
    expect(name.categorical!.topValues.map((t) => t.value)).toContain('Smith, John');
    expect(name.categorical!.topValues.map((t) => t.value)).toContain('Multi\nline');
    const val = numericSummary(result, 'val');
    expect(val.count).toBe(3);
    expect(val.nullCount).toBe(0);
  });

  it('tolerates ragged CSV rows', async () => {
    const csv = 'a,b,c\n1,2\n3,4,5,6';
    const result = await executor.execute({ dataset: csv, analysisType: 'summary' }, NO_CREDS);
    expect(result.success).toBe(true);
    expect(result.rowCount).toBe(2);
    // c is present but null on the short row, plus an unnamed extra column.
    expect(result.columnCount).toBe(4);
    expect(numericSummary(result, 'c').nullCount).toBe(1);
  });

  it('returns a clear error for unparseable input', async () => {
    const broken = await executor.execute({ dataset: '[{"a": 1,}]' }, NO_CREDS);
    expect(broken.success).toBe(false);
    expect(broken.error).toContain('JSON parse failed');
    expect(broken.insights).toEqual([]);

    const empty = await executor.execute({ dataset: '   ' }, NO_CREDS);
    expect(empty.success).toBe(false);
    expect(empty.error).toBeTruthy();

    const garbage = await executor.execute({ dataset: 'just some prose' }, NO_CREDS);
    expect(garbage.success).toBe(false);
    expect(garbage.error).toBeTruthy();
  });

  it('computes a least-squares trend on a perfectly linear series', async () => {
    const dataset = [
      { t: 1, v: 3 },
      { t: 2, v: 5 },
      { t: 3, v: 7 },
      { t: 4, v: 9 },
      { t: 5, v: 11 },
    ];
    const result = await executor.execute(
      { dataset, analysisType: 'trend', xColumn: 't', yColumn: 'v' },
      NO_CREDS
    );
    expect(result.success).toBe(true);
    const trend = result.summary!.trend!;
    expect(trend.slope).toBeCloseTo(2, 8);
    expect(trend.intercept).toBeCloseTo(1, 8);
    expect(trend.rSquared).toBeCloseTo(1, 8);
    expect(trend.direction).toBe('increasing');
    expect(trend.points).toBe(5);
    expect(result.insights.some((i) => i.includes('increasing'))).toBe(true);
  });

  it('detects a decreasing trend and rejects a constant x column', async () => {
    const decreasing = [
      { t: 1, v: 10 },
      { t: 2, v: 8 },
      { t: 3, v: 6 },
    ];
    const down = await executor.execute(
      { dataset: decreasing, analysisType: 'trend', xColumn: 't', yColumn: 'v' },
      NO_CREDS
    );
    expect(down.success).toBe(true);
    expect(down.summary!.trend!.direction).toBe('decreasing');
    expect(down.summary!.trend!.slope).toBeCloseTo(-2, 8);

    const constantX = [
      { t: 1, v: 10 },
      { t: 1, v: 20 },
    ];
    const flat = await executor.execute(
      { dataset: constantX, analysisType: 'trend', xColumn: 't', yColumn: 'v' },
      NO_CREDS
    );
    expect(flat.success).toBe(false);
    expect(flat.error).toBeTruthy();
  });

  it('computes a Pearson correlation matrix and skips constant columns', async () => {
    const dataset = [
      { a: 1, b: 2, constant: 7 },
      { a: 2, b: 4, constant: 7 },
      { a: 3, b: 6, constant: 7 },
      { a: 4, b: 8, constant: 7 },
    ];
    const result = await executor.execute({ dataset, analysisType: 'correlation' }, NO_CREDS);
    expect(result.success).toBe(true);
    const pairs = result.summary!.correlations!;
    const ab = pairs.find((p) => p.columnA === 'a' && p.columnB === 'b');
    expect(ab).toBeDefined();
    expect(ab!.coefficient).toBeCloseTo(1, 8);
    expect(ab!.strength).toBe('strong');
    expect(pairs.some((p) => p.columnB === 'constant' || p.columnA === 'constant')).toBe(false);
    expect(result.summary!.skippedCorrelations).toContain('a vs constant');
    expect(result.summary!.skippedCorrelations).toContain('b vs constant');
  });

  it('produces a histogram and skewness for a distribution', async () => {
    const values = [1, 2, 2, 3, 3, 3, 4, 4, 5, 5, 5, 5, 6, 6, 7, 8, 9, 10, 11, 12];
    const result = await executor.execute(
      { dataset: values.map((v) => ({ v })), analysisType: 'distribution', targetColumn: 'v' },
      NO_CREDS
    );
    expect(result.success).toBe(true);
    const dist = result.summary!.distribution!;
    expect(dist.column).toBe('v');
    expect(dist.binCount).toBeGreaterThan(1);
    expect(dist.bins.reduce((acc, b) => acc + b.count, 0)).toBe(values.length);
    expect(dist.skewness).not.toBeNull();
    expect(typeof dist.skewnessInterpretation).toBe('string');
  });

  it('rejects an unsupported analysis type', async () => {
    const result = await executor.execute({ dataset: [{ a: 1 }], analysisType: 'nope' as never }, NO_CREDS);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported analysisType');
  });
});

// ---------------------------------------------------------------------------
// CalendarExecutor
// ---------------------------------------------------------------------------

describe('CalendarExecutor', () => {
  let baseDir: string;
  let executor: CalendarExecutor;

  beforeAll(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage7-cal-test-'));
    process.env.CALENDAR_BASE_PATH = baseDir;
    executor = new CalendarExecutor();
  });

  afterAll(() => {
    delete process.env.CALENDAR_BASE_PATH;
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  it('creates an event and lists it back', async () => {
    const created: CalendarResult = await executor.execute(
      {
        action: 'create',
        calendarPath: 'roundtrip.ics',
        summary: 'Design review',
        start: '2026-03-02T09:00:00Z',
        durationMinutes: 60,
        location: 'Room A',
        attendees: [{ email: 'ada@example.com', name: 'Ada' }],
      },
      NO_CREDS
    );
    expect(created.success).toBe(true);
    expect(created.event).toBeDefined();
    expect(created.event!.uid).toBeTruthy();
    expect(created.event!.end).toBe('2026-03-02T10:00:00.000Z');

    const listed = await executor.execute({ action: 'list', calendarPath: 'roundtrip.ics' }, NO_CREDS);
    expect(listed.success).toBe(true);
    expect(listed.events).toHaveLength(1);
    expect(listed.events![0].summary).toBe('Design review');
    expect(listed.events![0].location).toBe('Room A');
    expect(listed.events![0].attendees).toEqual([{ email: 'ada@example.com', name: 'Ada' }]);
    expect(listed.ics).toContain('BEGIN:VCALENDAR');
    expect(listed.ics).toContain('END:VCALENDAR');
    expect(listed.ics).toContain('BEGIN:VEVENT');
    expect(listed.ics).toContain('VERSION:2.0');
    expect(listed.ics).toContain('DTSTART:20260302T090000Z');
    expect(listed.ics).toContain('DTEND:20260302T100000Z');
    expect(listed.ics).toContain('ATTENDEE;CN=Ada:mailto:ada@example.com');
  });

  it('escapes commas, semicolons and backslashes in text values', async () => {
    const summary = 'Budget; Review, Q1 (draft) \\ final';
    const created = await executor.execute(
      {
        action: 'create',
        calendarPath: 'escape.ics',
        summary,
        start: '2026-03-03T10:00:00Z',
        end: '2026-03-03T11:00:00Z',
      },
      NO_CREDS
    );
    expect(created.success).toBe(true);

    const exported = await executor.execute({ action: 'export', calendarPath: 'escape.ics' }, NO_CREDS);
    expect(exported.success).toBe(true);
    expect(exported.ics).toContain('SUMMARY:Budget\\; Review\\, Q1 (draft) \\\\ final');

    const listed = await executor.execute({ action: 'list', calendarPath: 'escape.ics' }, NO_CREDS);
    expect(listed.events![0].summary).toBe(summary);
  });

  it('folds long lines at 75 octets and round-trips them', async () => {
    const description = 'A'.repeat(60) + ' ' + 'B'.repeat(80) + ' ' + 'C'.repeat(40);
    const created = await executor.execute(
      {
        action: 'create',
        calendarPath: 'fold.ics',
        summary: 'Folding test',
        start: '2026-03-04T10:00:00Z',
        end: '2026-03-04T11:00:00Z',
        description,
      },
      NO_CREDS
    );
    expect(created.success).toBe(true);

    const exported = await executor.execute({ action: 'export', calendarPath: 'fold.ics' }, NO_CREDS);
    expect(exported.success).toBe(true);

    const physicalLines = exported.ics!.split('\r\n');
    for (const line of physicalLines) {
      if (line === '') continue;
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
    expect(physicalLines.filter((l) => l.startsWith(' ')).length).toBeGreaterThan(0);

    const listed = await executor.execute({ action: 'list', calendarPath: 'fold.ics' }, NO_CREDS);
    expect(listed.events![0].description).toBe(description);
  });

  it('updates and then deletes an event', async () => {
    const created = await executor.execute(
      {
        action: 'create',
        calendarPath: 'mutate.ics',
        summary: 'Original',
        start: '2026-03-05T08:00:00Z',
        end: '2026-03-05T09:00:00Z',
      },
      NO_CREDS
    );
    const uid = created.event!.uid;

    const updated = await executor.execute(
      { action: 'update', calendarPath: 'mutate.ics', uid, summary: 'Renamed', location: 'Room B' },
      NO_CREDS
    );
    expect(updated.success).toBe(true);
    expect(updated.event!.summary).toBe('Renamed');
    expect(updated.event!.location).toBe('Room B');
    expect(updated.event!.start).toBe('2026-03-05T08:00:00.000Z');

    const afterUpdate = await executor.execute({ action: 'list', calendarPath: 'mutate.ics' }, NO_CREDS);
    expect(afterUpdate.events![0].summary).toBe('Renamed');

    const deleted = await executor.execute({ action: 'delete', calendarPath: 'mutate.ics', uid }, NO_CREDS);
    expect(deleted.success).toBe(true);
    expect(deleted.event!.uid).toBe(uid);

    const afterDelete = await executor.execute({ action: 'list', calendarPath: 'mutate.ics' }, NO_CREDS);
    expect(afterDelete.events).toHaveLength(0);

    const deleteAgain = await executor.execute({ action: 'delete', calendarPath: 'mutate.ics', uid }, NO_CREDS);
    expect(deleteAgain.success).toBe(false);
    expect(deleteAgain.error).toContain('No event with uid');
  });

  it('filters list results by a date range', async () => {
    await executor.execute(
      { action: 'create', calendarPath: 'range.ics', summary: 'Jan', start: '2026-01-10T09:00:00Z', durationMinutes: 60 },
      NO_CREDS
    );
    await executor.execute(
      { action: 'create', calendarPath: 'range.ics', summary: 'Feb', start: '2026-02-10T09:00:00Z', durationMinutes: 60 },
      NO_CREDS
    );
    const filtered = await executor.execute(
      { action: 'list', calendarPath: 'range.ics', rangeStart: '2026-02-01T00:00:00Z' },
      NO_CREDS
    );
    expect(filtered.events).toHaveLength(1);
    expect(filtered.events![0].summary).toBe('Feb');
  });

  it('computes free/busy slots', async () => {
    const result = await executor.execute(
      {
        action: 'check_availability',
        windowStart: '2026-03-06T09:00:00Z',
        windowEnd: '2026-03-06T11:00:00Z',
        slotMinutes: 30,
        busy: [{ attendee: 'ada@example.com', start: '2026-03-06T09:30:00Z', end: '2026-03-06T10:30:00Z' }],
      },
      NO_CREDS
    );
    expect(result.success).toBe(true);
    const availability = result.availability!;
    expect(availability.slots).toHaveLength(4);
    expect(availability.slots.map((s) => s.free)).toEqual([true, false, false, true]);
    expect(availability.slots[1].busyWith).toEqual(['ada@example.com']);
    expect(availability.freeSlotCount).toBe(2);
  });

  it('validates input', async () => {
    expect((await executor.execute({ action: 'create', calendarPath: 'x.ics', start: '2026-01-01T00:00:00Z' }, NO_CREDS)).success).toBe(false);
    expect((await executor.execute({ action: 'create', calendarPath: 'x.ics', summary: 's' }, NO_CREDS)).success).toBe(false);
    expect((await executor.execute({ action: 'create', calendarPath: 'x.ics', summary: 's', start: 'not-a-date' }, NO_CREDS)).success).toBe(false);
    expect((await executor.execute({ action: 'create', calendarPath: 'x.ics', summary: 's', start: '2026-01-01T10:00:00Z', end: '2026-01-01T09:00:00Z' }, NO_CREDS)).success).toBe(false);
    expect((await executor.execute({ action: 'create', calendarPath: '../escape.ics', summary: 's', start: '2026-01-01T09:00:00Z' }, NO_CREDS)).success).toBe(false);
    expect((await executor.execute({ action: 'delete', calendarPath: 'x.ics' }, NO_CREDS)).success).toBe(false);
    expect((await executor.execute({ action: 'nope' as never }, NO_CREDS)).success).toBe(false);
    expect((await executor.execute({ action: 'update', calendarPath: 'x.ics' }, NO_CREDS)).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WeatherExecutor (fully mocked network)
// ---------------------------------------------------------------------------

describe('WeatherExecutor', () => {
  const executor = new WeatherExecutor();
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

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

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('geocodes then fetches the forecast, and returns mapped conditions', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(GEOCODE_BODY)).mockResolvedValueOnce(jsonResponse(FORECAST_BODY));

    const result: WeatherResult = await executor.execute({ location: 'Berlin' }, NO_CREDS);
    expect(result.success).toBe(true);
    expect(result.weather).toBeDefined();
    expect(result.weather!.location).toBe('Berlin, Berlin, Germany');
    expect(result.weather!.latitude).toBeCloseTo(52.52);
    expect(result.weather!.temperature).toBeCloseTo(6.4);
    expect(result.weather!.condition).toBe('Slight rain');
    expect(result.weather!.isDay).toBe(true);
    expect(result.weather!.units).toBe('metric');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const geoUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(geoUrl.origin + geoUrl.pathname).toBe('https://geocoding-api.open-meteo.com/v1/search');
    expect(geoUrl.searchParams.get('name')).toBe('Berlin');
    expect(geoUrl.searchParams.get('count')).toBe('1');
    expect(geoUrl.searchParams.get('language')).toBe('en');
    expect(geoUrl.searchParams.get('format')).toBe('json');

    const forecastUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(forecastUrl.origin + forecastUrl.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(forecastUrl.searchParams.get('latitude')).toBe('52.52');
    expect(forecastUrl.searchParams.get('longitude')).toBe('13.41');
    expect(forecastUrl.searchParams.get('timezone')).toBe('UTC');
    expect(forecastUrl.searchParams.get('current')).toBe(
      'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day'
    );
    expect(forecastUrl.searchParams.get('temperature_unit')).toBeNull();
  });

  it('requests fahrenheit/mph and a forecast window for imperial units', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(GEOCODE_BODY)).mockResolvedValueOnce(jsonResponse(FORECAST_BODY));
    const result = await executor.execute({ location: 'Berlin', units: 'imperial', forecastDays: 3 }, NO_CREDS);
    expect(result.success).toBe(true);
    expect(result.weather!.units).toBe('imperial');

    const forecastUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(forecastUrl.searchParams.get('temperature_unit')).toBe('fahrenheit');
    expect(forecastUrl.searchParams.get('wind_speed_unit')).toBe('mph');
    expect(forecastUrl.searchParams.get('forecast_days')).toBe('3');
  });

  it('maps WMO weather codes to readable conditions', async () => {
    const cases: Array<[number, string]> = [
      [0, 'Clear sky'],
      [2, 'Partly cloudy'],
      [3, 'Overcast'],
      [45, 'Fog'],
      [55, 'Dense drizzle'],
      [65, 'Heavy rain'],
      [75, 'Heavy snow fall'],
      [82, 'Violent rain showers'],
      [86, 'Heavy snow showers'],
      [95, 'Thunderstorm'],
    ];
    for (const [code, expected] of cases) {
      fetchMock.mockReset();
      fetchMock
        .mockResolvedValueOnce(jsonResponse(GEOCODE_BODY))
        .mockResolvedValueOnce(jsonResponse({ current: { ...FORECAST_BODY.current, weather_code: code } }));
      const result = await executor.execute({ location: 'Berlin' }, NO_CREDS);
      expect(result.weather!.condition).toBe(expected);
    }
  });

  it('reports a blank location without calling the network', async () => {
    const result = await executor.execute({ location: '   ' }, NO_CREDS);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Weather location is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range forecastDays', async () => {
    const result = await executor.execute({ location: 'Berlin', forecastDays: 30 }, NO_CREDS);
    expect(result.success).toBe(false);
    expect(result.error).toContain('forecastDays');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a clear error when geocoding finds nothing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [] }));
    const result = await executor.execute({ location: 'Nowhereville' }, NO_CREDS);
    expect(result.success).toBe(false);
    expect(result.error).toBe("No location found for 'Nowhereville'");
  });

  it('surfaces a non-OK HTTP response from Open-Meteo', async () => {
    fetchMock.mockResolvedValueOnce(new Response('upstream exploded', { status: 503 }));
    const result = await executor.execute({ location: 'Berlin' }, NO_CREDS);
    expect(result.success).toBe(false);
    expect(result.error).toContain('503');
    expect(result.error).toContain('upstream exploded');
  });

  it('surfaces a network failure without throwing', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    const result = await executor.execute({ location: 'Berlin' }, NO_CREDS);
    expect(result.success).toBe(false);
    expect(result.error).toContain('ECONNRESET');
  });

  it('applies a timeout signal to every request', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(GEOCODE_BODY)).mockResolvedValueOnce(jsonResponse(FORECAST_BODY));
    await executor.execute({ location: 'Berlin' }, NO_CREDS);
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      expect(init.signal).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// ApiClientExecutor (fully mocked network)
// ---------------------------------------------------------------------------

describe('ApiClientExecutor', () => {
  const executor = new ApiClientExecutor();
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    delete process.env.API_CLIENT_BASE_URL;
  });

  afterAll(() => {
    global.fetch = originalFetch;
    delete process.env.API_CLIENT_BASE_URL;
  });

  const creds = (extra: ToolCredentials = {}): ToolCredentials => ({
    api_base_url: 'https://api.acme.test/v1',
    ...extra,
  });

  it('joins the path onto the configured base and appends the query string', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 7 }, 200));
    const result: ApiClientResult = await executor.execute(
      { path: 'users/7', query: { verbose: true, page: 2 } },
      creds()
    );
    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ id: 7 });
    expect(typeof result.durationMs).toBe('number');

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe('https://api.acme.test/v1/users/7');
    expect(url.searchParams.get('verbose')).toBe('true');
    expect(url.searchParams.get('page')).toBe('2');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('GET');
    expect(init.signal).toBeDefined();
  });

  it('adds the right auth header for each mode', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await executor.execute({ path: 'a', auth: 'bearer' }, creds({ api_token: 'tok-123' }));
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok-123' });

    fetchMock.mockClear();
    await executor.execute({ path: 'a', auth: 'basic' }, creds({ api_username: 'u', api_password: 'p' }));
    const basic = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(basic.Authorization).toBe(`Basic ${Buffer.from('u:p').toString('base64')}`);

    fetchMock.mockClear();
    await executor.execute({ path: 'a', auth: 'apiKeyHeader' }, creds({ api_key: 'k', api_key_header: 'X-Api-Key' }));
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ 'X-Api-Key': 'k' });

    fetchMock.mockClear();
    await executor.execute({ path: 'a' }, creds());
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty('Authorization');
  });

  it('sends a JSON body for non-GET methods', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ created: true }, 201));
    const result = await executor.execute(
      { path: 'items', method: 'POST', body: { name: 'thing' }, headers: { 'X-Trace': 'abc' } },
      creds()
    );
    expect(result.success).toBe(true);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: 'thing' }));
    expect(init.headers).toMatchObject({ 'X-Trace': 'abc', 'Content-Type': 'application/json' });
  });

  it('rejects absolute URLs and scheme-relative paths (SSRF guard)', async () => {
    const hostile = ['https://evil.test/steal', 'http://169.254.169.254/latest/meta-data', '//evil.test/x', 'file:///etc/passwd'];
    for (const p of hostile) {
      const result = await executor.execute({ path: p }, creds());
      expect(result.success).toBe(false);
      expect(result.error).toContain('relative path');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps a traversing path on the configured origin', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const result = await executor.execute({ path: '../../other/thing' }, creds());
    expect(result.success).toBe(true);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin).toBe('https://api.acme.test');
    expect(url.pathname).toBe('/other/thing');
  });

  it('rejects a non-http base URL', async () => {
    const result = await executor.execute({ path: 'a' }, { api_base_url: 'ftp://files.acme.test' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('http or https');
  });

  it('rejects credentials embedded in the base URL', async () => {
    const result = await executor.execute({ path: 'a' }, { api_base_url: 'https://user:pass@api.acme.test/v1' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('must not embed credentials');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a clear error when no base URL is configured', async () => {
    const result = await executor.execute({ path: 'a' }, {});
    expect(result.success).toBe(false);
    expect(result.error).toBe(
      "No API base URL configured. Provide the 'api_base_url' credential or set API_CLIENT_BASE_URL."
    );
  });

  it('falls back to API_CLIENT_BASE_URL', async () => {
    process.env.API_CLIENT_BASE_URL = 'https://env.acme.test/api';
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const result = await executor.execute({ path: 'ping' }, {});
    expect(result.success).toBe(true);
    expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toBe('/api/ping');
    delete process.env.API_CLIENT_BASE_URL;
  });

  it('requires a path', async () => {
    const result = await executor.execute({ path: '  ' }, creds());
    expect(result.success).toBe(false);
    expect(result.error).toBe('path is required');
  });

  it('rejects an unsupported method and missing auth credentials', async () => {
    const badMethod = await executor.execute({ path: 'a', method: 'TRACE' as never }, creds());
    expect(badMethod.success).toBe(false);
    expect(badMethod.error).toContain('Unsupported HTTP method');

    const missingToken = await executor.execute({ path: 'a', auth: 'bearer' }, creds());
    expect(missingToken.success).toBe(false);
    expect(missingToken.error).toContain('api_token');

    const missingKey = await executor.execute({ path: 'a', auth: 'apiKeyHeader' }, creds());
    expect(missingKey.success).toBe(false);
    expect(missingKey.error).toContain('api_key');
  });

  it('returns non-2xx as a failure with the body, or as success when opted in', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'nope' }), {
      status: 404,
      statusText: 'Not Found',
      headers: { 'content-type': 'application/json' },
    }));
    const failed = await executor.execute({ path: 'missing' }, creds());
    expect(failed.success).toBe(false);
    expect(failed.status).toBe(404);
    expect(failed.data).toEqual({ message: 'nope' });
    expect(failed.error).toContain('HTTP 404');
    expect(failed.error).toContain('nope');

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'nope' }), {
      status: 404,
      statusText: 'Not Found',
      headers: { 'content-type': 'application/json' },
    }));
    const accepted = await executor.execute({ path: 'missing', acceptErrorResponses: true }, creds());
    expect(accepted.success).toBe(true);
    expect(accepted.status).toBe(404);
    expect(accepted.data).toEqual({ message: 'nope' });
  });

  it('returns a clear error on a network failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('socket hang up'));
    const result = await executor.execute({ path: 'a' }, creds());
    expect(result.success).toBe(false);
    expect(result.error).toContain('socket hang up');
  });

  it('uses the caller supplied timeout signal', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await executor.execute({ path: 'a', timeoutMs: 250 }, creds());
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeDefined();
  });
});
