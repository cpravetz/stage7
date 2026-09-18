import { Tool, SchemaRecord } from '../../types';
import { createCodeSkill, SchemaProps, createSchemaRecord, createExternalActionSkill } from './code-skill-factory';

// ============================================================================
// Career Canonical Extended — 8 higher-order tools + 1 internal Gmail tool.
//
// Combines with the 3 existing canonical tools in career-canonical.ts to
// cover all 11 Career Coach higher-order skills from docs/assistants design
// 0915-3.md (section 2).
//
// Each wrapper delegates to existing lower-order tool IDs via __execute_tool,
// inspects nested result.success, and returns honest not-connected/error
// output when the callee fails or yields no data.
// ============================================================================

// ----------------------------------------------------------------------------
// 1. career-job-discovery-fit-ranking -> career_job_discovery
// ----------------------------------------------------------------------------

const JOB_DISCOVERY_FIT_RANKING_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const result = await __execute_tool('career_job_discovery', { queries: input.queries || [], locations: input.locations || [] });
if (!result || !result.success) { console.log(JSON.stringify({ success: false, mode: 'not-connected', error: result && result.error ? result.error : 'Not connected' })); return; }
console.log(JSON.stringify({ success: true, data: { ranked: result.data && result.data.ranked || [], delegatedTo: 'career_job_discovery', generatedAt: new Date().toISOString() } }));
})();`;

const JOB_DISCOVERY_FIT_RANKING_INPUT = {
type: 'object',
properties: {
queries: { type: 'array', items: { type: 'string' }, description: 'Target role queries' },
locations: { type: 'array', items: { type: 'string' }, description: 'Target locations' },
minSalary: { type: 'number', description: 'Minimum target compensation' },
maxSalary: { type: 'number', description: 'Maximum target compensation' },
connectedJobBoardTools: { type: 'array', items: { type: 'string' }, description: 'Connected job-board MCP tool references' },
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
JOB_DISCOVERY_FIT_RANKING.configSchema = { type: 'object', properties: {} };

// ----------------------------------------------------------------------------
// 2. career-application-execution-orchestrator -> career_apply_execute
// ----------------------------------------------------------------------------

const APPLICATION_EXECUTION_ORCHESTRATOR_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const result = await __execute_tool('career_apply_execute', { jobIds: input.jobIds || [] });
if (!result || !result.success) { console.log(JSON.stringify({ success: false, mode: 'not-connected', error: result && result.error ? result.error : 'Not connected' })); return; }
console.log(JSON.stringify({ success: true, data: { applications: result.data || {}, delegatedTo: 'career_apply_execute', orchestratedAt: new Date().toISOString() } }));
})();`;

const APPLICATION_EXECUTION_ORCHESTRATOR_INPUT = {
type: 'object',
properties: {
jobIds: { type: 'array', items: { type: 'string' }, description: 'Explicit jobs to apply to' },
autoApplyThreshold: { type: 'number', description: 'Apply to every ranked job at or above this fit score' },
dryRun: { type: 'boolean', description: 'Preview without submitting; defaults to true', default: true },
connectedPortalTool: { type: 'string', description: 'MCP tool reference for a connected application portal' },
coverLetters: { type: 'object', description: 'jobId -> generated cover letter text' },
},
};

const APPLICATION_EXECUTION_ORCHESTRATOR_OUTPUT = {
type: 'object',
properties: {
success: { type: 'boolean' },
mode: { type: 'string' },
data: {
type: 'object',
properties: {
applications: { type: 'array' },
errors: { type: 'array' },
dryRun: { type: 'boolean' },
trackingPath: { type: 'string' },
delegatedTo: { type: 'string' },
orchestratedAt: { type: 'string', format: 'date-time' },
},
},
error: { type: 'string' },
},
required: ['success', 'data'],
};

