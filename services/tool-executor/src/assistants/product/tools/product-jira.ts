// @ts-nocheck

import { SchemaProps, createExternalActionSkill } from '../../../adk/code-skill-factory';

export const PRODUCT_JIRA = createExternalActionSkill({
    id: 'product-jira',
    tier: 'represent',
    isSkill: false,
    name: 'Jira Integration',
    description: 'Create, update, and query Jira issues and sprints. Uses configurable Jira instance with endpoint and auth.',
    system: 'jira',
    action: 'manage_issue',
    endpoint: {
      method: 'POST',
      configKey: 'baseUrl',
    },
    auth: {
      type: 'basic',
      credentialEnvKeyMap: {
        username: { envVar: 'JIRA_EMAIL' },
        password: { envVar: 'JIRA_API_TOKEN' },
      },
    },
    configSchema: {
      type: 'object',
      properties: {
    endpoint: SchemaProps.url({ description: 'Analytics platform base URL for this Skill' }),
        baseUrl: { type: 'string', description: 'Jira base URL' },
        email: { type: 'string', description: 'Jira user email' },
        apiToken: { type: 'string', description: 'Jira API token' },
        projectKey: { type: 'string', description: 'Default project key' },
        issueType: { type: 'string', description: 'Default issue type' },
        workflowSchemes: { type: 'object', description: 'Jira workflow scheme mappings' },
        customFields: { type: 'object', description: 'Custom field configurations' },
        automationRules: { type: 'array', items: { type: 'object' }, description: 'Automation rule definitions' },
        permissionSchemes: { type: 'object', description: 'Permission scheme assignments' },
      },
      required: ['baseUrl', 'email', 'apiToken'],
    },
    credentialSource: {
      username: { envVar: 'JIRA_EMAIL' },
      password: { envVar: 'JIRA_API_TOKEN' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'Jira project key' },
        issueType: { type: 'string', description: 'Jira issue type (for example, Bug, Task, or Story)' },
        summary: { type: 'string', description: 'Issue summary or title' },
        description: { type: 'string', description: 'Issue description' },
        issueId: { type: 'string', description: 'Jira issue ID or key to update or retrieve' },
        fields: { type: 'object', description: 'Additional Jira issue fields as key-value pairs' },
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
  triggers: [{ kind: 'user', phrase_examples: ["Create Jira ticket", "Update ticket", "Search tickets"] }],
  });
