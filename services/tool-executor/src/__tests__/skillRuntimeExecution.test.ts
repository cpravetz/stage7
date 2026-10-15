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
  brainResponses?: Array<Record<string, unknown>>;
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
  {
    id: 'education-lesson-assessment-drafting-user',
    input: { task: 'quiz', subject: 'Maths', grade: '5', topic: 'Fractions', questionCount: 10 },
    brainResponses: [generatedQuizResponse(10), quizReviewResponse(true)],
  },
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
  { id: 'marketing-campaign-execution-orchestrator', input: {}, expectFailure: /request|required/i },
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

function generatedQuizResponse(questionCount: number): Record<string, unknown> {
  const questions = Array.from({ length: questionCount }, (_, index) => {
    const number = index + 1;
    const isMultipleChoice = index % 2 === 0;
    return {
      number,
      type: isMultipleChoice ? 'multiple-choice' : 'short-answer',
      bloomLevel: number < 3 ? 'Understand' : 'Apply',
      stem: isMultipleChoice
        ? `Which fraction is equivalent to ${number}/2?`
        : `Explain how to find a fraction equivalent to ${number}/2.`,
      ...(isMultipleChoice ? {
        choices: [
          { label: 'A', text: `${number * 2}/3` },
          { label: 'B', text: `${number * 2}/4` },
          { label: 'C', text: `${number}/3` },
          { label: 'D', text: `${number + 2}/2` },
        ],
      } : {}),
      points: isMultipleChoice ? 2 : 5,
    };
  });
  const answerKey = questions.map((question, index) => ({
    number: index + 1,
    answer: question.type === 'multiple-choice'
      ? (index % 2 === 0 ? 'B' : 'A')
      : 'Multiply the numerator and denominator by the same non-zero number.',
    rationale: 'Equivalent fractions represent the same value.',
  }));
  return { content: JSON.stringify({ questions, answerKey }) };
}

function generatedQuizWithoutPointsResponse(questionCount: number): Record<string, unknown> {
  const response = generatedQuizResponse(questionCount);
  const content = JSON.parse(String(response.content)) as {
    questions: Array<Record<string, unknown>>;
  };
  content.questions.forEach((question) => delete question.points);
  return { content: JSON.stringify(content) };
}

function teacherVersionAnswerKeyResponse(questionCount: number): Record<string, unknown> {
  const response = generatedQuizResponse(questionCount);
  const content = JSON.parse(String(response.content)) as {
    answerKey: Array<{ answer: string }>;
  };
  content.answerKey[0]!.answer = 'Available in teacher version';
  return { content: JSON.stringify(content) };
}

function quizReviewResponse(valid: boolean, issues: string[] = []): Record<string, unknown> {
  return { content: JSON.stringify({ valid, issues }) };
}

function incorrectShortAnswerQuizResponse(questionCount: number): Record<string, unknown> {
  const response = generatedQuizResponse(questionCount);
  const content = JSON.parse(String(response.content)) as {
    answerKey: Array<{ answer: string }>;
  };
  content.answerKey[1]!.answer = 'Bananas';
  return { content: JSON.stringify(content) };
}

function mathematicallyIncorrectFractionsQuizResponse(): Record<string, unknown> {
  return {
    content: JSON.stringify({
      questions: [
        {
          number: 1,
          type: 'multiple-choice',
          stem: 'Which of the following fractions is equal to 3/4 when added to 5/6?',
          choices: [
            { label: 'A', text: '1/3' },
            { label: 'B', text: '2/3' },
            { label: 'C', text: '1/2' },
            { label: 'D', text: '5/12' },
          ],
          points: 2,
        },
        {
          number: 2,
          type: 'short-answer',
          stem: 'Write an equation to represent the addition of 2/3 and 3/5.',
          points: 2,
        },
        {
          number: 3,
          type: 'multiple-choice',
          stem: 'Which fraction is equivalent to 7/8 when simplified?',
          choices: [
            { label: 'A', text: '9/10' },
            { label: 'B', text: '7/8' },
            { label: 'C', text: '5/6' },
            { label: 'D', text: '3/4' },
          ],
          points: 2,
        },
        {
          number: 4,
          type: 'short-answer',
          stem: 'Compare the fractions 11/15 and 7/10. Which fraction is larger, and by how many parts per hundred does it exceed the other?',
          points: 2,
        },
      ],
      answerKey: [
        {
          number: 1,
          answer: 'D',
          rationale: 'Adding these gives 19/12, which is equal to 5/12 when simplified.',
        },
        {
          number: 2,
          answer: 'The equation is 3/5 + 2/3.',
          rationale: 'The least common denominator is 15, so 9/15 + 10/15 = 19/15.',
        },
        {
          number: 3,
          answer: 'B',
          rationale: '7/8 becomes 75/100, and 7/8 is already 70/100.',
        },
        {
          number: 4,
          answer: '7/10 is larger by 3 parts per hundred.',
          rationale: '11/15 becomes 66.67/100, and 7/10 is exactly 70/100.',
        },
      ],
    }),
  };
}

