export const PLAN_CAMPAIGN_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    campaign: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        product: { type: 'string' },
        budget: { type: 'number' },
        channels: { type: 'array', items: { type: 'string' } },
        timeline: { type: 'array' },
        kpis: { type: 'array' },
        createdAt: { type: 'string' },
        source: { type: 'string' },
      },
    },
    storePath: { type: 'string' },
  },
  required: ['success', 'campaign', 'storePath'],
};

export const ANALYZE_PERFORMANCE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    analysis: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        campaignId: { type: 'string' },
        metrics: { type: 'array', items: { type: 'string' } },
        results: { type: 'object' },
        createdAt: { type: 'string' },
        source: { type: 'string' },
      },
    },
    storePath: { type: 'string' },
  },
  required: ['success', 'analysis', 'storePath'],
};

export const EXTERNAL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    status: { type: 'string', enum: ['success', 'error'] },
    system: { type: 'string' },
    action: { type: 'string' },
    request: {
      type: ['object', 'null'],
      properties: {
        input: { type: 'object' },
        endpoint: { type: 'string' },
        method: { type: 'string' },
        headers: { type: 'object' },
      },
    },
    response: {
      type: ['object', 'null'],
      properties: {
        status: { type: 'number' },
        data: { type: ['object', 'string', 'null'] },
      },
    },
    error: { type: ['string', 'null'] },
  },
  required: ['success', 'status', 'system', 'action', 'request', 'response', 'error'],
};

export const MARKETING_DOMAIN_KNOWLEDGE = 'Marketing frameworks (AIDA, RACE, buyer journey), channel-specific best practices (SEO, paid social, email), content strategy, campaign measurement';
