/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Runtime probe. Not a test — it executes each split Skill through the real
 * ToolExecutor with real config and real persistence, then prints what actually
 * came out.
 *
 * The count-based suites cannot see runtime defects. This can, because it reports
 * the envelope, the rendered text, and the store contents for each Skill.
 *
 * Run: npx tsx scripts/skill-runtime-probe.ts [--only <id>]
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  legalSkills,
  supportSkills,
  educationSkills,
  hrSkills,
  scriptwritingSkills,
  sportsSkills,
  productSkills,
  marketingSkills,
  analyticsSkills,
  investmentSkills,
  healthcareSkills,
  restaurantSkills,
  salesSkills,
} from '../services/tool-executor/src/data/skills';
import { songwriterSkills } from '../services/tool-executor/src/data/skills/creative';
import { ToolExecutor } from '../services/tool-executor/src/services/ToolExecutor';
import { Tool } from '../services/tool-executor/src/types';

const ALL: Tool[] = [
  ...legalSkills,
  ...supportSkills,
  ...educationSkills,
  ...hrSkills,
  ...scriptwritingSkills,
  ...sportsSkills,
  ...productSkills,
  ...marketingSkills,
  ...analyticsSkills,
  ...investmentSkills,
  ...healthcareSkills,
  ...restaurantSkills,
  ...salesSkills,
  ...songwriterSkills,
];

interface Case {
  id: string;
  /** Persisted configuration, as an operator would set it. */
  config?: Record<string, unknown>;
  /** Per-run input. */
  input: Record<string, unknown>;
  /** Store keys to pre-seed, so the Skill has something real to read. */
  seed?: Record<string, unknown>;
  /** Files under the persistence dir to pre-create (key -> raw JSON). */
  seedFiles?: Record<string, unknown>;
  env?: Record<string, string>;
  /** Set false to check the unconfigured path. */
  configured?: boolean;
  /** Why this case exists. */
  note?: string;
}

const STORE = '/tmp/skill-runtime-probe/store';
const PERSIST_ENV: Record<string, string> = {
  LEGAL_HOME: `${STORE}/legal`,
  SUPPORT_HOME: `${STORE}/support`,
  EDUCATION_HOME: `${STORE}/education`,
  HR_HOME: `${STORE}/hr`,
  SCRIPTWRITING_HOME: `${STORE}/scriptwriting`,
  SPORTS_GROUP_B_HOME: `${STORE}/sports`,
  STORAGE_DIR: `${STORE}/default`,
};

