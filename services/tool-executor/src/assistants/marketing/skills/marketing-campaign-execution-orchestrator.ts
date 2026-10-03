
import { SchemaProps, createDeclarativeCodeSkill } from '../../../adk/code-skill-factory';

/**
 * Campaign execution (v9 `marketing-campaign-execution-orchestrator`).
 *
 * This replaced a `targetChannel` select that asked the user to name the channel
 * before the Assistant knew what the work was. A routing enum is exactly what
 * v9 §1.1 item 3 removes, and so is a free-text `request` field: the caller
 * supplies campaign data, and this Skill picks the single-purpose tool from the
 * shape of what arrived rather than from prose the user had to compose for it.
 *
 * Research, SEO and audience insight were also promoted to Overview Skills in v9
 * (they produce a report the user reviews), so they are no longer delegated to
 * from here. What remains are the four capabilities that act: generate copy,
 * post to social, send email, and manage documents.
 */
export const MARKETING_CENTER = createDeclarativeCodeSkill({
  id: 'marketing-campaign-execution-orchestrator',
  name: 'Campaign Execution',
  description: 'Executes a marketing request by choosing the right single-purpose tool: generates campaign copy, posts to social, sends an email, or manages marketing documents. Reads the request to decide which, and reports what it chose.',
  emitEvent: 'marketing.campaign.executed',
  tier: 'represent',
  isSkill: true,
  persistenceEnvVar: 'STORAGE_DIR',
  inputSchema: {
    type: 'object',
    properties: {
      data: { type: ['object', 'null'] as const, description: 'Parameters forwarded to the chosen tool' },
    },
    required: ['data'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      system: { type: 'string' },
      delegatedTo: { type: 'string', description: 'Which single-purpose tool the request was routed to' },
      data: { type: ['object', 'null'] as const },
      error: { type: ['string', 'null'] as const },
    },
    required: ['success', 'system', 'delegatedTo'],
  },
  triggers: [
    {
      kind: 'user',
      phrase_examples: [
        'Run this campaign',
        'Post the campaign to social',
        'Send the campaign email',
        'File the campaign documents',
      ],
    },
  ],
  manifest: {
    lowerOrderTools: [
      'marketing-content-generation',
      'marketing-social-media',
      'marketing-email',
      'marketing-document-management',
    ]
  },
  handler: async function handler(input, ctx) {
      const data = input.data || {};

      // Selection lives here, in the Skill that understands the work, rather than
      // in the input schema. The channel is read off the data the caller supplied:
      // content generation when they bring copy, social when they name a social
      // channel, email when they bring recipients, documents when they name files.
      const payload = data as Record<string, unknown>;
      const named = [payload.channel, payload.platform, payload.to, payload.recipients,
                     payload.spaceKey, payload.folder, payload.fileName]
        .filter(Boolean).map(String).join(' ').toLowerCase();

      const rule =
        /\b(social|linkedin|instagram|twitter|facebook|\bx\b|thread|post)\b/.test(named)
          ? { tool: 'marketing-social-media' }
        : /\b(e-?mail|newsletter|broadcast|blast|recipient|subscriber)\b/.test(named)
          ? { tool: 'marketing-email' }
        : /\b(document|file|folder|asset|brief|attachment)\b/.test(named)
          ? { tool: 'marketing-document-management' }
        : { tool: 'marketing-content-generation' };

      const result = await ctx.delegate(rule.tool, data);
      const ok = Boolean(result) && result.success !== false;

      return {
        success: ok,
        system: 'marketing',
        delegatedTo: rule.tool,
        data: result ? result.data : null,
        error: result?.error ?? (ok ? null : 'The dispatched tool returned no result'),
        generatedAt: new Date().toISOString(),
        present: [
          ok
            ? ctx.render.text('report', 'Campaign Dispatch', ['Ran ' + rule.tool, '', String(result?.data ?? '(no payload returned)')])
            : ctx.render.text('not-connected', 'Dispatch failed', rule.tool + ' did not produce a result: ' + String(result?.error ?? 'unknown error')),
        ],
      };
  },
});