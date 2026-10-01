// @ts-nocheck
import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const UPSKILL_ROLE_TARGETED_LEARNING_PLANNER_INPUT = {
  type: 'object',
  properties: {
    jobTitle: { type: 'string', description: 'The job title you want to prepare for (e.g. Senior Data Scientist)', title: 'Target Role', order: 1, hint: 'e.g. Senior Data Scientist', 'x-referenceSource': 'career-job-discovery-fit-ranking', 'x-referenceValueField': 'title', 'x-referenceLabel': 'your job search results' },
    jobPosting: { type: 'string', description: 'Paste a specific job posting to tailor the plan to its exact requirements', title: 'Job Posting', order: 2, hint: 'Optional: paste full job description', multiline: true },
    targetSkills: { type: 'array', items: { type: 'string' }, description: 'Skills you already have, to check against the role', title: 'Your Skills', order: 3, hint: 'Comma-separated list of skills you possess' },
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

const UPSKILL_ROLE_TARGETED_LEARNING_PLANNER = createDeclarativeCodeSkill({
  id: 'career-upskill-role-targeted-learning-planner',
  name: 'Upskill & Learning Planner',
  description: 'Recommends a concise upskilling plan and curated learning resources for a specific job title or pasted job posting. Delegates to career-advisory. Reports not-connected when no usable recommendations come back.',
  persistenceEnvVar: 'STORAGE_DIR',
  inputSchema: UPSKILL_ROLE_TARGETED_LEARNING_PLANNER_INPUT,
  outputSchema: UPSKILL_ROLE_TARGETED_LEARNING_PLANNER_OUTPUT,
  triggers: [
    { kind: 'user', phrase_examples: ['Plan my upskilling', 'What should I learn for this role', 'Close my skill gaps'] },
  ],
  tier: 'advise',
  domainKnowledge: 'Career coaching, job search strategy, resume and cover letter optimization, interview preparation, compensation negotiation',
  isSkill: true,
  manifest: {
    configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
    lowerOrderTools: ['career-advisory'],
    actionLabel: 'Generate upskill plan',
    timeoutMs: 60000
  },
  handler: async function handler(input, ctx) {
      // This skill defines the target role directly (a title or a pasted job posting) instead
      // of re-running a full job search with location/salary filters that belong to Job Discovery.
      const targetRole = input.jobTitle || '';
      const jobPosting = input.jobPosting || '';
      if (!targetRole && !jobPosting) {

      return;
      }
      const advisory = await ctx.delegate('career-advisory', { question: 'resume_strength', targetRole, jobDescription: jobPosting || ('Create a targeted upskilling plan for this role: ' + targetRole) });
      if (!advisory || advisory.success === false || advisory.error) {

      return;
      }
      const advisoryData = advisory.data && typeof advisory.data === 'object' ? advisory.data : advisory;
      if (!advisoryData.summary && !advisoryData.recommendations && !advisoryData.options && !advisoryData.rationale) {

      return;
      }
      const targetSkills = Array.isArray(input.targetSkills) ? input.targetSkills.map((skill) => String(skill).toLowerCase()) : [];
      const postingText = String(jobPosting || targetRole).toLowerCase();
      const missingSkills = targetSkills.filter((skill) => !postingText.includes(skill));
      return { success: true, data: { targetRole: targetRole || jobPosting, missingSkills, learningPlan: advisoryData, delegatedTo: ['career-advisory'], generatedAt: new Date().toISOString() } };
    }
  });
UPSKILL_ROLE_TARGETED_LEARNING_PLANNER.configSchema = CAREER_WRAPPER_CONFIG_SCHEMA;
UPSKILL_ROLE_TARGETED_LEARNING_PLANNER.configSchema = UPSKILL_ROLE_TARGETED_LEARNING_PLANNER.manifest.configSchema as SchemaRecord;

export { UPSKILL_ROLE_TARGETED_LEARNING_PLANNER };
