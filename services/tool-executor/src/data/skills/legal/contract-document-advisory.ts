import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CONTRACT_DOCUMENT_ADVISORY = createCodeSkill({
  id: 'contract-document-advisory',
  name: 'Contract & Document Advisory',
  description: 'Advisory tool for contract review, clause drafting, and risk assessment with local document storage.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const operation = input.operation || 'review-contract';
const contractText = input.contractText || '';
const clauseType = input.clauseType || 'general';
const terms = input.terms || '';
const facts = input.facts || '';
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
const clauseTemplates = {
  confidentiality: 'CONFIDENTIALITY. ' + terms,
  indemnification: 'INDEMNIFICATION. ' + terms,
  termination: 'TERMINATION. ' + terms,
  general: 'GENERAL PROVISIONS. ' + terms
};
let result;
  if (operation === 'review-contract') {
  const normalizedText = contractText.toLowerCase();
  const risks = riskRules.filter(r => r.terms.some(term => normalizedText.includes(term)));
  const issues = risks.map(r => ({ issue: r.description, severity: r.severity, type: r.type, clause: r.clause }));
  const clauses = risks.map(r => ({ clause: r.clause, status: 'review', note: r.description + '; manual legal review required' }));
  const review = { id: 'review_' + Date.now(), contractType: input.contractType || 'general', textLength: contractText.length, risks, issues, clauses, jurisdiction, createdAt: new Date().toISOString(), source: 'local', method: 'keyword-heuristic', disclaimer: 'Heuristic review only; not legal advice and not a substitute for counsel.' };
  store.push(review);
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
  result = { success: true, data: { review, storePath, issueCount: issues.length } };
} else if (operation === 'draft-clause') {
  if (!terms.trim()) {
    result = { success: false, error: 'terms is required to draft a clause' };
  } else {
    const text = clauseTemplates[clauseType.toLowerCase()] || clauseTemplates.general;
    const clause = { id: 'clause_' + Date.now(), clauseType, terms, text, createdAt: new Date().toISOString(), source: 'local', disclaimer: 'Drafting aid only; counsel must review before use.' };
    store.push(clause);
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
    result = { success: true, data: { clause, storePath } };
  }
} else if (operation === 'risk-assessment') {
  const factors = facts ? facts.split(/[.;]/).filter(f => f.trim()).map(f => {
    const statement = f.trim();
    const lower = statement.toLowerCase();
    const riskLevel = /unlimited|penalt|breach|terminate without|no limitation/i.test(lower) ? 'high' : /notice|cap|review|arbitration/i.test(lower) ? 'medium' : 'low';
    return { factor: statement, riskLevel, detail: 'Keyword heuristic; manual legal review required' };
  }) : [];
  const overallRisk = factors.length ? (factors.some(f => f.riskLevel === 'high') ? 'high' : factors.some(f => f.riskLevel === 'medium') ? 'medium' : 'low') : 'unknown';
  const assessment = { id: 'risk_' + Date.now(), jurisdiction, factors, overallRisk, createdAt: new Date().toISOString(), source: 'local', method: 'keyword-heuristic', disclaimer: 'Heuristic assessment only; not legal advice.' };
  store.push(assessment);
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
  result = { success: true, data: { assessment, storePath, factorCount: factors.length } };
} else {
  result = { success: false, error: 'Unknown operation: ' + operation };
}
console.log(JSON.stringify(result));`,
  },
  inputSchema: {
    type: 'object',
    properties: {
      operation: SchemaProps.select(['review-contract', 'draft-clause', 'risk-assessment'], { description: 'Operation: review-contract for contract review, draft-clause for clause drafting, risk-assessment for risk analysis' }),
      contractText: SchemaProps.text({ description: 'Full text of the contract to review' }),
      contractType: SchemaProps.text({ description: 'Type of contract (e.g., employment, NDA, service agreement, general)' }),
      clauseType: SchemaProps.select(['confidentiality', 'indemnification', 'termination', 'general'], { description: 'Type of clause to draft (e.g., confidentiality, indemnification, termination, general)' }),
      terms: SchemaProps.text({ description: 'Custom terms and requirements for the clause' }),
      facts: SchemaProps.text({ description: 'Factual background for risk assessment' }),
      jurisdiction: SchemaProps.text({ description: 'Applicable legal jurisdiction (e.g., US, CA, NY, EU)' }),
    },
    required: ['operation'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: {
        type: 'object',
        properties: {
          review: { type: 'object' },
          clause: { type: 'object' },
          assessment: { type: 'object' },
          storePath: { type: 'string' },
          issueCount: { type: 'number' },
          factorCount: { type: 'number' },
        },
      },
      error: { type: 'string' },
    },
    required: ['success'],
  },
});

CONTRACT_DOCUMENT_ADVISORY.triggers = [
  { kind: 'user', phrase_examples: ['Review this contract', 'Draft a clause', 'Assess risk'] },
  { kind: 'schedule', cadence: '90/60/30-day contract renewal audit' },
  { kind: 'event', on: 'Counterparty redline received' },
  { kind: 'event', on: 'Regulatory feed update' },
];

export { CONTRACT_DOCUMENT_ADVISORY };
