// @ts-nocheck

import { createDeclarativeCodeSkill } from '../../../adk/code-skill-factory';
import { PLAN_CAMPAIGN_OUTPUT_SCHEMA } from '../marketing-contract';

export const PLAN_CAMPAIGN = createDeclarativeCodeSkill({
  id: 'plan-campaign',
  tier: 'advise',
  isSkill: true,
  name: 'Plan Campaign',
  description: 'Plan a marketing campaign with budget, channels, and timeline.',
  persistenceEnvVar: 'MARKETING_HOME',
  inputSchema: {
    type: 'object',
    properties: {
      product: { type: 'string', description: 'Name or description of the product being marketed' },
      budget: { type: 'number', description: 'Total budget allocated for the campaign in currency units' },
      channels: { type: 'array', items: { type: 'string' }, description: 'List of marketing channels to use (e.g., email, social, search, display)' },
    },
  },
  outputSchema: PLAN_CAMPAIGN_OUTPUT_SCHEMA,
  triggers: [
    { kind: 'user', phrase_examples: ["Plan a campaign", "Define campaign", "Create campaign plan"] },
  ],
  manifest: {},
  handler: async function handler(input, ctx) {
      const product = input.product || '';
      const budget = input.budget || 0;
      const channels = input.channels || [];

      const store = ctx.store.load('campaigns', []);
      const campaign = { id: 'campaign_' + Date.now(), product: product, budget: budget, channels: channels, timeline: [], kpis: [], createdAt: new Date().toISOString(), source: 'local' };
      store.push(campaign);
      ctx.store.save('campaigns', store);

      return { success: true, data: { campaign: campaign, storePath: ctx.store.getFilePath('campaigns') } };
    }
  });
