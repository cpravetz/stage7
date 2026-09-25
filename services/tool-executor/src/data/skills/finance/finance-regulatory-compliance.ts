import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, createSchemaRecord, SchemaProps } from '../code-skill-factory';

const regulatoryComplianceInputSchema = createSchemaRecord({
  entityId: SchemaProps.text({ description: 'Entity or organization identifier' }),
  regulationType: SchemaProps.select(['sox', 'basel-iii', 'dodd-frank', 'mifid-ii', 'gaap', 'ifrs', 'custom'], { description: 'Regulatory framework to evaluate' }),
  filingType: SchemaProps.select(['10-K', '10-Q', '8-K', 's-1', 'proxy', 'other'], { description: 'Filing type for regulatory review' }),
  period: SchemaProps.text({ description: 'Reporting period (e.g., FY2024)' }),
  documents: SchemaProps.stringArray({ description: 'Document references for regulatory review' }),
});

const regulatoryComplianceOutputSchema = createSchemaRecord({
  success: SchemaProps.boolean(),
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

const regulatoryComplianceSkill = createCodeSkill({
  id: 'finance-regulatory-compliance',
  name: 'Regulatory Compliance Review',
  description: 'Evaluate regulatory compliance across frameworks (SOX, Basel III, Dodd-Frank, MiFID II) with filing status and findings.',
  tier: 'advise',
  domainKnowledge: 'regulatory-compliance',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', format: 'uri', description: 'Base URL for the regulatory compliance service' },
        apiKey: { type: 'string', description: 'API key for the regulatory compliance service' },
        provider: { type: 'string', description: 'Provider identifier (e.g., bloomberg, refinitiv, custom)' },
      },
      required: ['baseUrl', 'apiKey', 'provider'],
    },
    sourceCode: `
const input = __tool_input || {};
const endpointUrl = input.endpointUrl || (globalThis.process && globalThis.process.env && globalThis.process.env.FINANCE_RISK_ENDPOINT) || '';
const apiKey = globalThis.process && globalThis.process.env && globalThis.process.env.FINANCE_API_KEY || '';

if (!endpointUrl) {
  console.log(JSON.stringify({ success: false, regulatoryResult: null, error: 'Not connected: FINANCE_RISK_ENDPOINT is not configured' }));
  return;
}

const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey };
const body = JSON.stringify({ operation: 'regulatory', ...input });

try {
  const res = await fetch(endpointUrl, { method: 'POST', headers, body });
  const contentType = res.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) { data = await res.json(); }
  else { const text = await res.text(); data = text ? { text } : null; }
  console.log(JSON.stringify({ success: res.ok, regulatoryResult: data, error: null }));
} catch (err) {
  console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err), regulatoryResult: null }));
}
`,
  },
  inputSchema: regulatoryComplianceInputSchema,
  outputSchema: regulatoryComplianceOutputSchema,
});

regulatoryComplianceSkill.triggers = [
  { kind: 'schedule', cadence: 'Regulatory filing deadline' },
  { kind: 'event', on: 'Regulatory update published' },
];

export { regulatoryComplianceSkill };
