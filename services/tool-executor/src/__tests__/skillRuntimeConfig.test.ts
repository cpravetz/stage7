import { ToolExecutor } from '../services/ToolExecutor';
import { legalSkills } from '../data/skills/legal';
import { supportSkills } from '../data/skills/support';
import { educationSkills } from '../data/skills/education';
import { hrSkills } from '../data/skills/hr';
import { scriptwritingSkills } from '../data/skills/scriptwriting';
import { sportsSkills } from '../data/skills/sports';
import { productSkills } from '../data/skills/product';
import { marketingSkills } from '../data/skills/marketing';
import { createDeclarativeCodeSkill } from '../data/skills/code-skill-factory';
import { Tool } from '../types';

// The domains the Class 4 splits landed in. Only these are scanned: the suffix
// rule describes the split convention, not every Skill in the registry.
const allSkills: Tool[] = [
  ...legalSkills,
  ...supportSkills,
  ...educationSkills,
  ...hrSkills,
  ...scriptwritingSkills,
  ...sportsSkills,
  ...productSkills,
  ...marketingSkills,
];

/**
 * Guards the config runtime itself.
 *
 * configSchema used to be a presence gate: ToolExecutor checked that the
 * declared values existed and then dropped them, so a handler could never read
 * what it had been configured with. That made configSchema indistinguishable
 * from the "schema demands a value the handler ignores" defect, and it is why
 * the split Skills below could not ship their selectors. These tests pin the
 * runtime behaviour so that regression cannot come back silently.
 */
describe('Resolved Skill config reaches handlers', () => {
  // A real Skill, not a hand-rolled Tool: the config path is exercised through
  // the same factory every production Skill uses.
  const makeSkill = (externalConfig?: Record<string, unknown>) => {
    const skill = createDeclarativeCodeSkill({
      id: 'config-probe',
      name: 'Config Probe',
      description: 'Echoes ctx.config so the test can observe what the handler received.',
      inputSchema: { type: 'object', properties: { note: { type: 'string' } } },
      outputSchema: {
        type: 'object',
        properties: { success: { type: 'boolean' }, data: { type: 'object' } },
        required: ['success', 'data'],
      },
      triggers: [{ kind: 'user' as const, phrase_examples: ['probe config'] }],
      tier: 'advise' as const,
      isSkill: true,
      async handler(input, ctx) {
        return { success: true, data: ctx.config ?? null };
      },
    });
    if (externalConfig) (skill as unknown as Tool).externalConfig = externalConfig;
    return skill as unknown as Tool;
  };

  const run = async (tool: Tool, input: Record<string, unknown>) => {
    const executor = new ToolExecutor(new Map([[tool.id, tool]]));
    const out = await executor.execute(tool, input);
    // ExecutionResult.output is an envelope object whose `output` field holds
    // the handler's serialized JSON.
    const raw = (out as { output?: { output?: string } }).output?.output;
    return typeof raw === 'string' ? JSON.parse(raw) : {};
  };

  it('exposes persisted configuration as ctx.config', async () => {
    const tool = makeSkill({ selector: 'genres:9', regions: ['us-east'] });
    const result = await run(tool, { note: 'hello' });

    expect(result.data.selector).toBe('genres:9');
    expect(result.data.regions).toEqual(['us-east']);
  });

  it('exposes an empty config object rather than undefined when unconfigured', async () => {
    const tool = makeSkill();
    const result = await run(tool, {});
    // A handler that reads ctx.config.foo must get undefined rather than a
    // TypeError, so generated bodies stay simple.
    expect(result.data).toEqual({});
  });

  it('merges per-run input over the persisted config', async () => {
    // Precedence follows isConfigured, which checks input before externalConfig.
    // So input keys are visible in config, and win on collision.
    const tool = makeSkill({ selector: 'from-config', other: 'kept' });
    const result = await run(tool, { selector: 'from-input', note: 'hello' });
    expect(result.data).toMatchObject({ selector: 'from-input', other: 'kept', note: 'hello' });
  });

  it('lets per-run input override the persisted value', async () => {
    // Precedence matches isConfigured: input wins, so a one-off override still
    // works the way it always has.
    const tool = makeSkill({ selector: 'from-config' });
    const result = await run(tool, { selector: 'from-input' });
    expect(result.data.selector).toBe('from-input');
  });
});

/**
 * The spec in docs/skill-class4-split-configs.md requires CI to reject
 * scheduled/automated Skills whose config has no scope selector, because an
 * unscoped recurring job ranges over everything. This asserts that for the
 * Skills the split naming convention introduced, which keeps the rule enforceable
 * without failing on pre-existing Skills that predate config plumbing entirely.
 */
