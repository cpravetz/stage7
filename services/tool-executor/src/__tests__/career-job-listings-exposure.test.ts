import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ToolExecutor } from '../services/ToolExecutor';
import { Tool } from '../types';
import { CAREER_JOB_DISCOVERY, CAREER_RANK, JOB_DISCOVERY_FIT_RANKING, CAREER_APPLY_EXECUTE } from '../data/skills/career';

/**
 * The postings a job search found must be reachable as postings, not only as a count.
 *
 * Two links in that chain are covered here:
 *
 *  - the wrapper that searches and ranks presents the ranked roles as links, so the
 *    result is the roles themselves rather than a tally of roles;
 *  - the skill that applies to a chosen role resolves that role out of the stored
 *    listings file, which discovery writes as an object envelope. Reading it as a bare
 *    array threw on every call, so no posting a search found could ever be applied to.
 *
 * The network is stubbed exactly as in career-job-discovery-ledger.test.ts: discovery
 * hardcodes its feed URLs, so the only seam is a fetch interceptor preloaded into the
 * spawned child through NODE_OPTIONS.
 */

const INTERCEPT_PRELOAD = path.join(__dirname, 'fixtures', 'job-board-fetch-intercept.cjs');

const REMOTEOK_WITH_CARDS = JSON.stringify([
  { legal: 'RemoteOK API terms' },
  { id: 90001, position: 'Senior Platform Engineer', company_name: 'Alpha Analytics', location: 'Worldwide', date: '2026-09-20T10:00:00Z', url: 'https://remoteok.com/remote-jobs-alpha-1', apply_url: 'https://alpha.example.com/apply/1', description: 'Build platforms' },
  { id: 90002, position: 'Staff Site Reliability Engineer', company_name: 'Beta Robotics', location: 'Remote - EU', date: '2026-09-21T10:00:00Z', url: 'https://remoteok.com/remote-jobs-beta-2', apply_url: 'https://beta.example.com/apply/2', description: 'Keep systems up' },
]);

const REMOTEOK_EMPTY = JSON.stringify([{ legal: 'RemoteOK API terms' }]);

const REMOTIVE_EMPTY = JSON.stringify({ jobs: [] });
const ARBEITNOW_EMPTY = JSON.stringify({ data: [] });
const JOBICY_EMPTY = JSON.stringify({ jobs: [] });
const WWR_EMPTY = '<?xml version="1.0"?><rss version="2.0"><channel><title>We Work Remotely</title></channel></rss>';
const HIMALAYAS_EMPTY = '<?xml version="1.0"?><rss version="2.0"><channel><title>Himalayas</title></channel></rss>';

const BOARD_ROUTES = [
  { urlPrefix: 'https://remoteok.com/api', body: REMOTEOK_WITH_CARDS },
  { urlPrefix: 'https://remotive.com/api/remote-jobs', body: REMOTIVE_EMPTY },
  { urlPrefix: 'https://www.arbeitnow.com/api/job-board-api', body: ARBEITNOW_EMPTY },
  { urlPrefix: 'https://jobicy.com/api/v2/remote-jobs', body: JOBICY_EMPTY },
  { urlPrefix: 'https://weworkremotely.com/remote-jobs.rss', body: WWR_EMPTY },
  { urlPrefix: 'https://himalayas.app/jobs/rss', body: HIMALAYAS_EMPTY },
];

const priorNodeOptions = process.env.NODE_OPTIONS;
const priorRoutes = process.env.CAREER_TEST_FETCH_ROUTES;
const priorFetchLog = process.env.CAREER_TEST_FETCH_LOG;
const priorCareerHome = process.env.CAREER_HOME;

let careerHome: string;

beforeAll(() => {
  careerHome = fs.mkdtempSync(path.join(os.tmpdir(), 'career-listings-home-'));
  process.env.CAREER_HOME = careerHome;
  const requireFlag = `--require ${INTERCEPT_PRELOAD}`;
  process.env.NODE_OPTIONS = priorNodeOptions ? `${priorNodeOptions} ${requireFlag}` : requireFlag;
  if (!fs.existsSync(INTERCEPT_PRELOAD)) {
    throw new Error(`Missing fetch interceptor preload at ${INTERCEPT_PRELOAD}`);
  }
  process.env.CAREER_TEST_FETCH_LOG = path.join(careerHome, 'fetch.log');
  fs.writeFileSync(process.env.CAREER_TEST_FETCH_LOG, '');
  process.env.CAREER_TEST_FETCH_ROUTES = Buffer.from(JSON.stringify(BOARD_ROUTES), 'utf8').toString('base64');
});

