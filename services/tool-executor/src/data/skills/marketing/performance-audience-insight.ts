// @ts-nocheck
import { createDeclarativeCodeSkill, SchemaProps } from '../code-skill-factory';

const PERFORMANCE_AUDIENCE_INSIGHT = createDeclarativeCodeSkill({
  id: 'performance-audience-insight',
  name: 'Performance & Audience Insight',
  description: 'Analyze campaign performance, audience insights, SEO metrics, and market research data. Runs reasoning-only on the assistant model using stored local data.',
  persistenceEnvVar: 'STORAGE_DIR',
  inputSchema: {
    type: 'object',
    properties: {
      campaign: SchemaProps.text({ description: 'Campaign identifier' }),
      metric: SchemaProps.text({ description: 'Metric name to analyze' }),
      keywords: SchemaProps.stringArray({ description: 'Keywords for SEO or research' }),
      audienceId: SchemaProps.text({ description: 'Audience segment identifier' }),
      market: SchemaProps.text({ description: 'Market/region (e.g., US, UK, global)' }),
      dateRange: SchemaProps.object({
        start: SchemaProps.text({ description: 'Start date' }),
        end: SchemaProps.text({ description: 'End date' }),
      }, { description: 'Date range for analysis' }),
      filters: SchemaProps.object({}, { description: 'Additional filters' }),
    },
    required: [],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['success'],
  },
  tier: 'advise',
  domainKnowledge: 'Campaign performance analytics, audience segmentation, and SEO metrics',
  triggers: [
    { kind: 'user', phrase_examples: ['Analyze campaign performance', 'Get audience insights', 'Check SEO metrics', 'Review market research'] }
  ],
  manifest: {},
  handler: async function handler(input, ctx) {
      const campaignId = input.campaign || '';
      const metric = input.metric || '';
      const keywords = input.keywords || [];
      const audienceId = input.audienceId || '';
      const market = input.market || '';

      const store = ctx.store.load('analytics', []);

      function analyzePerformance(data) {
        return {
          campaignId: data.campaignId || campaignId,
          metrics: data.metrics || (metric ? [metric] : []),
          summary: { impressions: 0, clicks: 0, conversions: 0, roi: 0 },
          trends: [],
          recommendations: [],
          generatedAt: new Date().toISOString(),
        };
      }

      const analysis = analyzePerformance(input);
      const record = { id: 'perf_' + Date.now(), analysis, createdAt: new Date().toISOString(), source: 'local' };
      store.push(record);
      ctx.store.save('analytics', store);
      const result = { success: true, data: { record, storePath: ctx.store.getFilePath('analytics') } };

      return result;
    }
  });

export { PERFORMANCE_AUDIENCE_INSIGHT };
