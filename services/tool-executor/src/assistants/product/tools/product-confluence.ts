// @ts-nocheck
import { createExternalActionSkill } from '../../../adk/code-skill-factory';

export const PRODUCT_CONFLUENCE = createExternalActionSkill({
    id: 'product-confluence',
    name: 'Confluence Integration',
    description: 'Create and update Confluence pages and spaces. Uses configurable Confluence instance with endpoint and auth.',
    system: 'confluence',
    action: 'manage_page',
    // Creates and updates Confluence pages. Sibling integrations
    // (product-jira, product-slack, product-calendar) all gate their live call.
    confirmBeforeSend: true,
    endpoint: {
      method: 'POST',
      configKey: 'baseUrl',
    },
    auth: {
      type: 'basic',
      credentialEnvKeyMap: {
        username: { envVar: 'CONFLUENCE_EMAIL' },
        password: { envVar: 'CONFLUENCE_API_TOKEN' },
      },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Confluence base URL' },
        email: { type: 'string', description: 'Confluence user email' },
        apiToken: { type: 'string', description: 'Confluence API token' },
        spaceKey: { type: 'string', description: 'Default space key' },
        ancestorId: { type: 'string', description: 'Parent page ID' },
        pageTemplates: { type: 'object', description: 'Confluence page templates' },
        blueprints: { type: 'object', description: 'Confluence blueprint configurations' },
        macroConfigs: { type: 'object', description: 'Macro configuration settings' },
        spacePermissions: { type: 'object', description: 'Space permission rules' },
      },
      required: ['baseUrl', 'email', 'apiToken'],
    },
    credentialSource: {
      username: { envVar: 'CONFLUENCE_EMAIL' },
      password: { envVar: 'CONFLUENCE_API_TOKEN' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        spaceKey: { type: 'string', description: 'Confluence space key' },
        title: { type: 'string', description: 'Page title' },
        body: { type: 'string', description: 'Page body content in the specified representation format' },
        pageId: { type: 'string', description: 'Confluence page ID to update or retrieve' },
        ancestorId: { type: 'string', description: 'Parent page ID for page hierarchy' },
        representation: { type: 'string', enum: ['storage', 'wiki', 'markdown'], description: 'Storage format representation (storage, wiki, or markdown)' },
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
    timeoutMs: 30000,
  triggers: [{ kind: 'user', phrase_examples: ["Create Confluence page", "Search docs", "Update documentation"] }],
  });
