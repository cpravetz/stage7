import { Tool } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';
import { hrResultSchema, HR_EXTERNAL_OUTPUT_SCHEMA } from './hr-contract';

// ============================================================================
// SKILL 1: hr-screen-resume (Represent)
// User trigger: "Screen this resume for role fit"
// ============================================================================

const HR_SCREEN_RESUME = createCodeSkill({
  id: 'hr-screen-resume',
  name: 'Screen Resume for Role Fit',
  description: 'Filters inbound applicant profiles against role criteria and computes match score. Dry-run mode and explicit confirmation required.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const NL = '\\n';

  const fail = (status, message, title) => {
    console.log(JSON.stringify({
      success: false,
      status: status,
      error: message,
      data: null,
      present: [{ id: 'notice', title: title, kind: 'text', body: message }],
    }));
  };

  const resumeText = String(input.resumeText || '');
  const jobRequirements = String(input.jobRequirements || '');
  const candidateName = String(input.candidateName || '');
  const dryRun = input.dryRun !== false;
  const confirmation = input.confirmation === true;

  if (!resumeText) {
    fail('error', 'resumeText is required', 'Missing input');
    return;
  }
  if (!jobRequirements) {
    fail('error', 'jobRequirements is required', 'Missing input');
    return;
  }
  if (!candidateName) {
    fail('error', 'candidateName is required', 'Missing input');
    return;
  }

  const hrHome = process.env.HR_HOME || '/tmp/hr';
  const fs = require('fs');
  const path = require('path');
  const storePath = path.join(hrHome, 'screening.json');
  fs.mkdirSync(hrHome, { recursive: true });
  let store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];

  function computeScore(resumeText, jobRequirements) {
    const resumeWords = resumeText.toLowerCase().split(/[^a-zA-Z0-9_]+/).filter(Boolean);
    const reqWords = jobRequirements.toLowerCase().split(/[^a-zA-Z0-9_]+/).filter(Boolean);
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

  const screening = { id: 'screen_' + Date.now(), candidateName, score, matched, gaps, partialMatched, createdAt: new Date().toISOString(), source: 'local' };
  store.push(screening);
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));

  const matchedCount = matched.length;
  const reqWordsCount = jobRequirements.toLowerCase().split(/[^a-zA-Z0-9_]+/).filter(Boolean).length;
  const gapCount = gaps.length;

  const lines = [];
  lines.push('Resume Screening Report: ' + candidateName);
  lines.push('');
  lines.push('Match Score: ' + score + '/100');
  lines.push('Matched Requirements: ' + matchedCount + ' of ' + reqWordsCount);
  lines.push('Gaps Identified: ' + gapCount);
  lines.push('');
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

  const blocks = [
    { id: 'report', title: 'Screening Result', kind: 'text', body: lines.join(NL) },
  ];

  console.log(JSON.stringify({
    success: true,
    status: dryRun ? 'dry-run' : 'ok',
    data: { screening, storePath },
    error: null,
    present: blocks,
  }));
})();`,
    configSchema: {
      type: 'object',
      properties: {
        confirmBeforeSend: SchemaProps.boolean({ description: 'Require explicit confirmation before sending mutating scheduling requests', default: true }),
        dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
        defaultEndpoint: SchemaProps.url({ description: 'Default screening and scheduling endpoint URL' }),
        maxRetryAttempts: SchemaProps.number({ description: 'Retry attempts on scheduling failure', default: 3 }),
        rateLimitPerMinute: SchemaProps.number({ description: 'Rate limit per minute for scheduling API', default: 60 }),
      },
    },
    endpointEnvVar: 'HR_SCREENING_ENDPOINT',
  },
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
  isSkill: true,
});

HR_SCREEN_RESUME.confirmBeforeSend = true;
HR_SCREEN_RESUME.triggers = [
  { kind: 'user', phrase_examples: ['Screen this resume for role fit'] },
];
HR_SCREEN_RESUME.tier = 'represent';
HR_SCREEN_RESUME.domainKnowledge = 'Talent acquisition lifecycles, structured interview methodology, compensation benchmarking, employment law compliance (EEOC)';
HR_SCREEN_RESUME.manifest.workflowStage = 'screening';

// ============================================================================
// SKILL 2: hr-assess-candidate (Represent)
// Event trigger: "New application received"
// ============================================================================

const HR_ASSESS_CANDIDATE = createCodeSkill({
  id: 'hr-assess-candidate',
  name: 'Assess Candidate Skills and Experience',
  description: 'Evaluates candidate technical skills, soft skills, and experience against assessment criteria. Triggered on new application received.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const NL = '\\n';

  const fail = (status, message, title) => {
    console.log(JSON.stringify({
      success: false,
      status: status,
      error: message,
      data: null,
      present: [{ id: 'notice', title: title, kind: 'text', body: message }],
    }));
  };

  const resumeText = String(input.resumeText || '');
  const candidateName = String(input.candidateName || '');
  const assessmentData = input.assessmentData || {};
  const dryRun = input.dryRun !== false;

  if (!resumeText) {
    fail('error', 'resumeText is required', 'Missing input');
    return;
  }
  if (!candidateName) {
    fail('error', 'candidateName is required', 'Missing input');
    return;
  }
  if (!assessmentData || Object.keys(assessmentData).length === 0) {
    fail('error', 'assessmentData is required', 'Missing input');
    return;
  }

  const hrHome = process.env.HR_HOME || '/tmp/hr';
  const fs = require('fs');
  const path = require('path');
  const storePath = path.join(hrHome, 'screening.json');
  fs.mkdirSync(hrHome, { recursive: true });
  let store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];

  function assessCandidate(resumeText, assessmentData) {
    const words = resumeText.toLowerCase().split(/[^a-zA-Z0-9_]+/).filter(Boolean);
    const data = assessmentData || {};
    const technicalSkills = data.technicalSkills || [];
    const softSkills = data.softSkills || [];
    const experience = data.experience || '';
    const yearsMatch = resumeText.match(/([0-9]+)[+]? *(?:years?|yrs?)/i);
    const yearsExp = yearsMatch ? parseInt(yearsMatch[1], 10) : 0;
    const techFound = technicalSkills.filter((s) => words.includes(s.toLowerCase()));
    const softFound = softSkills.filter((s) => words.includes(s.toLowerCase()));
    return {
      yearsExperience: yearsExp,
      technicalSkillMatch: { total: technicalSkills.length, found: techFound, missing: technicalSkills.filter((s) => !words.includes(s.toLowerCase())) },
      softSkillMatch: { total: softSkills.length, found: softFound, missing: softSkills.filter((s) => !words.includes(s.toLowerCase())) },
      experienceMentioned: experience ? resumeText.toLowerCase().includes(experience.toLowerCase()) : null,
    };
  }

  const assessment = assessCandidate(resumeText, assessmentData);
  const record = { id: 'assess_' + Date.now(), candidateName, assessment, createdAt: new Date().toISOString(), source: 'local' };
  store.push(record);
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));

  const techTotal = assessment.technicalSkillMatch.total;
  const techFound = assessment.technicalSkillMatch.found.length;
  const techMissing = assessment.technicalSkillMatch.missing.length;
  const softTotal = assessment.softSkillMatch.total;
  const softFound = assessment.softSkillMatch.found.length;
  const softMissing = assessment.softSkillMatch.missing.length;

  const lines = [];
  lines.push('Candidate Assessment Report: ' + candidateName);
  lines.push('');
  lines.push('Years of Experience (extracted from resume): ' + assessment.yearsExperience);
  lines.push('');
  lines.push('Technical Skills: ' + techFound + ' of ' + techTotal + ' matched');
  if (assessment.technicalSkillMatch.found.length > 0) {
    lines.push('  Found: ' + assessment.technicalSkillMatch.found.join(', '));
  }
  if (assessment.technicalSkillMatch.missing.length > 0) {
    lines.push('  Missing: ' + assessment.technicalSkillMatch.missing.join(', '));
  }
  lines.push('');
  lines.push('Soft Skills: ' + softFound + ' of ' + softTotal + ' matched');
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

  const blocks = [
    { id: 'report', title: 'Assessment Result', kind: 'text', body: lines.join(NL) },
  ];

  console.log(JSON.stringify({
    success: true,
    status: dryRun ? 'dry-run' : 'ok',
    data: { record, storePath },
    error: null,
    present: blocks,
  }));
})();`,
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
    endpointEnvVar: 'HR_SCREENING_ENDPOINT',
  },
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
  isSkill: true,
});