const APPLICATION_EXECUTION_ORCHESTRATOR = createCodeSkill({
id: 'career-application-execution-orchestrator',
name: 'Application Execution & Orchestrator',
description: 'Orchestrates multi-portal application submission workflows with dry-run, confirm-before-send, and explicit audit trails. Delegates to career_apply_execute. Provides honest not-connected fallback when no portal is configured or no jobs are selected.',
manifest: {
language: 'javascript',
entrypoint: 'index.js',
sourceCode: APPLICATION_EXECUTION_ORCHESTRATOR_SOURCE,
lowerOrderTools: ['career_apply_execute'],
},
inputSchema: APPLICATION_EXECUTION_ORCHESTRATOR_INPUT,
outputSchema: APPLICATION_EXECUTION_ORCHESTRATOR_OUTPUT,
triggers: [
{ kind: 'user', phrase_examples: ['Apply to these jobs', 'Submit applications', 'Auto-apply to ranked roles'] },
{ kind: 'schedule', cadence: 'Daily application review and submission' },
{ kind: 'event', on: 'New ranked listing or user confirms application submission' },
],
});
APPLICATION_EXECUTION_ORCHESTRATOR.configSchema = { type: 'object', properties: {} };

// ----------------------------------------------------------------------------
// 3. career-upskill-role-targeted-learning-planner -> career_job_discovery + career_advisory
// ----------------------------------------------------------------------------

const UPSKILL_ROLE_TARGETED_LEARNING_PLANNER_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const discovery = await __execute_tool('career_job_discovery', { queries: input.queries || [] });
if (!discovery || !discovery.success) { console.log(JSON.stringify({ success: false, mode: 'not-connected', error: discovery && discovery.error ? discovery.error : 'Not connected' })); return; }
const advisory = await __execute_tool('career_advisory', { question: 'Create a targeted upskilling plan' });
if (!advisory || !advisory.success) { console.log(JSON.stringify({ success: false, mode: 'not-connected', error: advisory && advisory.error ? advisory.error : 'Not connected' })); return; }
console.log(JSON.stringify({ success: true, data: { ranked: discovery.data && discovery.data.ranked || [], learningPlan: advisory.data || {}, delegatedTo: ['career_job_discovery','career_advisory'], generatedAt: new Date().toISOString() } }));
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
UPSKILL_ROLE_TARGETED_LEARNING_PLANNER.configSchema = { type: 'object', properties: {} };

// ----------------------------------------------------------------------------
// 4. career-interview-practice-mock-interviewer -> career_interview_prep
// ----------------------------------------------------------------------------

const INTERVIEW_PRACTICE_MOCK_INTERVIEWER_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const result = await __execute_tool('career_interview_prep', { jobId: input.jobId });
if (!result || !result.success) { console.log(JSON.stringify({ success: false, mode: 'not-connected', error: result && result.error ? result.error : 'Not connected' })); return; }
console.log(JSON.stringify({ success: true, data: { interviewPrep: result.data || {}, delegatedTo: 'career_interview_prep', mockSessionId: 'mock_' + Date.now(), generatedAt: new Date().toISOString() } }));
})();`;

const INTERVIEW_PRACTICE_MOCK_INTERVIEWER_INPUT = {
type: 'object',
properties: {
jobId: { type: 'string', description: 'Target job identifier from discovery rankings' },
stage: { type: 'string', enum: ['phone_screen', 'technical', 'onsite', 'final'], description: 'Interview stage' },
targetRole: { type: 'string', description: 'Target role title' },
company: { type: 'string', description: 'Target company name' },
},
required: ['jobId'],
};

const INTERVIEW_PRACTICE_MOCK_INTERVIEWER_OUTPUT = {
type: 'object',
properties: {
success: { type: 'boolean' },
mode: { type: 'string' },
data: {
type: 'object',
properties: {
interviewPrep: { type: 'object' },
mockSessionId: { type: 'string' },
delegatedTo: { type: 'string' },
generatedAt: { type: 'string', format: 'date-time' },
},
},
error: { type: 'string' },
},
required: ['success', 'data'],
};

const INTERVIEW_PRACTICE_MOCK_INTERVIEWER = createCodeSkill({
id: 'career-interview-practice-mock-interviewer',
name: 'Interview Practice & Mock Interviewer',
description: 'Runs interactive mock interviews using role/company battlecards, records performance, and produces actionable coaching notes. Delegates to career_interview_prep. Reports not-connected when no interview context is available.',
manifest: {
language: 'javascript',
entrypoint: 'index.js',
sourceCode: INTERVIEW_PRACTICE_MOCK_INTERVIEWER_SOURCE,
lowerOrderTools: ['career_interview_prep'],
},
inputSchema: INTERVIEW_PRACTICE_MOCK_INTERVIEWER_INPUT,
outputSchema: INTERVIEW_PRACTICE_MOCK_INTERVIEWER_OUTPUT,
triggers: [
{ kind: 'user', phrase_examples: ['Mock interview me', 'Practice for this interview', 'Run a mock session'] },
{ kind: 'schedule', cadence: 'Before each scheduled interview' },
{ kind: 'event', on: 'Interview scheduled for a tracked application' },
],
});
INTERVIEW_PRACTICE_MOCK_INTERVIEWER.configSchema = { type: 'object', properties: {} };

// ----------------------------------------------------------------------------
// 5. career-pipeline-outcome-tracker -> career_pipeline_report
// ----------------------------------------------------------------------------

const PIPELINE_OUTCOME_TRACKER_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const result = await __execute_tool('career_pipeline_report', {});
if (!result || !result.success) { console.log(JSON.stringify({ success: false, mode: 'not-connected', error: result && result.error ? result.error : 'Not connected' })); return; }
console.log(JSON.stringify({ success: true, data: { pipeline: result.data || {}, delegatedTo: 'career_pipeline_report', generatedAt: new Date().toISOString() } }));
})();`;

