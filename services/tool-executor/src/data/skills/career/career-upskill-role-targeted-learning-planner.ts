import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const UPSKILL_ROLE_TARGETED_LEARNING_PLANNER_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
// This skill defines the target role directly (a title or a pasted job posting) instead
// of re-running a full job search with location/salary filters that belong to Job Discovery.
const targetRole = input.jobTitle || input.targetRole || '';
const jobPosting = input.jobPosting || '';
if (!targetRole && !jobPosting) {
console.log(JSON.stringify({ success: false, mode: 'not-connected', error: 'Provide a jobTitle or paste a jobPosting to define the role you want to prepare for' }));
return;
}
const advisory = await __execute_tool('career_advisory', { question: 'resume_strength', targetRole, jobDescription: jobPosting || ('Create a targeted upskilling plan for this role: ' + targetRole) });
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
const postingText = String(jobPosting || targetRole).toLowerCase();
const missingSkills = targetSkills.filter((skill) => !postingText.includes(skill));
console.log(JSON.stringify({ success: true, data: { targetRole, missingSkills, learningPlan: advisoryData, delegatedTo: ['career_advisory'], generatedAt: new Date().toISOString() } }));
})();`;

const UPSKILL_ROLE_TARGETED_LEARNING_PLANNER_INPUT = {
type: 'object',
properties: {
jobTitle: { type: 'string', description: 'The job title you want to prepare for (e.g. Senior Data Scientist)' },
jobPosting: { type: 'string', description: 'Paste a specific job posting to tailor the plan to its exact requirements', multiline: true },
targetSkills: { type: 'array', items: { type: 'string' }, description: 'Skills you already have, to check against the role' },
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
targetRole: { type: 'string' },
missingSkills: { type: 'array', items: { type: 'string' } },
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
name: 'Upskill & Learning Planner',
description: 'Recommends a concise upskilling plan and curated learning resources for a specific job title or pasted job posting. Delegates to career_advisory. Reports not-connected when no usable recommendations come back.',
manifest: {
language: 'javascript',
entrypoint: 'index.js',
sourceCode: UPSKILL_ROLE_TARGETED_LEARNING_PLANNER_SOURCE,
configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
actionLabel: 'Generate upskill plan',
lowerOrderTools: ['career_advisory'],
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

