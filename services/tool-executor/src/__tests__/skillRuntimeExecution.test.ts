import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ToolExecutor } from '../services/ToolExecutor';
import {
  legalSkills,
  supportSkills,
  educationSkills,
  hrSkills,
  scriptwritingSkills,
  sportsSkills,
  productSkills,
  marketingSkills,
} from '../data/skills';
import { Tool } from '../types';

/**
 * Executes every Skill produced by the Class 4 splits and asserts on what comes
 * back. Not on counts, tiers, or ids -- on the actual result.
 *
 * This exists because the count-based suites passed while four of these Skills
 * were completely broken in ways only execution revealed:
 *
 *  - a handler that referenced an imported sibling module returned
 *    `import_contract_risk_rules is not defined`, because the sandbox only has
 *    stage7-runtime available;
 *  - a handler that built an entire evaluation and never returned it produced
 *    "Execution completed with no output";
 *  - a handler that called `ctx.emit(...)` as a function failed, because emit is
 *    an object of formatters;
 *  - a scheduled sweep reported `success: true` while 0 of 2 campaigns
 *    actually reported.
 *
 * Every case below must produce an envelope, and a successful envelope must
 * render something. `undefined is not defined` is asserted explicitly because it
 * is the signature of a name the sandbox cannot resolve.
 */
const ALL: Tool[] = [
  ...legalSkills,
  ...supportSkills,
  ...educationSkills,
  ...hrSkills,
  ...scriptwritingSkills,
  ...sportsSkills,
  ...productSkills,
  ...marketingSkills,
];

interface Case {
  id: string;
  config?: Record<string, unknown>;
  input: Record<string, unknown>;
  seed?: Record<string, unknown>;
  /** The envelope is expected to fail, and to say why in `error`. */
  expectFailure?: RegExp;
}

const PERSIST_ENV: Record<string, string> = {
  LEGAL_HOME: 'legal',
  SUPPORT_HOME: 'support',
  EDUCATION_HOME: 'education',
  HR_HOME: 'hr',
  SCRIPTWRITING_HOME: 'scriptwriting',
  SPORTS_GROUP_B_HOME: 'sports',
  STORAGE_DIR: 'default',
};

