import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const UPSKILL_ROLE_TARGETED_LEARNING_PLANNER_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const discovery = await __execute_tool('career_job_discovery', { queries: input.queries || [], locations: input.locations || [], minSalary: input.minSalary, maxSalary: input.maxSalary, connectedJobBoardTools: input.connectedJobBoardTools || [] });
if (!discovery || discovery.success === false || discovery.error) {
console.log(JSON.stringify({ success: false, mode: 'not-connected', error: discovery && discovery.error ? discovery.error : 'Not connected: job discovery yielded no data; connect a job-board source or run career_job_discovery first' }));
return;
}
const discoveryData = discovery.data && typeof discovery.data === 'object' ? discovery.data : discovery;
const ranked = Array.isArray(discoveryData.ranked) ? discoveryData.ranked : [];
if (!ranked.length) {
console.log(JSON.stringify({ success: false, mode: 'not-connected', error: 'Not connected: no ranked roles were returned for learning-plan analysis' }));
return;
}
const advisory = await __execute_tool('career_advisory', { question: 'resume_strength', targetRole: input.targetRole || '', jobDescription: 'Create a targeted upskilling plan for these roles: ' + ranked.slice(0, input.topN || 5).map((job) => job.title || job.id).join(', ') });
if (!advisory || advisory.success === false || advisory.error) {
console.log(JSON.stringify({ success: false, mode: 'not-connected', error: advisory && advisory.error ? advisory.error : 'Not connected: career advisory could not produce learning recommendations' }));
return;
}
const advisoryData = advisory.data && typeof advisory.data === 'object' ? advisory.data : advisory;
if (!advisoryData.summary && !advisoryData.recommendations && !advisoryData.options && !advisoryData.rationale) {
console.log(JSON.stringify({ success: false, mode: 'not-connected', error: 'Not connected: career advisory returned no usable recommendations' }));
return;
}
const targetSkills = Array.isArray(input.targetSkills) ? input.targetSkills.map((skill) => String(skill).toLowerCase()) : [];
const gaps = ranked.slice(0, input.topN || 5).map((job) => {
const description = String(job.description || job.title || '').toLowerCase();
return { jobId: job.id, title: job.title, fitScore: job.fitScore || 0, missingSkills: targetSkills.filter((skill) => !description.includes(skill)) };
});
console.log(JSON.stringify({ success: true, data: { ranked: gaps, learningPlan: advisoryData, delegatedTo: ['career_job_discovery', 'career_advisory'], generatedAt: new Date().toISOString() } }));
})();`;

const UPSKILL_ROLE_TARGETED_LEARNING_PLANNER_INPUT = {
type: 'object',
properties: {
queries: { type: 'array', items: { type: 'string' }, description: 'Target role queries' },
locations: { type: 'array', items: { type: 'string' }, description: 'Target locations' },
minSalary: { type: 'number' },
maxSalary: { type: 'number' },
connectedJobBoardTools: { type: 'array', items: { type: 'string' }, description: 'Connected job-board MCP tool references' },
targetRole: { type: 'string', description: 'Target role for upskilling plan' },
targetSkills: { type: 'array', items: { type: 'string' }, description: 'Skills to check against job titles' },
topN: { type: 'integer', description: 'Number of top-ranked roles to include', default: 5 },
},
};

const UPSKILL_ROLE_TARGETED_LEARNING_PLANNER_OUTPUT = {
type: 'object',
properties: {
success: { type: 'boolean' },
mode: { type: 'string' },
data: {
type: 'object',
properties: {
ranked: {
type: 'array',
items: {
type: 'object',
properties: {
jobId: { type: 'string' },
title: { type: 'string' },
fitScore: { type: 'number' },
missingSkills: { type: 'array', items: { type: 'string' } },
},
},
},
learningPlan: { type: 'object' },
delegatedTo: { type: 'array', items: { type: 'string' } },
generatedAt: { type: 'string', format: 'date-time' },
},
},
error: { type: 'string' },
},
required: ['success', 'data'],
};

const UPSKILL_ROLE_TARGETED_LEARNING_PLANNER = createCodeSkill({
id: 'career-upskill-role-targeted-learning-planner',
name: 'Upskill & Role-Targeted Learning Planner',
description: 'Recommends concise upskilling plans and curated learning resources aligned to target roles. Delegates to career_job_discovery for role fit data and career_advisory for learning recommendations. Reports not-connected when either dependency yields no data.',
manifest: {
language: 'javascript',
entrypoint: 'index.js',
sourceCode: UPSKILL_ROLE_TARGETED_LEARNING_PLANNER_SOURCE,
configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
actionLabel: 'Generate upskill plan',
lowerOrderTools: ['career_job_discovery', 'career_advisory'],
},
inputSchema: UPSKILL_ROLE_TARGETED_LEARNING_PLANNER_INPUT,
outputSchema: UPSKILL_ROLE_TARGETED_LEARNING_PLANNER_OUTPUT,
triggers: [
{ kind: 'user', phrase_examples: ['Plan my upskilling', 'What should I learn for this role', 'Close my skill gaps'] },
{ kind: 'schedule', cadence: 'Weekly upskilling plan review' },
{ kind: 'event', on: 'New job discovery results or role target change' },
],
});
UPSKILL_ROLE_TARGETED_LEARNING_PLANNER.configSchema = UPSKILL_ROLE_TARGETED_LEARNING_PLANNER.manifest.configSchema as SchemaRecord;

export { UPSKILL_ROLE_TARGETED_LEARNING_PLANNER };

