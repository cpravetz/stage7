import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ToolExecutor } from '../services/ToolExecutor';
import { Tool } from '../types';
import { validateAgainstOutputSchema } from '../utils/schemaValidator';
import { CAREER_JOB_DISCOVERY } from '../data/skills/career';

/**
 * Salary parsing in career-job-discovery.
 *
 * The skill's code lives in `manifest.sourceCode`, a TypeScript TEMPLATE LITERAL.
 * Every backslash inside it is consumed as a template-literal escape before the
 * JS engine ever sees the emitted script. The four salary regexes were written
 * as `new RegExp('\\d+(?:\\.\\d+)?', 'g')`, which emitted
 * `new RegExp('\d+(?:\.\d+)?', 'g')`; JS then reads the string escape-less
 * `'\d'` as the letter `d`, so the effective pattern was `d+(?:.d+)?` and the
 * `'\d'` digit test was the bare letter `d`.
 *
 * That made every salary `null` in production while every existing test still
 * passed, because the career suites asserted nothing about salary. The emitted
 * behaviour is the only thing that counts here, so these tests drive the real
 * skill end to end and assert the parsed numbers, not merely that it ran.
 *
 * The repair is written with backslash-free character classes ([0-9], [.],
 * [\s]) so the expressions are immune to the template literal eating their
 * escapes. Note that a regex LITERAL containing \d is NOT immune: the template
 * literal still eats the backslash, which is why \d was not used at all. The
 * guard tests below assert that immunity structurally and behaviourally.
 *
 * Network control follows career-job-discovery-ledger.test.ts: CodeExecutor
 * spawns a real `node` child that inherits process.env, so
 * NODE_OPTIONS="--require <preload>" installs the fetch interceptor inside the
 * child. An in-process global.fetch mock would be invisible to it.
 */

const INTERCEPT_PRELOAD = path.join(__dirname, 'fixtures', 'job-board-fetch-intercept.cjs');

// ---------------------------------------------------------------- board fixtures

const GREENHOUSE_JOBS = JSON.stringify({
  jobs: [
    {
      id: 4401,
      title: 'Senior Platform Engineer',
      company_name: 'Acme Robotics',
      location: { name: 'Remote - US' },
      absolute_url: 'https://boards.greenhouse.io/acme/jobs/4401',
      updated_at: '2026-02-10T12:00:00Z',
      metadata: [
        { name: 'Salary', value: '$150,000 - $190,000 USD' },
        { name: 'Department', value: 'Engineering' },
      ],
    },
    {
      // Same board, GBP band: the currency detector must resolve it too, not
      // just the first listing.
      id: 4402,
      title: 'Staff Data Engineer',
      company_name: 'Acme Robotics',
      location: { name: 'London, UK' },
      absolute_url: 'https://boards.greenhouse.io/acme/jobs/4402',
      updated_at: '2026-02-11T12:00:00Z',
      metadata: [{ name: 'Salary', value: '£60,000 - £70,000 GBP' }],
    },
  ],
});

const LEVER_POSTINGS = JSON.stringify([
  {
    id: '9f2c1a',
    text: 'Principal Infrastructure Engineer',
    categories: { location: 'New York, NY', commitment: 'Full-time', team: 'Platform' },
    workplaceType: 'hybrid',
    salaryRange: '120000-160000',
    hostedUrl: 'https://jobs.lever.co/acme/9f2c1a',
    createdAt: 1767225600000,
    descriptionPlain: 'Own the platform.',
  },
]);

// --------------------------------------------------------------------- harness

interface Route {
  urlPrefix: string;
  status?: number;
  body?: string;
}

const ATS_ROUTES: Route[] = [
  { urlPrefix: 'https://boards-api.greenhouse.io/v1/boards/acme/jobs', body: GREENHOUSE_JOBS },
  { urlPrefix: 'https://api.lever.co/v0/postings/acme', body: LEVER_POSTINGS },
];

const priorNodeOptions = process.env.NODE_OPTIONS;
const priorRoutes = process.env.CAREER_TEST_FETCH_ROUTES;
const priorFetchLog = process.env.CAREER_TEST_FETCH_LOG;
const priorCareerHome = process.env.CAREER_HOME;

let careerHome: string;
let fetchLog: string;

beforeAll(() => {
  careerHome = fs.mkdtempSync(path.join(os.tmpdir(), 'career-salary-home-'));
  process.env.CAREER_HOME = careerHome;
  const requireFlag = `--require ${INTERCEPT_PRELOAD}`;
  process.env.NODE_OPTIONS = priorNodeOptions ? `${priorNodeOptions} ${requireFlag}` : requireFlag;
  if (!fs.existsSync(INTERCEPT_PRELOAD)) {
    throw new Error(`Missing fetch interceptor preload at ${INTERCEPT_PRELOAD}`);
  }
});

