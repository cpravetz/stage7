import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const APPLICATION_EXECUTION_ORCHESTRATOR_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
let targetRoles = Array.isArray(input.targetRoles) ? input.targetRoles : [];
if (!targetRoles.length && input.targetRole) targetRoles = [input.targetRole];
if (!targetRoles.length) {
  const pipeline = await __execute_tool('career-pipeline-report', {});
  if (pipeline && pipeline.success && pipeline.data) {
    const pipelineData = pipeline.data;
    if (Array.isArray(pipelineData.tracking)) {
      targetRoles = pipelineData.tracking.map((entry) => entry.jobId || entry.id).filter(Boolean);
    }
  }
}
const result = await __execute_tool('career-application-execution', {
  targetRoles,
  dryRun: input.dryRun !== false,
  coverLetters: input.coverLetters,
  customResume: input.customResumeFile || input.customResume,
  customCoverLetter: input.customCoverLetterFile || input.customCoverLetter,
});
if (!result || result.success === false || result.error) {
console.log(JSON.stringify({ success: false, status: 'not-connected', error: result && result.error ? result.error : 'Not connected: application execution returned no result; ensure a profile and targetRoles are available' }));
return;
}
const data = result.data && typeof result.data === 'object' ? result.data : result;
const applications = Array.isArray(data.applications) ? data.applications : [];
if (!applications.length) {
console.log(JSON.stringify({ success: false, status: 'not-connected', error: 'Not connected: no applications were submitted; provide targetRoles or select specific roles to apply to' }));
return;
}
console.log(JSON.stringify({ success: true, data: { applications, errors: data.errors || [], dryRun: data.dryRun, trackingPath: data.trackingPath, delegatedTo: 'career-application-execution', orchestratedAt: new Date().toISOString() } }));
})();`;

const APPLICATION_EXECUTION_ORCHESTRATOR_INPUT = {
type: 'object',
properties: {
targetRoles: { type: 'array', items: { type: 'string' }, description: 'Specific roles to apply to; if left blank, the pipeline will be used' },
targetRole: { type: 'string', description: 'Single role to apply to' },
dryRun: { type: 'boolean', description: 'Preview without submitting; defaults to true', default: true },
customResume: { type: 'string', description: 'Custom resume text to use for this application when overriding your default resume' },
customCoverLetter: { type: 'string', description: 'Custom cover letter text to use for this application' },
customResumeFile: { type: 'object', description: 'Upload a resume file; text entry remains available as a fallback', properties: { name: { type: 'string' }, mimeType: { type: 'string' }, content: { type: 'string' } }, required: ['name', 'mimeType', 'content'] },
customCoverLetterFile: { type: 'object', description: 'Upload a cover letter file; text entry remains available as a fallback', properties: { name: { type: 'string' }, mimeType: { type: 'string' }, content: { type: 'string' } }, required: ['name', 'mimeType', 'content'] },
coverLetters: { type: 'array', items: { type: 'string' }, description: 'Optional cover-letter variants to use' },
},
};

const APPLICATION_EXECUTION_ORCHESTRATOR_OUTPUT = {
type: 'object',
properties: {
success: { type: 'boolean' },
status: { type: 'string', description: 'Execution status' },
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
description: 'Applies to a selected job or set of jobs using the board attached to each posting, with optional custom materials. Delegates to career-application-execution. Human review is still recommended before sending where required.',
manifest: {
language: 'javascript',
entrypoint: 'index.js',
sourceCode: APPLICATION_EXECUTION_ORCHESTRATOR_SOURCE,
configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
actionLabel: 'Apply to selected jobs',
lowerOrderTools: ['career-application-execution'],
},
inputSchema: APPLICATION_EXECUTION_ORCHESTRATOR_INPUT,
outputSchema: APPLICATION_EXECUTION_ORCHESTRATOR_OUTPUT,
triggers: [
{ kind: 'user', phrase_examples: ['Apply to these jobs', 'Submit applications', 'Auto-apply to ranked roles'] },
],
});

export { APPLICATION_EXECUTION_ORCHESTRATOR };
