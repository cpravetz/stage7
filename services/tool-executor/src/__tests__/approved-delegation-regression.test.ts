import { ToolExecutor } from '../services/ToolExecutor';
import { Tool } from '../types';
import { GOVERNED_PUBLISHING_CMS_DISPATCHER, MULTI_CHANNEL_PUBLISHING } from '../data/skills/content';
import { MARKETING_CENTER, marketingSkills } from '../data/skills/marketing';

const MARKETING_SEO = marketingSkills.find((s) => s.id === 'marketing-seo') as Tool;

/**
 * Regression cover for the fix that let these two transports be gated.
 *
 * Both `content-multi-channel-publishing` and `marketing-seo` are isSkill:false
 * lower-order tools, so routes/tools.ts lets them run directly with no approval
 * in the path. They carry confirmBeforeSend: true because that path is a live
 * write reachable without a dispatcher.
 *
 * That is only correct if the approved delegation still works. A gated callee is
 * reachable from an approved gated parent because approval propagates through
 * ToolExecutor.nestedExecutorCallback; before that fix these transports had to be
 * left ungated just to keep publishing working, which is why the base-tool
 * exemption existed in the gate predicate. The existing dispatcher tests in
 * content-skills.test.ts do not cover this: they either omit the real transport
 * from the registry or substitute an ungated stub, so neither proves the real
 * gated transport is still reached. These tests run the real skills.
 */
async function run(tool: Tool, input: Record<string, unknown>, callees: Tool[] = []) {
  const registry = new Map<string, Tool>();
  for (const t of callees) registry.set(t.id, t);
  registry.set(tool.id, tool);
  const exec = await new ToolExecutor(registry).execute(tool, input);
  return { status: exec.status, result: JSON.parse((exec.output as { output: string }).output) };
}

describe('Approved delegation still reaches gated lower-order tools', () => {
  it('both directly-invocable transports enforce the gate', () => {
    expect(MULTI_CHANNEL_PUBLISHING.confirmBeforeSend).toBe(true);
    expect(MARKETING_SEO.confirmBeforeSend).toBe(true);
  });

  it('an approved publishing dispatcher still reaches the gated publishing transport', async () => {
    const { result } = await run(
      GOVERNED_PUBLISHING_CMS_DISPATCHER,
      {
        channel: 'blog',
        title: 'Best coffee in Seattle',
        content: '<p>Seattle takes its coffee seriously.</p>',
        dryRun: false,
        confirmation: true,
      },
      [MULTI_CHANNEL_PUBLISHING],
    );

    // The transport really ran and reported its own honest connection failure.
    // A refusal at the nested layer would say so instead.
    expect(result.status).toBe('not-connected');
    expect(result.error).toMatch(/Not connected/);
    expect(JSON.stringify(result)).not.toMatch(/Nested execution requires confirmation/);
  });

  it('an unapproved publishing dispatcher is still refused at its own gate', async () => {
    await expect(run(
      GOVERNED_PUBLISHING_CMS_DISPATCHER,
      { channel: 'blog', title: 'T', content: 'c', dryRun: false },
      [MULTI_CHANNEL_PUBLISHING],
    )).rejects.toThrow(/confirmation/i);
  });

  it('an approved marketing-center still reaches the gated SEO tool via its toolMap', async () => {
    const { result } = await run(
      MARKETING_CENTER,
      { targetChannel: 'seo', data: { url: 'https://example.com' }, confirmation: true },
      [MARKETING_SEO],
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Not connected/);
    expect(JSON.stringify(result)).not.toMatch(/Nested execution requires confirmation/);
  });

  it('an unapproved marketing-center is still refused at its own gate', async () => {
    await expect(run(
      MARKETING_CENTER,
      { targetChannel: 'seo', data: { url: 'https://example.com' } },
      [MARKETING_SEO],
    )).rejects.toThrow(/confirmation/i);
  });
});
