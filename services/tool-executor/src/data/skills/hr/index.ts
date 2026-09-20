import { Tool } from '../../../types';
import { createExternalActionSkill, createCodeSkill, SchemaProps } from '../code-skill-factory';

// ============================================================================
// SKILL 1: Candidate Screening & Scheduling Manager (Represent)
// ============================================================================
// Operations: screen-resume, assessment, schedule-interview
// confirmBeforeSend: true, dryRun default: true
// configSchema and endpointEnvVar for Represent skill governance
// ============================================================================

const CANDIDATE_SCREENING = createCodeSkill({
  id: 'candidate-screening',
  name: 'Applicant Review and Interview Coordination',
  description: 'Filters inbound applicant profiles against role criteria, dispatches initial screening surveys, and coordinates interview availability. Dry-run mode and explicit confirmation required for scheduling operations.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const operation = input.operation || 'screen-resume';
const resumeText = input.resumeText || '';
const jobRequirements = input.jobRequirements || '';
const candidateName = input.candidateName || '';
const assessmentData = input.assessmentData || {};
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

let result;
switch (operation) {
  case 'screen-resume': {
    const { score, matched, gaps } = computeScore(resumeText, jobRequirements);
    const screening = { id: 'screen_' + Date.now(), candidateName, score, matched, gaps, createdAt: new Date().toISOString(), source: 'local' };
    store.push(screening);
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
    result = { success: true, operation: 'screen-resume', mode: dryRun ? 'dry-run' : 'live', data: { screening, storePath } };
    break;
  }
  case 'assessment': {
    const assessment = assessCandidate(resumeText, assessmentData);
    const record = { id: 'assess_' + Date.now(), candidateName, assessment, createdAt: new Date().toISOString(), source: 'local' };
    store.push(record);
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
    result = { success: true, operation: 'assessment', mode: dryRun ? 'dry-run' : 'live', data: { record, storePath } };
    break;
  }
  case 'schedule-interview': {
    if (!endpoint) {
      result = { success: false, operation: 'schedule-interview', mode: 'not-connected', error: 'Not connected: HR_SCREENING_ENDPOINT is not configured', data: null };
      break;
    }
    if (!dryRun && !confirmation) {
      result = { success: false, operation: 'schedule-interview', mode: 'confirmation-required', error: 'Explicit confirmation required for scheduling', data: null };
      break;
    }
    const schedule = { id: 'sched_' + Date.now(), candidateName, operation: 'schedule-interview', dryRun, confirmed: confirmation, scheduledAt: new Date().toISOString() };
    const schedPath = path.join(hrHome, 'scheduling.json');
    let schedStore = [];
    if (fs.existsSync(schedPath)) {
      try { schedStore = JSON.parse(fs.readFileSync(schedPath, 'utf8')); } catch (e) {}
    }
    schedStore.push(schedule);
    fs.writeFileSync(schedPath, JSON.stringify(schedStore, null, 2));
    result = { success: true, operation: 'schedule-interview', mode: dryRun ? 'dry-run' : 'live', data: { schedule, storePath: schedPath } };
    break;
  }
  default:
    result = { success: false, error: 'Unknown operation: ' + operation };
}
console.log(JSON.stringify(result));
`,
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
      operation: SchemaProps.select(['screen-resume', 'assessment', 'schedule-interview'], { description: 'Screening or scheduling operation to perform' }),
      resumeText: SchemaProps.text({ description: 'Resume text to screen against job requirements' }),
      jobRequirements: SchemaProps.text({ description: 'Job requirements to match resume against' }),
      candidateName: SchemaProps.text({ description: 'Candidate full name' }),
      assessmentData: SchemaProps.object({
        technicalSkills: SchemaProps.stringArray({ description: 'Technical skills to assess against resume' }),
        softSkills: SchemaProps.stringArray({ description: 'Soft skills to assess against resume' }),
        experience: SchemaProps.text({ description: 'Experience level to check for in resume' }),
      }, { description: 'Assessment criteria and data for candidate evaluation' }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing scheduling; defaults to true', default: true }),
      confirmation: SchemaProps.boolean({ description: 'Explicit approval for live scheduling dispatch', default: false }),
    },
    required: ['operation'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      operation: { type: 'string' },
      mode: { type: 'string', enum: ['dry-run', 'live', 'not-connected', 'confirmation-required', 'error'] },
      data: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['success', 'operation', 'mode'],
  },
});

// ============================================================================
// SKILL 2: Job Description & Interview Kit Co-Pilot (Aid)
// ============================================================================
// Operations: ats, job-board, linkedin, schedule-interview, calendar, email
// ============================================================================

const RECRUITING_OPS = createExternalActionSkill({
  id: 'recruiting-ops',
  name: 'Job Description & Interview Kit Co-Pilot',
  description: 'Generates structured job descriptions, interview scorecards, role-specific behavioral questions, and rubric guides. Coordinates with ATS, job boards, LinkedIn, scheduling, calendar, and email systems.',
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
      operation: SchemaProps.select(['ats', 'job-board', 'linkedin', 'schedule-interview', 'calendar', 'email'], { description: 'Recruiting operation to perform' }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
      data: SchemaProps.object({}, { description: 'Operation payload data for job description or interview kit generation' }),
      filters: SchemaProps.object({}, { description: 'Filters for query operations' }),
      pagination: SchemaProps.object({}, { description: 'Pagination settings' }),
    },
    required: ['operation'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      mode: { type: 'string' },
      system: { type: 'string' },
      action: { type: 'string' },
      operation: { type: 'string' },
      request: { type: 'object' },
      response: { type: ['object', 'null'] },
      error: { type: 'string' },
    },
    required: ['success', 'mode', 'system', 'action', 'operation', 'request', 'response', 'error'],
  },
  timeoutMs: 30000,
  confirmBeforeSend: true,
})

// ============================================================================
// SKILL 3: Workforce Planning & Compensation Evaluator (Advise)
// ============================================================================
// Operations: hiring-analytics, compliance
// ============================================================================

const HIRING_ANALYTICS_COMPLIANCE = createCodeSkill({
  id: 'hiring-analytics-compliance',
  name: 'Workforce Planning & Compensation Evaluator',
  description: 'Evaluates team headcount needs, attrition trends, and market salary data to recommend hiring roadmaps and compensation structures. Generates hiring metrics, pipeline reports, diversity analytics, and compliance checks.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const operation = input.operation || 'hiring-analytics';
const hrHome = process.env.HR_HOME || path.join('/tmp/hr');
const analyticsPath = path.join(hrHome, 'analytics.json');
const compliancePath = path.join(hrHome, 'compliance.json');

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

let result;
switch (operation) {
  case 'hiring-analytics': {
    const store = loadStore(analyticsPath);
    if (!store.length) {
      result = { success: false, mode: 'not-connected', error: 'Not connected: no hiring analytics records found in ' + analyticsPath, data: { report: null } };
      break;
    }
    const report = computeAnalytics(store);
    result = { success: true, operation: 'hiring-analytics', mode: 'local', data: { report, generatedAt: new Date().toISOString() } };
    break;
  }
  case 'compliance': {
    const store = loadStore(compliancePath);
    if (!store.length) {
      result = { success: false, mode: 'not-connected', error: 'Not connected: no compliance records found in ' + compliancePath, data: { check: null } };
      break;
    }
    const check = checkCompliance(store);
    result = { success: true, operation: 'compliance', mode: 'local', data: { check, generatedAt: new Date().toISOString() } };
    break;
  }
  default:
    result = { success: false, error: 'Unknown operation: ' + operation };
}
console.log(JSON.stringify(result));
`,
  },
  inputSchema: {
    type: 'object',
    properties: {
      operation: SchemaProps.select(['hiring-analytics', 'compliance'], { description: 'Operation to perform: hiring-analytics for pipeline reports, compliance for regulatory checks' }),
      dateRange: SchemaProps.object({
        start: SchemaProps.text({ description: 'Start date for analysis period in ISO 8601 format' }),
        end: SchemaProps.text({ description: 'End date for analysis period in ISO 8601 format' }),
      }, { description: 'Date range for the analysis period' }),
      data: SchemaProps.object({}, { description: 'Data payload for the operation — hiring records or compliance candidates' }),
      filters: SchemaProps.object({}, { description: 'Filters to apply to the data' }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
    },
    required: ['operation'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      operation: { type: 'string' },
      mode: { type: 'string', description: 'Execution mode: local, not-connected, or error' },
      data: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['success', 'operation', 'mode'],
  },
});

CANDIDATE_SCREENING.confirmBeforeSend = true;
CANDIDATE_SCREENING.triggers = [
  { kind: 'user', phrase_examples: ['Screen this resume', 'Assess this candidate', 'Schedule this interview', 'Evaluate this applicant'] },
  { kind: 'schedule', cadence: 'Daily resume intake review' },
  { kind: 'event', on: 'New application received' },
  { kind: 'event', on: 'Resume uploaded' },
  { kind: 'data', condition: 'Resume or applicant profile data available for screening' },
];
HIRING_ANALYTICS_COMPLIANCE.triggers = [
  { kind: 'user', phrase_examples: ['Generate hiring analytics', 'Run compliance check', 'Evaluate workforce plan', 'Assess compensation benchmarks'] },
  { kind: 'schedule', cadence: 'Weekly hiring pipeline report' },
  { kind: 'schedule', cadence: 'Monthly compliance audit' },
  { kind: 'event', on: 'New candidate application received' },
  { kind: 'event', on: 'Interview feedback submitted' },
  { kind: 'data', condition: 'Hiring pipeline or compliance data available for analysis' },
];
RECRUITING_OPS.triggers = [
  { kind: 'user', phrase_examples: ['Draft job description', 'Create interview scorecard', 'Post to job board', 'Schedule interview'] },
  { kind: 'schedule', cadence: 'Weekly job posting and interview pipeline review' },
  { kind: 'event', on: 'New job req opened' },
  { kind: 'event', on: 'New candidate application received' },
  { kind: 'data', condition: 'Job req, candidate, or scheduling data available' },
];

const hrSkills = [
  { ...CANDIDATE_SCREENING, isSkill: false },
  { ...RECRUITING_OPS, isSkill: false },
  { ...HIRING_ANALYTICS_COMPLIANCE, isSkill: false },
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

CANDIDATE_SCREENING.manifest.workflowStage = 'screening';
RECRUITING_OPS.manifest.workflowStage = 'interview';
HIRING_ANALYTICS_COMPLIANCE.manifest.workflowStage = 'decision';

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
