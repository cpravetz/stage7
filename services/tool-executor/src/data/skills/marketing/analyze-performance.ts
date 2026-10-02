// @ts-nocheck
import { createDeclarativeCodeSkill } from '../code-skill-factory';
import { ANALYZE_PERFORMANCE_OUTPUT_SCHEMA } from './marketing-contract';

export const ANALYZE_PERFORMANCE = createDeclarativeCodeSkill({
  id: 'analyze-performance',
  name: 'Analyze Performance',
  description: 'Analyze campaign performance against KPIs.',
  persistenceEnvVar: 'MARKETING_HOME',
  inputSchema: {
    type: 'object',
    properties: {
      campaign: { type: 'string', description: 'Unique identifier of the campaign to analyze' },
      metrics: { type: 'array', items: { type: 'string' }, description: 'List of metric names to evaluate (e.g., impressions, clicks, conversions, ROI)' },
    },
  },
  outputSchema: ANALYZE_PERFORMANCE_OUTPUT_SCHEMA,
  triggers: [
    { kind: 'schedule', cadence: 'Periodic campaign performance review' },
  ],
  manifest: {},
  handler: async function handler(input, ctx) {
      const campaignId = input.campaign || '';
      const metrics = input.metrics || [];

      const store = ctx.store.load('performance', []);
      const analysis = { id: 'perf_' + Date.now(), campaignId: campaignId, metrics: metrics, results: {}, createdAt: new Date().toISOString(), source: 'local' };
      store.push(analysis);
      ctx.store.save('performance', store);

      return { success: true, data: { analysis: analysis, storePath: ctx.store.getFilePath('performance') } };
    }
  });
