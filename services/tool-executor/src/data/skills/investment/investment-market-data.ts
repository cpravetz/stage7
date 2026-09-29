import { createCodeSkill, SchemaProps } from '../code-skill-factory';
import { investmentResultSchema } from './investment-contract';

const INVESTMENT_HOME = process.env.INVESTMENT_HOME || '/tmp/investment';

const MARKET_DATA_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const NL = '\\n';

  function arr(v) { return Array.isArray(v) ? v : (v != null ? [v] : []); }

  var fs = require('fs');
  var path = require('path');

  const action = typeof input.action === 'string' ? input.action.trim() : '';
  const symbols = arr(input.symbols).map(String).filter(function (s) { return s && s.trim(); });
  const symbol = typeof input.symbol === 'string' ? input.symbol.trim() : '';
  const interval = typeof input.interval === 'string' ? input.interval.trim() : '';
  const startDate = typeof input.startDate === 'string' ? input.startDate.trim() : '';
  const endDate = typeof input.endDate === 'string' ? input.endDate.trim() : '';
  const fields = arr(input.fields).map(String).filter(function (f) { return f && f.trim(); });
  const adjustments = typeof input.adjustments === 'string' ? input.adjustments.trim() : '';
  const dryRun = input.dryRun === true || input.dryRun === undefined;
  const confirmed = input.confirmation === true;

  const baseDir = process.env.INVESTMENT_HOME || '${INVESTMENT_HOME}';
  const storePath = path.join(baseDir, 'market-data.json');
  try { fs.mkdirSync(baseDir, { recursive: true }); } catch (e) {}

  const endpoint = String(input.endpoint || (process.env.INVESTMENT_MARKET_DATA_ENDPOINT || '')).trim();

  function emit(success, status, data, error, present) {
    const payload = { success: success, status: status, data: data || null, error: error || null, present: present || [] };
    console.log(JSON.stringify(payload));
    return payload;
  }

  const requestSummary = {
    system: 'investment-advisor',
    action: action || null,
    endpoint: endpoint || null,
    symbol: symbol || null,
    symbols: symbols.length ? symbols : null,
    interval: interval || null,
    startDate: startDate || null,
    endDate: endDate || null,
    fields: fields.length ? fields : null,
    adjustments: adjustments || null,
    dryRun: dryRun,
    confirmed: confirmed,
    sent: false,
  };

  function formatRequest(title) {
    const L = [];
    L.push(title);
    L.push('  System: ' + requestSummary.system);
    L.push('  Action: ' + (requestSummary.action || '(unspecified)'));
    if (requestSummary.symbols && requestSummary.symbols.length) L.push('  Symbols: ' + requestSummary.symbols.join(', '));
    if (requestSummary.symbol) L.push('  Symbol: ' + requestSummary.symbol);
    if (requestSummary.interval) L.push('  Interval: ' + requestSummary.interval);
    if (requestSummary.startDate) L.push('  Start: ' + requestSummary.startDate);
    if (requestSummary.endDate) L.push('  End: ' + requestSummary.endDate);
    if (requestSummary.fields && requestSummary.fields.length) L.push('  Fields: ' + requestSummary.fields.join(', '));
    if (requestSummary.adjustments) L.push('  Adjustments: ' + requestSummary.adjustments);
    L.push('  Mode: ' + (dryRun ? 'dry-run (no request sent)' : 'live (request will be sent)'));
    return L;
  }

  if (!action) {
    const lines = formatRequest('Market data request -- waiting for action');
    lines.push('');
    lines.push('Supply an action: quote, historical, fundamentals, options-chain, news, economic-calendar, or search-symbols.');
    emit(false, 'blocked', requestSummary,
      'No action was supplied; cannot determine what market data to retrieve.',
      [{ id: 'notice', title: 'No action specified', kind: 'text', body: lines.join(NL) }]);
    return;
  }

  if (!dryRun && !confirmed) {
    const lines = formatRequest('Market data request -- confirmation required');
    lines.push('');
    lines.push('A live request (dryRun=false) must be confirmed with confirmation: true before it is sent.');
    emit(false, 'confirmation-required', requestSummary,
      'A live market data request requires explicit confirmation.',
      [{ id: 'notice', title: 'Confirmation required', kind: 'text', body: lines.join(NL) }]);
    return;
  }

  if (!endpoint) {
    const lines = formatRequest('Market data request -- not connected');
    lines.push('');
    lines.push('No endpoint is configured. Set the INVESTMENT_MARKET_DATA_ENDPOINT environment variable to enable live retrieval.');
    emit(false, 'not-connected', requestSummary,
      'Not connected: no investment market data endpoint is configured (INVESTMENT_MARKET_DATA_ENDPOINT).',
      [{ id: 'notice', title: 'Not connected -- no market data endpoint', kind: 'text', body: lines.join(NL) }]);
    return;
  }

  if (dryRun) {
    const lines = formatRequest('Market data request (dry run -- not sent)');
    lines.push('');
    lines.push('The request above is what would be sent to ' + endpoint + ' for real.');
    emit(true, 'dry-run', requestSummary, null,
       [{ id: 'staged', title: 'Staged request', kind: 'text', body: lines.join(NL) }]);
    return;
  }

  var apiKey = String(input.apiKey || (process.env.INVESTMENT_MARKET_DATA_API_KEY || '')).trim();

  var headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;

  var url = new URL(endpoint);
  url.searchParams.set('action', action);
  if (symbols.length) url.searchParams.set('symbols', symbols.join(','));
  if (symbol) url.searchParams.set('symbol', symbol);
  if (interval) url.searchParams.set('interval', interval);
  if (startDate) url.searchParams.set('startDate', startDate);
  if (endDate) url.searchParams.set('endDate', endDate);
  if (fields.length) url.searchParams.set('fields', fields.join(','));
  if (adjustments) url.searchParams.set('adjustments', adjustments);

  var respLines = [];
  respLines.push('Live market data request sent');
  respLines.push('  Endpoint: ' + endpoint);
  respLines.push('  Action: ' + action);
  if (symbols.length) respLines.push('  Symbols: ' + symbols.join(', '));
  if (symbol) respLines.push('  Symbol: ' + symbol);
  respLines.push('  Sent: ' + new Date().toISOString());

  try {
    var res = await fetch(url.toString(), { method: 'GET', headers: headers });
    var contentType = res.headers.get('content-type') || '';
    var payload = null;
    if (contentType.includes('application/json')) {
      try { payload = await res.json(); } catch (e) { payload = null; }
    } else {
      var text = await res.text();
      payload = { raw: text.slice(0, 2000) };
    }

    var detailLines = [];
    detailLines.push('Response received from ' + endpoint + '.');
    detailLines.push('  HTTP status: ' + res.status + ' ' + res.statusText);
    detailLines.push('  Content type: ' + contentType);
    if (payload && typeof payload === 'object') {
      var keys = Object.keys(payload);
      detailLines.push('  Fields returned: ' + (keys.length ? keys.join(', ') : '(none)'));
      if (payload.error !== undefined) detailLines.push('  Server error: ' + String(payload.error));
      if (payload.data !== undefined) detailLines.push('  Data present: ' + (payload.data !== null ? 'yes' : 'no'));
    } else if (payload !== null) {
      detailLines.push('  Response body: ' + String(payload).slice(0, 200));
    }

    try {
      fs.writeFileSync(storePath, JSON.stringify({ endpoint: endpoint, action: action, timestamp: new Date().toISOString(), httpStatus: res.status, payload: payload }, null, 2));
    } catch (e) {}

    emit(res.ok, res.ok ? 'ok' : 'error',
      { action: action, system: 'investment-advisor', endpoint: endpoint, request: { action: action, symbols: symbols, symbol: symbol, interval: interval, startDate: startDate, endDate: endDate, fields: fields, adjustments: adjustments }, response: { status: res.status, ok: res.ok, contentType: contentType, payload: payload }, sent: true, storePath: storePath },
      res.ok ? null : 'Market data request to ' + endpoint + ' returned HTTP ' + res.status + ' ' + res.statusText,
      [{ id: 'response', title: 'Market data response', kind: 'text', body: respLines.join(NL) },
       { id: 'details', title: 'Response details', kind: 'text', body: detailLines.join(NL) }]);
  } catch (error) {
    var msg = (error && error.message) ? error.message : String(error);
    var errLines = respLines.slice();
    errLines.push('  Error: ' + msg);
    emit(false, 'error', null, msg,
      [{ id: 'notice', title: 'Market data request failed', kind: 'text', body: errLines.join(NL) }]);
  }
})();`;

const marketDataConfigSchema = {
  type: 'object',
  properties: {
    provider: { type: 'string', enum: ['bloomberg', 'refinitiv', 'alphavantage', 'polygon', 'iex', 'twelvedata', 'custom'], description: 'Market data provider to use' },
    defaultExchange: { type: 'string', description: 'Default exchange for symbol resolution' },
    dataTypes: { type: 'array', items: SchemaProps.text({ description: 'Data type to fetch' }), description: 'Types of data to fetch' },
    cacheTtlSeconds: { type: 'number', description: 'Cache time-to-live in seconds' },
    rateLimitPerSecond: { type: 'number', description: 'Maximum requests per second' },
    timeoutMs: { type: 'number', description: 'Request timeout in milliseconds' },
    endpoint: { type: 'string', format: 'uri', description: 'Market data API base URL (env: INVESTMENT_MARKET_DATA_ENDPOINT)' },
    apiKey: { type: 'string', format: 'password', sensitive: true, description: 'API key for the market data provider (env: INVESTMENT_MARKET_DATA_API_KEY)' },
  },
};

const marketDataInputSchema = {
  type: 'object',
  properties: {
    action: SchemaProps.select(['quote', 'historical', 'fundamentals', 'options-chain', 'news', 'economic-calendar', 'search-symbols'], { description: 'Market data action to perform' }),
    symbols: SchemaProps.stringArray({ description: 'Stock symbols to query' }),
    symbol: SchemaProps.text({ description: 'Single stock symbol' }),
    interval: SchemaProps.select(['1m', '5m', '15m', '1h', '1d', '1w', '1mo'], { description: 'Data interval for historical queries' }),
    startDate: SchemaProps.text({ description: 'Start date (ISO 8601)' }),
    endDate: SchemaProps.text({ description: 'End date (ISO 8601)' }),
    fields: SchemaProps.stringArray({ description: 'Specific fields to return' }),
    adjustments: SchemaProps.select(['none', 'split', 'dividend', 'all'], { description: 'Price adjustment method' }),
    endpoint: SchemaProps.text({ description: 'Override endpoint URL for this request only (defaults to env var)' }),
    apiKey: SchemaProps.text({ description: 'Override API key for this request only (defaults to env var)' }),
    dryRun: SchemaProps.boolean({ description: 'Preview the request without sending it', default: true }),
    confirmation: SchemaProps.boolean({ description: 'Explicit confirmation for a live request' }),
  },
  required: ['action'],
};

const INVESTMENT_MARKET_DATA = createCodeSkill({
  id: 'investment-market-data',
  name: 'Investment Market Data',
  description:
    'Retrieves real-time or historical market data (quotes, historical prices, fundamentals, options chains, news, and economic calendar events) for supplied symbols. Reads the endpoint from the INVESTMENT_MARKET_DATA_ENDPOINT environment variable. Defaults to dry run; a live request requires confirmation: true. When no endpoint is configured, reports the staged request and marks itself not-connected rather than inventing data.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: MARKET_DATA_SOURCE,
    persistenceEnv: 'INVESTMENT_HOME',
    configSchema: marketDataConfigSchema,
    endpointEnvVar: 'INVESTMENT_MARKET_DATA_ENDPOINT',
    confirmBeforeSend: true,
    timeoutMs: 15000,
  },
  inputSchema: marketDataInputSchema,
  outputSchema: investmentResultSchema('Market data request metadata, response, and staging record'),
  confirmBeforeSend: true,
  timeoutMs: 15000,
  tier: 'represent',
  domainKnowledge: 'Market data retrieval, ticker symbols, OHLCV time series, fundamental ratios, options chains, economic calendar events',
  triggers: [
    { kind: 'schedule', cadence: 'daily market data refresh' },
    { kind: 'user', phrase_examples: ['Get quotes for AAPL and MSFT', 'Show historical prices for TSLA', 'Look up Apple fundamentals', 'Check the economic calendar'] },
  ],
  isSkill: true,
});

export { INVESTMENT_MARKET_DATA };
