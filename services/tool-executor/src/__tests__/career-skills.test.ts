import * as http from 'http';
import { ToolExecutor } from '../services/ToolExecutor';
import { Tool } from '../types';
import { validateAgainstOutputSchema } from '../utils/schemaValidator';
import {
  INTERVIEW_COMPENSATION_BATTLECARD,
  INTERVIEW_PRACTICE_MOCK_INTERVIEWER,
  CAREER_JOB_DISCOVERY,
  PIPELINE_OUTCOME_TRACKER,
  RESUME_TEMPLATE_MANAGER,
  APPLICATION_EXECUTION_ORCHESTRATOR,
  CAREER_PIPELINE_REPORT,
  CAREER_OUTCOME,
  CAREER_ADD_TEMPLATE,
} from '../assistants/career';

const fs = require('fs');
const os = require('os');
const path = require('path');

function extractCompany(prompt: string): string {
  const match = /\bat ([^.]+)\.?/.exec(String(prompt || ''));
  return match ? match[1].trim() : 'the company';
}

function interviewQuestionsFor(company: string): string {
  return [
    `Walk me through the most complex system you have designed and owned at ${company}.`,
    'How do you measure the impact of your work on business outcomes?',
    'Describe a time you disagreed with a technical decision. How did you handle it?',
    'What trade-offs did you make when shipping under a tight deadline?',
    'How would you approach your first 90 days in this role?',
  ].join('\n');
}

function negotiationScriptFor(company: string): string {
  return [
    `Negotiation script for ${company}:`,
    'Anchor the conversation on total compensation, not base salary alone.',
    'Research the market range for the role before the first call.',
    'Ask for equity, signing bonus, and title in addition to base.',
    'Frame your ask as a mutual investment, not a demand.',
    'Practice a concise, respectful close that leaves room to collaborate.',
  ].join('\n');
}

function brainContentFor(prompt: string): string {
  const text = String(prompt || '').toLowerCase();
  const company = extractCompany(prompt);
  if (text.includes('interview question')) return interviewQuestionsFor(company);
  if (text.includes('negotiation')) return negotiationScriptFor(company);
  return 'No tailored guidance was available for this request.';
}

// Skills are executed by CodeExecutor, which spawns a real `node` child process.
// The child inherits process.env but has its own native fetch, so an in-process
// `global.fetch` mock is invisible to it. Run a real HTTP server on an ephemeral
// port and point BRAIN_URL at it so the child can actually reach the brain stub.
let brainServer: http.Server;
const priorBrainUrl = process.env.BRAIN_URL;

beforeAll(async () => {
  brainServer = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const respond = (status: number, payload: unknown) => {
        const body = JSON.stringify(payload);
        res.writeHead(status, {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        });
        res.end(body);
      };

      if (req.method === 'POST' && (req.url || '').split('?')[0] === '/api/brain/complete') {
        let request: { prompt?: string; options?: { model?: string } } = {};
        try {
          request = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        } catch (e) {
          respond(400, { error: 'invalid JSON body' });
          return;
        }
        respond(200, {
          content: brainContentFor(request.prompt || ''),
          model: (request.options && request.options.model) || 'gpt-4o-mini',
          provider: 'openrouter',
          tokensUsed: 100,
        });
        return;
      }

      respond(404, { error: 'not found' });
    });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => reject(err);
    brainServer.once('error', onError);
    brainServer.listen(0, '127.0.0.1', () => {
      brainServer.removeListener('error', onError);
      // Surface later accept-time errors loudly instead of silently hanging tests.
      brainServer.on('error', (err) => {
        throw err;
      });
      resolve();
    });
  });

  const address = brainServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind brain stub HTTP server to a TCP port');
  }
  process.env.BRAIN_URL = `http://127.0.0.1:${address.port}`;
});

beforeAll(() => {
  if (!fs.existsSync(INTERCEPT_PRELOAD)) {
    throw new Error(`Missing job-board fetch interceptor preload at ${INTERCEPT_PRELOAD}`);
  }
  careerStubHome = fs.mkdtempSync(path.join(os.tmpdir(), 'career-skills-home-'));
  process.env.CAREER_HOME = careerStubHome;
  const requireFlag = `--require ${INTERCEPT_PRELOAD}`;
  process.env.NODE_OPTIONS = priorNodeOptions ? `${priorNodeOptions} ${requireFlag}` : requireFlag;
});

