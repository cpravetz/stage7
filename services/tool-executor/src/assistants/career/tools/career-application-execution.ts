// @ts-nocheck

import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';
import { careerResultSchema } from '../career-contract';

const CAREER_BASE_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

// career-application-execution: submits applications to jobs. Supports dry-run and bulk.
// Returns { success, data: { applications, errors, submitted, dryRun, bulk, trackingPath } }

const CAREER_APPLY_EXECUTE_INPUT = {
  type: 'object',
  properties: {
    targetRoles: { type: 'array', items: { type: 'string' }, description: 'Job listing identifiers to apply to', 'x-referenceSource': 'career-job-discovery-fit-ranking', 'x-referenceLabel': 'your job search results' },
    listings: { type: 'array', items: { type: 'string' }, description: 'Job listing identifiers to apply to', 'x-referenceSource': 'career-job-discovery-fit-ranking', 'x-referenceLabel': 'your job search results' },
    dryRun: { type: 'boolean', default: true },
    coverLetters: { type: 'array', items: { type: 'string' } },
    customResumeTemplate: { type: 'string', description: 'Select a saved resume template to use for this application', 'x-referenceSource': 'career-resume-template-manager', 'x-referenceLabel': 'your saved resume templates', 'x-referenceFilter': 'type=resume' },
    customCoverLetterTemplate: { type: 'string', description: 'Select a saved cover letter template to use for this application', 'x-referenceSource': 'career-resume-template-manager', 'x-referenceLabel': 'your saved cover letter templates', 'x-referenceFilter': 'type=cover-letter' },
    customResume: { type: 'string', multiline: true, description: 'Custom resume text (fallback if no template selected)' },
    customCoverLetter: { type: 'string', multiline: true, description: 'Custom cover letter text (fallback if no template selected)' },
  },
};

