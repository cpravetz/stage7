// @ts-nocheck
import { SchemaProps, createExternalActionSkill } from '../../../adk/code-skill-factory';
import { HEALTHCARE_EXTERNAL_OUTPUT_SCHEMA } from '../healthcare-contract';

export const RECORDS_SCHEDULING_OPS = createExternalActionSkill({
  id: 'healthcare-records-scheduling-ops',
  name: 'Records & Scheduling Ops',
  description: 'Manage medical records, apply tags, search records, schedule appointments, and optimize provider schedules through the healthcare records and scheduling system.',
  tier: 'represent',
  domainKnowledge: 'Medical records management, appointment scheduling, and provider schedule optimization',
  confirmBeforeSend: true,
  system: 'healthcare',
  action: 'records-scheduling',
  endpoint: { configKey: 'HEALTHCARE_OPS_ENDPOINT', method: 'POST' },
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
        patient: SchemaProps.text({ description: 'Select patient' }),
      recordType: SchemaProps.select(['encounter', 'diagnosis', 'medication', 'allergy', 'immunization', 'procedure', 'vital', 'lab', 'imaging', 'note'], { description: 'Type of medical record' }),
      data: SchemaProps.object({}, { description: 'Record data for create/update operations' }),
      tags: SchemaProps.stringArray({ description: 'Tags to apply or search for' }),
      tagType: SchemaProps.select(['diagnosis', 'procedure', 'medication', 'social', 'quality', 'research', 'custom'], { description: 'Type of tag' }),
      query: SchemaProps.text({ description: 'Search query string' }),
      filters: SchemaProps.object({}, { description: 'Search and filter criteria' }),
      dateRange: SchemaProps.object({ start: SchemaProps.text({ description: 'Start date' }), end: SchemaProps.text({ description: 'End date' }) }, { description: 'Date range for filtering' }),
      appointmentType: SchemaProps.text({ description: 'Type of appointment' }),
      provider: SchemaProps.text({ description: 'Provider identifier' }),
      facility: SchemaProps.text({ description: 'Facility identifier' }),
      startTime: SchemaProps.text({ description: 'Appointment start time' }),
      endTime: SchemaProps.text({ description: 'Appointment end time' }),
      optimizationMode: SchemaProps.select(['utilization', 'continuity', 'access', 'balanced'], { description: 'Schedule optimization objective' }),
      providers: SchemaProps.stringArray({ description: 'Provider identifiers for optimization' }),
      facilities: SchemaProps.stringArray({ description: 'Facility identifiers for optimization' }),
      limit: SchemaProps.integer({ description: 'Maximum number of results', default: 50 }),
      offset: SchemaProps.integer({ description: 'Result offset for pagination', default: 0 }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing', default: true }),
    },
    required: [],
  },
  outputSchema: HEALTHCARE_EXTERNAL_OUTPUT_SCHEMA,
  timeoutMs: 60000,
  triggers: [
    { kind: 'event', on: 'New appointment requested or record update' },
  ],
});
