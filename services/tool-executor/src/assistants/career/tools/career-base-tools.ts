// @ts-nocheck

import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

const CAREER_BASE_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

// ── career-profile-intake ──────────────────────────────────────────────

const CAREER_PROFILE_INTAKE_INPUT = {
  type: 'object',
  properties: {
    profileId: { type: 'string', default: 'default' },
    name: { type: 'string' },
    email: { type: 'string' },
    phone: { type: 'string' },
    location: { type: 'string' },
    headline: { type: 'string' },
    targetTitles: { type: 'array', items: { type: 'string' } },
    skills: { type: 'array', items: { type: 'string' } },
    resumeText: { type: 'string' },
    targetRoles: { type: 'array', items: { type: 'string' } },
    targetCompanies: { type: 'array', items: { type: 'string' } },
    industries: { type: 'array', items: { type: 'string' } },
    minSalary: { type: 'number' },
    maxSalary: { type: 'number' },
    locations: { type: 'array', items: { type: 'string' } },
    excludeCompanies: { type: 'array', items: { type: 'string' } },
    keywords: { type: 'array', items: { type: 'string' } },
  },
};

const CAREER_PROFILE_INTAKE_OUTPUT = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        profile: { type: 'object' },
        profilePath: { type: 'string' },
      },
    },
  },
  required: ['success', 'data'],
};

const CAREER_PROFILE_INTAKE = createDeclarativeCodeSkill({
  id: 'career-profile-intake',
  domainKnowledge: 'Job-search profile intake: target roles, skills, salary and location preferences, resume text, and the searchable terms every other career capability grades against.',
  tier: 'advise',
  isSkill: false,
  name: 'Profile Intake',
  description: 'Collects and persists the candidate profile: personal details, target roles, skills, resume text, and job-search preferences. All other career tools read from this profile.',
  persistenceEnvVar: 'CAREER_HOME',
  inputSchema: CAREER_PROFILE_INTAKE_INPUT,
  outputSchema: CAREER_PROFILE_INTAKE_OUTPUT,
  triggers: [
    { kind: 'user', phrase_examples: ['Set up my profile', 'Update my resume', 'Save my preferences'] },
  ],
  manifest: {
    configSchema: CAREER_BASE_CONFIG_SCHEMA,
    actionLabel: 'Save profile'
  },
  handler: async function handler(input, ctx) {
      const profileId = input.profileId || 'default';
      const storageKey = 'profilePath/' + profileId;
      const existing = ctx.store.load(storageKey, {});
      const profile = Object.assign({
      id: profileId,
      personal: { name: '', email: '', phone: '', location: '', headline: '' },
      targetTitles: [],
      skills: [],
      resume: { rawText: '', parsedText: '' },
      preferences: { targetRoles: [], targetCompanies: [], industries: [], workArrangement: ['onsite','hybrid','remote'], minSalary: 0, maxSalary: 0, locations: [], excludeCompanies: [], keywords: [] },
      jobSearch: { status: 'active', startDate: new Date().toISOString(), applicationsSubmitted: 0, interviewsScheduled: 0, offersReceived: 0, rejectionsReceived: 0 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      }, existing, { id: profileId }); // Ensure id is always the requested profileId
      if (input.name) profile.personal.name = input.name;
      if (input.email) profile.personal.email = input.email;
      if (input.phone) profile.personal.phone = input.phone;
      if (input.location) profile.personal.location = input.location;
      if (input.headline) profile.personal.headline = input.headline;
      if (input.targetTitles) profile.targetTitles = input.targetTitles;
      if (input.skills) profile.skills = input.skills;
      if (input.resumeText) { profile.resume = profile.resume || {}; profile.resume.rawText = input.resumeText; profile.resume.parsedText = input.resumeText; }
      if (input.targetRoles) profile.preferences.targetRoles = input.targetRoles;
      if (input.targetCompanies) profile.preferences.targetCompanies = input.targetCompanies;
      if (input.industries) profile.preferences.industries = input.industries;
      if (input.minSalary) profile.preferences.minSalary = input.minSalary;
      if (input.maxSalary) profile.preferences.maxSalary = input.maxSalary;
      if (input.locations) profile.preferences.locations = input.locations;
      if (input.excludeCompanies) profile.preferences.excludeCompanies = input.excludeCompanies;
      if (input.keywords) profile.preferences.keywords = input.keywords;
      profile.updatedAt = new Date().toISOString();
      ctx.store.save(storageKey, profile);
      const present = [
        { id: 'profile', title: 'Profile Saved', kind: 'text', body: 'Profile saved for ' + (profile.personal.name || profileId) + '\n\n' +
          'Target Roles: ' + (profile.targetTitles.join(', ') || '(none)') + '\n' +
          'Target Companies: ' + (profile.preferences.targetCompanies.join(', ') || '(none)') + '\n' +
          'Salary Range: ' + (profile.preferences.minSalary ? '$' + profile.preferences.minSalary.toLocaleString() : 'open') + ' - ' + (profile.preferences.maxSalary ? '$' + profile.preferences.maxSalary.toLocaleString() : 'open') + '\n' +
          'Locations: ' + (profile.preferences.locations.join(', ') || '(none)') + '\n' +
          'Skills: ' + (profile.skills.join(', ') || '(none)') + '\n' +
          'Resume: ' + (profile.resume.rawText ? profile.resume.rawText.length + ' characters' : 'not provided')
        }
      ];
      return { success: true, data: { profile, profilePath: storageKey }, present };
    }
  });
CAREER_PROFILE_INTAKE.configSchema = CAREER_BASE_CONFIG_SCHEMA;
CAREER_PROFILE_INTAKE.configSchema = CAREER_PROFILE_INTAKE.manifest.configSchema as SchemaRecord;

export { CAREER_PROFILE_INTAKE };