const cases: Case[] = [
  // --- legal: user half ---
  {
    id: 'contract-document-advisory-user',
    input: {
      contractText:
        'The Supplier shall indemnify Customer for all consequential damages. Payment is due net-60. Either party may termination of this Agreement with thirty days notice. This Agreement is governed by the laws of California. Confidential information must not be disclosed.',
      contractType: 'msa',
      jurisdiction: 'US-CA',
    },
  },
  // --- legal: scheduled half ---
  {
    id: 'contract-document-advisory-scheduled',
    config: { contractSources: ['contracts-a', 'contracts-b'], tagFilters: ['high-value'], cadence: 'weekly' },
    input: { runReason: 'schedule' },
    seed: {
      'contracts-a': [
        { id: 'c-1', text: 'Vendor indemnifies Buyer for unlimited liability and consequential damages. Payment net-45.', tags: ['high-value'] },
        { id: 'c-2', text: 'Short consulting agreement with no unusual clauses.', tags: ['low-value'] },
      ],
      'contracts-b': { contracts: [{ id: 'c-3', text: 'Governing law is New York. Arbitration required. Force majeure applies.', tags: ['high-value', 'nda'] }] },
    },
  },
  {
    id: 'compliance-tracking-user',
    input: { regulation: 'GDPR', jurisdiction: 'EU', documentText: 'We retain personal data for 90 days.' },
  },
  {
    id: 'compliance-tracking-scheduled',
    config: { sources: ['crm', 'hris'], policySetId: 'policies-2026', scanWindow: 'monthly', notifyOn: ['high'] },
    input: { runReason: 'schedule' },
    seed: { crm: { controls: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }, hris: { controls: [{ id: 'd' }] } },
  },

  // --- support ---
  {
    id: 'response-drafting-user',
    input: { customerMessage: 'My invoice is wrong and I was charged twice.', ticket: 'T-1', tone: 'empathetic', includeKB: true },
    seed: { kb: [{ id: 'kb-1', title: 'Duplicate charge resolution' }], templates: [{ name: 'billing', body: 'Sorry about that.' }] },
  },
  {
    id: 'response-drafting-notifier',
    config: { eventTypes: ['inbound-queue'], targetChannels: ['#support'], templateId: 'billing' },
    input: { runReason: 'schedule' },
    seed: {
      'inbound-queue': [
        { ticket: 'T-9', message: 'Where is my refund?' },
        { ticket: 'T-10' }, // no body -> must be counted as skipped
        'plain string message',
      ],
      kb: [{ id: 'kb-2', title: 'Refund SLA' }],
      templates: [{ name: 'billing', body: 'Happy to help with that.' }],
    },
  },

  // --- education ---
  {
    id: 'education-lesson-assessment-drafting-user',
    input: { task: 'quiz', subject: 'Mathematics', topic: 'Fractions', grade: '5', questionCount: 3, difficulty: 'medium', quizType: 'multiple-choice' },
  },
  {
    id: 'education-lesson-assessment-drafting-user',
    input: { task: 'bogus-task', subject: 'Mathematics', topic: 'Fractions' },
    note: 'unsupported task must fail loudly, not return a bare undefined',
  },
  {
    id: 'education-lesson-assessment-drafting-scheduled',
    config: { courseId: ['course-a', 'course-b', 'course-missing'], gradeLevels: ['5'], cadence: 'weekly' },
    input: { runReason: 'schedule' },
    seed: { 'course-a': { subject: 'Mathematics', grade: '5', topic: 'Fractions' }, 'course-b': { subject: 'Science', grade: '6', topic: 'Cells' } },
  },

  // --- hr ---
  {
    id: 'hr-interview-scheduling-user',
    config: { dryRun: true },
    input: { data: { candidateId: 'cand-1', round: 'technical' } },
  },
  {
    id: 'hr-interview-scheduling-automated',
    config: { calendarId: 'cal-team', roundTypes: ['screen', 'technical'], timeWindowRules: { timezone: 'UTC', durationMinutes: 45 } },
    input: { candidate: { candidateId: 'cand-2', candidateName: 'A. Candidate', roundType: 'technical', interviewers: ['i@x.com'] } },
    note: 'no ATS endpoint configured -> must report not-connected',
  },

  // --- scriptwriting ---
  {
    id: 'scriptwriting-genre-market-evaluator-user',
    input: { genre: 'thriller', script: 'INT. WAREHOUSE - NIGHT\nA figure waits in the dark.', topic: 'a heist', targetFormat: 'film' },
  },
  {
    id: 'scriptwriting-market-report-scheduled',
    config: { genres: ['thriller', 'romance'], regions: ['us', 'uk'], cadence: 'monthly' },
    input: { runReason: 'schedule' },
    seed: {
      projects: [
        { genre: 'thriller', region: 'us' },
        { genre: 'thriller', region: 'uk' },
        { genre: 'romance', region: 'us' },
      ],
    },
  },

  // --- sports ---
  {
    id: 'sports-predictor-ad-hoc',
    input: { event: 'game-1', sport: 'nba', gameStatus: 'in-progress', momentum: 'strong', lineup: { homeAdvantage: true }, playByPlay: [{ scoringTeam: 'home' }, { scoringTeam: 'home' }] },
  },
  {
    id: 'sports-ingame-predictive-modeling-scheduled',
    config: { teams: ['Lakers'], cadence: 'every 5 min' },
    input: { runReason: 'schedule' },
    seed: {
      'live-games': [
        { gameId: 'g-1', sport: 'nba', homeTeam: 'Lakers', awayTeam: 'Celtics', momentum: 'strong', lineup: { homeAdvantage: true } },
        { gameId: 'g-2', sport: 'nba', homeTeam: 'Warriors', awayTeam: 'Suns', momentum: 'weak' },
      ],
      'ingame-predictions': { predictions: [{ gameId: 'g-1', winProbability: 0.4 }] },
    },
  },
  {
    id: 'sports-ingame-predictive-modeling-scheduled',
    configured: false,
    input: { runReason: 'schedule' },
    note: 'no scope configured -> must refuse, not model everything',
  },

  // --- product ---
  {
    id: 'product-data-analysis-user',
    input: { metric: 'activation_rate', dimensions: ['plan'], startDate: '2026-01-01', endDate: '2026-06-30' },
    note: 'no analytics endpoint -> refuses naming a config field, not an env var',
  },
  {
    id: 'product-data-analysis-user',
    config: { baseUrl: 'https://analytics.invalid/v1', apiToken: 'cfg-token' },
    input: { metric: 'activation_rate', dimensions: ['plan'], startDate: '2026-01-01', endDate: '2026-06-30' },
    note: 'configured endpoint -> must actually attempt the call and report the failure honestly',
  },
  {
    id: 'product-insights-scheduled',
    config: { metrics: ['activation_rate', 'retention'], segments: ['pro', 'free'], cadence: 'hourly' },
    input: { runReason: 'schedule' },
    note: 'no analytics endpoint -> must report not-connected',
  },

  // --- marketing ---
  {
    id: 'marketing-analysis-user',
    input: { targetChannel: 'content-generation', data: { topic: 'launch', body: 'draft copy' } },
  },
  {
    id: 'marketing-analysis-user',
    input: { targetChannel: 'not-a-channel' },
    note: 'unknown channel must fail explicitly, not return a bare undefined',
  },
  {
    id: 'marketing-reports-scheduled',
    config: { campaignIds: ['cmp-1', 'cmp-2'], channels: ['email'], reportCadence: 'weekly' },
    input: { runReason: 'schedule' },
  },

  // --- migrated off process.env: config and credentials must now reach the
  // handler. These Skills previously read endpoints and keys straight from the
  // environment, so an operator setting them in config had no effect at all. ---
  {
    id: 'sports-battlecard-creator',
    config: {},
    input: { opponent: 'Celtics', matchupDate: '2026-10-05', team: 'Lakers' },
    note: 'no statsEndpoint configured -> not-connected, never an env-var name',
  },
  {
    id: 'sports-matchup-odds-explainer',
    config: {},
    input: { homeTeam: 'Lakers', awayTeam: 'Celtics' },
    note: 'no oddsEndpoint configured -> not-connected, never an env-var name',
  },
  {
    id: 'sports-scouting-alert-dispatcher',
    config: {},
    input: { prospects: [{ id: 'p-1', name: 'A. Prospect' }] },
    note: 'no wearableEndpoint configured -> not-connected, never an env-var name',
  },
  {
    id: 'investment-market-data',
    config: { endpoint: 'https://markets.invalid/v1' },
    input: { symbols: ['AAPL'], range: '1d' },
    note: 'endpoint from config must be used; failure must name the call, not an env var',
  },
  {
    id: 'analytics-adhoc-query-evaluator',
    config: {},
    input: { runReason: 'schedule' },
    note: 'no endpointUrl configured -> not-connected',
  },
  {
    id: 'hr-assess-candidate',
    config: { defaultEndpoint: 'https://ats.invalid/api', apiKey: 'cfg-key' },
    input: { candidateId: 'cand-1', role: 'engineer' },
    note: 'endpoint + apiKey from config must reach the credential lookup',
  },
  {
    id: 'hr-interview-scheduling-automated',
    config: { calendarId: 'cal-team', endpoint: 'https://ats.invalid/api', apiKey: 'cfg-key' },
    input: { candidate: { candidateId: 'cand-3', candidateName: 'A. Candidate', roundType: 'technical', interviewers: ['i@x.com'] } },
    note: 'configured ATS -> attempts the call and reports the failure honestly',
  },
];

