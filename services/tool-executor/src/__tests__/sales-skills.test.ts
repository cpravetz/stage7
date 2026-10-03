import { ToolExecutor } from '../services/ToolExecutor';
import { Tool } from '../types';
import { validateAgainstOutputSchema } from '../utils/schemaValidator';
import { LEAD_DEAL_ADVISORY } from '../assistants/sales/skills/lead-deal-advisory';
import { OUTREACH_DRAFTING } from '../assistants/sales/skills/outreach-drafting';
import { PIPELINE_OPS } from '../assistants/sales/skills/pipeline-ops';

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

const CANONICAL_SKILLS: Tool[] = [LEAD_DEAL_ADVISORY, OUTREACH_DRAFTING, PIPELINE_OPS];

async function run(
  tool: Tool,
  input: Record<string, unknown>,
): Promise<{ result: SkillResult; output?: { output?: string; outputSchemaIssues?: ReturnType<typeof validateAgainstOutputSchema> } }> {
  const registry = new Map<string, Tool>();
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
  return { result, output };
}

function bodyOf(result: SkillResult): string {
  return ((result.present || []) as PresentBlock[]).map((b) => b.body).join('\n');
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
    expect(block.body).not.toMatch(/\{\{|\}\}/);
    expect(block.body.toLowerCase()).not.toMatch(/lorem ipsum|\bTODO\b|\bTBD\b|placeholder/);
    if (block.title) {
      expect(block.body.trim().toLowerCase().startsWith(block.title.trim().toLowerCase())).toBe(false);
    }
  }
}

const RICH_LEADS = [
  {
    id: 'L3',
    name: 'Ana Petrov',
    company: 'Vertex Retail',
    title: 'C-Level',
    industry: 'retail',
    companySize: 'enterprise',
    annualRevenue: 2400,
    engagement: { demoBooked: true, webinarAttended: true, linkClicked: true, emailOpened: true },
    behavioral: {
      pageVisits7d: ['/', '/a', '/b', '/c', '/d', '/e', '/f'],
      productPageVisits: ['/p1', '/p2', '/p3', '/p4', '/p5'],
      pricingVisited: true,
      daysSinceLastEngagement: 1,
    },
  },
  {
    id: 'L2',
    name: 'Sam Okafor',
    company: 'Cobalt Health',
    title: 'Manager',
    industry: 'healthcare',
    companySize: 'smb',
    annualRevenue: 6,
    engagement: {},
    behavioral: { pageVisits7d: ['/blog'], daysSinceLastEngagement: 21 },
  },
];

describe('Embedded skill sources survive template-literal escaping', () => {
  it.each(CANONICAL_SKILLS.map((t) => [t.id, t] as const))(
    '%s embedded source is syntactically valid JavaScript',
    (_id, tool) => {
      const source = (tool.manifest as { sourceCode: string }).sourceCode;
      expect(() => new Function(source)).not.toThrow();
    },
  );
});