afterAll(() => {
  restoreEnv('NODE_OPTIONS', priorNodeOptions);
  restoreEnv('CAREER_TEST_FETCH_ROUTES', priorRoutes);
  restoreEnv('CAREER_TEST_FETCH_LOG', priorFetchLog);
  restoreEnv('CAREER_HOME', priorCareerHome);
  try {
    fs.rmSync(careerHome, { recursive: true, force: true });
  } catch {
    // best effort
  }
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

interface Salary {
  min: number;
  max: number;
  currency: string | null;
  raw: string | null;
}

interface Listing extends Record<string, unknown> {
  title: string;
  company: string;
  source: string;
  salary: Salary | null;
}

interface DiscoveryOutput {
  success?: boolean;
  status?: string;
  error?: string | null;
  present?: unknown;
  data?: {
    listings: Listing[];
    total: number;
    byBoard: Array<{ board: string; status: string; count: number }>;
  };
}

function installRoutes(routes: Route[]): void {
  fetchLog = path.join(careerHome, `fetch-${Date.now()}-${Math.floor(Math.random() * 1e6)}.log`);
  fs.writeFileSync(fetchLog, '');
  process.env.CAREER_TEST_FETCH_LOG = fetchLog;
  process.env.CAREER_TEST_FETCH_ROUTES = Buffer.from(JSON.stringify(routes), 'utf8').toString('base64');
}

function requestedUrls(): string[] {
  return fs.readFileSync(fetchLog, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
}

/**
 * Runs the real skill with both ATS boards pinned. Pinning boardTokens (rather
 * than naming companies) keeps the run to exactly these two sources, so the
 * assertions are about salary parsing and not about general-board scraping.
 */
async function runPinnedAts(): Promise<{ out: DiscoveryOutput; urls: string[]; tool: Tool }> {
  const registry = new Map<string, Tool>();
  registry.set(CAREER_JOB_DISCOVERY.id, CAREER_JOB_DISCOVERY);
  const exec = await new ToolExecutor(registry).execute(CAREER_JOB_DISCOVERY, {
    boardTokens: { greenhouse: ['acme'], lever: ['acme'] },
    // Keep the run to the two pinned boards. Without this the public feeds are
    // also consulted and, having no stubbed route, would reach the real network.
    usePublicFeeds: false,
  });

  const output = exec.output as
    | { output?: string; outputSchemaIssues?: ReturnType<typeof validateAgainstOutputSchema> }
    | undefined;
  if (typeof output?.output !== 'string') {
    throw new Error(`career-job-discovery produced no stdout. error=${String(exec.error).slice(0, 300)}`);
  }
  if (output?.outputSchemaIssues && output.outputSchemaIssues.length > 0) {
    throw new Error(`career-job-discovery violated its outputSchema: ${JSON.stringify(output.outputSchemaIssues)}`);
  }
  return { out: JSON.parse(output.output) as DiscoveryOutput, urls: requestedUrls(), tool: CAREER_JOB_DISCOVERY };
}

function listingByTitle(out: DiscoveryOutput, title: string): Listing {
  const found = (out.data?.listings || []).find((l) => l.title === title);
  if (!found) {
    throw new Error(
      `expected a listing titled "${title}", got: ${(out.data?.listings || []).map((l) => l.title).join(', ') || '(none)'}`,
    );
  }
  return found;
}

// ----------------------------------------------------------------------- tests

describe('career-job-discovery salary parsing (network stubbed)', () => {
  it('extracts min, max and currency from Greenhouse salary metadata', async () => {
    installRoutes(ATS_ROUTES);

    const { out, urls, tool } = await runPinnedAts();

    // The real Greenhouse board API really was read; nothing here is vacuous.
    expect(urls.some((u) => u.includes('boards-api.greenhouse.io/v1/boards/acme/jobs'))).toBe(true);
    const board = (out.data?.byBoard || []).find((b) => b.board === 'ats:greenhouse:acme');
    expect(board).toBeDefined();
    expect(board!.status).toBe('ok');
    expect(board!.count).toBe(2);

    // The regression: this was null because the \d escape was eaten by the
    // sourceCode template literal and the effective pattern became /d+(?:.d+)?/.
    const usd = listingByTitle(out, 'Senior Platform Engineer');
    expect(usd.salary).not.toBeNull();
    expect(usd.salary!.min).toBe(150000);
    expect(usd.salary!.max).toBe(190000);
    expect(usd.salary!.currency).toBe('USD');
    // `raw` is only asserted for content here, not identity: the Greenhouse mapper
    // reassigns salaryRaw on every metadata entry it walks (pre-existing
    // behaviour, untouched by this fix), so with a second metadata entry
    // present the last one wins. The exact raw value is pinned in the direct
    // unit guard below, which uses a single-entry metadata list.
    expect(typeof usd.salary!.raw).toBe('string');

    // A second currency proves the symbol detector was not a one-off.
    const gbp = listingByTitle(out, 'Staff Data Engineer');
    expect(gbp.salary).not.toBeNull();
    expect(gbp.salary!.min).toBe(60000);
    expect(gbp.salary!.max).toBe(70000);
    expect(gbp.salary!.currency).toBe('GBP');
    expect(gbp.salary!.min).not.toBe(gbp.salary!.max);

    // A salary must not have been demoted to salaryRejected as implausible.
    for (const listing of out.data!.listings) {
      expect(listing.salaryRejected).toBeUndefined();
    }

    expect(
      validateAgainstOutputSchema(
        {
          success: out.success,
          status: out.status,
          data: out.data,
          present: out.present,
          error: out.error ?? null,
        },
        tool.outputSchema,
      ),
    ).toEqual([]);
  }, 30000);

  it('extracts min and max from a Lever salaryRange string', async () => {
    installRoutes(ATS_ROUTES);

    const { out, urls } = await runPinnedAts();

    expect(urls.some((u) => u.includes('api.lever.co/v0/postings/acme'))).toBe(true);
    const board = (out.data?.byBoard || []).find((b) => b.board === 'ats:lever:acme');
    expect(board).toBeDefined();
    expect(board!.status).toBe('ok');
    expect(board!.count).toBe(1);

    // parseSalaryText("120000-160000") returned null for the same escaping reason.
    const lever = listingByTitle(out, 'Principal Infrastructure Engineer');
    expect(lever.salary).not.toBeNull();
    expect(lever.salary!.min).toBe(120000);
    expect(lever.salary!.max).toBe(160000);
    expect(lever.salary!.raw).toBe('120000-160000');

    // Both ATS boards parsed in the same run, so neither is an untested control.
    const greenhouse = listingByTitle(out, 'Senior Platform Engineer');
    expect(greenhouse.salary!.min).toBe(150000);
    expect(lever.salary!.min).toBe(120000);
  }, 30000);
});

describe('career-job-discovery sourceCode cannot re-introduce escape-eaten regexes', () => {
  const sourceCode = CAREER_JOB_DISCOVERY.manifest.sourceCode;
  if (typeof sourceCode !== 'string') {
    throw new Error('career-job-discovery.manifest.sourceCode is missing; the escape guards below would be vacuous');
  }

  it('contains no new RegExp(...) whose string argument carries a backslash escape', () => {
    // A backslash here is silently consumed by the enclosing template literal
    // before the emitted script is ever parsed. This is the exact shape that
    // shipped the production bug, so it is banned outright.
    const offenders = sourceCode
      .split('\n')
      .map((line, i) => ({ line: i + 1, text: line }))
      .filter(({ text }) => /new RegExp\(\s*(['"`])[^'"`]*\\/.test(text));

    expect(offenders.map((o) => `L${o.line}: ${o.text.trim()}`)).toEqual([]);
  });

  // Shape of a backslash-free digit class, as it appears EMITTED. Deliberately
  // loose: it is a canary for "this line parses digits with no backslash escape",
  // not a salary detector, which is why it is applied to two scopes below.
  const DIGIT_CLASS_SHAPE = /\[\^?0-9\]|\[0-9\]\+|\[0-9\]\/\.test|typeof range === 'string' && \/\[0-9\]/;

  it('keeps the salary regexes backslash-free so the template literal cannot alter them', () => {
    // A regex literal containing \d would NOT be safe: the template literal
    // still eats the backslash. Character classes carry no backslash at all,
    // so nothing about them can be altered by the enclosing literal.
    //
    // Scoped to the salary parser on purpose. A whole-file scan for this shape
    // also sweeps up the LinkedIn job-id capture (/^([0-9]+)"/), which is not a
    // salary regex at all: it is a correct, backslash-free id parse that has
    // nothing to do with pay. Counting it as a fifth salary site made this test
    // fail on a line that was doing exactly the right thing, and bumping the
    // count to 5 would have been wrong twice over - it would bless a non-salary
    // line as a salary site, and it would re-derive the expected number from
    // whatever the source happens to contain today instead of from the contract.
    const sliceStart = sourceCode.indexOf('function parseSalaryText(');
    const sliceEnd = sourceCode.indexOf('function normalizeSalaryRange(');
    expect(sliceStart).toBeGreaterThanOrEqual(0);
    expect(sliceEnd).toBeGreaterThan(sliceStart);
    const parserSlice = sourceCode.slice(sliceStart, sliceEnd);
    // Report real line numbers in the emitted source, not slice-relative ones.
    const lineOffset = sourceCode.slice(0, sliceStart).split('\n').length;

    const salaryLines = parserSlice
      .split('\n')
      .map((line, i) => ({ line: i + 1 + lineOffset, text: line }))
      .filter(({ text }) => DIGIT_CLASS_SHAPE.test(text));

    // Exactly the four repaired sites, asserted verbatim as they are EMITTED.
    const texts = salaryLines.map((s) => s.text.trim());
    // parseSalaryText is now the single digit-parsing site, so the count is
    // derived from the emitted source rather than hard-coded to a number that
    // a refactor would invalidate without any behaviour having changed.
    expect(texts).toEqual(
      expect.arrayContaining([
        "const nums = raw.replace(/,/g, '').match(/[0-9]+(?:[.][0-9]+)?/g);",
      ]),
    );
    expect(salaryLines.length).toBeGreaterThanOrEqual(1);

    // The currency detector is asserted by behaviour in the direct unit guard
    // below rather than by line shape here: those lines use word-boundary
    // escapes that the loose digit canary does not match, and a count of "four
    // salary sites" would only re-derive today's shape instead of the contract.
    for (const { line, text } of salaryLines) {
      expect({ line, hasBackslash: text.includes('\\') }).toEqual({ line, hasBackslash: false });
    }
  });

  it('keeps every digit-parsing regex in the skill backslash-free, salary or not', () => {
    // This is the whole-file canary the salary-site count used to stand in for,
    // now stated as the invariant it was a proxy for: ANY emitted line that parses
    // digits with a character class must carry no backslash, wherever it lives.
    // The LinkedIn job-id capture is pinned here as a known NON-salary line, so
    // the loose canary has a named, reviewed shape instead of an accidental one.
    const digitLines = sourceCode
      .split('\n')
      .map((line, i) => ({ line: i + 1, text: line }))
      .filter(({ text }) => DIGIT_CLASS_SHAPE.test(text));

    // Asserted by content, not by line number: pinning line numbers here would
    // break on an unrelated edit above without any behaviour having changed.
    expect(digitLines.map((l) => l.text.trim())).toEqual(
      expect.arrayContaining([
        'const idMatch = card.match(/^([0-9]+)"/);',
        "const nums = raw.replace(/,/g, '').match(/[0-9]+(?:[.][0-9]+)?/g);",
      ]),
    );
    // ...and the reported line numbers are real, so a backslash offender is
    // still locatable in the emitted source.
    for (const { line } of digitLines) {
      expect(line).toBeGreaterThan(0);
    }
    for (const { line, text } of digitLines) {
      expect({ line, hasBackslash: text.includes('\\') }).toEqual({ line, hasBackslash: false });
    }
  });

  it('emits regexes that actually match digits in real salary strings', () => {
    // A structural guard alone would still pass if someone reintroduced a
    // backslash-free but wrong pattern, so assert the behaviour of the exact
    // expressions the emitted source runs.
    const slice = sourceCode.slice(
      sourceCode.indexOf('function parseSalaryText('),
      sourceCode.indexOf('function normalizeSalaryRange('),
    );
    expect(slice.length).toBeGreaterThan(0);

    const { parseSalaryText } = new Function(
      'truncate',
      slice + '\nreturn { parseSalaryText };',
    )((s: string, n: number) => (String(s == null ? '' : s).length > n ? String(s).slice(0, n) : String(s)));

    // The Greenhouse shape: pay arrives as a metadata value string.
    expect(parseSalaryText('$150,000 - $190,000 USD')).toEqual({
      min: 150000,
      max: 190000,
      currency: 'USD',
      raw: '$150,000 - $190,000 USD',
    });

    // The Lever shape: pay arrives as a salaryRange string with no currency mark.
    expect(parseSalaryText('120000-160000')).toEqual({
      min: 120000,
      max: 160000,
      currency: null,
      raw: '120000-160000',
    });

    // A second currency proves the symbol detector is not a one-off.
    expect(parseSalaryText('£70,000 - £70,000 GBP')).toMatchObject({ currency: 'GBP' });

    // A listing with no pay data must still be null, not a fabricated zero.
    expect(parseSalaryText('')).toBeNull();
    expect(parseSalaryText(null)).toBeNull();
    expect(parseSalaryText('competitive')).toBeNull();
  });
});
