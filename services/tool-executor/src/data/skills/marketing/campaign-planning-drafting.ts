// @ts-nocheck
import { createDeclarativeCodeSkill, SchemaProps } from '../code-skill-factory';

const CAMPAIGN_PLANNING_DRAFTING = createDeclarativeCodeSkill({
  id: 'campaign-planning-drafting',
  name: 'Campaign Planning & Drafting',
  description: 'Plan marketing campaigns with budget, channels, and timeline. Runs as reasoning-only using provided context — no external API required.',
  persistenceEnvVar: 'STORAGE_DIR',
  inputSchema: {
    type: 'object',
    properties: {
      product: SchemaProps.text({ description: 'Name or description of the product being marketed' }),
      budget: SchemaProps.number({ description: 'Total budget allocated for the campaign' }),
      channels: SchemaProps.stringArray({ description: 'Marketing channels to use (e.g., email, social, search)' }),
      contentTitle: SchemaProps.text({ description: 'Title or headline for content generation' }),
      contentBody: SchemaProps.text({ description: 'Content body text', multiline: true }),
      tone: SchemaProps.select(['professional', 'casual', 'persuasive', 'conversational', 'technical'], { description: 'Tone of voice', default: 'professional' }),
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
  domainKnowledge: 'Campaign planning, content drafting, and marketing calendar management',
  triggers: [
    { kind: 'user', phrase_examples: ['Plan a campaign', 'Draft marketing content', 'Create campaign timeline', 'Set campaign budget'] }
  ],
  manifest: {},
  handler: async function handler(input, ctx) {
      const product = input.product || '';
      const budget = input.budget || 0;
      const channels = input.channels || [];
      const contentTitle = input.contentTitle || '';
      const contentBody = input.contentBody || '';
      const tone = input.tone || 'professional';

      const store = ctx.store.load('campaigns', []);

      const campaign = {
        id: 'camp_' + Date.now(),
        product,
        budget,
        channels,
        timeline: [],
        kpis: [],
        createdAt: new Date().toISOString(),
        source: 'local',
      };
      store.push(campaign);
      ctx.store.save('campaigns', store);
      const result = { success: true, data: { campaign, storePath: ctx.store.getFilePath('campaigns') } };

      return result;
    }
  });

export { CAMPAIGN_PLANNING_DRAFTING };
