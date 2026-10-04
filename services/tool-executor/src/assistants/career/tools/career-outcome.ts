// @ts-nocheck

import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

const CAREER_BASE_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

// career-outcome: records application outcomes and updates career search stats.
// Returns { success, data: { entry, stats, trackingPath, outcomesPath } }

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

const CAREER_OUTCOME = createDeclarativeCodeSkill({
  id: 'career-outcome',
  domainKnowledge: 'Application outcome recording: offer, rejection, interview, screening and no-response states, plus outcome analytics and search-conversion trends.',
  tier: 'advise',
  isSkill: false,
  name: 'Track Outcomes',
  description: 'Records application outcomes (offer, rejection, interview, screening, no-response) and updates career search stats. Also supports outcome analytics and trend reporting.',
  persistenceEnvVar: 'CAREER_HOME',
  inputSchema: CAREER_OUTCOME_INPUT,
  outputSchema: CAREER_OUTCOME_OUTPUT,
  triggers: [
    { kind: 'user', phrase_examples: ['Record an outcome', 'Log an interview', 'Track a rejection'] },
  ],
  manifest: {
    configSchema: CAREER_BASE_CONFIG_SCHEMA,
    actionLabel: 'Record outcome'
  },
  handler: async function handler(input, ctx) {
      const applicationId = input.applicationId || input.jobId || '';
      const jobTitle = input.jobTitle || '';
      const company = input.company || '';
      const status = input.status || '';
      const feedback = input.feedback || '';
      const offerDetails = input.offerDetails || null;
      const date = input.date || new Date().toISOString();
      const profileId = input.profileId || 'default';

      const tracking = ctx.store.load('applications/tracking', []);

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
      ctx.store.save('applications/tracking', tracking);

      // Update profile stats
      const profileKey = 'profilePath/' + profileId;
      let profile = ctx.store.load(profileKey, null);
      let legacyProfileKey = '';
      if (!profile || Object.keys(profile).length === 0) {
        const legacyProfile = ctx.store.load('profilePath', null);
        if (legacyProfile && Object.keys(legacyProfile).length > 0) {
          profile = legacyProfile;
          legacyProfileKey = 'profilePath';
        }
      }
      if (profile) {
      profile.jobSearch = profile.jobSearch || {};
      if (status === 'offer') profile.jobSearch.offersReceived = (profile.jobSearch.offersReceived || 0) + 1;
      if (status === 'rejection') profile.jobSearch.rejectionsReceived = (profile.jobSearch.rejectionsReceived || 0) + 1;
      if (status === 'interview' || status === 'screening') profile.jobSearch.interviewsScheduled = (profile.jobSearch.interviewsScheduled || 0) + 1;
      profile.jobSearch.updatedAt = new Date().toISOString();
      ctx.store.save(profileKey, profile);
      if (legacyProfileKey) ctx.store.save(legacyProfileKey, profile);
      }

      // Outcome log
      const outcomes = ctx.store.load('outcomesPath', []);
      outcomes.push(entry);

      const stats = {
      total: tracking.length,
      offers: tracking.filter((t) => t.status === 'offer').length,
      rejections: tracking.filter((t) => t.status === 'rejection').length,
      interviews: tracking.filter((t) => t.status === 'interview' || t.status === 'screening').length,
      noResponse: tracking.filter((t) => t.status === 'no_response').length,
      responseRate: tracking.length ? (tracking.length - tracking.filter((t) => t.status === 'no_response').length) / tracking.length : 0,
      };
      return { success: true, data: { entry, stats, trackingPath: 'applications/tracking', outcomesPath: 'outcomesPath', generatedAt: new Date().toISOString() } };
    }
  });
CAREER_OUTCOME.configSchema = CAREER_BASE_CONFIG_SCHEMA;
CAREER_OUTCOME.configSchema = CAREER_OUTCOME.manifest.configSchema as SchemaRecord;

export { CAREER_OUTCOME };
