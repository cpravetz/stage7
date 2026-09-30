import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ToolExecutor } from '../services/ToolExecutor';
import { Tool } from '../types';
import { validateAgainstOutputSchema } from '../utils/schemaValidator';
import { CAREER_JOB_DISCOVERY } from '../data/skills/career';

/**
 * Covers career-job-discovery's per-board status ledger and its run-level outcome.
 *
 * The skill reports ok / no-match / error per board and one run-level
 * status. The contract it is held to is "there is no offline": an inability to
 * retrieve or parse a source is a failure inside this system, not the network's
 * fault, so it is surfaced through success / status / error rather than riding
 * along as an advisory on an otherwise passing run.
 *
 *   board ok       - pages fetched AND listings extracted
 *   board no-match - pages fetched, structure recognised, genuinely nothing matched
 *   board error    - could NOT be retrieved, or was retrieved but not parseable
 *
 *   run ok       - every source answered
 *   run partial  - some answered, some unretrievable  (success: true, error non-null)
 *   run failed   - no source readable                  (success: false, error non-null)
 *   run blocked  - nothing to search                   (success: false, error non-null)
 *
 * The ok and no-match branches are only reachable when a feed actually returns
 * parseable records (or a well-formed document with an empty container). Against
 * the real internet every fetch either fails or returns something the readers do
 * not recognise, so without help those branches would never execute.
 *
 * How the network is controlled without touching production code:
 *
 *  - career-job-discovery hardcodes its feed URLs (https://remoteok.com/api,
 *    https://remotive.com/api/remote-jobs, https://www.arbeitnow.com/api/job-board-api,
 *    https://jobicy.com/api/v2/remote-jobs, https://weworkremotely.com/remote-jobs.rss,
 *    https://himalayas.app/jobs/rss). There is NO input or env override for the
 *    base URL, so the skill cannot be pointed at a local http server. That is a
 *    reported testability gap, not something this file works around by editing
 *    the skill.
 *  - CodeExecutor spawns `node [scriptPath]` with `{ ...process.env }`, so
 *    NODE_OPTIONS="--require <preload>" is inherited by the child and installs a
 *    fetch interceptor *inside the child process*. This is the only seam that
 *    reaches the skill's real network layer; an in-process global.fetch mock in
 *    the Jest process is invisible to it.
 *
 * Every route below must therefore match the skill's real URL prefix. A prefix
 * typo silently falls through to the real network inside the interceptor, so
 * each scenario also asserts that every source was really requested.
 *
 * The skill's own source is executed unmodified, so what is asserted here is the
 * real scraper regexes, the real summarizeBoard, and the real ledger.
 */

const INTERCEPT_PRELOAD = path.join(__dirname, 'fixtures', 'job-board-fetch-intercept.cjs');

// ---------------------------------------------------------------- board fixtures
//
// Fixtures for the default source tier: company-agnostic public feeds. Two
// shapes are covered deliberately.
//
//   JSON feeds   the documented array container is present and either holds rows
//                or is empty. An absent or wrong-typed container must throw, so a
//                silent API change reads as broken rather than as "no jobs".
//   RSS feeds    there is no array to type-check, so the split keys off a
//                listing signal that only a populated feed carries.

// --- JSON feeds -------------------------------------------------------------

const REMOTEOK_WITH_CARDS = JSON.stringify([
  { legal: 'RemoteOK API terms' },
  { id: 90001, position: 'Senior Platform Engineer', company_name: 'Alpha Analytics', location: 'Worldwide', tags: 'aws, go', date: '2026-09-20T10:00:00Z', url: 'https://remoteok.com/remote-jobs-alpha-1', apply_url: 'https://alpha.example.com/apply/1', description: 'Build platforms', min_salary: 150000, max_salary: 190000 },
  { id: 90002, position: 'Staff Site Reliability Engineer', company_name: 'Beta Robotics', location: 'Remote - EU', tags: 'kubernetes', date: '2026-09-21T10:00:00Z', url: 'https://remoteok.com/remote-jobs-beta-2', apply_url: 'https://beta.example.com/apply/2', description: 'Keep systems up' },
]);

// Present-and-empty container: a real answer, not a failure.
const REMOTEOK_EMPTY = JSON.stringify([{ legal: 'RemoteOK API terms' }]);

// The documented container is absent: a markup change, which must throw.
const REMOTEOK_BROKEN = JSON.stringify({ unexpected: true, notice: 'moved' });