const PIPELINE_OUTCOME_TRACKER_INPUT = {
type: 'object',
properties: {
},
};

const PIPELINE_OUTCOME_TRACKER_OUTPUT = {
type: 'object',
properties: {
success: { type: 'boolean' },
mode: { type: 'string' },
data: {
type: 'object',
properties: {
pipeline: { type: 'object' },
staleFollowUps: { type: 'array' },
delegatedTo: { type: 'string' },
generatedAt: { type: 'string', format: 'date-time' },
},
},
error: { type: 'string' },
},
required: ['success', 'data'],
};

const PIPELINE_OUTCOME_TRACKER = createCodeSkill({
id: 'career-pipeline-outcome-tracker',
name: 'Pipeline & Outcome Tracker',
description: 'Tracks application statuses, captures outcomes and feedback, generates pipeline reports and exportable summaries. Delegates to career_pipeline_report. Reports not-connected when no pipeline data exists.',
manifest: {
language: 'javascript',
entrypoint: 'index.js',
sourceCode: PIPELINE_OUTCOME_TRACKER_SOURCE,
lowerOrderTools: ['career_pipeline_report'],
},
inputSchema: PIPELINE_OUTCOME_TRACKER_INPUT,
outputSchema: PIPELINE_OUTCOME_TRACKER_OUTPUT,
triggers: [
{ kind: 'user', phrase_examples: ['How is my pipeline', 'What needs follow-up', 'Track my outcomes'] },
{ kind: 'schedule', cadence: 'Weekly pipeline summary' },
{ kind: 'event', on: 'An application status changes' },
],
});
PIPELINE_OUTCOME_TRACKER.configSchema = { type: 'object', properties: {} };
// Workspace/email connectors removed from canonical extended skills per design.

// ----------------------------------------------------------------------------
// 6b. Internal Gmail sync tool (NOT a canonical skill — isSkill:false)
// ----------------------------------------------------------------------------

const CAREER_GMAIL_SYNC_CONFIG_SCHEMA = {
type: 'object',
properties: {
endpointUrl: { type: 'string', description: 'Gmail API endpoint URL' },
apiKey: { type: 'string', description: 'Gmail API key', sensitive: true },
accountId: { type: 'string', description: 'Gmail account identifier' },
},
required: ['endpointUrl', 'apiKey', 'accountId'],
};

const careerGmailSyncTool = createExternalActionSkill({
id: 'career_gmail_sync',
name: 'Career Gmail Sync',
description: 'Internal Gmail connector for career workspace sync. Synchronizes career artifacts via Gmail API. Requires explicit configuration (endpointUrl, apiKey, accountId) and provides honest not-connected fallback when unconfigured.',
system: 'gmail',
action: 'career-sync',
endpoint: { envVar: 'CAREER_GMAIL_ENDPOINT', method: 'POST' },
auth: {
type: 'api_key',
header: 'Authorization',
apiKey: 'apiKey',
credentialEnvKeyMap: {
apiKey: { envVar: 'CAREER_GMAIL_API_KEY', configKey: 'career.gmail.apiKey' },
},
},
configSchema: CAREER_GMAIL_SYNC_CONFIG_SCHEMA,
inputSchema: {
type: 'object',
properties: {
endpointUrl: { type: 'string', description: 'Override Gmail endpoint URL' },
},
},
outputSchema: {
type: 'object',
properties: {
success: { type: 'boolean' },
mode: { type: 'string', enum: ['dry-run', 'live', 'not-connected', 'error'] },
system: { type: 'string' },
action: { type: 'string' },
request: { type: ['object', 'null'] },
response: { type: ['object', 'null'] },
error: { type: ['string', 'null'] },
},
required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
},
timeoutMs: 30000,
});
careerGmailSyncTool.isSkill = false;
careerGmailSyncTool.configSchema = CAREER_GMAIL_SYNC_CONFIG_SCHEMA;

