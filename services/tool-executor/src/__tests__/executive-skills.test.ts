import { ToolExecutor } from '../services/ToolExecutor';
import { Tool } from '../types';
import { validateAgainstOutputSchema } from '../utils/schemaValidator';
import { RISK_SCENARIO } from '../assistants/executive/skills/executive-risk-scenario';
import { FEEDBACK } from '../assistants/executive/skills/executive-feedback';
import { DEV_CAREER } from '../assistants/executive/skills/executive-dev-career';
import { LEADERSHIP_ADVISORY } from '../assistants/executive/skills/executive-leadership-advisory';
import { SPEECH_COMMUNICATION_COPILOT } from '../assistants/executive/skills/executive-speech-communication-copilot';

interface PresentBlock {
  id: string;
  title?: string;
  body: string;
  kind?: string;
}

interface SkillResult {
  success?: boolean;
  status?: string;
  error?: string | null;
  data?: Record<string, unknown> | null;
  present?: PresentBlock[];
}

const CANONICAL_SKILLS: Tool[] = [
  RISK_SCENARIO,
  FEEDBACK,
  DEV_CAREER,
  LEADERSHIP_ADVISORY,
  SPEECH_COMMUNICATION_COPILOT,
];

const fs = require('fs');
const os = require('os');
const path = require('path');

// LEADERSHIP_ADVISORY resolves its store from process.env.EXECUTIVE_HOME
// (default /tmp/executive) inside the spawned child. Point it at a unique temp
// dir so concurrent jest workers cannot read or clobber each other's state
// through the shared default path.
const priorExecutiveHome = process.env.EXECUTIVE_HOME;
let executiveHome: string;

beforeAll(() => {
  executiveHome = fs.mkdtempSync(path.join(os.tmpdir(), 'executive-skills-home-'));
  process.env.EXECUTIVE_HOME = executiveHome;
});

afterAll(() => {
  if (priorExecutiveHome === undefined) delete process.env.EXECUTIVE_HOME;
  else process.env.EXECUTIVE_HOME = priorExecutiveHome;
  try {
    fs.rmSync(executiveHome, { recursive: true, force: true });
  } catch {
    // best effort
  }
});

async function run(
  tool: Tool,
  input: Record<string, unknown>,
  registryTools: Tool[] = [],
): Promise<{ result: SkillResult; exec: { status: string; outputSchemaIssues?: ReturnType<typeof validateAgainstOutputSchema> }; output?: { output?: string; outputSchemaIssues?: ReturnType<typeof validateAgainstOutputSchema> } }> {
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
  return { result, exec: { status: exec.status, outputSchemaIssues: output?.outputSchemaIssues }, output };
}

