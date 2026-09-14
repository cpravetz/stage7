import { Tool } from '../../../types';
import { createExternalActionSkill, createCodeSkill, SchemaProps } from '../code-skill-factory';

const ANALYTICS_EXTERNAL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    mode: { type: 'string', enum: ['dry-run', 'live', 'error'] },
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
  required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
};

const BUSINESS_INSIGHT_REPORT = createCodeSkill({
  id: 'analytics_business_insight_report',
  name: 'Business Insight Report',
  description:
    'Generate a business intelligence report or identify trends from connected data warehouses, BI tools, or local metrics. Returns interpreted insights with anomaly flags and recommended next steps, not just raw numbers.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const mode = input.mode || 'report';
const metric = input.metric || '';
const period = input.period || '30d';
const dataset = input.dataset || '';
const timeframe = input.timeframe || '30d';

const baseDir = process.env.ANALYTICS_HOME || path.join('/tmp/analytics');
const metricsPath = process.env.ANALYTICS_METRICS_PATH || path.join(baseDir, 'metrics.json');
const warehouseConfigPath = process.env.ANALYTICS_WAREHOUSE_CONFIG || path.join(baseDir, 'warehouse-config.json');

fs.mkdirSync(baseDir, { recursive: true });

let warehouseConnected = false;
let warehouseConfig = {};
if (fs.existsSync(warehouseConfigPath)) {
  try { warehouseConfig = JSON.parse(fs.readFileSync(warehouseConfigPath, 'utf8')); warehouseConnected = true; } catch(e) {}
}

let metricsStore = { metrics: [], data: [] };
if (fs.existsSync(metricsPath)) {
  try { metricsStore = JSON.parse(fs.readFileSync(metricsPath, 'utf8')); } catch(e) {}
}

const availableMetrics = metricsStore.metrics || [];
const data = metricsStore.data || [];

function sliceData(periodStr, dataArray) {
  const now = new Date();
  let startDate;
  if (periodStr === '7d') { startDate = new Date(now); startDate.setDate(now.getDate() - 6); return dataArray.slice(-7); }
  if (periodStr === '30d') { startDate = new Date(now); startDate.setDate(now.getDate() - 29); return dataArray.slice(-30); }
  if (periodStr === '90d') { startDate = new Date(now); startDate.setDate(now.getDate() - 89); return dataArray.slice(-90); }
  if (periodStr === 'YTD') { startDate = new Date(now.getFullYear(), 0, 1); return dataArray.filter(d => new Date(d.date) >= startDate); }
  if (periodStr === '1y') { startDate = new Date(now); startDate.setFullYear(now.getFullYear() - 1); return dataArray.filter(d => new Date(d.date) >= startDate); }
  return dataArray.slice(-30);
}

function computeStats(values) {
  const nums = values.filter(v => typeof v === 'number');
  if (!nums.length) return { sum: 0, avg: 0, min: 0, max: 0, growthRate: 0, pctChange: 0 };
  const sum = nums.reduce((a, b) => a + b, 0);
  const avg = sum / nums.length;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const first = nums[0];
  const last = nums[nums.length - 1];
  const pctChange = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
  const growthRate = nums.length > 1 ? (last - first) / (nums.length - 1) : 0;
  return { sum, avg, min, max, growthRate, pctChange };
}

function linearRegression(values) {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0, rSquared: 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) { sumX += i; sumY += values[i]; sumXY += i * values[i]; sumX2 += i * i; sumY2 += values[i] * values[i]; }
  const denom = (n * sumX2 - sumX * sumX);
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  const ssRes = values.reduce((s, y, i) => s + Math.pow(y - (slope * i + intercept), 2), 0);
  const ssTot = values.reduce((s, y) => s + Math.pow(y - meanY, 2), 0);
  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { slope, intercept, rSquared };
}

function movingAverage(values, window) {
  const result = [];
  for (let i = 0; i < values.length; i++) {
    if (i < window - 1) result.push(null);
    else { const w = values.slice(i - window + 1, i + 1); result.push(w.reduce((a, b) => a + b, 0) / window); }
  }
  return result;
}

function detectAnomalies(values, threshold = 2) {
  const nums = values.filter(v => typeof v === 'number');
  if (nums.length < 3) return [];
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const std = Math.sqrt(nums.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / nums.length);
  return nums.map((v, i) => ({ index: i, value: v, zScore: std > 0 ? (v - mean) / std : 0 })).filter(a => Math.abs(a.zScore) > threshold);
}

if (mode === 'report') {
  if (!metric) {
    console.log(JSON.stringify({ success: false, error: 'No metric specified. Available: ' + availableMetrics.join(', ') }));
  } else if (!availableMetrics.includes(metric)) {
    console.log(JSON.stringify({ success: false, error: 'Unknown metric: ' + metric + '. Available: ' + availableMetrics.join(', ') }));
  } else {
    const slice = sliceData(period, data);
    if (slice.length === 0) {
      console.log(JSON.stringify({ success: false, error: 'No data available for metric ' + metric + ' and period ' + period }));
    } else {
      const values = slice.map(d => d[metric]).filter(v => typeof v === 'number');
      const stats = computeStats(values);
      const breakdown = slice.map(d => ({ date: d.date, value: d[metric] }));
      const anomalies = detectAnomalies(values);

      const insight = {
        metric,
        period,
        dataPoints: values.length,
        stats,
        breakdown,
        anomalies: anomalies.map(a => ({ index: a.index, value: a.value, severity: Math.abs(a.zScore) > 3 ? 'critical' : 'warning' })),
        interpretation: stats.pctChange > 10 ? 'Strong positive trend' : stats.pctChange < -10 ? 'Significant decline' : 'Relatively stable',
        recommendation: stats.pctChange < -10 ? 'Investigate root cause of decline' : anomalies.length ? 'Review anomalous data points' : 'Continue monitoring',
        source: warehouseConnected ? 'warehouse' : 'local',
        note: warehouseConnected ? undefined : 'No warehouse connected; using local metrics store. Connect a warehouse (Snowflake, BigQuery, Redshift, Postgres) for live data.',
      };

      console.log(JSON.stringify({ success: true, data: { insight, storePath: metricsPath } }));
    }
  }
} else if (mode === 'trends') {
  if (!dataset && !metric) {
    console.log(JSON.stringify({ success: false, error: 'Either dataset or metric must be specified. Available metrics: ' + availableMetrics.join(', ') }));
  } else {
    const targetMetric = metric || dataset;
    if (!availableMetrics.includes(targetMetric)) {
      console.log(JSON.stringify({ success: false, error: 'Unknown metric: ' + targetMetric + '. Available: ' + availableMetrics.join(', ') }));
    } else {
      const slice = sliceData(timeframe, data);
      if (slice.length === 0) {
        console.log(JSON.stringify({ success: false, error: 'No data available for metric ' + targetMetric + ' and timeframe ' + timeframe }));
      } else {
        const values = slice.map(d => d[targetMetric]).filter(v => typeof v === 'number');
        const regression = linearRegression(values);
        const ma7 = movingAverage(values, 7);
        const ma30 = movingAverage(values, 30);
        const anomalies = detectAnomalies(values);

        const trendDirection = regression.slope > 0.01 ? 'increasing' : regression.slope < -0.01 ? 'decreasing' : 'flat';
        const confidence = regression.rSquared > 0.7 ? 'high' : regression.rSquared > 0.4 ? 'medium' : 'low';

        const insight = {
          metric: targetMetric,
          timeframe,
          dataPoints: values.length,
          trend: { direction: trendDirection, slope: regression.slope, rSquared: regression.rSquared, confidence },
          movingAverages: { ma7: ma7.slice(-7), ma30: ma30.slice(-7) },
          anomalies: anomalies.map(a => ({ index: a.index, value: a.value, severity: Math.abs(a.zScore) > 3 ? 'critical' : 'warning' })),
          interpretation: trendDirection === 'increasing' ? 'Upward trend detected' : trendDirection === 'decreasing' ? 'Downward trend detected' : 'No clear trend',
          recommendation: trendDirection === 'decreasing' ? 'Investigate drivers of decline' : anomalies.length ? 'Review anomalous periods' : 'Trend is stable; monitor for changes',
          source: warehouseConnected ? 'warehouse' : 'local',
          note: warehouseConnected ? undefined : 'No warehouse connected; using local metrics store. Connect a warehouse for live trend analysis.',
        };

        console.log(JSON.stringify({ success: true, data: { insight, storePath: metricsPath } }));
      }
    }
  }
} else {
  console.log(JSON.stringify({ success: false, error: 'Invalid mode. Use "report" or "trends".' }));
}
`,
  },
  inputSchema: {
    type: 'object',
    properties: {
      mode: SchemaProps.select(['report', 'trends'], { description: 'Operation mode: "report" for metric summary with stats, "trends" for trend analysis with regression' }),
      metric: SchemaProps.text({ description: 'Metric name to analyze (e.g., page_views, conversions, revenue)' }),
      period: SchemaProps.text({ description: 'Time period for report mode (e.g., 7d, 30d, 90d, YTD, 1y)', default: '30d' }),
      dataset: SchemaProps.text({ description: 'Dataset name for trends mode (alias for metric)' }),
      timeframe: SchemaProps.text({ description: 'Timeframe for trends mode (e.g., 7d, 30d, 90d, 1y)', default: '30d' }),
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: {
        type: 'object',
        properties: {
          insight: { type: 'object' },
          storePath: { type: 'string' },
        },
      },
      error: { type: 'string' },
    },
    required: ['success'],
  },
});

const WAREHOUSE_QUERY = createExternalActionSkill({
  id: 'analytics_warehouse_query',
  name: 'Warehouse Query',
  description: 'Query a connected data warehouse (Snowflake, BigQuery, Redshift, Postgres, etc.) for raw metrics data to feed into Business Insight Report.',
  system: 'data_warehouse',
  action: 'query',
  endpoint: { envVar: 'ANALYTICS_WAREHOUSE_ENDPOINT', method: 'POST' },
  auth: {
    type: 'api_key',
    header: 'X-API-Key',
    credentialEnvKeyMap: { apiKey: 'ANALYTICS_WAREHOUSE_API_KEY' },
  },
  configSchema: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string', description: 'Data warehouse API base URL' },
      apiKey: { type: 'string', description: 'Data warehouse API key' },
      provider: { type: 'string', enum: ['snowflake', 'bigquery', 'redshift', 'postgres', 'mysql', 'clickhouse', 'custom'], description: 'Warehouse provider' },
      defaultDatabase: { type: 'string', description: 'Default database/schema' },
      defaultWarehouse: { type: 'string', description: 'Default warehouse/compute resource' },
      queryTimeoutMs: { type: 'number', description: 'Default query timeout in milliseconds' },
    },
    required: ['baseUrl', 'apiKey', 'provider'],
  },
  credentialSource: {
    apiKey: { envVar: 'ANALYTICS_WAREHOUSE_API_KEY', configKey: 'analytics.warehouse.apiKey' },
  },
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'SQL query to execute' },
      parameters: { type: 'object', description: 'Query parameters' },
      warehouse: { type: 'string', description: 'Warehouse/compute resource to use' },
      database: { type: 'string', description: 'Database/schema to query' },
      endpointUrl: { type: 'string', description: 'Optional endpoint override' },
      dryRun: { type: 'boolean', description: 'Validate without executing' },
    },
    required: ['query'],
  },
  outputSchema: ANALYTICS_EXTERNAL_OUTPUT_SCHEMA,
  timeoutMs: 120000,
});

export const analyticsSkills = [BUSINESS_INSIGHT_REPORT, WAREHOUSE_QUERY];