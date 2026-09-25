import { createExternalActionSkill, SchemaProps } from '../code-skill-factory';

const EXTERNAL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    status: { type: 'string', enum: ['dry-run', 'live', 'error'] },
    system: { type: 'string' },
    action: { type: 'string' },
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
  required: ['success', 'status', 'system', 'action', 'request', 'response', 'error'],
};

const MULTI_CHANNEL_PUBLISHING = createExternalActionSkill({
  id: 'multi-channel-publishing',
  name: 'Multi-Channel Publishing',
  description: 'Publish, schedule, and manage content across social media, email, and document management systems. Confirmation required before sending; dry-run mode is default.',
  system: 'multi-channel-publishing',
  action: 'execute',
  endpoint: { envVar: 'MARKETING_PUBLISH_ENDPOINT', method: 'POST' },
  auth: { type: 'api_key', header: 'X-API-Key', credentialEnvKeyMap: { apiKey: 'MARKETING_PUBLISH_API_KEY' } },
  configSchema: {
    type: 'object',
    properties: {
      confirmBeforeSend: SchemaProps.boolean({ description: 'Require explicit confirmation before sending mutating requests', default: true }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
      baseUrl: SchemaProps.text({ description: 'Publishing system base URL' }),
      apiKey: SchemaProps.text({ description: 'Publishing system API key' }),
      socialProviders: SchemaProps.stringArray({ description: 'Connected social platforms' }),
      emailProviders: SchemaProps.stringArray({ description: 'Connected email providers' }),
      documentProviders: SchemaProps.stringArray({ description: 'Connected document management providers' }),
      defaultAudience: SchemaProps.text({ description: 'Default audience segment' }),
      rateLimitPerMinute: SchemaProps.number({ description: 'Rate limit per minute', default: 60 }),
    },
    required: ['baseUrl', 'apiKey'],
  },
  credentialSource: { apiKey: { envVar: 'MARKETING_PUBLISH_API_KEY', configKey: 'publishing.apiKey' } },
  inputSchema: {
    type: 'object',
    properties: {
      dryRun: SchemaProps.boolean({ description: 'Validate without executing', default: true }),
      content: SchemaProps.text({ description: 'Content text or body', multiline: true }),
      title: SchemaProps.text({ description: 'Content title' }),
      subject: SchemaProps.text({ description: 'Email subject line' }),
      recipients: SchemaProps.stringArray({ description: 'Recipient identifiers' }),
      platform: SchemaProps.select(['linkedin', 'x', 'facebook', 'instagram', 'tiktok', 'email', 'document'], { description: 'Target platform' }),
      scheduledAt: SchemaProps.datetime({ description: 'Scheduled publish time (ISO 8601)' }),
      media: SchemaProps.objectArray(SchemaProps.text({ description: 'Media item' }), { description: 'Media attachments' }),
      templateId: SchemaProps.text({ description: 'Template identifier' }),
      folderId: SchemaProps.text({ description: 'Document folder identifier' }),
      tags: SchemaProps.stringArray({ description: 'Content tags' }),
    },
    required: [],
  },
  outputSchema: EXTERNAL_OUTPUT_SCHEMA,
  timeoutMs: 60000,
  tier: 'represent',
  confirmBeforeSend: true,
  triggers: [
    { kind: 'user', phrase_examples: ['Publish content', 'Schedule post', 'Send email campaign', 'Post to social media'] }
  ],
});

export { MULTI_CHANNEL_PUBLISHING };
