import { Tool, SchemaRecord } from '../../../types';
import { createExternalActionSkill, SchemaProps } from '../code-skill-factory';

function withConfirmation(skill: Tool): Tool {
  return {
    ...skill,
    confirmBeforeSend: true,
    manifest: { ...skill.manifest, confirmBeforeSend: true },
  };
}

export const TEAM_COORDINATION = withConfirmation(createExternalActionSkill({
  id: 'team-coordination',
  name: 'Team Coordination',
  description: 'Coordinate team schedules, send messages, and manage team communications via Slack and calendar systems. Confirmation required before sending; dry-run mode is default.',
  system: 'slack',
  action: 'send_message',
  auth: { type: 'bearer' },
  configSchema: {
    type: 'object',
    properties: {
      confirmBeforeSend: SchemaProps.boolean({ description: 'Require explicit confirmation before sending mutating requests', default: true }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
      defaultChannel: SchemaProps.text({ description: 'Default Slack channel' }),
      notificationRules: SchemaProps.object({}, { description: 'Notification rule configurations' }),
    },
  },
  inputSchema: {
    type: 'object',
    properties: {
      operation: SchemaProps.select(['schedule', 'message', 'notify'], { description: 'Coordination operation to perform' }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing', default: true }),
      channel: SchemaProps.text({ description: 'Target channel or group' }),
      message: SchemaProps.text({ description: 'Message content' }),
      attendees: SchemaProps.stringArray({ description: 'Attendee list' }),
      startTime: SchemaProps.datetime({ description: 'Event start time' }),
      endTime: SchemaProps.datetime({ description: 'Event end time' }),
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
  timeoutMs: 15000,
  triggers: [
    { kind: 'user', phrase_examples: ['Schedule a meeting', 'Send a message', 'Notify the team'] },
    { kind: 'schedule', cadence: 'Daily team activity review' },
    { kind: 'event', on: 'Team member added' },
  ],
}));