afterAll(() => {
  for (const [key, value] of [
    ['NODE_OPTIONS', priorNodeOptions],
    ['CAREER_TEST_FETCH_ROUTES', priorRoutes],
    ['CAREER_TEST_FETCH_LOG', priorFetchLog],
    ['CAREER_HOME', priorCareerHome],
  ] as Array<[string, string | undefined]>) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fs.rmSync(careerHome, { recursive: true, force: true });
  } catch {
    // best effort
  }
});

interface WrapperOutput {
  success?: boolean;
  status?: string;
  error?: string | null;
  data?: { ranked?: Array<Record<string, unknown>>; total?: number };
  present?: Array<{
    id: string;
    title?: string;
    body: string;
    links?: Array<{ label: string; url: string; detail?: string }>;
  }>;
}

async function runTool(tool: Tool, input: Record<string, unknown>): Promise<WrapperOutput> {
  const registry = new Map<string, Tool>();
  for (const t of [CAREER_JOB_DISCOVERY, CAREER_RANK, JOB_DISCOVERY_FIT_RANKING, CAREER_APPLY_EXECUTE]) {
    registry.set(t.id, t);
  }
  const exec = await new ToolExecutor(registry).execute(tool, input);
  const output = exec.output as { output?: string } | undefined;
  if (typeof output?.output !== 'string') {
    throw new Error(`${tool.id} produced no stdout. error=${String(exec.error).slice(0, 300)}`);
  }
  return JSON.parse(output.output) as WrapperOutput;
}

describe('job postings are exposed as postings, not only as a count', () => {
  it('presents every ranked role as a link to its posting', async () => {
    const out = await runTool(JOB_DISCOVERY_FIT_RANKING, { jobTitles: ['Engineer'] });

    expect(out.success).toBe(true);
    const ranked = out.data!.ranked || [];
    expect(ranked.length).toBeGreaterThan(0);

    const block = (out.present || []).find((b) => b.id === 'ranked-listings');
    expect(block).toBeDefined();

    const links = block!.links || [];
    expect(links).toHaveLength(ranked.length);
    for (const link of links) {
      expect(String(link.url)).toMatch(/^https:\/\//);
    }

    // Labeled by role, with the employer and the fit score the ranking assigned, so the
    // list is the ranking rather than a flat set of postings.
    const alpha = links.find((l) => String(l.label) === 'Senior Platform Engineer');
    expect(alpha).toBeDefined();
    expect(String(alpha!.url)).toBe('https://alpha.example.com/apply/1');
    expect(String(alpha!.detail)).toContain('Alpha Analytics');
    expect(String(alpha!.detail)).toMatch(/fit \d/);
  }, 60000);

  it('resolves a chosen posting out of the stored listings file discovery wrote', async () => {
    const out = await runTool(JOB_DISCOVERY_FIT_RANKING, { jobTitles: ['Engineer'] });
    const ranked = (out.data!.ranked || []) as Array<{ id: string; title: string }>;
    expect(ranked.length).toBeGreaterThan(0);

    // discovery writes { listings, total, byBoard, failures } — an object, not an array.
    const stored = JSON.parse(fs.readFileSync(path.join(careerHome, 'listings', 'default.json'), 'utf8'));
    expect(Array.isArray(stored)).toBe(false);
    expect(Array.isArray(stored.listings)).toBe(true);

    const applyOut = await runTool(CAREER_APPLY_EXECUTE, {
      listings: [ranked[0].id],
      dryRun: true,
    }) as WrapperOutput & {
      data?: { applications?: Array<{ identifier: string; job?: { title?: string; company?: string } }>; errors?: unknown[] };
    };

    expect(applyOut.data!.errors).toEqual([]);
    expect(applyOut.data!.applications).toHaveLength(1);
    expect(applyOut.data!.applications![0].identifier).toBe(ranked[0].id);
    expect(applyOut.data!.applications![0].job!.title).toBe(ranked[0].title);
  }, 60000);
});
