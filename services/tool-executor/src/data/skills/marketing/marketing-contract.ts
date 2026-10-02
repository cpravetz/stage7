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

// Mark the 7 external marketing skills as lower-order base tools (isSkill:false)
export const MARKETING_EXTERNAL_TOOL_IDS = new Set([
  'marketing-content-generation',
  'marketing-social-media',
  'marketing-email',
  'marketing-seo',
  'marketing-market-research',
  'marketing-audience-insights',
  'marketing-document-management',
]);

// Set tiers and domainKnowledge for all marketing skills
export const MARKETING_TIER: Record<string, 'advise' | 'aid' | 'represent'> = {
  'plan-campaign': 'advise',
  'analyze-performance': 'advise',
  'marketing-analysis-user': 'represent',
  'marketing-reports-scheduled': 'advise',
  'marketing-content-generation': 'aid',
  'marketing-social-media': 'represent',
  'marketing-email': 'represent',
  'marketing-seo': 'aid',
  'marketing-market-research': 'aid',
  'marketing-audience-insights': 'aid',
  'marketing-document-management': 'represent',
};

export const MARKETING_DOMAIN_KNOWLEDGE = 'Marketing frameworks (AIDA, RACE, buyer journey), channel-specific best practices (SEO, paid social, email), content strategy, campaign measurement';