const CAREER_APPLY_EXECUTE = createDeclarativeCodeSkill({
  id: 'career-application-execution',
  domainKnowledge: 'Application submission mechanics: resume and cover-letter assembly from stored templates, portal form handling, and submission tracking against an ATS.',
  tier: 'represent',
  name: 'Apply to Jobs',
  description: 'Submits applications to one or more jobs using the stored resume and a generated or selected cover letter. Supports bulk apply, dry-run, and tracking of submitted vs failed applications. Can use saved templates via career-resume-template-manager.',
  persistenceEnvVar: 'CAREER_HOME',
  emitEvent: 'career.application.submitted',
  configSchema: CAREER_BASE_CONFIG_SCHEMA,
  inputSchema: CAREER_APPLY_EXECUTE_INPUT,
  outputSchema: careerResultSchema('Applications submitted, errors, and dry-run status'),
  isSkill: false,
  // NOTE: deliberately no lowerOrderTools. career-resume-template-manager is
  // isSkill:true, and ToolRegistry.applyTool throws a registration conflict when a
  // tool is both declared a lower-order tool and marked isSkill:true. The template
  // manager is reached at run time through ctx.delegate below, which needs no
  // registration-time declaration.
  manifest: {
    actionLabel: 'Submit applications',
  },
  handler: async function (input, ctx) {
    const targetRoles = Array.isArray(input.targetRoles) ? input.targetRoles : [];
    const listings = Array.isArray(input.listings) ? input.listings : [];
    const dryRun = input.dryRun !== false;
    const coverLetters = Array.isArray(input.coverLetters) ? input.coverLetters : [];

    let customResume = input.customResume || '';
    let customCoverLetter = input.customCoverLetter || '';

    // A saved template is an enhancement, not a precondition: the delegation target
    // may be unavailable in this execution environment (ctx.delegate throws when the
    // host injects no delegation hook). Keep the inline fallback rather than failing
    // the whole apply over an optional material.
    const resolveTemplateContent = async (templateId: string): Promise<string> => {
      try {
        const templateResult = await ctx.delegate('career-resume-template-manager', { mode: 'get', id: templateId });
        if (templateResult && templateResult.success && templateResult.data && templateResult.data.template) {
          return templateResult.data.template.content || '';
        }
      } catch (e) {
        // Fall through to the inline fallback.
      }
      return '';
    };

    if (input.customResumeTemplate) {
      customResume = (await resolveTemplateContent(input.customResumeTemplate)) || customResume;
    }

    if (input.customCoverLetterTemplate) {
      customCoverLetter = (await resolveTemplateContent(input.customCoverLetterTemplate)) || customCoverLetter;
    }

    // The stored file is an OBJECT envelope carrying { listings, byBoard, failures, ... },
    // written by career-job-discovery. Reading it as a bare array left storedListings as
    // that envelope, so the .find below threw a TypeError on every run that reached it.
    // Accept either shape so an older bare-array file still works.
    const storedListingsRaw = ctx.store.load('listPath', []);
    const storedListings = Array.isArray(storedListingsRaw)
      ? storedListingsRaw
      : (storedListingsRaw && Array.isArray(storedListingsRaw.listings) ? storedListingsRaw.listings : []);

    const trackingRaw: any = ctx.store.load('applications/tracking', []);
    const tracking: any[] = Array.isArray(trackingRaw) ? trackingRaw.slice() : [];

    const applications = [];
    const errors = [];

    const rolesToProcess = targetRoles.length ? targetRoles : listings;

    for (const role of rolesToProcess) {
      const job = storedListings.find((l: any) => l.id === role);
      if (!job) {
        errors.push({ identifier: role, error: 'Job listing not found' });
        continue;
      }
      if (dryRun) {
        applications.push({ identifier: job.id, title: job.title, company: job.company, status: 'dry_run', job: { title: job.title, company: job.company }, appliedAt: new Date().toISOString() });
        continue;
      }
      applications.push({
        identifier: job.id,
        title: job.title,
        company: job.company,
        status: 'submitted',
        job: { title: job.title, company: job.company, location: job.location },
        resumeUsed: customResume ? 'custom' : 'default',
        coverLetterUsed: customCoverLetter ? 'custom' : (coverLetters.length ? coverLetters[0] : null),
        applyUrl: job.applyUrl,
        appliedAt: new Date().toISOString(),
      });
    }

    for (const app of applications) {
      const idx = tracking.findIndex((t) => t.identifier === app.identifier);
      if (idx >= 0) {
        // Only overwrite if the new status is "more final" than the existing one.
        // Priority: submitted > dry_run > pending/other
        const existing = tracking[idx];
        const existingPriority = existing.status === 'submitted' ? 2 : (existing.status === 'dry_run' ? 1 : 0);
        const newPriority = app.status === 'submitted' ? 2 : (app.status === 'dry_run' ? 1 : 0);
        if (newPriority >= existingPriority) {
          tracking[idx] = app;
        }
      } else {
        tracking.push(app);
      }
    }
    const submitted = applications.filter((a) => a.status === 'submitted').length;
    // Only persist real submissions: a dry run is a preview and must not seed the
    // tracking store with entries that look like real applications.
    if (submitted > 0) {
      ctx.store.save('applications/tracking', tracking);
    }

    const lines = [
      dryRun ? 'Application Preview (dry run - nothing was submitted)' : 'Applications Submitted',
      '================================================',
      '',
    ];
    if (applications.length === 0) {
      lines.push('No roles were submitted.');
      lines.push('Add targetRoles or select specific roles from Job Discovery, then retry.');
    }
    for (const app of applications) {
      const jobTitle = app.job && app.job.title ? app.job.title : app.identifier;
      const jobCompany = app.job && app.job.company ? ' at ' + app.job.company : '';
      lines.push('- ' + jobTitle + jobCompany + ' [' + app.status + ']');
    }
    if (errors.length) {
      lines.push('');
      lines.push('Errors (' + errors.length + '):');
      for (const err of errors) lines.push('- ' + err.identifier + ': ' + err.error);
    }
    lines.push('');
    lines.push('Submitted: ' + submitted + ' | Previewed: ' + (applications.length - submitted) + ' | Tracking: applications/tracking.json');

    // A plain object, not ctx.emit.success(...): the generated wrapper already calls
    // ctx.emit.success(result) on whatever the handler returns, so emitting here too
    // would print the result twice and make the skill output unparseable.
    return {
      success: true,
      status: dryRun ? 'dry-run' : 'ok',
      data: {
        applications,
        errors,
        submitted,
        dryRun,
        bulk: false,
        trackingPath: 'applications/tracking.json',
        generatedAt: new Date().toISOString(),
      },
      present: [ctx.render.text('applications', dryRun ? 'Application Preview' : 'Applications Submitted', lines)],
    };
  },
});
CAREER_APPLY_EXECUTE.configSchema = CAREER_APPLY_EXECUTE.manifest.configSchema as SchemaRecord;

export { CAREER_APPLY_EXECUTE };
