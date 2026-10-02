import { ToolExecutor } from '../services/ToolExecutor';
import { financeModelingAnalysisSkill } from '../data/skills/finance/finance-modeling-analysis';

/**
 * A Skill whose inputs are all fixed model setup does not need a form. Every
 * figure describes the same entity on every run, so it is operator config, and
 * the run is scheduled rather than user-triggered. These tests pin that through
 * the real executor rather than by inspecting the schema.
 */
const run = async (config: Record<string, unknown>) => {
  const tool = { ...(financeModelingAnalysisSkill as any), externalConfig: config };
  const executor = new ToolExecutor(new Map([[tool.id, tool]]));
  const out: any = await executor.execute(tool, {});
  const text: string = (out?.output?.output as string) || '';
  // The sandbox prints a JSON line per emit; the last complete line is the result.
  let parsed: any = null;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) continue;
    try { parsed = JSON.parse(trimmed); } catch { /* partial line */ }
  }
  return { parsed, error: out?.error as string | undefined };
};

describe('finance-modeling-analysis is configured and scheduled, not typed in per run', () => {
  it('declares the model setup as config and exposes no user input fields', () => {
    const skill: any = financeModelingAnalysisSkill;
    expect(skill.configSchema?.properties).toHaveProperty('dataSource');
    expect(Object.keys(skill.configSchema.properties)).toEqual(
      expect.arrayContaining(['dataSource', 'entity', 'revenue', 'costs', 'discountRate']),
    );
    // Nothing left to fill in per run, so there is no user form to present.
    expect(skill.inputSchema?.properties ?? {}).toEqual({});
    expect(skill.triggers).toHaveLength(1);
    expect(skill.triggers[0].kind).toBe('schedule');
  });

  it('refuses to model when no data source is configured rather than modelling zeroes', async () => {
    const { error } = await run({});
    expect(error || '').toMatch(/dataSource/);
  });

  it('refuses to produce an all-zero model when the source supplies no figures', async () => {
    const { parsed } = await run({ dataSource: 'ledger://fy2025' });
    // An all-zero model is arithmetically valid and completely meaningless.
    expect(parsed?.success).toBe(false);
    expect(parsed?.status).toBe('not-connected');
    expect(parsed?.error).toMatch(/no figures/i);
  });

  it('produces a model and a rendered summary from config alone', async () => {
    const { parsed } = await run({
      dataSource: 'ledger://fy2025',
      entity: 'Acme',
      revenue: 1000000,
      costs: 600000,
    });
    expect(parsed?.success).toBe(true);
    expect(parsed?.data?.model?.summary?.npv).toBeGreaterThan(0);
    expect(parsed?.present?.[0]?.body).toContain('ledger://fy2025');
  });

  it('does not let a per-run payload redirect the configured data source', async () => {
    // Config is operator-supplied. A run that sends a different source must not
    // change where the figures come from.
    const tool = {
      ...(financeModelingAnalysisSkill as any),
      externalConfig: { dataSource: 'ledger://fy2025', revenue: 1000000, costs: 600000 },
    };
    const executor = new ToolExecutor(new Map([[tool.id, tool]]));
    const out: any = await executor.execute(tool, {
      dataSource: 'attacker://elsewhere',
      revenue: 9999999,
    });
    // The execution record echoes what was submitted; the model must not use it.
    const emitted = String(out?.output?.output || '');
    expect(emitted).toContain('ledger://fy2025');
    expect(emitted).not.toContain('attacker://elsewhere');
    expect(emitted).not.toContain('9999999');
  });
});