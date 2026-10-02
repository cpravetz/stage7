// @ts-nocheck
import { createDeclarativeCodeSkill } from '../code-skill-factory';
import { ANALYTICS_CONFIG_SCHEMA, ANALYTICS_INPUT_SCHEMA, ANALYTICS_OUTPUT_SCHEMA } from './analytics-contract';

export const ANALYTICS_SCHEDULED_TREND_MONITOR = createDeclarativeCodeSkill({
  id: 'analytics-scheduled-trend-monitor',
  name: 'Scheduled Trend Monitor',
  description: 'Runs periodic grounded trend analysis on warehouse or local business metrics on a schedule. Detects trends, anomalies, and statistical signals over time windows.',
  persistenceEnvVar: 'ANALYTICS_HOME',
  inputSchema: ANALYTICS_INPUT_SCHEMA,
  outputSchema: ANALYTICS_OUTPUT_SCHEMA,
  triggers: [
    { kind: 'schedule', cadence: 'Daily metric trend analysis' },
  ],
  manifest: {
    configSchema: ANALYTICS_CONFIG_SCHEMA,
    credentialSource: {
      // Config/vault only: the Skill declares its own not-connected branch, and
      // gating on a required credential would make that branch unreachable.
      apiKey: { configKey: 'analytics.warehouse.apiKey', required: false, label: 'warehouse API key (set analytics.warehouse.apiKey in this Skill configuration, or a vault secret)' },
    },
    timeoutMs: 120000
  },
  handler: async function handler(input, ctx) {
      const mode = input.mode || 'report';
      const metric = input.metric || input.dataset || '';
      const period = input.period || '30d';
      const timeframe = input.timeframe || '30d';
      const sourceMode = input.sourceMode || 'auto';
      const dryRun = input.dryRun === true;
      const metricsPath = input.metricsPath || '';
      const warehouseConfigPath = input.warehouseConfigPath || '';
      const endpoint = input.endpointUrl || String(ctx.config?.endpointUrl || '');
      const apiKey = (ctx.getCredential ? ctx.getCredential('apiKey') : undefined) || '';

      function output(modeValue, sourceValue, warehouseValue, connectorValue, dataValue, errorValue, noteValue) {
        const failed = modeValue === 'not-connected' || modeValue === 'error';
        const envelope = {
          success: !failed,
          source: sourceValue,
          warehouseConnected: warehouseValue,
          connectorStatus: connectorValue,
          data: dataValue || {},
          error: errorValue || null,
          note: noteValue || null,
        };
        // A failure envelope with nothing to render leaves the operator staring
        // at a blank panel, so the reason is surfaced as a block too.
        if (failed && errorValue) {
          envelope.present = [ctx.render.text(
            'analytics-error',
            failed && modeValue === 'not-connected' ? 'Connection required' : 'Analytics error',
            String(errorValue) + (noteValue ? '\n\n' + String(noteValue) : '')
          )];
        }
        return envelope;
      }

      function normalizeRows(value) {
        if (Array.isArray(value)) return value;
        if (!value || typeof value !== 'object') return [];
        if (Array.isArray(value.rows)) return value.rows;
        if (Array.isArray(value.data)) return value.data;
        if (Array.isArray(value.result)) return value.result;
        if (Array.isArray(value.metrics)) return value.metrics;
        if (Array.isArray(value.record)) return value.record;
        return [];
      }

      function readLocalStore() {
        try {
          const parsed = ctx.store.load('metricsPath', null);
          if (!parsed) return { metrics: [], data: [] };
          if (Array.isArray(parsed)) return { metrics: [], data: parsed };
          return {
            metrics: Array.isArray(parsed.metrics) ? parsed.metrics : [],
            data: Array.isArray(parsed.data) ? parsed.data : [],
          };
        } catch (error) {
          return { metrics: [], data: [] };
        }
      }

      function readWarehouseConfig() {
        try {
          const parsed = ctx.store.load('warehouseConfigPath', null);
          if (!parsed) throw new Error('Warehouse configuration is not available');
          return {
            endpoint: parsed.endpointUrl || parsed.endpoint || parsed.baseUrl || parsed.url || '',
            apiKey: parsed.apiKey || parsed.token || parsed.accessToken || '',
            provider: parsed.provider || 'custom',
            database: parsed.defaultDatabase || parsed.database || '',
            warehouse: parsed.defaultWarehouse || parsed.warehouse || '',
            queryTimeoutMs: Number(parsed.queryTimeoutMs) || 120000,
          };
        } catch (error) {
          return { endpoint: '', apiKey: '', provider: 'custom', database: '', warehouse: '', queryTimeoutMs: 120000 };
        }
      }

      function safeIdentifier(value) {
        return String(value || 'value').replace(/[^A-Za-z0-9_]/g, '_');
      }

      function buildQuery() {
        const requested = input.query || input.warehouseQuery;
        if (requested) return String(requested);
        const field = safeIdentifier(metric || 'value');
        const filters = input.filters && typeof input.filters === 'object' ? input.filters : {};
        const filterText = Object.keys(filters).length ? ' AND ' + Object.keys(filters).map((key) => key + ' = ' + JSON.stringify(filters[key])).join(' AND ') : '';
        return 'SELECT date, ' + field + ' AS value FROM metrics WHERE date >= CURRENT_DATE - INTERVAL ' + JSON.stringify(period) + filterText + ' ORDER BY date';
      }

      function sliceData(periodValue, dataArray) {
        const data = Array.isArray(dataArray) ? dataArray : [];
        if (periodValue === '7d') return data.slice(-7);
        if (periodValue === '30d') return data.slice(-30);
        if (periodValue === '90d') return data.slice(-90);
        if (periodValue === '1y') {
          const start = new Date();
          start.setFullYear(start.getFullYear() - 1);
          return data.filter((row) => new Date(row.date) >= start);
        }
        if (periodValue === 'YTD') {
          const start = new Date(new Date().getFullYear(), 0, 1);
          return data.filter((row) => new Date(row.date) >= start);
        }
        return data.slice(-30);
      }

      function computeStats(values) {
        const nums = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
        if (!nums.length) return { sum: 0, avg: 0, min: 0, max: 0, growthRate: 0, pctChange: 0 };
        const sum = nums.reduce((total, value) => total + value, 0);
        const avg = sum / nums.length;
        const min = Math.min.apply(null, nums);
        const max = Math.max.apply(null, nums);
        const first = nums[0];
        const last = nums[nums.length - 1];
        const pctChange = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
        const growthRate = nums.length > 1 ? (last - first) / (nums.length - 1) : 0;
        return { sum: Math.round(sum * 100) / 100, avg: Math.round(avg * 100) / 100, min, max, growthRate: Math.round(growthRate * 100) / 100, pctChange: Math.round(pctChange * 100) / 100 };
      }

      function linearRegression(values) {
        const nums = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
        const n = nums.length;
        if (n < 2) return { slope: 0, intercept: nums[0] || 0, rSquared: 0 };
        let sumX = 0;
        let sumY = 0;
        let sumXY = 0;
        let sumX2 = 0;
        let sumY2 = 0;
        for (let index = 0; index < n; index += 1) {
          sumX += index;
          sumY += nums[index];
          sumXY += index * nums[index];
          sumX2 += index * index;
          sumY2 += nums[index] * nums[index];
        }
        const denom = n * sumX2 - sumX * sumX;
        const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
        const intercept = (sumY - slope * sumX) / n;
        const meanY = sumY / n;
        const ssRes = nums.reduce((total, value, index) => total + Math.pow(value - (slope * index + intercept), 2), 0);
        const ssTot = nums.reduce((total, value) => total + Math.pow(value - meanY, 2), 0);
        return { slope: Math.round(slope * 10000) / 10000, intercept: Math.round(intercept * 10000) / 10000, rSquared: ssTot === 0 ? 0 : Math.round((1 - ssRes / ssTot) * 10000) / 10000 };
      }

      function movingAverage(values, windowSize) {
        const result = [];
        for (let index = 0; index < values.length; index += 1) {
          if (index < windowSize - 1) {
            result.push(null);
          } else {
            const windowValues = values.slice(index - windowSize + 1, index + 1);
            result.push(windowValues.reduce((total, value) => total + value, 0) / windowSize);
          }
        }
        return result;
      }

      function detectAnomalies(values, threshold) {
        const nums = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
        if (nums.length < 3) return [];
        const mean = nums.reduce((total, value) => total + value, 0) / nums.length;
        const std = Math.sqrt(nums.reduce((total, value) => total + Math.pow(value - mean, 2), 0) / nums.length);
        return nums.map((value, index) => ({ index, value, zScore: std > 0 ? Math.round(((value - mean) / std) * 100) / 100 : 0 })).filter((item) => Math.abs(item.zScore) > threshold);
      }

      function metricValues(rows, metricName) {
        return rows.map((row) => row && (row[metricName] ?? row.value ?? row.metric_value)).filter((value) => typeof value === 'number' && Number.isFinite(value));
      }

      function insightFor(rows, analysisMode) {
        const selectedPeriod = analysisMode === 'trends' ? timeframe : period;
        const slice = sliceData(selectedPeriod, rows);
        const values = metricValues(slice, metric);
        if (!values.length) return null;
        const stats = computeStats(values);
        const regression = linearRegression(values);
        const anomalies = detectAnomalies(values, 2);
        const trendDirection = regression.slope > 0.01 ? 'increasing' : regression.slope < -0.01 ? 'decreasing' : 'flat';
        const confidence = regression.rSquared > 0.7 ? 'high' : regression.rSquared > 0.4 ? 'medium' : 'low';
        const interpretation = analysisMode === 'trends'
          ? (trendDirection === 'increasing' ? 'Upward trend detected' : trendDirection === 'decreasing' ? 'Downward trend detected' : 'No clear trend')
          : (stats.pctChange > 10 ? 'Strong positive movement' : stats.pctChange < -10 ? 'Significant decline' : 'Relatively stable');
        const recommendation = stats.pctChange < -10 ? 'Investigate root causes and validate the affected metric definition.' : anomalies.length ? 'Review anomalous periods before acting on the metric.' : 'Continue monitoring and compare against the agreed business baseline.';
        return {
          metric,
          period: selectedPeriod,
          dataPoints: values.length,
          stats,
          trend: analysisMode === 'trends' ? { direction: trendDirection, slope: regression.slope, rSquared: regression.rSquared, confidence } : undefined,
          movingAverages: analysisMode === 'trends' ? { ma7: movingAverage(values, 7).slice(-7), ma30: movingAverage(values, 30).slice(-7) } : undefined,
          anomalies: anomalies.map((item) => ({ index: item.index, value: item.value, severity: Math.abs(item.zScore) > 3 ? 'critical' : 'warning' })),
          breakdown: slice.map((row, index) => ({ date: row.date || null, value: values[index] })),
          interpretation,
          recommendation,
          explanation: interpretation + '. ' + recommendation,
        };
      }

      function connectorFromConfig() {
        const config = readWarehouseConfig();
        return {
          endpoint: endpoint || config.endpoint,
          apiKey: apiKey || config.apiKey,
          provider: input.provider || config.provider || 'custom',
          database: input.database || config.database || '',
          warehouse: input.warehouse || config.warehouse || '',
          queryTimeoutMs: Math.max(1000, Number(input.queryTimeoutMs) || Number(config.queryTimeoutMs) || 120000),
        };
      }

      async function fetchWarehouse() {
        const connector = connectorFromConfig();
        const query = buildQuery();
        if (dryRun) {
          return { connected: false, status: 'not-executed', rows: [], query, connector };
        }
        if (!connector.endpoint || !connector.apiKey) {
          return { connected: false, status: 'not-configured', rows: [], query, connector };
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), connector.queryTimeoutMs);
        try {
          const response = await fetch(connector.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': connector.apiKey },
            body: JSON.stringify({ query, parameters: input.parameters || {}, metric, mode, provider: connector.provider, database: connector.database, warehouse: connector.warehouse, dimensions: input.dimensions || [], filters: input.filters || {} }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (!response.ok) {
            return { connected: false, status: 'unavailable', rows: [], query, connector, error: 'Warehouse returned HTTP ' + response.status };
          }
          const payload = await response.json().catch(() => null);
          return { connected: true, status: 'connected', rows: normalizeRows(payload), query, connector, payload };
        } catch (error) {
          clearTimeout(timeout);
          return { connected: false, status: 'unavailable', rows: [], query, connector, error: error instanceof Error ? error.message : String(error) };
        }
      }

      try {
        if (!['report', 'trends', 'query'].includes(mode)) {
          const result = output('error', 'not-connected', false, 'not-configured', {}, 'Invalid analytics mode. Use report, trends, or query.', null);

          return result;
        }

        const localStore = readLocalStore();
        const availableMetrics = localStore.metrics.length ? localStore.metrics : Object.keys(localStore.data[0] || {}).filter((key) => key !== 'date');
        if ((mode === 'report' || mode === 'trends') && !metric) {
          const result = output('error', 'not-connected', false, 'not-configured', { availableMetrics }, 'A metric or dataset is required for report and trend analysis.', null);

          return result;
        }
        if (mode === 'query' && !input.query && !input.warehouseQuery && !metric) {
          const result = output('error', 'not-connected', false, 'not-configured', {}, 'A query or metric is required for query analysis.', null);

          return result;
        }
        if ((mode === 'report' || mode === 'trends') && sourceMode === 'local' && !availableMetrics.includes(metric)) {
          const result = output('error', 'not-connected', false, 'not-configured', { availableMetrics }, 'Unknown metric: ' + metric + '.', null);

          return result;
        }

        const warehouseRequested = sourceMode !== 'local';
        const warehouse = warehouseRequested ? await fetchWarehouse() : { connected: false, status: 'not-executed', rows: [], query: buildQuery(), connector: connectorFromConfig() };
        const warehouseRows = warehouse.rows || [];
        const localRows = localStore.data || [];
        const useWarehouse = warehouse.connected && warehouseRows.length > 0;
        const rows = useWarehouse ? warehouseRows : localRows;

        if (!rows.length) {
          const notConnected = output('not-connected', 'not-connected', warehouse.connected, warehouse.status, { query: warehouse.query || null, availableMetrics }, 'No grounded analytics data is available. Connect the warehouse or populate the local metrics store.', warehouse.status === 'not-configured' ? 'Warehouse is not connected; no live or local data was found.' : 'Warehouse data was unavailable or empty; no local fallback was available.');

          return notConnected;
        }

        if (dryRun) {
          const plan = output('dry-run', 'query-plan', false, 'not-executed', { query: warehouse.query || buildQuery(), parameters: input.parameters || {}, metric, mode, sourceMode }, null, 'Query plan prepared without executing a warehouse request.');

          return plan;
        }

        if (mode === 'query') {
          const sample = rows.slice(0, 20);
          const result = output(useWarehouse ? 'live' : 'local', useWarehouse ? 'warehouse' : 'local', useWarehouse, warehouse.status, { query: warehouse.query || buildQuery(), rowCount: rows.length, sample, explanation: 'Returned rows are grounded in the selected warehouse or local cache. Review the query and metric definitions before using them for a decision.' }, null, useWarehouse ? 'Warehouse query executed successfully.' : 'Query result uses the local metrics cache because the warehouse was not used.');

          return result;
        }

        const insight = insightFor(rows, mode);
        if (!insight) {
          const result = output('not-connected', 'not-connected', warehouse.connected, warehouse.status, { query: warehouse.query || null, availableMetrics }, 'No numeric values are available for metric ' + metric + '.', 'The selected source did not contain a usable metric series.');

          return result;
        }

        const source = useWarehouse ? 'warehouse' : (warehouseRequested && (warehouse.status === 'unavailable' || warehouse.status === 'not-configured') ? 'local-fallback' : 'local');
        const result = output(useWarehouse ? 'live' : 'local', source, useWarehouse, warehouse.status, { insight }, null, useWarehouse ? 'Analysis includes live warehouse data.' : (source === 'local-fallback' ? 'Warehouse was unavailable; this analysis uses the local cache and may be stale.' : 'Analysis uses the local metrics cache; it is not live warehouse data.'));

        return result;
      } catch (error) {
        const result = output('error', 'not-connected', false, 'unavailable', {}, error instanceof Error ? error.message : String(error), 'Analytics execution failed before a grounded result could be produced.');

        return result;
      }
    }
  });
