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
  console.log(JSON.stringify({ success: false, error: 'Provide a jobTitle or paste a jobPosting to define the role you want to prepare for' }));
  return;
}
const advisory = await __execute_tool('career-advisory', { question: 'resume_strength', targetRole, jobDescription: jobPosting || ('Create a targeted upskilling plan for this role: ' + targetRole) });
if (!advisory || advisory.success === false || advisory.error) {
  console.log(JSON.stringify({ success: false, error: advisory && advisory.error ? advisory.error : 'Career advisory could not produce learning recommendations' }));
  return;
}
const advisoryData = advisory.data && typeof advisory.data === 'object' ? advisory.data : advisory;
if (!advisoryData.summary && !advisoryData.recommendations && !advisoryData.options && !advisoryData.rationale) {
  console.log(JSON.stringify({ success: false, error: 'Career advisory returned no usable recommendations' }));
  return;
}
const targetSkills = Array.isArray(input.targetSkills) ? input.targetSkills.map((skill) => String(skill).toLowerCase()) : [];
const postingText = String(jobPosting || targetRole).toLowerCase();
const missingSkills = targetSkills.filter((skill) => !postingText.includes(skill));
console.log(JSON.stringify({ success: true, data: { targetRole, missingSkills, learningPlan: advisoryData, delegatedTo: ['career-advisory'], generatedAt: new Date().toISOString() } }));
})();`;

const UPSKILL_ROLE_TARGETED_LEARNING_PLANNER_INPUT = {
  type: 'object',
  properties: {
    jobTitle: { type: 'string', description: 'The job title you want to prepare for (e.g. Senior Data Scientist)', title: 'Job Title', order: 1, hint: 'e.g. Senior Data Scientist' },
    jobPosting: { type: 'string', description: 'Paste a specific job posting to tailor the plan to its exact requirements', title: 'Job Posting', order: 2, hint: 'Optional: paste full job description', multiline: true },
    targetSkills: { type: 'array', items: { type: 'string' }, description: 'Skills you already have, to check against the role', title: 'Your Skills', order: 3, hint: 'Comma-separated list of skills you possess' },
    targetRole: { type: 'string', description: 'Target role title', title: 'Target Role', order: 4, hint: 'Alternative to jobTitle; the role you want to prepare for' },
  },
};

const UPSKILL_ROLE_TARGETED_LEARNING_PLANNER_OUTPUT = {
type: 'object',
properties: {
success: { type: 'boolean' },
status: { type: 'string', description: 'Execution status' },
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
description: 'Recommends a concise upskilling plan and curated learning resources for a specific job title or pasted job posting. Delegates to career-advisory. Reports not-connected when no usable recommendations come back.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: UPSKILL_ROLE_TARGETED_LEARNING_PLANNER_SOURCE,
    configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
    lowerOrderTools: ['career-advisory'],
    actionLabel: 'Generate upskill plan',
    timeoutMs: 60000,
  },
  inputSchema: UPSKILL_ROLE_TARGETED_LEARNING_PLANNER_INPUT,
  outputSchema: UPSKILL_ROLE_TARGETED_LEARNING_PLANNER_OUTPUT,
  triggers: [
    { kind: 'user', phrase_examples: ['Plan my upskilling', 'What should I learn for this role', 'Close my skill gaps'] },
  ],
  isSkill: true,
});
UPSKILL_ROLE_TARGETED_LEARNING_PLANNER.configSchema = UPSKILL_ROLE_TARGETED_LEARNING_PLANNER.manifest.configSchema as SchemaRecord;

export { UPSKILL_ROLE_TARGETED_LEARNING_PLANNER };
