// @ts-nocheck
import { createExternalActionSkill } from '../../../adk/code-skill-factory';
import { EXTERNAL_OUTPUT_SCHEMA } from '../marketing-contract';

export const MARKETING_EMAIL = createExternalActionSkill({
    triggers: [
      { kind: 'event', on: 'Campaign content is ready to send' },
    ],
    id: 'marketing-email',
    name: 'Marketing Email',
    description: 'Draft, schedule, send, and measure marketing email campaigns through a configurable email system.',
    system: 'email',
    action: 'send-email',
    endpoint: { configKey: 'MARKETING_EMAIL_ENDPOINT', method: 'POST' },
    auth: {
      type: 'api_key',
      header: 'Authorization',
      credentialEnvKeyMap: { apiKey: 'MARKETING_EMAIL_API_KEY' },
    },
    credentialSource: {
      apiKey: { envVar: 'MARKETING_EMAIL_API_KEY', configKey: 'email.apiKey' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Email platform base URL' },
        apiKey: { type: 'string', description: 'Email platform API key' },
        provider: { type: 'string', enum: ['sendgrid', 'mailgun', 'ses', 'brevo', 'custom'] },
        fromAddress: { type: 'string' },
        templates: { type: 'object' },
        deliverabilityConfig: { type: 'object', description: 'Email deliverability configuration' },
        automationWorkflows: { type: 'array', items: { type: 'object' }, description: 'Email automation workflows' },
        abTestFramework: { type: 'object', description: 'A/B testing framework settings' },
        complianceRules: { type: 'array', items: { type: 'string' }, description: 'Email compliance rules (e.g., CAN-SPAM, GDPR)' },
      },
      required: ['baseUrl', 'apiKey'],
    },
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'array', items: { type: 'string' }, description: 'Recipient email addresses' },
        subject: { type: 'string', description: 'Email subject line' },
        htmlBody: { type: 'string', description: 'HTML email body content' },
        textBody: { type: 'string', description: 'Plain text email body content' },
        templateId: { type: 'string', description: 'Pre-defined email template identifier' },
        templateData: { type: 'object', description: 'Data variables for template rendering' },
        campaign: { type: 'string', description: 'Associated campaign identifier' },
        attachments: { type: 'array', items: { type: 'object' }, description: 'Email attachments metadata' },
        dryRun: { type: 'boolean', description: 'If true, simulate the operation without making changes' },
      },
      required: [],
    },
    outputSchema: EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  });
