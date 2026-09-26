import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = {
  type: 'object',
  properties: {
    premiumJobBoards: { type: 'array', items: { type: 'string' }, description: 'Configured premium or member job boards' },
    freeJobBoards: { type: 'array', items: { type: 'string' }, description: 'Configured public job boards' },
    boardTokens: {
      type: 'object',
      description: 'Pin exact ATS board names, e.g. { "greenhouse": ["stripe"], "ashby": ["ashby"], "lever": ["leverdemo"] }. Optional - company names are probed automatically.',
      properties: {
        greenhouse: { type: 'array', items: { type: 'string' } },
        ashby: { type: 'array', items: { type: 'string' } },
        lever: { type: 'array', items: { type: 'string' } },
      },
    },
  },
};

const JOB_DISCOVERY_FIT_RANKING_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const fs = require('fs');
const path = require('path');
const configuredBoards = input.config && typeof input.config === 'object' ? input.config : {};

// Fall back to the stored profile so a plain "run discovery" still searches with the
// targets, filters and company list the user already saved in Profile Intake.
const baseDir = process.env.CAREER_HOME || '/tmp/career';
const profilePath = path.join(baseDir, 'profiles', (input.profileId || 'default') + '.json');
let profile = {};
try { if (fs.existsSync(profilePath)) profile = JSON.parse(fs.readFileSync(profilePath, 'utf8')); } catch (e) {}
const prefs = profile.preferences || {};
const targetRole = input.targetRole || profile.targetRole || '';
const companies = (input.companies && input.companies.length) ? input.companies : ((input.targetCompanies && input.targetCompanies.length) ? input.targetCompanies : (prefs.targetCompanies || []));
const jobTitles = (input.jobTitles && input.jobTitles.length) ? input.jobTitles : (targetRole ? [targetRole] : []);
const locations = (input.locations && input.locations.length) ? input.locations : (prefs.locations || []);

const discovery = await __execute_tool('career-job-discovery', {
queries: jobTitles,
companies,
boardTokens: input.boardTokens || (configuredBoards.boardTokens || {}),
locations,
minSalary: input.minSalary != null ? input.minSalary : prefs.minSalary,
maxSalary: input.maxSalary != null ? input.maxSalary : prefs.maxSalary,
premiumJobBoards: configuredBoards.premiumJobBoards || [],
freeJobBoards: configuredBoards.freeJobBoards || [],
searchEngines: input.searchEngines || [],
maxPerBoard: input.maxPerBoard,
});
if (!discovery || discovery.success === false) {
console.log(JSON.stringify({ success: false, error: discovery && discovery.error ? discovery.error : 'Job discovery failed. Provide company names or job titles to search.' }));
return;
}
const discoveryData = discovery.data && typeof discovery.data === 'object' ? discovery.data : {};
const listings = Array.isArray(discoveryData.listings) ? discoveryData.listings : [];

// Rank discovered listings against the stored profile before storing or returning.
let rankResult = null;
if (listings.length) {
rankResult = await __execute_tool('career-rank', { items: listings });
}
const ranked = rankResult && rankResult.success && rankResult.data ? (Array.isArray(rankResult.data.ranked) ? rankResult.data.ranked : []) : [];

const listPath = baseDir + '/listings/default.json';
const existing = fs.existsSync(listPath) ? JSON.parse(fs.readFileSync(listPath, 'utf8')) : [];
const merged = Array.isArray(existing) ? existing.slice() : [];
for (const r of ranked) { const idx = merged.findIndex((m) => m.id === r.id); if (idx >= 0) merged[idx] = r; else merged.push(r); }
fs.mkdirSync(path.dirname(listPath), { recursive: true });
fs.writeFileSync(listPath, JSON.stringify(merged, null, 2));

let autoApplied = null;
if (typeof input.autoApplyThreshold === 'number') {
const qualifying = ranked.filter((job) => (job.score || 0) >= input.autoApplyThreshold);
if (qualifying.length) {
const applyRes = await __execute_tool('career-application-execution', { listings: qualifying.map((job) => job.id || job.jobId), dryRun: input.dryRun !== false });
autoApplied = applyRes && applyRes.success ? applyRes.data : { error: applyRes && applyRes.error ? applyRes.error : 'Auto-apply did not run' };
} else {
autoApplied = { note: 'No ranked jobs met the auto-apply threshold' };
}
}

const note = discoveryData.note || (ranked.length ? undefined : 'Discovery ran but returned no matching roles. Widen your filters or add more companies.');