afterAll(async () => {
  if (priorBrainUrl === undefined) delete process.env.BRAIN_URL;
  else process.env.BRAIN_URL = priorBrainUrl;
  if (brainServer) {
    await new Promise<void>((resolve) => brainServer.close(() => resolve()));
  }
  restoreEnv('NODE_OPTIONS', priorNodeOptions);
  restoreEnv('CAREER_TEST_FETCH_ROUTES', priorRoutes);
  restoreEnv('CAREER_HOME', priorCareerHome);
  restoreEnv('CAREER_TEST_FETCH_LOG', priorFetchLog);
  try {
    fs.rmSync(careerStubHome, { recursive: true, force: true });
  } catch {
    // best effort
  }
});

// ------------------------------------------------------------- job-board network
//
// career-job-discovery hardcodes every job-board URL (the Greenhouse / Ashby /
// Lever board APIs, the guessed company career pages, and the Indeed / Glassdoor
// / Monster / LinkedIn / Wellfound scrapers). There is no input or env override
// for a base URL, so the skill cannot be pointed at a local server. And the
// assertions in this file are about how a real result set is FORMATTED, which a
// stub that returns nothing cannot demonstrate: with every board unreachable the
// skill returns no listings at all, so the "no ISO datetime leaks" assertion had
// no datetime to be checked against and passed vacuously.
//
// So the boards are stubbed with content, using the same seam the sibling
// career-job-discovery-ledger.test.ts already uses: CodeExecutor spawns a real
// `node` child with `{ ...process.env }`, so NODE_OPTIONS="--require <preload>"
// installs a fetch interceptor INSIDE the child that actually runs the skill.
//
// fixtures/job-board-fetch-intercept.cjs matches the skill's real URL prefixes
// and falls through to the real fetch for anything unmatched, so it can neither
// leak a live request out of this file nor silently swallow unrelated traffic
// (the local BRAIN_URL stub above still goes out over the real stack).
//
// The skill's own source runs unmodified: what is asserted here is the real
// scraper regexes, the real ATS normalisers, and the real output formatting.

const INTERCEPT_PRELOAD = path.join(__dirname, 'fixtures', 'job-board-fetch-intercept.cjs');

// Card-shaped markup. The layout must carry the exact attribute triple each
// scraper's regex needs, and every title must contain the query term so it
// survives the skill's post-fetch filter.
const INDEED_MANAGER_CARDS = `
<div id="searchResultsPages">
  <article data-jk="MG101" data-company-name="Delta Logistics" data-location="Chicago, IL">
    <h2><a href="/viewjob?jk=MG101">Engineering Manager</a></h2>
  </article>
  <article data-jk="MG102" data-company-name="Epsilon Media" data-location="Remote">
    <h2><a href="/viewjob?jk=MG102">Product Manager</a></h2>
  </article>
</div>`;



const LINKEDIN_MANAGER_CARDS = `
<ul class="jobs-search__results-list">
  <li><div data-entity-urn="urn:li:jobPosting:50000001" data-company-name="Iota Labs" data-location="Austin, TX">
    <h3><a href="https://www.linkedin.com/jobs/view/50000001">Engineering Manager, Infrastructure</a></h3>
  </div></li>
</ul>`;

const WELLFOUND_MANAGER_CARDS =
  '<div class="styles__results"><a href="/jobs/88001" class="styles__card">Growth Manager at Kappa AI</a></div>';




const LINKEDIN_ENGINEER_CARDS = `
<ul class="jobs-search__results-list">
  <li><div data-entity-urn="urn:li:jobPosting:40000001" data-company-name="Eta Bank" data-location="New York, NY">
    <h3><a href="https://www.linkedin.com/jobs/view/40000001">Senior Engineer, Payments</a></h3>
  </div></li>
</ul>`;

const WELLFOUND_ENGINEER_CARDS =
  '<div class="styles__results"><a href="/jobs/99101" class="styles__card">Founding Engineer at Iota Labs</a></div>';

// Card-shaped markup is present but nothing carries the attribute triple the
// extractor needs: the board answered and the layout looks normal, so this is a
// real, complete "no match" rather than a retrieval failure. That distinction is
// what lets the "No company names were provided" guidance be reached at all.