describe('Automated Skills declare a scope selector', () => {
  const AUTOMATED_SUFFIXES = ['-scheduled', '-notifier', '-automated'];

  const automated = allSkills.filter((s) =>
    AUTOMATED_SUFFIXES.some((suffix) => s.id.endsWith(suffix)),
  );

  it('finds the automated Skills produced by the Class 4 splits', () => {
    // Guards against this suite silently passing by matching nothing.
    expect(automated.length).toBeGreaterThanOrEqual(9);
  });

  it.each(automated.map((s) => s.id))('%s requires at least one config selector', (id) => {
    const config = allSkills.find((s) => s.id === id)!.configSchema as
      | { required?: string[]; anyOf?: Array<{ required?: string[] }>; properties?: Record<string, unknown> }
      | undefined;

    expect(config).toBeDefined();
    const required = config!.required ?? [];
    const anyOfRequired = (config!.anyOf ?? []).flatMap((clause) => clause.required ?? []);
    const selectors = [...required, ...anyOfRequired];

    // No selector means the Skill could run over its whole domain with no
    // operator-defined bound, which is the wide-scope case the split prevents.
    expect(selectors.length).toBeGreaterThan(0);
    // A required selector that names nothing would gate on a field the schema
    // does not declare.
    for (const selector of selectors) {
      expect(Object.keys(config!.properties ?? {})).toContain(selector);
    }
  });

  it.each(automated.map((s) => s.id))('%s reads its selectors from config, not input', (id) => {
    const skill = allSkills.find((s) => s.id === id)!;
    const config = skill.configSchema as { required?: string[]; anyOf?: Array<{ required?: string[] }> };
    const selectors = [...(config.required ?? []), ...(config.anyOf ?? []).flatMap((c) => c.required ?? [])];
    const source = (skill.manifest?.sourceCode as string | undefined) ?? '';
    const inputProps = Object.keys((skill.inputSchema as { properties?: Record<string, unknown> })?.properties ?? {});

    // If a selector is also an inputSchema key, a caller could override the
    // scope that config was meant to fix.
    for (const selector of selectors) {
      expect(inputProps).not.toContain(selector);
    }
  });
});

describe('config cannot be overridden by run input', () => {
  /**
   * Config is operator-supplied; input is caller-supplied. Merging input last let
   * any API caller replace the selector, endpoint, or feed that scoped the run just
   * by sending the same key, which is the opposite of what the runtime says config
   * is for.
   */
  const makeProbed = (configSchema: Record<string, unknown>) => {
    const skill = createDeclarativeCodeSkill({
      id: 'config-precedence-probe',
      name: 'Config Precedence Probe',
      description: 'Echoes ctx.config so the test can observe which value the handler received.',
      inputSchema: { type: 'object', properties: { dataFeed: { type: 'string' }, subject: { type: 'string' } } },
      outputSchema: {
        type: 'object',
        properties: { success: { type: 'boolean' }, data: { type: 'object' } },
        required: ['success', 'data'],
      },
      configSchema,
      triggers: [{ kind: 'user' as const, phrase_examples: ['probe precedence'] }],
      tier: 'advise' as const,
      isSkill: true,
      async handler(input, ctx) {
        return { success: true, data: ctx.config ?? null };
      },
    });
    return skill as unknown as Tool;
  };

  const run = async (tool: Tool, input: Record<string, unknown>) => {
    const executor = new ToolExecutor(new Map([[tool.id, tool]]));
    const out = await executor.execute(tool, input);
    const raw = (out as { output?: { output?: string } }).output?.output;
    return typeof raw === 'string' ? (JSON.parse(raw) as { data?: Record<string, unknown> }) : {};
  };

  it('keeps the operator value when the caller repeats a configured key', async () => {
    const tool = makeProbed({
      type: 'object',
      properties: { dataFeed: { type: 'string', description: 'Operator-chosen feed' } },
    });
    (tool as unknown as { externalConfig: Record<string, unknown> }).externalConfig = { dataFeed: 'operator-feed' };

    const parsed = await run(tool, { dataFeed: 'attacker-feed' });

    expect(parsed.data?.dataFeed).toBe('operator-feed');
  });

  it('still accepts input for keys the operator has not configured', async () => {
    const tool = makeProbed({
      type: 'object',
      properties: { dataFeed: { type: 'string', description: 'Operator-chosen feed' } },
    });
    (tool as unknown as { externalConfig: Record<string, unknown> }).externalConfig = { dataFeed: 'operator-feed' };

    const parsed = await run(tool, { subject: 'weekly-review' });

    expect(parsed.data?.subject).toBe('weekly-review');
    expect(parsed.data?.dataFeed).toBe('operator-feed');
  });
});
