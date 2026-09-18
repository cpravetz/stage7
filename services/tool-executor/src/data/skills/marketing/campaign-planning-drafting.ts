import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAMPAIGN_PLANNING_DRAFTING = createCodeSkill({
  id: 'campaign-planning-drafting',
  name: 'Campaign Planning & Drafting',
  description: 'Plan marketing campaigns with budget, channels, and timeline, and draft campaign content. Runs as reasoning-only using provided context — no external API required.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const operation = input.operation || 'plan-campaign';
const product = input.product || '';
const budget = input.budget || 0;
const channels = input.channels || [];
const contentTitle = input.contentTitle || '';
const contentBody = input.contentBody || '';
const tone = input.tone || 'professional';

const marketingHome = process.env.MARKETING_HOME || path.join('/tmp/marketing');
const storePath = path.join(marketingHome, 'campaigns.json');
fs.mkdirSync(marketingHome, { recursive: true });
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];

let result;
switch (operation) {
  case 'plan-campaign': {
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
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
    result = { success: true, operation: 'plan-campaign', data: { campaign, storePath } };
    break;
  }
  case 'content-generation': {
    const draft = {
      id: 'draft_' + Date.now(),
      title: contentTitle,
      body: contentBody,
      tone,
      channels,
      createdAt: new Date().toISOString(),
      source: 'reasoning',
    };
    store.push(draft);
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
    result = { success: true, operation: 'content-generation', data: { draft, storePath } };
    break;
  }
  default:
    result = { success: false, error: 'Unknown operation: ' + operation };
}
console.log(JSON.stringify(result));
`,
  },
  inputSchema: {
    type: 'object',
    properties: {
      operation: SchemaProps.select(['plan-campaign', 'content-generation'], { description: 'Operation to perform' }),
      product: SchemaProps.text({ description: 'Name or description of the product being marketed' }),
      budget: SchemaProps.number({ description: 'Total budget allocated for the campaign' }),
      channels: SchemaProps.stringArray({ description: 'Marketing channels to use (e.g., email, social, search)' }),
      contentTitle: SchemaProps.text({ description: 'Title or headline for content generation' }),
      contentBody: SchemaProps.text({ description: 'Content body text', multiline: true }),
      tone: SchemaProps.select(['professional', 'casual', 'persuasive', 'conversational', 'technical'], { description: 'Tone of voice', default: 'professional' }),
    },
    required: ['operation'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      operation: { type: 'string' },
      data: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['success', 'operation'],
  },
});

export { CAMPAIGN_PLANNING_DRAFTING };