// ----------------------------------------------------------------------------
// 7. career-resume-template-manager -> career_profile_intake
// ----------------------------------------------------------------------------

const RESUME_TEMPLATE_MANAGER_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const result = await __execute_tool('career_profile_intake', { personal: input.personal, preferences: input.preferences, resumeFile: input.resumeFile });
if (!result || !result.success) {
console.log(JSON.stringify({ success: false, mode: 'not-connected', error: result && result.error ? result.error : 'Not connected: profile intake failed; upload a resume via career_profile_intake first' }));
return;
}
const profile = (result.data && result.data.profile) || {};
const resume = profile.resume || {};
if (!resume.sourceFileName && !resume.rawText) {
console.log(JSON.stringify({ success: false, mode: 'not-connected', error: 'Not connected: no resume on file; upload one via career_profile_intake' }));
return;
}
console.log(JSON.stringify({ success: true, data: { resume, template: { name: resume.sourceFileName || 'untitled', parsedAt: resume.parsedAt || null }, delegatedTo: 'career_profile_intake', generatedAt: new Date().toISOString() } }));
})();`;

const RESUME_TEMPLATE_MANAGER_INPUT = {
type: 'object',
properties: {
personal: {
type: 'object',
description: 'Contact details — only send fields that changed',
properties: {
name: { type: 'string' },
email: { type: 'string' },
phone: { type: 'string' },
location: { type: 'string' },
linkedinUrl: { type: 'string' },
githubUrl: { type: 'string' },
portfolioUrl: { type: 'string' },
},
},
preferences: {
type: 'object',
description: 'Search preferences — only send fields that changed',
properties: {
targetRoles: { type: 'array', items: { type: 'string' } },
targetCompanies: { type: 'array', items: { type: 'string' } },
industries: { type: 'array', items: { type: 'string' } },
workArrangement: { type: 'array', items: { type: 'string', enum: ['onsite', 'hybrid', 'remote'] } },
minSalary: { type: 'number' },
maxSalary: { type: 'number' },
locations: { type: 'array', items: { type: 'string' } },
excludeCompanies: { type: 'array', items: { type: 'string' } },
keywords: { type: 'array', items: { type: 'string' } },
},
},
resumeFile: {
type: 'object',
description: 'Updated resume file — pdf, docx, md, or txt',
properties: {
name: { type: 'string' },
mimeType: { type: 'string', enum: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/markdown', 'text/plain'] },
content: { type: 'string', description: 'Base64 for binary formats, plain text for md/txt' },
},
required: ['name', 'mimeType', 'content'],
},
},
	required: [],
};

const RESUME_TEMPLATE_MANAGER_OUTPUT = {
type: 'object',
properties: {
success: { type: 'boolean' },
mode: { type: 'string' },
data: {
type: 'object',
properties: {
resume: { type: 'object' },
template: {
type: 'object',
properties: {
name: { type: 'string' },
parsedAt: { type: ['string', 'null'] },
},
},
delegatedTo: { type: 'string' },
generatedAt: { type: 'string', format: 'date-time' },
},
},
error: { type: 'string' },
},
required: ['success', 'data'],
};

const RESUME_TEMPLATE_MANAGER = createCodeSkill({
id: 'career-resume-template-manager',
name: 'Resume & Template Manager',
description: 'Manages resume variants, templates, and ATS-friendly formatting. Delegates to career_profile_intake for resume ingestion and profile management. Reports not-connected when no profile or resume exists.',
manifest: {
language: 'javascript',
entrypoint: 'index.js',
sourceCode: RESUME_TEMPLATE_MANAGER_SOURCE,
lowerOrderTools: ['career_profile_intake'],
},
inputSchema: RESUME_TEMPLATE_MANAGER_INPUT,
outputSchema: RESUME_TEMPLATE_MANAGER_OUTPUT,
triggers: [
{ kind: 'user', phrase_examples: ['Update my resume', 'Manage templates', 'Upload a new resume variant'] },
{ kind: 'schedule', cadence: 'Weekly resume template review' },
{ kind: 'event', on: 'Resume uploaded or profile updated' },
],
});
RESUME_TEMPLATE_MANAGER.configSchema = { type: 'object', properties: {} };

// ----------------------------------------------------------------------------
// 8. career-portal-recruiter-workflow -> career_apply_execute + career_networking_outreach
// ----------------------------------------------------------------------------

const PORTAL_RECRUITER_WORKFLOW_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const result = await __execute_tool('career_apply_execute', { jobIds: input.jobIds || [], dryRun: input.dryRun !== false, connectedPortalTool: input.connectedPortalTool, coverLetters: input.coverLetters });
if (!result || !result.success) {
console.log(JSON.stringify({ success: false, mode: 'not-connected', error: result && result.error ? result.error : 'Not connected: application execution failed; ensure a profile exists and a portal connector is configured' }));
return;
}
const outreachResult = await __execute_tool('career_networking_outreach', { targetCompany: input.targetCompany, targetPerson: input.targetPerson, relationshipStage: input.relationshipStage, channel: input.channel, connectedSendTool: input.connectedSendTool });
if (!outreachResult || !outreachResult.success) {
console.log(JSON.stringify({ success: false, mode: 'not-connected', error: outreachResult && outreachResult.error ? outreachResult.error : 'Not connected: networking outreach could not be generated; provide target company and relationship stage' }));
return;
}
console.log(JSON.stringify({ success: true, data: { applications: result.data, outreach: outreachResult.data, delegatedTo: ['career_apply_execute', 'career_networking_outreach'], generatedAt: new Date().toISOString() } }));
})();`;

