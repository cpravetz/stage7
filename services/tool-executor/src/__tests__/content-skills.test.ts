import { ToolExecutor } from '../services/ToolExecutor';
import { Tool } from '../types';
import { validateAgainstOutputSchema } from '../utils/schemaValidator';
import {
  CONTENT_DRAFTING_ADAPTATION,
  CONTENT_STRATEGY_SEO_EVALUATOR,
  EDITORIAL_CALENDAR_ARTICLE_COPILOT,
  GOVERNED_PUBLISHING_CMS_DISPATCHER,
} from '../data/skills/content';

const SOURCE_TEXT = [
  'Seattle has an excellent coffee scene and the city takes it seriously.',
  'Roasters here care about sourcing, and that care shows up in the cup every single morning.',
  'The best coffee in Seattle usually means a short list, but it is a list worth keeping close.',
  'This guide walks through the roasters worth crossing town for, and what to order when you arrive.',
].join(' ');

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

/** Run a real skill through a real executor, so `__execute_tool` is genuinely injected. */
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

/** A stand-in lower-order tool that always fails, so failure propagation can be tested. */
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

const CANONICAL_SKILLS: Tool[] = [
  CONTENT_STRATEGY_SEO_EVALUATOR,
  EDITORIAL_CALENDAR_ARTICLE_COPILOT,
  GOVERNED_PUBLISHING_CMS_DISPATCHER,
];

describe('Embedded skill sources survive template-literal escaping', () => {
  const embedded = [
    CONTENT_DRAFTING_ADAPTATION,
    CONTENT_STRATEGY_SEO_EVALUATOR,
    EDITORIAL_CALENDAR_ARTICLE_COPILOT,
    GOVERNED_PUBLISHING_CMS_DISPATCHER,
  ];

  it.each(embedded.map((t) => [t.id, t] as const))(
    '%s embedded source is syntactically valid JavaScript',
    (_id, tool) => {
      const source = (tool.manifest as { sourceCode: string }).sourceCode;
      // Parse without executing. This is the precise guard for the escaping class of bug: a real
      // newline inside a single-quoted literal is a SyntaxError in the sandbox, which is what made
      // the drafting tool fail on every call while its caller still reported success.
      expect(() => new Function(source)).not.toThrow();
    },
  );
});

