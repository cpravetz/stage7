import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const LEGAL_RESEARCH = createCodeSkill({
  id: 'legal-research',
  name: 'Legal Research',
  description: 'Prepare a local legal research request and report the configured search scope. This skill does not fetch live statutes, cases, or secondary sources.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const operation = input.operation || 'legal-research';
const query = input.query || '';
const jurisdiction = input.jurisdiction || 'US';
const dateRange = input.dateRange || {};
const sources = input.sources || [];
const maxResults = Math.max(1, Math.min(50, input.maxResults || 10));
const baseDir = process.env.LEGAL_HOME || path.join('/tmp/legal');
const researchPath = path.join(baseDir, 'research.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(researchPath) ? JSON.parse(fs.readFileSync(researchPath, 'utf8')) : [];
let result;
if (operation === 'legal-research') {
  const research = { id: 'research_' + Date.now(), query, jurisdiction, sources, resultCount: 0, results: [], dateRange, createdAt: new Date().toISOString(), source: 'local', mode: 'not-connected', notice: 'No legal research provider is configured; no external results were fetched.' };
  store.push(research);
  fs.writeFileSync(researchPath, JSON.stringify(store, null, 2));
  result = { success: true, data: { research, storePath: researchPath, resultCount: 0 } };
} else if (operation === 'statute-database') {
  const statuteResult = { id: 'statute_' + Date.now(), query, jurisdiction, statuteCount: 0, statutes: [], citationFormat: null, createdAt: new Date().toISOString(), source: 'local', mode: 'not-connected', notice: 'No statute database is configured; no external results were fetched.' };
  store.push(statuteResult);
  fs.writeFileSync(researchPath, JSON.stringify(store, null, 2));
  result = { success: true, data: { statuteResult, storePath } };
} else if (operation === 'case-search') {
  const caseResult = { id: 'case_' + Date.now(), query, jurisdiction, court: input.court || 'all', caseCount: 0, cases: [], dateRange, createdAt: new Date().toISOString(), source: 'local', mode: 'not-connected', notice: 'No case law provider is configured; no external results were fetched.' };
  store.push(caseResult);
  fs.writeFileSync(researchPath, JSON.stringify(store, null, 2));
  result = { success: true, data: { caseResult, storePath } };
} else {
  result = { success: false, error: 'Unknown operation: ' + operation };
}
console.log(JSON.stringify(result));`,
  },
  inputSchema: {
    type: 'object',
    properties: {
      operation: SchemaProps.select(['legal-research', 'statute-database', 'case-search'], { description: 'Research operation: legal-research for general research, statute-database for statute lookup, case-search for case law' }),
      query: SchemaProps.text({ description: 'Search query or question for legal research' }),
      jurisdiction: SchemaProps.text({ description: 'Legal jurisdiction to search (e.g., US, CA, NY, EU, UK)' }),
      dateRange: SchemaProps.object({ start: SchemaProps.text({ description: 'Start date (ISO 8601)' }), end: SchemaProps.text({ description: 'End date (ISO 8601)' }) }, { description: 'Date range filter for results' }),
      sources: SchemaProps.stringArray({ description: 'Specific sources to search (e.g., statutes, cases, regulations)' }),
      maxResults: SchemaProps.integer({ description: 'Maximum number of results to return', minimum: 1, maximum: 50, default: 10 }),
      court: SchemaProps.text({ description: 'Specific court to search (e.g., SCOTUS, 9th Circuit, NY Court of Appeals)' }),
    },
    required: ['operation', 'query'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: {
        type: 'object',
        properties: {
          research: { type: 'object' },
          statuteResult: { type: 'object' },
          caseResult: { type: 'object' },
          storePath: { type: 'string' },
          resultCount: { type: 'number' },
        },
      },
      error: { type: 'string' },
    },
    required: ['success'],
  },
});

LEGAL_RESEARCH.triggers = [
  { kind: 'user', phrase_examples: ['Research a legal question', 'Search statutes', 'Search case law'] },
  { kind: 'schedule', cadence: 'Weekly legal research digest' },
  { kind: 'event', on: 'New regulatory requirement' },
];

export { LEGAL_RESEARCH };