function ambiguousFractionChoicesQuizResponse(valid: boolean): Record<string, unknown> {
  const questions = [
    {
      number: 1,
      type: 'multiple-choice',
      stem: 'Which fraction is equivalent to 1/2?',
      choices: valid
        ? [
        { label: 'A', text: '2/4' },
        { label: 'B', text: '2/3' },
        { label: 'C', text: '3/5' },
        { label: 'D', text: '1/3' },
        ]
        : [
        { label: 'A', text: '1/2' },
        { label: 'B', text: '2/4' },
        { label: 'C', text: '3/6' },
        { label: 'D', text: '4/8' },
        ],
      points: 1,
    },
    {
      number: 2,
      type: 'multiple-choice',
      stem: 'What is the product of 2/3 and 7/8?',
      choices: valid
        ? [
          { label: 'A', text: '5/16' },
          { label: 'B', text: '7/12' },
          { label: 'C', text: '4/9' },
          { label: 'D', text: '3/10' },
        ]
        : [
          { label: 'A', text: '5/16' },
          { label: 'B', text: '7/12' },
          { label: 'C', text: '14/24' },
          { label: 'D', text: '3/10' },
        ],
      points: 1,
    },
    {
      number: 3,
      type: 'multiple-choice',
      stem: 'If 5/6 of a whole is equal to 10, what is the whole?',
      choices: [
        { label: 'A', text: '12' },
        { label: 'B', text: '15' },
        { label: 'C', text: '18' },
        { label: 'D', text: '20' },
      ],
      points: 1,
    },
    {
      number: 4,
      type: 'multiple-choice',
      stem: 'Compare 7/8 and 2/3. Which fraction is greater?',
      choices: [
        { label: 'A', text: '7/8' },
        { label: 'B', text: '2/3' },
        { label: 'C', text: '1/2' },
        { label: 'D', text: '1/3' },
      ],
      points: 1,
    },
  ];
  const answerKey = [
    {
      number: 1,
      answer: 'A',
      rationale: valid
        ? '2/4 simplifies to 1/2, while the other options are not equivalent to 1/2.'
        : 'All four choices are equivalent to 1/2.',
    },
    {
      number: 2,
      answer: 'B',
      rationale: valid
        ? '2/3 * 7/8 = 14/24 = 7/12.'
        : 'Multiplying numerator and denominator gives 7*2/3*8 = 14/6, then 7/3 = 7/12.',
    },
    {
      number: 3,
      answer: 'A',
      rationale: '10 divided by 5/6 is 12, so the whole group contains 12 items.',
    },
    {
      number: 4,
      answer: 'A',
      rationale: '7/8 is greater than 2/3.',
    },
  ];
  return { content: JSON.stringify({ questions, answerKey }) };
}

