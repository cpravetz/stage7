// @ts-nocheck

import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

export const ANALYTICS_PLANNING = createDeclarativeCodeSkill({
  id: 'analytics-planning',
  name: 'Support Analytics & Planning',
  description: 'Analyze support metrics, trends, and performance data, and plan capacity, staffing, and resource allocation.',
  persistenceEnvVar: 'SUPPORT_HOME',
  tier: 'advise',
  domainKnowledge: 'Customer success metrics (CSAT, NPS, Churn Rate), SLA management, support escalation tiers, ticket triage',
  inputSchema: {
    type: 'object',
    properties: {
      metric: SchemaProps.text({ description: 'Metric name to analyze' }),
      period: SchemaProps.select(['7d', '30d', '90d', 'YTD', '1y'], { description: 'Time period for analysis', default: '30d' }),
      granularity: SchemaProps.select(['day', 'week', 'month'], { description: 'Time granularity', default: 'day' }),
      reportType: SchemaProps.select(['operational', 'financial', 'quality', 'customer_satisfaction'], { description: 'Report category type' }),
      dateRange: SchemaProps.object({ start: SchemaProps.text({ description: 'Start date (ISO 8601)' }), end: SchemaProps.text({ description: 'End date (ISO 8601)' }) }, { description: 'Date range' }),
      facility: SchemaProps.text({ description: 'Facility identifier' }),
    },
    required: [],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['success', 'data'],
  },
  triggers: [
    { kind: 'schedule', cadence: 'Daily CSAT analytics review' },
  ],
  isSkill: true,
  manifest: {},
  handler: async function handler(input, ctx) {
      const metric = input.metric || '';
      const period = input.period || '30d';
      const granularity = input.granularity || 'day';

      function sliceData(pd, arr) {
        const now = new Date(); let sd;
        if (pd === '7d') { sd = new Date(now); sd.setDate(now.getDate() - 6); }
        else if (pd === '30d') { sd = new Date(now); sd.setDate(now.getDate() - 29); }
        else if (pd === '90d') { sd = new Date(now); sd.setDate(now.getDate() - 89); }
        else if (pd === 'YTD') { sd = new Date(now.getFullYear(), 0, 1); }
        else if (pd === '1y') { sd = new Date(now); sd.setFullYear(now.getFullYear() - 1); }
        else { sd = new Date(now); sd.setDate(now.getDate() - 29); }
        return arr.filter(d => { const dd = new Date(d.date); return dd >= sd; });
      }
      function computeStats(values) {
        const nums = values.filter(v => typeof v === 'number');
        if (!nums.length) return { sum: 0, avg: 0, min: 0, max: 0, count: 0 };
        const sum = nums.reduce((a, b) => a + b, 0);
        return { sum, avg: Math.round(sum / nums.length * 100) / 100, min: Math.min(...nums), max: Math.max(...nums), count: nums.length };
      }
      const store = ctx.store.load('analytics', []);
      const slice = sliceData(period, store);
      const result = { success: true, data: { type: 'dashboard', metric, period, granularity, stats: computeStats(slice.map(d => d.value || 0)), recordCount: slice.length, source: 'local' } };

      return result;
    }
  });
