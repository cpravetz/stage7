// @ts-nocheck
import { createExternalActionSkill } from '../code-skill-factory';

export const PRODUCT_CALENDAR = createExternalActionSkill({
    id: 'product-calendar',
    name: 'Calendar Integration',
    description: 'Schedule product reviews, sync events, and manage calendars. Uses configurable calendar API with endpoint and auth.',
    system: 'calendar',
    action: 'schedule_event',
    endpoint: {
      method: 'POST',
      configKey: 'baseUrl',
    },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: {
        accessToken: { envVar: 'CALENDAR_ACCESS_TOKEN' },
      },
    },
    configSchema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string', description: 'OAuth access token' },
        refreshToken: { type: 'string', description: 'OAuth refresh token' },
        calendarId: { type: 'string', description: 'Default calendar ID' },
        recurrenceRules: { type: 'object', description: 'Recurrence rule definitions' },
        reminderConfigs: { type: 'object', description: 'Reminder configuration settings' },
        timezoneHandling: { type: 'string', description: 'Timezone handling mode' },
        syncProviders: { type: 'array', items: { type: 'string' }, description: 'Enabled sync providers' },
      },
      required: ['accessToken'],
    },
    credentialSource: {
      accessToken: { envVar: 'CALENDAR_ACCESS_TOKEN' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Event summary or title' },
        description: { type: 'string', description: 'Event description' },
        startTime: { type: 'string', description: 'Event start time (ISO 8601)' },
        endTime: { type: 'string', description: 'Event end time (ISO 8601)' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'List of attendee email addresses' },
        calendarId: { type: 'string', description: 'Calendar ID to schedule against' },
        event: { type: 'string', description: 'Event ID to update or delete' },
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
  triggers: [{ kind: 'user', phrase_examples: ["Check calendar", "Schedule review", "Find meeting times"] }],
  });