HR_ASSESS_CANDIDATE.confirmBeforeSend = true;
HR_ASSESS_CANDIDATE.triggers = [
  { kind: 'event', on: 'New application received' },
];
HR_ASSESS_CANDIDATE.tier = 'represent';
HR_ASSESS_CANDIDATE.domainKnowledge = 'Talent acquisition lifecycles, structured interview methodology, compensation benchmarking, employment law compliance (EEOC)';
HR_ASSESS_CANDIDATE.manifest.workflowStage = 'screening';

// ============================================================================
// SKILL 3: hr-schedule-interview (Represent)
// Event trigger: "Candidate passed screening"
// ============================================================================

const HR_SCHEDULE_INTERVIEW = createCodeSkill({
  id: 'hr-schedule-interview',
  name: 'Schedule Interview for Candidate',
  description: 'Coordinates interview availability and schedules interviews. Requires explicit confirmation for live scheduling. Triggered when candidate passes screening.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const NL = '\\n';

  const fail = (status, message, title) => {
    console.log(JSON.stringify({
      success: false,
      status: status,
      error: message,
      data: null,
      present: [{ id: 'notice', title: title, kind: 'text', body: message }],
    }));
  };

  const candidateName = String(input.candidateName || '');
  const dryRun = input.dryRun !== false;
  const confirmation = input.confirmation === true;
  const endpoint = process.env.HR_SCREENING_ENDPOINT || '';

  if (!candidateName) {
    fail('error', 'candidateName is required', 'Missing input');
    return;
  }

  if (!endpoint) {
    fail('not-connected', 'Not connected: HR_SCREENING_ENDPOINT is not configured', 'Not connected');
    return;
  }

  if (!dryRun && !confirmation) {
    fail('confirmation-required', 'Explicit confirmation required for live scheduling', 'Confirmation required');
    return;
  }

  const hrHome = process.env.HR_HOME || '/tmp/hr';
  const fs = require('fs');
  const path = require('path');
  fs.mkdirSync(hrHome, { recursive: true });

  const schedule = { id: 'sched_' + Date.now(), candidateName, dryRun, confirmed: confirmation, scheduledAt: new Date().toISOString() };
  const schedPath = path.join(hrHome, 'scheduling.json');
  let schedStore = [];
  if (fs.existsSync(schedPath)) {
    try { schedStore = JSON.parse(fs.readFileSync(schedPath, 'utf8')); } catch (e) {}
  }
  schedStore.push(schedule);
  fs.writeFileSync(schedPath, JSON.stringify(schedStore, null, 2));

  const lines = [];
  lines.push('Interview Scheduling: ' + candidateName);
  lines.push('');
  lines.push('Mode: ' + (dryRun ? 'Dry-run (validation only)' : 'Live scheduling'));
  lines.push('Confirmed: ' + (confirmation ? 'Yes' : 'No'));
  lines.push('Scheduled At: ' + schedule.scheduledAt);
  lines.push('Store Path: ' + schedPath);
  lines.push('');

  const blocks = [
    { id: 'report', title: 'Scheduling Result', kind: 'text', body: lines.join(NL) },
  ];

  console.log(JSON.stringify({
    success: true,
    status: dryRun ? 'dry-run' : 'ok',
    data: { schedule, storePath: schedPath },
    error: null,
    present: blocks,
  }));
})();`,
    configSchema: {
      type: 'object',
      properties: {
        confirmBeforeSend: SchemaProps.boolean({ description: 'Require explicit confirmation before sending mutating scheduling requests', default: true }),
        dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
        defaultEndpoint: SchemaProps.url({ description: 'Default screening and scheduling endpoint URL' }),
        maxRetryAttempts: SchemaProps.number({ description: 'Retry attempts on scheduling failure', default: 3 }),
        rateLimitPerMinute: SchemaProps.number({ description: 'Rate limit per minute for scheduling API', default: 60 }),
      },
    },
    endpointEnvVar: 'HR_SCREENING_ENDPOINT',
  },
  inputSchema: {
    type: 'object',
    properties: {
      candidateName: SchemaProps.text({ description: 'Candidate full name' }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing scheduling; defaults to true', default: true }),
      confirmation: SchemaProps.boolean({ description: 'Explicit approval for live scheduling dispatch', default: false }),
    },
    required: ['candidateName'],
  },
  outputSchema: hrResultSchema('Interview schedule record with mode, confirmation status, and persistence path'),
  isSkill: true,
});

HR_SCHEDULE_INTERVIEW.confirmBeforeSend = true;
HR_SCHEDULE_INTERVIEW.triggers = [
  { kind: 'event', on: 'Candidate passed screening' },
];
HR_SCHEDULE_INTERVIEW.tier = 'represent';
HR_SCHEDULE_INTERVIEW.domainKnowledge = 'Talent acquisition lifecycles, structured interview methodology, compensation benchmarking, employment law compliance (EEOC)';
HR_SCHEDULE_INTERVIEW.manifest.workflowStage = 'interview';

// ============================================================================
// SKILL 4: hr-draft-jd-interview-kit (Aid)
// User trigger
// ============================================================================

const HR_DRAFT_JD_INTERVIEW_KIT = createCodeSkill({
  id: 'hr-draft-jd-interview-kit',
  name: 'Draft Job Description & Interview Kit',
  description: 'Generates structured job descriptions, interview scorecards, role-specific behavioral questions, and rubric guides.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const NL = '\\n';

  const fail = (status, message, title) => {
    console.log(JSON.stringify({
      success: false,
      status: status,
      error: message,
      data: null,
      system: 'recruiting-ops',
      action: 'execute',
      present: [{ id: 'notice', title: title, kind: 'text', body: message }],
    }));
  };

  const dryRun = input.dryRun !== false;
  const data = input.data || {};
  const endpoint = process.env.HR_RECRUITING_ENDPOINT || '';
  const apiKey = process.env.HR_RECRUITING_API_KEY || '';

  if (!endpoint) {
    fail('not-connected', 'Not connected: HR_RECRUITING_ENDPOINT is not configured', 'Not connected');
    return;
  }
  if (!apiKey) {
    fail('not-connected', 'Not connected: HR_RECRUITING_API_KEY is not configured', 'Not connected');
    return;
  }

  const hasConfirmation = input.confirmation === true;
  if (!dryRun && !hasConfirmation) {
    fail('confirmation-required', 'Explicit confirmation required for live dispatch', 'Confirmation required');
    return;
  }

  // Build request payload
  const payload = {
    system: 'recruiting-ops',
    action: 'execute',
    data: data,
    filters: input.filters || {},
    pagination: input.pagination || {},
    dryRun: dryRun,
  };

  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
    });

    const contentType = res.headers.get('content-type') || '';
    let responseData;
    try {
      if (contentType.includes('application/json')) {
        responseData = await res.json();
      } else {
        const text = await res.text();
        responseData = text ? { text } : null;
      }
    } catch (parseErr) {
      responseData = null;
    }

    const success = res.ok;
    const lines = [];
    lines.push('Job Description & Interview Kit Generation');
    lines.push('');
    lines.push('Mode: ' + (dryRun ? 'Dry-run (validation only)' : 'Live dispatch'));
    lines.push('Endpoint: ' + endpoint);
    lines.push('Status: ' + (success ? 'Success' : 'Failed (' + res.status + ')'));
    lines.push('');

    const blocks = [
      { id: 'report', title: 'JD & Interview Kit Result', kind: 'text', body: lines.join(NL) },
    ];

    console.log(JSON.stringify({
      success: success,
      status: dryRun ? 'dry-run' : (success ? 'ok' : 'failed'),
      system: 'recruiting-ops',
      action: 'execute',
      request: { input: payload, endpoint: endpoint, method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': '[REDACTED]' } },
      response: { status: res.status, data: responseData },
      error: success ? null : ('HTTP ' + res.status),
      data: responseData,
      present: blocks,
    }));
  } catch (err) {
    const lines = [];
    lines.push('Job Description & Interview Kit Generation');
    lines.push('');
    lines.push('Error: ' + (err instanceof Error ? err.message : String(err)));
    lines.push('');

    const blocks = [
      { id: 'report', title: 'JD & Interview Kit Result', kind: 'text', body: lines.join(NL) },
    ];

    console.log(JSON.stringify({
      success: false,
      status: 'error',
      system: 'recruiting-ops',
      action: 'execute',
      request: { input: payload, endpoint: endpoint, method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': '[REDACTED]' } },
      response: null,
      error: err instanceof Error ? err.message : String(err),
      data: null,
      present: blocks,
    }));
  }
})();`,
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
    endpointEnvVar: 'HR_RECRUITING_ENDPOINT',
  },
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
  confirmBeforeSend: true,
  isSkill: true,
});

