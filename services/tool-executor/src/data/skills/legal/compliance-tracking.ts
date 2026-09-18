import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const COMPLIANCE_TRACKING = createCodeSkill({
  id: 'compliance-tracking',
  name: 'Compliance Tracking',
  description: 'Track and verify compliance against regulatory requirements with local analysis.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const operation = input.operation || 'compliance';
const documentText = input.documentText || '';
const regulation = input.regulation || 'GDPR';
const jurisdiction = input.jurisdiction || 'US';
const effectiveDate = input.effectiveDate || new Date().toISOString();
const baseDir = process.env.LEGAL_HOME || path.join('/tmp/legal');
const compliancePath = path.join(baseDir, 'compliance.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(compliancePath) ? JSON.parse(fs.readFileSync(compliancePath, 'utf8')) : [];
let result;
if (operation === 'compliance') {
  const report = { id: 'comp_' + Date.now(), regulation, jurisdiction, effectiveDate, totalRules: 0, violations: null, compliant: null, checks: [], status: 'manual-review-required', createdAt: new Date().toISOString(), source: 'local', notice: 'No regulatory rule set or connected compliance provider is configured; no compliance conclusion was produced.' };
  store.push(report);
  fs.writeFileSync(compliancePath, JSON.stringify(store, null, 2));
  result = { success: true, data: { report, storePath, violationCount: null } };
} else {
  result = { success: false, error: 'Unknown operation: ' + operation };
}
console.log(JSON.stringify(result));`,
  },
  inputSchema: {
    type: 'object',
    properties: {
      operation: SchemaProps.select(['compliance'], { description: 'Compliance tracking operation' }),
      documentText: SchemaProps.text({ description: 'Text of the document to check for compliance' }),
      regulation: SchemaProps.select(['GDPR', 'HIPAA', 'SOX', 'PCI-DSS', 'FERPA'], { description: 'Regulation or standard to check against (e.g., GDPR, HIPAA, SOX)' }),
      jurisdiction: SchemaProps.text({ description: 'Regulatory jurisdiction to check (e.g., US, EU, CA)' }),
      effectiveDate: SchemaProps.text({ description: 'Effective date for compliance check (ISO 8601 format)' }),
    },
    required: ['operation', 'documentText'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: {
        type: 'object',
        properties: {
          report: { type: 'object' },
          storePath: { type: 'string' },
          violationCount: { type: ['number', 'null'] },
        },
      },
      error: { type: 'string' },
    },
    required: ['success'],
  },
});

COMPLIANCE_TRACKING.triggers = [
  { kind: 'user', phrase_examples: ['Check compliance', 'Review regulatory requirements'] },
  { kind: 'schedule', cadence: 'Monthly compliance audit' },
  { kind: 'event', on: 'Regulation updated' },
];

export { COMPLIANCE_TRACKING };
