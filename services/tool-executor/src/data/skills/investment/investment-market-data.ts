import { createExternalActionSkill, SchemaProps } from '../code-skill-factory';

const marketDataConfigSchema = {
  type: 'object',
  properties: {
    provider: { type: 'string', enum: ['bloomberg', 'refinitiv', 'alphavantage', 'polygon', 'iex', 'twelvedata', 'custom'], description: 'Market data provider to use' },
    defaultExchange: { type: 'string', description: 'Default exchange for symbol resolution' },
    dataTypes: { type: 'array', items: SchemaProps.text({ description: 'Data type to fetch, such as quote, fundamental, option, news, or calendar' }), description: 'Types of data to fetch' },
    cacheTtlSeconds: { type: 'number', description: 'Cache time-to-live in seconds' },
    rateLimitPerSecond: { type: 'number', description: 'Maximum requests per second' },
    timeoutMs: { type: 'number', description: 'Request timeout in milliseconds' }
  }
};

const marketDataInputSchema = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['quote', 'historical', 'fundamentals', 'options-chain', 'news', 'economic-calendar', 'search-symbols'], description: 'Action to perform' },
    symbols: { type: 'array', items: SchemaProps.text({ description: 'Stock symbol to query' }), description: 'Stock symbols to query' },
    symbol: { type: 'string', description: 'Single stock symbol' },
    interval: { type: 'string', enum: ['1m', '5m', '15m', '30m', '1h', '1d', '1w', '1M'], description: 'Data interval for historical queries' },
    startDate: { type: 'string', description: 'Start date (ISO 8601)' },
    endDate: { type: 'string', description: 'End date (ISO 8601)' },
    fields: { type: 'array', items: SchemaProps.text({ description: 'Specific field to return' }), description: 'Specific fields to return' },
    adjustments: { type: 'string', enum: ['none', 'split', 'dividend', 'all'], description: 'Price adjustment method' },
    dryRun: { type: 'boolean', default: true, description: 'Preview the request without calling an external API; no market data is returned in dry-run mode' }
  },
  required: ['action']
};

const INVESTMENT_MARKET_DATA = createExternalActionSkill({
  id: 'investment-market-data',
  name: 'Market Data Access',
  description: 'Request quotes, historical data, fundamentals, options chains, news, and economic-calendar data from a configured market-data endpoint. Without an endpoint, the action is a dry run and returns no market data.',
  system: 'market-data',
  action: 'fetch-data',
  endpoint: { envVar: 'INVESTMENT_MARKET_DATA_ENDPOINT', method: 'POST' },
  auth: { type: 'api_key', header: 'X-API-Key', credentialEnvKeyMap: { apiKey: 'INVESTMENT_MARKET_DATA_API_KEY' } },
  configSchema: marketDataConfigSchema,
  credentialSource: { apiKey: { envVar: 'INVESTMENT_MARKET_DATA_API_KEY', configKey: 'marketData.apiKey', vaultSecretId: 'market-data-api-key' } },
  inputSchema: marketDataInputSchema,
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      system: { type: 'string' },
      action: { type: 'string' },
      request: { type: 'object' },
      response: { type: ['object', 'null'] },
      error: { type: 'string' }
    },
    required: ['success', 'system', 'action', 'request', 'response', 'error']
  },
  triggers: [
    { kind: 'user', phrase_examples: ["Get market data for", "Research this stock", "Look up fundamentals", "Check options chain"] }
  ],
  timeoutMs: 30000,
  tier: 'represent',
  domainKnowledge: 'Market data access conventions, quote and fundamentals retrieval, options chain interpretation, and dry-run safety gating',
  confirmBeforeSend: true,
isSkill: true,
});

export { INVESTMENT_MARKET_DATA };