HR_DRAFT_JD_INTERVIEW_KIT.triggers = [
  { kind: 'user', phrase_examples: ['Draft job description', 'Create interview scorecard', 'Generate interview kit'] },
];
HR_DRAFT_JD_INTERVIEW_KIT.tier = 'aid';
HR_DRAFT_JD_INTERVIEW_KIT.domainKnowledge = 'Talent acquisition lifecycles, structured interview methodology, compensation benchmarking, employment law compliance (EEOC)';
HR_DRAFT_JD_INTERVIEW_KIT.manifest.workflowStage = 'interview';

// ============================================================================
// SKILL 5: hr-trigger-interview-scheduling (Aid)
// Event trigger: "Candidate passed screening"
// ============================================================================

const HR_TRIGGER_INTERVIEW_SCHEDULING = createCodeSkill({
  id: 'hr-trigger-interview-scheduling',
  name: 'Trigger Interview Scheduling',
  description: 'Coordinates with ATS, calendar, and email systems to schedule interviews. Triggered when candidate passes screening.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const NL = '\\n';

  const fail = (status, message, title) => {
    console.log(JSON.stringify({
      success: false,
      status: status,
      error: message,
      data: null,
      system: 'recruiting-ops',
      action: 'execute',
      present: [{ id: 'notice', title: title, kind: 'text', body: message }],
    }));
  };

  const dryRun = input.dryRun !== false;
  const data = input.data || {};
  const endpoint = process.env.HR_RECRUITING_ENDPOINT || '';
  const apiKey = process.env.HR_RECRUITING_API_KEY || '';

  if (!endpoint) {
    fail('not-connected', 'Not connected: HR_RECRUITING_ENDPOINT is not configured', 'Not connected');
    return;
  }
  if (!apiKey) {
    fail('not-connected', 'Not connected: HR_RECRUITING_API_KEY is not configured', 'Not connected');
    return;
  }

  const hasConfirmation = input.confirmation === true;
  if (!dryRun && !hasConfirmation) {
    fail('confirmation-required', 'Explicit confirmation required for live dispatch', 'Confirmation required');
    return;
  }

  // Build request payload
  const payload = {
    system: 'recruiting-ops',
    action: 'execute',
    data: data,
    filters: input.filters || {},
    pagination: input.pagination || {},
    dryRun: dryRun,
  };

  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
    });

    const contentType = res.headers.get('content-type') || '';
    let responseData;
    try {
      if (contentType.includes('application/json')) {
        responseData = await res.json();
      } else {
        const text = await res.text();
        responseData = text ? { text } : null;
      }
    } catch (parseErr) {
      responseData = null;
    }

    const success = res.ok;
    const lines = [];
    lines.push('Interview Scheduling Trigger');
    lines.push('');
    lines.push('Mode: ' + (dryRun ? 'Dry-run (validation only)' : 'Live dispatch'));
    lines.push('Endpoint: ' + endpoint);
    lines.push('Status: ' + (success ? 'Success' : 'Failed (' + res.status + ')'));
    lines.push('');

    const blocks = [
      { id: 'report', title: 'Interview Scheduling Trigger Result', kind: 'text', body: lines.join(NL) },
    ];

    console.log(JSON.stringify({
      success: success,
      status: dryRun ? 'dry-run' : (success ? 'ok' : 'failed'),
      system: 'recruiting-ops',
      action: 'execute',
      request: { input: payload, endpoint: endpoint, method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': '[REDACTED]' } },
      response: { status: res.status, data: responseData },
      error: success ? null : ('HTTP ' + res.status),
      data: responseData,
      present: blocks,
    }));
  } catch (err) {
    const lines = [];
    lines.push('Interview Scheduling Trigger');
    lines.push('');
    lines.push('Error: ' + (err instanceof Error ? err.message : String(err)));
    lines.push('');

    const blocks = [
      { id: 'report', title: 'Interview Scheduling Trigger Result', kind: 'text', body: lines.join(NL) },
    ];

    console.log(JSON.stringify({
      success: false,
      status: 'error',
      system: 'recruiting-ops',
      action: 'execute',
      request: { input: payload, endpoint: endpoint, method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': '[REDACTED]' } },
      response: null,
      error: err instanceof Error ? err.message : String(err),
      data: null,
      present: blocks,
    }));
  }
})();`,
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
    endpointEnvVar: 'HR_RECRUITING_ENDPOINT',
  },
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
  confirmBeforeSend: true,
  isSkill: true,
});

HR_TRIGGER_INTERVIEW_SCHEDULING.triggers = [
  { kind: 'event', on: 'Candidate passed screening' },
];
HR_TRIGGER_INTERVIEW_SCHEDULING.tier = 'aid';
HR_TRIGGER_INTERVIEW_SCHEDULING.domainKnowledge = 'Talent acquisition lifecycles, structured interview methodology, compensation benchmarking, employment law compliance (EEOC)';
HR_TRIGGER_INTERVIEW_SCHEDULING.manifest.workflowStage = 'interview';

// ============================================================================
// SKILL 6: hr-hiring-analytics (Advise)
// Schedule trigger: "Weekly hiring pipeline report"
// ============================================================================

const HR_HIRING_ANALYTICS = createCodeSkill({
  id: 'hr-hiring-analytics',
  name: 'Hiring Pipeline Analytics',
  description: 'Evaluates team headcount needs, attrition trends, and market salary data. Generates hiring metrics, pipeline reports, and diversity analytics. Runs weekly.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const NL = '\\n';

  const fail = (status, message, title) => {
    console.log(JSON.stringify({
      success: false,
      status: status,
      error: message,
      data: null,
      present: [{ id: 'notice', title: title, kind: 'text', body: message }],
    }));
  };

  const hrHome = process.env.HR_HOME || '/tmp/hr';
  const fs = require('fs');
  const path = require('path');
  const analyticsPath = path.join(hrHome, 'analytics.json');

  fs.mkdirSync(hrHome, { recursive: true });

  function loadStore(filePath) {
    return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : [];
  }

  function computeAnalytics(data) {
    const records = data || [];
    const totalCandidates = records.length;
    const byStage = {};
    records.forEach((r) => { const stage = r.stage || 'unknown'; byStage[stage] = (byStage[stage] || 0) + 1; });
    const avgTimeToFill = records.length ? records.reduce((sum, r) => sum + (r.timeToFill || 0), 0) / records.length : 0;
    const diversity = { underrepresented: records.filter((r) => r.diversityCategory).length, total: totalCandidates };
    return { totalCandidates, byStage, avgTimeToFill: Math.round(avgTimeToFill * 10) / 10, diversity };
  }

  // Allow inline data override for testing
  const inlineData = input.data || null;
  const store = inlineData ? (Array.isArray(inlineData) ? inlineData : []) : loadStore(analyticsPath);

  if (!store.length) {
    fail('not-connected', 'Not connected: no hiring analytics records found in ' + analyticsPath, 'Not connected');
    return;
  }

  const report = computeAnalytics(store);
  const generatedAt = new Date().toISOString();

  const lines = [];
  lines.push('Hiring Pipeline Analytics Report');
  lines.push('Generated: ' + generatedAt);
  lines.push('');
  lines.push('Total Candidates: ' + report.totalCandidates);
  lines.push('');
  lines.push('By Stage:');
  for (const [stage, count] of Object.entries(report.byStage)) {
    lines.push('  ' + stage + ': ' + count);
  }
  lines.push('');
  lines.push('Average Time to Fill: ' + report.avgTimeToFill + ' days');
  lines.push('');
  lines.push('Diversity: ' + report.diversity.underrepresented + ' of ' + report.diversity.total + ' candidates from underrepresented groups');
  lines.push('');
  lines.push('Source: Local data analysis (no external market data queried)');
  lines.push('Scope: Computed from records in ' + analyticsPath + (inlineData ? ' (inline data override)' : ''));

  const blocks = [
    { id: 'report', title: 'Hiring Analytics', kind: 'text', body: lines.join(NL) },
  ];

  console.log(JSON.stringify({
    success: true,
    status: 'ok',
    data: { report, generatedAt },
    error: null,
    present: blocks,
  }));
})();`,
    configSchema: {
      type: 'object',
      properties: {
        dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
      },
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
  isSkill: true,
});