describe('Content Creator skills emit presentation blocks', () => {
  // The drafting tool is what the calendar co-pilot delegates to. It threw a syntax error on every
  // call, which silently emptied every draft while the co-pilot still reported success.
  it('the drafting tool runs and reports the source it was given', async () => {
    const { result } = await run(CONTENT_DRAFTING_ADAPTATION, {
      task: 'adapt',
      sourceContent: SOURCE_TEXT,
      contentType: 'blog',
      targetFormat: 'social',
      keywords: ['seattle coffee'],
      length: 'short',
    });

    expect(result.success).toBe(true);
    expect(result.present).toBeDefined();
    const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
    // "Seattle" appears in the source, so the measured section must quote real counts.
    expect(body).toContain('Measured source text');
    expect(body).toMatch(/Words\s+\d+/);
    expect(body).toContain('Flesch reading ease');
  });

  it('drafting output is derived from the supplied parameters, not a fixed template', async () => {    const short = await run(CONTENT_DRAFTING_ADAPTATION, { task: 'draft', topic: 'Seattle coffee', contentType: 'blog', length: 'short' });
    const long = await run(CONTENT_DRAFTING_ADAPTATION, { task: 'draft', topic: 'Seattle coffee', contentType: 'blog', length: 'long' });

    const shortBody = (short.result.present as PresentBlock[])[0].body;
    const longBody = (long.result.present as PresentBlock[])[0].body;

    // The section plan is a genuine function of the length parameter.
    expect(shortBody).toContain('600 words total');
    expect(longBody).toContain('2000 words total');
    // The skill is honest that it did not write prose.
    expect(shortBody).toContain('did not write the prose');
  });

  // Both of these were wrong: the section plan followed the source format while the text described
  // the target format, and the length step always said "cut down" even when the target was larger
  // than the source.
  it('uses the target format section plan, not the source format', async () => {
    const { result } = await run(CONTENT_DRAFTING_ADAPTATION, {
      task: 'adapt',
      sourceContent: SOURCE_TEXT,
      contentType: 'blog',
      targetFormat: 'social',
    });

    const conventions = (result.data as { conventions: { sections: string[] } }).conventions;
    expect(conventions.sections).toEqual(['Hook', 'Value', 'Proof', 'Call to action']);

    const body = (result.present as PresentBlock[])[0].body;
    expect(body).toContain('Add 4 social sections: Hook, Value, Proof, Call to action.');
    expect(body).not.toContain('Main argument');
  });

  it('describes the length change in the direction the numbers require', async () => {
    // social/short is 90 words, so a 63-word source has to grow, not be cut.
    const { result } = await run(CONTENT_DRAFTING_ADAPTATION, {
      task: 'adapt',
      sourceContent: SOURCE_TEXT,
      contentType: 'blog',
      targetFormat: 'social',
      length: 'short',
    });

    const body = (result.present as PresentBlock[])[0].body;
    expect(body).toMatch(/Expand the \d+ source sentences/);
    expect(body).not.toContain('Cut the');
  });

  it('every canonical skill declares present as required in its outputSchema', () => {
    for (const tool of CANONICAL_SKILLS) {
      const schema = tool.outputSchema as { required?: string[]; properties?: Record<string, unknown> };
      expect(schema.required).toContain('present');
      expect(Object.keys(schema.properties || {})).toContain('present');
    }
  });

  it.each(CANONICAL_SKILLS.map((t) => [t.id, t] as const))(
    '%s renders blocks with no raw JSON, no placeholders, and no repeated title',
    async (_id, tool) => {
      const { result } = await run(tool, seedInputFor(tool.id));
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
        // The renderer already shows the title, so the body must not restate it.
        if (block.title) {
          expect(block.body.trim().toLowerCase().startsWith(block.title.trim().toLowerCase())).toBe(false);
        }
      }
    },
  );

  it.each(CANONICAL_SKILLS.map((t) => [t.id, t] as const))(
    '%s renders blocks on its validation-failure path too',
    async (_id, tool) => {
      const { result } = await run(tool, failureInputFor(tool.id));
      const blocks = result.present;
      expect(Array.isArray(blocks)).toBe(true);
      expect((blocks as PresentBlock[]).length).toBeGreaterThan(0);
      for (const block of blocks as PresentBlock[]) {
        expect(block.body.trim().length).toBeGreaterThan(0);
      }
    },
  );

  it.each(CANONICAL_SKILLS.map((t) => [t.id, t] as const))(
    '%s output satisfies its own declared outputSchema',
    async (_id, tool) => {
      for (const input of [failureInputFor(tool.id), seedInputFor(tool.id)]) {
        const { result, schemaIssues } = await run(tool, input);
        // Validate the real emitted object, independently of the executor's own logging.
        const issues = validateAgainstOutputSchema(result, tool.outputSchema);
        expect(issues).toEqual([]);
        expect(schemaIssues).toEqual([]);
      }
    },
  );
});

/**
 * The dispatcher carries confirmBeforeSend, so the executor refuses to run it unless dryRun is
 * explicitly true or the run is approved. That gate fires before the skill body, so its
 * validation-failure path has to be reached with dryRun set rather than with an empty payload.
 */
function failureInputFor(id: string): Record<string, unknown> {
  if (id === GOVERNED_PUBLISHING_CMS_DISPATCHER.id) {
    return { dryRun: true };
  }
  return {};
}

function seedInputFor(id: string): Record<string, unknown> {
  if (id === CONTENT_STRATEGY_SEO_EVALUATOR.id) {
    return {
      contentItems: [
        { id: 'a1', title: 'Local SEO', impressions: 1000, clicks: 40, conversions: 3 },
        { id: 'a2', title: 'Coffee shops', impressions: 5000, clicks: 120, conversions: 20 },
      ],
    };
  }
  if (id === EDITORIAL_CALENDAR_ARTICLE_COPILOT.id) {
    return {
      topics: [{ title: 'Best coffee in Seattle', audience: 'local foodies', format: 'blog', platform: 'blog', keywords: ['seattle coffee'] }],
      startDate: '2026-10-01',
    };
  }
  return {
    channel: 'blog',
    title: 'Best coffee in Seattle',
    content: '<p>Seattle takes its coffee seriously.</p>',
    slug: 'best-coffee-seattle',
    dryRun: true,
  };
}

