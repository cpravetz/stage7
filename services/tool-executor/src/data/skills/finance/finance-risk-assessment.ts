import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, createSchemaRecord, SchemaProps } from '../code-skill-factory';

const riskAssessmentInputSchema = createSchemaRecord({
  entityId: SchemaProps.text({ description: 'Entity or organization identifier' }),
  portfolio: SchemaProps.objectArray(SchemaProps.object({
    asset: SchemaProps.text({ description: 'Asset identifier' }),
    value: SchemaProps.number({ description: 'Position value', minimum: 0 }),
    weight: SchemaProps.number({ description: 'Portfolio weight (0-1)', minimum: 0, maximum: 1 }),
  }), { description: 'Portfolio holdings for risk analysis' }),
  riskMetrics: SchemaProps.stringArray({ description: 'Risk metrics to compute (var, es, cva, market, credit, operational)' }),
  confidenceLevel: SchemaProps.number({ description: 'Confidence level for VaR/ES (0-1)', minimum: 0, maximum: 1, default: 0.95 }),
  timeHorizon: SchemaProps.integer({ description: 'Time horizon in days', minimum: 1, default: 252 }),
});

const riskAssessmentOutputSchema = createSchemaRecord({
  success: SchemaProps.boolean(),
  riskAssessment: SchemaProps.object({
    properties: {
      entityId: SchemaProps.text(),
      riskMetrics: SchemaProps.object({
        var95: SchemaProps.number(),
        var99: SchemaProps.number(),
        expectedShortfall: SchemaProps.number(),
        cva: SchemaProps.number(),
        marketRisk: SchemaProps.number(),
        creditRisk: SchemaProps.number(),
        operationalRisk: SchemaProps.number(),
      }),
      riskScore: SchemaProps.number(),
      riskClassification: SchemaProps.text(),
      concentrationRisk: SchemaProps.object({}, { description: 'Concentration risk indicators' }),
      stressTestResults: SchemaProps.objectArray(SchemaProps.object({
        scenario: SchemaProps.text(),
        impact: SchemaProps.number(),
        severity: SchemaProps.text(),
      })),
      assessedAt: SchemaProps.text(),
    },
  }),
  error: SchemaProps.text(),
});

const riskAssessmentSkill = createCodeSkill({
  id: 'finance-risk-assessment',
  name: 'Financial Risk Assessment',
  description: 'Assess financial risk (VaR, ES, CVA, market/credit/operational) with stress testing and concentration analysis.',
  tier: 'advise',
  domainKnowledge: 'risk-management',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', format: 'uri', description: 'Base URL for the risk assessment service' },
        apiKey: { type: 'string', description: 'API key for the risk assessment service' },
        provider: { type: 'string', description: 'Provider identifier (e.g., bloomberg, refinitiv, custom)' },
      },
      required: ['baseUrl', 'apiKey', 'provider'],
    },
    sourceCode: `
const input = __tool_input || {};
const endpointUrl = input.endpointUrl || (globalThis.process && globalThis.process.env && globalThis.process.env.FINANCE_RISK_ENDPOINT) || '';
const apiKey = globalThis.process && globalThis.process.env && globalThis.process.env.FINANCE_API_KEY || '';

if (!endpointUrl) {
  console.log(JSON.stringify({ success: false, riskAssessment: null, error: 'Not connected: FINANCE_RISK_ENDPOINT is not configured' }));
  return;
}

const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey };
const body = JSON.stringify({ operation: 'risk-assessment', ...input });

try {
  const res = await fetch(endpointUrl, { method: 'POST', headers, body });
  const contentType = res.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) { data = await res.json(); }
  else { const text = await res.text(); data = text ? { text } : null; }
  console.log(JSON.stringify({ success: res.ok, riskAssessment: data, error: null }));
} catch (err) {
  console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err), riskAssessment: null }));
}
`,
  },
  inputSchema: riskAssessmentInputSchema,
  outputSchema: riskAssessmentOutputSchema,
isSkill: true,
});

riskAssessmentSkill.triggers = [
  { kind: 'schedule', cadence: 'Quarterly risk assessment' },
];

export { riskAssessmentSkill };