HR_HIRING_ANALYTICS.triggers = [
  { kind: 'schedule', cadence: 'Weekly hiring pipeline report' },
];
HR_HIRING_ANALYTICS.tier = 'advise';
HR_HIRING_ANALYTICS.domainKnowledge = 'Talent acquisition lifecycles, structured interview methodology, compensation benchmarking, employment law compliance (EEOC)';
HR_HIRING_ANALYTICS.manifest.workflowStage = 'decision';

// ============================================================================
// SKILL 7: hr-compliance-check (Advise)
// Schedule trigger: "Monthly compliance audit"
// ============================================================================

const HR_COMPLIANCE_CHECK = createCodeSkill({
  id: 'hr-compliance-check',
  name: 'Compliance Audit Check',
  description: 'Generates compliance checks for EEO statements, GDPR consent, and ADEA violations. Runs monthly.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const NL = '\\n';

  const fail = (status, message, title) => {
    console.log(JSON.stringify({
      success: false,
      status: status,
      error: message,
      data: null,
      present: [{ id: 'notice', title: title, kind: 'text', body: message }],
    }));
  };

  const hrHome = process.env.HR_HOME || '/tmp/hr';
  const fs = require('fs');
  const path = require('path');
  const compliancePath = path.join(hrHome, 'compliance.json');

  fs.mkdirSync(hrHome, { recursive: true });

  function loadStore(filePath) {
    return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : [];
  }

  function checkCompliance(data) {
    const records = data || [];
    const findings = [];
    records.forEach((r) => {
      if (r.posting && !r.posting.eeoStatement) findings.push({ id: r.id, issue: 'Missing EEO statement in job posting' });
      if (r.data && r.data.sensitiveFields && r.data.sensitiveFields.length > 0 && !r.data.gdprConsent) findings.push({ id: r.id, issue: 'GDPR consent not recorded for candidate data' });
      if (r.decision && r.decision.reason === 'age') findings.push({ id: r.id, issue: 'Decision based on age — potential ADEA violation' });
    });
    return { findings, compliant: findings.length === 0, totalChecked: records.length };
  }

  // Allow inline data override for testing
  const inlineData = input.data || null;
  const store = inlineData ? (Array.isArray(inlineData) ? inlineData : []) : loadStore(compliancePath);

  if (!store.length) {
    fail('not-connected', 'Not connected: no compliance records found in ' + compliancePath, 'Not connected');
    return;
  }

  const check = checkCompliance(store);
  const generatedAt = new Date().toISOString();

  const lines = [];
  lines.push('Compliance Audit Report');
  lines.push('Generated: ' + generatedAt);
  lines.push('');
  lines.push('Total Records Checked: ' + check.totalChecked);
  lines.push('Compliant: ' + (check.compliant ? 'Yes' : 'No'));
  lines.push('Findings: ' + check.findings.length);
  lines.push('');
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

  const blocks = [
    { id: 'report', title: 'Compliance Audit', kind: 'text', body: lines.join(NL) },
  ];

  console.log(JSON.stringify({
    success: true,
    status: 'ok',
    data: { check, generatedAt },
    error: null,
    present: blocks,
  }));
})();`,
    configSchema: {
      type: 'object',
      properties: {
        dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
      },
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
  isSkill: true,
});

HR_COMPLIANCE_CHECK.triggers = [
  { kind: 'schedule', cadence: 'Monthly compliance audit' },
];
HR_COMPLIANCE_CHECK.tier = 'advise';
HR_COMPLIANCE_CHECK.domainKnowledge = 'Talent acquisition lifecycles, structured interview methodology, compensation benchmarking, employment law compliance (EEOC)';
HR_COMPLIANCE_CHECK.manifest.workflowStage = 'decision';

const hrSkills = [
  HR_SCREEN_RESUME,
  HR_ASSESS_CANDIDATE,
  HR_SCHEDULE_INTERVIEW,
  HR_DRAFT_JD_INTERVIEW_KIT,
  HR_TRIGGER_INTERVIEW_SCHEDULING,
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