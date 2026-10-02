import { createExternalActionSkill } from '../code-skill-factory';
import { CONTENT_EXTERNAL_OUTPUT_SCHEMA } from './content-external-schema';

/**
 * Lower-order analytics tool. Transport layer for content performance and SEO data. It returns the
 * analytics platform's response verbatim; the strategy evaluator that calls it is responsible for
 * stating plainly when this tool returns nothing, and for not attributing invented numbers to it.
 */
export const CONTENT_PERFORMANCE_SEO = createExternalActionSkill({
  id: 'content-performance-seo',
  name: 'Content Performance & SEO Insight',
  description: 'Analyze content performance across channels, track SEO rankings, and surface audience insights. Combines analytics, trend analysis, audience insights, and SEO into one hybrid skill.',
  system: 'content_intelligence',
  action: 'analyze',
  endpoint: { configKey: 'CONTENT_INTELLIGENCE_ENDPOINT', method: 'POST' },
  auth: {
    type: 'api_key',
    header: 'X-API-Key',
    credentialEnvKeyMap: { apiKey: 'CONTENT_INTELLIGENCE_API_KEY' },
  },
  configSchema: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string', description: 'Content intelligence platform base URL' },
      apiKey: { type: 'string', description: 'Content intelligence API key' },
      provider: { type: 'string', enum: ['google-analytics', 'matomo', 'mixpanel', 'amplitude', 'semrush', 'ahrefs', 'search-console', 'custom'], description: 'Primary analytics/SEO provider' },
      secondaryProviders: { type: 'array', items: { type: 'string' }, description: 'Additional connected providers' },
      defaultDateRange: { type: 'string', description: 'Default analysis period' },
      defaultMetrics: { type: 'array', items: { type: 'string' }, description: 'Default metrics to track' },
      defaultDimensions: { type: 'array', items: { type: 'string' }, description: 'Default dimensions to analyze' },
      searchEngines: { type: 'array', items: { type: 'string' }, description: 'Search engines for SEO tracking' },
      defaultMarket: { type: 'string', description: 'Default market/region' },
    },
    required: ['baseUrl', 'apiKey', 'provider'],
  },
  credentialSource: {
    apiKey: { envVar: 'CONTENT_INTELLIGENCE_API_KEY', configKey: 'content.intelligence.apiKey' },
  },
  inputSchema: {
    type: 'object',
    properties: {
      contentIds: { type: 'array', items: { type: 'string' }, description: 'Content identifiers to analyze' },
      channel: { type: 'string', description: 'Channel/platform (blog, social, video, email, organic, paid)' },
      platform: { type: 'string', description: 'Specific platform (linkedin, youtube, google, etc.)' },
      metrics: { type: 'array', items: { type: 'string' }, description: 'Metrics to track' },
      dimensions: { type: 'array', items: { type: 'string' }, description: 'Dimensions to analyze' },
      dateRange: { type: 'object', description: 'Date range for analysis' },
      filters: { type: 'object', description: 'Filters to apply' },
      groupBy: { type: 'string', description: 'Field to group results by' },
      url: { type: 'string', description: 'URL for SEO audit/optimization' },
      keywords: { type: 'array', items: { type: 'string' }, description: 'Keywords for research/tracking' },
      targetKeywords: { type: 'array', items: { type: 'string' }, description: 'Target keywords for optimization' },
      market: { type: 'string', description: 'Market/region for SEO' },
      searchEngine: { type: 'string', description: 'Search engine (google, bing, etc.)' },
      competitorUrls: { type: 'array', items: { type: 'string' }, description: 'Competitor URLs for comparison' },
      audienceId: { type: 'string', description: 'Audience identifier for segmentation' },
      demographics: { type: 'object', description: 'Demographic filters' },
      interests: { type: 'array', items: { type: 'string' }, description: 'Interest categories' },
      behaviors: { type: 'array', items: { type: 'object' }, description: 'Behavioral signals' },
      dryRun: { type: 'boolean', description: 'Validate without executing' },
    },
    required: [],
  },
  outputSchema: CONTENT_EXTERNAL_OUTPUT_SCHEMA,
  timeoutMs: 120000,
  manifest: { workflowStage: 'optimize' },
  isSkill: false,
});