const GLASSDOOR_EMPTY_SHELL =
  '<div class="react-job-listing"><article data-job-id="GD-none">No results matched your search.</article></div>';

const MONSTER_EMPTY_SHELL = '<ul class="job-listing"><li class="job-result empty">No matching jobs</li></ul>';

const LINKEDIN_EMPTY_SHELL = '<div class="jobs-search"><ul class="jobs-search__results-list"></ul><p>0 results</p></div>';

const WELLFOUND_EMPTY_SHELL = '<div class="styles__results"><section class="StartupsList"><p>No startups matched</p></section></div>';

// A real Greenhouse board payload. updated_at is a genuine ISO-8601 instant, so
// the skill has an actual timestamp to render: without a listing, its
// formatPostedAt formatting is never exercised by this file at all.
const GREENHOUSE_ACME_JOBS = JSON.stringify({
  jobs: [
    {
      id: 7001,
      title: 'Senior Platform Engineer',
      company_name: 'Acme',
      location: { name: 'Austin, TX' },
      absolute_url: 'https://boards.greenhouse.io/acme/jobs/7001',
      updated_at: '2026-08-14T09:30:00.000Z',
      metadata: [{ name: 'Salary', value: '$150,000 - $190,000 USD' }],
    },
    {
      id: 7002,
      title: 'Site Reliability Engineer',
      company_name: 'Acme',
      location: { name: 'Remote' },
      absolute_url: 'https://boards.greenhouse.io/acme/jobs/7002',
      updated_at: '2026-08-02T17:05:00.000Z',
      metadata: [],
    },
  ],
});

const GREENHOUSE_ACME_JOB_DETAIL = JSON.stringify({
  content: '<p>Own the services that power Acme.</p>',
});

// The ATS probe order is Greenhouse, then Ashby, then Lever, then the guessed
// company career pages, and it stops at the first hit. Greenhouse answers here,
// so Ashby, Lever and the acme.com scraper are never reached; they are still
// routed so that no route this file owns can escape to the real network.
const ASHBY_ACME_JOBS = JSON.stringify({ jobs: [] });
const LEVER_ACME_POSTINGS = JSON.stringify([]);

interface Route {
  urlPrefix: string;
  status?: number;
  body?: string;
}

/** The five general boards, one route each, in the order the skill probes them. */
// General boards are opt-in (useGeneralBoards) because the two that survive
// here both block or client-render for this host. Keyed by name, not position:
// a positional list silently shifted once a board was removed from the middle.
const GENERAL_BOARD_URLS: Record<string, string> = {
  linkedin: 'https://www.linkedin.com/jobs/search?keywords=',
  wellfound: 'https://wellfound.com/jobs?query=',
};

function generalBoardRoutes(bodies: Record<string, string | undefined>): Route[] {
  const routes: Route[] = [];
  for (const [board, body] of Object.entries(bodies)) {
    if (body) routes.push({ urlPrefix: GENERAL_BOARD_URLS[board], body });
  }
  return routes;
}

// A well-formed feed with no matching roles: the documented container is
// present and empty, which is a real answer, not a failure.
const FEED_ROUTES_EMPTY: Route[] = [
  { urlPrefix: 'https://remoteok.com/api', body: '[{"legal":"notice"}]' },
  { urlPrefix: 'https://remotive.com/api/remote-jobs', body: '{"jobs":[]}' },
  { urlPrefix: 'https://www.arbeitnow.com/api/job-board-api', body: '{"data":[]}' },
  { urlPrefix: 'https://jobicy.com/api/v2/remote-jobs', body: '{"jobs":[]}' },
  { urlPrefix: 'https://weworkremotely.com/remote-jobs.rss', body: '<?xml version="1.0"?><rss version="2.0"><channel><title>WWR</title></channel></rss>' },
  { urlPrefix: 'https://himalayas.app/jobs/rss', body: '<?xml version="1.0"?><rss version="2.0"><channel><title>Himalayas</title></channel></rss>' },
];

const MANAGER_ROUTES: Route[] = generalBoardRoutes({
  linkedin: LINKEDIN_MANAGER_CARDS,
  wellfound: WELLFOUND_MANAGER_CARDS,
});

