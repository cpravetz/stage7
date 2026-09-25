import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const LEGAL_RESEARCH_SOURCE = `const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const query = input.query || '';
const jurisdiction = input.jurisdiction || 'US';
const dateRange = input.dateRange || {};
const sources = input.sources || [];
const maxResults = Math.max(1, Math.min(50, input.maxResults || 10));
const baseDir = process.env.LEGAL_HOME || path.join('/tmp/legal');
const researchPath = path.join(baseDir, 'research.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(researchPath) ? JSON.parse(fs.readFileSync(researchPath, 'utf8')) : [];
const research = { id: 'research_' + Date.now(), query, jurisdiction, sources, resultCount: 0, results: [], dateRange, createdAt: new Date().toISOString(), source: 'local', status: 'not-connected', notice: 'No legal research provider is configured; no external results were fetched.' };
store.push(research);
fs.writeFileSync(researchPath, JSON.stringify(store, null, 2));
console.log(JSON.stringify({ success: true, data: { research, storePath: researchPath, resultCount: 0 } }));`;

const LEGAL_RESEARCH = createCodeSkill({
  id: 'legal-research',
  name: 'Legal Research',
  description: 'Prepare a local legal research request and report the configured search scope. This skill does not fetch live statutes, cases, or secondary sources.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: LEGAL_RESEARCH_SOURCE,
  },
  inputSchema: {
    type: 'object',
    properties: {
      query: SchemaProps.text({ description: 'Search query or question for legal research' }),
      jurisdiction: SchemaProps.text({ description: 'Legal jurisdiction to search (e.g., US, CA, NY, EU, UK)' }),
      dateRange: SchemaProps.object({ start: SchemaProps.text({ description: 'Start date (ISO 8601)' }), end: SchemaProps.text({ description: 'End date (ISO 8601)' }) }, { description: 'Date range filter for results' }),
      sources: SchemaProps.stringArray({ description: 'Specific sources to search (e.g., statutes, cases, regulations)' }),
      maxResults: SchemaProps.integer({ description: 'Maximum number of results to return', minimum: 1, maximum: 50, default: 10 }),
    },
    required: ['query'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: {
        type: 'object',
        properties: {
          research: { type: 'object' },
          storePath: { type: 'string' },
          resultCount: { type: 'number' },
        },
      },
      error: { type: 'string' },
    },
    required: ['success'],
  },
});

LEGAL_RESEARCH.tier = 'aid';
LEGAL_RESEARCH.domainKnowledge = 'Statutory and case-law research methodology, jurisdictional hierarchy, citation formatting, and precedent analysis';

LEGAL_RESEARCH.triggers = [
  { kind: 'user', phrase_examples: ['Research a legal question', 'Search statutes', 'Search case law'] },
];

export { LEGAL_RESEARCH };
