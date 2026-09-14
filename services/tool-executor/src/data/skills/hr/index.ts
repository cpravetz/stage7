import { Tool } from '../../../types';
import { createExternalActionSkill } from '../code-skill-factory';

const HR_SKILLS: Tool[] = [
  {
    id: 'screen-resume',
    name: 'Screen Resume',
    description: 'Screen a resume against job requirements and produce a match score with gaps.',
    type: 'code',
    manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const resumeText = input.resumeText || '';
const jobRequirements = input.jobRequirements || '';
const baseDir = process.env.HR_HOME || path.join('/tmp/hr');
const storePath = path.join(baseDir, 'screening.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
const resumeWords = resumeText.toLowerCase().split(/\W+/).filter(Boolean);
const reqWords = jobRequirements.toLowerCase().split(/\W+/).filter(Boolean);
const matched = reqWords.filter((w) => resumeWords.includes(w));
const score = reqWords.length ? Math.round((matched.length / reqWords.length) * 100) : 0;
const screening = { id: 'screen_' + Date.now(), score, matched, gaps: reqWords.filter((w) => !resumeWords.includes(w)), createdAt: new Date().toISOString(), source: 'local' };
store.push(screening);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
console.log(JSON.stringify({ success: true, data: { screening, storePath } }));
` },
    inputSchema: { type: 'object', properties: { resumeText: { type: 'string', description: 'Resume text to screen' }, jobRequirements: { type: 'string', description: 'Job requirements to match against' } } },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, screening: { type: 'object' }, storePath: { type: 'string' } }, required: ['success', 'screening', 'storePath'] },
    createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: 'schedule-interview',
    name: 'Schedule Interview',
    description: 'Schedule an interview for a candidate with a panel. Saves locally; can sync to calendar when configured.',
    type: 'code',
    manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const candidateName = input.candidateName || '';
const panel = input.panel || [];
const scheduledAt = input.scheduledAt || '';
const interviewType = input.interviewType || 'phone';
const baseDir = process.env.HR_HOME || path.join('/tmp/hr');
const storePath = path.join(baseDir, 'interviews.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
const interview = { id: 'interview_' + Date.now(), candidateName, panel, scheduledAt, interviewType, status: 'scheduled', createdAt: new Date().toISOString(), source: 'local' };
store.push(interview);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
console.log(JSON.stringify({ success: true, data: { interview, storePath, hint: 'Set CALENDAR_BASE_URL + CALENDAR_API_KEY to sync to calendar' } }));
` },
    inputSchema: { type: 'object', properties: { candidateName: { type: 'string', description: 'Candidate name' }, panel: { type: 'array', items: { type: 'string' }, description: 'Interview panel members' }, scheduledAt: { type: 'string', description: 'Scheduled date and time' }, interviewType: { type: 'string', description: 'Interview type (e.g., phone, in-person)' } } },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, interview: { type: 'object' }, storePath: { type: 'string' } }, required: ['success', 'interview', 'storePath'] },
    createdAt: new Date(), updatedAt: new Date(),
  },
];

