import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_BASE_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

// career_outcome: records application outcomes and updates career search stats.
// Returns { success, data: { entry, stats, trackingPath, outcomesPath } }
const CAREER_OUTCOME_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const fs = require('fs');
const path = require('path');
const baseDir = process.env.CAREER_HOME || '/tmp/career';
const applicationId = input.applicationId || input.jobId || '';
const jobTitle = input.jobTitle || '';
const company = input.company || '';
const status = input.status || '';
const feedback = input.feedback || '';
const offerDetails = input.offerDetails || null;
const date = input.date || new Date().toISOString();
const profileId = input.profileId || 'default';

const trackingPath = path.join(baseDir, 'applications', 'tracking.json');
fs.mkdirSync(path.dirname(trackingPath), { recursive: true });
const tracking = fs.existsSync(trackingPath) ? JSON.parse(fs.readFileSync(trackingPath, 'utf8')) : [];

const entry = {
  applicationId,
  jobTitle,
  company,
  status,
  feedback,
  offerDetails,
  date,
  updatedAt: new Date().toISOString(),
};

const idx = tracking.findIndex((t) => t.applicationId === applicationId || t.jobId === applicationId);
if (idx >= 0) tracking[idx] = Object.assign(tracking[idx], entry);
else tracking.push(entry);
fs.writeFileSync(trackingPath, JSON.stringify(tracking, null, 2));

// Update profile stats
const profilePath = path.join(baseDir, 'profiles', profileId + '.json');
if (fs.existsSync(profilePath)) {
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  profile.jobSearch = profile.jobSearch || {};
  if (status === 'offer') profile.jobSearch.offersReceived = (profile.jobSearch.offersReceived || 0) + 1;
  if (status === 'rejection') profile.jobSearch.rejectionsReceived = (profile.jobSearch.rejectionsReceived || 0) + 1;
  if (status === 'interview' || status === 'screening') profile.jobSearch.interviewsScheduled = (profile.jobSearch.interviewsScheduled || 0) + 1;
  profile.jobSearch.updatedAt = new Date().toISOString();
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
}

// Outcome log
const outcomesPath = path.join(baseDir, 'outcomes', 'log.json');
fs.mkdirSync(path.dirname(outcomesPath), { recursive: true });
const outcomes = fs.existsSync(outcomesPath) ? JSON.parse(fs.readFileSync(outcomesPath, 'utf8')) : [];
outcomes.push(entry);
fs.writeFileSync(outcomesPath, JSON.stringify(outcomes, null, 2));

const stats = {
  total: tracking.length,
  offers: tracking.filter((t) => t.status === 'offer').length,
  rejections: tracking.filter((t) => t.status === 'rejection').length,
  interviews: tracking.filter((t) => t.status === 'interview' || t.status === 'screening').length,
  noResponse: tracking.filter((t) => t.status === 'no_response').length,
  responseRate: tracking.length ? (tracking.length - tracking.filter((t) => t.status === 'no_response').length) / tracking.length : 0,
};

console.log(JSON.stringify({ success: true, data: { entry, stats, trackingPath, outcomesPath, generatedAt: new Date().toISOString() } }));
})();`;

const CAREER_OUTCOME_INPUT = {
  type: 'object',
  properties: {
    applicationId: { type: 'string' },
    jobTitle: { type: 'string' },
    company: { type: 'string' },
    status: { type: 'string', enum: ['offer', 'rejection', 'interview', 'screening', 'no_response', 'withdrawn'] },
    feedback: { type: 'string' },
    offerDetails: { type: 'object' },
    date: { type: 'string' },
    profileId: { type: 'string', default: 'default' },
  },
};

const CAREER_OUTCOME_OUTPUT = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        entry: { type: 'object' },
        stats: { type: 'object' },
        trackingPath: { type: 'string' },
        outcomesPath: { type: 'string' },
        generatedAt: { type: 'string', format: 'date-time' },
      },
    },
  },
  required: ['success', 'data'],
};

const CAREER_OUTCOME = createCodeSkill({
  id: 'career_outcome',
  name: 'Track Outcomes',
  description: 'Records application outcomes (offer, rejection, interview, screening, no-response) and updates career search stats. Also supports outcome analytics and trend reporting.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: CAREER_OUTCOME_SOURCE,
    configSchema: CAREER_BASE_CONFIG_SCHEMA,
    actionLabel: 'Record outcome',
  },
  inputSchema: CAREER_OUTCOME_INPUT,
  outputSchema: CAREER_OUTCOME_OUTPUT,
  triggers: [
    { kind: 'user', phrase_examples: ['Record an outcome', 'Log an interview', 'Track a rejection'] },
    { kind: 'event', on: 'Application status changes' },
  ],
});
CAREER_OUTCOME.configSchema = CAREER_OUTCOME.manifest.configSchema as SchemaRecord;

export { CAREER_OUTCOME };