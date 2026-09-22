import { Tool, SchemaRecord } from '../../../types';
import { createExternalActionSkill, SchemaProps } from '../code-skill-factory';

function withConfirmation(skill: Tool): Tool {
  return {
    ...skill,
    confirmBeforeSend: true,
    manifest: { ...skill.manifest, confirmBeforeSend: true },
  };
}

export const DELIVERY_TRACKING = withConfirmation(createExternalActionSkill({
  id: 'delivery-tracking',
  name: 'Delivery Tracking',
  description: 'Track delivery status via Jira issues and Confluence documentation. Confirmation required before sending; dry-run mode is default.',
  system: 'jira',
  action: 'create_issue',
  auth: { type: 'bearer' },
  configSchema: {
    type: 'object',
    properties: {
      confirmBeforeSend: SchemaProps.boolean({ description: 'Require explicit confirmation before sending mutating requests', default: true }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
      defaultProjectKey: SchemaProps.text({ description: 'Default Jira project key' }),
      defaultIssueType: SchemaProps.text({ description: 'Default issue type' }),
    },
  },
  inputSchema: {
    type: 'object',
    properties: {
      operation: SchemaProps.select(['jira', 'confluence'], { description: 'Target system for delivery tracking' }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing', default: true }),
      issueKey: SchemaProps.text({ description: 'Jira issue key' }),
      summary: SchemaProps.text({ description: 'Issue summary or title' }),
      status: SchemaProps.select(['todo', 'in-progress', 'done'], { description: 'Issue status' }),
      projectKey: SchemaProps.text({ description: 'Jira project key' }),
    },
    required: ['operation'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      mode: { type: 'string' },
      system: { type: 'string' },
      action: { type: 'string' },
      request: { type: 'object' },
      response: { type: ['object', 'null'] },
      error: { type: 'string' },
    },
    required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
  },
  timeoutMs: 30000,
  triggers: [
    { kind: 'user', phrase_examples: ['Track delivery', 'Check Jira status', 'Update roadmap'] },
    { kind: 'schedule', cadence: 'Daily delivery status review' },
    { kind: 'event', on: 'Sprint completed' },
  ],
}));
