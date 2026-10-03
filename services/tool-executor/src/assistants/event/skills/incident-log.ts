import { createExternalActionSkill, SchemaProps } from '../../../adk/code-skill-factory';

/**
 * Day-of incident entry in the operations log.
 *
 * v9 §2: a `represent` Skill reaches a provider and mutates there, so the tier
 * is the approval gate. The ops log is the record an insurer, a venue or a
 * post-event review reads, so an entry is never written speculatively and the
 * escalation clock is part of the payload rather than a side effect.
 */
const LOG_INCIDENT = createExternalActionSkill({
  id: 'event-log-incident',
  name: 'Log Incident',
  description:
    'Records a day-of incident in the operations log with severity, location, category and owner, and reports the escalation the severity triggers. Defaults to dry run; a live log entry requires confirmation. With no endpoint configured, reports the staged entry and marks itself not-connected rather than inventing a record.',
  system: 'event_ops_log',
  action: 'log-incident',
  endpoint: { configKey: 'EVENT_OPS_LOG_ENDPOINT', method: 'POST' },
  auth: {
    type: 'bearer',
    credentialEnvKeyMap: { token: 'EVENT_OPS_LOG_ACCESS_TOKEN' },
  },
  credentialSource: {
    token: { envVar: 'EVENT_OPS_LOG_ACCESS_TOKEN', configKey: 'event.opsLog.token' },
  },
  configSchema: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string', description: 'Operations log platform base URL' },
      token: { type: 'string', description: 'Platform bearer token' },
      severityEscalationMinutes: {
        type: 'object',
        description: 'Minutes before an unowned incident escalates, by severity',
        additionalProperties: { type: 'number' },
      },
      notifyChannels: {
        type: 'array',
        items: { type: 'string' },
        description: 'Channels the operations log notifies on a new entry',
      },
      requireOwner: {
        type: 'boolean',
        description: 'Refuse an entry with no named owner',
        default: true,
      },
    },
    required: ['baseUrl', 'token'],
  },
  inputSchema: {
    type: 'object',
    properties: {
      event: { type: 'string', description: 'Event identifier' },
      incidentDetails: {
        type: 'string',
        description: 'What happened, in the reporter\'s own words',
        multiline: true,
      },
      severity: {
        type: 'string',
        enum: ['low', 'moderate', 'high', 'critical'],
        description: 'Severity of the incident',
        default: 'moderate',
      },
      location: { type: 'string', description: 'Where on the site it happened' },
      category: {
        type: 'string',
        enum: ['safety', 'medical', 'security', 'technical', 'venue', 'crowd', 'catering', 'other'],
        description: 'Category of the incident',
        default: 'other',
      },
      assignedTo: { type: 'string', description: 'Owner of the follow-up' },
      guestsAffected: { type: 'number', description: 'Guests involved or impacted' },
      resolution: { type: 'string', description: 'Resolution if already known', multiline: true },
      occurredAt: { type: 'string', format: 'date-time', description: 'When it happened' },
      dryRun: SchemaProps.boolean({ description: 'Validate the entry without recording it' }),
    },
    // The design names `incidentDetails`, `severity` and `location` as this
    // Skill's inputs; severity has a default and location is optional.
    required: ['incidentDetails'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
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
    required: ['success', 'system', 'action', 'request', 'response', 'error'],
  },
  timeoutMs: 30000,
  tier: 'represent',
  isSkill: true,
  manifest: { actionLabel: 'Log incident' },
});

LOG_INCIDENT.domainKnowledge =
  'Event day-of incident management: severity classification, on-site escalation clocks, guest welfare, security response, and the operational record a post-event review reads';
LOG_INCIDENT.triggers = [
  { kind: 'user', phrase_examples: ['Log an incident in the loading bay', 'Record a medical call in hall B'] },
  { kind: 'event', on: 'Staff report an on-site incident' },
];

export { LOG_INCIDENT };