async function execute(c: Case): Promise<{
  topStatus?: string;
  topError?: string | null;
  raw?: string;
  outputSchemaIssues?: unknown[];
}> {
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

  const originalFetch = global.fetch;
  if (c.brainResponses) {
    let responseIndex = 0;
    global.fetch = jest.fn(async () => {
      const response = c.brainResponses![responseIndex++];
      if (!response) throw new Error('No mocked Brain response remains');
      return {
        ok: true,
        json: async () => response,
      } as Response;
    });
  }

  let result: {
    status?: string;
    error?: string | null;
    output?: { output?: string; outputSchemaIssues?: unknown[] } | string;
  };
  try {
    result = (await executor.execute(skill, input)) as typeof result;
  } finally {
    global.fetch = originalFetch;
  }
  const raw = typeof result.output === 'string' ? result.output : result.output?.output;
  return {
    topStatus: result.status,
    topError: result.error,
    raw,
    outputSchemaIssues: typeof result.output === 'string' ? [] : result.output?.outputSchemaIssues,
  };
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

      expect(envelope.error).toBeUndefined();
      expect(envelope.success).toBe(true);

      // A success with nothing rendered is the "completed but the user sees an
      // empty panel" failure.
      const present = envelope.present as Array<{ body?: unknown }> | undefined;
      expect(Array.isArray(present)).toBe(true);
      expect(present!.length).toBeGreaterThan(0);
      expect(String(present![0].body ?? '').length).toBeGreaterThan(0);
    },
  );

  it('generates a complete quiz with contiguous numbering and a matching answer key', async () => {
    const quizCase = CASES.find((c) => c.id === 'education-lesson-assessment-drafting-user')!;
    const { raw, outputSchemaIssues } = await execute(quizCase);
    const envelope = JSON.parse(raw!) as {
      success: boolean;
      error?: string | null;
      data: { draft: { quiz: { questionCount: number; questions: Array<{ number: number; type: string; stem: string; choices?: unknown[] }>; answerKey: Array<{ number: number; answer: string; rationale: string }> } } };
    };
    const quiz = envelope.data.draft.quiz;

    expect(envelope.success).toBe(true);
    expect(envelope.error).toBeUndefined();
    expect(outputSchemaIssues ?? []).toEqual([]);
    expect(quiz.questions).toHaveLength(10);
    expect(quiz.questions.map((question) => question.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const placeholderPattern = /\.\.\.|\[[^\]]+\]|\b(?:placeholder|todo|tbd)\b|\bavailable in (?:the )?teacher (?:version|key)\b|\bsee (?:the )?teacher(?:'s)? (?:version|key)\b|\bprovided separately\b/i;
    expect(quiz.questions.every((question) => !placeholderPattern.test(question.stem))).toBe(true);
    expect(quiz.answerKey).toHaveLength(10);
    expect(quiz.answerKey.map((entry) => entry.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(quiz.answerKey.every((entry) =>
      entry.answer.trim()
      && entry.rationale.trim()
      && !placeholderPattern.test(entry.answer)
      && !placeholderPattern.test(entry.rationale),
    )).toBe(true);
    for (const [index, question] of quiz.questions.entries()) {
      if (question.type !== 'multiple-choice') continue;
      const choices = question.choices as Array<{ label: string; text: string }>;
      expect(choices.map((choice) => choice.label)).toEqual(['A', 'B', 'C', 'D']);
      expect(new Set(choices.map((choice) => choice.text.trim().toLowerCase())).size).toBe(4);
      expect(choices.map((choice) => choice.label)).toContain(quiz.answerKey[index]?.answer);
    }
  });

  it('assigns the default one-point value when generated questions omit points', async () => {
    const quizCase = CASES.find((c) => c.id === 'education-lesson-assessment-drafting-user')!;
    const { raw } = await execute({
      ...quizCase,
      input: { ...quizCase.input, questionCount: 2 },
      brainResponses: [
        generatedQuizWithoutPointsResponse(2),
        quizReviewResponse(true),
      ],
    });
    const envelope = JSON.parse(raw!) as {
      success: boolean;
      data: { draft: { quiz: { questions: Array<{ points: number }> } } };
    };

    expect(envelope.success).toBe(true);
    expect(envelope.data.draft.quiz.questions.map((question) => question.points)).toEqual([1, 1]);
  });

  it('repairs an incomplete teacher-version answer key before storing the quiz', async () => {
    const quizCase = CASES.find((c) => c.id === 'education-lesson-assessment-drafting-user')!;
    const { raw, outputSchemaIssues } = await execute({
      ...quizCase,
      brainResponses: [
        teacherVersionAnswerKeyResponse(10),
        generatedQuizResponse(10),
        quizReviewResponse(true),
      ],
    });
    const envelope = JSON.parse(raw!) as {
      success: boolean;
      data: { draft: { quiz: { answerKey: Array<{ answer: string }> } } };
    };

    expect(envelope.success).toBe(true);
    expect(envelope.data.draft.quiz.answerKey[0]?.answer).toBe('B');
    expect(outputSchemaIssues ?? []).toEqual([]);
  });

  it('repairs an answer-key error reported by the independent reviewer before storing the quiz', async () => {
    const quizCase = CASES.find((c) => c.id === 'education-lesson-assessment-drafting-user')!;
    const { raw, outputSchemaIssues } = await execute({
      ...quizCase,
      input: { ...quizCase.input, questionCount: 5 },
      brainResponses: [
        incorrectShortAnswerQuizResponse(5),
        quizReviewResponse(false, ['Question 2: the short-answer key does not provide the requested explanation.']),
        generatedQuizResponse(5),
        quizReviewResponse(true),
      ],
    });
    const envelope = JSON.parse(raw!) as {
      success: boolean;
      data: { draft: { quiz: { answerKey: Array<{ answer: string }> } } };
    };

    expect(envelope.success).toBe(true);
    expect(envelope.data.draft.quiz.answerKey[0]?.answer).toBe('B');
    expect(outputSchemaIssues ?? []).toEqual([]);
  });

  it('repairs incorrect fraction arithmetic and answer-key reasoning before review', async () => {
    const quizCase = CASES.find((c) => c.id === 'education-lesson-assessment-drafting-user')!;
    const { raw, outputSchemaIssues } = await execute({
      ...quizCase,
      input: {
        ...quizCase.input,
        topic: 'Adding and comparing fractions with unlike denominators',
        questionCount: 4,
      },
      brainResponses: [
        mathematicallyIncorrectFractionsQuizResponse(),
        generatedQuizResponse(4),
        quizReviewResponse(true),
      ],
    });
    const envelope = JSON.parse(raw!) as {
      success: boolean;
      data: { draft: { quiz: { answerKey: Array<{ answer: string }> } } };
    };

    expect(envelope.success).toBe(true);
    expect(envelope.data.draft.quiz.answerKey).toHaveLength(4);
    expect(outputSchemaIssues ?? []).toEqual([]);
  });

  it('repairs ambiguous fraction choices and false multiplication reasoning before review', async () => {
    const quizCase = CASES.find((c) => c.id === 'education-lesson-assessment-drafting-user')!;
    const { raw, outputSchemaIssues } = await execute({
      ...quizCase,
      input: {
        ...quizCase.input,
        topic: 'Fractions',
        quizType: 'multiple-choice',
        questionCount: 4,
      },
      brainResponses: [
        ambiguousFractionChoicesQuizResponse(false),
        ambiguousFractionChoicesQuizResponse(true),
        quizReviewResponse(true),
      ],
    });
    const envelope = JSON.parse(raw!) as {
      success: boolean;
      data: { draft: { quiz: { answerKey: Array<{ answer: string }> } } };
    };

    expect(envelope.success).toBe(true);
    expect(envelope.data.draft.quiz.answerKey.map((entry) => entry.answer)).toEqual(['A', 'B', 'A', 'A']);
    expect(outputSchemaIssues ?? []).toEqual([]);
  });

  it('returns a schema-valid failed envelope when a math quiz remains incorrect after repair', async () => {
    const quizCase = CASES.find((c) => c.id === 'education-lesson-assessment-drafting-user')!;
    const { raw, outputSchemaIssues } = await execute({
      ...quizCase,
      input: {
        ...quizCase.input,
        topic: 'Fractions',
        quizType: 'multiple-choice',
        questionCount: 4,
      },
      brainResponses: [
        ambiguousFractionChoicesQuizResponse(false),
        ambiguousFractionChoicesQuizResponse(false),
      ],
    });
    const envelope = JSON.parse(raw!) as { success: boolean; data: unknown; error: string };

    expect(envelope.success).toBe(false);
    expect(envelope.data).toBeNull();
    expect(envelope.error).toContain('returned an invalid quiz after repair');
    expect(outputSchemaIssues ?? []).toEqual([]);
  });
});
