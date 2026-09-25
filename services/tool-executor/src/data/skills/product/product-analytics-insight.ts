import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

export const PRODUCT_ANALYTICS_INSIGHT = createCodeSkill({
  id: 'product-analytics-insight',
  name: 'Product Analytics Insight',
  description: 'Analyze product metrics, adoption trends, retention cohorts, conversion funnels, and generate actionable insights from analytics data.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `const input = __tool_input || {};
const metric = input.metric || 'adoption';
const data = Array.isArray(input.data) ? input.data : [];
const now = new Date();
if (metric === 'retention') {
  const cohorts = data.map((d, i) => {
    const size = Math.max(1, Number(d.size || 100));
    const retained = Math.floor(d.retained != null ? d.retained : size * 0.6);
    return { id: 'cohort_' + i, label: d.label || 'Cohort ' + (i + 1), size, retained, rate: Math.round(retained / size * 100) };
  });
  const avgRetention = cohorts.length ? Math.round(cohorts.reduce((s, c) => s + c.rate, 0) / cohorts.length) : 0;
  const result = { metric, cohortCount: cohorts.length, averageRetention: avgRetention, cohorts, generatedAt: now.toISOString() };
  console.log(JSON.stringify({ success: true, data: result }));
  return result;
}
if (metric === 'conversion') {
  const steps = data.map((d, i) => ({ id: 'step_' + i, label: d.label || 'Step ' + (i + 1), value: Number(d.value || 0), dropOff: i > 0 ? Math.max(0, Number(data[i - 1].value || 0) - Number(d.value || 0)) : 0 }));
  const result = { metric, stepCount: steps.length, totalConversion: steps.length ? Math.round(steps[steps.length - 1].value / steps[0].value * 100) : 0, steps, generatedAt: now.toISOString() };
  console.log(JSON.stringify({ success: true, data: result }));
  return result;
}
const values = data.map(d => Number(d.value || 0));
const summary = {
  metric, totalEvents: data.length,
  avgValue: values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length * 100) / 100 : 0,
  peak: values.length ? Math.max(...values) : 0,
  min: values.length ? Math.min(...values) : 0,
  generatedAt: now.toISOString(),
};
console.log(JSON.stringify({ success: true, data: summary }));
return summary;`,
  },
  inputSchema: {
    type: 'object',
    properties: {
      metric: SchemaProps.select(['adoption', 'retention', 'engagement', 'conversion'], { description: 'Metric to analyze' }),
      data: SchemaProps.objectArray(SchemaProps.object({ value: SchemaProps.number(), label: SchemaProps.text(), size: SchemaProps.number() }), { description: 'Analytics data points' }),
      startDate: SchemaProps.datetime({ description: 'Analysis start date' }),
      endDate: SchemaProps.datetime({ description: 'Analysis end date' }),
      breakdown: SchemaProps.stringArray({ description: 'Dimensions to break down by' }),
    },
    required: ['metric'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: { type: 'object', description: 'Analysis results and insights' },
    },
    required: ['success', 'data'],
  },
  triggers: [
    { kind: 'event', on: 'A product launch or release event occurs' },
  ],
  tier: 'advise',
  domainKnowledge: 'Product analytics, funnel analysis, retention metrics, conversion optimization',
});
