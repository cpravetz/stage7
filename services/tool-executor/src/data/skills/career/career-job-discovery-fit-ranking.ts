import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = {
  type: 'object',
  properties: {
    premiumJobBoards: { type: 'array', items: { type: 'string' }, description: 'Configured premium or member job boards' },
    freeJobBoards: { type: 'array', items: { type: 'string' }, description: 'Configured public job boards' },
  },
};

const JOB_DISCOVERY_FIT_RANKING_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const configuredBoards = input.config && typeof input.config === 'object' ? input.config : {};
const result = await __execute_tool('career-job-discovery', { queries: input.jobTitles || [], locations: input.locations || [], minSalary: input.minSalary, maxSalary: input.maxSalary, premiumJobBoards: configuredBoards.premiumJobBoards || [], freeJobBoards: configuredBoards.freeJobBoards || [] });
if (!result || result.success === false || result.error) {
console.log(JSON.stringify({ success: false, status: 'not-connected', error: result && result.error ? result.error : 'Not connected: job discovery returned no data; connect a job-board source or run career-job-discovery first' }));
return;
}
const data = result.data && typeof result.data === 'object' ? result.data : result;
const ranked = Array.isArray(data.ranked) ? data.ranked : [];
if (!ranked.length) {
console.log(JSON.stringify({ success: false, status: 'not-connected', error: 'Not connected: no ranked jobs were returned; connect a job-board source or provide discovery results' }));
return;
}
const baseDir = process.env.CAREER_HOME || '/tmp/career';
const listPath = baseDir + '/listings/default.json';
const fs = require('fs');
const existing = fs.existsSync(listPath) ? JSON.parse(fs.readFileSync(listPath, 'utf8')) : [];
const merged = [...existing];
for (const r of ranked) { const idx = merged.findIndex((m) => m.id === r.id); if (idx >= 0) merged[idx] = r; else merged.push(r); }
fs.mkdirSync(require('path').dirname(listPath), { recursive: true });
fs.writeFileSync(listPath, JSON.stringify(merged, null, 2));

// If an auto-apply threshold is set, hand qualifying jobs straight to Apply to Jobs
// instead of making the user re-enter the threshold on a separate skill.
let autoApplied = null;
if (typeof input.autoApplyThreshold === 'number') {
  const qualifying = ranked.filter((job) => (job.fitScore || 0) >= input.autoApplyThreshold);
  if (qualifying.length) {
    const applyRes = await __execute_tool('career-application-execution', { jobIds: qualifying.map((job) => job.id), dryRun: input.dryRun !== false });
    autoApplied = applyRes && applyRes.success ? applyRes.data : { error: applyRes && applyRes.error ? applyRes.error : 'Auto-apply did not run' };
  } else {
    autoApplied = { note: 'No ranked jobs met the auto-apply threshold' };
  }
}

console.log(JSON.stringify({ success: true, data: { ranked, total: ranked.length, queriesUsed: data.queriesUsed || input.jobTitles || [], storagePath: listPath, autoApplied, note: data.note || undefined, delegatedTo: ['career-job-discovery'].concat(autoApplied ? ['career-application-execution'] : []), generatedAt: new Date().toISOString() } }));
})();`;

const JOB_DISCOVERY_FIT_RANKING_INPUT = {
type: 'object',
properties: {
jobTitles: { type: 'array', items: { type: 'string' }, description: 'Job titles you want to pursue (e.g. Software Engineer, Data Scientist)' },
locations: { type: 'array', items: { type: 'string' }, description: 'Target locations' },
minSalary: { type: 'number', description: 'Minimum target compensation' },
maxSalary: { type: 'number', description: 'Maximum target compensation' },
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
queriesUsed: { type: 'array' },
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
description: 'Discovers roles across boards, scores fit and ATS compatibility, and ranks opportunities by match quality. Optionally auto-submits applications to roles meeting an auto-apply threshold via Apply to Jobs. Delegates to career-job-discovery and stores ranked results. Reports not-connected when discovery yields no data.',
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
