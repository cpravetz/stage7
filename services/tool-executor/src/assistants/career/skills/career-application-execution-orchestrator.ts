// @ts-nocheck

import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';
import { careerResultSchema } from '../career-contract';

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

const APPLICATION_EXECUTION_ORCHESTRATOR = createDeclarativeCodeSkill({
  id: 'career-application-execution-orchestrator',
  name: 'Apply to Selected Jobs',
  description: 'Applies to a selected job or set of jobs using the board attached to each posting, with optional custom materials from saved templates. Delegates to career-application-execution. Human review is still recommended before sending where required.',
  persistenceEnvVar: 'STORAGE_DIR',
  emitEvent: 'career.application_batch.submitted',
  inputSchema: APPLICATION_EXECUTION_ORCHESTRATOR_INPUT,
  outputSchema: careerResultSchema('Application batch results, per-role errors, and the tracking file'),
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
      const templateResult = await ctx.delegate('career-resume-template-manager', { id: input.customResumeTemplate });
      if (templateResult && templateResult.success && templateResult.data && templateResult.data.template) {
        customResume = templateResult.data.template.content;
      }
    }

    if (input.customCoverLetterTemplate) {
      const templateResult = await ctx.delegate('career-resume-template-manager', { id: input.customCoverLetterTemplate });
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

    // Every path below returns a full result with a populated `present`. The Skill
    // previously `return`ed undefined when the delegation failed or matched no
    // listing, which the executor reports as "Execution completed with no output"
    // at exit code 0 -- a silent no-op the user cannot distinguish from success.
    // careerResultSchema requires `present`, so an empty card set cannot pass.
    if (!result || result.success === false || result.error) {
      const message = result && result.error
        ? String(result.error)
        : 'The apply step returned no result';
      return {
        success: false,
        status: 'error',
        data: { applications: [], errors: [{ error: message }], dryRun: input.dryRun !== false, delegatedTo: 'career-application-execution', orchestratedAt: new Date().toISOString() },
        error: message,
        present: [
          ctx.render.text(
            'applications-error',
            'Could Not Start Applications',
            message + '\n\nNothing was submitted. Select roles from Job Discovery and retry.'
          ),
        ],
      };
    }

    const data = result.data && typeof result.data === 'object' ? result.data : result;
    const applications = Array.isArray(data.applications) ? data.applications : [];
    const errors = Array.isArray(data.errors) ? data.errors : [];
    const dryRun = data.dryRun !== false;
    const orchestratedAt = new Date().toISOString();

    // Matching no listing is a recoverable, explainable outcome, not a reason to
    // discard what the delegate already worked out. Its per-role errors ("Job
    // listing not found") are the actionable part, so they are surfaced verbatim.
    if (!applications.length) {
      const reason = errors.length
        ? 'No roles could be matched to a job listing.'
        : 'No job listings were selected for this request.';
      const detail = errors.length
        ? errors.map((e) => '- ' + ((e && (e.identifier || e.id)) || 'role') + ': ' + ((e && e.error) || 'unknown error')).join('\n')
        : '';
      return {
        success: false,
        status: 'error',
        data: { applications: [], errors, dryRun, trackingPath: data.trackingPath, delegatedTo: 'career-application-execution', orchestratedAt },
        error: reason,
        present: [
          ctx.render.text(
            'applications-empty',
            dryRun ? 'Application Preview (nothing to submit)' : 'No Applications Submitted',
            reason + '\n\n' +
            'targetRoles expects job listing IDs from Job Discovery, not role titles. ' +
            'Run Job Search & Fit Ranking and pick roles from its results, then retry.\n\n' +
            (detail ? detail + '\n\n' : '') +
            'Nothing was submitted.'
          ),
        ],
      };
    }

    const lines = applications.map((a) => {
      const job = (a && a.job) || {};
      const label = [job.title, job.company].filter(Boolean).join(' at ');
      return '- ' + (label || ((a && a.identifier) || 'role')) + ' [' + ((a && a.status) || 'queued') + ']';
    });

    return {
      success: true,
      status: dryRun ? 'dry-run' : 'ok',
      data: { applications, errors, dryRun, trackingPath: data.trackingPath, delegatedTo: 'career-application-execution', orchestratedAt },
      present: [
        ctx.render.text(
          'applications',
          dryRun ? 'Application Preview (dry run - nothing was submitted)' : 'Applications Submitted',
          lines.join('\n') + '\n\nSubmitted: ' + applications.length +
          (data.trackingPath ? ' | Tracking: ' + data.trackingPath : '') +
          (errors.length ? '\n\nErrors (' + errors.length + '):\n' + errors.map((e) => '- ' + ((e && (e.identifier || e.id)) || 'role') + ': ' + ((e && e.error) || 'unknown error')).join('\n') : '')
        ),
      ],
    };
  }
});
APPLICATION_EXECUTION_ORCHESTRATOR.configSchema = CAREER_WRAPPER_CONFIG_SCHEMA;

export { APPLICATION_EXECUTION_ORCHESTRATOR };
