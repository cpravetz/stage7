import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ToolExecutor } from '../services/ToolExecutor';
import { Tool } from '../types';
import { CAREER_RANK } from '../data/skills/career';

/**
 * A job search ranks roles against the terms it searched for.
 *
 * The scorer used to give every axis a flat 0.5 whenever the profile had nothing to
 * say about it, and it only ever read the saved profile rather than the search itself.
 * With role and location filled in and nothing else, every listing therefore summed to
 * the same 0.57 - a customer service rep, an HR specialist, a marketing advisor and
 * an engineering role all came back indistinguishable. The role axis is now weighted
 * heaviest and scored against the searched terms, so the rating means something and an
 * off-target posting is held back instead of being presented as a result.
 */

interface RankRow {
  id: string;
  title: string;
  score: number;
  roleScore: number;
  roleMatch: string | null;
  relevance: string;
  weightedBreakdown: Record<string, number>;
}

interface RankOutput {
  success?: boolean;
  data?: {
    ranked?: RankRow[];
    droppedOffTarget?: Array<{ id: string; title: string }>;
    droppedOffTargetCount?: number;
    roleQueries?: string[];
    weights?: Record<string, number>;
  };
}

const LISTINGS = [
  {
    id: 'job-eng-mgr',
    title: 'Engineering Manager, Platform',
    company: 'Acme',
    remote: true,
    location: 'Remote - EU',
    applyUrl: 'https://acme.example.com/apply/eng-mgr',
    description: 'Lead a distributed engineering team. You will partner with product on delivery.',
  },
  {
    id: 'job-dotnet',
    title: 'Senior .NET Software Engineer',
    company: 'Acme',
    remote: false,
    location: 'London',
    applyUrl: 'https://acme.example.com/apply/dotnet',
    description: 'Build and maintain .NET services.',
  },
  {
    id: 'job-csr',
    title: 'Japanese Speaking Customer Service Rep',
    company: 'Beta',
    remote: false,
    location: 'Tokyo',
    applyUrl: 'https://beta.example.com/apply/csr',
    // This is how an unrelated posting gets past board search at all: the query terms
    // appear once in a boilerplate reporting line, not in the role.
    description: 'Handle inbound Japanese speaking customers. Reporting line to the Engineering Manager.',
  },
  {
    id: 'job-hr',
    title: 'HR Operations Specialist',
    company: 'Beta',
    remote: true,
    location: 'Remote',
    applyUrl: 'https://beta.example.com/apply/hr',
    description: 'Own HR operations and onboarding paperwork.',
  },
  {
    id: 'job-marketing',
    title: 'Senior Marketing Advisor',
    company: 'Gamma',
    remote: false,
    location: 'Berlin',
    applyUrl: 'https://gamma.example.com/apply/marketing',
    description: 'Grow marketing pipeline and advise on brand.',
  },
];

const priorCareerHome = process.env.CAREER_HOME;
let careerHome: string;

// The two fields the search was actually run with: a target role and remote-only.
const SEARCH_PROFILE = {
  id: 'default',
  targetTitles: [],
  preferences: {
    targetRoles: ['Engineering Manager'],
    targetCompanies: [],
    industries: [],
    workArrangement: ['remote'],
    minSalary: 0,
    maxSalary: 0,
    locations: [],
    excludeCompanies: [],
    keywords: [],
  },
};

function writeProfile(profile: unknown): void {
  fs.writeFileSync(path.join(careerHome, 'profilePath.json'), JSON.stringify(profile));
}

beforeAll(() => {
  careerHome = fs.mkdtempSync(path.join(os.tmpdir(), 'career-rank-home-'));
  process.env.CAREER_HOME = careerHome;
});

beforeEach(() => writeProfile(SEARCH_PROFILE));

afterAll(() => {
  if (priorCareerHome === undefined) delete process.env.CAREER_HOME;
  else process.env.CAREER_HOME = priorCareerHome;
  try {
    fs.rmSync(careerHome, { recursive: true, force: true });
  } catch {
    // best effort
  }
});

async function rank(input: Record<string, unknown>): Promise<RankOutput> {
  const registry = new Map<string, Tool>([[CAREER_RANK.id, CAREER_RANK]]);
  const exec = await new ToolExecutor(registry).execute(CAREER_RANK, input);
  const stdout = (exec.output as { output?: string } | undefined)?.output;
  if (typeof stdout !== 'string') {
    throw new Error(`career-rank produced no stdout. error=${String(exec.error).slice(0, 400)}`);
  }
  return JSON.parse(stdout) as RankOutput;
}