const HR_EXTERNAL_SKILLS: Tool[] = [
  createExternalActionSkill({
    id: 'hr-ats',
    name: 'ATS Integration',
    description: 'Interact with an external Applicant Tracking System for candidate management, job postings, and hiring workflows.',
    system: 'ats',
    action: 'manage-candidates',
    endpoint: { envVar: 'HR_ATS_ENDPOINT', method: 'POST' },
    auth: { type: 'api_key', header: 'X-API-Key', credentialEnvKeyMap: { apiKey: 'HR_ATS_API_KEY' } },
    configSchema: { type: 'object', properties: { baseUrl: { type: 'string' }, apiVersion: { type: 'string' }, defaultSource: { type: 'string' }, customFields: { type: 'object' }, workflowTemplates: { type: 'array', items: { type: 'object' } }, integrationEndpoints: { type: 'array', items: { type: 'object' } }, complianceRules: { type: 'array', items: { type: 'object' } } } },
    credentialSource: { apiKey: { envVar: 'HR_ATS_API_KEY', configKey: 'ats.apiKey' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['create-candidate', 'update-candidate', 'get-candidate', 'search-candidates', 'create-job', 'update-job', 'get-job', 'list-jobs'], description: 'Action to perform' }, candidateId: { type: 'string', description: 'Candidate ID' }, candidateData: { type: 'object', description: 'Candidate data' }, jobId: { type: 'string', description: 'Job ID' }, jobData: { type: 'object', description: 'Job data' }, filters: { type: 'object', description: 'Filters' }, pagination: { type: 'object', description: 'Pagination' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'hr-email',
    name: 'HR Email System',
    description: 'Send and manage HR-related emails including candidate communications, offer letters, and notifications.',
    system: 'email',
    action: 'send-email',
    endpoint: { envVar: 'HR_EMAIL_ENDPOINT', method: 'POST' },
    auth: { type: 'api_key', header: 'Authorization', credentialEnvKeyMap: { apiKey: 'HR_EMAIL_API_KEY' } },
    configSchema: { type: 'object', properties: { provider: { type: 'string', enum: ['sendgrid', 'mailgun', 'ses', 'smtp', 'custom'] }, fromAddress: { type: 'string' }, fromName: { type: 'string' }, templates: { type: 'object' }, templateEngine: { type: 'string', enum: ['handlebars', 'mustache', 'liquid', 'nunjucks', 'custom'] }, deliveryTracking: { type: 'object', properties: { enabled: { type: 'boolean' }, webhookUrl: { type: 'string' }, events: { type: 'array', items: { type: 'string' } } } }, bounceHandling: { type: 'object', properties: { strategy: { type: 'string', enum: ['auto', 'manual', 'suppress'] }, retryAttempts: { type: 'number' }, notificationEmail: { type: 'string' } } }, encryptionSettings: { type: 'object', properties: { algorithm: { type: 'string', enum: ['AES-256', 'RSA', 'TLS'] }, keyRotationDays: { type: 'number' }, keyVaultUrl: { type: 'string' } } } } },
    credentialSource: { apiKey: { envVar: 'HR_EMAIL_API_KEY', configKey: 'email.apiKey' } },
    inputSchema: { type: 'object', properties: { to: { type: 'array', items: { type: 'string' }, description: 'Recipient email addresses' }, cc: { type: 'array', items: { type: 'string' }, description: 'CC recipients' }, bcc: { type: 'array', items: { type: 'string' }, description: 'BCC recipients' }, subject: { type: 'string', description: 'Email subject' }, htmlBody: { type: 'string', description: 'HTML email body' }, textBody: { type: 'string', description: 'Plain text email body' }, templateId: { type: 'string', description: 'Template ID' }, templateData: { type: 'object', description: 'Template data' }, attachments: { type: 'array', items: { type: 'object' }, description: 'Attachments' }, trackingEnabled: { type: 'boolean', description: 'Whether to enable tracking' } }, required: ['to', 'subject'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'hr-job-board',
    name: 'Job Board Integration',
    description: 'Post and manage job listings across external job boards and career sites.',
    system: 'job-board',
    action: 'manage-jobs',
    endpoint: { envVar: 'HR_JOB_BOARD_ENDPOINT', method: 'POST' },
    auth: { type: 'api_key', header: 'X-API-Key', credentialEnvKeyMap: { apiKey: 'HR_JOB_BOARD_API_KEY' } },
    configSchema: { type: 'object', properties: { boards: { type: 'array', items: { type: 'string' } }, defaultBoard: { type: 'string' }, autoExpireDays: { type: 'number' }, featuredPosting: { type: 'boolean' }, boardConfigs: { type: 'array', items: { type: 'object' } }, postingTemplates: { type: 'array', items: { type: 'object' } }, performanceTracking: { type: 'object', properties: { enabled: { type: 'boolean' }, metrics: { type: 'array', items: { type: 'string' } }, reportingPeriodDays: { type: 'number' } } }, spendManagement: { type: 'object', properties: { budgetLimit: { type: 'number' }, costPerClick: { type: 'boolean' }, alertThreshold: { type: 'number' }, billingEmail: { type: 'string' } } } } },
    credentialSource: { apiKey: { envVar: 'HR_JOB_BOARD_API_KEY', configKey: 'jobBoard.apiKey' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['post-job', 'update-job', 'remove-job', 'get-job', 'list-jobs', 'get-applications'], description: 'Action to perform' }, jobId: { type: 'string', description: 'Job ID' }, jobData: { type: 'object', description: 'Job data' }, boardId: { type: 'string', description: 'Board ID' }, filters: { type: 'object', description: 'Filters' }, pagination: { type: 'object', description: 'Pagination' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'hr-linkedin',
    name: 'LinkedIn Recruiter Integration',
    description: 'Search candidates, send InMails, and manage LinkedIn Recruiter workflows.',
    system: 'linkedin',
    action: 'recruiter-operations',
    endpoint: { envVar: 'HR_LINKEDIN_ENDPOINT', method: 'POST' },
    auth: { type: 'bearer', credentialEnvKeyMap: { accessToken: 'HR_LINKEDIN_ACCESS_TOKEN' } },
    configSchema: { type: 'object', properties: { apiVersion: { type: 'string' }, rateLimitPerMinute: { type: 'number' }, defaultSearchFilters: { type: 'object' }, searchFilters: { type: 'array', items: { type: 'object' } }, inmailTemplates: { type: 'array', items: { type: 'object' } }, connectionLimits: { type: 'object', properties: { dailyLimit: { type: 'number' }, weeklyLimit: { type: 'number' }, connectionRequestMessage: { type: 'string' } } }, apiUsageTracking: { type: 'object', properties: { enabled: { type: 'boolean' }, logRequests: { type: 'boolean' }, quotaWindowHours: { type: 'number' } } } } },
    credentialSource: { accessToken: { envVar: 'HR_LINKEDIN_ACCESS_TOKEN', configKey: 'linkedin.accessToken', vaultSecretId: 'linkedin-access-token' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['search-candidates', 'get-profile', 'send-inmail', 'get-inmail-status', 'post-job', 'get-job-applications'], description: 'Action to perform' }, searchCriteria: { type: 'object', description: 'Search criteria' }, profileId: { type: 'string', description: 'Profile ID' }, inmailData: { type: 'object', description: 'InMail data' }, jobId: { type: 'string', description: 'Job ID' }, jobData: { type: 'object', description: 'Job data' }, pagination: { type: 'object', description: 'Pagination' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'hr-hiring-analytics',
    name: 'Hiring Analytics',
    description: 'Generate hiring metrics, pipeline reports, and diversity analytics from ATS data.',
    system: 'analytics',
    action: 'hiring-analytics',
    endpoint: { envVar: 'HR_ANALYTICS_ENDPOINT', method: 'POST' },
    auth: { type: 'api_key', header: 'X-API-Key', credentialEnvKeyMap: { apiKey: 'HR_ANALYTICS_API_KEY' } },
    configSchema: { type: 'object', properties: { dataSource: { type: 'string' }, defaultDateRange: { type: 'string' }, metrics: { type: 'array', items: { type: 'string' } }, dimensions: { type: 'array', items: { type: 'string' } }, dataWarehouse: { type: 'object', properties: { type: { type: 'string', enum: ['snowflake', 'redshift', 'bigquery', 'synapse', 'custom'] }, connectionString: { type: 'string' }, schema: { type: 'string' }, warehouse: { type: 'string' } } }, reportTemplates: { type: 'array', items: { type: 'object' } }, benchmarkData: { type: 'object', properties: { source: { type: 'string' }, period: { type: 'string' }, industry: { type: 'string' }, region: { type: 'string' } } }, alertThresholds: { type: 'object', properties: { pipelineDropOff: { type: 'number' }, timeToFillExceedDays: { type: 'number' }, offerAcceptanceRateBelow: { type: 'number' }, diversityGoalMiss: { type: 'number' } } } } },
    credentialSource: { apiKey: { envVar: 'HR_ANALYTICS_API_KEY', configKey: 'analytics.apiKey' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['pipeline-report', 'time-to-fill', 'source-effectiveness', 'diversity-report', 'offer-acceptance-rate', 'custom-query'], description: 'Action to perform' }, dateRange: { type: 'object', properties: { start: { type: 'string', description: 'Start date' }, end: { type: 'string', description: 'End date' } }, description: 'Date range' }, filters: { type: 'object', description: 'Filters' }, groupBy: { type: 'array', items: { type: 'string' }, description: 'Group by fields' }, metrics: { type: 'array', items: { type: 'string' }, description: 'Metrics to analyze' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'hr-assessment',
    name: 'Candidate Assessment Platform',
    description: 'Manage candidate assessments, tests, and evaluations through external assessment providers.',
    system: 'assessment',
    action: 'manage-assessments',
    endpoint: { envVar: 'HR_ASSESSMENT_ENDPOINT', method: 'POST' },
    auth: { type: 'api_key', header: 'Authorization', credentialEnvKeyMap: { apiKey: 'HR_ASSESSMENT_API_KEY' } },
    configSchema: { type: 'object', properties: { provider: { type: 'string', enum: ['codility', 'hackerrank', 'criteria', 'shl', 'custom'] }, defaultTestLibrary: { type: 'string' }, autoScoring: { type: 'boolean' }, proctoringEnabled: { type: 'boolean' }, testLibrary: { type: 'array', items: { type: 'object' } }, scoringModels: { type: 'array', items: { type: 'object' } }, proctoringConfig: { type: 'object', properties: { enabled: { type: 'boolean' }, mode: { type: 'string', enum: ['ai', 'human', 'hybrid'] }, browserLockdown: { type: 'boolean' }, webcamRequired: { type: 'boolean' }, suspiciousActivityThreshold: { type: 'number' } } }, biasDetection: { type: 'object', properties: { enabled: { type: 'boolean' }, sensitivityLevel: { type: 'string', enum: ['low', 'medium', 'high'] }, flaggingThreshold: { type: 'number' }, reviewRequired: { type: 'boolean' } } } } },
    credentialSource: { apiKey: { envVar: 'HR_ASSESSMENT_API_KEY', configKey: 'assessment.apiKey' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['create-invitation', 'get-results', 'list-assessments', 'create-test', 'get-test', 'cancel-invitation'], description: 'Action to perform' }, candidateId: { type: 'string', description: 'Candidate ID' }, candidateEmail: { type: 'string', description: 'Candidate email' }, assessmentId: { type: 'string', description: 'Assessment ID' }, testId: { type: 'string', description: 'Test ID' }, testData: { type: 'object', description: 'Test data' }, invitationData: { type: 'object', description: 'Invitation data' }, filters: { type: 'object', description: 'Filters' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'hr-compliance',
    name: 'HR Compliance Checker',
    description: 'Verify hiring practices, job postings, and candidate data against compliance requirements (EEOC, GDPR, OFCCP, etc.).',
    system: 'compliance',
    action: 'check-compliance',
    endpoint: { envVar: 'HR_COMPLIANCE_ENDPOINT', method: 'POST' },
    auth: { type: 'api_key', header: 'X-API-Key', credentialEnvKeyMap: { apiKey: 'HR_COMPLIANCE_API_KEY' } },
    configSchema: { type: 'object', properties: { regulations: { type: 'array', items: { type: 'string', enum: ['EEOC', 'GDPR', 'OFCCP', 'ADA', 'FCRA', 'state-specific'] } }, autoFlag: { type: 'boolean' }, severityThreshold: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }, regulationLibrary: { type: 'array', items: { type: 'object' } }, auditTrail: { type: 'object', properties: { enabled: { type: 'boolean' }, retentionDays: { type: 'number' }, storageLocation: { type: 'string' }, exportFormat: { type: 'string', enum: ['json', 'csv', 'pdf', 'xml'] } } }, remediationTemplates: { type: 'array', items: { type: 'object' } }, jurisdictionRules: { type: 'array', items: { type: 'object' } } } },
    credentialSource: { apiKey: { envVar: 'HR_COMPLIANCE_API_KEY', configKey: 'compliance.apiKey' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['check-job-posting', 'check-candidate-data', 'check-hiring-decision', 'generate-report', 'get-audit-trail'], description: 'Action to perform' }, jobPostingId: { type: 'string', description: 'Job posting ID' }, jobPostingContent: { type: 'string', description: 'Job posting content' }, candidateId: { type: 'string', description: 'Candidate ID' }, candidateData: { type: 'object', description: 'Candidate data' }, decisionData: { type: 'object', description: 'Decision data' }, dateRange: { type: 'object', properties: { start: { type: 'string', description: 'Start date' }, end: { type: 'string', description: 'End date' } }, description: 'Date range' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'hr-calendar',
    name: 'Calendar Integration',
    description: 'Sync interviews, meetings, and HR events with external calendar systems (Google, Outlook, Calendly).',
    system: 'calendar',
    action: 'manage-events',
    endpoint: { envVar: 'HR_CALENDAR_ENDPOINT', method: 'POST' },
    auth: { type: 'bearer', credentialEnvKeyMap: { accessToken: 'HR_CALENDAR_ACCESS_TOKEN' } },
    configSchema: { type: 'object', properties: { provider: { type: 'string', enum: ['google', 'outlook', 'calendly', 'custom'] }, defaultCalendarId: { type: 'string' }, timezone: { type: 'string' }, reminders: { type: 'array', items: { type: 'object' } }, autoSync: { type: 'boolean' }, syncProviders: { type: 'array', items: { type: 'object' } }, conflictResolution: { type: 'object', properties: { strategy: { type: 'string', enum: ['auto-reschedule', 'notify-only', 'block', 'manual'] }, bufferMinutes: { type: 'number' }, priorityRules: { type: 'array', items: { type: 'object' } } } }, reminderTemplates: { type: 'array', items: { type: 'object' } }, timezoneHandling: { type: 'object', properties: { defaultTimezone: { type: 'string' }, convertToUTC: { type: 'boolean' }, participantTimezones: { type: 'boolean' }, displayFormat: { type: 'string', enum: ['local', 'utc', 'both'] } } } } },
    credentialSource: { accessToken: { envVar: 'HR_CALENDAR_ACCESS_TOKEN', configKey: 'calendar.accessToken', vaultSecretId: 'calendar-access-token' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['create-event', 'update-event', 'delete-event', 'get-event', 'list-events', 'check-availability', 'create-recurring'], description: 'Action to perform' }, eventId: { type: 'string', description: 'Event ID' }, eventData: { type: 'object', properties: { summary: { type: 'string', description: 'Event summary' }, description: { type: 'string', description: 'Event description' }, start: { type: 'string', description: 'Start time' }, end: { type: 'string', description: 'End time' }, attendees: { type: 'array', items: { type: 'string' }, description: 'Attendees' }, location: { type: 'string', description: 'Location' }, recurrence: { type: 'object', description: 'Recurrence rule' }, reminders: { type: 'array', items: { type: 'object' }, description: 'Reminders' } }, description: 'Event data' }, calendarId: { type: 'string', description: 'Calendar ID' }, timeRange: { type: 'object', properties: { start: { type: 'string', description: 'Start time' }, end: { type: 'string', description: 'End time' } }, description: 'Time range' }, filters: { type: 'object', description: 'Filters' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 30000,
  }),
];

export const hrSkills = [...HR_SKILLS, ...HR_EXTERNAL_SKILLS];