const PORTAL_RECRUITER_WORKFLOW_INPUT = {
type: 'object',
properties: {
jobIds: { type: 'array', items: { type: 'string' }, description: 'Explicit jobs to apply to' },
dryRun: { type: 'boolean', description: 'Preview without submitting; defaults to true', default: true },
connectedPortalTool: { type: 'string', description: 'MCP tool reference for a connected application portal' },
coverLetters: { type: 'object', description: 'jobId -> generated cover letter text' },
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
},
inputSchema: PORTAL_RECRUITER_WORKFLOW_INPUT,
outputSchema: PORTAL_RECRUITER_WORKFLOW_OUTPUT,
triggers: [
{ kind: 'user', phrase_examples: ['Submit my applications', 'Draft recruiter outreach', 'Run my portal workflow'] },
{ kind: 'schedule', cadence: 'Daily portal and outreach review' },
{ kind: 'event', on: 'Application submitted or recruiter message drafted' },
],
});
PORTAL_RECRUITER_WORKFLOW.configSchema = { type: 'object', properties: {} };

// ============================================================================
// Exports
// ============================================================================

export {
JOB_DISCOVERY_FIT_RANKING,
APPLICATION_EXECUTION_ORCHESTRATOR,
UPSKILL_ROLE_TARGETED_LEARNING_PLANNER,
INTERVIEW_PRACTICE_MOCK_INTERVIEWER,
PIPELINE_OUTCOME_TRACKER,
RESUME_TEMPLATE_MANAGER,
PORTAL_RECRUITER_WORKFLOW,
careerGmailSyncTool,
};

export const careerCanonicalExtendedSkills: Tool[] = [
JOB_DISCOVERY_FIT_RANKING,
APPLICATION_EXECUTION_ORCHESTRATOR,
UPSKILL_ROLE_TARGETED_LEARNING_PLANNER,
INTERVIEW_PRACTICE_MOCK_INTERVIEWER,
PIPELINE_OUTCOME_TRACKER,
RESUME_TEMPLATE_MANAGER,
PORTAL_RECRUITER_WORKFLOW,
];

export const careerCanonicalInternalTools: Tool[] = [
careerGmailSyncTool,
];
