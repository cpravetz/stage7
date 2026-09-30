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
 * The ok and no-match branches are only reachable when a board actually returns
 * parseable job cards (or a recognisable empty results page). In a sandbox every
 * real board fetch fails or returns markup the regexes do not recognise, so
 * without help those branches would never execute.
 *
 * How the network is controlled without touching production code:
 *
 *  - career-job-discovery hardcodes its board URLs (https://www.indeed.com/jobs,
 *    .../glassdoor.com/Job/jobs.htm, .../monster.com/jobs/search,
 *    .../linkedin.com/jobs/search, https://wellfound.com/jobs). There is NO
 *    input or env override for the base URL, so the skill cannot be pointed at a
 *    local http server. That is a reported testability gap, not something this
 *    file works around by editing the skill.
 *  - CodeExecutor spawns `node [scriptPath]` with `{ ...process.env }`, so
 *    NODE_OPTIONS="--require <preload>" is inherited by the child and installs a
 *    fetch interceptor *inside the child process*. This is the only seam that
 *    reaches the skill's real network layer; an in-process global.fetch mock in
 *    the Jest process is invisible to it.
 *
 * Every route below must therefore match the skill's real URL prefix. A prefix
 * typo silently falls through to the real network inside the interceptor, so
 * each scenario also asserts that all five boards were really requested.
 *
 * The skill's own source is executed unmodified, so what is asserted here is the
 * real scraper regexes, the real summarizeBoard, and the real ledger.
 */

const INTERCEPT_PRELOAD = path.join(__dirname, 'fixtures', 'job-board-fetch-intercept.cjs');

// ---------------------------------------------------------------- board fixtures

const INDEED_WITH_CARDS = `
<div id="searchResultsPages">
  <article data-jk="AAA111" data-company-name="Alpha Analytics" data-location="Austin, TX">
    <h2><a href="/viewjob?jk=AAA111">Senior Platform Engineer</a></h2>
  </article>
  <article data-jk="AAA222" data-company-name="Beta Robotics" data-location="Remote">
    <h2><a href="/viewjob?jk=AAA222">Staff Site Reliability Engineer</a></h2>
  </article>
  <article data-jk="AAA333" data-company-name="Gamma Health" data-location="Boston, MA">
    <h2><a href="/viewjob?jk=AAA333">Machine Learning Engineer</a></h2>
  </article>
</div>`;

// Card-shaped markup is present, but no record carries the data-jk/company/location
// triple the extractor needs: the board answered, the layout looks normal, nothing
// matched. This is the shape that must be reported as no-match, not error.
const INDEED_EMPTY_SHELL = `
<div id="searchResultsPages">
  <p>No jobs found</p>
  <article class="jcs-JobCard sponsored">Sponsored placeholder</article>
  <article class="jcs-JobCard">We could not find any jobs matching your search.</article>
</div>`;

// No card-shaped marker whatsoever: layout changed or the request was bot-walled.
// The page WAS retrieved, so this is "could not parse", which is still an error.
const INDEED_UNRECOGNISED = '<html><body><main id="app"><div class="x1y2z3">Re-hydrating</div></main></body></html>';

const GLASSDOOR_WITH_CARDS = `
<article data-job-id="GD900" data-employer-name="Delta Logistics" data-location="Chicago, IL">
  <a class="jobTitle" href="https://www.glassdoor.com/job-listing/GD900">Backend Engineer II</a>
</article>
<article data-job-id="GD901" data-employer-name="Epsilon Media" data-location="Remote">
  <a class="jobTitle" href="https://www.glassdoor.com/job-listing/GD901">Principal Data Engineer</a>
</article>`;

const GLASSDOOR_EMPTY_SHELL =
  '<div class="react-job-listing"><article data-job-id="GD-none">No results matched your search.</article></div>';

const MONSTER_WITH_CARDS =
  '<ul class="job-listing"><li data-job-id="MN42" data-company-name="Zeta Foods" data-location="Denver, CO"><h2><a href="/job/MN42">Cloud Engineer</a></h2></li></ul>';

const MONSTER_EMPTY_SHELL = '<ul class="job-listing"><li class="job-result empty">No matching jobs</li></ul>';

const LINKEDIN_WITH_CARDS = `
<ul class="jobs-search__results-list">
  <li><div data-entity-urn="urn:li:jobPosting:40000001" data-company-name="Eta Bank" data-location="New York, NY">
    <h3><a href="https://www.linkedin.com/jobs/view/40000001">Senior Engineer, Payments</a></h3>
  </div></li>
  <li><div data-entity-urn="urn:li:jobPosting:40000002" data-company-name="Theta Insurance" data-location="Remote">
    <h3><a href="https://www.linkedin.com/jobs/view/40000002">Engineering Manager</a></h3>
  </div></li>
</ul>`;

const LINKEDIN_EMPTY_SHELL = '<div class="jobs-search"><ul class="jobs-search__results-list"></ul><p>0 results</p></div>';

const WELLFOUND_WITH_CARDS = `
<div class="styles__results">
  <a href="/jobs/99101" class="styles__card">Founding Engineer at Iota Labs</a>
  <a href="/jobs/99102" class="styles__card">Full Stack Engineer at Kappa AI</a>
</div>`;

const WELLFOUND_EMPTY_SHELL = '<div class="styles__results"><section class="StartupsList"><p>No startups matched</p></section></div>';

interface Route {
  urlPrefix: string;
  status?: number;
  body?: string;
  bodies?: Record<string, string>;
  queryParam?: string;
}

const QUERY = 'Engineer';

const BOARD_ROUTES: Route[] = [
  { urlPrefix: 'https://www.indeed.com/jobs?q=', queryParam: 'q', body: INDEED_WITH_CARDS },
  { urlPrefix: 'https://www.glassdoor.com/Job/jobs.htm?', queryParam: 'sc.keyword', body: GLASSDOOR_WITH_CARDS },
  { urlPrefix: 'https://www.monster.com/jobs/search?q=', queryParam: 'q', body: MONSTER_WITH_CARDS },
  { urlPrefix: 'https://www.linkedin.com/jobs/search?keywords=', queryParam: 'keywords', body: LINKEDIN_WITH_CARDS },
  { urlPrefix: 'https://wellfound.com/jobs?query=', queryParam: 'query', body: WELLFOUND_WITH_CARDS },
];

/** Every board, and the host fragment the fetch log will show for it. */
const BOARD_HOSTS: Record<string, string> = {
  Indeed: 'www.indeed.com',
  Glassdoor: 'www.glassdoor.com',
  Monster: 'www.monster.com',
  LinkedIn: 'www.linkedin.com',
  Wellfound: 'wellfound.com',
};

/** Expected per-board extraction counts for BOARD_ROUTES. */
const BOARD_COUNTS: Record<string, number> = {
  Indeed: 3,
  Glassdoor: 2,
  Monster: 1,
  LinkedIn: 2,
  Wellfound: 2,
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
  present?: Array<{ id: string; title?: string; body: string }>;
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
  const boardByName = new Map<string, BoardEntry>();
  for (const entry of out.data?.byBoard || []) {
    if (entry.board.startsWith('general-board:')) boardByName.set(entry.board.slice('general-board:'.length), entry);
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

    // The child really hit all five boards; nothing here is vacuous.
    expect(urls.filter((u) => u.includes('www.indeed.com'))).toHaveLength(1);
    expect(urls.filter((u) => u.includes('www.glassdoor.com'))).toHaveLength(1);
    expect(urls.filter((u) => u.includes('www.monster.com'))).toHaveLength(1);
    expect(urls.filter((u) => u.includes('www.linkedin.com'))).toHaveLength(1);
    expect(urls.filter((u) => u.includes('wellfound.com'))).toHaveLength(1);

    expect(out.success).toBe(true);
    expect(boardByName.size).toBe(5);
    for (const [board, expected] of Object.entries(BOARD_COUNTS)) {
      const entry = boardByName.get(board);
      expect(entry).toBeDefined();
      expect(entry!.status).toBe('ok');
      expect(entry!.count).toBe(expected);
      expect(entry!.note).toContain('extracted ' + expected + ' listing');
      expect(entry!.queries).toBe(1);
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
    expect(titles).toContain('Founding Engineer at Iota Labs');
    for (const listing of out.data!.listings) {
      expect(String(listing.title) + ' ' + String(listing.company)).toMatch(/engineer/i);
    }

    // ok boards are listed as verified sources, and none is reported unverified.
    const sources = presentBody(out, 'sources');
    for (const [board, expected] of Object.entries(BOARD_COUNTS)) {
      expect(sources).toContain('general-board:' + board + ': ' + expected + ' listing');
    }
    expect(out.data!.note).toContain('Found ' + TOTAL_CARDS + ' listings across 5 boards');
    expect(out.data!.note).not.toContain('WARNING');

    expectSchemaValid(out, tool);
  }, 30000);

  it('records no-match when boards answer with a normal-looking but empty results page', async () => {
    installRoutes([
      { urlPrefix: 'https://www.indeed.com/jobs?q=', body: INDEED_EMPTY_SHELL },
      { urlPrefix: 'https://www.glassdoor.com/Job/jobs.htm?', body: GLASSDOOR_EMPTY_SHELL },
      { urlPrefix: 'https://www.monster.com/jobs/search?q=', body: MONSTER_EMPTY_SHELL },
      { urlPrefix: 'https://www.linkedin.com/jobs/search?keywords=', body: LINKEDIN_EMPTY_SHELL },
      { urlPrefix: 'https://wellfound.com/jobs?query=', body: WELLFOUND_EMPTY_SHELL },
    ]);

    const { out, boardByName, urls } = await runDiscovery({ queries: [QUERY] });

    expect(urls.length).toBe(5);
    expect(boardByName.size).toBe(5);
    for (const board of Object.keys(BOARD_COUNTS)) {
      const entry = boardByName.get(board);
      expect(entry).toBeDefined();
      expect(entry!.status).toBe('no-match');
      expect(entry!.count).toBe(0);
      expect(entry!.note).toMatch(/job-card markup present, but nothing matched the query filters/);
    }

    expect(out.data!.total).toBe(0);
    expect(out.data!.listings).toHaveLength(0);

    // Every source was genuinely read and genuinely had nothing: a real, complete
    // zero. Still a success, still no error, still no retrieval-failure reporting.
    expect(out.success).toBe(true);
    expect(out.status).toBe('ok');
    expect(out.error ?? null).toBeNull();
    expect(out.data!.failureCount).toBe(0);
    expect(out.data!.failures).toEqual([]);

    // no-match sources are surfaced as a "no matches" block, never as unverified.
    const noMatch = presentBody(out, 'no-match');
    for (const board of Object.keys(BOARD_COUNTS)) {
      expect(noMatch).toContain('general-board:' + board);
    }
    expect(out.present!.some((b) => b.id === 'unverified')).toBe(false);
    expect(out.present!.some((b) => b.id === 'errors')).toBe(false);
    expect(out.present!.some((b) => b.id === 'failure')).toBe(false);
    expect(out.present!.some((b) => b.id === 'sources')).toBe(false);
    expect(out.data!.note).not.toContain('WARNING');
    expect(out.data!.note).toContain('found no matches');
  }, 30000);

  it('distinguishes no-match from a retrieval failure for the same query across boards in one run', async () => {
    // Indeed serves real cards, Glassdoor serves a normal empty page, Monster serves
    // a page it could fetch but whose structure it does not recognise, LinkedIn and
    // Wellfound are unreachable (definitive HTTP 404). One run must place each board
    // in the right bucket AND report the unreachable ones as a run-level failure.
    installRoutes([
      { urlPrefix: 'https://www.indeed.com/jobs?q=', body: INDEED_WITH_CARDS },
      { urlPrefix: 'https://www.glassdoor.com/Job/jobs.htm?', body: GLASSDOOR_EMPTY_SHELL },
      { urlPrefix: 'https://www.monster.com/jobs/search?q=', body: INDEED_UNRECOGNISED },
      { urlPrefix: 'https://www.linkedin.com/jobs/search?keywords=', status: 404, body: 'gone' },
      { urlPrefix: 'https://wellfound.com/jobs?query=', status: 404, body: 'gone' },
    ]);

    const { out, boardByName, urls, tool } = await runDiscovery({ queries: [QUERY] });

    // The real scraper was actually exercised against all five boards.
    for (const [board, host] of Object.entries(BOARD_HOSTS)) {
      expect(urls.filter((u) => u.includes(host)).length).toBeGreaterThanOrEqual(1);
      expect(boardByName.get(board)).toBeDefined();
    }
    expect(boardByName.size).toBe(5);

    // A board that returned real cards is ok, with the real count.
    expect(boardByName.get('Indeed')!.status).toBe('ok');
    expect(boardByName.get('Indeed')!.count).toBe(3);
    expect(boardByName.get('Indeed')!.note).toContain('extracted 3 listings from the fetched pages');
    expect(boardByName.get('Indeed')!.queries).toBe(1);

    // A board that answered with a recognised but empty page is no-match: a real
    // zero, not a failure. This distinction is the whole point of the ledger.
    expect(boardByName.get('Glassdoor')!.status).toBe('no-match');
    expect(boardByName.get('Glassdoor')!.count).toBe(0);
    expect(boardByName.get('Glassdoor')!.note).toMatch(/job-card markup present, but nothing matched the query filters/);

    // A board that was retrieved but could not be parsed could NOT be read, so it
    // is an error, not a no-match and not a soft advisory.
    expect(boardByName.get('Monster')!.status).toBe('error');
    expect(boardByName.get('Monster')!.count).toBe(0);
    expect(boardByName.get('Monster')!.note).toMatch(/recognised no job-card markup at all/);

    // A board that was never retrieved at all is also an error. A 404 from a
    // general board is not the pinned-ATS "board does not exist" case, so it must
    // not be laundered into no-match.
    for (const board of ['LinkedIn', 'Wellfound']) {
      expect(boardByName.get(board)!.status).toBe('error');
      expect(boardByName.get(board)!.count).toBe(0);
      expect(boardByName.get(board)!.note).toMatch(/request failed or timed out/);
    }

    // Only the 3 Indeed cards are reported, from the one board that really answered.
    expect(out.data!.total).toBe(3);
    expect(out.data!.listings).toHaveLength(3);
    for (const listing of out.data!.listings) {
      expect(String(listing.source)).toBe('Indeed');
    }

    // Run level: some sources answered and some could not be retrieved, so the run
    // is a PARTIAL answer that still reports its failures through success/status/
    // error instead of passing as a clean success.
    expect(out.success).toBe(true);
    expect(out.status).toBe('partial');
    expect(out.error).not.toBeNull();
    expect(typeof out.error).toBe('string');
    expect(out.error).toContain('3 of 5 sources could not be retrieved');
    expect(out.error).toContain('this run is PARTIAL');
    expect(out.error).toContain('it is not a complete answer about the job market');
    for (const board of ['Monster', 'LinkedIn', 'Wellfound']) {
      expect(out.error).toContain('general-board:' + board);
    }
    // A source that answered is never named in the failure report.
    expect(out.error).not.toContain('general-board:Indeed');
    expect(out.error).not.toContain('general-board:Glassdoor');

    // The machine-readable failure list carries exactly the unretrievable sources.
    expect(out.data!.failureCount).toBe(3);
    expect(out.data!.failures.map((f) => f.board)).toEqual([
      'general-board:Monster',
      'general-board:LinkedIn',
      'general-board:Wellfound',
    ]);
    for (const failure of out.data!.failures) {
      expect(failure.status).toBe('error');
      expect(failure.note.length).toBeGreaterThan(0);
    }
    expect(out.data!.failures.map((f) => f.board)).not.toContain('general-board:Indeed');
    expect(out.data!.failures.map((f) => f.board)).not.toContain('general-board:Glassdoor');

    // The present layer leads with a headed RETRIEVAL FAILURE block naming every
    // failed source, and keeps the no-match source out of it.
    expect(blockIds(out)).toContain('errors');
    const errors = presentBody(out, 'errors');
    expect(errors).toContain('RETRIEVAL FAILURE');
    expect(errors).toContain('This is a failure of this system, not an empty job market');
    expect(errors).toContain('[FAILED]');
    for (const board of ['Monster', 'LinkedIn', 'Wellfound']) {
      expect(errors).toContain('general-board:' + board);
    }
    expect(errors).not.toContain('general-board:Indeed');
    expect(errors).not.toContain('general-board:Glassdoor');

    // The "unverified" advisory state is gone for good: a source either answered or
    // this system could not read it, and says so as a failure.
    expect(out.present!.some((b) => b.id === 'unverified')).toBe(false);

    // The no-match source is still presented as a no-match, separately.
    const noMatch = presentBody(out, 'no-match');
    expect(noMatch).toContain('general-board:Glassdoor');
    expect(noMatch).not.toContain('general-board:Indeed');
    expect(noMatch).not.toContain('general-board:Monster');

    // The summary repeats the run-level outcome rather than trailing off as a
    // successful search.
    expect(out.data!.note).toMatch(/Found 3 listings across 1 board \(3 raw, 3 after filtering\)/);
    expect(out.data!.note).toContain(out.error!);
    expect(out.data!.note).not.toContain('WARNING');

    expectSchemaValid(out, tool);
  }, 30000);

  it('fails the run outright when no source could be retrieved or read', async () => {
    // Nothing answered this time: Indeed 404s, Glassdoor 403s, Monster 500s,
    // Wellfound 404s, and LinkedIn returns a page whose structure is unrecognised.
    // There is no offline, so a run that read no board at all is a failure of this
    // system and must never be readable as "no jobs exist".
    installRoutes([
      { urlPrefix: 'https://www.indeed.com/jobs?q=', status: 404, body: 'gone' },
      { urlPrefix: 'https://www.glassdoor.com/Job/jobs.htm?', status: 403, body: 'forbidden' },
      { urlPrefix: 'https://www.monster.com/jobs/search?q=', status: 500, body: 'boom' },
      { urlPrefix: 'https://www.linkedin.com/jobs/search?keywords=', body: INDEED_UNRECOGNISED },
      { urlPrefix: 'https://wellfound.com/jobs?query=', status: 404, body: 'gone' },
    ]);

    const { out, boardByName, urls, tool } = await runDiscovery({ queries: [QUERY] });

    // Every board was really probed; nothing here is a vacuous pass.
    for (const host of Object.values(BOARD_HOSTS)) {
      expect(urls.filter((u) => u.includes(host)).length).toBeGreaterThanOrEqual(1);
    }
    expect(boardByName.size).toBe(5);

    // Not one board is ok, and not one is no-match. Every unretrievable or
    // unreadable source is recorded as an error.
    for (const board of Object.keys(BOARD_COUNTS)) {
      const entry = boardByName.get(board);
      expect(entry).toBeDefined();
      expect(entry!.status).toBe('error');
      expect(entry!.count).toBe(0);
      expect(entry!.note.length).toBeGreaterThan(0);
    }

    // The unparseable-but-retrieved board is called out with its own reason, so a
    // parse failure is not confused with a transport failure.
    expect(boardByName.get('LinkedIn')!.note).toMatch(/recognised no job-card markup at all/);
    for (const board of ['Indeed', 'Glassdoor', 'Monster', 'Wellfound']) {
      expect(boardByName.get(board)!.note).toMatch(/request failed or timed out/);
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
    expect(out.error).toContain('All 5 sources this run tried could not be retrieved or read');
    for (const board of Object.keys(BOARD_COUNTS)) {
      expect(out.error).toContain('general-board:' + board);
    }
    expect(out.error).toContain('it did not determine that no jobs exist');

    // The machine-readable failure list covers the whole run.
    expect(out.data!.failureCount).toBe(5);
    expect(out.data!.failures.map((f) => f.board).sort()).toEqual(
      Object.keys(BOARD_COUNTS).map((b) => 'general-board:' + b).sort(),
    );
    for (const failure of out.data!.failures) {
      expect(failure.status).toBe('error');
    }

    // The failure LEADS the output. A caller that only renders the first block must
    // see the failure, not an empty result set.
    expect(out.present![0].id).toBe('failure');
    const failure = presentBody(out, 'failure');
    expect(failure).toContain('JOB DISCOVERY FAILED');
    expect(failure).toContain('None of the 5 sources this run tried could be retrieved or read');
    expect(failure).toContain('it did NOT determine that no jobs exist');
    expect(failure).toContain('Sources attempted:');
    for (const board of Object.keys(BOARD_COUNTS)) {
      expect(failure).toContain('general-board:' + board);
    }

    // The per-source RETRIEVAL FAILURE block is present too, still headed as one.
    expect(blockIds(out)).toContain('errors');
    const errors = presentBody(out, 'errors');
    expect(errors).toContain('RETRIEVAL FAILURE: 5 sources could not be retrieved or read');
    for (const board of Object.keys(BOARD_COUNTS)) {
      expect(errors).toContain('[FAILED] general-board:' + board);
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
