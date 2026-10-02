// @ts-nocheck
import { SchemaProps, createDeclarativeCodeSkill } from '../code-skill-factory';

/**
 * Ad-hoc half of the marketing-center decomposition. It was event-triggered
 * ("Delivery sync event from planning or analytics") while requiring a
 * targetChannel the sync event does not carry. This half is the user-triggered
 * dispatcher; marketing-reports-scheduled owns the recurring report path.
 */
export const MARKETING_CENTER = createDeclarativeCodeSkill({
  id: 'marketing-analysis-user',
  name: 'Marketing Analysis',
  description: 'Unified interface for ad-hoc marketing operations across content generation, social media, email, SEO, market research, audience insights, and document management. Dispatches to the appropriate external marketing skill based on the selected targetChannel.',
  persistenceEnvVar: 'STORAGE_DIR',
  inputSchema: {
    type: 'object',
    properties: {
      targetChannel: SchemaProps.select(['content-generation', 'social-media', 'email', 'seo', 'market-research', 'audience-insights', 'document-management'], { description: 'Which marketing channel to dispatch to' }),
      data: { type: ['object', 'null'] as const, description: 'Parameters forwarded to the selected marketing channel' },
    },
    required: ['targetChannel'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      system: { type: 'string' },
      action: { type: 'string' },
      result: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['success', 'system', 'action'],
  },
  triggers: [
    {
      kind: 'user',
      phrase_examples: [
        'Draft this campaign for social',
        'Run SEO for this page',
        'Research this market',
      ],
    },
  ],
  manifest: {
    lowerOrderTools: [
      'marketing-content-generation',
      'marketing-social-media',
      'marketing-email',
      'marketing-seo',
      'marketing-market-research',
      'marketing-audience-insights',
      'marketing-document-management',
    ]
  },
  handler: async function handler(input, ctx) {
      const targetChannel = input.targetChannel || 'content-generation';
      const data = input.data || {};
      const toolMap = {
        'content-generation': 'marketing-content-generation',
        'social-media': 'marketing-social-media',
        'email': 'marketing-email',
        'seo': 'marketing-seo',
        'market-research': 'marketing-market-research',
        'audience-insights': 'marketing-audience-insights',
        'document-management': 'marketing-document-management',
      };
      const toolId = toolMap[targetChannel];
      if (!toolId) {
        // A bare `return` here emitted no output envelope, so an unknown channel
        // surfaced as a bare {status, error} with no explanation.
        return {
          success: false,
          status: 'error',
          system: 'marketing-analysis-user',
          action: targetChannel,
          data: null,
          error: `Unknown targetChannel: ${targetChannel}`,
          present: [
            ctx.render.text(
              'notice',
              'Unknown channel',
              `Cannot dispatch "${targetChannel}". Expected one of: ${Object.keys(toolMap).join(', ')}.`,
            ),
          ],
        };
      }
      const result = await ctx.delegate(toolId, data);
      const ok = Boolean(result) && result.success !== false;
      return {
        success: ok,
        data: result ? result.data : null,
        error: result?.error ?? (ok ? null : 'The dispatched tool returned no result'),
        status: result?.status ?? (ok ? 'ok' : 'error'),
        delegatedTo: toolId,
        generatedAt: new Date().toISOString(),
        // Without this, a failed dispatch showed an empty result area.
        present: [
          ok
            ? ctx.render.text('report', 'Marketing Dispatch', ['Dispatched to ' + toolId, '', String(result?.data ?? '(no payload returned)')])
            : ctx.render.text('not-connected', 'Dispatch failed', toolId + ' did not produce a result: ' + String(result?.error ?? 'unknown error')),
        ],
      };
    }
  });