describe('Sales Advisor skills emit presentation blocks', () => {
  it('every sales skill declares present as required in its outputSchema', () => {
    for (const tool of CANONICAL_SKILLS) {
      const schema = tool.outputSchema as { required?: string[]; properties?: Record<string, unknown> };
      expect(schema.required).toContain('present');
      expect(Object.keys(schema.properties || {})).toContain('present');
    }
  });

  it.each([
    ['lead-deal-advisory', LEAD_DEAL_ADVISORY, { leads: RICH_LEADS }],
    ['outreach-drafting', OUTREACH_DRAFTING, { recipient: { firstName: 'Dana', company: 'Northwind', industry: 'logistics' }, template: 'cold', variables: { valueProp: 'cut idle time', myCompany: 'Crestline', myName: 'Jordan' } }],
  ] as const)('%s renders clean blocks on its success path', async (_id, tool, input) => {
    const { result } = await run(tool as Tool, input as Record<string, unknown>);
    expect(result.success).toBe(true);
    assertPresentClean(result);
  });

  it('pipeline-ops renders clean blocks on a staged dry run with an endpoint configured', async () => {
    // The endpoint is Skill configuration, not a deployment env var. Clone rather
    // than mutate: the Skill objects are module-level singletons.
    const configured = {
      ...PIPELINE_OPS,
      externalConfig: { endpointUrl: 'https://crm.example.invalid/pipeline' },
    } as unknown as Tool;
    const { result } = await run(configured, {
      dryRun: true,
      entity: 'opportunity',
      entityId: 'OPP-1',
      data: { stage: 'negotiation' },
    });
    expect(result.success).toBe(true);
    expect(result.status).toBe('dry-run');
    expect((result.data as Record<string, unknown>).sent).toBe(false);
    assertPresentClean(result);
  });

  it.each([
    ['lead-deal-advisory', LEAD_DEAL_ADVISORY, {}],
    ['outreach-drafting', OUTREACH_DRAFTING, {}],
    // An empty input never reaches pipeline-ops: the core confirmation gate refuses an
    // unconfirmed represent-tier call first. Use a staged run that omits required detail so the
    // skill itself takes its not-connected path.
    ['pipeline-ops', PIPELINE_OPS, { dryRun: true }],
  ] as const)('%s renders clean blocks on its failure path', async (_id, tool, input) => {
    const { result } = await run(tool as Tool, input as Record<string, unknown>);
    expect(result.success).toBe(false);
    assertPresentClean(result);
  });

  it.each(CANONICAL_SKILLS.map((t) => [t.id, t] as const))(
    '%s output satisfies its own declared outputSchema on every path',
    async (_id, tool) => {
      const inputs: Record<string, unknown>[] =
        tool.id === 'lead-deal-advisory'
          ? [{}, { leads: RICH_LEADS }]
          : tool.id === 'outreach-drafting'
            ? [{}, { recipient: { firstName: 'Dana', company: 'Northwind', industry: 'logistics' }, template: 'cold', variables: { valueProp: 'x', myCompany: 'y', myName: 'z' } }]
            : [{ dryRun: true }, { dryRun: true, entity: 'opportunity', entityId: 'OPP-1', data: { stage: 'negotiation' } }];

      for (const input of inputs) {
        const { result, output } = await run(tool, input);
        expect(validateAgainstOutputSchema(result, tool.outputSchema)).toEqual([]);
        expect(output?.outputSchemaIssues || []).toEqual([]);
      }
    },
  );
});

describe('Lead advisory derives scores from the supplied data', () => {
  it('normalizes each dimension so a strong lead can actually reach the hot band', async () => {
    const { result } = await run(LEAD_DEAL_ADVISORY, { leads: RICH_LEADS });
    expect(result.success).toBe(true);

    const data = result.data as { scoredLeads: Array<Record<string, unknown>>; hotCount: number };
    const top = data.scoredLeads[0];

    // Before the fix the weighted sum of raw points capped out at 46, making the 70 hot band
    // mathematically unreachable. The rich lead must now clear it.
    expect(top.leadId).toBe('L3');
    expect(Number(top.totalScore)).toBeGreaterThanOrEqual(70);
    expect(top.category).toBe('hot');
    expect(data.hotCount).toBe(1);
  });

  it('scores a C-level title that the previous keyword match silently zeroed', async () => {
    const { result } = await run(LEAD_DEAL_ADVISORY, { leads: RICH_LEADS });
    const data = result.data as { scoredLeads: Array<Record<string, unknown>> };
    const cLevel = data.scoredLeads.find((l) => l.leadId === 'L3');

    const scores = cLevel?.scores as Record<string, number>;
    const matched = cLevel?.matchedSignals as Record<string, string>;
    expect(matched.seniority).toBe('c_level');
    // 'C-Level' scored 0 on seniority before, because the raw title never matched the 'c_level' key.
    expect(scores.demographic).toBe(30); // c_level 20 + retail 10
  });

  it('ranks leads by score and explains each contribution', async () => {
    const { result } = await run(LEAD_DEAL_ADVISORY, { leads: RICH_LEADS });
    const data = result.data as { scoredLeads: Array<Record<string, unknown>> };
    const scores = data.scoredLeads.map((l) => Number(l.totalScore));
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);

    const body = bodyOf(result);
    expect(body).toContain('ranked highest first');
    expect(body).toContain('Hot: 1');
    expect(body).toContain('computed locally');
    // Derivation must be visible, not just a verdict.
    expect(body).toMatch(/Demo Booked|demoBooked|Engagement signals present/);
  });

  it('reports the lead with no engagement signals as partially assessed', async () => {
    const { result } = await run(LEAD_DEAL_ADVISORY, { leads: RICH_LEADS });
    const data = result.data as { scoredLeads: Array<Record<string, unknown>>; unassessedCoverage: Record<string, number> };
    const bare = data.scoredLeads.find((l) => l.leadId === 'L2');
    expect(bare?.unassessedInputs).toContain('engagement');
    expect(data.unassessedCoverage.engagement).toBe(1);
    expect(bodyOf(result)).toContain('Not assessed');
  });

  it('reports not-connected instead of scoring nothing when leads are missing', async () => {
    const { result } = await run(LEAD_DEAL_ADVISORY, {});
    expect(result.success).toBe(false);
    expect(result.status).toBe('not-connected');
    expect(result.error).toMatch(/no lead records were supplied/i);
    assertPresentClean(result);
  });
});

