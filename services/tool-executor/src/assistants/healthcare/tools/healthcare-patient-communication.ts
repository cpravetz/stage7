// @ts-nocheck
import { SchemaProps, createExternalActionSkill } from '../../../adk/code-skill-factory';
import { HEALTHCARE_EXTERNAL_OUTPUT_SCHEMA } from '../healthcare-contract';

export const PATIENT_COMMUNICATION = createExternalActionSkill({
  id: 'healthcare-patient-communication',
  name: 'Patient Communication',
  description: 'Send secure patient communications including appointment reminders, test results, care instructions, and manage recurring communication schedules.',
  tier: 'represent',
  domainKnowledge: 'Secure patient communication, appointment reminders, and care instructions',
  confirmBeforeSend: true,
  system: 'healthcare',
  action: 'patient-communication',
  endpoint: { configKey: 'HEALTHCARE_COMM_ENDPOINT', method: 'POST' },
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
        patient: SchemaProps.text({ description: 'Select patient' }),
      channel: SchemaProps.select(['email', 'sms', 'portal', 'voice', 'fax'], { description: 'Communication channel' }),
      templateId: SchemaProps.reference('healthcare-message-templates', { description: 'Message template identifier' }),
      subject: SchemaProps.text({ description: 'Message subject' }),
      message: SchemaProps.text({ description: 'Message content' }),
      variables: SchemaProps.object({}, { description: 'Template variables' }),
      scheduledAt: SchemaProps.text({ description: 'Scheduled send time (ISO 8601)' }),
      priority: SchemaProps.select(['routine', 'urgent', 'emergency'], { description: 'Message priority' }),
      scheduleId: SchemaProps.reference('healthcare-communication-schedules', { description: 'Communication schedule identifier' }),
      frequency: SchemaProps.select(['once', 'daily', 'weekly', 'monthly', 'custom'], { description: 'Communication frequency for scheduled messages' }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing', default: true }),
    },
    required: [],
  },
  outputSchema: HEALTHCARE_EXTERNAL_OUTPUT_SCHEMA,
  timeoutMs: 60000,
  triggers: [
    { kind: 'event', on: 'Patient message requested' },
  ],
});