const CASES: Case[] = [
  {
    id: 'contract-document-advisory-user',
    input: {
      contractText:
        'The Supplier shall indemnify Customer for all consequential damages. Payment is due net-60. Either party may termination with thirty days notice. Confidential information must not be disclosed.',
      contractType: 'msa',
      jurisdiction: 'US-CA',
    },
  },
  {
    id: 'contract-document-advisory-scheduled',
    config: { contractSources: ['contracts-a'], tagFilters: ['high-value'] },
    input: { runReason: 'schedule' },
    seed: { 'contracts-a': [{ id: 'c-1', text: 'Vendor indemnifies Buyer for unlimited liability.', tags: ['high-value'] }] },
  },
  { id: 'compliance-tracking-user', input: { regulation: 'GDPR', jurisdiction: 'EU' } },
  {
    id: 'compliance-tracking-scheduled',
    config: { sources: ['crm'], policySetId: 'policies' },
    input: { runReason: 'schedule' },
    seed: { crm: { controls: [{ id: 'a' }] } },
  },
  {
    id: 'response-drafting-user',
    input: { customerMessage: 'I was charged twice.', ticket: 'T-1' },
    seed: { kb: [{ id: 'kb-1', title: 'Duplicate charge' }], templates: [{ name: 'billing', body: 'Sorry.' }] },
  },
  {
    id: 'response-drafting-notifier',
    config: { eventTypes: ['inbound-queue'], targetChannels: ['#support'] },
    input: { runReason: 'schedule' },
    // One usable message and one with no readable body, so the skip path runs.
    seed: { 'inbound-queue': [{ ticket: 'T-9', message: 'Where is my refund?' }, { ticket: 'T-10' }] },
  },
  { id: 'education-lesson-assessment-drafting-user', input: { task: 'quiz', subject: 'Maths', topic: 'Fractions' } },
  {
    id: 'education-lesson-assessment-drafting-scheduled',
    config: { courseId: ['course-a'] },
    input: { runReason: 'schedule' },
    seed: { 'course-a': { subject: 'Maths', grade: '5', topic: 'Fractions' } },
  },
  {
    id: 'hr-interview-scheduling-user',
    input: { data: { candidateId: 'c-1' } },
    expectFailure: /not connected|HR_RECRUITING_ENDPOINT/i,
  },
  {
    id: 'hr-interview-scheduling-automated',
    config: { calendarId: 'cal-1' },
    input: { candidate: { candidateId: 'c-2', roundType: 'technical' } },
    expectFailure: /not connected|HR_RECRUITING_ENDPOINT/i,
  },
  { id: 'scriptwriting-genre-market-evaluator-user', input: { genre: 'thriller', script: 'INT. WAREHOUSE - NIGHT', topic: 'a heist' } },
  {
    id: 'scriptwriting-market-report-scheduled',
    config: { genres: ['thriller'] },
    input: { runReason: 'schedule' },
    seed: { projects: [{ genre: 'thriller', region: 'us' }] },
  },
  { id: 'sports-predictor-ad-hoc', input: { event: 'g-1', sport: 'nba', momentum: 'strong' } },
  {
    id: 'sports-ingame-predictive-modeling-scheduled',
    config: { teams: ['Lakers'] },
    input: { runReason: 'schedule' },
    seed: { 'live-games': [{ gameId: 'g-1', sport: 'nba', homeTeam: 'Lakers', awayTeam: 'Celtics', momentum: 'strong' }] },
  },
  {
    id: 'sports-ingame-predictive-modeling-scheduled',
    input: { runReason: 'schedule' },
    // Same Skill, no scope: it must refuse rather than model everything.
    expectFailure: /no scope configured/i,
  },
  { id: 'product-data-analysis-user', input: { metric: 'activation' }, expectFailure: /not connected|config/i },
  { id: 'product-insights-scheduled', config: { metrics: ['activation'] }, input: { runReason: 'schedule' }, expectFailure: /not connected|PRODUCT_ANALYTICS_API_URL/i },
  { id: 'marketing-analysis-user', input: { targetChannel: 'not-a-channel' }, expectFailure: /unknown targetChannel/i },
  { id: 'marketing-reports-scheduled', config: { campaignIds: ['cmp-1'] }, input: { runReason: 'schedule' }, expectFailure: /no report|not connected|config/i },
];

const GLOBAL_STORE = '/tmp/stage7-store';

function persistenceDir(envVar: string | undefined): string {
  const key = envVar && PERSIST_ENV[envVar] ? envVar : 'STORAGE_DIR';
  return path.join(TEST_ROOT, PERSIST_ENV[key]);
}

let TEST_ROOT = '';

function seed(dir: string, seedData: Record<string, unknown> | undefined) {
  if (!seedData) return;
  fs.mkdirSync(dir, { recursive: true });
  for (const [k, v] of Object.entries(seedData)) fs.writeFileSync(path.join(dir, `${k}.json`), JSON.stringify(v));
}

function shim(tool: Tool): Tool {
  // esbuild (tsx/vitest) rewrites named function expressions to __name(fn,...).
  // The shipped build is tsc and has no such wrapper, so supply the helper the
  // sandbox is missing rather than leaving an unresolvable reference.
  const manifest = { ...((tool as { manifest?: Record<string, unknown> })?.manifest ?? {}) };
  if (typeof manifest.sourceCode === 'string' && !manifest.sourceCode.startsWith('var __name')) {
    manifest.sourceCode = 'var __name = (fn) => fn;\n' + manifest.sourceCode;
  }
  (tool as { manifest?: unknown }).manifest = manifest;
  return tool;
}

