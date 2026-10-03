// @ts-nocheck

import { createExternalActionSkill } from '../../../adk/code-skill-factory';
import { EXTERNAL_OUTPUT_SCHEMA } from '../marketing-contract';

export const MARKETING_SOCIAL_MEDIA = createExternalActionSkill({
    triggers: [
      { kind: 'schedule', cadence: 'Scheduled social content publishing' },
    ],
    id: 'marketing-social-media',
    tier: 'represent',
    isSkill: false,
    name: 'Marketing Social Media',
    description: 'Create, schedule, publish, and monitor social posts across configurable social media platforms.',
    system: 'social',
    action: 'publish-social',
    manifest: { emitEvent: 'marketing.social_post.published' },
    endpoint: { configKey: 'MARKETING_SOCIAL_ENDPOINT', method: 'POST' },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: { token: 'MARKETING_SOCIAL_ACCESS_TOKEN' },
    },
    credentialSource: {
      token: { envVar: 'MARKETING_SOCIAL_ACCESS_TOKEN', configKey: 'social.token' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Social publishing system base URL' },
        token: { type: 'string', description: 'Social platform access token' },
        provider: { type: 'string', enum: ['linkedin', 'x', 'facebook', 'instagram', 'tiktok', 'custom'] },
        defaultAccount: { type: 'string' },
        platformConfigs: { type: 'object', description: 'Platform-specific configurations' },
        contentLibrary: { type: 'object', description: 'Content library configuration' },
        engagementRules: { type: 'array', items: { type: 'object' }, description: 'Engagement rules and policies' },
        analyticsIntegration: { type: 'object', description: 'Analytics integration settings' },
      },
      required: ['baseUrl', 'token'],
    },
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', description: 'Target social platform (e.g., linkedin, x, facebook, instagram, tiktok)' },
        content: { type: 'string', description: 'Post content/text' },
        message: { type: 'string', description: 'Alternative field for post content' },
        campaign: { type: 'string', description: 'Associated campaign identifier' },
        scheduledAt: { type: 'string', description: 'ISO timestamp for scheduled publishing' },
        media: { type: 'array', items: { type: 'object' }, description: 'Array of media attachments (images, videos)' },
        dryRun: { type: 'boolean', description: 'If true, simulate the operation without making changes' },
      },
      required: [],
    },
    outputSchema: EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  });
