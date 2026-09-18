import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, createSchemaRecord, SchemaProps } from '../code-skill-factory';

const riskRegulatoryInputSchema = createSchemaRecord({
  operation: SchemaProps.select(['risk-assessment', 'regulatory'], { description: 'Operation type: risk-assessment for financial risk analysis, regulatory for regulatory compliance review' }),
  endpointUrl: SchemaProps.url({ description: 'Override endpoint URL for the external service' }),
  entityId: SchemaProps.text({ description: 'Entity or organization identifier' }),
  portfolio: SchemaProps.objectArray(SchemaProps.object({
    asset: SchemaProps.text({ description: 'Asset identifier' }),
    value: SchemaProps.number({ description: 'Position value', minimum: 0 }),
    weight: SchemaProps.number({ description: 'Portfolio weight (0-1)', minimum: 0, maximum: 1 }),
  }), { description: 'Portfolio holdings for risk analysis' }),
  riskMetrics: SchemaProps.stringArray({ description: 'Risk metrics to compute (var, es, cva, market, credit, operational)' }),
  confidenceLevel: SchemaProps.number({ description: 'Confidence level for VaR/ES (0-1)', minimum: 0, maximum: 1, default: 0.95 }),
  timeHorizon: SchemaProps.integer({ description: 'Time horizon in days', minimum: 1, default: 252 }),
  regulationType: SchemaProps.select(['sox', 'basel-iii', 'dodd-frank', 'mifid-ii', 'gaap', 'ifrs', 'custom'], { description: 'Regulatory framework to evaluate' }),
  filingType: SchemaProps.select(['10-K', '10-Q', '8-K', 's-1', 'proxy', 'other'], { description: 'Filing type for regulatory review' }),
  period: SchemaProps.text({ description: 'Reporting period (e.g., FY2024)' }),
  documents: SchemaProps.stringArray({ description: 'Document references for regulatory review' }),
}, { required: ['operation'] });

const riskRegulatoryOutputSchema = createSchemaRecord({
  success: SchemaProps.boolean(),
  operation: SchemaProps.text(),
  mode: SchemaProps.select(['dry-run', 'live', 'error'], { description: 'Execution mode' }),
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
  regulatoryResult: SchemaProps.object({
    properties: {
      entityId: SchemaProps.text(),
      regulationType: SchemaProps.text(),
      complianceStatus: SchemaProps.select(['compliant', 'partially-compliant', 'non-compliant', 'under-review'], { description: 'Overall compliance status' }),
      findings: SchemaProps.objectArray(SchemaProps.object({
        id: SchemaProps.text(),
        category: SchemaProps.text(),
        severity: SchemaProps.select(['low', 'medium', 'high', 'critical'], { description: 'Finding severity' }),
        description: SchemaProps.text(),
        remediation: SchemaProps.text(),
      })),
      filingStatus: SchemaProps.select(['draft', 'submitted', 'accepted', 'rejected'], { description: 'Filing status' }),
      reviewedAt: SchemaProps.text(),
    },
  }),
  error: SchemaProps.text(),
});

const riskRegulatorySkill = createCodeSkill({
  id: 'risk-regulatory-advisory',
  name: 'Risk & Regulatory Advisory',
  description: 'Assess financial risk (VaR, ES, CVA, market/credit/operational) and evaluate regulatory compliance across frameworks (SOX, Basel III, Dodd-Frank, MiFID II) with filing status and findings.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', format: 'uri', description: 'Base URL for the risk and regulatory service' },
        apiKey: { type: 'string', description: 'API key for the risk and regulatory service' },
        provider: { type: 'string', description: 'Provider identifier (e.g., bloomberg, refinitiv, custom)' },
      },
      required: ['baseUrl', 'apiKey', 'provider'],
    },
    sourceCode: `
const input = __tool_input || {};
const operation = input.operation || 'risk-assessment';
const endpointUrl = input.endpointUrl || (globalThis.process && globalThis.process.env && globalThis.process.env.FINANCE_RISK_ENDPOINT) || '';
const apiKey = globalThis.process && globalThis.process.env && globalThis.process.env.FINANCE_API_KEY || '';

if (!endpointUrl) {
  console.log(JSON.stringify({ success: true, operation, mode: 'dry-run', riskAssessment: null, regulatoryResult: null, error: null }));
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
  console.log(JSON.stringify({ success: res.ok, operation, mode: 'live', riskAssessment: operation === 'risk-assessment' ? data : null, regulatoryResult: operation === 'regulatory' ? data : null, error: null }));
} catch (err) {
  console.log(JSON.stringify({ success: false, operation, mode: 'error', error: err instanceof Error ? err.message : String(err), riskAssessment: null, regulatoryResult: null }));
}
`,
  },
  inputSchema: riskRegulatoryInputSchema,
  outputSchema: riskRegulatoryOutputSchema,
});

riskRegulatorySkill.triggers = [
  { kind: 'user', phrase_examples: ['Assess financial risk', 'Review regulatory compliance'] },
  { kind: 'schedule', cadence: 'Quarterly risk assessment' },
  { kind: 'schedule', cadence: 'Regulatory filing deadline' },
  { kind: 'event', on: 'Material transaction' },
  { kind: 'event', on: 'Regulatory update published' },
];

export { riskRegulatorySkill };