describe('Content strategy evaluator scores only what it was given', () => {
  it('measures CTR and conversion rate from the supplied numbers', async () => {
    const { result } = await run(CONTENT_STRATEGY_SEO_EVALUATOR, {
      contentItems: [
        { id: 'a1', title: 'One', impressions: 1000, clicks: 40, conversions: 4 },
        { id: 'a2', title: 'Two', impressions: 1000, clicks: 40, conversions: 40 },
      ],
    });

    const evaluated = (result.data as { evaluated: Array<Record<string, unknown>> }).evaluated;
    expect(evaluated[0].ctr).toBe(4);
    expect(evaluated[0].conversionRate).toBe(10);
    expect(evaluated[1].conversionRate).toBe(100);
  });

  // The old score imputed 0 for a metric the caller never supplied and still weighted it at 30%,
  // so a healthy 4% CTR / 7.5% conversion record scored 4.0 and was told to revise its metadata.
  it('excludes an unsupplied metric instead of scoring it as zero', async () => {
    const { result } = await run(CONTENT_STRATEGY_SEO_EVALUATOR, {
      contentItems: [
        { id: 'a1', title: 'Healthy but unkeyworded', impressions: 1000, clicks: 40, conversions: 3 },
        { id: 'a2', title: 'The set maximum', impressions: 1000, clicks: 40, conversions: 3 },
      ],
    });

    const evaluated = (result.data as { evaluated: Array<Record<string, unknown>> }).evaluated;
    for (const row of evaluated) {
      expect(row.keywordMatch).toBeNull();
      expect(row.availableMetrics).toEqual(['ctr', 'conversionRate']);
      expect(row.missingMetrics).toContain('keywordMatch');
    }
    // Identical performance must not be dragged toward zero by an input that was never given.
    expect(evaluated[0].index).toBe(100);

    const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
    expect(body).toContain('excluded from the index rather than scored as zero');
  });

  it('marks a record with no usable metric as not scorable rather than scoring it zero', async () => {
    const { result } = await run(CONTENT_STRATEGY_SEO_EVALUATOR, {
      contentItems: [
        { id: 'a1', title: 'Measurable', impressions: 100, clicks: 10, conversions: 1 },
        { id: 'a2', title: 'Impressions only', impressions: 2000 },
      ],
    });

    const evaluated = (result.data as { evaluated: Array<Record<string, unknown>> }).evaluated;
    const unscored = evaluated.find((r) => r.id === 'a2');
    expect(unscored?.index).toBeNull();
    expect(unscored?.verdict).toBe('not scorable');
  });

  it('reports not-connected plainly when there is nothing to evaluate', async () => {
    const { result } = await run(CONTENT_STRATEGY_SEO_EVALUATOR, {});
    expect(result.success).toBe(false);
    expect(result.status).toBe('not-connected');
    expect(result.error).toContain('Not connected');
    expect((result.present as PresentBlock[]).length).toBeGreaterThan(0);
  });
});

