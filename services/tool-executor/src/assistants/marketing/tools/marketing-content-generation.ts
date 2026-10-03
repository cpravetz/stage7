// @ts-nocheck
import { createExternalActionSkill } from '../../../adk/code-skill-factory';
import { EXTERNAL_OUTPUT_SCHEMA } from '../marketing-contract';

export const MARKETING_CONTENT_GENERATION = createExternalActionSkill({
    triggers: [
      { kind: 'event', on: 'Content brief received for campaign asset creation' },
    ],
    id: 'marketing-content-generation',
    name: 'Marketing Content Generation',
    description: 'Create, revise, schedule, and publish campaign content through a configurable CMS or content platform.',
    system: 'cms',
    action: 'generate-content',
    // Writes campaign content into a connected CMS. The sibling channels
    // (social, email, document-management) all gate their live dispatch, so
    // this one must too.
    confirmBeforeSend: true,
    endpoint: { configKey: 'MARKETING_CMS_ENDPOINT', method: 'POST' },
    auth: {
      type: 'api_key',
      header: 'X-API-Key',
      credentialEnvKeyMap: { apiKey: 'MARKETING_CMS_API_KEY' },
    },
    credentialSource: {
      apiKey: { envVar: 'MARKETING_CMS_API_KEY', configKey: 'cms.apiKey' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'CMS base URL' },
        apiKey: { type: 'string', description: 'CMS API key' },
        provider: { type: 'string', enum: ['contentful', 'sanity', 'wordpress', 'custom'] },
        defaultLocale: { type: 'string' },
        contentModels: { type: 'array', items: { type: 'string' }, description: 'Available content models/fields' },
        brandGuidelines: { type: 'object', description: 'Brand guidelines configuration' },
        approvalWorkflow: { type: 'object', description: 'Content approval workflow configuration' },
        publishingCalendar: { type: 'string', description: 'Publishing calendar identifier' },
      },
      required: ['baseUrl', 'apiKey'],
    },
    inputSchema: {
      type: 'object',
      properties: {
        contentType: { type: 'string', description: 'Type of content (e.g., blog, landing-page, ad-copy, email)' },
        title: { type: 'string', description: 'Content title or headline' },
        body: { type: 'string', description: 'Full content body text' },
        content: { type: 'string', description: 'Alternative field for content body' },
        topic: { type: 'string', description: 'Main topic or subject of the content' },
        audience: { type: 'string', description: 'Target audience description' },
        tone: { type: 'string', description: 'Desired tone of voice (e.g., professional, casual, persuasive)' },
        locale: { type: 'string', description: 'Content locale/language code' },
        campaign: { type: 'string', description: 'Associated campaign identifier' },
        dryRun: { type: 'boolean', description: 'If true, simulate the operation without making changes' },
      },
      required: [],
    },
    outputSchema: EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  });
