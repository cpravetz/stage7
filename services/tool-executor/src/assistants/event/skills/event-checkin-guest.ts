import { createExternalActionSkill, SchemaProps } from '../../../adk/code-skill-factory';

/**
 * Guest arrival against the ticketing system.
 *
 * v9 §2: a `represent` Skill reaches a provider and mutates there, so the tier
 * is the approval gate. Check-in is a write to the ticketing system of record,
 * and a duplicate or a wrong-gate check-in is visible to the guest immediately,
 * so the staged/dry-run default stays in place.
 */
const CHECKIN_GUEST = createExternalActionSkill({
  id: 'event-checkin-guest',
  name: 'Guest Check-in',
  description:
    'Records a guest arrival against the ticketing system, resolving the ticket, gate and admission state. Defaults to dry run; a live check-in requires confirmation. With no endpoint configured, reports the staged check-in and marks itself not-connected rather than inventing an arrival.',
  system: 'event_ticketing',
  action: 'checkin-guest',
  endpoint: { configKey: 'EVENT_TICKETING_ENDPOINT', method: 'POST' },
  auth: {
    type: 'bearer',
    credentialEnvKeyMap: { token: 'EVENT_TICKETING_ACCESS_TOKEN' },
  },
  // The bearer token is a secret, so it is resolved from the vault or operator
  // configuration rather than asked for on the Run form.
  credentialSource: {
    token: { envVar: 'EVENT_TICKETING_ACCESS_TOKEN', configKey: 'event.ticketing.token' },
  },
  configSchema: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string', description: 'Ticketing platform base URL' },
      token: { type: 'string', description: 'Platform bearer token' },
      provider: {
        type: 'string',
        enum: ['cvent', 'eventbrite', 'bizzabo', 'hopin', 'whova', 'attendify', 'custom'],
        description: 'Event platform provider',
      },
      checkInMethods: {
        type: 'array',
        items: { type: 'string' },
        enum: ['qr-code', 'badge-scan', 'manual', 'rfid'],
        description: 'Enabled check-in methods',
      },
      duplicatePolicy: {
        type: 'string',
        enum: ['reject', 'allow', 'review'],
        description: 'What to do when a guest is already checked in',
        default: 'review',
      },
      admissionCutoffMinutes: {
        type: 'number',
        description: 'Doors close this many minutes after the start time; zero disables the cutoff',
        default: 0,
      },
    },
    required: ['baseUrl', 'token', 'provider'],
  },
  inputSchema: {
    type: 'object',
    properties: {
      event: { type: 'string', description: 'Event identifier' },
      guestId: {
        type: 'string',
        description: 'Guest to check in',
        'x-referenceSource': 'event-attendees',
        'x-referenceValueField': 'guestId',
        'x-referenceLabel': 'your guest list',
      },
      ticketType: {
        type: 'string',
        description: 'Ticket class carried by the guest, which decides admission',
        'x-referenceSource': 'event-tickets',
        'x-referenceValueField': 'ticketType',
        'x-referenceLabel': 'your ticket types',
      },
      gate: { type: 'string', description: 'Entry gate the guest presented at' },
      checkInMethod: {
        type: 'string',
        enum: ['qr-code', 'badge-scan', 'manual', 'rfid'],
        description: 'How the arrival was evidenced',
        default: 'qr-code',
      },
      partySize: { type: 'number', description: 'Guests arriving together on one ticket' },
      notes: { type: 'string', description: 'Free-text note recorded with the arrival', multiline: true },
      dryRun: SchemaProps.boolean({ description: 'Validate the check-in without recording it' }),
    },
    // The design names `guestId` and `ticketType` as this Skill's inputs; the
    // event it belongs to is carried alongside rather than demanded first.
    required: ['guestId'],
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
  manifest: { actionLabel: 'Check in guest', emitEvent: 'event.guest.checked_in' },
});

CHECKIN_GUEST.domainKnowledge =
  'Event check-in workflows: ticket resolution, admission state, gate assignment, duplicate arrival handling, and door-cutoff policy across ticketing platforms';
CHECKIN_GUEST.triggers = [
  { kind: 'event', on: 'Guest arrival scanned at an entry gate', externalEvent: true, eventId: 'event.external.gate_scan.recorded' },
  { kind: 'user', phrase_examples: ['Check in guest 1042', 'Scan this ticket at the north gate'] },
];

export { CHECKIN_GUEST };
