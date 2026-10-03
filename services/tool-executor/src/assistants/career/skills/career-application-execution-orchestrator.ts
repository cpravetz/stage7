// @ts-nocheck
import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const APPLICATION_EXECUTION_ORCHESTRATOR_INPUT = {
type: 'object',
properties: {
targetRoles: { type: 'array', items: { type: 'string' }, description: 'Specific roles to apply to; if left blank, the pipeline will be used', 'x-referenceSource': 'career-job-discovery-fit-ranking', 'x-referenceLabel': 'your job search results' },
  dryRun: { type: 'boolean', description: 'Preview without submitting; defaults to true', default: true },
  customResumeTemplate: { type: 'string', description: 'Select a saved resume template to use for this application', 'x-referenceSource': 'career-resume-template-manager', 'x-referenceLabel': 'your saved resume templates', 'x-referenceFilter': 'type=resume' },
  customCoverLetterTemplate: { type: 'string', description: 'Select a saved cover letter template to use for this application', 'x-referenceSource': 'career-resume-template-manager', 'x-referenceLabel': 'your saved cover letter templates', 'x-referenceFilter': 'type=cover-letter' },
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

const APPLICATION_EXECUTION_ORCHESTRATOR = createDeclarativeCodeSkill({
id: 'career-application-execution-orchestrator',
name: 'Apply to Selected Jobs',
description: 'Applies to a selected job or set of jobs using the board attached to each posting, with optional custom materials from saved templates. Delegates to career-application-execution. Human review is still recommended before sending where required.',
persistenceEnvVar: 'STORAGE_DIR',
inputSchema: APPLICATION_EXECUTION_ORCHESTRATOR_INPUT,
outputSchema: APPLICATION_EXECUTION_ORCHESTRATOR_OUTPUT,
confirmBeforeSend: true,
triggers: [
{ kind: 'user', phrase_examples: ['Apply to selected jobs', 'Apply to these jobs', 'Submit applications'] },
],
tier: 'represent',
domainKnowledge: 'Career coaching, job search strategy, resume and cover letter optimization, interview preparation, compensation negotiation',
isSkill: true,
manifest: {
  configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
  actionLabel: 'Apply to selected jobs',
  lowerOrderTools: ['career-application-execution']
},
handler: async function handler(input, ctx) {
    let targetRoles = Array.isArray(input.targetRoles) ? input.targetRoles : [];
    if (!targetRoles.length) {
    const pipeline = await ctx.delegate('career-pipeline-report', {});
    if (pipeline && pipeline.success && pipeline.data) {
      const pipelineData = pipeline.data;
      if (Array.isArray(pipelineData.tracking)) {
        targetRoles = pipelineData.tracking.map((entry) => entry.jobId || entry.id).filter(Boolean);
      }
    }
    }

    // Resolve template IDs to content
    let customResume = input.customResume;
    let customCoverLetter = input.customCoverLetter;

    if (input.customResumeTemplate) {
    const templateResult = await ctx.delegate('career-resume-template-manager', { mode: 'get', id: input.customResumeTemplate });
    if (templateResult && templateResult.success && templateResult.data && templateResult.data.template) {
      customResume = templateResult.data.template.content;
    }
    }

    if (input.customCoverLetterTemplate) {
    const templateResult = await ctx.delegate('career-resume-template-manager', { mode: 'get', id: input.customCoverLetterTemplate });
    if (templateResult && templateResult.success && templateResult.data && templateResult.data.template) {
      customCoverLetter = templateResult.data.template.content;
    }
    }

    const result = await ctx.delegate('career-application-execution', {
    targetRoles,
    dryRun: input.dryRun !== false,
    coverLetters: input.coverLetters,
    customResume,
    customCoverLetter,
    });
    if (!result || result.success === false || result.error) {

    return;
    }
    const data = result.data && typeof result.data === 'object' ? result.data : result;
    const applications = Array.isArray(data.applications) ? data.applications : [];
    if (!applications.length) {

    return;
    }
      return { success: true, data: { applications, errors: data.errors || [], dryRun: data.dryRun, trackingPath: data.trackingPath, delegatedTo: 'career-application-execution', orchestratedAt: new Date().toISOString() } };
  }
});
APPLICATION_EXECUTION_ORCHESTRATOR.configSchema = CAREER_WRAPPER_CONFIG_SCHEMA;

export { APPLICATION_EXECUTION_ORCHESTRATOR };