const GLOBAL_STORE = '/tmp/stage7-store';

function resetStore() {
  fs.rmSync(STORE, { recursive: true, force: true });
  // The runtime reads a shared global store as a fallback, so it has to be reset
  // too or each case silently inherits the previous one's state.
  fs.rmSync(GLOBAL_STORE, { recursive: true, force: true });
  for (const dir of Object.values(PERSIST_ENV)) fs.mkdirSync(dir, { recursive: true });
}

function seedStore(skill: Tool, seed: Record<string, unknown>) {
  const envVar = (skill.manifest as { persistenceEnvVar?: string } | undefined)?.persistenceEnvVar ?? 'STORAGE_DIR';
  const dir = PERSIST_ENV[envVar] ?? PERSIST_ENV.STORAGE_DIR;
  const collection = (envVar.replace(/_HOME$/i, '').replace(/^STORAGE_DIR$/i, 'default').toLowerCase() || 'default');
  fs.mkdirSync(dir, { recursive: true });
  for (const [key, value] of Object.entries(seed)) {
    fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(value, null, 2));
  }
}

function readStore(skill: Tool, key: string): unknown {
  const envVar = (skill.manifest as { persistenceEnvVar?: string } | undefined)?.persistenceEnvVar ?? 'STORAGE_DIR';
  const dir = PERSIST_ENV[envVar] ?? PERSIST_ENV.STORAGE_DIR;
  const collection = (envVar.replace(/_HOME$/i, '').replace(/^STORAGE_DIR$/i, 'default').toLowerCase() || 'default');
  const file = path.join(dir, `${key}.json`);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * esbuild (which powers tsx) rewrites named function expressions to
 * `__name(fn, "fn")`. That helper does not exist in the sandbox, so
 * handler.toString() carries a reference the sandbox cannot resolve. The shipped
 * dist is tsc-built and has no such wrapper, so this is purely a harness
 * artifact: supply the shim esbuild's own runtime would supply, rather than
 * rewriting the source and risking a mangled expression.
 */
function shimTool(tool: Tool): Tool {
  const manifest = { ...((tool as any).manifest ?? {}) };
  if (typeof manifest.sourceCode === 'string' && !manifest.sourceCode.startsWith('var __name')) {
    manifest.sourceCode = 'var __name = (fn) => fn;\n' + manifest.sourceCode;
  }
  (tool as any).manifest = manifest;
  return tool;
}

async function run(skill: Tool, c: Case) {
  Object.assign(process.env, PERSIST_ENV);
  for (const [k, v] of Object.entries(c.env ?? {})) process.env[k] = v;

  const tool = JSON.parse(JSON.stringify({ ...skill })) as Tool;
  // Re-attach the live handler/trigger objects that JSON dropped.
  (tool as any).handler = (skill as any).handler;
  (tool as any).triggers = (skill as any).triggers;
  (tool as any).inputSchema = (skill as any).inputSchema;
  (tool as any).outputSchema = (skill as any).outputSchema;
  (tool as any).configSchema = (skill as any).configSchema;
  (tool as any).manifest = { ...(skill as any).manifest };
  // esbuild (which powers tsx) wraps named function expressions in a `__name`
  // helper that does not exist in the sandbox, so handler.toString() carries a
  // reference the sandbox cannot resolve. The shipped dist is tsc-built and has
  // no such wrapper, so this is a harness artifact -- strip it to let the probe
  // reach the Skill's actual logic.
  shimTool(tool);
  if (c.config) (tool as any).externalConfig = c.config;
  else delete (tool as any).externalConfig;

  // Represent-tier Skills refuse to run without an explicit confirmation, so
  // supply one; otherwise the probe measures the gate, not the Skill.
  const finalInput = (tool as any).confirmBeforeSend ? { ...c.input, confirmation: true } : c.input;

  // Register every Skill, not just the one under test: Skills that delegate to
  // lower-order tools can only resolve their callee if it is in the registry, and
  // a single-skill map would report a missing tool where production has one.
  // Shim every Skill, not just the one under test, or a delegated callee fails
  // on the same harness artifact.
  const registry = new Map<string, Tool>(ALL.map((s) => [s.id, shimTool(s)]));
  registry.set(tool.id, tool);
  // External-action Skills delegate to the native api_client tool, which is not a
  // Skill and so is absent from the Skill registry. Without a stub they can only
  // report "tool not available", which proves nothing about whether config and
  // credentials reached the call. This stub records what was actually requested.
  if (!registry.has('api_client')) {
    const stub: any = {
      id: 'api_client',
      name: 'API Client',
      description: 'Probe stub for the native HTTP client',
      type: 'code',
      tier: 'execute',
      inputSchema: {},
      outputSchema: {},
      // A code skill, because dispatch routes handler-less stubs through the code
      // path, which needs real source to run in the sandbox.
      manifest: {
        language: 'javascript',
        sourceCode: `const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
console.log(JSON.stringify({ success: true, status: 200, data: { ok: true, stubbed: true } }));`,
      },
    };
    registry.set('api_client', stub as unknown as Tool);
  }
  const executor = new ToolExecutor(registry);
  const exec = (await executor.execute(tool, finalInput)) as {
    status?: string;
    error?: string | null;
    output?: { output?: string } | string;
  };

  // An external-action Skill returns a structured envelope, while a code Skill
  // returns a JSON string, so normalise both to a string before inspecting it.
  const rawOut = typeof exec.output === 'string' ? exec.output : exec.output?.output;
  const raw = typeof rawOut === 'string' ? rawOut : rawOut === undefined ? undefined : JSON.stringify(rawOut);
  if (process.env.PROBE_DEBUG) console.log('DEBUG raw:', JSON.stringify(String(raw).slice(0, 1200)));
  return { status: exec.status, topError: exec.error, raw };
}

async function main() {
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
  let failures = 0;

  for (const c of cases) {
    if (only && c.id !== only) continue;
    const skill = ALL.find((s) => s.id === c.id);
    if (!skill) {
      console.log(`\n### ${c.id}\n  !! SKILL NOT FOUND`);
      failures++;
      continue;
    }

    resetStore();
    if (c.config) seedStore(skill, c.seed ?? {});
    else if (c.seed) seedStore(skill, c.seed);

    const { status, topError, raw } = await run(skill, c);

    console.log(`\n${'='.repeat(78)}\n### ${c.id}${c.note ? `\n#   case: ${c.note}` : ''}`);
    console.log(`config: ${c.config ? JSON.stringify(c.config) : '(none)'}`);
    console.log(`input:  ${JSON.stringify(c.input)}`);
    console.log(`executor status: ${status}  top-level error: ${topError ?? 'null'}`);

    // A Skill that declares a credential is refused by the executor before its
    // handler ever runs, so there is legitimately no envelope. That refusal is
    // the correct result, not a missing-output defect -- but it still has to
    // name the credential and say where to set it, so check the message rather
    // than waving any failure through.
    if (typeof raw !== 'string') {
      // An external action has no handler branch of its own to report a missing
      // endpoint, so the executor refusing up front is its only guard. Accept it
      // only when the message names a config field rather than an env var.
      if (typeof topError === 'string' && topError.includes('required config fields missing:')) {
        const namesEnvVar = /\b[A-Z][A-Z0-9_]{6,}\b/.test(topError);
        console.log(
          namesEnvVar
            ? `WARN refused for missing config but the message leaks an env var name: ${topError}`
            : `ok  refused for unconfigured external endpoint: ${topError}`
        );
        if (namesEnvVar) failures++;
      } else if (typeof topError === 'string' && topError.includes('requires credentials:')) {
        const saysWhere = /set in this Skill configuration/.test(topError);
        console.log(
          saysWhere
            ? `ok  refused at the credential gate: ${topError}`
            : `WARN refused at the credential gate, but the message does not say where to set it: ${topError}`
        );
        if (!saysWhere) failures++;
      } else {
        console.log('!! NO OUTPUT ENVELOPE AT ALL (Skill returned nothing renderable)');
        failures++;
      }
      continue;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.log(`!! output is not JSON: ${raw.slice(0, 200)}`);
      failures++;
      continue;
    }

    console.log(`envelope.success: ${parsed.success}   envelope.status: ${parsed.status ?? 'n/a'}`);
    if (parsed.error) console.log(`envelope.error: ${String(parsed.error).slice(0, 200)}`);

    const present = Array.isArray(parsed.present) ? parsed.present : [];
    if (!present.length) {
      console.log('!! no rendered output (present is empty)');
    }
    for (const p of present) {
      console.log(`rendered [${p?.id ?? '?'}/${p?.type ?? '?'}]: ${String(p?.text ?? JSON.stringify(p)).slice(0, 300)}`);
    }

    if (c.config) {
      for (const key of ['advisory-sweep', 'compliance-sweep', 'responses', 'drafts', 'scheduling', 'market-reports', 'ingame-predictions']) {
        const stored = readStore(skill, key);
        if (stored !== undefined) {
          const summary = Array.isArray(stored) ? `array(${stored.length})` : JSON.stringify(stored).slice(0, 400);
          console.log(`store[${key}]: ${summary}`);
        }
      }
    }
  }

  console.log(`\n${'='.repeat(78)}`);
  console.log(failures ? `${failures} case(s) produced no usable output` : 'every case produced an envelope');
}

main().catch((e) => {
  console.error('probe crashed:', e);
  process.exit(1);
});
