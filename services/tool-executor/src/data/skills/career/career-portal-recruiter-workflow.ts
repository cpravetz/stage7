import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const PORTAL_RECRUITER_WORKFLOW_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
let jobIds = input.jobIds || [];
if (!jobIds.length) {
  const pipeline = await __execute_tool('career_pipeline_report', {});
  if (pipeline && pipeline.success && pipeline.data) {
    const pipelineData = pipeline.data;
    if (Array.isArray(pipelineData.tracking)) {
      jobIds = pipelineData.tracking.map((entry) => entry.jobId || entry.id).filter(Boolean);
    }
  }
}
const application = await __execute_tool('career_apply_execute', { jobIds, dryRun: input.dryRun !== false, connectedPortalTool: input.connectedPortalTool, coverLetters: input.coverLetters });
if (!application || application.success === false || application.error) {
console.log(JSON.stringify({ success: false, mode: 'not-connected', error: application && application.error ? application.error : 'Not connected: application execution returned no result; ensure a profile, ranked listings, and a portal connector are available' }));
return;
}
const applicationData = application.data && typeof application.data === 'object' ? application.data : application;
const applications = Array.isArray(applicationData.applications) ? applicationData.applications : [];
if (!applications.length) {
console.log(JSON.stringify({ success: false, mode: 'not-connected', error: 'Not connected: no applications were selected or prepared for the recruiter workflow' }));
return;
}
if (!input.targetCompany || !input.relationshipStage) {
console.log(JSON.stringify({ success: false, mode: 'not-connected', error: 'Not connected: recruiter outreach requires targetCompany and relationshipStage' }));
return;
}
const outreach = await __execute_tool('career_networking_outreach', { targetCompany: input.targetCompany, targetPerson: input.targetPerson, relationshipStage: input.relationshipStage, channel: input.channel, connectedSendTool: input.connectedSendTool });
if (!outreach || outreach.success === false || outreach.error) {
console.log(JSON.stringify({ success: false, mode: 'not-connected', error: outreach && outreach.error ? outreach.error : 'Not connected: networking outreach could not be generated; provide target company and relationship stage' }));
return;
}
const outreachData = outreach.data && typeof outreach.data === 'object' ? outreach.data : outreach;
if (!outreachData.summary && !outreachData.message && !outreachData.draft && !outreachData.options && !outreachData.rationale) {
console.log(JSON.stringify({ success: false, mode: 'not-connected', error: 'Not connected: networking outreach returned no usable draft' }));
return;
}
console.log(JSON.stringify({ success: true, data: { applications, outreach: outreachData, delegatedTo: ['career_apply_execute', 'career_networking_outreach'], generatedAt: new Date().toISOString() } }));
})();`;

const PORTAL_RECRUITER_WORKFLOW_INPUT = {
type: 'object',
properties: {
dryRun: { type: 'boolean', description: 'Preview without submitting; defaults to true', default: true },
connectedPortalTool: { type: 'string', description: 'The job portal you want to submit applications through (e.g. LinkedIn, Indeed)' },
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
mode: { type: 'string' },
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

const PORTAL_RECRUITER_WORKFLOW = createCodeSkill({
id: 'career-portal-recruiter-workflow',
name: 'Portal Integration & Recruiter Workflow',
description: 'Manages portal credential registration, confirm-before-send submission flows, and recruiter outreach sequencing. Delegates to career_apply_execute for submissions and career_networking_outreach for outreach drafting. Reports not-connected when either dependency yields no data.',
manifest: {
language: 'javascript',
entrypoint: 'index.js',
sourceCode: PORTAL_RECRUITER_WORKFLOW_SOURCE,
lowerOrderTools: ['career_apply_execute', 'career_networking_outreach'],
configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
		actionLabel: 'Run portal & outreach workflow',
},
inputSchema: PORTAL_RECRUITER_WORKFLOW_INPUT,
outputSchema: PORTAL_RECRUITER_WORKFLOW_OUTPUT,
triggers: [
{ kind: 'user', phrase_examples: ['Submit my applications', 'Draft recruiter outreach', 'Run my portal workflow'] },
{ kind: 'schedule', cadence: 'Daily portal and outreach review' },
{ kind: 'event', on: 'Application submitted or recruiter message drafted' },
],
});

export { PORTAL_RECRUITER_WORKFLOW };

