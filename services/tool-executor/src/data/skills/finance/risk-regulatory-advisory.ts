import { createCodeSkill, createSchemaRecord, SchemaProps } from '../code-skill-factory';
import { financeResultSchema } from './finance-contract';

const riskRegulatoryAdvisoryInputSchema = createSchemaRecord({
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

const riskRegulatoryAdvisoryOutputSchema = financeResultSchema(
  'Risk and regulatory assessment: VaR/expected shortfall, CVA, market/credit/operational risk breakdown, '
  + 'an overall risk score and classification, concentration indicators, and stress-test scenario results',
);

const riskRegulatoryAdvisorySkill = createCodeSkill({
  id: 'risk-regulatory-advisory',
  name: 'Risk & Regulatory Advisory',
  description: 'Assess financial and regulatory risk (VaR, ES, CVA, market/credit/operational) with stress testing and concentration analysis on a periodic schedule.',
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
    persistenceEnv: 'FINANCE_HOME',
    // Wrapped in an async IIFE: the body awaits fetch and returns early, neither of which is legal
    // at the top level of the CommonJS script the executor writes and runs with node.
    sourceCode: `(async () => {
const input = __tool_input || {};
const endpointUrl = input.endpointUrl || (globalThis.process && globalThis.process.env && globalThis.process.env.FINANCE_RISK_ENDPOINT) || '';
const apiKey = globalThis.process && globalThis.process.env && globalThis.process.env.FINANCE_API_KEY || '';

if (!endpointUrl) {
  const present = [{ id: 'not-connected', title: 'Not connected', kind: 'text', body: 'Risk assessment endpoint is not configured. Set FINANCE_RISK_ENDPOINT to enable full risk assessment.' }];
  console.log(JSON.stringify({ success: false, status: 'not-connected', data: null, error: 'Not connected: FINANCE_RISK_ENDPOINT is not configured', present }));
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

  // Build a deterministic presentation block summarizing the external response
  const summaryParts = [];
  if (data && typeof data === 'object') {
    if (data.overallStatus) summaryParts.push('Status: ' + String(data.overallStatus));
    if (data.summary) summaryParts.push(String(data.summary));
  }
  summaryParts.push('Assessed entity: ' + (input.entityId || 'unspecified'));
  const present = [{ id: 'risk-regulatory-advisory', title: 'Risk & Regulatory Advisory Summary', kind: 'text', body: summaryParts.join('\\n') }];

  // Persist risk assessment so downstream skills/UI can retrieve it
  const fs = require('fs');
  const path = require('path');
  const baseDir = process.env.FINANCE_HOME || '/tmp/finance';
  fs.mkdirSync(baseDir, { recursive: true });
  const storePath = path.join(baseDir, 'risk-assessments.json');
  let store = { assessments: [], lastUpdated: new Date().toISOString() };
  try { if (fs.existsSync(storePath)) { store = JSON.parse(fs.readFileSync(storePath, 'utf8')); } } catch (e) {}
  const entry = { id: 'ra_' + Buffer.from(String(new Date().getTime())).toString('base64').slice(0,12), createdAt: new Date().toISOString(), inputs: input, result: data };
  store.assessments.push(entry);
  try { fs.writeFileSync(storePath, JSON.stringify(store, null, 2)); } catch (e) {}

  console.log(JSON.stringify({ success: res.ok, status: res.ok ? 'ok' : 'failed', data: { riskAssessment: entry, storePath }, error: res.ok ? null : 'Risk endpoint responded with status ' + res.status, present }));
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  const present = [{ id: 'external-error', title: 'Risk assessment failed', kind: 'text', body: message }];
  // Persist failure record for auditing
  try {
    const fs = require('fs');
    const path = require('path');
    const baseDir = process.env.FINANCE_HOME || '/tmp/finance';
    fs.mkdirSync(baseDir, { recursive: true });
    const storePath = path.join(baseDir, 'risk-assessments.json');
    let store = { assessments: [], lastUpdated: new Date().toISOString() };
    try { if (fs.existsSync(storePath)) { store = JSON.parse(fs.readFileSync(storePath, 'utf8')); } } catch (e) {}
    const entry = { id: 'ra_err_' + Buffer.from(String(new Date().getTime())).toString('base64').slice(0,12), createdAt: new Date().toISOString(), inputs: input, error: message };
    store.assessments.push(entry);
    try { fs.writeFileSync(storePath, JSON.stringify(store, null, 2)); } catch (e) {}
    console.log(JSON.stringify({ success: false, status: 'failed', error: message, data: { riskAssessment: entry, storePath }, present }));
    return;
  } catch (e) {
    console.log(JSON.stringify({ success: false, status: 'failed', error: message, data: null, present }));
    return;
  }
}
})();`,
  },
  inputSchema: riskRegulatoryAdvisoryInputSchema,
  outputSchema: riskRegulatoryAdvisoryOutputSchema,
  isSkill: true,
});

riskRegulatoryAdvisorySkill.triggers = [
  { kind: 'schedule', cadence: 'periodic risk/regulatory monitoring' },
];

export { riskRegulatoryAdvisorySkill };