describe('Outreach drafting never invents content', () => {
  it('renders a draft from supplied values only', async () => {
    const { result } = await run(OUTREACH_DRAFTING, {
      recipient: { firstName: 'Dana', company: 'Northwind Logistics', industry: 'logistics' },
      template: 'cold',
      variables: { valueProp: 'cut fleet idle time', myCompany: 'Crestline', myName: 'Jordan Blake' },
    });
    expect(result.success).toBe(true);
    const body = bodyOf(result);
    expect(body).toContain('Hi Dana,');
    expect(body).toContain('cut fleet idle time');
    expect(body).toContain('Nothing was sent');
    assertPresentClean(result);
  });

  it('never leaves an unresolved template token in the output', async () => {
    // 'topic' is not supplied, so the nurture template cannot be completed. The previous version
    // emitted the literal string '{{topic}}' into finished copy.
    const { result } = await run(OUTREACH_DRAFTING, {
      recipient: { firstName: 'Ana', company: 'Vertex' },
      template: 'nurture',
      variables: { myName: 'Jordan' },
    });
    const body = bodyOf(result);
    expect(body).not.toContain('{{topic}}');
    expect(body).not.toMatch(/\{\w+\}/);
    assertPresentClean(result);
  });

  it('substitutes no invented filler for unsupplied variables', async () => {
    const { result } = await run(OUTREACH_DRAFTING, {
      recipient: { firstName: 'Ana', company: 'Vertex', industry: 'retail' },
      template: 'cold',
      variables: { myName: 'Jordan' },
    });
    const body = bodyOf(result);
    // 'deliver value' and 'our team' were the old invented defaults.
    expect(body).not.toContain('deliver value');
    expect(body).not.toContain('our team');
    // The cold template needs myCompany and valueProp, so nothing can be completed and the skill
    // must say which variables were missing rather than inventing them.
    expect(result.success).toBe(false);
    expect(result.status).toBe('not-connected');
    expect(body).toContain('could not be completed');
    expect(body).toContain('myCompany');
    expect(body).toContain('valueProp');
  });

  it('drafts what it can and names the templates it had to skip', async () => {
    const { result } = await run(OUTREACH_DRAFTING, {
      recipient: { firstName: 'Ana', company: 'Vertex', industry: 'retail' },
      template: 'cold',
      sequence: ['cold', 'nurture'],
      variables: { myCompany: 'Crestline', valueProp: 'cut idle time', myName: 'Jordan' },
    });
    expect(result.success).toBe(true);
    const body = bodyOf(result);
    expect(body).toContain('Hi Ana,');
    expect(body).toContain('cut idle time');
    // nurture needs topic, which was not supplied, so it is skipped and named.
    expect(body).toContain('Templates skipped');
    expect(body).toContain('Nurture');
    expect(body).toContain('topic');
    assertPresentClean(result);
  });

  it('rejects a custom template that references an unsupplied variable', async () => {
    const { result } = await run(OUTREACH_DRAFTING, {
      recipient: { firstName: 'Ana', company: 'Vertex' },
      template: 'followup',
      customTemplate: 'Hi {firstName}, about {unknownThing}.',
      variables: { valueProp: 'x', myName: 'Jordan' },
    });
    const body = bodyOf(result);
    expect(body).toContain('custom template was not used');
    expect(body).toContain('unknownThing');
    expect(body).not.toMatch(/\{unknownThing\}/);
  });

  it('reports not-connected when the recipient is incomplete', async () => {
    const { result } = await run(OUTREACH_DRAFTING, {});
    expect(result.success).toBe(false);
    expect(result.status).toBe('not-connected');
    expect(result.error).toMatch(/recipient details are incomplete/i);
    assertPresentClean(result);
  });
});

