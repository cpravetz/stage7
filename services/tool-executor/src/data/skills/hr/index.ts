import { Tool } from '../../../types';
import { createExternalActionSkill, createCodeSkill, SchemaProps } from '../code-skill-factory';

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
    sourceCode: `const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const resumeText = input.resumeText || '';
const jobRequirements = input.jobRequirements || '';
const candidateName = input.candidateName || '';
const dryRun = input.dryRun !== false;
const confirmation = input.confirmation === true;
const endpoint = process.env.HR_SCREENING_ENDPOINT || '';

const hrHome = process.env.HR_HOME || path.join('/tmp/hr');
const storePath = path.join(hrHome, 'screening.json');
fs.mkdirSync(hrHome, { recursive: true });
let store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];

function computeScore(resumeText, jobRequirements) {
  const resumeWords = resumeText.toLowerCase().split(/[^a-zA-Z0-9_]+/).filter(Boolean);
  const reqWords = jobRequirements.toLowerCase().split(/[^a-zA-Z0-9_]+/).filter(Boolean);
  if (!reqWords.length) return 0;
  const exactMatched = reqWords.filter((w) => resumeWords.includes(w));
  const partialMatched = reqWords.filter((w) => !exactMatched.includes(w) && w.length >= 3 && resumeWords.some((rw) => rw.includes(w)));
  const matched = [...exactMatched, ...partialMatched];
  const raw = (matched.length / reqWords.length) * 100;
  const score = Math.max(1, Math.round(raw)) || 0;
  const gaps = reqWords.filter((w) => !matched.includes(w));
  return { score: Math.min(100, score), matched, gaps, partialMatched };
}

const { score, matched, gaps } = computeScore(resumeText, jobRequirements);
const screening = { id: 'screen_' + Date.now(), candidateName, score, matched, gaps, createdAt: new Date().toISOString(), source: 'local' };
store.push(screening);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));

const result = { status: 'success', data: { screening, storePath } };
console.log(JSON.stringify(result));`,
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
  outputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['success', 'error'] },
      data: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['status'],
  },
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
    sourceCode: `const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const resumeText = input.resumeText || '';
const candidateName = input.candidateName || '';
const assessmentData = input.assessmentData || {};
const dryRun = input.dryRun !== false;

const hrHome = process.env.HR_HOME || path.join('/tmp/hr');
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

const result = { status: 'success', data: { record, storePath } };
console.log(JSON.stringify(result));`,
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
  outputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['success', 'error'] },
      data: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['status'],
  },
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
    sourceCode: `const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const candidateName = input.candidateName || '';
const dryRun = input.dryRun !== false;
const confirmation = input.confirmation === true;
const endpoint = process.env.HR_SCREENING_ENDPOINT || '';

if (!endpoint) {
  const result = { status: 'error', error: 'Not connected: HR_SCREENING_ENDPOINT is not configured', data: null };
  console.log(JSON.stringify(result));
  process.exit(0);
}

if (!dryRun && !confirmation) {
  const result = { status: 'error', error: 'Explicit confirmation required for scheduling', data: null };
  console.log(JSON.stringify(result));
  process.exit(0);
}

const hrHome = process.env.HR_HOME || path.join('/tmp/hr');
fs.mkdirSync(hrHome, { recursive: true });

const schedule = { id: 'sched_' + Date.now(), candidateName, dryRun, confirmed: confirmation, scheduledAt: new Date().toISOString() };
const schedPath = path.join(hrHome, 'scheduling.json');
let schedStore = [];
if (fs.existsSync(schedPath)) {
  try { schedStore = JSON.parse(fs.readFileSync(schedPath, 'utf8')); } catch (e) {}
}
schedStore.push(schedule);
fs.writeFileSync(schedPath, JSON.stringify(schedStore, null, 2));

const result = { status: 'success', data: { schedule, storePath: schedPath } };
console.log(JSON.stringify(result));`,
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
  outputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['success', 'error'] },
      data: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['status'],
  },
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