describe('job fit ranking is graded against the searched role', () => {
  it('weights role most heavily', async () => {
    const out = await rank({ items: LISTINGS, jobTitles: ['Engineering Manager'] });
    const weights = out.data!.weights!;
    const others = Object.keys(weights).filter((k) => k !== 'role');
    for (const axis of others) {
      expect(weights.role).toBeGreaterThan(weights[axis]);
    }
  });

  it('does not give every listing the same rating', async () => {
    const out = await rank({ items: LISTINGS, jobTitles: ['Engineering Manager'] });
    const scores = new Set((out.data!.ranked || []).map((r) => r.score));
    expect(scores.size).toBeGreaterThan(1);
  });

  it('ranks the searched role above the unrelated postings', async () => {
    const out = await rank({ items: LISTINGS, jobTitles: ['Engineering Manager'] });
    const ranked = out.data!.ranked || [];
    expect(ranked[0].title).toBe('Engineering Manager, Platform');
    expect(ranked[0].relevance).toBe('on-target');

    const byId = new Map(ranked.map((r) => [r.id, r]));
    // A near miss is graded as adjacent, not as a match and not as noise.
    expect(byId.get('job-dotnet')!.relevance).toBe('adjacent');
  });

  it('holds back postings whose title is a different role entirely', async () => {
    const out = await rank({ items: LISTINGS, jobTitles: ['Engineering Manager'] });
    const keptIds = (out.data!.ranked || []).map((r) => r.id);
    const droppedIds = (out.data!.droppedOffTarget || []).map((r) => r.id);

    expect(keptIds).not.toContain('job-csr');
    expect(keptIds).not.toContain('job-hr');
    expect(keptIds).not.toContain('job-marketing');
    expect(droppedIds).toEqual(expect.arrayContaining(['job-csr', 'job-hr', 'job-marketing']));
    expect(out.data!.droppedOffTargetCount).toBe(3);
  });

  it('returns everything when the caller asks to see off-target postings', async () => {
    const out = await rank({ items: LISTINGS, jobTitles: ['Engineering Manager'], minRoleScore: 0 });
    expect((out.data!.ranked || []).length).toBe(LISTINGS.length);
    expect(out.data!.droppedOffTargetCount).toBe(0);
  });

  it('scores remote and on-site postings differently', async () => {
    const out = await rank({ items: LISTINGS, jobTitles: ['Engineering Manager'], minRoleScore: 0 });
    const byId = new Map((out.data!.ranked || []).map((r) => [r.id, r]));
    // workArrangement is ['remote'] only, so an on-site role cannot score full marks
    // for location. It used to, because the default list always contained 'remote'.
    const remoteLocation = byId.get('job-eng-mgr')!.weightedBreakdown.location;
    const onsiteLocation = byId.get('job-marketing')!.weightedBreakdown.location;
    expect(remoteLocation).toBeGreaterThan(onsiteLocation);
  });

  it('does not silently score zero when there is no target salary range', async () => {
    const out = await rank({
      items: [{ id: 'paid', title: 'Engineering Manager', company: 'Acme', salary: { min: 120000, max: 150000 } }],
      jobTitles: ['Engineering Manager'],
      minRoleScore: 0,
    });
    // No range is configured, so salary is unknown rather than a failed match. The
    // old range math divided an overlap by Infinity and scored it 0.
    expect(out.data!.ranked![0].weightedBreakdown.salary).toBeGreaterThan(0);
  });

  it('keeps runs unrestrained when neither the search nor the profile names a role', async () => {
    // With nothing to judge a listing against, "off target" is meaningless, so the
    // floor must not start removing results.
    writeProfile({ id: 'default', targetTitles: [], preferences: {} });
    const out = await rank({ items: LISTINGS });
    expect((out.data!.ranked || []).length).toBe(LISTINGS.length);
    expect(out.data!.droppedOffTargetCount).toBe(0);
  });

  it('ranks against saved profile target roles when no title was searched', async () => {
    // The saved profile is a source of role terms too, so a profile-only run is still
    // graded on role rather than left unscored.
    const out = await rank({ items: LISTINGS });
    const byId = new Map((out.data!.ranked || []).map((r) => [r.id, r]));
    expect(out.data!.roleQueries).toEqual(['engineering manager']);
    expect(byId.get('job-eng-mgr')!.relevance).toBe('on-target');
  });
});