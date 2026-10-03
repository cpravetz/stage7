// @ts-nocheck

import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';
import { investmentResultSchema } from '../investment-contract';

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
  },
};

const marketDataInputSchema = {
  type: 'object',
  properties: {
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
  required: ['symbols'],
};

const INVESTMENT_MARKET_DATA = createDeclarativeCodeSkill({
  id: 'investment-market-data',
  name: 'Investment Market Data',
  description:
    'Retrieves real-time or historical market data (quotes, historical prices, fundamentals, options chains, news, and economic calendar events) for supplied symbols. Reads the endpoint from the INVESTMENT_MARKET_DATA_ENDPOINT environment variable. Defaults to dry run; a live request requires confirmation: true. When no endpoint is configured, reports the staged request and marks itself not-connected rather than inventing data.',
  persistenceEnvVar: 'INVESTMENT_HOME',
  inputSchema: marketDataInputSchema,
  outputSchema: investmentResultSchema('Market data request metadata, response, and staging record'),
  timeoutMs: 15000,
  tier: 'represent',
  domainKnowledge: 'Market data retrieval, ticker symbols, OHLCV time series, fundamental ratios, options chains, economic calendar events',
  triggers: [
    { kind: 'schedule', cadence: 'daily market data refresh' },
    { kind: 'user', phrase_examples: ['Get quotes for AAPL and MSFT', 'Show historical prices for TSLA', 'Look up Apple fundamentals', 'Check the economic calendar'] },
  ],
  isSkill: true,
  manifest: {
    // Declared as a credential, not a plain config field, so the key can come from
    // the vault via `vault:<id>` and is never echoed back into emitted output.
    credentialSource: {
      apiKey: { configKey: 'apiKey', required: false, label: "upstream service API key (set in this Skill configuration, or a vault secret)" },
    },
    configSchema: marketDataConfigSchema,
    endpointConfigKey: 'endpoint',
    timeoutMs: 15000
  },
  handler: async function handler(input, ctx) {
      const NL = '\n';

      function arr(v) { return Array.isArray(v) ? v : (v != null ? [v] : []); }

      // v9 §1.1 item 3: no routing enum and no free-text `request` field. The
      // operation is what the caller supplied, not a label they chose.
      const has = (v: unknown): boolean => v != null && v !== '' && !(Array.isArray(v) && !v.length);
      const action = has(input.economicCalendar) ? 'economic-calendar'
        : has(input.news) ? 'news'
        : has(input.optionsChain) || has(input.optionSymbol) ? 'options-chain'
        : has(input.fundamentals) ? 'fundamentals'
        : has(input.startDate) || has(input.interval) ? 'historical'
        : 'quote';
      const symbols = arr(input.symbols).map(String).filter(function (s) { return s && s.trim(); });
      const symbol = typeof input.symbol === 'string' ? input.symbol.trim() : '';
      const interval = typeof input.interval === 'string' ? input.interval.trim() : '';
      const startDate = typeof input.startDate === 'string' ? input.startDate.trim() : '';
      const endDate = typeof input.endDate === 'string' ? input.endDate.trim() : '';
      const fields = arr(input.fields).map(String).filter(function (f) { return f && f.trim(); });
      const adjustments = typeof input.adjustments === 'string' ? input.adjustments.trim() : '';
      const dryRun = input.dryRun === true || input.dryRun === undefined;
      const confirmed = input.confirmation === true;

      const endpoint = String(input.endpoint || ctx.config?.endpoint || '').trim();

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
        return { success: false, status: 'blocked', data: requestSummary, error: 'No action was supplied; cannot determine what market data to retrieve.', present: [{ id: 'notice', title: 'No action specified', kind: 'text', body: lines.join(NL) }] };
        return;
      }

      if (!dryRun && !confirmed) {
        const lines = formatRequest('Market data request -- confirmation required');
        lines.push('');
        lines.push('A live request (dryRun=false) must be confirmed with confirmation: true before it is sent.');
        return { success: false, status: 'confirmation-required', data: requestSummary, error: 'A live market data request requires explicit confirmation.', present: [{ id: 'notice', title: 'Confirmation required', kind: 'text', body: lines.join(NL) }] };
        return;
      }

      if (!endpoint) {
        const lines = formatRequest('Market data request -- not connected');
        lines.push('');
        lines.push('No endpoint is configured. Set the INVESTMENT_MARKET_DATA_ENDPOINT environment variable to enable live retrieval.');
        return { success: false, status: 'not-connected', data: requestSummary, error: 'Not connected: no investment market data endpoint is configured (INVESTMENT_MARKET_DATA_ENDPOINT).', present: [{ id: 'notice', title: 'Not connected -- no market data endpoint', kind: 'text', body: lines.join(NL) }] };
        return;
      }

      if (dryRun) {
        const lines = formatRequest('Market data request (dry run -- not sent)');
        lines.push('');
        lines.push('The request above is what would be sent to ' + endpoint + ' for real.');
        return { success: true, status: 'dry-run', data: requestSummary, error: null, present: [{ id: 'staged', title: 'Staged request', kind: 'text', body: lines.join(NL) }] };
        return;
      }

      var apiKey = String((ctx.getCredential ? ctx.getCredential('apiKey') : undefined) || '').trim();

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
          ctx.store.save('market-data', { endpoint: endpoint, action: action, timestamp: new Date().toISOString(), httpStatus: res.status, payload: payload });
        } catch (e) {}

        return { success: res.ok, status: res.ok ? 'ok' : 'error', data: { action: action, system: 'investment-advisor', endpoint: endpoint, request: { action: action, symbols: symbols, symbol: symbol, interval: interval, startDate: startDate, endDate: endDate, fields: fields, adjustments: adjustments }, response: { status: res.status, ok: res.ok, contentType: contentType, payload: payload }, sent: true, storePath: ctx.store.getFilePath('market-data') }, error: res.ok ? null : 'Market data request to ' + endpoint + ' returned HTTP ' + res.status + ' ' + res.statusText, present: [{ id: 'response', title: 'Market data response', kind: 'text', body: respLines.join(NL) },
           { id: 'details', title: 'Response details', kind: 'text', body: detailLines.join(NL) }] };
      } catch (error) {
        var msg = (error && error.message) ? error.message : String(error);
        var errLines = respLines.slice();
        errLines.push('  Error: ' + msg);
        return { success: false, status: 'error', data: null, error: msg, present: [{ id: 'notice', title: 'Market data request failed', kind: 'text', body: errLines.join(NL) }] };
      }
    }
  });
INVESTMENT_MARKET_DATA.configSchema = marketDataConfigSchema;

export { INVESTMENT_MARKET_DATA };