async function execute(c: Case): Promise<{ topStatus?: string; topError?: string | null; raw?: string }> {
  // Copy the Skill rather than mutating the registry's instance. Two cases for
  // the same Skill (a scoped run and an unscoped one) would otherwise share
  // externalConfig, and the second would silently inherit the first's config.
  const original = ALL.find((s) => s.id === c.id)!;
  const skill = { ...original } as Tool;
  (skill as { handler?: unknown }).handler = (original as { handler?: unknown }).handler;
  (skill as { triggers?: unknown }).triggers = (original as { triggers?: unknown }).triggers;
  (skill as { inputSchema?: unknown }).inputSchema = (original as { inputSchema?: unknown }).inputSchema;
  (skill as { outputSchema?: unknown }).outputSchema = (original as { outputSchema?: unknown }).outputSchema;
  (skill as { configSchema?: unknown }).configSchema = (original as { configSchema?: unknown }).configSchema;
  shim(skill);
  delete (skill as { externalConfig?: unknown }).externalConfig;
  const envVar = (skill.manifest as { persistenceEnvVar?: string } | undefined)?.persistenceEnvVar ?? 'STORAGE_DIR';
  const dir = persistenceDir(envVar);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(GLOBAL_STORE, { recursive: true, force: true });
  seed(dir, c.seed);
  if (c.config) (skill as unknown as { externalConfig?: unknown }).externalConfig = c.config;

  const registry = new Map<string, Tool>(ALL.map((s) => [s.id, shim({ ...s } as Tool)]));
  registry.set(skill.id, skill);
  const executor = new ToolExecutor(registry);

  const input = (skill as unknown as { confirmBeforeSend?: boolean }).confirmBeforeSend
    ? { ...c.input, confirmation: true }
    : c.input;

  const result = (await executor.execute(skill, input)) as {
    status?: string;
    error?: string | null;
    output?: { output?: string } | string;
  };
  const raw = typeof result.output === 'string' ? result.output : result.output?.output;
  return { topStatus: result.status, topError: result.error, raw };
}

beforeAll(() => {
  TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-exec-'));
  for (const [k, v] of Object.entries(PERSIST_ENV)) process.env[k] = path.join(TEST_ROOT, v);
});

afterAll(() => {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  fs.rmSync(GLOBAL_STORE, { recursive: true, force: true });
});

describe('Split Skills produce real output when executed', () => {
  it('every case refers to a Skill that exists', () => {
    for (const c of CASES) {
      expect(ALL.some((s) => s.id === c.id)).toBe(true);
    }
  });

  it.each(CASES.map((c) => [c.id, c.expectFailure, c] as const))(
    '%s returns an envelope with no unresolved names',
    async (_id, expectFailure, c) => {
      const { topStatus, topError, raw } = await execute(c);

      // A bare `{status, error}` with no envelope is the config-gate path. It is
      // only acceptable where the case expects to fail.
      if (typeof raw !== 'string') {
        if (expectFailure) {
          expect(topError ?? '').toMatch(expectFailure);
          return;
        }
        throw new Error(`${c.id} produced no output envelope (status=${topStatus}, error=${topError})`);
      }

      // The signature of a name the sandbox could not resolve.
      expect(raw).not.toMatch(/\bis not defined\b/);
      expect(raw).not.toMatch(/\bundefined is not\b/);

      let envelope: Record<string, unknown>;
      try {
        envelope = JSON.parse(raw);
      } catch {
        throw new Error(`${c.id} output is not JSON: ${raw.slice(0, 200)}`);
      }

      if (expectFailure) {
        expect(String(envelope.error ?? '')).toMatch(expectFailure);
        return;
      }

      expect(envelope.success).toBe(true);

      // A success with nothing rendered is the "completed but the user sees an
      // empty panel" failure.
      const present = envelope.present as Array<{ body?: unknown }> | undefined;
      expect(Array.isArray(present)).toBe(true);
      expect(present!.length).toBeGreaterThan(0);
      expect(String(present![0].body ?? '').length).toBeGreaterThan(0);
    },
  );
});
