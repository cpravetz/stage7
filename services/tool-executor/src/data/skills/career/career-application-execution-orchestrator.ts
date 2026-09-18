import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const APPLICATION_EXECUTION_ORCHESTRATOR_SOURCE = `(async () => {
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
const result = await __execute_tool('career_apply_execute', { jobIds, autoApplyThreshold: input.autoApplyThreshold, dryRun: input.dryRun !== false, connectedPortalTool: input.connectedPortalTool, coverLetters: input.coverLetters });
if (!result || result.success === false || result.error) {
console.log(JSON.stringify({ success: false, mode: 'not-connected', error: result && result.error ? result.error : 'Not connected: application execution returned no result; ensure a profile, ranked listings, and a portal connector are available' }));
return;
}
const data = result.data && typeof result.data === 'object' ? result.data : result;
const applications = Array.isArray(data.applications) ? data.applications : [];
if (!applications.length) {
console.log(JSON.stringify({ success: false, mode: 'not-connected', error: 'Not connected: no applications were submitted; provide jobIds or set autoApplyThreshold' }));
return;
}
console.log(JSON.stringify({ success: true, data: { applications, errors: data.errors || [], dryRun: data.dryRun, trackingPath: data.trackingPath, delegatedTo: 'career_apply_execute', orchestratedAt: new Date().toISOString() } }));
})();`;

const APPLICATION_EXECUTION_ORCHESTRATOR_INPUT = {
type: 'object',
properties: {
autoApplyThreshold: { type: 'number', description: 'Apply to every ranked job at or above this fit score' },
dryRun: { type: 'boolean', description: 'Preview without submitting; defaults to true', default: true },
connectedPortalTool: { type: 'string', description: 'The job portal you want to submit applications through (e.g. LinkedIn, Indeed)' },
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
name: 'Apply to Jobs',
description: 'Orchestrates multi-portal application submission workflows with dry-run, confirm-before-send, and explicit audit trails. Delegates to career_apply_execute. Provides honest not-connected fallback when no portal is configured or no jobs are selected.',
manifest: {
language: 'javascript',
entrypoint: 'index.js',
sourceCode: APPLICATION_EXECUTION_ORCHESTRATOR_SOURCE,
configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
actionLabel: 'Orchestrate applications',
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

export { APPLICATION_EXECUTION_ORCHESTRATOR };

