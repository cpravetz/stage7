import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const COMPLIANCE_TRACKING_SOURCE = `const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const documentText = input.documentText || '';
const regulation = input.regulation || 'GDPR';
const jurisdiction = input.jurisdiction || 'US';
const effectiveDate = input.effectiveDate || new Date().toISOString();
const baseDir = process.env.LEGAL_HOME || path.join('/tmp/legal');
const compliancePath = path.join(baseDir, 'compliance.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(compliancePath) ? JSON.parse(fs.readFileSync(compliancePath, 'utf8')) : [];
const report = { id: 'comp_' + Date.now(), regulation, jurisdiction, effectiveDate, totalRules: 0, violations: null, compliant: null, checks: [], status: 'manual-review-required', createdAt: new Date().toISOString(), source: 'local', notice: 'No regulatory rule set or connected compliance provider is configured; no compliance conclusion was produced.' };
store.push(report);
fs.writeFileSync(compliancePath, JSON.stringify(store, null, 2));
console.log(JSON.stringify({ success: true, data: { report, storePath: compliancePath, violationCount: null } }));`;

const COMPLIANCE_TRACKING = createCodeSkill({
  id: 'compliance-tracking',
  name: 'Compliance Tracking',
  description: 'Track and verify compliance against regulatory requirements with local analysis.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: COMPLIANCE_TRACKING_SOURCE,
  },
  inputSchema: {
    type: 'object',
    properties: {
      documentText: SchemaProps.text({ description: 'Text of the document to check for compliance' }),
      regulation: SchemaProps.select(['GDPR', 'HIPAA', 'SOX', 'PCI-DSS', 'FERPA'], { description: 'Regulation or standard to check against (e.g., GDPR, HIPAA, SOX)' }),
      jurisdiction: SchemaProps.text({ description: 'Regulatory jurisdiction to check (e.g., US, EU, CA)' }),
      effectiveDate: SchemaProps.text({ description: 'Effective date for compliance check (ISO 8601 format)' }),
    },
    required: ['documentText'],
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
isSkill: true,
});

COMPLIANCE_TRACKING.tier = 'advise';
COMPLIANCE_TRACKING.domainKnowledge = 'Regulatory compliance frameworks (GDPR, HIPAA, SOX, PCI-DSS, FERPA), audit horizon planning, and compliance risk scorecarding';

COMPLIANCE_TRACKING.triggers = [
  { kind: 'schedule', cadence: 'Monthly compliance audit' },
];

export { COMPLIANCE_TRACKING };