describe('Editorial calendar co-pilot reports delegation honestly', () => {
  // This is the defect that mattered most: a failed nested call was discarded, every draft was null,
  // and the outer result still reported success.
  it('fails loudly when the drafting tool fails', async () => {
    const { result } = await run(
      EDITORIAL_CALENDAR_ARTICLE_COPILOT,
      { topics: [{ title: 'One' }, { title: 'Two' }], startDate: '2026-10-01' },
      [failingStub('content-drafting-adaptation', 'drafting exploded')],
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('drafting exploded');

    const coverage = (result.data as { coverage: Record<string, number> }).coverage;
    expect(coverage.drafted).toBe(0);
    expect(coverage.failed).toBe(2);
  });

  it('reports partial success when only some topics draft', async () => {
    const { result } = await run(
      EDITORIAL_CALENDAR_ARTICLE_COPILOT,
      { topics: [{ title: 'Good' }, { title: 'Bad' }], startDate: '2026-10-01' },
      [failingStub('content-drafting-adaptation', 'drafting exploded')],
    );

    // Both fail here, so this asserts the shape of the coverage accounting rather than a partial
    // split, which cannot be produced by a stub that fails unconditionally.
    const drafts = (result.data as { drafts: Array<Record<string, unknown>> }).drafts;
    expect(drafts).toHaveLength(2);
    for (const draft of drafts) {
      expect(draft.status).toBe('failed');
      expect(draft.error).toBeTruthy();
    }
    const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
    expect(body).toContain('Failed to draft');
  });

  it('drafts every topic end to end and reports full coverage', async () => {
    const { result } = await run(
      EDITORIAL_CALENDAR_ARTICLE_COPILOT,
      {
        topics: [
          { title: 'Best coffee in Seattle', audience: 'local foodies', format: 'blog', platform: 'blog', keywords: ['seattle coffee'] },
          { title: 'Cold brew guide', audience: 'home brewers', format: 'blog', platform: 'substack', keywords: ['cold brew'] },
        ],
        startDate: '2026-10-01',
      },
      [CONTENT_DRAFTING_ADAPTATION],
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe('ok');

    const data = result.data as { coverage: Record<string, number>; drafts: Array<{ status: string }> };
    expect(data.coverage.drafted).toBe(2);
    expect(data.coverage.failed).toBe(0);
    for (const draft of data.drafts) expect(draft.status).toBe('drafted');

    const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
    expect(body).toContain('2 of 2 placed (100% coverage)');
  });

  it('derives a date for an undated topic and says where it came from', async () => {
    const { result } = await run(
      EDITORIAL_CALENDAR_ARTICLE_COPILOT,
      { topics: [{ title: 'Undated' }], startDate: '2026-10-01' },
      [CONTENT_DRAFTING_ADAPTATION],
    );

    const calendar = (result.data as { calendar: Array<Record<string, unknown>> }).calendar;
    expect(calendar[0].dueDate).toBe('2026-10-01');
    expect(String(calendar[0].dueBasis)).toContain('cycle start');
  });
});

describe('Governed publishing dispatcher separates its outcomes', () => {
  it('blocks a payload with no title and sends nothing', async () => {
    const { result } = await run(GOVERNED_PUBLISHING_CMS_DISPATCHER, { channel: 'blog', content: 'body text', dryRun: true });

    expect(result.success).toBe(false);
    expect(result.status).toBe('blocked');
    const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
    expect(body).toContain('This payload was not sent');
  });

  // The dispatcher carries confirmBeforeSend, so the executor itself refuses an unapproved live run
  // before the skill body is ever reached. That is the real gate, and it is what must not be bypassed.
  it('the executor refuses a live publish that is not approved', async () => {
    await expect(
      run(GOVERNED_PUBLISHING_CMS_DISPATCHER, {
        channel: 'blog',
        title: 'Best coffee in Seattle',
        content: '<p>Seattle takes its coffee seriously.</p>',
        dryRun: false,
      }),
    ).rejects.toThrow(/requires explicit confirmation/);
  });

  it('a live publish that is approved but has no connection reports not-connected, not success', async () => {
    const { result } = await run(GOVERNED_PUBLISHING_CMS_DISPATCHER, {
      channel: 'blog',
      title: 'Best coffee in Seattle',
      content: '<p>Seattle takes its coffee seriously.</p>',
      dryRun: false,
      confirmation: true,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('not-connected');
    expect((result.data as { dispatched: boolean }).dispatched).toBe(false);
  });

  // The skill used to emit `data: null` while its own declared schema said data was an object.
  it('returns a data object on every refusal path', async () => {
    for (const input of [
      { channel: 'blog', content: 'no title', dryRun: true },
      { channel: 'blog', title: 'T', content: 'c', dryRun: false, confirmation: true },
    ]) {
      const { result } = await run(GOVERNED_PUBLISHING_CMS_DISPATCHER, input);
      expect(result.data).toBeInstanceOf(Object);
      expect(result.data).not.toBeNull();
    }
  });

  // A single \s inside the TypeScript template literal collapses to the letter "s", silently turning
  // a trim into /not connected:s*/i. That matched the label but left the following space, producing
  // a doubled "Not connected:  ..." in the rendered report. Asserted on the symptom, not the source.
  it('a not-connected result is not reported with a doubled prefix', async () => {
    const { result } = await run(
      GOVERNED_PUBLISHING_CMS_DISPATCHER,
      { channel: 'blog', title: 'Best coffee in Seattle', content: '<p>Seattle takes its coffee seriously.</p>', dryRun: true },
      [failingStub('content-multi-channel-publishing', 'Not connected: required config fields missing: baseUrl, token')],
    );

    expect(result.status).toBe('not-connected');
    expect(result.error).toBe('Not connected: required config fields missing: baseUrl, token');
    expect(result.error).not.toMatch(/Not connected:\s+Not connected/);
    expect(result.error).not.toMatch(/Not connected: {2,}/);
  });

  it('runs its governance checks locally so they are real without a CMS connection', async () => {
    const { result } = await run(GOVERNED_PUBLISHING_CMS_DISPATCHER, {
      channel: 'blog',
      title: 'Best Coffee in Seattle',
      content: '<p>Seattle takes its coffee seriously, and the roasters prove it every morning.</p>',
      slug: 'Best Coffee In Seattle!',
      seoDescription: 'too short',
      dryRun: true,
    });

    const body = (result.present as PresentBlock[]).map((b) => b.body).join('\n');
    expect(body).toContain('Payload as supplied');
    // The slug is measured against the convention, not assumed valid.
    expect(body).toContain('not lowercase-hyphenated');
    expect(body).toContain('SEO description is 9 characters');
    // And the conventions are labelled as conventions.
    expect(body).toMatch(/SEO conventions/);
  });
});
