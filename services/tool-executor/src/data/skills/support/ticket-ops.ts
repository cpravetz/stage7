import { Tool, SchemaRecord } from '../../../types';
import { createExternalActionSkill, SchemaProps } from '../code-skill-factory';

export const TICKET_OPS = createExternalActionSkill({
  id: 'ticket-ops',
  name: 'Ticket Ops',
  description: 'Manage CRM integration, ticket escalation, and customer follow-ups through external services. Confirmation required before sending; dry-run mode is default.',
  system: 'ticket-ops',
  action: 'execute',
  endpoint: { envVar: 'SUPPORT_OPS_ENDPOINT', method: 'POST' },
  auth: { type: 'api_key', header: 'X-API-Key', credentialEnvKeyMap: { apiKey: 'SUPPORT_OPS_API_KEY' } },
  configSchema: {
    type: 'object',
    properties: {
      confirmBeforeSend: SchemaProps.boolean({ description: 'Require explicit confirmation before sending mutating requests', default: true }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
      baseUrl: SchemaProps.text({ description: 'Service base URL' }),
      apiKey: SchemaProps.text({ description: 'API key for authentication' }),
      defaultPriority: SchemaProps.select(['low', 'medium', 'high', 'critical'], { description: 'Default ticket priority' }),
      rateLimitPerMinute: SchemaProps.number({ description: 'Rate limit per minute', default: 60 }),
    },
    required: ['baseUrl', 'apiKey'],
  },
  credentialSource: { apiKey: { envVar: 'SUPPORT_OPS_API_KEY', configKey: 'ops.apiKey' } },
  inputSchema: {
    type: 'object',
    properties: {
      operation: SchemaProps.select(['crm', 'escalation', 'follow-up'], { description: 'Ticket operation: crm for CRM sync, escalation for routing, follow-up for scheduling' }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing', default: true }),
      endpointUrl: SchemaProps.url({ description: 'Override endpoint URL' }),
      ticket: SchemaProps.text({ description: 'Ticket identifier' }),
      customer: SchemaProps.text({ description: 'Customer identifier' }),
      entity: SchemaProps.select(['ticket', 'customer', 'contact', 'account', 'interaction'], { description: 'CRM entity type' }),
      data: SchemaProps.object({}, { description: 'Data payload' }),
      filters: SchemaProps.object({}, { description: 'Filters for query operations' }),
      escalationLevel: SchemaProps.number({ description: 'Escalation level (1-5)', minimum: 1, maximum: 5 }),
      assignedTo: SchemaProps.text({ description: 'Person or team assigned' }),
      reason: SchemaProps.text({ description: 'Reason for escalation' }),
      slaBreach: SchemaProps.boolean({ description: 'Whether SLA has been breached' }),
      priority: SchemaProps.select(['low', 'medium', 'high', 'critical'], { description: 'Ticket priority level' }),
      followUpType: SchemaProps.select(['satisfaction', 'resolution_check', 'upsell', 'renewal', 'custom'], { description: 'Type of follow-up' }),
      schedule: SchemaProps.object({ at: SchemaProps.text({ description: 'Scheduled date and time' }), delay: SchemaProps.text({ description: 'Delay before sending' }), recurring: SchemaProps.boolean({ description: 'Whether the follow-up repeats' }) }, { description: 'Schedule configuration' }),
      channel: SchemaProps.select(['email', 'sms', 'in_app', 'phone', 'chat'], { description: 'Communication channel' }),
      template: SchemaProps.text({ description: 'Template for the follow-up message' }),
      customMessage: SchemaProps.text({ description: 'Custom follow-up message' }),
    },
    required: ['operation'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      mode: { type: 'string', enum: ['dry-run', 'live', 'error'] },
      system: { type: 'string' },
      action: { type: 'string' },
      operation: { type: 'string' },
      request: { type: ['object', 'null'] },
      response: { type: ['object', 'null'] },
      error: { type: ['string', 'null'] },
    },
    required: ['success', 'mode', 'system', 'action', 'operation', 'request', 'response', 'error'],
  },
  timeoutMs: 30000,
});

TICKET_OPS.confirmBeforeSend = true;
