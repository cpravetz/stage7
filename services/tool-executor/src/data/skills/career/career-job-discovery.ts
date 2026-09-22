import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_BASE_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

// career_job_discovery: searches job boards and returns normalized listings.
// Returns { success, data: { listings, total, queriesUsed } }
const CAREER_JOB_DISCOVERY_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const fs = require('fs');
const path = require('path');
const baseDir = process.env.CAREER_HOME || '/tmp/career';
const queries = input.queries || input.query ? [input.query] : [];
const locations = input.locations || [];
const premiumJobBoards = input.premiumJobBoards || [];
const freeJobBoards = input.freeJobBoards || [];
const boards = [...premiumJobBoards, ...freeJobBoards];

// If boards are configured but queries are empty, we still can't search without a query.
if (boards.length && !queries.length) {
  console.log(JSON.stringify({
    success: false,
    mode: 'not-connected',
    error: 'Not connected: no search queries provided. Provide at least one job title or query to search the configured boards.',
  }));
  return;
}

// We have boards + queries but no real scraping backend is wired up.
// Return not-connected rather than fabricating placeholder data.
if (boards.length) {
  console.log(JSON.stringify({
    success: false,
    mode: 'not-connected',
    error: 'Not connected: job-board scraping is not configured' + (boards.length ? ' for boards: ' + boards.join(', ') : '') + '. Connect a job-board MCP or configure a scraping endpoint to search for real listings.',
  }));
  return;
}

// Queries provided but no boards configured: the skill can still surface a helpful
// message instead of blocking execution. Users shouldn't need to configure the
// most popular job listings unless the site requires a login — in that case the
// configuration would be credentials, not the entire API or scrape constants.
console.log(JSON.stringify({
  success: false,
  mode: 'not-connected',
  error: 'Not connected: job-board scraping is not configured. Provide queries to search, or connect a job-board MCP / configure a scraping endpoint to search for real listings.',
}));
})();`;

const CAREER_JOB_DISCOVERY_INPUT = {
  type: 'object',
  properties: {
    queries: { type: 'array', items: { type: 'string' }, description: 'Search queries' },
    query: { type: 'string', description: 'Single search query' },
    locations: { type: 'array', items: { type: 'string' } },
    minSalary: { type: 'number' },
    maxSalary: { type: 'number' },
    targetCompanies: { type: 'array', items: { type: 'string' } },
    premiumJobBoards: { type: 'array', items: { type: 'string' } },
    freeJobBoards: { type: 'array', items: { type: 'string' } },
  },
};

const CAREER_JOB_DISCOVERY_OUTPUT = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        listings: { type: 'array' },
        total: { type: 'number' },
        queriesUsed: { type: 'array' },
        storagePath: { type: 'string' },
        generatedAt: { type: 'string', format: 'date-time' },
      },
    },
  },
  required: ['success', 'data'],
};

const CAREER_JOB_DISCOVERY = createCodeSkill({
  id: 'career_job_discovery',
  name: 'Job Discovery',
  description: 'Searches configured job boards for listings matching the candidate profile. Returns normalized job objects with title, company, location, salary, and apply URL.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: CAREER_JOB_DISCOVERY_SOURCE,
    configSchema: CAREER_BASE_CONFIG_SCHEMA,
    actionLabel: 'Discover jobs',
  },
  inputSchema: CAREER_JOB_DISCOVERY_INPUT,
  outputSchema: CAREER_JOB_DISCOVERY_OUTPUT,
  triggers: [
    { kind: 'user', phrase_examples: ['Discover jobs', 'Search job boards', 'Find new listings'] },
    { kind: 'schedule', cadence: 'Daily target job discovery digest' },
  ],
});
CAREER_JOB_DISCOVERY.configSchema = CAREER_JOB_DISCOVERY.manifest.configSchema as SchemaRecord;

export { CAREER_JOB_DISCOVERY };