const REMOTIVE_WITH_CARDS = JSON.stringify({
  jobs: [
    { id: 80001, title: 'Backend Engineer II', company_name: 'Delta Logistics', candidate_required_location: 'Worldwide', publication_date: '2026-09-22', url: 'https://remotive.com/remote-jobs-delta-1', description: 'APIs at scale', category: 'software-dev' },
    { id: 80002, title: 'Principal Data Engineer', company_name: 'Epsilon Media', candidate_required_location: 'Europe', publication_date: '2026-09-23', url: 'https://remotive.com/remote-jobs-epsilon-2', description: 'Data platform' },
  ],
});
const REMOTIVE_EMPTY = JSON.stringify({ jobs: [] });
// Wrong-typed container: must throw rather than report zero.
const REMOTIVE_BROKEN = JSON.stringify({ jobs: null });

const ARBEITNOW_WITH_CARDS = JSON.stringify({
  data: [
    { slug: 'cloud-engineer-zeta-1', title: 'Cloud Engineer', company_name: 'Zeta Networks', location: 'Berlin', remote: false, created_at: '2026-09-19T08:00:00Z', url: 'https://www.arbeitnow.com/view/cloud-engineer-zeta-1', description: 'Kubernetes and AWS', tags: ['devops'] },
    { slug: 'senior-engineer-payments-eta-1', title: 'Senior Engineer, Payments', company_name: 'Eta Bank', location: 'New York, NY', remote: false, created_at: '2026-09-27T08:00:00Z', url: 'https://www.arbeitnow.com/view/senior-engineer-payments-eta-1', description: 'Payments platform', tags: ['backend'] },
  ],
});
const ARBEITNOW_EMPTY = JSON.stringify({ data: [] });
const ARBEITNOW_BROKEN = JSON.stringify({ results: [] });

const JOBICY_WITH_CARDS = JSON.stringify({
  jobs: [
    { id: 70001, jobTitle: 'Engineering Manager', companyName: 'Theta Insurance', jobGeo: ['Remote'], pubDate: '2026-09-25', url: 'https://jobicy.com/jobs/engineering-manager-theta-1', jobDescription: '<p>Lead a team</p>', annualSalaryMin: 120000, annualSalaryMax: 150000, jobType: 'full_time' },
    { id: 70002, jobTitle: 'Founding Engineer', companyName: 'Iota Labs', jobGeo: ['Remote', 'Worldwide'], pubDate: '2026-09-26', url: 'https://jobicy.com/jobs/founding-engineer-iota-2', jobDescription: 'Zero to one', jobType: 'full_time' },
  ],
});
const JOBICY_EMPTY = JSON.stringify({ jobs: [] });
const JOBICY_BROKEN = JSON.stringify({ jobs: 'not-an-array' });

// --- RSS feeds --------------------------------------------------------------

const WWR_WITH_CARDS = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>We Work Remotely</title>
<item>
  <title>Senior Backend Engineer, Platform</title>
  <link>https://weworkremotely.com/remote-jobs-senior-backend-engineer-platform</link>
  <description>Work on our platform.</description>
  <pubDate>Mon, 21 Sep 2026 10:00:00 +0000</pubDate>
</item>
<item>
  <title>Founding Full-stack Engineer</title>
  <link>https://weworkremotely.com/remote-jobs-founding-full-stack-engineer</link>
  <description>Be the first engineer.</description>
  <pubDate>Tue, 22 Sep 2026 10:00:00 +0000</pubDate>
