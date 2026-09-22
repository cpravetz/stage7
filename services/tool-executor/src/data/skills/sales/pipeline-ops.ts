import { createExternalActionSkill, SchemaProps } from '../code-skill-factory';

const EXTERNAL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean', description: 'Whether the operation succeeded' },
    mode: { type: 'string', enum: ['dry-run', 'live', 'error'] },
    system: { type: 'string' },
    action: { type: 'string' },
    operation: { type: 'string' },
    request: {
      type: ['object', 'null'],
      properties: {
        input: { type: 'object' },
        endpoint: { type: 'string' },
        method: { type: 'string' },
        headers: { type: 'object' },
      },
    },
    response: {
      type: ['object', 'null'],
      properties: {
        status: { type: 'number' },
        data: { type: ['object', 'string', 'null'] },
      },
    },
    error: { type: ['string', 'null'] },
  },
  required: ['success', 'mode', 'system', 'action', 'operation', 'request', 'response', 'error'],
};

const PIPELINE_OPS = createExternalActionSkill({
  id: 'pipeline-ops',
  name: 'Pipeline Ops',
  description: 'Prepare CRM, calendar, and document-management requests for a configured sales endpoint. Without a configured endpoint, requests remain dry runs and no external system is changed.',
  system: 'pipeline-ops',
  action: 'execute',
  endpoint: { envVar: 'SALES_PIPELINE_ENDPOINT', method: 'POST' },
  auth: { type: 'api_key', header: 'X-API-Key', credentialEnvKeyMap: { apiKey: 'SALES_PIPELINE_API_KEY' } },
  configSchema: {
    type: 'object',
    properties: {
      confirmBeforeSend: SchemaProps.boolean({ description: 'Require explicit confirmation before sending mutating requests', default: true }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
      crmProvider: SchemaProps.select(['salesforce', 'hubspot', 'pipedrive', 'custom'], { description: 'Default CRM provider' }),
      calendarProvider: SchemaProps.select(['google', 'outlook', 'calendly', 'custom'], { description: 'Default calendar provider' }),
      documentProvider: SchemaProps.select(['pandadoc', 'proposify', 'quoter', 'custom'], { description: 'Default document management provider' }),
      defaultOwnerId: SchemaProps.text({ description: 'Default CRM owner ID for records' }),
      rateLimitPerMinute: SchemaProps.number({ description: 'Rate limit per minute', default: 60 }),
    },
  },
  credentialSource: { apiKey: { envVar: 'SALES_PIPELINE_API_KEY', configKey: 'pipeline.apiKey' } },
  inputSchema: {
    type: 'object',
    properties: {
      operation: SchemaProps.select(['crm', 'calendar', 'document-management'], { description: 'Pipeline operation domain: crm for CRM records, calendar for scheduling, document-management for proposals/docs' }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing', default: true }),

      entity: SchemaProps.select(['lead', 'contact', 'account', 'opportunity', 'activity', 'event', 'document'], { description: 'Entity type for the operation' }),
      entityId: SchemaProps.text({ description: 'Unique identifier of the entity' }),
      data: SchemaProps.object({}, { description: 'Data payload for create/update operations' }),
      filters: SchemaProps.object({}, { description: 'Filters for read/query operations' }),
      to: SchemaProps.stringArray({ description: 'Recipient email addresses (email/calendar)' }),
      subject: SchemaProps.text({ description: 'Email or document subject' }),
      htmlBody: SchemaProps.text({ description: 'HTML body content', multiline: true }),
      textBody: SchemaProps.text({ description: 'Plain text body content', multiline: true }),
      templateId: SchemaProps.text({ description: 'Pre-defined template identifier' }),
      templateData: SchemaProps.object({}, { description: 'Variables to populate the selected template' }),
      startTime: SchemaProps.datetime({ description: 'ISO 8601 start time for calendar events' }),
      endTime: SchemaProps.datetime({ description: 'ISO 8601 end time for calendar events' }),
      duration: SchemaProps.number({ description: 'Event duration in minutes' }),
      attendees: SchemaProps.stringArray({ description: 'Attendee email addresses' }),
      meetingType: SchemaProps.select(['discovery', 'demo', 'proposal', 'followup', 'negotiation'], { description: 'Type of sales meeting' }),
      lineItems: SchemaProps.objectArray(SchemaProps.object({ description: SchemaProps.text({ description: 'Line item description' }), quantity: SchemaProps.number({ description: 'Line item quantity' }), unitPrice: SchemaProps.number({ description: 'Line item unit price' }) }, { description: 'Line item for a proposal or quote' }), { description: 'Line items for proposals/quotes' }),
      totalAmount: SchemaProps.number({ description: 'Total amount for the document' }),
      validUntil: SchemaProps.datetime({ description: 'Expiration date for proposals (ISO 8601)' }),
      recipientEmails: SchemaProps.stringArray({ description: 'Email addresses to send the document to' }),
      leadId: SchemaProps.text({ description: 'Associated lead identifier' }),
      opportunityId: SchemaProps.text({ description: 'Associated opportunity identifier' }),
    },
    required: ['operation'],
  },
  outputSchema: EXTERNAL_OUTPUT_SCHEMA,
  triggers: [
    { kind: 'user', phrase_examples: ['Sync my CRM', 'Schedule a meeting', 'Send proposal'] },
    { kind: 'schedule', cadence: 'Daily CRM sync' },
    { kind: 'schedule', cadence: 'Daily meeting prep' },
    { kind: 'schedule', cadence: 'Weekly proposal pipeline review' },
    { kind: 'event', on: 'Record updated in CRM' },
    { kind: 'event', on: 'Meeting scheduled' },
    { kind: 'event', on: 'Proposal viewed' },
    { kind: 'event', on: 'Proposal signed' },
    { kind: 'event', on: 'Sync conflict detected' },
    { kind: 'event', on: 'Data quality below threshold' },
  ],
  timeoutMs: 30000,
});

PIPELINE_OPS.confirmBeforeSend = true;

export { PIPELINE_OPS };
