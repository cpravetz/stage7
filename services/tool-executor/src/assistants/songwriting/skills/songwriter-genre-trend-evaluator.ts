import { Tool } from '../../../types';
import { createExternalActionSkill, SchemaProps } from '../../../adk/code-skill-factory';

const GENRE_TREND_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean', description: 'Whether the request was successful' },
    status: { type: 'string', enum: ['success', 'error'], description: 'Status of the operation' },
    system: { type: 'string', description: 'System that processed the request' },
    action: { type: 'string', description: 'Action that was performed' },
    request: {
      type: ['object', 'null'],
      properties: {
        input: { type: 'object', description: 'Input parameters sent to the endpoint' },
        endpoint: { type: 'string', description: 'API endpoint that was called' },
        method: { type: 'string', description: 'HTTP method used for the request' },
        headers: { type: 'object', description: 'Headers sent with the request' },
      },
      description: 'Details of the request that was made',
    },
    response: {
      type: ['object', 'null'],
      properties: {
        status: { type: 'number', description: 'HTTP status code of the response' },
        data: { type: ['object', 'string', 'null'], description: 'Response data from the API' },
      },
      description: 'Response received from the external API',
    },
    error: { type: ['string', 'null'], description: 'Error message if the request failed' },
  },
  required: ['success', 'status', 'system', 'action', 'request', 'response', 'error'],
};

export const songwriterGenreTrendEvaluator = createExternalActionSkill({
  id: 'songwriter_genre_trend_evaluator',
  name: 'Songwriter Genre & Market Trend Fit Evaluator',
  description: 'Monitor genre and market trends using external music intelligence providers (Spotify, SoundCharts, Billboard, Chartmetric, Musixmatch) to inform songwriting direction and release strategy.',
  system: 'creative_intelligence',
  action: 'analyze_trends',
  endpoint: { configKey: 'CREATIVE_INTELLIGENCE_ENDPOINT', method: 'POST' },
  auth: {
    type: 'api_key',
    header: 'X-API-Key',
    credentialEnvKeyMap: { apiKey: 'CREATIVE_INTELLIGENCE_API_KEY' },
  },
  configSchema: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string', description: 'Creative intelligence platform base URL' },
      apiKey: { type: 'string', description: 'Creative intelligence API key' },
      provider: { type: 'string', enum: ['spotify', 'soundcharts', 'billboard', 'musixmatch', 'chartmetric', 'custom'], description: 'Music trend data provider' },
      defaultMarket: { type: 'string', description: 'Default market/region (e.g., US, global, UK)' },
      defaultGenre: { type: 'string', description: 'Default genre to monitor' },
      trendSources: { type: 'array', items: { type: 'string' }, description: 'Enabled trend data sources' },
      updateCadence: { type: 'string', enum: ['daily', 'weekly', 'monthly'], description: 'Default trend update frequency', default: 'weekly' },
    },
    required: ['baseUrl', 'apiKey', 'provider'],
  },
  credentialSource: {
    apiKey: { envVar: 'CREATIVE_INTELLIGENCE_API_KEY', configKey: 'creative.intelligence.apiKey' },
  },
  inputSchema: {
    type: 'object',
    properties: {
      genre: SchemaProps.text({ title: 'Genre', description: 'Music genre to analyze (e.g., pop, hiphop, country, edm, rock, rnb, folk)', order: 1, hint: 'The single genre the trend report is centered on; batch multi-genre checks separately' }),
      market: SchemaProps.text({ title: 'Market', description: 'Target market/region (e.g., US, global, UK, JP, KR)', order: 2, hint: 'Leave empty to fall back to defaultMarket from the provider config' }),
      timeframe: SchemaProps.select(['7d', '30d', '90d', '180d', '1y', '5y'], { title: 'Timeframe', description: 'Time period for trend analysis', default: '30d', order: 3, hint: 'Use 7d for fast-moving buzz, 1y-5y for genre lifecycle and seasonality' }),
      provider: SchemaProps.select(['spotify', 'soundcharts', 'billboard', 'musixmatch', 'chartmetric'], { title: 'Provider', description: 'Override configured provider for this request', order: 4, hint: 'Omit to use the configured provider; Billboard suits chart ranks, Chartmetric or Musixmatch suit audio-signal depth' }),
      artist: SchemaProps.text({ title: 'Artist', description: 'Specific artist to analyze trend trajectory', order: 5, hint: 'Optional; scopes the analysis to one artist instead of the whole genre' }),
      track: SchemaProps.text({ title: 'Track', description: 'Specific track to analyze', order: 6, hint: 'Optional; set alongside artist for competitive track benchmarking' }),
      keywords: SchemaProps.stringArray({ title: 'Keywords', description: 'Keywords/topics to search for emerging trends', order: 7, hint: 'Rising themes and motifs to watch, e.g. bedroom pop or 2010s nostalgia' }),
      limit: SchemaProps.number({ title: 'Limit', description: 'Maximum results to return', default: 50, minimum: 1, maximum: 200, order: 8, hint: 'Keep low for a top-signal summary; raise for exhaustive catalogue sweeps' }),
      includeCharts: SchemaProps.boolean({ title: 'Include Charts', description: 'Include chart position data', default: true, order: 9, hint: 'Turn off to cut response size when only streaming or velocity signals matter' }),
      includeStreaming: SchemaProps.boolean({ title: 'Include Streaming', description: 'Include streaming metrics', default: true, order: 10, hint: 'Core trend signal; disable only for providers without streaming data' }),
      includeSocial: SchemaProps.boolean({ title: 'Include Social', description: 'Include social media buzz metrics', default: false, order: 11, hint: 'Off by default since it slows the request; enable for early breakout detection' }),
      dryRun: SchemaProps.boolean({ title: 'Dry Run', description: 'Validate request without calling external API', default: false, order: 12, hint: 'Preview the outgoing request payload before spending provider quota' }),
    },
    required: ['genre'],
  },
  outputSchema: GENRE_TREND_OUTPUT_SCHEMA,
  triggers: [
    { kind: 'schedule', cadence: 'Periodic genre trend monitoring (weekly default)' },
  ],
  tier: 'advise',
  domainKnowledge: 'Music industry trend analysis, genre evolution tracking, chart performance metrics, streaming data interpretation, audience preference shifts',
  timeoutMs: 120000,
  manifest: { actionLabel: 'Evaluate genre trends' },
  isSkill: true,
});
