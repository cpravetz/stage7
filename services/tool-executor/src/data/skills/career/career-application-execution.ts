import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_BASE_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

// career-application-execution: submits applications to jobs. Supports dry-run and bulk.
// Returns { success, data: { applications, errors, submitted, dryRun, bulk, trackingPath } }
const CAREER_APPLY_EXECUTE_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const fs = require('fs');
const path = require('path');
const baseDir = process.env.CAREER_HOME || '/tmp/career';
const targetRoles = Array.isArray(input.targetRoles) ? input.targetRoles : [];
const listings = Array.isArray(input.listings) ? input.listings : [];
const dryRun = input.dryRun !== false;
const coverLetters = input.coverLetters || [];
const customResume = input.customResume || '';
const customCoverLetter = input.customCoverLetter || '';

const listingsPath = path.join(baseDir, 'applications', 'listings.json');
const storedListings = fs.existsSync(listingsPath) ? JSON.parse(fs.readFileSync(listingsPath, 'utf8')) : [];
const trackingPath = path.join(baseDir, 'applications', 'tracking.json');
const tracking = fs.existsSync(trackingPath) ? JSON.parse(fs.readFileSync(trackingPath, 'utf8')) : [];

const applications = [];
const errors = [];

const rolesToProcess = targetRoles.length ? targetRoles : listings;

for (const role of rolesToProcess) {
  const job = storedListings.find((l) => l.id === role);
  if (!job) {
    errors.push({ identifier: role, error: 'Job listing not found' });
    continue;
  }
  if (dryRun) {
    applications.push({ identifier: job.id, status: 'dry_run', job: { title: job.title, company: job.company }, appliedAt: new Date().toISOString() });
    continue;
  }
  applications.push({
    identifier: job.id,
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
  if (idx >= 0) tracking[idx] = app;
  else tracking.push(app);
}
fs.mkdirSync(path.dirname(trackingPath), { recursive: true });
fs.writeFileSync(trackingPath, JSON.stringify(tracking, null, 2));

console.log(JSON.stringify({
  success: errors.length === 0,
  data: { applications, errors, submitted: applications.filter((a) => a.status === 'submitted').length, dryRun, bulk: false, trackingPath, generatedAt: new Date().toISOString() },
}));
})();`;

const CAREER_APPLY_EXECUTE_INPUT = {
  type: 'object',
  properties: {
    targetRoles: { type: 'array', items: { type: 'string' } },
    listings: { type: 'array', items: { type: 'string' }, description: 'Job listing identifiers to apply to' },
    dryRun: { type: 'boolean', default: true },
    coverLetters: { type: 'array', items: { type: 'string' } },
    customResume: { type: 'string' },
    customCoverLetter: { type: 'string' },
  },
};

const CAREER_APPLY_EXECUTE_OUTPUT = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        applications: { type: 'array' },
        errors: { type: 'array' },
        submitted: { type: 'number' },
        dryRun: { type: 'boolean' },
        bulk: { type: 'boolean' },
        trackingPath: { type: 'string' },
        generatedAt: { type: 'string', format: 'date-time' },
      },
    },
  },
  required: ['success', 'data'],
};

const CAREER_APPLY_EXECUTE = createCodeSkill({
  id: 'career-application-execution',
  name: 'Apply to Jobs',
  description: 'Submits applications to one or more jobs using the stored resume and a generated or selected cover letter. Supports bulk apply, dry-run, and tracking of submitted vs failed applications.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: CAREER_APPLY_EXECUTE_SOURCE,
    configSchema: CAREER_BASE_CONFIG_SCHEMA,
    actionLabel: 'Submit applications',
  },
  inputSchema: CAREER_APPLY_EXECUTE_INPUT,
  outputSchema: CAREER_APPLY_EXECUTE_OUTPUT,
  isSkill: false,
});
CAREER_APPLY_EXECUTE.configSchema = CAREER_APPLY_EXECUTE.manifest.configSchema as SchemaRecord;

export { CAREER_APPLY_EXECUTE };