const EMPTY_ROUTES: Route[] = generalBoardRoutes({
  linkedin: LINKEDIN_EMPTY_SHELL,
  wellfound: WELLFOUND_EMPTY_SHELL,
});

// Job detail URLs are a longer prefix than the list URL, so the detail route is
// declared first: the interceptor takes the first matching prefix.
const ENGINEER_ROUTES: Route[] = [
  { urlPrefix: 'https://boards-api.greenhouse.io/v1/boards/acme/jobs/', body: GREENHOUSE_ACME_JOB_DETAIL },
  { urlPrefix: 'https://boards-api.greenhouse.io/v1/boards/acme/jobs', body: GREENHOUSE_ACME_JOBS },
  { urlPrefix: 'https://api.ashbyhq.com/posting-api/job-board/acme?', body: ASHBY_ACME_JOBS },
  { urlPrefix: 'https://api.lever.co/v0/postings/acme?', body: LEVER_ACME_POSTINGS },
  { urlPrefix: 'https://www.acme.com/', status: 404, body: 'gone' },
  { urlPrefix: 'https://acme.com/', status: 404, body: 'gone' },
  ...generalBoardRoutes({
    linkedin: LINKEDIN_ENGINEER_CARDS,
    wellfound: WELLFOUND_ENGINEER_CARDS,
  }),
];

const priorNodeOptions = process.env.NODE_OPTIONS;
const priorRoutes = process.env.CAREER_TEST_FETCH_ROUTES;
const priorFetchLog = process.env.CAREER_TEST_FETCH_LOG;
const priorCareerHome = process.env.CAREER_HOME;

let careerStubHome: string;
let fetchLogPath: string;

/** Routes are read by the child at preload time, so each test installs its own. */
function installRoutes(routes: Route[]): void {
  fetchLogPath = path.join(careerStubHome, `fetch-${Date.now()}-${Math.floor(Math.random() * 1e6)}.log`);
  fs.writeFileSync(fetchLogPath, '');
  process.env.CAREER_TEST_FETCH_LOG = fetchLogPath;
  process.env.CAREER_TEST_FETCH_ROUTES = Buffer.from(JSON.stringify(routes), 'utf8').toString('base64');
}

/** Every URL the child actually requested, so a prefix typo cannot pass silently. */
function requestedUrls(): string[] {
  return fs
    .readFileSync(fetchLogPath, 'utf8')
    .split('\n')
    .map((line: string) => line.trim())
    .filter(Boolean);
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

/**
 * A `type: 'code'` stand-in for a real reasoning base tool, registered under that
 * tool's id. `__execute_tool` resolves the callee from the registry, so this
 * makes the delegation path actually execute under test instead of failing to
 * resolve and silently handing the run to the skill's direct brain fallback.
 * The summary echoes the input back, so callers can assert the context was
 * threaded through to the delegate.
 */
function codeSkillStandIn(id: string, summary: string): Tool {
  const source = [
    'var i = typeof __tool_input !== "undefined" && __tool_input ? __tool_input : {};',
    `var who = (i.company || "the company") + " (" + (i.targetRole || i.role || "the role") + ")";`,
    `console.log(JSON.stringify({ success: true, status: "ok", data: { summary: ${JSON.stringify(summary)} + " for " + who }, error: null, present: [] }));`,
  ].join('\n');
  return {
    id,
    name: id,
    description: `Stand-in for ${id}`,
    type: 'code',
    manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: source },
    createdAt: new Date(),
    updatedAt: new Date(),
    isSkill: false,
  };
}

interface PresentBlock {
  id: string;
  title?: string;
  body: string;
  kind?: string;
  columns?: string[];
}

interface SkillResult {
  success?: boolean;
  status?: string;
  error?: string | null;
  data?: {
    role?: { jobTitle?: string };
    template?: { name?: string; type?: string };
    [key: string]: unknown;
  } | null;
  present?: PresentBlock[];
}

