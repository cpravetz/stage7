import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = {
  type: 'object',
  properties: {
    boardTokens: {
      type: 'object',
      description: 'Pin exact ATS board names, e.g. { "greenhouse": ["stripe"], "ashby": ["ashby"], "lever": ["leverdemo"] }. Optional - company names are probed automatically.',
      properties: {
        greenhouse: { type: 'array', items: { type: 'string' } },
        ashby: { type: 'array', items: { type: 'string' } },
        lever: { type: 'array', items: { type: 'string' } },
      },
    },
    maxPerBoard: { type: 'number', default: 50, description: 'Maximum listings to take from each board' },
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
const companies = (input.companies && input.companies.length) ? input.companies : ((input.targetCompanies && input.targetCompanies.length) ? input.targetCompanies : (prefs.targetCompanies || []));
const jobTitles = (input.jobTitles && input.jobTitles.length) ? input.jobTitles : ((profile.targetTitles && profile.targetTitles.length) ? profile.targetTitles : (prefs.targetRoles || []));
const locations = (input.locations && input.locations.length) ? input.locations : (prefs.locations || []);

const discovery = await __execute_tool('career-job-discovery', {
queries: jobTitles,
companies,
boardTokens: configuredBoards.boardTokens || {},
locations,
minSalary: input.minSalary != null ? input.minSalary : prefs.minSalary,
maxSalary: input.maxSalary != null ? input.maxSalary : prefs.maxSalary,
maxPerBoard: configuredBoards.maxPerBoard,
});

// Upstream run statuses this skill must carry rather than flatten into "ok":
//   ok       - every source answered. A clean pass, reported clean.
//   no-match - every source answered and genuinely had nothing to show. A legitimate
//              empty: not a failure, and not a partial either.
//   partial  - some sources answered, others could not be retrieved or parsed at all.
//   failed   - no source could be retrieved. A total failure.
//   blocked  - there was nothing to search.
// A 'failed' or 'blocked' discovery fails here too, and keeps its upstream status. A
// 'partial' discovery is a real answer from the sources that did answer, so the
// ranking it produced is kept rather than thrown away, but it is reported as status
// 'partial' with a non-null error naming the unreachable sources and those sources
// listed in data.failures, so a ranking built on missing boards can never be mistaken
// for a clean pass over the whole market.
const discoveryStatus = discovery && typeof discovery.status === 'string' ? discovery.status : null;
const discoveryError = discovery && discovery.error ? String(discovery.error) : null;
const discoveryData = discovery && discovery.data && typeof discovery.data === 'object' ? discovery.data : {};
const discoveryFailures = Array.isArray(discoveryData.failures) ? discoveryData.failures : [];
const listings = Array.isArray(discoveryData.listings) ? discoveryData.listings : [];

function failureLines(list) {
  return list.map((f) => '  [FAILED] ' + ((f && f.board) || 'unknown source') + ' \\u2014 ' + ((f && f.note) || 'this source could not be retrieved or read')).join('\\n');
}

if (!discovery || discovery.success === false) {
  const status = discoveryStatus === 'blocked' ? 'blocked' : 'failed';
  const error = discoveryError || (status === 'blocked'
    ? 'Job discovery had nothing to search. Provide company names or job titles to search.'
    : 'Job discovery failed. No job board could be searched, so this run produced no ranking at all \\u2014 it did not determine that no jobs exist.');
  const body = [
    status === 'blocked' ? 'JOB SEARCH HAD NOTHING TO SEARCH' : 'JOB SEARCH FAILED',
    status === 'blocked' ? '==========================' : '=============',
    '',
    error,
  ];
  if (discoveryFailures.length) body.push('', 'Sources attempted:', failureLines(discoveryFailures));
  console.log(JSON.stringify({
    success: false,
    status: status,
    error: error,
    data: {
      ranked: [],
      total: 0,
      rawDiscovered: 0,
      queriesUsed: jobTitles,
      companiesSearched: companies,
      byBoard: discoveryData.byBoard || [],
      boards: [],
      failures: discoveryFailures,
      failureCount: discoveryFailures.length,
      discoveryStatus: status,
      autoApplied: null,
      note: error,
      delegatedTo: ['career-job-discovery'],
      generatedAt: new Date().toISOString(),
    },
    present: [{ id: 'failure', title: status === 'blocked' ? 'Job search had nothing to search' : 'Job search FAILED \\u2014 no source could be retrieved', kind: 'text', body: body.join('\\n') }],
  }));
  return;
}

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

// The discovery run is only complete if no source it consulted was unreachable. A run
// that retrieved every source it asked for is reported clean, whatever it found: a
// genuine zero is an answer, not a degradation.
const partialDiscovery = discoveryStatus === 'partial' || discoveryFailures.length > 0;
const runStatus = partialDiscovery ? 'partial' : (discoveryStatus === 'no-match' ? 'no-match' : 'ok');
const runError = partialDiscovery
  ? (discoveryError || (discoveryFailures.length + ' of the sources this search consulted could not be retrieved, so this ranking is not a complete answer about the job market: ' + discoveryFailures.map((f) => (f && f.board) || 'unknown source').join(', ') + '.'))
  : null;
const partialNote = partialDiscovery
  ? 'PARTIAL RESULT. The ' + ranked.length + ' ranked role' + (ranked.length === 1 ? '' : 's') + ' below come only from the job sources that answered. ' + runError + ' Roles on the sources that could not be retrieved are missing from this ranking because they were never read, not because they do not exist.'
  : null;

const baseNote = discoveryData.note || (ranked.length ? null : 'Discovery ran but returned no matching roles. Widen your filters or add more companies.');
const noteParts = [baseNote, partialNote].filter(Boolean);
const note = noteParts.length ? noteParts.join(' ') : undefined;

const presentBlocks = [];
const summaryLines = [];
summaryLines.push('Search & Fit Ranking');
summaryLines.push('====================');
summaryLines.push('');
summaryLines.push('Ranked roles: ' + ranked.length + ' (from ' + (discoveryData.total || 0) + ' discovered listing' + ((discoveryData.total || 0) === 1 ? '' : 's') + ')');
if (jobTitles.length) summaryLines.push('Titles searched: ' + jobTitles.join(', '));
if (companies.length) summaryLines.push('Companies: ' + companies.join(', '));
presentBlocks.push({ id: 'summary', title: runStatus === 'partial' ? 'Partial Search Results' : 'Search Results', kind: 'text', body: summaryLines.join('\\n') });

if (partialDiscovery) {
presentBlocks.push({
id: 'partial',
title: 'PARTIAL RESULT \\u2014 ' + discoveryFailures.length + ' source' + (discoveryFailures.length === 1 ? '' : 's') + ' were never read',
kind: 'text',
body: [
'PARTIAL RESULT. This ranking is not a complete answer about the job market.',
'',
runError,
'',
'Sources that could not be retrieved or read:',
failureLines(discoveryFailures),
].join('\\n'),
});
}

console.log(JSON.stringify({ success: true, status: runStatus, error: runError, data: { ranked, total: ranked.length, rawDiscovered: discoveryData.total || 0, queriesUsed: discoveryData.queriesUsed || jobTitles, companiesSearched: companies, byBoard: discoveryData.byBoard || [], boards: discoveryData.boardsSearched || discoveryData.boards || [], failures: discoveryFailures, failureCount: discoveryFailures.length, discoveryStatus: discoveryStatus || 'ok', complete: !partialDiscovery, storagePath: listPath, autoApplied, note, delegatedTo: ['career-job-discovery'].concat(ranked.length ? ['career-rank'] : []).concat(autoApplied ? ['career-application-execution'] : []), generatedAt: new Date().toISOString() }, present: presentBlocks }));
})();`;

const JOB_DISCOVERY_FIT_RANKING_INPUT = {
type: 'object',
properties: {
jobTitles: { type: 'array', items: { type: 'string' }, description: 'Job titles to search for. Defaults to your saved target titles/roles from your profile.' },
companies: { type: 'array', items: { type: 'string' }, description: 'Company names to search. Checked against the public Greenhouse, Ashby and Lever job board APIs - no key needed. Defaults to your saved target companies.' },
locations: { type: 'array', items: { type: 'string' }, description: 'Target locations. Defaults to your saved preferences.' },
minSalary: { type: 'number', description: 'Minimum target compensation. Defaults to your saved preference.' },
maxSalary: { type: 'number', description: 'Maximum target compensation. Defaults to your saved preference.' },
autoApplyThreshold: { type: 'number', description: 'If set, automatically submit an application (via Apply to Jobs) to every ranked job scoring at or above this fit score' },
dryRun: { type: 'boolean', description: 'Preview auto-applications without submitting; defaults to true', default: true },
},
};

const JOB_DISCOVERY_FIT_RANKING_OUTPUT = {
type: 'object',
properties: {
success: { type: 'boolean' },
status: { type: 'string', description: 'ok, no-match, partial, failed or blocked. "partial" means some job sources could not be retrieved at all, so the ranking covers only the sources that answered; "no-match" means every source answered and genuinely had no matching roles.' },
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
  failures: { type: 'array', description: 'The job sources that could not be retrieved or read, carried through from discovery. Non-empty on a partial run.' },
  failureCount: { type: 'number' },
  discoveryStatus: { type: 'string', description: 'The upstream discovery run status this result came from' },
  complete: { type: 'boolean', description: 'False when at least one job source could not be retrieved, so the ranking is incomplete' },
  storagePath: { type: 'string' },
note: { type: 'string' },
autoApplied: { type: 'object' },
delegatedTo: { type: 'array', items: { type: 'string' } },
generatedAt: { type: 'string', format: 'date-time' },
},
},
error: { type: 'string', description: 'Null on a clean run. Non-null on partial, failed and blocked runs, naming what could not be retrieved' },
present: {
type: 'array',
description: 'User-formatted blocks; a partial run always carries a block headed PARTIAL RESULT',
items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, kind: { type: 'string' }, body: { type: 'string' } }, required: ['id', 'body'] },
},
},
required: ['success', 'data'],
};

const JOB_DISCOVERY_FIT_RANKING = createCodeSkill({
id: 'career-job-discovery-fit-ranking',
name: 'Job Search & Fit Ranking',
description: 'Searches job boards for roles matching your profile, scores fit and ATS compatibility, and ranks opportunities by match quality. Reads the public Greenhouse, Ashby and Lever board APIs with no key required. Reports per-source status so empty results are never silent, and propagates upstream retrieval failures: a search where some job boards could not be reached is reported as status "partial" with a non-null error rather than as a clean ranking. Optionally auto-submits applications to roles meeting an auto-apply threshold via Apply to Jobs.',
manifest: {
language: 'javascript',
entrypoint: 'index.js',
sourceCode: JOB_DISCOVERY_FIT_RANKING_SOURCE,
configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
actionLabel: 'Search & Rank',
lowerOrderTools: ['career-job-discovery', 'career-application-execution'],
},
inputSchema: JOB_DISCOVERY_FIT_RANKING_INPUT,
outputSchema: JOB_DISCOVERY_FIT_RANKING_OUTPUT,
triggers: [
{ kind: 'user', phrase_examples: ['Discover jobs', 'Find matching roles', 'Rank my job options'] },
],
tier: 'advise',
domainKnowledge: 'Career coaching, job search strategy, resume and cover letter optimization, interview preparation, compensation negotiation',
isSkill: true,
});
JOB_DISCOVERY_FIT_RANKING.configSchema = JOB_DISCOVERY_FIT_RANKING.manifest.configSchema as SchemaRecord;

export { JOB_DISCOVERY_FIT_RANKING };
