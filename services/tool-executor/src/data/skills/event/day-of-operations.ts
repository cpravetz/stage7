import { createExternalActionSkill, SchemaProps } from '../code-skill-factory';

const EVENT_EXTERNAL_OUTPUT_SCHEMA = {
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
};

const DAY_OF_OPERATIONS = createExternalActionSkill({
  id: 'event-day-of-operations',
  name: 'Day-of Operations',
  description: 'Execute day-of event operations: seating, check-in, real-time monitoring, and issue response. Real-time proxy to event management platforms.',
  system: 'event_operations',
  action: 'execute',
  endpoint: { envVar: 'EVENT_OPERATIONS_ENDPOINT', method: 'POST' },
  auth: {
    type: 'bearer',
    credentialEnvKeyMap: { token: 'EVENT_OPERATIONS_ACCESS_TOKEN' },
  },
  configSchema: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string', description: 'Event operations platform base URL' },
      token: { type: 'string', description: 'Platform bearer token' },
      provider: { type: 'string', enum: ['cvent', 'eventbrite', 'bizzabo', 'hopin', 'whova', 'attendify', 'custom'], description: 'Event platform provider' },
      checkInMethods: { type: 'array', items: { type: 'string' }, enum: ['qr-code', 'badge-scan', 'manual', 'facial-recognition', 'rfid'], description: 'Enabled check-in methods' },
      seatingEngine: { type: 'boolean', description: 'Automated seating optimization', default: true },
      realTimeDashboard: { type: 'boolean', description: 'Live operations dashboard', default: true },
      communicationChannels: { type: 'array', items: { type: 'string' }, enum: ['slack', 'teams', 'sms', 'radio', 'app-push'], description: 'Staff communication channels' },
    },
    required: ['baseUrl', 'token', 'provider'],
  },
  credentialSource: {
    token: { envVar: 'EVENT_OPERATIONS_ACCESS_TOKEN', configKey: 'event.operations.token' },
  },
  inputSchema: {
    type: 'object',
    properties: {
      event: { type: 'string', description: 'Event identifier' },
      sessionId: { type: 'string', description: 'Session/agenda item identifier' },
      attendeeId: { type: 'string', description: 'Attendee identifier' },
      tableId: { type: 'string', description: 'Table identifier' },
      seatData: { type: 'object', description: 'Seating assignment data' },
      checkInData: { type: 'object', description: 'Check-in data: method, timestamp, location' },
      issueData: { type: 'object', description: 'Issue: type, severity, location, description, assignedTo' },
      alertData: { type: 'object', description: 'Broadcast: message, channels, recipients, urgency' },
      dryRun: SchemaProps.boolean({ description: 'Validate without executing' }),
    },
    required: ['event'],
  },
  outputSchema: EVENT_EXTERNAL_OUTPUT_SCHEMA,
  timeoutMs: 60000,
  tier: 'aid',
isSkill: true,
});

DAY_OF_OPERATIONS.domainKnowledge = 'Event day-of operations: check-in workflows, seating assignment, real-time attendance monitoring, issue escalation, and run-of-show execution across event management platforms';
DAY_OF_OPERATIONS.confirmBeforeSend = true;
DAY_OF_OPERATIONS.triggers = [
  { kind: 'event', on: 'Event day begins' },
];

export { DAY_OF_OPERATIONS };