function failingStub(id: string, message: string): Tool {
  return {
    id,
    name: id,
    description: 'stub',
    type: 'code',
    manifest: {
      language: 'javascript',
      entrypoint: 'index.js',
      sourceCode: `console.log(JSON.stringify({ success: false, error: ${JSON.stringify(message)} }));`,
    },
    isSkill: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function successStub(id: string, data: Record<string, unknown>): Tool {
  return {
    id,
    name: id,
    description: 'stub',
    type: 'code',
    manifest: {
      language: 'javascript',
      entrypoint: 'index.js',
      sourceCode: `console.log(JSON.stringify({ success: true, data: ${JSON.stringify(data)} }));`,
    },
    isSkill: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function assertPresentClean(result: SkillResult) {
  const blocks = result.present;
  expect(Array.isArray(blocks)).toBe(true);
  expect((blocks as PresentBlock[]).length).toBeGreaterThan(0);
  for (const block of blocks as PresentBlock[]) {
    expect(typeof block.body).toBe('string');
    expect(block.body.trim().length).toBeGreaterThan(0);
    expect(block.body).not.toMatch(/undefined|NaN|\[object Object\]/);
    expect(block.body).not.toContain('{"');
    expect(block.body).not.toMatch(/"\w+":/);
    expect(block.body.toLowerCase()).not.toMatch(/lorem ipsum|\bTODO\b|\bTBD\b|placeholder/);
    if (block.title) {
      expect(block.body.trim().toLowerCase().startsWith(block.title.trim().toLowerCase())).toBe(false);
    }
  }
}

function seedInputFor(id: string): Record<string, unknown> {
  if (id === 'executive-risk-scenario') {
    return {
      focusArea: 'risk-assessment',
      domain: 'Strategic',
      timeframe: 'Q4 2026',
      risks: [
        { name: 'Market disruption', likelihood: 'high', impact: 'high', mitigation: 'Diversify portfolio', owner: 'CRO' },
        { name: 'Talent retention', likelihood: 'medium', impact: 'high', mitigation: 'Compensation review', owner: 'CHRO' },
        { name: 'Regulatory change', likelihood: 'low', impact: 'critical', mitigation: 'Compliance monitoring', owner: 'Legal' },
      ],
    };
  }
  if (id === 'executive-feedback') {
    return {
      focusArea: 'feedback-analysis',
      feedback: [
        { text: 'Strong strategic vision but needs more team engagement', author: 'peer-1', date: '2026-01-15' },
        { text: 'Excellent communication during crisis', author: 'direct-report-1', date: '2026-01-20' },
        { text: 'Decision-making could be more inclusive', author: 'peer-2', date: '2026-02-01' },
      ],
    };
  }
  if (id === 'executive-dev-career') {
    return {
      focusArea: 'skill-gap',
      role: 'VP Engineering',
      level: 'Senior',
      currentSkills: ['System Design', 'Team Leadership', 'Cloud Architecture'],
      targetSkills: ['System Design', 'Team Leadership', 'Cloud Architecture', 'ML/AI Strategy', 'Organizational Design'],
      timeframe: '12 months',
    };
  }
  if (id === 'executive-leadership-advisory') {
    return {
      focusArea: 'decision-framework',
      role: 'VP Engineering',
      decision: 'Whether to build or buy the new analytics platform',
      options: [
        { label: 'Build in-house', description: 'Full control, 18-month timeline, $2M investment' },
        { label: 'Buy vendor solution', description: 'Faster deployment, 6-month timeline, $500K/year' },
        { label: 'Hybrid approach', description: 'Core built, peripherals bought, 12-month timeline, $1.2M' },
      ],
      criteria: ['Time to value', 'Total cost of ownership', 'Strategic differentiation', 'Team capacity'],
    };
  }
  if (id === 'executive-speech-communication-copilot') {
    return {
      format: 'speech',
      occasion: 'Annual All-Hands',
      audience: 'All employees',
      keyMessages: ['We achieved record growth', 'New strategic direction', 'Investment in our people'],
      tone: 'inspirational',
      length: 'medium',
    };
  }
  return {};
}

function failureInputFor(id: string): Record<string, unknown> {
  if (id === 'executive-risk-scenario') {
    return { focusArea: 'risk-assessment' };
  }
  if (id === 'executive-feedback') {
    return { focusArea: 'feedback-analysis' };
  }
  if (id === 'executive-dev-career') {
    return { focusArea: 'skill-gap' };
  }
  if (id === 'executive-leadership-advisory') {
    return { focusArea: 'decision-framework' };
  }
  if (id === 'executive-speech-communication-copilot') {
    return {};
  }
  return {};
}

describe('Embedded skill sources survive template-literal escaping', () => {
  it.each(CANONICAL_SKILLS.map((t) => [t.id, t] as const))(
    '%s embedded source is syntactically valid JavaScript',
    (_id, tool) => {
      const source = (tool.manifest as { sourceCode: string }).sourceCode;
      expect(() => new Function(source)).not.toThrow();
    },
  );
});

describe('Executive Advisor skills emit presentation blocks', () => {
  it('every canonical skill declares present as required in its outputSchema', () => {
    for (const tool of CANONICAL_SKILLS) {
      const schema = tool.outputSchema as { required?: string[]; properties?: Record<string, unknown> };
      expect(schema.required).toContain('present');
      expect(Object.keys(schema.properties || {})).toContain('present');
    }
  });

  it.each(CANONICAL_SKILLS.map((t) => [t.id, t] as const))(
    '%s renders blocks on its success path with no raw JSON, placeholders, or repeated titles',
    async (_id, tool) => {
      const { result } = await run(tool, seedInputFor(tool.id));
      expect(result.success).toBe(true);
      assertPresentClean(result);
    },
  );

  it.each(CANONICAL_SKILLS.map((t) => [t.id, t] as const))(
    '%s renders blocks on its validation-failure path',
    async (_id, tool) => {
      const { result } = await run(tool, failureInputFor(tool.id));
      expect(result.success).toBe(false);
      assertPresentClean(result);
    },
  );

  it.each(CANONICAL_SKILLS.map((t) => [t.id, t] as const))(
    '%s output satisfies its own declared outputSchema',
    async (_id, tool) => {
      for (const input of [failureInputFor(tool.id), seedInputFor(tool.id)]) {
        const { result, output } = await run(tool, input);
        const issues = validateAgainstOutputSchema(result, tool.outputSchema);
        expect(issues).toEqual([]);
        expect(output?.outputSchemaIssues || []).toEqual([]);
      }
    },
  );
});

describe('Risk & Scenario Advisory computes real scores', () => {
  it('derives risk scores from likelihood/impact, not random', async () => {
    const { result } = await run(RISK_SCENARIO, {
      focusArea: 'risk-assessment',
      risks: [
        { name: 'Critical risk', likelihood: 'critical', impact: 'critical' },
        { name: 'Low risk', likelihood: 'low', impact: 'low' },
        { name: 'Medium risk', likelihood: 'medium', impact: 'medium' },
      ],
    });

    expect(result.success).toBe(true);
    const data = result.data as { risks: Array<{ name: string; score: number }> };
    const critical = data.risks.find(r => r.name === 'Critical risk');
    const low = data.risks.find(r => r.name === 'Low risk');
    const medium = data.risks.find(r => r.name === 'Medium risk');

    expect(critical?.score).toBeGreaterThan(medium?.score || 0);
    expect(medium?.score).toBeGreaterThan(low?.score || 0);
    expect(critical?.score).toBeLessThanOrEqual(10);
    expect(low?.score).toBeGreaterThanOrEqual(1);

    const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
    expect(body).toContain('Critical risk');
    expect(body).toContain('High-priority risks');
    expect(body).not.toContain('Math.random');
  });

  it('reports not-connected when no risks or domains supplied', async () => {
    const { result } = await run(RISK_SCENARIO, { focusArea: 'risk-assessment' });
    expect(result.success).toBe(false);
    expect(result.status).toBe('not-connected');
    expect(result.error).toMatch(/no risks supplied and no domains specified/);
    assertPresentClean(result);
  });

  it('models scenarios from supplied assumptions', async () => {
    const { result } = await run(RISK_SCENARIO, {
      focusArea: 'scenario-modeler',
      scenarios: [
        { name: 'Optimistic', assumptions: { growth: 0.2 }, probability: 0.3 },
        { name: 'Pessimistic', assumptions: { growth: -0.1 }, probability: 0.2 },
      ],
      baseMetrics: { revenue: 1000000 },
    });

    expect(result.success).toBe(true);
    const data = result.data as { scenarios: Array<{ name: string; probability: number }> };
    expect(data.scenarios.length).toBe(2);
    expect(data.scenarios[0].probability).toBe(0.3);
    expect(data.scenarios[1].probability).toBe(0.2);

    const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
    expect(body).toContain('Optimistic');
    expect(body).toContain('Pessimistic');
  });

  it('reports not-connected when no scenarios or base metrics supplied', async () => {
    const { result } = await run(RISK_SCENARIO, { focusArea: 'scenario-modeler' });
    expect(result.success).toBe(false);
    expect(result.status).toBe('not-connected');
    assertPresentClean(result);
  });
});

describe('Feedback Collection & Analysis derives themes from text', () => {
  it('analyzes feedback and derives themes when not provided', async () => {
    const { result } = await run(FEEDBACK, {
      focusArea: 'feedback-analysis',
      feedback: [
        { text: 'Great leadership and communication skills', author: 'a1', date: '2026-01-01' },
        { text: 'Strong strategic thinking but needs better delegation', author: 'a2', date: '2026-01-02' },
      ],
    });

    expect(result.success).toBe(true);
    const data = result.data as { themes: string[] };
    expect(data.themes.length).toBeGreaterThan(0);

    const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
    expect(body).toContain('Derived themes');
    expect(body).toContain('Feedback entries analyzed: 2');
  });

  it('uses provided themes when supplied', async () => {
    const { result } = await run(FEEDBACK, {
      focusArea: 'feedback-analysis',
      feedback: [{ text: 'Good work', author: 'a1', date: '2026-01-01' }],
      themes: ['Leadership', 'Communication'],
    });

    expect(result.success).toBe(true);
    const data = result.data as { themes: string[] };
    expect(data.themes).toEqual(['Leadership', 'Communication']);

    const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
    expect(body).toContain('Provided themes');
  });

  it('reports not-connected when no feedback provided', async () => {
    const { result } = await run(FEEDBACK, { focusArea: 'feedback-analysis' });
    expect(result.success).toBe(false);
    expect(result.status).toBe('not-connected');
    assertPresentClean(result);
  });

  it('creates feedback collection plan with supplied inputs', async () => {
    const { result } = await run(FEEDBACK, {
      focusArea: 'feedback-collector',
      respondents: ['peer-1', 'peer-2', 'report-1'],
      dimensions: ['Leadership', 'Communication'],
      questions: ['How effective is the leader?'],
      period: 'Q1 2026',
    });

    expect(result.success).toBe(true);
    const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
    expect(body).toContain('peer-1');
    expect(body).toContain('Leadership');
    expect(body).toContain('How effective is the leader?');
  });
});

describe('Development & Career Planning derives gaps and plans from input', () => {
  it('identifies skill gaps from current vs target', async () => {
    const { result } = await run(DEV_CAREER, {
      focusArea: 'skill-gap',
      currentSkills: ['A', 'B'],
      targetSkills: ['A', 'B', 'C', 'D'],
    });

    expect(result.success).toBe(true);
    const data = result.data as { gaps: string[] };
    expect(data.gaps).toEqual(['C', 'D']);

    const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
    expect(body).toContain('C');
    expect(body).toContain('D');
    expect(body).toContain('Gaps Identified (2)');
  });

  it('reports no gaps when target skills are subset of current', async () => {
    const { result } = await run(DEV_CAREER, {
      focusArea: 'skill-gap',
      currentSkills: ['A', 'B', 'C'],
      targetSkills: ['A', 'B'],
    });

    expect(result.success).toBe(true);
    const data = result.data as { gaps: string[] };
    expect(data.gaps).toEqual([]);
    const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
    expect(body).toContain('None - all target skills are currently held');
  });

  it('reports not-connected when no skills provided', async () => {
    const { result } = await run(DEV_CAREER, { focusArea: 'skill-gap' });
    expect(result.success).toBe(false);
    expect(result.status).toBe('not-connected');
    assertPresentClean(result);
  });

  it('creates development plan with actions and milestones placeholders', async () => {
    // `executiveId` and the `skills`/`areas`/`targetRole` synonyms are gone: the
    // subject is the user, and each idea now has one field.
    const { result } = await run(DEV_CAREER, {
      focusArea: 'development-plan',
      targetSkills: ['Strategic Planning', 'Public Speaking'],
      timeframe: '6 months',
    });

    expect(result.success).toBe(true);
    const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
    expect(body).toContain('Strategic Planning');
    expect(body).toContain('Public Speaking');
    expect(body).toContain('Current Level: not assessed');
    expect(body).toContain('Target Level: proficient');
  });
});

describe('Leadership Advisory structures decisions and assessments', () => {
  it('structures decision framework with options and criteria', async () => {
    const { result } = await run(LEADERSHIP_ADVISORY, {
      focusArea: 'decision-framework',
      decision: 'Expand to Europe',
      options: [
        { label: 'Greenfield', description: 'Build from scratch' },
        { label: 'Acquisition', description: 'Buy local player' },
      ],
      criteria: ['Cost', 'Speed', 'Risk'],
    });

    expect(result.success).toBe(true);
    const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
    expect(body).toContain('Expand to Europe');
    expect(body).toContain('Greenfield');
    expect(body).toContain('Acquisition');
    expect(body).toContain('Cost');
    expect(body).toContain('Speed');
    expect(body).toContain('Risk');
    expect(body).toContain('Define or confirm evaluation criteria');
  });

  it('analyzes communication text for metrics', async () => {
    const { result } = await run(LEADERSHIP_ADVISORY, {
      focusArea: 'communication-analyzer',
      text: 'This is a clear message. It has two sentences. The structure is simple.',
      channel: 'email',
      audience: 'team',
    });

    expect(result.success).toBe(true);
    const data = result.data as { metrics: { wordCount: number; sentenceCount: number } };
    expect(data.metrics.wordCount).toBeGreaterThan(0);
    expect(data.metrics.sentenceCount).toBe(3);

    const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
    expect(body).toContain('Word count');
    expect(body).toContain('Sentence count');
    expect(body).toContain('clear message');
  });

  it('reports not-connected when no text for communication analysis', async () => {
    const { result } = await run(LEADERSHIP_ADVISORY, { focusArea: 'communication-analyzer' });
    expect(result.success).toBe(false);
    expect(result.status).toBe('not-connected');
    assertPresentClean(result);
  });

  it('coaches on message with audience-specific checks', async () => {
    const { result } = await run(LEADERSHIP_ADVISORY, {
      focusArea: 'communication-coach',
      message: 'Team, please review the proposal by Friday. Thanks.',
      channel: 'slack',
      audience: 'engineering team',
    });

    expect(result.success).toBe(true);
    const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
    expect(body).toContain('engineering team');
    expect(body).toContain('Opening: Does the first sentence state the purpose');
    expect(body).toContain('Call to action');
  });

  it('reports not-connected when no message for coaching', async () => {
    const { result } = await run(LEADERSHIP_ADVISORY, { focusArea: 'communication-coach' });
    expect(result.success).toBe(false);
    expect(result.status).toBe('not-connected');
    assertPresentClean(result);
  });
});