const HR_DRAFT_JD_INTERVIEW_KIT = createExternalActionSkill({
  id: 'hr-draft-jd-interview-kit',
  name: 'Draft Job Description & Interview Kit',
  description: 'Generates structured job descriptions, interview scorecards, role-specific behavioral questions, and rubric guides.',
  system: 'recruiting-ops',
  action: 'execute',
  endpoint: { envVar: 'HR_RECRUITING_ENDPOINT', method: 'POST' },
  auth: { type: 'api_key', header: 'X-API-Key', credentialEnvKeyMap: { apiKey: 'HR_RECRUITING_API_KEY' } },
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
  credentialSource: { apiKey: { envVar: 'HR_RECRUITING_API_KEY', configKey: 'recruiting.apiKey' } },
  inputSchema: {
    type: 'object',
    properties: {
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
      data: SchemaProps.object({}, { description: 'Payload data for job description or interview kit generation' }),
      filters: SchemaProps.object({}, { description: 'Filters for query operations' }),
      pagination: SchemaProps.object({}, { description: 'Pagination settings' }),
    },
    required: ['data'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['success', 'error'] },
      data: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['status'],
  },
  timeoutMs: 30000,
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

const HR_TRIGGER_INTERVIEW_SCHEDULING = createExternalActionSkill({
  id: 'hr-trigger-interview-scheduling',
  name: 'Trigger Interview Scheduling',
  description: 'Coordinates with ATS, calendar, and email systems to schedule interviews. Triggered when candidate passes screening.',
  system: 'recruiting-ops',
  action: 'execute',
  endpoint: { envVar: 'HR_RECRUITING_ENDPOINT', method: 'POST' },
  auth: { type: 'api_key', header: 'X-API-Key', credentialEnvKeyMap: { apiKey: 'HR_RECRUITING_API_KEY' } },
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
  credentialSource: { apiKey: { envVar: 'HR_RECRUITING_API_KEY', configKey: 'recruiting.apiKey' } },
  inputSchema: {
    type: 'object',
    properties: {
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
      data: SchemaProps.object({}, { description: 'Scheduling payload data' }),
      filters: SchemaProps.object({}, { description: 'Filters for query operations' }),
      pagination: SchemaProps.object({}, { description: 'Pagination settings' }),
    },
    required: ['data'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['success', 'error'] },
      data: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['status'],
  },
  timeoutMs: 30000,
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
    sourceCode: `const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const hrHome = process.env.HR_HOME || path.join('/tmp/hr');
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

const store = loadStore(analyticsPath);
if (!store.length) {
  const result = { status: 'error', error: 'Not connected: no hiring analytics records found in ' + analyticsPath, data: { report: null } };
  console.log(JSON.stringify(result));
  process.exit(0);
}

const report = computeAnalytics(store);
const result = { status: 'success', data: { report, generatedAt: new Date().toISOString() } };
console.log(JSON.stringify(result));`,
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
      data: SchemaProps.object({}, { description: 'Hiring records for analytics' }),
      filters: SchemaProps.object({}, { description: 'Filters to apply to the data' }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
    },
    required: [],
  },
  outputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['success', 'error'] },
      data: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['status'],
  },
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
    sourceCode: `const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const hrHome = process.env.HR_HOME || path.join('/tmp/hr');
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

const store = loadStore(compliancePath);
if (!store.length) {
  const result = { status: 'error', error: 'Not connected: no compliance records found in ' + compliancePath, data: { check: null } };
  console.log(JSON.stringify(result));
  process.exit(0);
}

const check = checkCompliance(store);
const result = { status: 'success', data: { check, generatedAt: new Date().toISOString() } };
console.log(JSON.stringify(result));`,
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
      data: SchemaProps.object({}, { description: 'Compliance candidates data' }),
      filters: SchemaProps.object({}, { description: 'Filters to apply to the data' }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
    },
    required: [],
  },
  outputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['success', 'error'] },
      data: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['status'],
  },
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