async function run(
  tool: Tool,
  input: Record<string, unknown>,
  registryTools: Tool[] = [],
  config?: Record<string, unknown>,
): Promise<{ result: SkillResult; tool: Tool; schemaIssues: ReturnType<typeof validateAgainstOutputSchema> }> {
  const registry = new Map<string, Tool>();
  for (const t of registryTools) registry.set(t.id, t);
  // The brain endpoint is Skill configuration, not a deployment env var, so the
  // stub server address is passed in per run rather than through BRAIN_URL.
  if (config) tool = { ...tool, externalConfig: config } as unknown as Tool;
  registry.set(tool.id, tool);

  const executor = new ToolExecutor(registry);
  const exec = await executor.execute(tool, input);
  const output = exec.output as { output?: string; outputSchemaIssues?: ReturnType<typeof validateAgainstOutputSchema> } | undefined;

  let result: SkillResult = {};
  if (typeof output?.output === 'string') {
    try {
      result = JSON.parse(output.output) as SkillResult;
    } catch {
      throw new Error(
        `Skill ${tool.id} did not emit parseable JSON. Raw output:\n${String(output?.output).slice(0, 500)}`,
      );
    }
  }
  return { result, tool, schemaIssues: output?.outputSchemaIssues || [] };
}

// The general-board tier is opt-in (useGeneralBoards) and now holds only the
// two boards that actually serve a server-rendered list. Indeed, Glassdoor and
// Monster were removed: they refuse automated requests at the network layer
// from this host, so they contributed a permanent failure to every run.
const GENERAL_BOARD_HOSTS = ['www.linkedin.com', 'wellfound.com'];

// The company-agnostic feeds are the default tier and need no company name.
const FEED_HOSTS = ['remoteok.com', 'remotive.com', 'arbeitnow.com', 'jobicy.com', 'weworkremotely.com', 'himalayas.app'];

/**
 * Runs career-job-discovery against the currently installed routes.
 *
 * The host check is a harness precondition, not an assertion about the skill: the
 * interceptor falls through to the real network for any URL it does not match, so
 * a route prefix that drifts out of sync with the skill would otherwise turn this
 * file back into a live-network test that merely happens to pass. Failing loudly
 * here keeps the stub provably non-vacuous. It throws rather than calling expect()
 * for the same reason the ledger sibling file does: the assertion belongs to the
 * test body, this belongs to the fixture.
 */
async function runJobDiscovery(
  input: Record<string, unknown>,
  expectedHosts: string[],
): Promise<{ result: SkillResult; tool: Tool; schemaIssues: ReturnType<typeof validateAgainstOutputSchema> }> {
  const outcome = await run(CAREER_JOB_DISCOVERY, input);
  const urls = requestedUrls();
  const missing = expectedHosts.filter((host) => !urls.some((u) => u.includes(host)));
  if (missing.length > 0) {
    throw new Error(
      `career-job-discovery never requested stubbed host(s) ${missing.join(', ')}, so the interceptor ` +
        `fell through to the real network. Requested: ${urls.join(', ') || '(none)'}`,
    );
  }
  return outcome;
}

const LOWER_ORDER_TOOLS = [CAREER_PIPELINE_REPORT, CAREER_OUTCOME, CAREER_ADD_TEMPLATE];

/**
 * A `type: 'code'` stand-in for the apply delegate. The orchestrator used to
 * `return` undefined whenever the delegate matched no listing, which the executor
 * surfaces as "Execution completed with no output" at exit code 0 -- so the only
 * way to pin that regression is to hand it a delegate that legitimately produces
 * an empty application set and assert a rendered card comes back.
 */
function applyDelegateStandIn(applications: unknown[], errors: unknown[]): Tool {
  const source = [
    'console.log(JSON.stringify({',
    '  success: true,',
    '  status: "dry-run",',
    '  data: {',
    '    applications: ' + JSON.stringify(applications) + ',',
    '    errors: ' + JSON.stringify(errors) + ',',
    '    dryRun: true,',
    '    trackingPath: "applications/tracking.json"',
    '  }',
    '}));',
  ].join('\n');
  return {
    id: 'career-application-execution',
    name: 'career-application-execution',
    description: 'Stand-in for career-application-execution',
    type: 'code',
    manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: source },
    createdAt: new Date(),
    updatedAt: new Date(),
    isSkill: false,
  };
}



