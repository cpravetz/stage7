import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, createSchemaRecord, SchemaProps } from '../code-skill-factory';

const budgetTrackingInputSchema = createSchemaRecord({
  operation: SchemaProps.select(['track-budget', 'variance', 'forecast'], { description: 'Operation type: track-budget for budget vs actual, variance for variance analysis, forecast for budget forecast' }),
  endpointUrl: SchemaProps.url({ description: 'Override endpoint URL for the budget service' }),
  budgetId: SchemaProps.text({ description: 'Budget identifier' }),
  fiscalYear: SchemaProps.integer({ description: 'Fiscal year', minimum: 2020, maximum: 2040 }),
  department: SchemaProps.text({ description: 'Department identifier' }),
  actuals: SchemaProps.objectArray(SchemaProps.object({
    lineItem: SchemaProps.text({ description: 'Budget line item' }),
    amount: SchemaProps.number({ description: 'Actual amount', minimum: 0 }),
    period: SchemaProps.text({ description: 'Period (e.g., Q1-2024)' }),
  }), { description: 'Actual spending to compare against budget' }),
  budgetPlan: SchemaProps.objectArray(SchemaProps.object({
    lineItem: SchemaProps.text({ description: 'Budget line item' }),
    amount: SchemaProps.number({ description: 'Budgeted amount', minimum: 0 }),
    period: SchemaProps.text({ description: 'Period (e.g., Q1-2024)' }),
  }), { description: 'Budget plan amounts' }),
  forecastMonths: SchemaProps.integer({ description: 'Number of months to forecast', minimum: 1, maximum: 24, default: 6 }),
  includeVariance: SchemaProps.boolean({ description: 'Include variance analysis in output', default: true }),
  threshold: SchemaProps.number({ description: 'Variance threshold percentage for alerts', minimum: 0, maximum: 100, default: 10 }),
}, { required: ['operation'] });

const budgetTrackingOutputSchema = createSchemaRecord({
  success: SchemaProps.boolean(),
  operation: SchemaProps.text(),
  mode: SchemaProps.select(['dry-run', 'live', 'error'], { description: 'Execution mode' }),
  budgetStatus: SchemaProps.object({
    properties: {
      budgetId: SchemaProps.text(),
      fiscalYear: SchemaProps.integer(),
      department: SchemaProps.text(),
      totalBudgeted: SchemaProps.number(),
      totalActual: SchemaProps.number(),
      totalRemaining: SchemaProps.number(),
      utilization: SchemaProps.number(),
      lineItems: SchemaProps.objectArray(SchemaProps.object({
        lineItem: SchemaProps.text(),
        budgeted: SchemaProps.number(),
        actual: SchemaProps.number(),
        variance: SchemaProps.number(),
        variancePct: SchemaProps.number(),
        status: SchemaProps.select(['on-track', 'over-budget', 'under-budget'], { description: 'Line item status' }),
      })),
      alertTriggered: SchemaProps.boolean(),
      alerts: SchemaProps.objectArray(SchemaProps.object({
        lineItem: SchemaProps.text(),
        message: SchemaProps.text(),
        severity: SchemaProps.select(['info', 'warning', 'critical'], { description: 'Alert severity' }),
      })),
    },
  }),
  forecast: SchemaProps.object({
    properties: {
      budgetId: SchemaProps.text(),
      forecastHorizon: SchemaProps.integer(),
      projectedTotal: SchemaProps.number(),
      projectedUtilization: SchemaProps.number(),
      monthlyForecast: SchemaProps.objectArray(SchemaProps.object({
        month: SchemaProps.text(),
        projectedAmount: SchemaProps.number(),
        cumulativeProjected: SchemaProps.number(),
      })),
    },
  }),
  error: SchemaProps.text(),
});

const budgetTrackingSkill = createCodeSkill({
  id: 'budget-tracking',
  name: 'Budget Tracking',
  description: 'Track budget vs actual spending, analyze variances with alerting thresholds, and forecast remaining budget across departments and fiscal periods through connected ERP and ledger systems.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', format: 'uri', description: 'Base URL for the budget tracking service' },
        apiKey: { type: 'string', description: 'API key for the budget tracking service' },
        provider: { type: 'string', description: 'Provider identifier (e.g., sap, oracle, netsuite, custom)' },
      },
      required: ['baseUrl', 'apiKey', 'provider'],
    },
    sourceCode: `
const input = __tool_input || {};
const operation = input.operation || 'track-budget';
const endpointUrl = input.endpointUrl || (globalThis.process && globalThis.process.env && globalThis.process.env.FINANCE_BUDGET_ENDPOINT) || '';
const apiKey = globalThis.process && globalThis.process.env && globalThis.process.env.FINANCE_API_KEY || '';

if (!endpointUrl) {
  console.log(JSON.stringify({ success: false, operation, mode: 'not-connected', budgetStatus: null, forecast: null, error: 'Not connected: FINANCE_BUDGET_ENDPOINT is not configured' }));
  return;
}

const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey };
const body = JSON.stringify({ operation, ...input });

try {
  const res = await fetch(endpointUrl, { method: 'POST', headers, body });
  const contentType = res.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) { data = await res.json(); }
  else { const text = await res.text(); data = text ? { text } : null; }
  const budgetStatus = operation === 'track-budget' || operation === 'variance' ? data : null;
  const forecast = operation === 'forecast' ? data : null;
  console.log(JSON.stringify({ success: res.ok, operation, mode: 'live', budgetStatus, forecast, error: null }));
} catch (err) {
  console.log(JSON.stringify({ success: false, operation, mode: 'error', error: err instanceof Error ? err.message : String(err), budgetStatus: null, forecast: null }));
}
`,
  },
  inputSchema: budgetTrackingInputSchema,
  outputSchema: budgetTrackingOutputSchema,
});

budgetTrackingSkill.triggers = [
  { kind: 'user', phrase_examples: ['Track budget', 'Analyze variance', 'Forecast budget'] },
  { kind: 'schedule', cadence: 'Monthly budget review' },
  { kind: 'event', on: 'Budget threshold exceeded' },
];

export { budgetTrackingSkill };