describe('Pipeline operations stage by default and never silently send', () => {
  it('treats an explicit dryRun as a staging run and sends nothing', async () => {
    const { result } = await run(PIPELINE_OPS, {
      dryRun: true,
      entity: 'opportunity',
      entityId: 'OPP-77',
      data: { stage: 'negotiation' },
    });
    const data = result.data as Record<string, unknown>;
    // The shared external-action template ignored dryRun entirely and issued a live POST.
    expect(data.sent).toBe(false);
    expect(['dry-run', 'not-connected']).toContain(result.status);
    expect(bodyOf(result)).not.toContain('"endpoint"');
    assertPresentClean(result);
  });

  it('requires an explicit dryRun flag to stage at all', async () => {
    // Omitting dryRun is not a dry run: the core confirmation gate treats it as an unconfirmed
    // request and refuses before the skill runs.
    await expect(
      run(PIPELINE_OPS, { entity: 'opportunity', entityId: 'OPP-77', data: { stage: 'negotiation' } }),
    ).rejects.toThrow(/confirmation/i);
  });

  it('reports the staged request rather than a transport envelope', async () => {
    const { result } = await run(PIPELINE_OPS, {
      dryRun: true,
      entity: 'opportunity',
      entityId: 'OPP-77',
      data: { stage: 'negotiation', amount: 125000 },
    });
    const body = bodyOf(result);
    expect(body).toContain('OPP-77');
    expect(body).toContain('stage: negotiation');
    expect(body).toContain('amount: 125000');
    // Field names alone are not enough to review a staged request.
    expect(body).not.toContain('Payload fields');
    expect(body).not.toMatch(/X-API-Key|"method"|"headers"/);
  });

  it('derives the total from line items instead of trusting a stated figure', async () => {
    const { result } = await run(PIPELINE_OPS, {
      dryRun: true,
      entity: 'opportunity',
      entityId: 'OPP-9',
      lineItems: [
        { description: 'Platform license', quantity: 10, unitPrice: 1200 },
        { description: 'Onboarding', quantity: 1, unitPrice: 5000 },
      ],
    });
    const data = result.data as { operation: Record<string, unknown> };
    expect(data.operation.derivedTotal).toBe(17000);
    expect(bodyOf(result)).toContain('Derived total: 17000');
  });

  it('flags a stated total that disagrees with the line items', async () => {
    const { result } = await run(PIPELINE_OPS, {
      dryRun: true,
      entity: 'opportunity',
      entityId: 'OPP-9',
      lineItems: [{ description: 'Platform license', quantity: 10, unitPrice: 1200 }],
      totalAmount: 99999,
    });
    expect(bodyOf(result)).toContain('differs from the line items');
  });

  it('refuses a live write without explicit confirmation', async () => {
    await expect(
      run(PIPELINE_OPS, { dryRun: false, entity: 'opportunity', entityId: 'OPP-1', data: { stage: 'won' } }),
    ).rejects.toThrow(/confirmation/i);
  });

  it('reports not-connected with the staged request when no endpoint is configured', async () => {
    const { result, output } = await run(PIPELINE_OPS, {
      dryRun: true,
      entity: 'opportunity',
      entityId: 'OPP-5',
      data: { stage: 'proposal' },
    });
    const data = result.data as Record<string, unknown>;
    expect(data.sent).toBe(false);
    expect(data.staged).toBe(true);
    expect(result.error).toMatch(/pipeline endpoint/i);
    expect(output?.outputSchemaIssues || []).toEqual([]);
    assertPresentClean(result);
  });
});
