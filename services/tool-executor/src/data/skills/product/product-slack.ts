// @ts-nocheck
import { createExternalActionSkill } from '../code-skill-factory';

export const PRODUCT_SLACK = createExternalActionSkill({
    id: 'product-slack',
    name: 'Slack Integration',
    description: 'Send messages, create channels, and interact with Slack. Uses configurable Slack workspace with endpoint and auth.',
    system: 'slack',
    action: 'send_message',
    endpoint: {
      method: 'POST',
      configKey: 'baseUrl',
    },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: {
        token: { envVar: 'SLACK_BOT_TOKEN' },
      },
    },
    configSchema: {
      type: 'object',
      properties: {
        botToken: { type: 'string', description: 'Slack bot token (xoxb-...)' },
        channel: { type: 'string', description: 'Default channel ID or name' },
        botScopes: { type: 'array', items: { type: 'string' }, description: 'Bot scope permissions' },
        channelTemplates: { type: 'object', description: 'Channel template configurations' },
        notificationRules: { type: 'array', items: { type: 'object' }, description: 'Notification rule definitions' },
        commandRegistry: { type: 'object', description: 'Slash command registry' },
      },
      required: ['botToken'],
    },
    credentialSource: {
      token: { envVar: 'SLACK_BOT_TOKEN' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel ID or name to post to or interact with' },
        text: { type: 'string', description: 'Message text content' },
        ts: { type: 'string', description: 'Message timestamp (for updateMessage or deleteMessage)' },
        channelName: { type: 'string', description: 'Name for new channel (for createChannel)' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        status: { type: 'string' },
        system: { type: 'string' },
        action: { type: 'string' },
        request: {
          type: 'object',
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
        error: { type: 'string' },
      },
      required: ['success', 'status', 'system', 'action', 'request', 'response', 'error'],
    },
    timeoutMs: 15000,
  triggers: [{ kind: 'user', phrase_examples: ["Post to Slack", "Send message", "Check notifications"] }],
  });