</item>
</channel></rss>`;

// A well-formed feed carrying zero items: the genuinely-empty case.
const WWR_EMPTY = '<?xml version="1.0"?><rss version="2.0"><channel><title>We Work Remotely</title></channel></rss>';

// A document that is not a feed at all: markup changed, so it must throw
// rather than report zero listings.
const WWR_BROKEN = '<html><body><main id="app"><div>Re-hydrating</div></main></body></html>';

const HIMALAYAS_EMPTY = '<?xml version="1.0"?><rss version="2.0"><channel><title>Himalayas</title></channel></rss>';

interface Route {
  urlPrefix: string;
  status?: number;
  body?: string;
  bodies?: Record<string, string>;
  queryParam?: string;
}

const QUERY = 'Engineer';

// The default source tier is the company-agnostic public feeds. Three of them
// are JSON APIs and two are RSS, so both shapes are covered: the empty-vs-broken
// contract has to hold for a documented array container AND for a feed document
// with no array to type-check at all.
const BOARD_ROUTES: Route[] = [
  { urlPrefix: 'https://remoteok.com/api', body: REMOTEOK_WITH_CARDS },
  { urlPrefix: 'https://remotive.com/api/remote-jobs', body: REMOTIVE_WITH_CARDS },
  { urlPrefix: 'https://www.arbeitnow.com/api/job-board-api', body: ARBEITNOW_WITH_CARDS },
  { urlPrefix: 'https://jobicy.com/api/v2/remote-jobs', body: JOBICY_WITH_CARDS },
  { urlPrefix: 'https://weworkremotely.com/remote-jobs.rss', body: WWR_WITH_CARDS },
  { urlPrefix: 'https://himalayas.app/jobs/rss', body: HIMALAYAS_EMPTY },
];

/** Every feed, and the host fragment the fetch log will show for it. */
const BOARD_HOSTS: Record<string, string> = {
  remoteok: 'remoteok.com',
  remotive: 'remotive.com',
  arbeitnow: 'arbeitnow.com',
  jobicy: 'jobicy.com',
  weworkremotely: 'weworkremotely.com',
  himalayas: 'himalayas.app',
};

/** Expected per-source extraction counts for BOARD_ROUTES. */
const BOARD_COUNTS: Record<string, number> = {
  remoteok: 2,
  remotive: 2,
  arbeitnow: 2,
  jobicy: 2,
  weworkremotely: 2,
  // Himalayas is stubbed as an empty feed in the "every source answers" case:
  // this test is about the ok path, and a source that answers with nothing is
  // still a source that answered.
  himalayas: 0,
};
const TOTAL_CARDS = 10;

// --------------------------------------------------------------------- harness

const priorNodeOptions = process.env.NODE_OPTIONS;
const priorRoutes = process.env.CAREER_TEST_FETCH_ROUTES;
const priorFetchLog = process.env.CAREER_TEST_FETCH_LOG;
const priorCareerHome = process.env.CAREER_HOME;

let careerHome: string;
let fetchLog: string;

beforeAll(() => {
  careerHome = fs.mkdtempSync(path.join(os.tmpdir(), 'career-ledger-home-'));
  process.env.CAREER_HOME = careerHome;
  const requireFlag = `--require ${INTERCEPT_PRELOAD}`;
  process.env.NODE_OPTIONS = priorNodeOptions
    ? `${priorNodeOptions} ${requireFlag}`
    : requireFlag;
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

interface BoardEntry {
  board: string;
  status: string;
  count: number;
  note: string;
  queries?: number;
}

interface FailureEntry {
  board: string;
  status: string;
  note: string;
}

interface DiscoveryData {
  listings: Array<Record<string, unknown>>;
  total: number;
  byBoard: BoardEntry[];
  failures: FailureEntry[];
  failureCount: number;
  note: string;
}

interface DiscoveryOutput {
  success?: boolean;
  status?: string;
  error?: string | null;
  data?: DiscoveryData;
  present?: Array<{ id: string; title?: string; body: string; links?: Array<{ label: string; url: string; detail?: string }> }>;
}

function installRoutes(routes: Route[]): void {
  fetchLog = path.join(careerHome, `fetch-${Date.now()}-${Math.floor(Math.random() * 1e6)}.log`);
  fs.writeFileSync(fetchLog, '');
  process.env.CAREER_TEST_FETCH_LOG = fetchLog;
  process.env.CAREER_TEST_FETCH_ROUTES = Buffer.from(JSON.stringify(routes), 'utf8').toString('base64');
}

/** Every URL the child actually requested, proving the boards were really probed. */
function requestedUrls(): string[] {
  return fs
    .readFileSync(fetchLog, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

async function runDiscovery(
  input: Record<string, unknown>,
): Promise<{ out: DiscoveryOutput; boardByName: Map<string, BoardEntry>; urls: string[]; tool: Tool }> {
  const registry = new Map<string, Tool>();
  registry.set(CAREER_JOB_DISCOVERY.id, CAREER_JOB_DISCOVERY);
  const exec = await new ToolExecutor(registry).execute(CAREER_JOB_DISCOVERY, input);

  const output = exec.output as { output?: string; outputSchemaIssues?: ReturnType<typeof validateAgainstOutputSchema> } | undefined;
  if (typeof output?.output !== 'string') {
    throw new Error(`career-job-discovery produced no stdout. error=${String(exec.error).slice(0, 300)}`);
  }
  const out = JSON.parse(output.output) as DiscoveryOutput;
  if (output?.outputSchemaIssues && output.outputSchemaIssues.length > 0) {
    throw new Error(`career-job-discovery violated its outputSchema: ${JSON.stringify(output.outputSchemaIssues)}`);
  }
  // The default tier is the company-agnostic feeds, so the ledger keys are read
  // off the feed: prefix. Sources that did not answer keep their raw board id
  // in data.failures, which is what the run-level assertions check.
  const boardByName = new Map<string, BoardEntry>();
  for (const entry of out.data?.byBoard || []) {
    if (entry.board.startsWith('feed:')) boardByName.set(entry.board.slice('feed:'.length), entry);
  }
  return { out, boardByName, urls: requestedUrls(), tool: CAREER_JOB_DISCOVERY };
}

function presentBody(out: DiscoveryOutput, id: string): string {
  const block = (out.present || []).find((b) => b.id === id);
  if (!block) {
    throw new Error(`expected a present block with id "${id}", got: ${(out.present || []).map((b) => b.id).join(', ') || '(none)'}`);
  }
  return block.body;
}

function presentTitle(out: DiscoveryOutput, id: string): string {
  const block = (out.present || []).find((b) => b.id === id);
  if (!block) {
    throw new Error(`expected a present block with id "${id}", got: ${(out.present || []).map((b) => b.id).join(', ') || '(none)'}`);
  }
  return block.title ?? '';
}

function blockIds(out: DiscoveryOutput): string[] {
  return (out.present || []).map((b) => b.id);
}

/** The skill's own output must satisfy its declared outputSchema on every path. */
function expectSchemaValid(out: DiscoveryOutput, tool: Tool): void {
  expect(
    validateAgainstOutputSchema(
      { success: out.success, status: out.status, data: out.data, present: out.present, error: out.error ?? null },
      tool.outputSchema,
    ),
  ).toEqual([]);
}

// ----------------------------------------------------------------------- tests

describe('career-job-discovery per-board status ledger (network stubbed)', () => {
  it('records ok with the real extracted count when every board returns job cards', async () => {
    installRoutes(BOARD_ROUTES);

    const { out, boardByName, urls, tool } = await runDiscovery({ queries: [QUERY] });

    // The child really hit every feed; nothing here is vacuous.
    for (const host of Object.values(BOARD_HOSTS)) {
      expect(urls.filter((u) => u.includes(host)).length).toBeGreaterThanOrEqual(1);
    }

    expect(out.success).toBe(true);
    expect(boardByName.size).toBe(Object.keys(BOARD_HOSTS).length);
    for (const [board, expected] of Object.entries(BOARD_COUNTS)) {
      const entry = boardByName.get(board);
      expect(entry).toBeDefined();
      if (expected > 0) {
        expect(entry!.status).toBe('ok');
        expect(entry!.count).toBe(expected);
        expect(entry!.note).toContain(expected + ' listing');
      } else {
        // A source that answered with nothing is no-match, not a failure.
        expect(entry!.status).toBe('no-match');
        expect(entry!.count).toBe(0);
      }
    }

    // Every source answered, so the run itself is a clean ok with nothing to report.
    expect(out.status).toBe('ok');
    expect(out.error ?? null).toBeNull();
    expect(out.data!.failureCount).toBe(0);
    expect(out.data!.failures).toEqual([]);
    expect(blockIds(out)).not.toContain('errors');
    expect(blockIds(out)).not.toContain('failure');

    // Listings survive dedupe and the query filter, so the ok path produces output.
    expect(out.data!.total).toBe(TOTAL_CARDS);
    expect(out.data!.listings).toHaveLength(TOTAL_CARDS);
    const titles = out.data!.listings.map((l) => String(l.title));
    expect(titles).toContain('Senior Platform Engineer');
    expect(titles).toContain('Backend Engineer II');
    expect(titles).toContain('Cloud Engineer');
    expect(titles).toContain('Senior Engineer, Payments');
    expect(titles).toContain('Founding Engineer');
    for (const listing of out.data!.listings) {
      expect(String(listing.title) + ' ' + String(listing.company)).toMatch(/engineer/i);
    }

    // The Arbeitnow leg is only evidence if the normalizer really read the
    // fields the payload carries, so this pins the production path rather than
    // just a count.
    const payments = out.data!.listings.find((l) => l.title === 'Senior Engineer, Payments')!;
    expect(payments).toBeDefined();
    expect(payments.source).toBe('arbeitnow');
    expect(payments.company).toBe('Eta Bank');
    expect(payments.location).toBe('New York, NY');
    expect(payments.postedAt).toBe('2026-09-27T08:00:00.000Z');
    expect(payments.applyUrl).toBe('https://www.arbeitnow.com/view/senior-engineer-payments-eta-1');

    // The RSS leg proves the feed parser ran on a document with no array to
    // type-check: the employer is split out of the "Company: Role" title, so
    // ranking sees a job title and a populated company axis.
    const backend = out.data!.listings.find((l) => l.title === 'Senior Backend Engineer, Platform')!;
    expect(backend).toBeDefined();
    expect(backend.source).toBe('weworkremotely');
    expect(backend.applyUrl).toBe('https://weworkremotely.com/remote-jobs-senior-backend-engineer-platform');

    // Every listing must carry an https applyUrl, or it is not actionable and
    // would not have been kept.
    for (const listing of out.data!.listings) {
      expect(String(listing.applyUrl)).toMatch(/^https:\/\//);
    }

    // ok sources are listed as verified sources, and none is reported unverified.
    const sources = presentBody(out, 'sources');
    for (const [board, expected] of Object.entries(BOARD_COUNTS)) {
      if (expected > 0) {
        expect(sources).toContain('feed:' + board);
        expect(sources).toContain(expected + ' listing');
      }
    }
    expect(out.data!.note).toContain('Found ' + TOTAL_CARDS + ' listing');
    expect(out.data!.note).not.toContain('WARNING');

    expectSchemaValid(out, tool);
  }, 30000);

  it('presents every posting as a link, not just the count of postings', async () => {
    installRoutes(BOARD_ROUTES);

    const { out, tool } = await runDiscovery({ queries: [QUERY] });

    expect(out.data!.total).toBe(TOTAL_CARDS);

    const block = (out.present || []).find((b) => b.id === 'listings');
    expect(block).toBeDefined();

    const links = block!.links || [];
    // One link per posting found. A result that reports "81 listings" and then shows
    // none of them has reported a number, not a set of jobs.
    expect(links).toHaveLength(out.data!.listings.length);
    for (const link of links) {
      expect(String(link.url)).toMatch(/^https:\/\//);
      expect(String(link.label)).toMatch(/.+ — .+|.+/);
    }

    // The label names the posting and its employer, so the set is browsable, and the
    // URL is the posting itself rather than the search that found it.
    const labels = links.map((l) => String(l.label));
    expect(labels).toContain('Senior Platform Engineer — Alpha Analytics');
    expect(labels).toContain('Senior Engineer, Payments — Eta Bank');
    const paymentsLink = links.find((l) => String(l.label) === 'Senior Engineer, Payments — Eta Bank');
    expect(String(paymentsLink!.url)).toBe('https://www.arbeitnow.com/view/senior-engineer-payments-eta-1');

    // The count and the postings agree: the block is not a truncated sample dressed up
    // as the whole result.
    expect(block!.body).not.toContain('Showing the first');

    expectSchemaValid(out, tool);
  }, 30000);

  it('records no-match when boards answer with a normal-looking but empty results page', async () => {
    // Every feed answers with the documented container present and empty. For the
    // JSON feeds that is {jobs: []} / {data: []}; for the RSS feed it is a
    // well-formed document carrying zero items. None of these is a failure.
    installRoutes([
      { urlPrefix: 'https://remoteok.com/api', body: REMOTEOK_EMPTY },
      { urlPrefix: 'https://remotive.com/api/remote-jobs', body: REMOTIVE_EMPTY },
      { urlPrefix: 'https://www.arbeitnow.com/api/job-board-api', body: ARBEITNOW_EMPTY },
      { urlPrefix: 'https://jobicy.com/api/v2/remote-jobs', body: JOBICY_EMPTY },
      { urlPrefix: 'https://weworkremotely.com/remote-jobs.rss', body: WWR_EMPTY },
      { urlPrefix: 'https://himalayas.app/jobs/rss', body: HIMALAYAS_EMPTY },
    ]);

    const { out, boardByName, urls } = await runDiscovery({ queries: [QUERY] });

    expect(urls.length).toBeGreaterThanOrEqual(5);
    expect(boardByName.size).toBe(Object.keys(BOARD_HOSTS).length);
    for (const board of Object.keys(BOARD_HOSTS)) {
      const entry = boardByName.get(board);
      expect(entry).toBeDefined();
      expect(entry!.status).toBe('no-match');
      expect(entry!.count).toBe(0);
      expect(entry!.note).toMatch(/no matching|no listings|currently publishes no listings/i);
    }

    expect(out.data!.total).toBe(0);
    expect(out.data!.listings).toHaveLength(0);

    // Every source was genuinely read and genuinely had nothing: a real, complete
    // zero. Still a success, still no error, still no retrieval-failure reporting.
    expect(out.success).toBe(true);
    expect(out.error ?? null).toBeNull();
    expect(out.data!.failureCount).toBe(0);
    expect(out.data!.failures).toEqual([]);
    expect(out.status).toBe('no-match');

    // no-match sources are surfaced as a "no matches" block, never as unverified.
    const noMatch = presentBody(out, 'no-match');
    for (const board of Object.keys(BOARD_HOSTS)) {
      expect(noMatch).toContain('feed:' + board);
    }
    expect(out.present!.some((b) => b.id === 'unverified')).toBe(false);
    expect(out.present!.some((b) => b.id === 'errors')).toBe(false);
    expect(out.present!.some((b) => b.id === 'failure')).toBe(false);
    expect(out.present!.some((b) => b.id === 'sources')).toBe(false);
    expect(out.data!.note).not.toContain('WARNING');
    expect(out.data!.note).toContain('found no matches');
  }, 30000);

  it('distinguishes no-match from a retrieval failure for the same query across boards in one run', async () => {
    // One run must place every source in the right bucket AND report the
    // unreadable ones as a run-level failure:
    //   remoteok      - real rows                                        -> ok
    //   remotive      - documented container present and empty           -> no-match
    //   arbeitnow     - wrong container key ({results: []})              -> error (parse)
    //   jobicy        - unreachable, definitive HTTP 403                  -> error (block)
    //   weworkremotely- document is not a feed at all                     -> error (parse)
    installRoutes([
      { urlPrefix: 'https://remoteok.com/api', body: REMOTEOK_WITH_CARDS },
      { urlPrefix: 'https://remotive.com/api/remote-jobs', body: REMOTIVE_EMPTY },
      { urlPrefix: 'https://www.arbeitnow.com/api/job-board-api', body: ARBEITNOW_BROKEN },
      { urlPrefix: 'https://jobicy.com/api/v2/remote-jobs', status: 403, body: 'forbidden' },
      { urlPrefix: 'https://weworkremotely.com/remote-jobs.rss', body: WWR_BROKEN },
      { urlPrefix: 'https://himalayas.app/jobs/rss', body: HIMALAYAS_EMPTY },
    ]);

    const { out, boardByName, urls, tool } = await runDiscovery({ queries: [QUERY] });

    // Every source really probed; nothing here is a vacuous pass.
    for (const [board, host] of Object.entries(BOARD_HOSTS)) {
      expect(urls.filter((u) => u.includes(host)).length).toBeGreaterThanOrEqual(1);
      expect(boardByName.get(board)).toBeDefined();
    }
    expect(boardByName.size).toBe(Object.keys(BOARD_HOSTS).length);

    // A source that returned real rows is ok, with the real count.
    expect(boardByName.get('remoteok')!.status).toBe('ok');
    expect(boardByName.get('remoteok')!.count).toBe(2);

    // A source that answered with the documented container present and empty is
    // no-match: a real zero, not a failure. This distinction is the whole point
    // of the ledger.
    expect(boardByName.get('remotive')!.status).toBe('no-match');
    expect(boardByName.get('remotive')!.count).toBe(0);

    // A source whose container key changed could NOT be read, so it is an error,
    // not a no-match and not a soft advisory. Reporting this as zero would be the
    // exact failure the ledger exists to prevent.
    expect(boardByName.get('arbeitnow')!.status).toBe('error');
    expect(boardByName.get('arbeitnow')!.count).toBe(0);
    expect(boardByName.get('arbeitnow')!.note).toMatch(/could not be read/);

    // A board that was never retrieved at all is also an error. A 404 from a
    // general board is not the pinned-ATS "board does not exist" case, so it must
    // not be laundered into no-match.
    //
    // The reason is asserted precisely because a 404 is NOT the same condition as
    // a block. These boards' search URLs are hardcoded in the skill, so a 404 means
    // the URL shape is gone and no question was ever asked of the board - a
    // permanent failure no retry will clear. Labelling it "blocked" would blame a
    // bot wall that did not happen and send an operator off chasing headers.
    // The RSS source that is no longer a feed at all: retrieved, unreadable.
    const rss = boardByName.get('weworkremotely')!;
    expect(rss.status).toBe('error');
    expect(rss.count).toBe(0);
    expect(rss.note).toMatch(/could not be read/);

    // An unreachable source is an error, named for what actually happened.
    const blocked = boardByName.get('jobicy')!;
    expect(blocked.status).toBe('error');
    expect(blocked.count).toBe(0);
    expect(blocked.note).toContain('could not be retrieved');
    expect(blocked.note).not.toContain('request failed or timed out');

    // Only the two rows from the one source that really answered are reported.
    expect(out.data!.total).toBe(2);
    expect(out.data!.listings).toHaveLength(2);
    for (const listing of out.data!.listings) {
      expect(String(listing.source)).toBe('remoteok');
    }

    // Run level: some sources answered and some could not be retrieved, so the run
    // is a PARTIAL answer that still reports its failures through success/status/
    // error instead of passing as a clean success.
    expect(out.success).toBe(true);
    expect(out.status).toBe('partial');
    expect(out.error).not.toBeNull();
    expect(typeof out.error).toBe('string');
    expect(out.error).toContain('3 of 6 sources could not be retrieved');
    expect(out.error).toContain('this run is PARTIAL');
    expect(out.error).toContain('it is not a complete answer about the job market');
    for (const board of ['arbeitnow', 'jobicy', 'weworkremotely']) {
      expect(out.error).toContain('feed:' + board);
    }
    // A source that answered is never named in the failure report.
    expect(out.error).not.toContain('feed:remoteok');
    expect(out.error).not.toContain('feed:remotive');

    // The machine-readable failure list carries exactly the unretrievable sources.
    expect(out.data!.failureCount).toBe(3);
    expect(out.data!.failures.map((f) => f.board).sort()).toEqual([
      'feed:arbeitnow',
      'feed:jobicy',
      'feed:weworkremotely',
    ]);
    // Himalayas answered (with nothing), so it is not among the failures.
    for (const failure of out.data!.failures) {
      expect(failure.status).toBe('error');
      expect(failure.note.length).toBeGreaterThan(0);
    }
    expect(out.data!.failures.map((f) => f.board)).not.toContain('feed:remoteok');
    expect(out.data!.failures.map((f) => f.board)).not.toContain('feed:remotive');

    // The present layer leads with a headed RETRIEVAL FAILURE block naming every
    // failed source, and keeps the no-match source out of it.
    expect(blockIds(out)).toContain('errors');
    const errors = presentBody(out, 'errors');
    expect(presentTitle(out, 'errors')).toContain('RETRIEVAL FAILURE: 3 sources could not be retrieved or read');
    expect(errors).toContain('[FAILED]');
    for (const board of ['arbeitnow', 'jobicy', 'weworkremotely']) {
      expect(errors).toContain('feed:' + board);
    }
    expect(errors).not.toContain('feed:remoteok');
    expect(errors).not.toContain('feed:remotive');

    // The "unverified" advisory state is gone for good: a source either answered or
    // this system could not read it, and says so as a failure.
    expect(out.present!.some((b) => b.id === 'unverified')).toBe(false);

    // The no-match source is still presented as a no-match, separately.
    const noMatch = presentBody(out, 'no-match');
    expect(noMatch).toContain('feed:remotive');
    expect(noMatch).not.toContain('feed:remoteok');
    expect(noMatch).not.toContain('feed:arbeitnow');

    // The summary repeats the run-level outcome rather than trailing off as a
    // successful search.
    expect(out.data!.note).toContain(out.error!);
    expect(out.data!.note).not.toContain('WARNING');

    expectSchemaValid(out, tool);
  }, 30000);

  it('fails the run outright when no source could be retrieved or read', async () => {
    // Nothing answered this time. Each source fails in a different, named way so
    // the test proves the ledger distinguishes them rather than collapsing every
    // failure into one catch-all:
    //   remoteok       - HTTP 404, a dead endpoint                -> error
    //   remotive       - HTTP 403, a refusal                     -> error (block)
    //   arbeitnow      - HTTP 500, the source's own outage        -> error (server)
    //   jobicy         - HTTP 404, a dead endpoint                -> error
    //   weworkremotely - not a feed at all                       -> error (parse)
    //   himalayas       - HTTP 503, upstream unavailable           -> error
    // There is no offline, so a run that read no source at all is a failure of
    // this system and must never be readable as "no jobs exist".
    installRoutes([
      { urlPrefix: 'https://remoteok.com/api', status: 404, body: 'gone' },
      { urlPrefix: 'https://remotive.com/api/remote-jobs', status: 403, body: 'forbidden' },
      { urlPrefix: 'https://www.arbeitnow.com/api/job-board-api', status: 500, body: 'boom' },
      { urlPrefix: 'https://jobicy.com/api/v2/remote-jobs', status: 404, body: 'gone' },
      { urlPrefix: 'https://weworkremotely.com/remote-jobs.rss', body: WWR_BROKEN },
      { urlPrefix: 'https://himalayas.app/jobs/rss', status: 503, body: 'unavailable' },
    ]);

    const { out, boardByName, urls, tool } = await runDiscovery({ queries: [QUERY] });

    // Every source was really probed; nothing here is a vacuous pass.
    for (const host of Object.values(BOARD_HOSTS)) {
      expect(urls.filter((u) => u.includes(host)).length).toBeGreaterThanOrEqual(1);
    }
    expect(boardByName.size).toBe(Object.keys(BOARD_HOSTS).length);

    // Not one source is ok, and not one is no-match. Every unretrievable or
    // unreadable source is recorded as an error.
    for (const board of Object.keys(BOARD_HOSTS)) {
      const entry = boardByName.get(board);
      expect(entry).toBeDefined();
      expect(entry!.status).toBe('error');
      expect(entry!.count).toBe(0);
      expect(entry!.note.length).toBeGreaterThan(0);
    }

    // The unparseable-but-retrieved source is called out with its own reason, so a
    // parse failure is not confused with a transport failure.
    expect(boardByName.get('weworkremotely')!.note).toMatch(/could not be read/);

    // Each unreachable source is named for what actually happened to it. A single
    // catch-all string would hide the only thing that tells an operator what to
    // do: 403 is a refusal, 500 is the source's own outage, and 404 is a dead
    // endpoint that no retry will clear.
    const EXPECTED_REASONS: Array<[string, RegExp]> = [
      ['remoteok', /404/],
      ['remotive', /403/],
      ['arbeitnow', /500/],
      ['jobicy', /404/],
      ['weworkremotely', /could not be read/],
      ['himalayas', /503/],
    ];
    for (const [board, pattern] of EXPECTED_REASONS) {
      const note = boardByName.get(board)!.note;
      expect(note).toMatch(pattern);
      // The catch-all is gone.
      expect(note).not.toContain('request failed or timed out');
    }

    // The run produced no answer at all, and says so.
    expect(out.success).toBe(false);
    expect(out.status).toBe('failed');
    expect(out.data!.total).toBe(0);
    expect(out.data!.listings).toHaveLength(0);

    // The error names every source the run tried and explicitly refuses the
    // "no jobs exist" reading.
    expect(out.error).not.toBeNull();
    expect(typeof out.error).toBe('string');
    expect(out.error).toContain('JOB DISCOVERY FAILED');
    expect(out.error).toContain('All 6 sources this run tried could not be retrieved or read');
    for (const board of Object.keys(BOARD_HOSTS)) {
      expect(out.error).toContain('feed:' + board);
    }
    expect(out.error).toContain('it did not determine that no jobs exist');

    // The machine-readable failure list covers the whole run.
    expect(out.data!.failureCount).toBe(6);
    expect(out.data!.failures.map((f) => f.board).sort()).toEqual(
      Object.keys(BOARD_HOSTS).map((b) => 'feed:' + b).sort(),
    );
    for (const failure of out.data!.failures) {
      expect(failure.status).toBe('error');
    }

    // The failure LEADS the output. A caller that only renders the first block must
    // see the failure, not an empty result set.
    expect(out.present![0].id).toBe('failure');
    const failure = presentBody(out, 'failure');
    expect(failure).toContain('JOB DISCOVERY FAILED');
    expect(failure).toContain('All 6 sources this run tried could not be retrieved or read');
    expect(failure).toContain('it did not determine that no jobs exist');
    for (const board of Object.keys(BOARD_HOSTS)) {
      expect(failure).toContain('feed:' + board);
    }

    // The per-source RETRIEVAL FAILURE block is present too, still headed as one.
    expect(blockIds(out)).toContain('errors');
    const errors = presentBody(out, 'errors');
    expect(presentTitle(out, 'errors')).toContain('RETRIEVAL FAILURE: 6 sources could not be retrieved or read');
    for (const board of Object.keys(BOARD_HOSTS)) {
      expect(errors).toContain('[FAILED] feed:' + board);
    }

    // Nothing answered, so no source and no no-match block may be presented, and no
    // listing block may be presented as if it were an answer.
    expect(blockIds(out)).not.toContain('sources');
    expect(blockIds(out)).not.toContain('no-match');
    expect(blockIds(out)).not.toContain('listings');
    expect(blockIds(out)).not.toContain('unverified');

    // The summary leads with the failure rather than reading as an empty market.
    expect(out.data!.note).toBe(out.error);
    expect(out.data!.note).toContain('JOB DISCOVERY FAILED');
    expect(out.data!.note).not.toContain('found no matches');
    expect(out.data!.note).not.toContain('No listings found');

    expectSchemaValid(out, tool);
  }, 30000);
});
