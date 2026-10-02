// @ts-nocheck
import { Tool } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../code-skill-factory';
import { hrResultSchema, HR_EXTERNAL_OUTPUT_SCHEMA } from './hr-contract';
import { HR_INTERVIEW_SCHEDULING_AUTOMATED } from './interview-scheduling-automated';

const HR_DOMAIN_KNOWLEDGE =
  'Talent acquisition lifecycles, structured interview methodology, compensation benchmarking, employment law compliance (EEOC)';

// ============================================================================
// SKILL 1: hr-screen-resume (Represent)
// User trigger: "Screen this resume for role fit"
// ============================================================================

const HR_SCREEN_RESUME = createDeclarativeCodeSkill({
  id: 'hr-screen-resume',
  name: 'Screen Resume for Role Fit',
  description: 'Filters inbound applicant profiles against role criteria and computes match score. Dry-run mode and explicit confirmation required.',
  persistenceEnvVar: 'HR_HOME',
  configSchema: {
    type: 'object',
    properties: {
      confirmBeforeSend: SchemaProps.boolean({ description: 'Require explicit confirmation before sending mutating scheduling requests', default: true }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
      defaultEndpoint: SchemaProps.url({ description: 'Default screening and scheduling endpoint URL' }),
  apiKey: SchemaProps.password({ description: 'Applicant tracking system API key' }),
      maxRetryAttempts: SchemaProps.number({ description: 'Retry attempts on scheduling failure', default: 3 }),
      rateLimitPerMinute: SchemaProps.number({ description: 'Rate limit per minute for scheduling API', default: 60 }),
    },
  },
  endpointConfigKey: 'defaultEndpoint',
  inputSchema: {
    type: 'object',
    properties: {
      resumeText: SchemaProps.text({ description: 'Resume text to screen against job requirements' }),
      jobRequirements: SchemaProps.text({ description: 'Job requirements to match resume against' }),
      candidateName: SchemaProps.text({ description: 'Candidate full name' }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing scheduling; defaults to true', default: true }),
      confirmation: SchemaProps.boolean({ description: 'Explicit approval for live scheduling dispatch', default: false }),
    },
    required: ['resumeText', 'jobRequirements', 'candidateName'],
  },
  outputSchema: hrResultSchema('Screening record with match score, matched keywords, gaps, and persistence path'),
  tier: 'represent',
  confirmBeforeSend: true,
  domainKnowledge: HR_DOMAIN_KNOWLEDGE,
  workflowStage: 'screening',
  triggers: [
    { kind: 'user', phrase_examples: ['Screen this resume for role fit'] },
  ],
  isSkill: true,
  async handler(input, ctx) {
    const resumeText = String(input.resumeText || '');
    const jobRequirements = String(input.jobRequirements || '');
    const candidateName = String(input.candidateName || '');
    const dryRun = input.dryRun !== false;
    const confirmation = input.confirmation === true;

    if (!resumeText || !jobRequirements || !candidateName) {
      const missing = [
        !resumeText ? 'resumeText' : null,
        !jobRequirements ? 'jobRequirements' : null,
        !candidateName ? 'candidateName' : null,
      ].filter(Boolean).join(', ');
      return {
  success: false,
  status: 'error',
  data: null,
  error: missing + ' is required',
  present: [ctx.render.text('notice', 'Missing input', missing + ' is required')]
};
    }

    function computeScore(resume: string, requirements: string) {
      const resumeWords = resume.toLowerCase().split(/[^a-zA-Z0-9_]+/).filter(Boolean);
      const reqWords = requirements.toLowerCase().split(/[^a-zA-Z0-9_]+/).filter(Boolean);
      if (!reqWords.length) return { score: 0, matched: [], gaps: [], partialMatched: [] };
      const exactMatched = reqWords.filter((w) => resumeWords.includes(w));
      const partialMatched = reqWords.filter((w) => !exactMatched.includes(w) && w.length >= 3 && resumeWords.some((rw) => rw.includes(w)));
      const matched = [...exactMatched, ...partialMatched];
      const raw = (matched.length / reqWords.length) * 100;
      const score = Math.max(1, Math.round(raw)) || 0;
      const gaps = reqWords.filter((w) => !matched.includes(w));
      return { score: Math.min(100, score), matched, gaps, partialMatched };
    }

    const { score, matched, gaps, partialMatched } = computeScore(resumeText, jobRequirements);

    const store = ctx.store.load('screening', []);
    const screening = {
      id: 'screen_' + Date.now(),
      candidateName,
      score,
      matched,
      gaps,
      partialMatched,
      createdAt: new Date().toISOString(),
      source: 'local',
    };
    store.push(screening);
    ctx.store.save('screening', store);

    const storePath = ctx.store.getFilePath('screening');
    const reqWordsCount = jobRequirements.toLowerCase().split(/[^a-zA-Z0-9_]+/).filter(Boolean).length;

    const lines = [
      'Resume Screening Report: ' + candidateName,
      '',
      'Match Score: ' + score + '/100',
      'Matched Requirements: ' + matched.length + ' of ' + reqWordsCount,
      'Gaps Identified: ' + gaps.length,
      '',
    ];
    if (matched.length > 0) {
      lines.push('Matched Keywords:');
      matched.forEach((m) => lines.push('  - ' + m));
      lines.push('');
    }
    if (partialMatched.length > 0) {
      lines.push('Partially Matched Keywords:');
      partialMatched.forEach((m) => lines.push('  - ' + m));
      lines.push('');
    }
    if (gaps.length > 0) {
      lines.push('Missing Keywords (Gaps):');
      gaps.forEach((g) => lines.push('  - ' + g));
      lines.push('');
    }
    lines.push('Source: Local keyword analysis (no external API)');
    lines.push('Scope: Every figure is computed from the resume and job requirements you supplied.');

    return {
      success: true,
      status: dryRun || !confirmation ? 'dry-run' : 'ok',
      data: { screening, storePath },
      error: null,
      present: [ctx.render.text('report', 'Screening Result', lines)],
    };
  },
});

// ============================================================================
// SKILL 2: hr-assess-candidate (Represent)
// Event trigger: "New application received"
// ============================================================================

const HR_ASSESS_CANDIDATE = createDeclarativeCodeSkill({
  id: 'hr-assess-candidate',
  name: 'Assess Candidate Skills and Experience',
  description: 'Evaluates candidate technical skills, soft skills, and experience against assessment criteria. Triggered on new application received.',
  persistenceEnvVar: 'HR_HOME',
  configSchema: {
    type: 'object',
    properties: {
      confirmBeforeSend: SchemaProps.boolean({ description: 'Require explicit confirmation before sending mutating requests', default: true }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
      defaultEndpoint: SchemaProps.url({ description: 'Default screening and scheduling endpoint URL' }),
      maxRetryAttempts: SchemaProps.number({ description: 'Retry attempts on scheduling failure', default: 3 }),
      rateLimitPerMinute: SchemaProps.number({ description: 'Rate limit per minute for scheduling API', default: 60 }),
    },
  },
  endpointConfigKey: 'defaultEndpoint',
  inputSchema: {
    type: 'object',
    properties: {
      resumeText: SchemaProps.text({ description: 'Resume text to assess' }),
      candidateName: SchemaProps.text({ description: 'Candidate full name' }),
      assessmentData: SchemaProps.object({
        technicalSkills: SchemaProps.stringArray({ description: 'Technical skills to assess against resume' }),
        softSkills: SchemaProps.stringArray({ description: 'Soft skills to assess against resume' }),
        experience: SchemaProps.text({ description: 'Experience level to check for in resume' }),
      }, { description: 'Assessment criteria and data for candidate evaluation' }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
    },
    required: ['resumeText', 'candidateName', 'assessmentData'],
  },
  outputSchema: hrResultSchema('Assessment record with technical/soft skill match, years of experience, and persistence path'),
  tier: 'represent',
  confirmBeforeSend: true,
  domainKnowledge: HR_DOMAIN_KNOWLEDGE,
  workflowStage: 'screening',
  triggers: [
    // User, not Event: assessment needs the resume text and candidate name, and
    // there is no wired intake that supplies them, so only a person can run it.
    { kind: 'user', phrase_examples: ['Assess this candidate against the role', 'Score this resume', 'Produce interview assessment scores'] },
  ],
  isSkill: true,
  async handler(input, ctx) {
    const resumeText = String(input.resumeText || '');
    const candidateName = String(input.candidateName || '');
    const assessmentData = input.assessmentData || {};
    const dryRun = input.dryRun !== false;

    if (!resumeText || !candidateName || !assessmentData || Object.keys(assessmentData).length === 0) {
      const missing = [
        !resumeText ? 'resumeText' : null,
        !candidateName ? 'candidateName' : null,
        (!assessmentData || Object.keys(assessmentData).length === 0) ? 'assessmentData' : null,
      ].filter(Boolean).join(', ');
      return {
  success: false,
  status: 'error',
  data: null,
  error: missing + ' is required',
  present: [ctx.render.text('notice', 'Missing input', missing + ' is required')]
};
    }

    function assessCandidate(resume: string, data: any) {
      const words = resume.toLowerCase().split(/[^a-zA-Z0-9_]+/).filter(Boolean);
      const technicalSkills = data.technicalSkills || [];
      const softSkills = data.softSkills || [];
      const experience = data.experience || '';
      const yearsMatch = resume.match(/([0-9]+)[+]? *(?:years?|yrs?)/i);
      const yearsExp = yearsMatch ? parseInt(yearsMatch[1], 10) : 0;
      const techFound = technicalSkills.filter((s: string) => words.includes(s.toLowerCase()));
      const softFound = softSkills.filter((s: string) => words.includes(s.toLowerCase()));
      return {
        yearsExperience: yearsExp,
        technicalSkillMatch: { total: technicalSkills.length, found: techFound, missing: technicalSkills.filter((s: string) => !words.includes(s.toLowerCase())) },
        softSkillMatch: { total: softSkills.length, found: softFound, missing: softSkills.filter((s: string) => !words.includes(s.toLowerCase())) },
        experienceMentioned: experience ? resume.toLowerCase().includes(experience.toLowerCase()) : null,
      };
    }

    const assessment = assessCandidate(resumeText, assessmentData);
    const record = {
      id: 'assess_' + Date.now(),
      candidateName,
      assessment,
      createdAt: new Date().toISOString(),
      source: 'local',
    };

    const store = ctx.store.load('screening', []);
    store.push(record);
    ctx.store.save('screening', store);

    const storePath = ctx.store.getFilePath('screening');

    const lines = [
      'Candidate Assessment Report: ' + candidateName,
      '',
      'Years of Experience (extracted from resume): ' + assessment.yearsExperience,
      '',
      'Technical Skills: ' + assessment.technicalSkillMatch.found.length + ' of ' + assessment.technicalSkillMatch.total + ' matched',
    ];
    if (assessment.technicalSkillMatch.found.length > 0) {
      lines.push('  Found: ' + assessment.technicalSkillMatch.found.join(', '));
    }
    if (assessment.technicalSkillMatch.missing.length > 0) {
      lines.push('  Missing: ' + assessment.technicalSkillMatch.missing.join(', '));
    }
    lines.push('');
    lines.push('Soft Skills: ' + assessment.softSkillMatch.found.length + ' of ' + assessment.softSkillMatch.total + ' matched');
    if (assessment.softSkillMatch.found.length > 0) {
      lines.push('  Found: ' + assessment.softSkillMatch.found.join(', '));
    }
    if (assessment.softSkillMatch.missing.length > 0) {
      lines.push('  Missing: ' + assessment.softSkillMatch.missing.join(', '));
    }
    lines.push('');
    lines.push('Experience Mentioned: ' + (assessment.experienceMentioned === true ? 'Yes' : assessment.experienceMentioned === false ? 'No' : 'Not specified'));
    lines.push('');
    lines.push('Source: Local keyword analysis (no external API)');
    lines.push('Scope: Every figure is computed from the resume and assessment criteria you supplied.');

    return {
      success: true,
      status: dryRun ? 'dry-run' : 'ok',
      data: { record, storePath },
      error: null,
      present: [ctx.render.text('report', 'Assessment Result', lines)],
    };
  },
});

// ============================================================================
// SKILL 3: hr-draft-jd-interview-kit (Aid)
// User trigger
// ============================================================================

const HR_DRAFT_JD_INTERVIEW_KIT = createDeclarativeCodeSkill({
  // Declared as a credential, not a plain config field, so the secret can be
  // sourced from the vault via `vault:<id>` and is never echoed into output.
  credentialSource: {
    apiKey: { configKey: 'apiKey', required: false, label: "upstream service API key (set in this Skill configuration, or a vault secret)" },
  },
  id: 'hr-draft-jd-interview-kit',
  name: 'Draft Job Description & Interview Kit',
  description: 'Generates structured job descriptions, interview scorecards, role-specific behavioral questions, and rubric guides.',
  persistenceEnvVar: 'HR_HOME',
  configSchema: {
    type: 'object',
    properties: {
      confirmBeforeSend: SchemaProps.boolean({ description: 'Require explicit confirmation before sending mutating requests', default: true }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
      defaultSource: SchemaProps.text({ description: 'Default sourcing channel for job descriptions' }),
      apiVersion: SchemaProps.text({ description: 'API version for recruiting operations' }),
      rateLimitPerMinute: SchemaProps.number({ description: 'Rate limit per minute', default: 60 }),
      retryAttempts: SchemaProps.number({ description: 'Retry attempts on failure', default: 3 }),
    },
  },
  endpointConfigKey: 'defaultEndpoint',
  inputSchema: {
    type: 'object',
    properties: {
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
      data: SchemaProps.object({}, { description: 'Payload data for job description or interview kit generation' }),
      filters: SchemaProps.object({}, { description: 'Filters for query operations' }),
      pagination: SchemaProps.object({}, { description: 'Pagination settings' }),
      confirmation: SchemaProps.boolean({ description: 'Explicit approval for live dispatch', default: false }),
    },
    required: ['data'],
  },
  outputSchema: HR_EXTERNAL_OUTPUT_SCHEMA,
  tier: 'aid',
  confirmBeforeSend: true,
  domainKnowledge: HR_DOMAIN_KNOWLEDGE,
  workflowStage: 'interview',
  triggers: [
    { kind: 'user', phrase_examples: ['Draft job description', 'Create interview scorecard', 'Generate interview kit'] },
  ],
  isSkill: true,
  async handler(input, ctx) {
    const dryRun = input.dryRun !== false;
    const data = input.data || {};
    const endpoint = String(ctx.config?.defaultEndpoint || '');
    const apiKey = (ctx.getCredential ? ctx.getCredential('apiKey') : undefined) || '';

    if (!endpoint) {
      return {
  success: false,
  status: 'not-connected',
  data: null,
  error: 'Not connected: no applicant tracking system endpoint configured. Set defaultEndpoint in this Skill\'s configuration.',
  present: [ctx.render.text('not-connected', 'Connection required', 'Not connected: no applicant tracking system endpoint configured. Set defaultEndpoint in this Skill\'s configuration.')],
};
    }
    if (!apiKey) {
      return {
  success: false,
  status: 'not-connected',
  data: null,
  error: 'Not connected: no applicant tracking system API key configured. Set the apiKey credential for this Skill.',
  present: [ctx.render.text('not-connected', 'Connection required', 'Not connected: no applicant tracking system API key configured. Set the apiKey credential for this Skill.')],
};
    }

    if (!dryRun && input.confirmation !== true) {
      return {
  success: false,
  status: 'confirmation-required',
  data: null,
  error: 'Explicit confirmation required for live dispatch',
  present: [ctx.render.text('notice', 'Confirmation required', 'Explicit confirmation required for live dispatch')],
  system: 'recruiting-ops',
  action: 'execute'
};
    }

    const payload = {
      system: 'recruiting-ops',
      action: 'execute',
      data,
      filters: input.filters || {},
      pagination: input.pagination || {},
      dryRun,
    };

    // The API key travels in the delegated request headers and is never echoed
    // back: only a redacted copy appears in the recorded request block.
    let response: any;
    try {
      response = await ctx.delegate('api_client', {
        path: endpoint,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: payload,
        acceptErrorResponses: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        status: 'error',
        system: 'recruiting-ops',
        action: 'execute',
        request: { input: payload, endpoint, method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': '[REDACTED]' } },
        response: null,
        error: message,
        data: null,
        present: [ctx.render.text('report', 'JD & Interview Kit Result', ['Job Description & Interview Kit Generation', '', 'Error: ' + message, ''])],
      };
    }

    const success = response && response.success === true;
    const status = response && typeof response.status === 'number' ? response.status : 0;
    const responseData = response ? response.data : null;
    const lines = [
      'Job Description & Interview Kit Generation',
      '',
      'Mode: ' + (dryRun ? 'Dry-run (validation only)' : 'Live dispatch'),
      'Endpoint: ' + endpoint,
      'Status: ' + (success ? 'Success' : 'Failed' + (status ? ' (' + status + ')' : '')),
      '',
    ];

    return {
      success,
      status: dryRun ? 'dry-run' : (success ? 'ok' : 'failed'),
      system: 'recruiting-ops',
      action: 'execute',
      request: { input: payload, endpoint, method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': '[REDACTED]' } },
      response: { status, data: responseData },
      error: success ? null : ((response && response.error) || 'HTTP ' + status),
      data: responseData,
      present: [ctx.render.text('report', 'JD & Interview Kit Result', lines)],
    };
  },
});

// ============================================================================
// SKILL 4: hr-interview-scheduling-user (Aid)
// User trigger: an operator books an interview by hand. The automated half
// (interview-scheduling-automated) owns the screening-event path and carries the
// calendar/round policy as configuration.
// ============================================================================

const HR_INTERVIEW_SCHEDULING_USER = createDeclarativeCodeSkill({
  // Declared as a credential, not a plain config field, so the secret can be
  // sourced from the vault via `vault:<id>` and is never echoed into output.
  credentialSource: {
    apiKey: { configKey: 'apiKey', required: false, label: "upstream service API key (set in this Skill configuration, or a vault secret)" },
  },
  id: 'hr-interview-scheduling-user',
  name: 'Interview Scheduling',
  description: 'Coordinates with ATS, calendar, and email systems to book an interview you are scheduling by hand.',
  persistenceEnvVar: 'HR_HOME',
  configSchema: {
    type: 'object',
    properties: {
      confirmBeforeSend: SchemaProps.boolean({ description: 'Require explicit confirmation before sending mutating requests', default: true }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
      defaultSource: SchemaProps.text({ description: 'Default sourcing channel for job descriptions' }),
      apiVersion: SchemaProps.text({ description: 'API version for recruiting operations' }),
      rateLimitPerMinute: SchemaProps.number({ description: 'Rate limit per minute', default: 60 }),
      retryAttempts: SchemaProps.number({ description: 'Retry attempts on failure', default: 3 }),
    },
  },
  endpointConfigKey: 'defaultEndpoint',
  inputSchema: {
    type: 'object',
    properties: {
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
      data: SchemaProps.object({}, { description: 'Scheduling payload data' }),
      filters: SchemaProps.object({}, { description: 'Filters for query operations' }),
      pagination: SchemaProps.object({}, { description: 'Pagination settings' }),
      confirmation: SchemaProps.boolean({ description: 'Explicit approval for live dispatch', default: false }),
    },
    required: ['data'],
  },
  outputSchema: HR_EXTERNAL_OUTPUT_SCHEMA,
  tier: 'aid',
  confirmBeforeSend: true,
  domainKnowledge: HR_DOMAIN_KNOWLEDGE,
  workflowStage: 'interview',
  triggers: [
    {
      kind: 'user',
      phrase_examples: [
        'Schedule an interview for this candidate',
        'Book an onsite for this shortlist',
        'Set up the next round with this interviewer',
      ],
    },
  ],
  isSkill: true,
  async handler(input, ctx) {
    const dryRun = input.dryRun !== false;
    const data = input.data || {};
    const endpoint = String(ctx.config?.defaultEndpoint || '');
    const apiKey = (ctx.getCredential ? ctx.getCredential('apiKey') : undefined) || '';

    if (!endpoint) {
      return {
  success: false,
  status: 'not-connected',
  data: null,
  error: 'Not connected: no applicant tracking system endpoint configured. Set defaultEndpoint in this Skill\'s configuration.',
  present: [ctx.render.text('not-connected', 'Connection required', 'Not connected: no applicant tracking system endpoint configured. Set defaultEndpoint in this Skill\'s configuration.')],
};
    }
    if (!apiKey) {
      return {
  success: false,
  status: 'not-connected',
  data: null,
  error: 'Not connected: no applicant tracking system API key configured. Set the apiKey credential for this Skill.',
  present: [ctx.render.text('not-connected', 'Connection required', 'Not connected: no applicant tracking system API key configured. Set the apiKey credential for this Skill.')],
};
    }

    if (!dryRun && input.confirmation !== true) {
      return {
  success: false,
  status: 'confirmation-required',
  data: null,
  error: 'Explicit confirmation required for live dispatch',
  present: [ctx.render.text('notice', 'Confirmation required', 'Explicit confirmation required for live dispatch')],
  system: 'recruiting-ops',
  action: 'execute'
};
    }

    const payload = {
      system: 'recruiting-ops',
      action: 'execute',
      data,
      filters: input.filters || {},
      pagination: input.pagination || {},
      dryRun,
    };

    let response: any;
    try {
      response = await ctx.delegate('api_client', {
        path: endpoint,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: payload,
        acceptErrorResponses: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        status: 'error',
        system: 'recruiting-ops',
        action: 'execute',
        request: { input: payload, endpoint, method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': '[REDACTED]' } },
        response: null,
        error: message,
        data: null,
        present: [ctx.render.text('report', 'Interview Scheduling Trigger Result', ['Interview Scheduling Trigger', '', 'Error: ' + message, ''])],
      };
    }

    const success = response && response.success === true;
    const status = response && typeof response.status === 'number' ? response.status : 0;
    const responseData = response ? response.data : null;
    const lines = [
      'Interview Scheduling Trigger',
      '',
      'Mode: ' + (dryRun ? 'Dry-run (validation only)' : 'Live dispatch'),
      'Endpoint: ' + endpoint,
      'Status: ' + (success ? 'Success' : 'Failed' + (status ? ' (' + status + ')' : '')),
      '',
    ];

    return {
      success,
      status: dryRun ? 'dry-run' : (success ? 'ok' : 'failed'),
      system: 'recruiting-ops',
      action: 'execute',
      request: { input: payload, endpoint, method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': '[REDACTED]' } },
      response: { status, data: responseData },
      error: success ? null : ((response && response.error) || 'HTTP ' + status),
      data: responseData,
      present: [ctx.render.text('report', 'Interview Scheduling Trigger Result', lines)],
    };
  },
});

// ============================================================================
// SKILL 5: hr-hiring-analytics (Advise)
// Schedule trigger: "Weekly hiring pipeline report"
// ============================================================================

const HR_HIRING_ANALYTICS = createDeclarativeCodeSkill({
  id: 'hr-hiring-analytics',
  name: 'Hiring Pipeline Analytics',
  description: 'Evaluates team headcount needs, attrition trends, and market salary data. Generates hiring metrics, pipeline reports, and diversity analytics. Runs weekly.',
  persistenceEnvVar: 'HR_HOME',
  configSchema: {
    type: 'object',
    properties: {
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
    },
  },
  inputSchema: {
    type: 'object',
    properties: {
      dateRange: SchemaProps.object({
        start: SchemaProps.text({ description: 'Start date for analysis period in ISO 8601 format' }),
        end: SchemaProps.text({ description: 'End date for analysis period in ISO 8601 format' }),
      }, { description: 'Date range for the analysis period' }),
      data: SchemaProps.object({}, { description: 'Hiring records for analytics (optional inline override)' }),
      filters: SchemaProps.object({}, { description: 'Filters to apply to the data' }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
    },
    required: [],
  },
  outputSchema: hrResultSchema('Hiring analytics report with candidate counts by stage, time-to-fill, and diversity metrics'),
  tier: 'advise',
  domainKnowledge: HR_DOMAIN_KNOWLEDGE,
  workflowStage: 'decision',
  triggers: [
    { kind: 'schedule', cadence: 'Weekly hiring pipeline report' },
  ],
  isSkill: true,
  async handler(input, ctx) {
    function computeAnalytics(records: any[]) {
      const totalCandidates = records.length;
      const byStage: Record<string, number> = {};
      records.forEach((r) => { const stage = (r && r.stage) || 'unknown'; byStage[stage] = (byStage[stage] || 0) + 1; });
      const avgTimeToFill = records.length ? records.reduce((sum, r) => sum + ((r && r.timeToFill) || 0), 0) / records.length : 0;
      const diversity = { underrepresented: records.filter((r) => r && r.diversityCategory).length, total: totalCandidates };
      return { totalCandidates, byStage, avgTimeToFill: Math.round(avgTimeToFill * 10) / 10, diversity };
    }

    // Inline data overrides the persisted collection so the same skill can be
    // exercised against a supplied sample without touching the store.
    const inlineData = input.data || null;
    const analyticsPath = ctx.store.getFilePath('analytics');
    const store = inlineData ? (Array.isArray(inlineData) ? inlineData : []) : ctx.store.load('analytics', []);

    if (!store.length) {
      return {
  success: false,
  status: 'not-connected',
  data: null,
  error: 'Not connected: ' + 'no hiring analytics records found in ' + analyticsPath,
  present: [ctx.render.text('not-connected', 'Connection required', 'Not connected: ' + 'no hiring analytics records found in ' + analyticsPath)],
};
    }

    const report = computeAnalytics(store);
    const generatedAt = new Date().toISOString();

    const lines = [
      'Hiring Pipeline Analytics Report',
      'Generated: ' + generatedAt,
      '',
      'Total Candidates: ' + report.totalCandidates,
      '',
      'By Stage:',
    ];
    for (const stage of Object.keys(report.byStage)) {
      lines.push('  ' + stage + ': ' + report.byStage[stage]);
    }
    lines.push('');
    lines.push('Average Time to Fill: ' + report.avgTimeToFill + ' days');
    lines.push('');
    lines.push('Diversity: ' + report.diversity.underrepresented + ' of ' + report.diversity.total + ' candidates from underrepresented groups');
    lines.push('');
    lines.push('Source: Local data analysis (no external market data queried)');
    lines.push('Scope: Computed from records in ' + analyticsPath + (inlineData ? ' (inline data override)' : ''));

    return {
      success: true,
      status: 'ok',
      data: { report, generatedAt },
      error: null,
      present: [ctx.render.text('report', 'Hiring Analytics', lines)],
    };
  },
});

// ============================================================================
// SKILL 6: hr-compliance-check (Advise)
// Schedule trigger: "Monthly compliance audit"
// ============================================================================

const HR_COMPLIANCE_CHECK = createDeclarativeCodeSkill({
  id: 'hr-compliance-check',
  name: 'Compliance Audit Check',
  description: 'Generates compliance checks for EEO statements, GDPR consent, and ADEA violations. Runs monthly.',
  persistenceEnvVar: 'HR_HOME',
  configSchema: {
    type: 'object',
    properties: {
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
    },
  },
  inputSchema: {
    type: 'object',
    properties: {
      dateRange: SchemaProps.object({
        start: SchemaProps.text({ description: 'Start date for analysis period in ISO 8601 format' }),
        end: SchemaProps.text({ description: 'End date for analysis period in ISO 8601 format' }),
      }, { description: 'Date range for the analysis period' }),
      data: SchemaProps.object({}, { description: 'Compliance candidates data (optional inline override)' }),
      filters: SchemaProps.object({}, { description: 'Filters to apply to the data' }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
    },
    required: [],
  },
  outputSchema: hrResultSchema('Compliance check report with findings for EEO, GDPR, and ADEA violations'),
  tier: 'advise',
  domainKnowledge: HR_DOMAIN_KNOWLEDGE,
  workflowStage: 'decision',
  triggers: [
    { kind: 'schedule', cadence: 'Monthly compliance audit' },
  ],
  isSkill: true,
  async handler(input, ctx) {
    function checkCompliance(records: any[]) {
      const findings: any[] = [];
      records.forEach((r) => {
        if (!r) return;
        if (r.posting && !r.posting.eeoStatement) findings.push({ id: r.id, issue: 'Missing EEO statement in job posting' });
        if (r.data && r.data.sensitiveFields && r.data.sensitiveFields.length > 0 && !r.data.gdprConsent) findings.push({ id: r.id, issue: 'GDPR consent not recorded for candidate data' });
        if (r.decision && r.decision.reason === 'age') findings.push({ id: r.id, issue: 'Decision based on age — potential ADEA violation' });
      });
      return { findings, compliant: findings.length === 0, totalChecked: records.length };
    }

    const inlineData = input.data || null;
    const compliancePath = ctx.store.getFilePath('compliance');
    const store = inlineData ? (Array.isArray(inlineData) ? inlineData : []) : ctx.store.load('compliance', []);

    if (!store.length) {
      return {
  success: false,
  status: 'not-connected',
  data: null,
  error: 'Not connected: ' + 'no compliance records found in ' + compliancePath,
  present: [ctx.render.text('not-connected', 'Connection required', 'Not connected: ' + 'no compliance records found in ' + compliancePath)],
};
    }

    const check = checkCompliance(store);
    const generatedAt = new Date().toISOString();

    const lines = [
      'Compliance Audit Report',
      'Generated: ' + generatedAt,
      '',
      'Total Records Checked: ' + check.totalChecked,
      'Compliant: ' + (check.compliant ? 'Yes' : 'No'),
      'Findings: ' + check.findings.length,
      '',
    ];
    if (check.findings.length > 0) {
      lines.push('Issues Identified:');
      check.findings.forEach((f) => lines.push('  - ' + f.issue + ' (Record: ' + f.id + ')'));
      lines.push('');
    } else {
      lines.push('No compliance issues found.');
      lines.push('');
    }
    lines.push('Source: Local compliance check (no external legal database queried)');
    lines.push('Scope: Checked records in ' + compliancePath + (inlineData ? ' (inline data override)' : '') + ' for EEO, GDPR, and ADEA indicators.');

    return {
      success: true,
      status: 'ok',
      data: { check, generatedAt },
      error: null,
      present: [ctx.render.text('report', 'Compliance Audit', lines)],
    };
  },
});

const hrSkills = [
  HR_SCREEN_RESUME,
  HR_ASSESS_CANDIDATE,
  HR_DRAFT_JD_INTERVIEW_KIT,
  HR_INTERVIEW_SCHEDULING_USER,
  HR_INTERVIEW_SCHEDULING_AUTOMATED,
  HR_HIRING_ANALYTICS,
  HR_COMPLIANCE_CHECK,
];

export interface WorkflowStage {
  name: string;
  description: string;
  skills: Tool[];
}

export interface AssistantWorkflow {
  assistant: string;
  productObject: string;
  flow: string;
  stages: WorkflowStage[];
}

export { hrSkills };

export const hrCanonicalSkills = hrSkills;

export const hrWorkflow: AssistantWorkflow = {
  assistant: 'HR',
  productObject: 'applicant',
  flow: 'screening → interview → decision',
  stages: [
    { name: 'screening', description: 'Resume screening and candidate assessment', skills: hrSkills.filter((s) => s.manifest.workflowStage === 'screening') },
    { name: 'interview', description: 'Interview scheduling and coordination', skills: hrSkills.filter((s) => s.manifest.workflowStage === 'interview') },
    { name: 'decision', description: 'Hiring analytics and compliance evaluation', skills: hrSkills.filter((s) => s.manifest.workflowStage === 'decision') },
  ],
};
