// @ts-nocheck
import { SchemaProps, createDeclarativeCodeSkill } from '../../../adk/code-skill-factory';

export const OPERATIONAL_ANALYTICS = createDeclarativeCodeSkill({
  id: 'healthcare-operational-analytics',
  name: 'Operational Analytics',
  description:
    'Generate healthcare operational analytics including clinical KPIs, throughput metrics, resource utilization, and financial summaries. Computes insights locally with reasoning over available data and can reference the healthcare analytics platform for deeper reporting.',
  persistenceEnvVar: 'HEALTHCARE_HOME',
  tier: 'advise',
  domainKnowledge: 'Healthcare operational analytics, clinical KPIs, throughput metrics, and resource utilization',
  inputSchema: {
    type: 'object',
    properties: {
      reportType: SchemaProps.select(['clinical', 'operational', 'financial', 'quality', 'population'], { description: 'Report category type' }),
      metric: SchemaProps.text({ description: 'Metric name to analyze (e.g., patient_volume, avg_length_of_stay, bed_occupancy)' }),
      period: SchemaProps.select(['7d', '30d', '90d', 'YTD', '1y'], { description: 'Time period for analysis', default: '30d' }),
      dateRange: SchemaProps.object({ start: SchemaProps.text({ description: 'Start date (ISO 8601)' }), end: SchemaProps.text({ description: 'End date (ISO 8601)' }) }, { description: 'Custom date range for analysis' }),
      facility: SchemaProps.text({ description: 'Facility identifier for filtering' }),
      provider: SchemaProps.text({ description: 'Provider identifier for filtering' }),
      filterCriteria: SchemaProps.object({}, { description: 'Additional filter criteria as key-value pairs' }),
      granularity: SchemaProps.select(['day', 'week', 'month', 'quarter'], { description: 'Time granularity for aggregation', default: 'day' }),
      format: SchemaProps.select(['json', 'csv', 'pdf'], { description: 'Output format for export' }),
    },
    required: [],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          reportType: { type: 'string' },
          period: { type: 'string' },
          granularity: { type: 'string' },
          kpis: { type: 'object' },
          trend: { type: 'object' },
          recordCount: { type: 'number' },
          source: { type: 'string' },
          exportPath: { type: 'string' },
          note: { type: 'string' },
        },
      },
      error: { type: 'string' },
    },
    required: ['success'],
  },
  triggers: [
    { kind: 'schedule', cadence: 'Daily healthcare metrics digest' },
  ],
  manifest: {},
  handler: async function handler(input, ctx) {
      const reportType = input.reportType || 'operational';
      const metric = input.metric || '';
      const period = input.period || '30d';
      const dateRange = input.dateRange || {};
      const granularity = input.granularity || 'day';
      const facility = input.facility || '';
        const provider = input.provider || '';
      const filterCriteria = input.filterCriteria || {};

      let analyticsData = { records: [], kpis: {}, metrics: [] };
      analyticsData = ctx.store.load('analyticsPath', []);

      const records = analyticsData.records || [];

      function sliceData(pd, dataArray) {
        const now = new Date();
        let startDate;
        if (pd === '7d') { startDate = new Date(now); startDate.setDate(now.getDate() - 6); }
        else if (pd === '30d') { startDate = new Date(now); startDate.setDate(now.getDate() - 29); }
        else if (pd === '90d') { startDate = new Date(now); startDate.setDate(now.getDate() - 89); }
        else if (pd === 'YTD') { startDate = new Date(now.getFullYear(), 0, 1); }
        else if (pd === '1y') { startDate = new Date(now); startDate.setFullYear(now.getFullYear() - 1); }
        else { startDate = new Date(now); startDate.setDate(now.getDate() - 29); }
        return dataArray.filter(d => { const dd = new Date(d.date); return dd >= startDate; });
      }

      function computeKPIs(data) {
        if (!data.length) return {};
        const nums = data.map(d => d.value).filter(v => typeof v === 'number');
        const sum = nums.reduce((a, b) => a + b, 0);
        const avg = nums.length ? sum / nums.length : 0;
        return {
          total: sum, average: Math.round(avg * 100) / 100, count: nums.length,
          min: Math.min(...nums), max: Math.max(...nums),
          trend: nums.length > 1 ? ((nums[nums.length - 1] - nums[0]) / Math.abs(nums[0] || 1)) * 100 : 0,
        };
      }

      let result;
        const slice = sliceData(period, records);
        const kpis = {
          patientVolume: computeKPIs(slice.filter(d => d.type === 'volume')),
          averageLengthOfStay: computeKPIs(slice.filter(d => d.type === 'los')),
          bedOccupancy: computeKPIs(slice.filter(d => d.type === 'occupancy')),
          throughput: computeKPIs(slice.filter(d => d.type === 'throughput')),
        };
        result = { success: true, data: { type: 'dashboard', reportType, period, granularity, kpis, recordCount: slice.length, source: 'local', note: 'For deeper analytics use the Healthcare Analytics platform.' } };
    }
  });