console.log(JSON.stringify({ success: true, data: { ranked, total: ranked.length, rawDiscovered: discoveryData.total || 0, queriesUsed: discoveryData.queriesUsed || jobTitles, companiesSearched: companies, byBoard: discoveryData.byBoard || [], boards: discoveryData.boardsSearched || discoveryData.boards || [], serpApiConfigured: !!discoveryData.serpApiConfigured, storagePath: listPath, autoApplied, note, delegatedTo: ['career-job-discovery'].concat(ranked.length ? ['career-rank'] : []).concat(autoApplied ? ['career-application-execution'] : []), generatedAt: new Date().toISOString() } }));
})();`;

const JOB_DISCOVERY_FIT_RANKING_INPUT = {
type: 'object',
properties: {
jobTitles: { type: 'array', items: { type: 'string' }, description: 'Job titles you want to pursue (e.g. Software Engineer, Data Scientist). Defaults to your saved target role.' },
companies: { type: 'array', items: { type: 'string' }, description: 'Company names to search. Checked against the public Greenhouse, Ashby and Lever job board APIs - no key needed. Defaults to your saved target companies.' },
targetRole: { type: 'string', description: 'A single target role; defaults to your saved target role' },
locations: { type: 'array', items: { type: 'string' }, description: 'Target locations. Defaults to your saved preferences.' },
boardTokens: { type: 'object', description: 'Pin exact ATS board names, e.g. { "greenhouse": ["stripe"] }', properties: { greenhouse: { type: 'array', items: { type: 'string' } }, ashby: { type: 'array', items: { type: 'string' } }, lever: { type: 'array', items: { type: 'string' } } } },
searchEngines: { type: 'array', items: { type: 'string' }, description: 'SerpAPI engines for the job-board aggregators: google_jobs, indeed, linkedin_jobs, glassdoor, monster, wellfound' },
minSalary: { type: 'number', description: 'Minimum target compensation. Defaults to your saved preference.' },
maxSalary: { type: 'number', description: 'Maximum target compensation. Defaults to your saved preference.' },
maxPerBoard: { type: 'number', description: 'Maximum listings to take from each board', default: 50 },
autoApplyThreshold: { type: 'number', description: 'If set, automatically submit an application (via Apply to Jobs) to every ranked job scoring at or above this fit score' },
dryRun: { type: 'boolean', description: 'Preview auto-applications without submitting; defaults to true', default: true },
},
};

const JOB_DISCOVERY_FIT_RANKING_OUTPUT = {
type: 'object',
properties: {
success: { type: 'boolean' },
status: { type: 'string', description: 'Execution status' },
data: {
type: 'object',
properties: {
ranked: { type: 'array' },
total: { type: 'number' },
rawDiscovered: { type: 'number', description: 'Listings found before profile ranking' },
queriesUsed: { type: 'array' },
companiesSearched: { type: 'array' },
byBoard: { type: 'array', description: 'Per-source status, so a real empty result is distinguishable from a source that never ran' },
boards: { type: 'array' },
serpApiConfigured: { type: 'boolean' },
storagePath: { type: 'string' },
note: { type: 'string' },
autoApplied: { type: 'object' },
delegatedTo: { type: 'array', items: { type: 'string' } },
generatedAt: { type: 'string', format: 'date-time' },
},
},
error: { type: 'string' },
},
required: ['success', 'data'],
};

const JOB_DISCOVERY_FIT_RANKING = createCodeSkill({
id: 'career-job-discovery-fit-ranking',
name: 'Job Discovery & Fit Ranking',
description: 'Searches real job boards for roles matching your profile, scores fit and ATS compatibility, and ranks opportunities by match quality. Reads the public Greenhouse, Ashby and Lever board APIs with no key required, and uses a SerpAPI key to also cover Google Jobs, LinkedIn, Indeed, Glassdoor, Monster and Wellfound. Reports per-source status so empty results are never silent. Optionally auto-submits applications to roles meeting an auto-apply threshold via Apply to Jobs.',
manifest: {
language: 'javascript',
entrypoint: 'index.js',
sourceCode: JOB_DISCOVERY_FIT_RANKING_SOURCE,
configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
actionLabel: 'Discover & Rank',
lowerOrderTools: ['career-job-discovery', 'career-application-execution'],
},
inputSchema: JOB_DISCOVERY_FIT_RANKING_INPUT,
outputSchema: JOB_DISCOVERY_FIT_RANKING_OUTPUT,
triggers: [
{ kind: 'user', phrase_examples: ['Discover jobs', 'Find matching roles', 'Rank my job options'] },
],
isSkill: true,
});
JOB_DISCOVERY_FIT_RANKING.configSchema = JOB_DISCOVERY_FIT_RANKING.manifest.configSchema as SchemaRecord;

export { JOB_DISCOVERY_FIT_RANKING };
