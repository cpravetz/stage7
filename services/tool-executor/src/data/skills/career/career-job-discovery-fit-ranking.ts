import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const JOB_DISCOVERY_FIT_RANKING_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const result = await __execute_tool('career_job_discovery', { queries: input.queries || [], locations: input.locations || [], minSalary: input.minSalary, maxSalary: input.maxSalary, connectedJobBoardTools: input.connectedJobBoardTools || [] });
if (!result || result.success === false || result.error) {
console.log(JSON.stringify({ success: false, mode: 'not-connected', error: result && result.error ? result.error : 'Not connected: job discovery returned no data; connect a job-board source or run career_job_discovery first' }));
return;
}
const data = result.data && typeof result.data === 'object' ? result.data : result;
const ranked = Array.isArray(data.ranked) ? data.ranked : [];
if (!ranked.length) {
console.log(JSON.stringify({ success: false, mode: 'not-connected', error: 'Not connected: no ranked jobs were returned; connect a job-board source or provide discovery results' }));
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
console.log(JSON.stringify({ success: true, data: { ranked, total: ranked.length, queriesUsed: data.queriesUsed || input.queries || [], storagePath: listPath, note: data.note || undefined, delegatedTo: 'career_job_discovery', generatedAt: new Date().toISOString() } }));
})();`;

const JOB_DISCOVERY_FIT_RANKING_INPUT = {
type: 'object',
properties: {
jobTitles: { type: 'array', items: { type: 'string' }, description: 'Job titles you want to pursue (e.g. Software Engineer, Data Scientist)' },
locations: { type: 'array', items: { type: 'string' }, description: 'Target locations' },
minSalary: { type: 'number', description: 'Minimum target compensation' },
maxSalary: { type: 'number', description: 'Maximum target compensation' },
connectedJobBoardTools: { type: 'array', items: { type: 'string' }, description: 'Job boards you have an account with (e.g. LinkedIn, Indeed)' },
},
};

const JOB_DISCOVERY_FIT_RANKING_OUTPUT = {
type: 'object',
properties: {
success: { type: 'boolean' },
mode: { type: 'string' },
data: {
type: 'object',
properties: {
ranked: { type: 'array' },
total: { type: 'number' },
queriesUsed: { type: 'array' },
storagePath: { type: 'string' },
note: { type: 'string' },
delegatedTo: { type: 'string' },
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
description: 'Discovers roles across boards, scores fit and ATS compatibility, and ranks opportunities by match quality. Delegates to career_job_discovery and stores ranked results. Reports not-connected when discovery yields no data.',
manifest: {
language: 'javascript',
entrypoint: 'index.js',
sourceCode: JOB_DISCOVERY_FIT_RANKING_SOURCE,
configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
actionLabel: 'Discover & Rank',
lowerOrderTools: ['career_job_discovery'],
},
inputSchema: JOB_DISCOVERY_FIT_RANKING_INPUT,
outputSchema: JOB_DISCOVERY_FIT_RANKING_OUTPUT,
triggers: [
{ kind: 'user', phrase_examples: ['Discover jobs', 'Find matching roles', 'Rank my job options'] },
{ kind: 'schedule', cadence: 'Daily target job discovery digest' },
{ kind: 'event', on: 'Profile updated or new job board data available' },
],
});
JOB_DISCOVERY_FIT_RANKING.configSchema = JOB_DISCOVERY_FIT_RANKING.manifest.configSchema as SchemaRecord;

export { JOB_DISCOVERY_FIT_RANKING };