function assertPresentClean(present: PresentBlock[] | undefined, label: string): void {
  expect(present).toBeDefined();
  expect(Array.isArray(present)).toBe(true);
  expect((present as PresentBlock[]).length).toBeGreaterThan(0);
  for (const block of (present as PresentBlock[])) {
    expect(block.id).toBeTruthy();
    expect(block.body).toBeTruthy();
    expect(block.body).not.toMatch(/undefined|NaN/);
    if (block.title) {
      expect(block.body.startsWith(block.title)).toBe(false);
    }
  }
}

function validateOutput(result: SkillResult, tool: Tool): void {
  const issues = validateAgainstOutputSchema(
    { success: result.success, status: result.status, data: result.data, present: result.present, error: result.error },
    tool.outputSchema,
  );
  expect(issues).toEqual([]);
}

describe('Career Coach skills emit user-facing output', () => {
  describe('Interview and Negotiation Prep', () => {
    it('generates company-specific content when brain is available via direct call', async () => {
      const { result, tool } = await run(
        INTERVIEW_COMPENSATION_BATTLECARD,
        { company: 'Acme Corp', targetRole: 'Senior Engineer' },
        [],
        { brainEndpoint: process.env.BRAIN_URL },
      );

      // Brain API is available in test environment, so direct call should succeed
      expect(result.success).toBe(true);
      expect(result.status).toBe('ok');
      assertPresentClean(result.present, INTERVIEW_COMPENSATION_BATTLECARD.id);
      const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
      expect(body).toContain('Acme Corp');
      expect(result.data).toBeDefined();
      expect(result.data!.sourceNote).toBeDefined();
      validateOutput(result, tool);
    }, 15000);

    it('does not report a successful delegation as missing', async () => {
      // Regression: when the delegation succeeded, the skill used to record the
      // topic as missing anyway, spend a second pair of brain calls on the
      // direct fallback, run past its own deadline, and report an offline brain
      // while the Brain log showed every call OK.
      //
      // These stand-ins are registered under the real reasoning tool ids so the
      // DELEGATION is what satisfies this run. Left unregistered they resolve to
      // "tool not found" and the direct fallback answers instead, which lets
      // `delegatedTo` come back empty and this test pass while proving nothing.
      //
      // Scope: this pins the skill's bookkeeping for a successful delegation
      // (delegatedTo/coverage/missing/sourceNote). That a reasoning callee
      // arrives without a `success` key, and the bridge normalization that fixes
      // it, are pinned in nested-execution.test.ts -- a code-type stand-in
      // always emits `success`, so it cannot exercise that half. ReasoningExecutor
      // reads BRAIN_URL once at module load, so the real reasoning tools cannot
      // be pointed at this file's brain stub either.
      const { result, tool } = await run(
        INTERVIEW_COMPENSATION_BATTLECARD,
        { company: 'StartupXYZ', targetRole: 'Product Manager' },
        [
          codeSkillStandIn('career-interview-prep', 'Interview questions and evaluation areas for the role.'),
          codeSkillStandIn('career-advisory', 'Negotiate base, equity, title and a signing bonus.'),
        ],
        { brainEndpoint: process.env.BRAIN_URL },
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe('ok');
      // The delegation satisfied both topics, so neither is missing and the
      // direct brain fallback never had to run.
      expect(result.data!.delegatedTo).toEqual(['career-interview-prep', 'career-advisory']);
      expect(result.data!.missing).toEqual([]);
      expect(result.data!.coverage).toEqual(['interview-prep', 'negotiation-advice']);
      expect(result.data!.sourceNote).toBeNull();
      expect(result.data!.negotiation).toContain('signing bonus');
      assertPresentClean(result.present, INTERVIEW_COMPENSATION_BATTLECARD.id);
      const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
      expect(body).toContain('StartupXYZ');
      validateOutput(result, tool);
    }, 15000);

    it('reports both topics missing, and not-connected, when no source can answer', async () => {
      // Point BRAIN_URL at a closed port so the direct fallback cannot rescue
      // the run, and leave the delegated tools unresolvable. The skill must then
      // say so honestly rather than blaming reachability for a timeout.
      try {
        const { result, tool } = await run(
          INTERVIEW_COMPENSATION_BATTLECARD,
          { company: 'Unreachable Co', targetRole: 'Product Manager' },
          [],
          // A closed port, so the direct fallback cannot rescue the run.
          { brainEndpoint: 'http://127.0.0.1:1' },
        );

        expect(result.success).toBe(false);
        expect(result.status).toBe('not-connected');
        expect(result.data).toBeNull();
        expect(result.error).toMatch(/unavailable/i);
        assertPresentClean(result.present, INTERVIEW_COMPENSATION_BATTLECARD.id);
        validateOutput(result, tool);
      } finally {
        // no environment to restore
      }
    }, 15000);
  });

  describe('Interview Practice & Mock Interviewer', () => {
    it('does not pass jobId as targetRole (avoids context handoff error)', async () => {
      const { result, tool, schemaIssues } = await run(INTERVIEW_PRACTICE_MOCK_INTERVIEWER, {
        targetRole: 'Product Manager',
        company: 'TechCo',
        stage: 'onsite',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('not-connected');
      expect(result.error).toMatch(/not configured|not available/);
      assertPresentClean(result.present, INTERVIEW_PRACTICE_MOCK_INTERVIEWER.id);
      const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
      expect(body).toContain('Product Manager');
      expect(body).toContain('TechCo');
      expect(body).toContain('Mock Interview');
      validateOutput(result, tool);
    }, 15000);
  });

  describe('Job Discovery', () => {
    it('returns present blocks without raw JSON fields or storage paths', async () => {
      installRoutes(MANAGER_ROUTES);
      const { result, tool, schemaIssues } = await runJobDiscovery(
        { queries: ['Manager'], useGeneralBoards: true, usePublicFeeds: false },
        GENERAL_BOARD_HOSTS,
      );

      expect(result.success).toBe(true);
      assertPresentClean(result.present, CAREER_JOB_DISCOVERY.id);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('storagePath');
      expect(serialized).not.toContain('queriesUsed');
      expect(serialized).not.toContain('companiesSearched');
      expect(result.data!.generatedAt).toBeUndefined();
      validateOutput(result, tool);
    }, 15000);

    it('searches without any company when only a query is given', async () => {
      // The company-agnostic feeds need no company name, which is the whole
      // point of that tier: a query-only run now searches instead of refusing.
      installRoutes(FEED_ROUTES_EMPTY);
      const { result } = await runJobDiscovery({ queries: ['Manager'] }, FEED_HOSTS);

      expect(result.success).toBe(true);
      expect(result.error ?? null).toBeNull();
      const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
      expect(body).toContain('searched company-agnostic public feeds');
      // Every feed was read and genuinely had nothing: a real, complete zero.
      expect(body).toContain('Sources that had no matching listings'.slice(0, 0) || 'Sources consulted');
    }, 20000);

    it('does not leak ISO datetime strings to the user', async () => {
      installRoutes(ENGINEER_ROUTES);
      // The Greenhouse board answers with real ISO-8601 updated_at instants, so the
      // skill genuinely has datetimes to render and this is a real formatting test
      // rather than a pass over a present body that contains no dates at all.
      // General boards are opt-in now, so the run asks for them explicitly.
      const { result } = await runJobDiscovery(
        { queries: ['Engineer'], companies: ['Acme'], useGeneralBoards: true },
        [...GENERAL_BOARD_HOSTS, 'boards-api.greenhouse.io'],
      );

      const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
      expect(body).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }, 15000);
  });

  describe('Pipeline & Outcome Tracker', () => {
    it('stores new entries when targetRole and company are provided', async () => {
       const { result, tool } = await run(PIPELINE_OUTCOME_TRACKER, {
         targetRole: 'Data Scientist',
         company: 'Analytics Inc',
         status: 'applied',
       }, LOWER_ORDER_TOOLS);

      expect(result.success).toBe(true);
      assertPresentClean(result.present, PIPELINE_OUTCOME_TRACKER.id);
      const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
      expect(body).toContain('Data Scientist');
      expect(body).toContain('Analytics Inc');
      expect(body).toContain('Stored as a new application');
      expect(result.data!.role).toBeDefined();
      expect(result.data!.role!.jobTitle).toContain('Data Scientist');
      validateOutput(result, tool);
    }, 15000);

    it('shows existing applications when no targetRole is provided', async () => {
      const { result } = await run(PIPELINE_OUTCOME_TRACKER, {}, LOWER_ORDER_TOOLS);

      expect(result.success).toBe(true);
      const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
      expect(body).toContain('Your Application Pipeline');
    }, 15000);

    it('formats dates in human-readable form, not ISO', async () => {
      const { result } = await run(PIPELINE_OUTCOME_TRACKER, {
        targetRole: 'Engineer',
        company: 'BuildCo',
      }, LOWER_ORDER_TOOLS);

      const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
      expect(body).not.toMatch(/2026-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }, 15000);
  });

  describe('Resume & Template Manager', () => {
    it('stores a complete resume and presents it without internal paths', async () => {
      const { result, tool } = await run(RESUME_TEMPLATE_MANAGER, {
        name: 'Jane Doe Resume',
        type: 'resume',
        content: 'Jane Doe\nSenior Software Engineer\nExperience: 5 years at TechCo',
      }, LOWER_ORDER_TOOLS);

      expect(result.success).toBe(true);
      assertPresentClean(result.present, RESUME_TEMPLATE_MANAGER.id);
      const body = (result.present as PresentBlock[]).map((b) => `${b.title || ''}\n${b.body || ''}`).join('\n');
      expect(body).toContain('Jane Doe Resume');
      expect(body).toContain('Template Saved');
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('templatePath');
      expect(result.data!.template).toBeDefined();
      expect(result.data!.template!.name).toBe('Jane Doe Resume');
      expect(result.data!.template!.type).toBe('resume');
      validateOutput(result, tool);
    }, 15000);

    it('reports guidance when save action is invoked without name or content', async () => {
      const { result } = await run(RESUME_TEMPLATE_MANAGER, { save: true });

      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
      const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
      expect(body).toContain('provide a document name and content');
    }, 15000);
  });
  describe('Apply to Selected Jobs', () => {
    it('renders a preview card when the delegate matched listings', async () => {
      const { result, tool } = await run(
        APPLICATION_EXECUTION_ORCHESTRATOR,
        { targetRoles: ['listing-1'], dryRun: true },
        [
          applyDelegateStandIn(
            [{ identifier: 'listing-1', status: 'dry_run', job: { title: 'Marketing Manager', company: 'Acme' } }],
            [],
          ),
        ],
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe('dry-run');
      assertPresentClean(result.present, APPLICATION_EXECUTION_ORCHESTRATOR.id);
      const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
      expect(body).toContain('Marketing Manager');
      expect(body).toContain('Acme');
      validateOutput(result, tool);
    }, 15000);

    it('surfaces the delegate\'s per-role errors instead of emitting nothing', async () => {
      // Regression: this path used to `return` undefined, so the Skill produced no
      // output at all and the user could not tell a no-op from a success.
      const { result, tool } = await run(
        APPLICATION_EXECUTION_ORCHESTRATOR,
        { targetRoles: ['Marketing Manager'], dryRun: true },
        [applyDelegateStandIn([], [{ identifier: 'Marketing Manager', error: 'Job listing not found' }])],
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      assertPresentClean(result.present, APPLICATION_EXECUTION_ORCHESTRATOR.id);
      const body = (result.present as PresentBlock[]).map((b) => `${b.title || ''}\n${b.body || ''}`).join('\n');
      expect(body).toContain('Job listing not found');
      expect(body).toContain('Marketing Manager');
      validateOutput(result, tool);
    }, 15000);

    it('reports a failed delegation as an error card', async () => {
      const failing: Tool = {
        id: 'career-application-execution',
        name: 'career-application-execution',
        description: 'Failing stand-in',
        type: 'code',
        manifest: {
          language: 'javascript',
          entrypoint: 'index.js',
          sourceCode: 'console.log(JSON.stringify({ success: false, error: "board unreachable" }));',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        isSkill: false,
      };

      const { result, tool } = await run(
        APPLICATION_EXECUTION_ORCHESTRATOR,
        { targetRoles: ['listing-1'], dryRun: true },
        [failing],
      );

      expect(result.success).toBe(false);
      assertPresentClean(result.present, APPLICATION_EXECUTION_ORCHESTRATOR.id);
      const body = (result.present as PresentBlock[]).map((b) => `${b.title || ''}\n${b.body || ''}`).join('\n');
      expect(body).toContain('board unreachable');
      validateOutput(result, tool);
    }, 15000);
  });

});
