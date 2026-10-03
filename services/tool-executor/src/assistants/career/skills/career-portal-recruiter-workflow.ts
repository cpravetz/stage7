// @ts-nocheck

import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const PORTAL_RECRUITER_WORKFLOW_INPUT = {
type: 'object',
properties: {
dryRun: { type: 'boolean', description: 'Preview without submitting; defaults to true', default: true },
applyAt: { type: 'string', description: 'Where to apply: the job posting URL or application portal' },
targetCompany: { type: 'string', description: 'Target company for networking outreach' },
targetPerson: { type: 'string', description: 'Target person for networking outreach' },
relationshipStage: { type: 'string', enum: ['cold_outreach', 'follow_up', 'thank_you', 'referral_ask'], description: 'Relationship stage' },
channel: { type: 'string', enum: ['email', 'linkedin'], description: 'Outreach channel' },
connectedSendTool: { type: 'string', description: 'MCP reference for a connected send channel' },
},
	required: [],
};

const PORTAL_RECRUITER_WORKFLOW_OUTPUT = {
type: 'object',
properties: {
success: { type: 'boolean' },
status: { type: 'string', description: 'Execution status' },
data: {
type: 'object',
properties: {
applications: { type: 'object' },
outreach: { type: 'object' },
delegatedTo: { type: 'array', items: { type: 'string' } },
generatedAt: { type: 'string', format: 'date-time' },
},
},
error: { type: 'string' },
},
required: ['success', 'data'],
};

const PORTAL_RECRUITER_WORKFLOW = createDeclarativeCodeSkill({
  id: 'career-portal-recruiter-workflow',
  name: 'Application + Recruiter Outreach',
  description: 'Drafts a recruiter outreach follow-up for a target company after an application is prepared, while keeping the application flow separate. Delegates to career-application-execution and career-networking-outreach when available.',
  persistenceEnvVar: 'STORAGE_DIR',
  inputSchema: PORTAL_RECRUITER_WORKFLOW_INPUT,
  outputSchema: PORTAL_RECRUITER_WORKFLOW_OUTPUT,
  triggers: [
{ kind: 'user', phrase_examples: ['Submit my applications', 'Draft recruiter outreach', 'Run my portal workflow'] },
],
  tier: 'represent',
  domainKnowledge: 'Career coaching, job search strategy, resume and cover letter optimization, interview preparation, compensation negotiation',
  isSkill: true,
  manifest: {
    lowerOrderTools: ['career-application-execution', 'career-networking-outreach'],
    configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
    actionLabel: 'Draft outreach follow-up'
  },
  handler: async function handler(input, ctx) {
      let targetRoles = input.targetRoles || [];
      if (!targetRoles.length) {
      const pipeline = await ctx.delegate('career-pipeline-report', {});
      if (pipeline && pipeline.success && pipeline.data) {
        const pipelineData = pipeline.data;
        if (Array.isArray(pipelineData.tracking)) {
          targetRoles = pipelineData.tracking.map((entry) => entry.jobId || entry.id).filter(Boolean);
        }
      }
      }
      const application = await ctx.delegate('career-application-execution', { targetRoles, dryRun: input.dryRun !== false, connectedPortalTool: input.applyAt, coverLetters: input.coverLetters });
      if (!application || application.success === false || application.error) {

      return;
      }
      const applicationData = application.data && typeof application.data === 'object' ? application.data : application;
      const applications = Array.isArray(applicationData.applications) ? applicationData.applications : [];
      if (!applications.length) {

      return;
      }
      if (!input.targetCompany || !input.relationshipStage) {

      return;
      }
      const outreach = await ctx.delegate('career-networking-outreach', { targetCompany: input.targetCompany, targetPerson: input.targetPerson, relationshipStage: input.relationshipStage, channel: input.channel, connectedSendTool: input.connectedSendTool });
      if (!outreach || outreach.success === false || outreach.error) {

      return;
      }
      const outreachData = outreach.data && typeof outreach.data === 'object' ? outreach.data : outreach;
      if (!outreachData.summary && !outreachData.message && !outreachData.draft && !outreachData.options && !outreachData.rationale) {

      return;
      }
      return { success: true, data: { applications, outreach: outreachData, delegatedTo: ['career-application-execution', 'career-networking-outreach'], generatedAt: new Date().toISOString() } };
    }
  });
PORTAL_RECRUITER_WORKFLOW.configSchema = CAREER_WRAPPER_CONFIG_SCHEMA;

export { PORTAL_RECRUITER_WORKFLOW };
