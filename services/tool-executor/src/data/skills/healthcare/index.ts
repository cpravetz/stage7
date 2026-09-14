import { Tool } from '../../../types';
import { createExternalActionSkill } from '../code-skill-factory';

const HEALTHCARE_SKILLS: Tool[] = [
  {
    id: 'symptom-checker',
    name: 'Symptom Checker',
    description: 'Check symptoms and provide guidance. Always recommends consulting a medical professional.',
    type: 'code',
    manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const symptoms = input.symptoms || [];
const duration = input.duration || '';
const baseDir = process.env.HEALTHCARE_HOME || path.join('/tmp/healthcare');
const storePath = path.join(baseDir, 'checks.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
const check = { id: 'check_' + Date.now(), symptoms, duration, guidance: '', createdAt: new Date().toISOString(), source: 'local', disclaimer: 'This is not medical advice. Consult a qualified healthcare professional.' };
store.push(check);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
console.log(JSON.stringify({ success: true, data: { check, storePath } }));
` },
    inputSchema: { type: 'object', properties: { symptoms: { type: 'array', items: { type: 'string' }, description: 'List of symptoms to check' }, duration: { type: 'string', description: 'Duration of symptoms' } } },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, check: { type: 'object' }, storePath: { type: 'string' } } } as any,
    createdAt: new Date(), updatedAt: new Date(),
  },
];

const HEALTHCARE_EXTERNAL_SKILLS: Tool[] = [
  createExternalActionSkill({
    id: 'healthcare-medical-record',
    name: 'Healthcare Medical Record',
    description: 'Manage patient medical records including creation, retrieval, update, and secure access with HIPAA compliance.',
    system: 'healthcare',
    action: 'medical-record',
    endpoint: { envVar: 'HEALTHCARE_EHR_ENDPOINT', method: 'POST' },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: { token: 'HEALTHCARE_EHR_ACCESS_TOKEN' },
    },
    credentialSource: {
      token: { envVar: 'HEALTHCARE_EHR_ACCESS_TOKEN', configKey: 'ehr.token' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'EHR system base URL' },
        token: { type: 'string', description: 'EHR system bearer token' },
        provider: { type: 'string', enum: ['epic', 'cerner', 'allscripts', 'athenahealth', 'custom'] },
        defaultFacility: { type: 'string' },
        ehrModules: { type: 'array', description: 'Enabled EHR modules', items: { type: 'string', enum: ['clinical', 'billing', 'pharmacy', 'scheduling', 'lab', 'imaging', 'document', 'population-health'] } },
        interoperabilityConfig: { type: 'object', description: 'Interoperability settings', properties: { fhirVersion: { type: 'string' }, hl7Version: { type: 'string' }, enableCda: { type: 'boolean' }, enableFhir: { type: 'boolean' }, endpoints: { type: 'array', items: { type: 'string' } } } },
        auditConfig: { type: 'object', description: 'Audit logging configuration', properties: { enabled: { type: 'boolean' }, logLevel: { type: 'string', enum: ['minimal', 'standard', 'detailed'] }, retentionDays: { type: 'number' }, logAccess: { type: 'boolean' }, logModifications: { type: 'boolean' } } },
        consentManagement: { type: 'object', description: 'Patient consent management', properties: { enabled: { type: 'boolean' }, requireExplicitConsent: { type: 'boolean' }, consentTypes: { type: 'array', items: { type: 'string' } }, consentExpiryDays: { type: 'number' } } },
      },
      required: ['baseUrl', 'token'],
    },
    inputSchema: {
      type: 'object', properties: { operation: { type: 'string', description: 'The operation to perform', enum: ['create', 'read', 'update', 'search', 'list', 'archive'] }, patientId: { type: 'string', description: 'Patient identifier' }, recordType: { type: 'string', description: 'Type of medical record', enum: ['encounter', 'diagnosis', 'medication', 'allergy', 'immunization', 'procedure', 'vital', 'lab', 'imaging', 'note'] }, data: { type: 'object', description: 'Record data' }, filters: { type: 'object', description: 'Search filters' }, dateRange: { type: 'object', description: 'Date range for filtering', properties: { start: { type: 'string' }, end: { type: 'string' } } }, limit: { type: 'number', description: 'Maximum number of results' }, offset: { type: 'number', description: 'Result offset for pagination' }, dryRun: { type: 'boolean', description: 'Validate without executing' } },
      required: ['operation'],
    },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string', enum: ['dry-run', 'live', 'error'] }, system: { type: 'string' }, action: { type: 'string' }, request: { type: ['object', 'null'], properties: { input: { type: 'object' }, endpoint: { type: 'string' }, method: { type: 'string' }, headers: { type: 'object' } } }, response: { type: ['object', 'null'], properties: { status: { type: 'number' }, data: { type: ['object', 'string', 'null'] } } }, error: { type: ['string', 'null'] } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] } as any,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'healthcare-patient-communication',
    name: 'Healthcare Patient Communication',
    description: 'Send secure patient communications including appointment reminders, test results, care instructions, and portal messages.',
    system: 'healthcare',
    action: 'patient-communication',
    endpoint: { envVar: 'HEALTHCARE_COMMUNICATION_ENDPOINT', method: 'POST' },
    auth: {
      type: 'api_key',
      header: 'X-API-Key',
      credentialEnvKeyMap: { apiKey: 'HEALTHCARE_COMMUNICATION_API_KEY' },
    },
    credentialSource: {
      apiKey: { envVar: 'HEALTHCARE_COMMUNICATION_API_KEY', configKey: 'communication.apiKey' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Communication system base URL' },
        apiKey: { type: 'string', description: 'Communication system API key' },
        provider: { type: 'string', enum: ['twilio', 'sendgrid', 'mailgun', 'patient-portal', 'custom'] },
        defaultChannel: { type: 'string', enum: ['email', 'sms', 'portal', 'voice', 'fax'] },
        templateEngine: { type: 'object', description: 'Template engine configuration', properties: { engine: { type: 'string', enum: ['handlebars', 'nunjucks', 'mustache', 'custom'] }, defaultLocale: { type: 'string' }, supportedLocales: { type: 'array', items: { type: 'string' } }, variableDelimiter: { type: 'string' } } },
        deliveryTracking: { type: 'object', description: 'Delivery tracking settings', properties: { enabled: { type: 'boolean' }, trackOpens: { type: 'boolean' }, trackClicks: { type: 'boolean' }, trackDelivery: { type: 'boolean' }, webhookUrl: { type: 'string' } } },
        optOutManagement: { type: 'object', description: 'Opt-out handling configuration', properties: { enabled: { type: 'boolean' }, honorGlobalOptOut: { type: 'boolean' }, optOutKeywords: { type: 'array', items: { type: 'string' } }, gracePeriodDays: { type: 'number' } } },
        languageSupport: { type: 'object', description: 'Multi-language support', properties: { enabled: { type: 'boolean' }, defaultLanguage: { type: 'string' }, supportedLanguages: { type: 'array', items: { type: 'string' } }, autoTranslate: { type: 'boolean' }, translationProvider: { type: 'string' } } },
      },
      required: ['baseUrl', 'apiKey'],
    },
    inputSchema: {
      type: 'object', properties: { operation: { type: 'string', description: 'The operation to perform', enum: ['send', 'schedule', 'template', 'history', 'preferences', 'opt-out'] }, patientId: { type: 'string', description: 'Patient identifier' }, channel: { type: 'string', description: 'Communication channel', enum: ['email', 'sms', 'portal', 'voice', 'fax'] }, templateId: { type: 'string', description: 'Message template identifier' }, subject: { type: 'string', description: 'Message subject' }, message: { type: 'string', description: 'Message content' }, variables: { type: 'object', description: 'Template variables' }, scheduledAt: { type: 'string', description: 'Scheduled send time' }, priority: { type: 'string', description: 'Message priority', enum: ['routine', 'urgent', 'emergency'] }, dryRun: { type: 'boolean', description: 'Validate without executing' } },
      required: ['operation'],
    },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string', enum: ['dry-run', 'live', 'error'] }, system: { type: 'string' }, action: { type: 'string' }, request: { type: ['object', 'null'], properties: { input: { type: 'object' }, endpoint: { type: 'string' }, method: { type: 'string' }, headers: { type: 'object' } } }, response: { type: ['object', 'null'], properties: { status: { type: 'number' }, data: { type: ['object', 'string', 'null'] } } }, error: { type: ['string', 'null'] } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] } as any,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'healthcare-care-plan',
    name: 'Healthcare Care Plan',
    description: 'Create, manage, and track patient care plans including goals, interventions, outcomes, and team collaboration.',
    system: 'healthcare',
    action: 'care-plan',
    endpoint: { envVar: 'HEALTHCARE_CARE_PLAN_ENDPOINT', method: 'POST' },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: { token: 'HEALTHCARE_CARE_PLAN_ACCESS_TOKEN' },
    },
    credentialSource: {
      token: { envVar: 'HEALTHCARE_CARE_PLAN_ACCESS_TOKEN', configKey: 'careplan.token' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Care plan system base URL' },
        token: { type: 'string', description: 'Care plan system bearer token' },
        provider: { type: 'string', enum: ['epic', 'cerner', 'allscripts', 'custom'] },
        defaultTeam: { type: 'string' },
        templateLibrary: { type: 'object', description: 'Care plan template library', properties: { enabled: { type: 'boolean' }, templateCount: { type: 'number' }, categories: { type: 'array', items: { type: 'string' } }, autoApply: { type: 'boolean' } } },
        outcomeMeasures: { type: 'object', description: 'Outcome measurement configuration', properties: { enabled: { type: 'boolean' }, measures: { type: 'array', items: { type: 'string' } }, trackingFrequency: { type: 'string', enum: ['daily', 'weekly', 'monthly'] }, benchmarks: { type: 'object' } } },
        interdisciplinaryConfig: { type: 'object', description: 'Interdisciplinary team settings', properties: { enabled: { type: 'boolean' }, roles: { type: 'array', items: { type: 'string' } }, coordinationRules: { type: 'object' }, notificationPreferences: { type: 'object' } } },
        patientEngagement: { type: 'object', description: 'Patient engagement features', properties: { enabled: { type: 'boolean' }, portalAccess: { type: 'boolean' }, mobileAccess: { type: 'boolean' }, selfTracking: { type: 'boolean' }, progressVisibility: { type: 'boolean' } } },
      },
      required: ['baseUrl', 'token'],
    },
    inputSchema: {
      type: 'object', properties: { operation: { type: 'string', description: 'The operation to perform', enum: ['create', 'read', 'update', 'list', 'assign', 'review', 'close'] }, patientId: { type: 'string', description: 'Patient identifier' }, planId: { type: 'string', description: 'Care plan identifier' }, title: { type: 'string', description: 'Care plan title' }, description: { type: 'string', description: 'Care plan description' }, goals: { type: 'array', description: 'Care plan goals' }, interventions: { type: 'array', description: 'Care plan interventions' }, teamMembers: { type: 'array', description: 'Team member identifiers' }, startDate: { type: 'string', description: 'Care plan start date' }, endDate: { type: 'string', description: 'Care plan end date' }, status: { type: 'string', description: 'Care plan status', enum: ['draft', 'active', 'on-hold', 'completed', 'cancelled'] }, dryRun: { type: 'boolean', description: 'Validate without executing' } },
      required: ['operation'],
    },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string', enum: ['dry-run', 'live', 'error'] }, system: { type: 'string' }, action: { type: 'string' }, request: { type: ['object', 'null'], properties: { input: { type: 'object' }, endpoint: { type: 'string' }, method: { type: 'string' }, headers: { type: 'object' } } }, response: { type: ['object', 'null'], properties: { status: { type: 'number' }, data: { type: ['object', 'string', 'null'] } } }, error: { type: ['string', 'null'] } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] } as any,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'healthcare-appointment-scheduler',
    name: 'Healthcare Appointment Scheduler',
    description: 'Schedule, reschedule, cancel, and manage patient appointments with provider availability and conflict checking.',
    system: 'healthcare',
    action: 'appointment-scheduler',
    endpoint: { envVar: 'HEALTHCARE_SCHEDULER_ENDPOINT', method: 'POST' },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: { token: 'HEALTHCARE_SCHEDULER_ACCESS_TOKEN' },
    },
    credentialSource: {
      token: { envVar: 'HEALTHCARE_SCHEDULER_ACCESS_TOKEN', configKey: 'scheduler.token' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Scheduling system base URL' },
        token: { type: 'string', description: 'Scheduling system bearer token' },
        provider: { type: 'string', enum: ['epic', 'cerner', 'athenahealth', 'nextgen', 'custom'] },
        defaultTimezone: { type: 'string' },
        slotRules: { type: 'object', description: 'Appointment slot configuration', properties: { defaultDuration: { type: 'number' }, minDuration: { type: 'number' }, maxDuration: { type: 'number' }, slotInterval: { type: 'number' }, bufferBefore: { type: 'number' }, bufferAfter: { type: 'number' }, allowOverbooking: { type: 'boolean' } } },
        waitlistConfig: { type: 'object', description: 'Waitlist management', properties: { enabled: { type: 'boolean' }, autoPromote: { type: 'boolean' }, maxWaitlistSize: { type: 'number' }, notificationLeadTime: { type: 'number' }, waitlistExpiryHours: { type: 'number' } } },
        noShowPrediction: { type: 'object', description: 'No-show prediction model', properties: { enabled: { type: 'boolean' }, modelVersion: { type: 'string' }, riskThreshold: { type: 'number' }, factors: { type: 'array', items: { type: 'string' } } } },
        telehealthIntegration: { type: 'object', description: 'Telehealth integration settings', properties: { enabled: { type: 'boolean' }, providers: { type: 'array', items: { type: 'string' } }, defaultType: { type: 'string', enum: ['video', 'phone', 'async'] }, recordingEnabled: { type: 'boolean' }, consentRequired: { type: 'boolean' } } },
      },
      required: ['baseUrl', 'token'],
    },
    inputSchema: {
      type: 'object', properties: { operation: { type: 'string', description: 'The operation to perform', enum: ['schedule', 'reschedule', 'cancel', 'search', 'availability', 'waitlist', 'confirm'] }, patientId: { type: 'string', description: 'Patient identifier' }, providerId: { type: 'string', description: 'Provider identifier' }, facilityId: { type: 'string', description: 'Facility identifier' }, appointmentType: { type: 'string', description: 'Type of appointment' }, startTime: { type: 'string', description: 'Appointment start time' }, endTime: { type: 'string', description: 'Appointment end time' }, timezone: { type: 'string', description: 'Timezone' }, reason: { type: 'string', description: 'Reason for appointment' }, notes: { type: 'string', description: 'Appointment notes' }, recurrence: { type: 'object', description: 'Recurrence pattern' }, dryRun: { type: 'boolean', description: 'Validate without executing' } },
      required: ['operation'],
    },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string', enum: ['dry-run', 'live', 'error'] }, system: { type: 'string' }, action: { type: 'string' }, request: { type: ['object', 'null'], properties: { input: { type: 'object' }, endpoint: { type: 'string' }, method: { type: 'string' }, headers: { type: 'object' } } }, response: { type: ['object', 'null'], properties: { status: { type: 'number' }, data: { type: ['object', 'string', 'null'] } } }, error: { type: ['string', 'null'] } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] } as any,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'healthcare-schedule-optimizer',
    name: 'Healthcare Schedule Optimizer',
    description: 'Optimize provider schedules, reduce gaps, balance workload, and maximize resource utilization across facilities.',
    system: 'healthcare',
    action: 'schedule-optimizer',
    endpoint: { envVar: 'HEALTHCARE_OPTIMIZER_ENDPOINT', method: 'POST' },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: { token: 'HEALTHCARE_OPTIMIZER_ACCESS_TOKEN' },
    },
    credentialSource: {
      token: { envVar: 'HEALTHCARE_OPTIMIZER_ACCESS_TOKEN', configKey: 'optimizer.token' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Schedule optimizer base URL' },
        token: { type: 'string', description: 'Schedule optimizer bearer token' },
        provider: { type: 'string', enum: ['qgenda', 'amion', 'lightning-bolt', 'custom'] },
        optimizationMode: { type: 'string', enum: ['utilization', 'continuity', 'access', 'balanced'] },
        costModel: { type: 'object', description: 'Cost optimization model', properties: { enabled: { type: 'boolean' }, overtimeRate: { type: 'number' }, contractorRate: { type: 'number' }, travelCostPerMile: { type: 'number' }, facilityCostWeights: { type: 'object' } } },
        fairnessRules: { type: 'object', description: 'Provider fairness constraints', properties: { maxConsecutiveDays: { type: 'number' }, minRestHours: { type: 'number' }, maxWeeklyHours: { type: 'number' }, balanceLoad: { type: 'boolean' }, weekendRotation: { type: 'boolean' } } },
        skillMatching: { type: 'object', description: 'Provider skill matching', properties: { enabled: { type: 'boolean' }, requiredSkills: { type: 'array', items: { type: 'string' } }, certificationLevels: { type: 'array', items: { type: 'string' } }, crossTraining: { type: 'boolean' } } },
        patientPreferenceWeight: { type: 'object', description: 'Patient preference weighting', properties: { enabled: { type: 'boolean' }, providerWeight: { type: 'number' }, locationWeight: { type: 'number' }, waitTimeWeight: { type: 'number' }, continuityWeight: { type: 'number' } } },
      },
      required: ['baseUrl', 'token'],
    },
    inputSchema: {
      type: 'object', properties: { operation: { type: 'string', description: 'The operation to perform', enum: ['optimize', 'analyze', 'simulate', 'rebalance', 'predict', 'report'] }, providerIds: { type: 'array', description: 'Provider identifiers' }, facilityIds: { type: 'array', description: 'Facility identifiers' }, dateRange: { type: 'object', description: 'Date range for optimization', properties: { start: { type: 'string' }, end: { type: 'string' } } }, constraints: { type: 'object', description: 'Scheduling constraints' }, objectives: { type: 'array', description: 'Optimization objectives' }, scenarioId: { type: 'string', description: 'Scenario identifier' }, dryRun: { type: 'boolean', description: 'Validate without executing' } },
      required: ['operation'],
    },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string', enum: ['dry-run', 'live', 'error'] }, system: { type: 'string' }, action: { type: 'string' }, request: { type: ['object', 'null'], properties: { input: { type: 'object' }, endpoint: { type: 'string' }, method: { type: 'string' }, headers: { type: 'object' } } }, response: { type: ['object', 'null'], properties: { status: { type: 'number' }, data: { type: ['object', 'string', 'null'] } } }, error: { type: ['string', 'null'] } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] } as any,
    timeoutMs: 120000,
  }),
  createExternalActionSkill({
    id: 'healthcare-record-tagging',
    name: 'Healthcare Record Tagging',
    description: 'Apply, manage, and search clinical tags on patient records for categorization, coding, and analytics.',
    system: 'healthcare',
    action: 'record-tagging',
    endpoint: { envVar: 'HEALTHCARE_TAGGING_ENDPOINT', method: 'POST' },
    auth: {
      type: 'api_key',
      header: 'X-API-Key',
      credentialEnvKeyMap: { apiKey: 'HEALTHCARE_TAGGING_API_KEY' },
    },
    credentialSource: {
      apiKey: { envVar: 'HEALTHCARE_TAGGING_API_KEY', configKey: 'tagging.apiKey' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Tagging system base URL' },
        apiKey: { type: 'string', description: 'Tagging system API key' },
        provider: { type: 'string', enum: ['3m', 'optum', 'nthrive', 'custom'] },
        codingSystem: { type: 'string', enum: ['ICD-10', 'CPT', 'HCPCS', 'SNOMED', 'LOINC', 'custom'] },
        autoTaggingRules: { type: 'object', description: 'Automated tagging rules', properties: { enabled: { type: 'boolean' }, rules: { type: 'array', items: { type: 'object' } }, confidenceThreshold: { type: 'number' }, autoApply: { type: 'boolean' } } },
        codingGuidelines: { type: 'object', description: 'Coding compliance guidelines', properties: { enabled: { type: 'boolean' }, guidelines: { type: 'array', items: { type: 'string' } }, enforceCompliance: { type: 'boolean' }, updateFrequency: { type: 'string' } } },
        auditTrail: { type: 'object', description: 'Tag audit trail settings', properties: { enabled: { type: 'boolean' }, logAllChanges: { type: 'boolean' }, logConflicts: { type: 'boolean' }, retentionDays: { type: 'number' }, immutable: { type: 'boolean' } } },
        validationRules: { type: 'object', description: 'Tag validation rules', properties: { enabled: { type: 'boolean' }, rules: { type: 'array', items: { type: 'object' } }, strictMode: { type: 'boolean' }, rejectInvalid: { type: 'boolean' } } },
      },
      required: ['baseUrl', 'apiKey'],
    },
    inputSchema: {
      type: 'object', properties: { operation: { type: 'string', description: 'The operation to perform', enum: ['tag', 'untag', 'search', 'suggest', 'validate', 'bulk-tag', 'audit'] }, recordIds: { type: 'array', description: 'Record identifiers' }, tags: { type: 'array', description: 'Tags to apply' }, tagType: { type: 'string', description: 'Type of tag', enum: ['diagnosis', 'procedure', 'medication', 'social', 'quality', 'research', 'custom'] }, codingSystem: { type: 'string', description: 'Coding system' }, filters: { type: 'object', description: 'Search filters' }, confidence: { type: 'number', description: 'Minimum confidence threshold' }, dryRun: { type: 'boolean', description: 'Validate without executing' } },
      required: ['operation'],
    },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string', enum: ['dry-run', 'live', 'error'] }, system: { type: 'string' }, action: { type: 'string' }, request: { type: ['object', 'null'], properties: { input: { type: 'object' }, endpoint: { type: 'string' }, method: { type: 'string' }, headers: { type: 'object' } } }, response: { type: ['object', 'null'], properties: { status: { type: 'number' }, data: { type: ['object', 'string', 'null'] } } }, error: { type: ['string', 'null'] } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] } as any,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'healthcare-record-search',
    name: 'Healthcare Record Search',
    description: 'Advanced search across patient records with clinical filters, full-text search, and compliance-aware results.',
    system: 'healthcare',
    action: 'record-search',
    endpoint: { envVar: 'HEALTHCARE_SEARCH_ENDPOINT', method: 'POST' },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: { token: 'HEALTHCARE_SEARCH_ACCESS_TOKEN' },
    },
    credentialSource: {
      token: { envVar: 'HEALTHCARE_SEARCH_ACCESS_TOKEN', configKey: 'search.token' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Search system base URL' },
        token: { type: 'string', description: 'Search system bearer token' },
        provider: { type: 'string', enum: ['elasticsearch', 'solr', 'opensearch', 'custom'] },
        indexPrefix: { type: 'string' },
        searchAlgorithms: { type: 'object', description: 'Search algorithm configuration', properties: { enabled: { type: 'boolean' }, algorithm: { type: 'string', enum: ['bm25', 'tf-idf', 'vector', 'hybrid'] }, fuzzySearch: { type: 'boolean' }, semanticSearch: { type: 'boolean' }, rankingWeights: { type: 'object' } } },
        indexingConfig: { type: 'object', description: 'Indexing settings', properties: { enabled: { type: 'boolean' }, refreshInterval: { type: 'string' }, shardCount: { type: 'number' }, replicaCount: { type: 'number' }, compression: { type: 'boolean' }, retentionDays: { type: 'number' } } },
        accessControl: { type: 'object', description: 'Search access control', properties: { enabled: { type: 'boolean' }, rbacEnabled: { type: 'boolean' }, roleBasedFilters: { type: 'boolean' }, auditSearchAccess: { type: 'boolean' }, phiMasking: { type: 'boolean' } } },
        exportFormats: { type: 'object', description: 'Export format support', properties: { enabled: { type: 'boolean' }, formats: { type: 'array', items: { type: 'string', enum: ['json', 'csv', 'xml', 'pdf', 'fhir'] } }, maxExportSize: { type: 'number' }, streamingEnabled: { type: 'boolean' } } },
      },
      required: ['baseUrl', 'token'],
    },
    inputSchema: {
      type: 'object', properties: { operation: { type: 'string', description: 'The operation to perform', enum: ['search', 'aggregate', 'facet', 'export', 'saved-search', 'alert'] }, query: { type: 'string', description: 'Search query' }, filters: { type: 'object', description: 'Search filters' }, patientIds: { type: 'array', description: 'Patient identifiers' }, recordTypes: { type: 'array', description: 'Record types' }, dateRange: { type: 'object', description: 'Date range for filtering', properties: { start: { type: 'string' }, end: { type: 'string' } } }, sortBy: { type: 'string', description: 'Field to sort by' }, sortOrder: { type: 'string', description: 'Sort order', enum: ['asc', 'desc'] }, page: { type: 'number', description: 'Page number' }, pageSize: { type: 'number', description: 'Results per page' }, includePHI: { type: 'boolean', description: 'Include protected health information' }, savedSearchId: { type: 'string', description: 'Saved search identifier' }, dryRun: { type: 'boolean', description: 'Validate without executing' } },
      required: ['operation'],
    },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string', enum: ['dry-run', 'live', 'error'] }, system: { type: 'string' }, action: { type: 'string' }, request: { type: ['object', 'null'], properties: { input: { type: 'object' }, endpoint: { type: 'string' }, method: { type: 'string' }, headers: { type: 'object' } } }, response: { type: ['object', 'null'], properties: { status: { type: 'number' }, data: { type: ['object', 'string', 'null'] } } }, error: { type: ['string', 'null'] } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] } as any,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'healthcare-resource-coordinator',
    name: 'Healthcare Resource Coordinator',
    description: 'Coordinate beds, equipment, staff, and rooms across facilities with real-time availability and allocation tracking.',
    system: 'healthcare',
    action: 'resource-coordinator',
    endpoint: { envVar: 'HEALTHCARE_RESOURCE_ENDPOINT', method: 'POST' },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: { token: 'HEALTHCARE_RESOURCE_ACCESS_TOKEN' },
    },
    credentialSource: {
      token: { envVar: 'HEALTHCARE_RESOURCE_ACCESS_TOKEN', configKey: 'resource.token' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Resource management system base URL' },
        token: { type: 'string', description: 'Resource management bearer token' },
        provider: { type: 'string', enum: ['teletracking', 'central-logic', 'awarepoint', 'custom'] },
        defaultFacility: { type: 'string' },
        resourceCategories: { type: 'object', description: 'Resource category configuration', properties: { enabled: { type: 'boolean' }, categories: { type: 'array', items: { type: 'string', enum: ['bed', 'equipment', 'room', 'staff', 'device', 'supply', 'theater', 'parking'] } }, subcategories: { type: 'object' }, priorityRules: { type: 'object' } } },
        allocationRules: { type: 'object', description: 'Resource allocation rules', properties: { enabled: { type: 'boolean' }, rules: { type: 'array', items: { type: 'object' } }, autoAllocate: { type: 'boolean' }, conflictResolution: { type: 'string', enum: ['first-come', 'priority', 'clinical-need'] }, maxAllocationHours: { type: 'number' } } },
        forecastingModels: { type: 'object', description: 'Demand forecasting models', properties: { enabled: { type: 'boolean' }, models: { type: 'array', items: { type: 'string' } }, horizonDays: { type: 'number' }, confidenceLevel: { type: 'number' }, factors: { type: 'array', items: { type: 'string' } } } },
        utilizationTargets: { type: 'object', description: 'Utilization target thresholds', properties: { enabled: { type: 'boolean' }, bedTarget: { type: 'number' }, equipmentTarget: { type: 'number' }, roomTarget: { type: 'number' }, alertThreshold: { type: 'number' }, reportingFrequency: { type: 'string' } } },
      },
      required: ['baseUrl', 'token'],
    },
    inputSchema: {
      type: 'object', properties: { operation: { type: 'object', description: 'The operation to perform', properties: { type: { type: 'string', enum: ['allocate', 'release', 'transfer', 'status', 'forecast', 'request', 'approve'] } } }, resourceType: { type: 'string', description: 'Type of resource', enum: ['bed', 'equipment', 'room', 'staff', 'device', 'supply'] }, resourceId: { type: 'string', description: 'Resource identifier' }, facilityId: { type: 'string', description: 'Facility identifier' }, patientId: { type: 'string', description: 'Patient identifier' }, quantity: { type: 'number', description: 'Quantity' }, startTime: { type: 'string', description: 'Start time' }, endTime: { type: 'string', description: 'End time' }, priority: { type: 'string', description: 'Request priority', enum: ['routine', 'urgent', 'emergency'] }, attributes: { type: 'object', description: 'Resource attributes' }, dryRun: { type: 'boolean', description: 'Validate without executing' } },
      required: ['operation'],
    },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string', enum: ['dry-run', 'live', 'error'] }, system: { type: 'string' }, action: { type: 'string' }, request: { type: ['object', 'null'], properties: { input: { type: 'object' }, endpoint: { type: 'string' }, method: { type: 'string' }, headers: { type: 'object' } } }, response: { type: ['object', 'null'], properties: { status: { type: 'number' }, data: { type: ['object', 'string', 'null'] } } }, error: { type: ['string', 'null'] } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] } as any,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'healthcare-resource-matcher',
    name: 'Healthcare Resource Matcher',
    description: 'Match patients to optimal resources (providers, facilities, programs) based on clinical needs, insurance, and preferences.',
    system: 'healthcare',
    action: 'resource-matcher',
    endpoint: { envVar: 'HEALTHCARE_MATCHER_ENDPOINT', method: 'POST' },
    auth: {
      type: 'api_key',
      header: 'X-API-Key',
      credentialEnvKeyMap: { apiKey: 'HEALTHCARE_MATCHER_API_KEY' },
    },
    credentialSource: {
      apiKey: { envVar: 'HEALTHCARE_MATCHER_API_KEY', configKey: 'matcher.apiKey' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Resource matching system base URL' },
        apiKey: { type: 'string', description: 'Resource matching API key' },
        provider: { type: 'string', enum: ['referral-md', 'kyruus', 'doctor-com', 'custom'] },
        matchingAlgorithm: { type: 'string', enum: ['clinical-fit', 'access', 'cost', 'hybrid'] },
        matchingCriteria: { type: 'object', description: 'Matching criteria weights', properties: { enabled: { type: 'boolean' }, clinicalFitWeight: { type: 'number' }, insuranceWeight: { type: 'number' }, locationWeight: { type: 'number' }, availabilityWeight: { type: 'number' }, specialtyWeight: { type: 'number' }, waitTimeWeight: { type: 'number' } } },
        networkAdequacy: { type: 'object', description: 'Network adequacy monitoring', properties: { enabled: { type: 'boolean' }, checkInNetwork: { type: 'boolean' }, minProviderCount: { type: 'number' }, specialtyCoverage: { type: 'object' }, geographicCoverage: { type: 'object' }, reportingFrequency: { type: 'string' } } },
        patientScoring: { type: 'object', description: 'Patient scoring configuration', properties: { enabled: { type: 'boolean' }, scoreFactors: { type: 'array', items: { type: 'object' } }, complexityAdjustment: { type: 'boolean' }, riskAdjustment: { type: 'boolean' }, priorityTiering: { type: 'boolean' } } },
        referralTracking: { type: 'object', description: 'Referral tracking settings', properties: { enabled: { type: 'boolean' }, trackReferrals: { type: 'boolean' }, autoCreateReferral: { type: 'boolean' }, followUpRequired: { type: 'boolean' }, completionTracking: { type: 'boolean' }, webhookUrl: { type: 'string' } } },
      },
      required: ['baseUrl', 'apiKey'],
    },
    inputSchema: {
      type: 'object', properties: { operation: { type: 'string', description: 'The operation to perform', enum: ['match', 'rank', 'filter', 'refer', 'network', 'capacity'] }, patientId: { type: 'string', description: 'Patient identifier' }, clinicalNeeds: { type: 'array', description: 'Clinical needs' }, insurance: { type: 'object', description: 'Insurance information' }, preferences: { type: 'object', description: 'Patient preferences' }, location: { type: 'object', description: 'Location' }, specialty: { type: 'string', description: 'Medical specialty' }, urgency: { type: 'string', description: 'Request urgency', enum: ['routine', 'urgent', 'emergency'] }, maxResults: { type: 'number', description: 'Maximum results' }, dryRun: { type: 'boolean', description: 'Validate without executing' } },
      required: ['operation'],
    },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string', enum: ['dry-run', 'live', 'error'] }, system: { type: 'string' }, action: { type: 'string' }, request: { type: ['object', 'null'], properties: { input: { type: 'object' }, endpoint: { type: 'string' }, method: { type: 'string' }, headers: { type: 'object' } } }, response: { type: ['object', 'null'], properties: { status: { type: 'number' }, data: { type: ['object', 'string', 'null'] } } }, error: { type: ['string', 'null'] } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] } as any,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'healthcare-communication-scheduler',
    name: 'Healthcare Communication Scheduler',
    description: 'Schedule and automate recurring patient communications including reminders, follow-ups, and care plan check-ins.',
    system: 'healthcare',
    action: 'communication-scheduler',
    endpoint: { envVar: 'HEALTHCARE_COMM_SCHEDULER_ENDPOINT', method: 'POST' },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: { token: 'HEALTHCARE_COMM_SCHEDULER_ACCESS_TOKEN' },
    },
    credentialSource: {
      token: { envVar: 'HEALTHCARE_COMM_SCHEDULER_ACCESS_TOKEN', configKey: 'commscheduler.token' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Communication scheduler base URL' },
        token: { type: 'string', description: 'Communication scheduler bearer token' },
        provider: { type: 'string', enum: ['patient-io', 'wellpepper', 'custom'] },
        defaultTimezone: { type: 'string' },
        recurrenceEngine: { type: 'object', description: 'Recurrence scheduling engine', properties: { enabled: { type: 'boolean' }, patterns: { type: 'array', items: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'custom', 'event-based'] } }, maxRecurrences: { type: 'number' }, timezoneHandling: { type: 'string', enum: ['utc', 'patient-local', 'facility-local'] } } },
        conditionalLogic: { type: 'object', description: 'Conditional send logic', properties: { enabled: { type: 'boolean' }, rules: { type: 'array', items: { type: 'object' } }, evaluateOnCreate: { type: 'boolean' }, evaluateOnUpdate: { type: 'boolean' }, skipIfOptedOut: { type: 'boolean' } } },
        channelFailover: { type: 'object', description: 'Channel failover configuration', properties: { enabled: { type: 'boolean' }, primaryChannel: { type: 'string' }, fallbackChannels: { type: 'array', items: { type: 'string' } }, retryAttempts: { type: 'number' }, retryDelayHours: { type: 'number' }, escalateOnFailure: { type: 'boolean' } } },
        complianceTemplates: { type: 'object', description: 'HIPAA-compliant communication templates', properties: { enabled: { type: 'boolean' }, templates: { type: 'array', items: { type: 'object' } }, requirePhiNotice: { type: 'boolean' }, requireConsent: { type: 'boolean' }, retentionDays: { type: 'number' } } },
      },
      required: ['baseUrl', 'token'],
    },
    inputSchema: {
      type: 'object', properties: { operation: { type: 'string', description: 'The operation to perform', enum: ['create', 'update', 'cancel', 'list', 'pause', 'resume', 'history'] }, patientId: { type: 'string', description: 'Patient identifier' }, scheduleId: { type: 'string', description: 'Schedule identifier' }, templateId: { type: 'string', description: 'Message template identifier' }, channel: { type: 'string', description: 'Communication channel', enum: ['email', 'sms', 'portal', 'voice'] }, frequency: { type: 'string', description: 'Communication frequency', enum: ['once', 'daily', 'weekly', 'monthly', 'custom'] }, schedule: { type: 'object', description: 'Schedule configuration' }, conditions: { type: 'array', description: 'Scheduling conditions' }, startDate: { type: 'string', description: 'Schedule start date' }, endDate: { type: 'string', description: 'Schedule end date' }, dryRun: { type: 'boolean', description: 'Validate without executing' } },
      required: ['operation'],
    },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string', enum: ['dry-run', 'live', 'error'] }, system: { type: 'string' }, action: { type: 'string' }, request: { type: ['object', 'null'], properties: { input: { type: 'object' }, endpoint: { type: 'string' }, method: { type: 'string' }, headers: { type: 'object' } } }, response: { type: ['object', 'null'], properties: { status: { type: 'number' }, data: { type: ['object', 'string', 'null'] } } }, error: { type: ['string', 'null'] } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] } as any,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'healthcare-medical-risk-assessment',
    name: 'Healthcare Medical Risk Assessment',
    description: 'Calculate clinical risk scores, predict readmissions, identify high-risk patients, and generate risk stratification reports.',
    system: 'healthcare',
    action: 'medical-risk-assessment',
    endpoint: { envVar: 'HEALTHCARE_RISK_ENDPOINT', method: 'POST' },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: { token: 'HEALTHCARE_RISK_ACCESS_TOKEN' },
    },
    credentialSource: {
      token: { envVar: 'HEALTHCARE_RISK_ACCESS_TOKEN', configKey: 'risk.token' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Risk assessment system base URL' },
        token: { type: 'string', description: 'Risk assessment bearer token' },
        provider: { type: 'string', enum: ['epic', 'cerner', 'optum', 'change-healthcare', 'custom'] },
        modelVersion: { type: 'string' },
        modelRegistry: { type: 'object', description: 'Risk model registry', properties: { enabled: { type: 'boolean' }, models: { type: 'array', items: { type: 'object' } }, defaultModel: { type: 'string' }, modelVersioning: { type: 'boolean' }, registryUrl: { type: 'string' } } },
        calibrationConfig: { type: 'object', description: 'Model calibration settings', properties: { enabled: { type: 'boolean' }, method: { type: 'string', enum: ['platt', 'isotonic', 'beta-calibration'] }, calibrationInterval: { type: 'string' }, populationAdjustment: { type: 'boolean' } } },
        explanationMethods: { type: 'object', description: 'Model explanation configuration', properties: { enabled: { type: 'boolean' }, methods: { type: 'array', items: { type: 'string', enum: ['shap', 'lime', 'deep-lift', 'integrated-gradients'] } }, includeFeatureImportance: { type: 'boolean' }, generateNarrative: { type: 'boolean' }, detailLevel: { type: 'string', enum: ['summary', 'detailed', 'clinical'] } } },
        populationDefaults: { type: 'object', description: 'Population-level default parameters', properties: { enabled: { type: 'boolean' }, defaultsByPopulation: { type: 'object' }, ageAdjustment: { type: 'boolean' }, riskFactorWeights: { type: 'object' }, baselineRates: { type: 'object' } } },
      },
      required: ['baseUrl', 'token'],
    },
    inputSchema: {
      type: 'object', properties: { operation: { type: 'string', description: 'The operation to perform', enum: ['assess', 'stratify', 'predict', 'cohort', 'model', 'explain'] }, patientId: { type: 'string', description: 'Patient identifier' }, patientIds: { type: 'array', description: 'Patient identifiers' }, riskModels: { type: 'array', description: 'Risk models to apply' }, includeFactors: { type: 'boolean', description: 'Include risk factors' }, timeHorizon: { type: 'string', description: 'Prediction time horizon', enum: ['30-day', '90-day', '1-year', '5-year'] }, cohortFilters: { type: 'object', description: 'Cohort filters' }, dryRun: { type: 'boolean', description: 'Validate without executing' } },
      required: ['operation'],
    },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string', enum: ['dry-run', 'live', 'error'] }, system: { type: 'string' }, action: { type: 'string' }, request: { type: ['object', 'null'], properties: { input: { type: 'object' }, endpoint: { type: 'string' }, method: { type: 'string' }, headers: { type: 'object' } } }, response: { type: ['object', 'null'], properties: { status: { type: 'number' }, data: { type: ['object', 'string', 'null'] } } }, error: { type: ['string', 'null'] } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] } as any,
    timeoutMs: 120000,
  }),
  createExternalActionSkill({
    id: 'healthcare-analytics',
    name: 'Healthcare Analytics',
    description: 'Generate clinical, operational, and financial analytics dashboards with KPIs, trends, and regulatory reporting.',
    system: 'healthcare',
    action: 'analytics',
    endpoint: { envVar: 'HEALTHCARE_ANALYTICS_ENDPOINT', method: 'POST' },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: { token: 'HEALTHCARE_ANALYTICS_ACCESS_TOKEN' },
    },
    credentialSource: {
      token: { envVar: 'HEALTHCARE_ANALYTICS_ACCESS_TOKEN', configKey: 'analytics.token' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Analytics platform base URL' },
        token: { type: 'string', description: 'Analytics platform bearer token' },
        provider: { type: 'string', enum: ['tableau', 'powerbi', 'looker', 'custom'] },
        warehouse: { type: 'string', enum: ['snowflake', 'bigquery', 'redshift', 'databricks', 'custom'] },
        dataGovernance: { type: 'object', description: 'Data governance configuration', properties: { enabled: { type: 'boolean' }, classification: { type: 'object' }, phiHandling: { type: 'string', enum: ['mask', 'encrypt', 'exclude'] }, accessReview: { type: 'boolean' }, dataLineage: { type: 'boolean' }, retentionPolicy: { type: 'string' } } },
        kpiLibrary: { type: 'object', description: 'KPI library configuration', properties: { enabled: { type: 'boolean' }, kpis: { type: 'array', items: { type: 'object' } }, categories: { type: 'array', items: { type: 'string' } }, customKpis: { type: 'boolean' }, benchmarking: { type: 'boolean' } } },
        regulatoryReports: { type: 'object', description: 'Regulatory reporting settings', properties: { enabled: { type: 'boolean' }, reportTypes: { type: 'array', items: { type: 'string', enum: ['cms', 'medicare', 'medicaid', 'hipaa', 'quality', 'public-health'] } }, autoSubmission: { type: 'boolean' }, formatCompliance: { type: 'boolean' }, scheduleEnabled: { type: 'boolean' } } },
        selfServiceConfig: { type: 'object', description: 'Self-service analytics configuration', properties: { enabled: { type: 'boolean' }, allowCustomDashboards: { type: 'boolean' }, allowDataExport: { type: 'boolean' }, maxExportRows: { type: 'number' }, shareableLinks: { type: 'boolean' }, embedEnabled: { type: 'boolean' } } },
      },
      required: ['baseUrl', 'token'],
    },
    inputSchema: {
      type: 'object', properties: { operation: { type: 'string', description: 'The operation to perform', enum: ['dashboard', 'report', 'kpi', 'trend', 'cohort', 'export', 'schedule'] }, reportType: { type: 'string', description: 'Type of report', enum: ['clinical', 'operational', 'financial', 'quality', 'population', 'regulatory'] }, metrics: { type: 'array', description: 'Metrics to include' }, dimensions: { type: 'array', description: 'Dimensions to analyze' }, filters: { type: 'object', description: 'Analysis filters' }, dateRange: { type: 'object', description: 'Date range for analysis', properties: { start: { type: 'string' }, end: { type: 'string' } } }, granularity: { type: 'string', description: 'Time granularity', enum: ['day', 'week', 'month', 'quarter', 'year'] }, format: { type: 'string', description: 'Output format', enum: ['json', 'csv', 'pdf', 'excel'] }, scheduleId: { type: 'string', description: 'Schedule identifier' }, dryRun: { type: 'boolean', description: 'Validate without executing' } },
      required: ['operation'],
    },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string', enum: ['dry-run', 'live', 'error'] }, system: { type: 'string' }, action: { type: 'string' }, request: { type: ['object', 'null'], properties: { input: { type: 'object' }, endpoint: { type: 'string' }, method: { type: 'string' }, headers: { type: 'object' } } }, response: { type: ['object', 'null'], properties: { status: { type: 'number' }, data: { type: ['object', 'string', 'null'] } } }, error: { type: ['string', 'null'] } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] } as any,
    timeoutMs: 180000,
  }),
];

export const healthcareSkills = [...HEALTHCARE_SKILLS, ...HEALTHCARE_EXTERNAL_SKILLS];
