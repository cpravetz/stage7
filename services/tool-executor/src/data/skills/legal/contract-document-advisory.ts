import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CONTRACT_DOCUMENT_ADVISORY_SOURCE = `const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const contractText = input.contractText || '';
const contractType = input.contractType || 'general';
const jurisdiction = input.jurisdiction || 'US';
const baseDir = process.env.LEGAL_HOME || path.join('/tmp/legal');
const storePath = path.join(baseDir, 'advisory.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
const riskRules = [
  { type: 'liability', severity: 'high', clause: 'Indemnification', terms: ['indemnif', 'consequential damages', 'unlimited liability'], description: 'Review liability and indemnification language' },
  { type: 'termination', severity: 'medium', clause: 'Termination', terms: ['termination', 'terminate', 'notice period'], description: 'Review termination rights and notice requirements' },
  { type: 'ip', severity: 'medium', clause: 'Intellectual Property', terms: ['intellectual property', 'work product', 'ownership'], description: 'Review intellectual property ownership language' },
  { type: 'confidentiality', severity: 'low', clause: 'Confidentiality', terms: ['confidential', 'non-disclosure', 'nda'], description: 'Review confidentiality obligations' },
  { type: 'payment', severity: 'high', clause: 'Payment Terms', terms: ['payment', 'invoice', 'net-'], description: 'Review payment timing and remedies' },
  { type: 'dispute', severity: 'medium', clause: 'Dispute Resolution', terms: ['arbitration', 'dispute', 'governing law'], description: 'Review dispute resolution and governing law' },
  { type: 'force-majeure', severity: 'low', clause: 'Force Majeure', terms: ['force majeure', 'act of god'], description: 'Review force majeure coverage' },
  { type: 'limitation', severity: 'medium', clause: 'Limitation of Liability', terms: ['limitation of liability', 'liability cap', 'damages cap'], description: 'Review liability limits' }
];
const normalizedText = contractText.toLowerCase();
const risks = riskRules.filter(r => r.terms.some(term => normalizedText.includes(term)));
const issues = risks.map(r => ({ issue: r.description, severity: r.severity, type: r.type, clause: r.clause }));
const clauses = risks.map(r => ({ clause: r.clause, status: 'review', note: r.description + '; manual legal review required' }));
const review = { id: 'review_' + Date.now(), contractType: input.contractType || 'general', textLength: contractText.length, risks, issues, clauses, jurisdiction, createdAt: new Date().toISOString(), source: 'local', method: 'keyword-heuristic', disclaimer: 'Heuristic review only; not legal advice and not a substitute for counsel.' };
store.push(review);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
console.log(JSON.stringify({ success: true, data: { review, storePath, issueCount: issues.length } }));`;

const CONTRACT_DOCUMENT_ADVISORY = createCodeSkill({
  id: 'contract-document-advisory',
  name: 'Contract & Document Advisory',
  description: 'Advisory tool for contract review, clause drafting, and risk assessment with local document storage.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: CONTRACT_DOCUMENT_ADVISORY_SOURCE,
  },
  inputSchema: {
    type: 'object',
    properties: {
      contractText: SchemaProps.text({ description: 'Full text of the contract to review' }),
      contractType: SchemaProps.text({ description: 'Type of contract (e.g., employment, NDA, service agreement, general)' }),
      jurisdiction: SchemaProps.text({ description: 'Applicable legal jurisdiction (e.g., US, CA, NY, EU)' }),
    },
    required: ['contractText'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: {
        type: 'object',
        properties: {
          review: { type: 'object' },
          storePath: { type: 'string' },
          issueCount: { type: 'number' },
        },
      },
      error: { type: 'string' },
    },
    required: ['success'],
  },
isSkill: true,
});

CONTRACT_DOCUMENT_ADVISORY.tier = 'advise';
CONTRACT_DOCUMENT_ADVISORY.domainKnowledge = 'Contract law, commercial negotiation standards, regulatory compliance (GDPR, SOC2, HIPAA), legal/security liability mitigation';

CONTRACT_DOCUMENT_ADVISORY.triggers = [
  { kind: 'event', on: 'Document or redline received' },
];

export { CONTRACT_DOCUMENT_ADVISORY };
