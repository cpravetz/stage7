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
  CAREER_PIPELINE_REPORT,
  CAREER_OUTCOME,
  CAREER_ADD_TEMPLATE,
} from '../data/skills/career';

const fs = require('fs');

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

afterAll(async () => {
  if (priorBrainUrl === undefined) delete process.env.BRAIN_URL;
  else process.env.BRAIN_URL = priorBrainUrl;
  if (brainServer) {
    await new Promise<void>((resolve) => brainServer.close(() => resolve()));
  }
});

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
): Promise<{ result: SkillResult; tool: Tool; schemaIssues: ReturnType<typeof validateAgainstOutputSchema> }> {
  const registry = new Map<string, Tool>();
  for (const t of registryTools) registry.set(t.id, t);
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

const LOWER_ORDER_TOOLS = [CAREER_PIPELINE_REPORT, CAREER_OUTCOME, CAREER_ADD_TEMPLATE];

beforeEach(() => {
  try { fs.rmSync('/tmp/career', { recursive: true, force: true }); } catch (e) {}
});
afterEach(() => {
  try { fs.rmSync('/tmp/career', { recursive: true, force: true }); } catch (e) {}
});

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
      const { result, tool } = await run(INTERVIEW_COMPENSATION_BATTLECARD, {
        company: 'Acme Corp',
        targetRole: 'Senior Engineer',
      });

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

    it('reports missing delegated tools correctly', async () => {
      const { result } = await run(INTERVIEW_COMPENSATION_BATTLECARD, {
        company: 'StartupXYZ',
        targetRole: 'Product Manager',
      });

      expect(result.success).toBe(true);
      expect(result.data!.delegatedTo).toBeDefined();
      expect(result.data!.coverage).toBeDefined();
      expect(result.data!.missing).toContain('interview-prep');
      expect(result.data!.missing).toContain('negotiation-advice');
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
      const { result, tool, schemaIssues } = await run(CAREER_JOB_DISCOVERY, {
        queries: ['Manager'],
      });

      expect(result.success).toBe(true);
      assertPresentClean(result.present, CAREER_JOB_DISCOVERY.id);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('storagePath');
      expect(serialized).not.toContain('queriesUsed');
      expect(serialized).not.toContain('companiesSearched');
      expect(result.data!.generatedAt).toBeUndefined();
      validateOutput(result, tool);
    }, 15000);

    it('reports not-connected with a clear message when no companies are given', async () => {
      const { result } = await run(CAREER_JOB_DISCOVERY, {
        queries: ['Manager'],
      });

      const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
      expect(body).toContain('No company names were provided');
    }, 15000);

    it('does not leak ISO datetime strings to the user', async () => {
      const { result } = await run(CAREER_JOB_DISCOVERY, {
        queries: ['Engineer'],
        companies: ['Acme'],
      });

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
      const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
      expect(body).toContain('Jane Doe Resume');
      expect(body).toContain('Resume saved');
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('templatePath');
      expect(result.data!.template).toBeDefined();
      expect(result.data!.template!.name).toBe('Jane Doe Resume');
      expect(result.data!.template!.type).toBe('resume');
      validateOutput(result, tool);
    }, 15000);

    it('reports not-connected with friendly instructions when no content provided', async () => {
      const { result } = await run(RESUME_TEMPLATE_MANAGER, {});

      expect(result.success).toBe(false);
      expect(result.status).toBe('not-connected');
      const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
      expect(body).toContain('Resume & Template Manager');
      expect(body).toContain('Upload a resume file');
    }, 15000);
  });
});
