import { Tool } from '../../../types';
import { createExternalActionSkill, createCodeSkill, SchemaProps } from '../code-skill-factory';

const CLINICAL_DECISION_SUPPORT = createCodeSkill({
  id: 'healthcare_clinical_decision_support',
  name: 'Clinical Decision Support',
  description:
    'Clinical reasoning assistant for healthcare professionals. Provides differential diagnosis suggestions, risk assessments, and care plan recommendations with heavy safety caveats. Always recommends consulting a qualified clinician. This tool does not replace clinical judgment.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const symptoms = input.symptoms || [];
const duration = input.duration || '';
const patientId = input.patientId || '';
const operation = input.operation || 'assess';
const clinicalContext = input.clinicalContext || '';
const patientHistory = input.patientHistory || [];
const medications = input.medications || [];
const allergies = input.allergies || [];
const vitalSigns = input.vitalSigns || {};
const riskFactors = input.riskFactors || [];

const baseDir = process.env.HEALTHCARE_HOME || path.join('/tmp/healthcare');
const cdsPath = path.join(baseDir, 'clinical', 'decisions.json');
fs.mkdirSync(baseDir, { recursive: true, mode: 0o700 });

const disclaimer = 'WARNING: This is a decision support tool only. It does not provide medical advice, diagnosis, or treatment. Always consult a qualified healthcare professional before making clinical decisions.';

let store = [];
if (fs.existsSync(cdsPath)) {
  try { store = JSON.parse(fs.readFileSync(cdsPath, 'utf8')); } catch(e) {}
}

function safeParseDate(d) {
  if (!d) return null;
  try { const dt = new Date(d); return isNaN(dt.getTime()) ? null : dt; } catch(e) { return null; }
}

function assessUrgency(symptoms, vitalSigns) {
  const criticalSigns = ['chest pain', 'shortness of breath', 'severe bleeding', 'loss of consciousness', 'stroke symptoms'];
  const hasCritical = symptoms.some(s => criticalSigns.some(c => s.toLowerCase().includes(c)));
  const bpSys = vitalSigns.bloodPressureSystolic || 0;
  const hr = vitalSigns.heartRate || 0;
  const temp = vitalSigns.temperature || 0;
  if (bpSys > 180 || bpSys < 80 || hr > 130 || hr < 40 || temp > 40 || temp < 35) return 'critical';
  if (hasCritical) return 'urgent';
  return 'routine';
}

const decision = {
  id: 'cds_' + Date.now(),
  operation, patientId, symptoms, duration, clinicalContext,
  patientHistory, medications, allergies, vitalSigns, riskFactors,
  urgency: assessUrgency(symptoms, vitalSigns),
  differentialDiagnoses: symptoms.length ? symptoms.map(s => ({
    symptom: s, possibleConditions: ['Requires clinical evaluation'],
    confidence: 0, caveat: 'Differential diagnosis requires professional clinical assessment.',
  })) : [],
  riskFlags: riskFactors.length ? riskFactors.map(r => ({ factor: r, level: 'requires-review' })) : [],
  recommendedActions: ['Consult qualified healthcare professional'],
  safetyCaveats: [disclaimer, 'This tool has limited sensitivity and specificity. Negative results do not rule out disease.'],
  createdAt: new Date().toISOString(),
  source: 'local',
};

store.push(decision);
fs.writeFileSync(cdsPath, JSON.stringify(store, null, 2));
  fs.chmodSync(cdsPath, 0o600);

const result = { success: true, data: { decision, storePath: cdsPath, warning: disclaimer } };
console.log(JSON.stringify(result));
`,
  },
  inputSchema: {
    type: 'object',
    properties: {
      operation: SchemaProps.select(['assess', 'risk', 'care-plan', 'triage'], { description: 'Clinical operation type: assess for symptom assessment, risk for risk scoring, care-plan for care planning, triage for urgency triage' }),
      symptoms: SchemaProps.stringArray({ description: 'List of patient symptoms (free text)' }),
      duration: SchemaProps.text({ description: 'Duration of symptoms (e.g., 3 days, 2 weeks)' }),
      patientId: SchemaProps.text({ description: 'Patient identifier' }),
      clinicalContext: SchemaProps.text({ description: 'Relevant clinical context, including chief complaint and history of present illness' }),
      patientHistory: SchemaProps.stringArray({ description: 'Relevant patient medical history items' }),
      medications: SchemaProps.stringArray({ description: 'Current medications (names/doses)' }),
      allergies: SchemaProps.stringArray({ description: 'Known patient allergies' }),
      vitalSigns: SchemaProps.object({
        bloodPressureSystolic: SchemaProps.integer({ description: 'Systolic blood pressure in mmHg' }),
        bloodPressureDiastolic: SchemaProps.integer({ description: 'Diastolic blood pressure in mmHg' }),
        heartRate: SchemaProps.integer({ description: 'Heart rate in BPM' }),
        temperature: SchemaProps.number({ description: 'Body temperature in Celsius' }),
        respiratoryRate: SchemaProps.integer({ description: 'Respiratory rate per minute' }),
        oxygenSaturation: SchemaProps.number({ description: 'Oxygen saturation percentage' }),
      }, { description: 'Current vital signs' }),
      riskFactors: SchemaProps.stringArray({ description: 'Patient risk factors (e.g., smoking, family history, diabetes)' }),
      reasoningDepth: SchemaProps.select(['brief', 'standard', 'comprehensive'], { description: 'Depth of clinical reasoning to perform' }),
      includeDifferential: SchemaProps.boolean({ description: 'Whether to include differential diagnosis suggestions', default: true }),
      includeRiskScore: SchemaProps.boolean({ description: 'Whether to include risk stratification scoring', default: true }),
    },
    required: ['operation', 'symptoms'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: {
        type: 'object',
        properties: {
          decision: { type: 'object' },
          storePath: { type: 'string' },
          warning: { type: 'string' },
        },
      },
      error: { type: 'string' },
    },
    required: ['success'],
  },
  triggers: [
    { kind: 'user', phrase_examples: ['Assess symptoms', 'Evaluate risk', 'Clinical decision support', 'What could this be'] },
    { kind: 'event', on: 'Abnormal lab result' },
    { kind: 'event', on: 'Patient reports new symptoms' },
  ],
});

const RECORDS_SCHEDULING_OPS = createExternalActionSkill({
  id: 'healthcare_records_scheduling_ops',
  name: 'Records & Scheduling Ops',
  description: 'Manage medical records, apply tags, search records, schedule appointments, and optimize provider schedules through the healthcare records and scheduling system.',
  system: 'healthcare',
  action: 'records-scheduling',
  endpoint: { envVar: 'HEALTHCARE_OPS_ENDPOINT', method: 'POST' },
  auth: {
    type: 'bearer',
    credentialEnvKeyMap: { token: 'HEALTHCARE_OPS_ACCESS_TOKEN' },
  },
  credentialSource: {
    token: { envVar: 'HEALTHCARE_OPS_ACCESS_TOKEN', configKey: 'ops.token' },
  },
  configSchema: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string', description: 'Healthcare operations system base URL' },
      token: { type: 'string', description: 'Healthcare operations system bearer token' },
      provider: { type: 'string', enum: ['epic', 'cerner', 'allscripts', 'athenahealth', 'custom'], description: 'System provider' },
      defaultFacility: { type: 'string', description: 'Default facility identifier' },
      defaultTimezone: { type: 'string', description: 'Default timezone for scheduling operations' },
      maxPageSize: { type: 'number', description: 'Maximum page size for list/search results', default: 50 },
      auditLogging: { type: 'boolean', description: 'Enable audit logging for all operations', default: true },
    },
    required: ['baseUrl', 'token'],
  },
  inputSchema: {
    type: 'object',
    properties: {
      operation: SchemaProps.select(['medical-record', 'record-tagging', 'record-search', 'appointment-scheduler', 'schedule-optimizer'], { description: 'The operation to perform across records and scheduling subsystems' }),
      patientId: SchemaProps.text({ description: 'Patient identifier' }),
      recordType: SchemaProps.select(['encounter', 'diagnosis', 'medication', 'allergy', 'immunization', 'procedure', 'vital', 'lab', 'imaging', 'note'], { description: 'Type of medical record' }),
      data: SchemaProps.object({}, { description: 'Record data for create/update operations' }),
      tags: SchemaProps.stringArray({ description: 'Tags to apply or search for' }),
      tagType: SchemaProps.select(['diagnosis', 'procedure', 'medication', 'social', 'quality', 'research', 'custom'], { description: 'Type of tag' }),
      query: SchemaProps.text({ description: 'Search query string' }),
      filters: SchemaProps.object({}, { description: 'Search and filter criteria' }),
      dateRange: SchemaProps.object({ start: SchemaProps.text({ description: 'Start date' }), end: SchemaProps.text({ description: 'End date' }) }, { description: 'Date range for filtering' }),
      appointmentType: SchemaProps.text({ description: 'Type of appointment' }),
      providerId: SchemaProps.text({ description: 'Provider identifier' }),
      facilityId: SchemaProps.text({ description: 'Facility identifier' }),
      startTime: SchemaProps.text({ description: 'Appointment start time' }),
      endTime: SchemaProps.text({ description: 'Appointment end time' }),
      optimizationMode: SchemaProps.select(['utilization', 'continuity', 'access', 'balanced'], { description: 'Schedule optimization objective' }),
      providerIds: SchemaProps.stringArray({ description: 'Provider identifiers for optimization' }),
      facilityIds: SchemaProps.stringArray({ description: 'Facility identifiers for optimization' }),
      limit: SchemaProps.integer({ description: 'Maximum number of results', default: 50 }),
      offset: SchemaProps.integer({ description: 'Result offset for pagination', default: 0 }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing', default: true }),
    },
    required: ['operation'],
  },
  outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string', enum: ['dry-run', 'live', 'error'] }, system: { type: 'string' }, action: { type: 'string' }, request: { type: ['object', 'null'], properties: { input: { type: 'object' }, endpoint: { type: 'string' }, method: { type: 'string' }, headers: { type: 'object' } } }, response: { type: ['object', 'null'], properties: { status: { type: 'number' }, data: { type: ['object', 'string', 'null'] } } }, error: { type: ['string', 'null'] } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] } as any,
  timeoutMs: 60000,
  triggers: [
    { kind: 'user', phrase_examples: ['Create medical record', 'Search patient records', 'Schedule appointment', 'Optimize schedule', 'Tag record'] },
    { kind: 'schedule', cadence: 'Daily record sync' },
    { kind: 'schedule', cadence: 'Weekly scheduling review' },
  ],
});

const PATIENT_COMMUNICATION = createExternalActionSkill({
  id: 'healthcare_patient_communication',
  name: 'Patient Communication',
  description: 'Send secure patient communications including appointment reminders, test results, care instructions, and manage recurring communication schedules.',
  system: 'healthcare',
  action: 'patient-communication',
  endpoint: { envVar: 'HEALTHCARE_COMM_ENDPOINT', method: 'POST' },
  auth: {
    type: 'api_key',
    header: 'X-API-Key',
    credentialEnvKeyMap: { apiKey: 'HEALTHCARE_COMM_API_KEY' },
  },
  credentialSource: {
    apiKey: { envVar: 'HEALTHCARE_COMM_API_KEY', configKey: 'communication.apiKey' },
  },
  configSchema: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string', description: 'Communication system base URL' },
      apiKey: { type: 'string', description: 'Communication system API key' },
      provider: { type: 'string', enum: ['twilio', 'sendgrid', 'mailgun', 'patient-portal', 'custom'], description: 'Communication provider' },
      defaultChannel: { type: 'string', enum: ['email', 'sms', 'portal', 'voice'], description: 'Default communication channel' },
      templateEngine: { type: 'string', enum: ['handlebars', 'nunjucks', 'mustache', 'custom'], description: 'Template engine' },
      deliveryTracking: { type: 'boolean', description: 'Enable delivery tracking' },
      optOutManagement: { type: 'boolean', description: 'Enable opt-out management' },
      languageSupport: { type: 'boolean', description: 'Enable multi-language support' },
    },
    required: ['baseUrl', 'apiKey'],
  },
  inputSchema: {
    type: 'object',
    properties: {
      operation: SchemaProps.select(['send', 'schedule', 'template', 'history', 'preferences', 'opt-out'], { description: 'Communication operation: send for direct messages, schedule for recurring, template for template ops, history for past messages, preferences for settings, opt-out for opt-out management' }),
      patientId: SchemaProps.text({ description: 'Patient identifier' }),
      channel: SchemaProps.select(['email', 'sms', 'portal', 'voice', 'fax'], { description: 'Communication channel' }),
      templateId: SchemaProps.text({ description: 'Message template identifier' }),
      subject: SchemaProps.text({ description: 'Message subject' }),
      message: SchemaProps.text({ description: 'Message content' }),
      variables: SchemaProps.object({}, { description: 'Template variables' }),
      scheduledAt: SchemaProps.text({ description: 'Scheduled send time (ISO 8601)' }),
      priority: SchemaProps.select(['routine', 'urgent', 'emergency'], { description: 'Message priority' }),
      scheduleId: SchemaProps.text({ description: 'Communication schedule identifier' }),
      frequency: SchemaProps.select(['once', 'daily', 'weekly', 'monthly', 'custom'], { description: 'Communication frequency for scheduled messages' }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing', default: true }),
    },
    required: ['operation'],
  },
  outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string', enum: ['dry-run', 'live', 'error'] }, system: { type: 'string' }, action: { type: 'string' }, request: { type: ['object', 'null'], properties: { input: { type: 'object' }, endpoint: { type: 'string' }, method: { type: 'string' }, headers: { type: 'object' } } }, response: { type: ['object', 'null'], properties: { status: { type: 'number' }, data: { type: ['object', 'string', 'null'] } } }, error: { type: ['string', 'null'] } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] } as any,
  timeoutMs: 60000,
  triggers: [
    { kind: 'user', phrase_examples: ['Send patient message', 'Schedule reminder', 'Check communication status'] },
    { kind: 'schedule', cadence: 'Daily reminder queue' },
    { kind: 'event', on: 'Appointment confirmed' },
    { kind: 'event', on: 'Patient replied' },
  ],
});

const RESOURCE_COORDINATION = createExternalActionSkill({
  id: 'healthcare_resource_coordination',
  name: 'Resource Coordination',
  description: 'Coordinate beds, equipment, staff, and rooms across facilities, and match patients to optimal resources based on clinical needs, insurance, and preferences.',
  system: 'healthcare',
  action: 'resource-coordination',
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
      provider: { type: 'string', enum: ['teletracking', 'central-logic', 'awarepoint', 'referral-md', 'kyruus', 'custom'], description: 'System provider' },
      defaultFacility: { type: 'string', description: 'Default facility identifier' },
      enableMatching: { type: 'boolean', description: 'Enable patient-resource matching algorithms' },
      enableForecasting: { type: 'boolean', description: 'Enable demand forecasting' },
      maxAllocationHours: { type: 'number', description: 'Maximum allocation duration in hours', default: 24 },
    },
    required: ['baseUrl', 'token'],
  },
  inputSchema: {
    type: 'object',
    properties: {
      operation: SchemaProps.select(['allocate', 'release', 'transfer', 'status', 'forecast', 'request', 'approve', 'match', 'rank', 'filter', 'refer', 'network', 'capacity'], { description: 'Operation type: allocate/release/transfer/status/forecast for resource ops, match/rank/filter/refer/network/capacity for patient-resource matching' }),
      resourceType: SchemaProps.select(['bed', 'equipment', 'room', 'staff', 'device', 'supply'], { description: 'Type of resource' }),
      resourceId: SchemaProps.text({ description: 'Resource identifier' }),
      facilityId: SchemaProps.text({ description: 'Facility identifier' }),
      patientId: SchemaProps.text({ description: 'Patient identifier' }),
      quantity: SchemaProps.integer({ description: 'Quantity to allocate' }),
      startTime: SchemaProps.text({ description: 'Start time (ISO 8601)' }),
      endTime: SchemaProps.text({ description: 'End time (ISO 8601)' }),
      priority: SchemaProps.select(['routine', 'urgent', 'emergency'], { description: 'Request priority' }),
      clinicalNeeds: SchemaProps.stringArray({ description: 'Patient clinical needs for matching' }),
      insurance: SchemaProps.object({}, { description: 'Insurance information for matching' }),
      preferences: SchemaProps.object({}, { description: 'Patient preferences' }),
      specialty: SchemaProps.text({ description: 'Medical specialty for matching' }),
      urgency: SchemaProps.select(['routine', 'urgent', 'emergency'], { description: 'Matching urgency' }),
      maxResults: SchemaProps.integer({ description: 'Maximum results to return', default: 10 }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing', default: true }),
    },
    required: ['operation'],
  },
  outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string', enum: ['dry-run', 'live', 'error'] }, system: { type: 'string' }, action: { type: 'string' }, request: { type: ['object', 'null'], properties: { input: { type: 'object' }, endpoint: { type: 'string' }, method: { type: 'string' }, headers: { type: 'object' } } }, response: { type: ['object', 'null'], properties: { status: { type: 'number' }, data: { type: ['object', 'string', 'null'] } } }, error: { type: ['string', 'null'] } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] } as any,
  timeoutMs: 60000,
  triggers: [
    { kind: 'user', phrase_examples: ['Allocate resource', 'Check bed availability', 'Match patient to provider', 'Find available care'] },
    { kind: 'schedule', cadence: 'Hourly capacity review' },
    { kind: 'event', on: 'Resource requested' },
    { kind: 'event', on: 'Match accepted' },
  ],
});

const OPERATIONAL_ANALYTICS = createCodeSkill({
  id: 'healthcare_operational_analytics',
  name: 'Operational Analytics',
  description:
    'Generate healthcare operational analytics including clinical KPIs, throughput metrics, resource utilization, and financial summaries. Computes insights locally with reasoning over available data and can reference the healthcare analytics platform for deeper reporting.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const operation = input.operation || 'dashboard';
const reportType = input.reportType || 'operational';
const metric = input.metric || '';
const period = input.period || '30d';
const dateRange = input.dateRange || {};
const granularity = input.granularity || 'day';
const facilityId = input.facilityId || '';
const providerId = input.providerId || '';
const filterCriteria = input.filterCriteria || {};

const baseDir = process.env.HEALTHCARE_HOME || path.join('/tmp/healthcare');
const analyticsPath = path.join(baseDir, 'analytics', 'analytics.json');
fs.mkdirSync(baseDir, { recursive: true, mode: 0o700 });

let analyticsData = { records: [], kpis: {}, metrics: [] };
if (fs.existsSync(analyticsPath)) {
  try { analyticsData = JSON.parse(fs.readFileSync(analyticsPath, 'utf8')); } catch(e) {}
}

const records = analyticsData.records || [];

function sliceData(pd, dataArray) {
  const now = new Date();
  let startDate;
  if (pd === '7d') { startDate = new Date(now); startDate.setDate(now.getDate() - 6); }
  else if (pd === '30d') { startDate = new Date(now); startDate.setDate(now.getDate() - 29); }
  else if (pd === '90d') { startDate = new Date(now); startDate.setDate(now.getDate() - 89); }
  else if (pd === 'YTD') { startDate = new Date(now.getFullYear(), 0, 1); }
  else if (pd === '1y') { startDate = new Date(now); startDate.setFullYear(now.getFullYear() - 1); }
  else { startDate = new Date(now); startDate.setDate(now.getDate() - 29); }
  return dataArray.filter(d => { const dd = new Date(d.date); return dd >= startDate; });
}

function computeKPIs(data) {
  if (!data.length) return {};
  const nums = data.map(d => d.value).filter(v => typeof v === 'number');
  const sum = nums.reduce((a, b) => a + b, 0);
  const avg = nums.length ? sum / nums.length : 0;
  return {
    total: sum, average: Math.round(avg * 100) / 100, count: nums.length,
    min: Math.min(...nums), max: Math.max(...nums),
    trend: nums.length > 1 ? ((nums[nums.length - 1] - nums[0]) / Math.abs(nums[0] || 1)) * 100 : 0,
  };
}

let result;
if (operation === 'dashboard') {
  const slice = sliceData(period, records);
  const kpis = {
    patientVolume: computeKPIs(slice.filter(d => d.type === 'volume')),
    averageLengthOfStay: computeKPIs(slice.filter(d => d.type === 'los')),
    bedOccupancy: computeKPIs(slice.filter(d => d.type === 'occupancy')),
    throughput: computeKPIs(slice.filter(d => d.type === 'throughput')),
  };
  result = { success: true, data: { type: 'dashboard', reportType, period, granularity, kpis, recordCount: slice.length, source: 'local', note: 'For deeper analytics use the Healthcare Analytics platform.' } };
} else if (operation === 'report') {
  const slice = sliceData(period, records);
  const filtered = Object.keys(filterCriteria).length ? slice.filter(d => Object.entries(filterCriteria).every(([k, v]) => d[k] === v)) : slice;
  const kpis = computeKPIs(filtered);
  result = { success: true, data: { type: 'report', reportType, period, granularity, filters: filterCriteria, kpis, recordCount: filtered.length, source: 'local' } };
} else if (operation === 'kpi') {
  const filtered = Object.keys(filterCriteria).length ? records.filter(d => Object.entries(filterCriteria).every(([k, v]) => d[k] === v)) : records;
  const kpis = computeKPIs(filtered);
  result = { success: true, data: { type: 'kpi', metric, kpis, recordCount: filtered.length, source: 'local' } };
} else if (operation === 'trend') {
  const slice = sliceData(period, records);
  const values = slice.map(d => d.value).filter(v => typeof v === 'number');
  const trend = values.length > 1 ? (values[values.length - 1] - values[0]) / Math.abs(values[0] || 1) : 0;
  result = { success: true, data: { type: 'trend', metric, period, trend, direction: trend > 0.1 ? 'increasing' : trend < -0.1 ? 'decreasing' : 'stable', dataPoints: values.length, source: 'local' } };
} else if (operation === 'export') {
  const slice = sliceData(period, records);
  result = { success: true, data: { type: 'export', recordCount: slice.length, exportPath: analyticsPath, source: 'local' } };
} else {
  result = { success: false, error: 'Unknown operation: ' + operation };
}

console.log(JSON.stringify(result));
`,
  },
  inputSchema: {
    type: 'object',
    properties: {
      operation: SchemaProps.select(['dashboard', 'report', 'kpi', 'trend', 'cohort', 'export', 'schedule'], { description: 'Analytics operation: dashboard for overview, report for detailed, kpi for single metric, trend for trend analysis, cohort for group analysis, export for data export' }),
      reportType: SchemaProps.select(['clinical', 'operational', 'financial', 'quality', 'population'], { description: 'Report category type' }),
      metric: SchemaProps.text({ description: 'Metric name to analyze (e.g., patient_volume, avg_length_of_stay, bed_occupancy)' }),
      period: SchemaProps.select(['7d', '30d', '90d', 'YTD', '1y'], { description: 'Time period for analysis', default: '30d' }),
      dateRange: SchemaProps.object({ start: SchemaProps.text({ description: 'Start date (ISO 8601)' }), end: SchemaProps.text({ description: 'End date (ISO 8601)' }) }, { description: 'Custom date range for analysis' }),
      facilityId: SchemaProps.text({ description: 'Facility identifier for filtering' }),
      providerId: SchemaProps.text({ description: 'Provider identifier for filtering' }),
      filterCriteria: SchemaProps.object({}, { description: 'Additional filter criteria as key-value pairs' }),
      granularity: SchemaProps.select(['day', 'week', 'month', 'quarter'], { description: 'Time granularity for aggregation', default: 'day' }),
      format: SchemaProps.select(['json', 'csv', 'pdf'], { description: 'Output format for export' }),
    },
    required: ['operation'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          reportType: { type: 'string' },
          period: { type: 'string' },
          granularity: { type: 'string' },
          kpis: { type: 'object' },
          trend: { type: 'object' },
          recordCount: { type: 'number' },
          source: { type: 'string' },
          exportPath: { type: 'string' },
          note: { type: 'string' },
        },
      },
      error: { type: 'string' },
    },
    required: ['success'],
  },
  triggers: [
    { kind: 'user', phrase_examples: ['Generate analytics dashboard', 'Check KPIs', 'Analyze trends', 'Operational report'] },
    { kind: 'schedule', cadence: 'Daily metrics digest' },
    { kind: 'schedule', cadence: 'Weekly KPI review' },
    { kind: 'event', on: 'KPI threshold crossed' },
    { kind: 'event', on: 'Data source updated' },
  ],
});
import { healthcareClinicalPracticeWorkflowEvaluator } from './healthcare-clinical-practice-workflow-evaluator';
import { healthcareClinicalDecisionSupportEvaluator } from './healthcare-clinical-decision-support-evaluator';
import { healthcarePatientCarePlanEducationalBriefingCopilot } from './healthcare-patient-care-plan-educational-briefing-copilot';
import { APPOINTMENT_PATIENT_INTAKE_DISPATCHER as healthcareAppointmentPatientIntakeDispatcher } from './healthcare-appointment-patient-intake-dispatcher';
import { careResourceReferralCoordinator } from './care-resource-referral-coordinator';

export const healthcareSkills: Tool[] = [
  { ...CLINICAL_DECISION_SUPPORT, isSkill: false },
  { ...RECORDS_SCHEDULING_OPS, isSkill: false },
  { ...PATIENT_COMMUNICATION, isSkill: false },
  { ...RESOURCE_COORDINATION, isSkill: false },
  { ...OPERATIONAL_ANALYTICS, isSkill: false },
  { ...healthcareClinicalPracticeWorkflowEvaluator, isSkill: true },
  { ...healthcareClinicalDecisionSupportEvaluator, isSkill: true },
  { ...healthcarePatientCarePlanEducationalBriefingCopilot, isSkill: true },
  { ...healthcareAppointmentPatientIntakeDispatcher, isSkill: true },
  { ...careResourceReferralCoordinator, isSkill: true },
];

export const healthcareCanonicalSkills: Tool[] = [
  healthcareClinicalPracticeWorkflowEvaluator,
  healthcareClinicalDecisionSupportEvaluator,
  healthcarePatientCarePlanEducationalBriefingCopilot,
  healthcareAppointmentPatientIntakeDispatcher,
  careResourceReferralCoordinator,
];
