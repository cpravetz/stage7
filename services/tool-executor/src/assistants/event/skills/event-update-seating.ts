import { createExternalActionSkill, SchemaProps } from '../../../adk/code-skill-factory';

/**
 * Seating change against the floorplan system.
 *
 * v9 §2: a `represent` Skill reaches a provider and mutates there, so the tier
 * is the approval gate. Moving a party changes the chart everyone else reads,
 * and a table moved without freeing its old seats strands them, so the staged
 * default and the old-seat release both stay in place.
 */
const UPDATE_SEATING = createExternalActionSkill({
  id: 'event-update-seating',
  name: 'Update Seating',
  description:
    'Moves a party to a target table in the floorplan system, releasing the seats it held and reporting the revised chart. Defaults to dry run; a live seating change requires confirmation. With no endpoint configured, reports the staged move and marks itself not-connected rather than inventing a chart.',
  system: 'event_floorplan',
  action: 'update-seating',
  endpoint: { configKey: 'EVENT_FLOORPLAN_ENDPOINT', method: 'POST' },
  auth: {
    type: 'bearer',
    credentialEnvKeyMap: { token: 'EVENT_FLOORPLAN_ACCESS_TOKEN' },
  },
  credentialSource: {
    token: { envVar: 'EVENT_FLOORPLAN_ACCESS_TOKEN', configKey: 'event.floorplan.token' },
  },
  configSchema: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string', description: 'Floorplan platform base URL' },
      token: { type: 'string', description: 'Platform bearer token' },
      autoOptimize: {
        type: 'boolean',
        description: 'Let the platform pick a table when the target has no capacity',
        default: false,
      },
      lockLayout: {
        type: 'boolean',
        description: 'Refuse changes that break a locked or assigned table',
        default: true,
      },
      maxSeatsPerTable: {
        type: 'number',
        description: 'Capacity assumed for a table when the platform reports none',
        default: 10,
      },
    },
    required: ['baseUrl', 'token'],
  },
  inputSchema: {
    type: 'object',
    properties: {
      event: { type: 'string', description: 'Event identifier' },
      guestId: {
        type: 'string',
        description: 'Guest or party being moved',
        'x-referenceSource': 'event-attendees',
        'x-referenceValueField': 'guestId',
        'x-referenceLabel': 'your guest list',
      },
      targetTable: {
        type: 'string',
        description: 'Table to seat them at',
        'x-referenceSource': 'event-tables',
        'x-referenceValueField': 'tableId',
        'x-referenceLabel': 'your floor plan',
      },
      partySize: { type: 'number', description: 'Seats required at the target table' },
      seatPreferences: {
        type: 'array',
        items: { type: 'string' },
        description: 'Constraints such as near-stage, quiet, accessible, or together',
      },
      moveReason: { type: 'string', description: 'Why the party is being moved' },
      dryRun: SchemaProps.boolean({ description: 'Validate the move without applying it' }),
    },
    // The design names `guestId` and `targetTable` as this Skill's inputs.
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
  manifest: { actionLabel: 'Update seating', emitEvent: 'event.seating.updated' },
});

UPDATE_SEATING.domainKnowledge =
  'Event seating operations: table capacity and assignment, seat release on move, accessibility and adjacency constraints, and floorplan lock policy';
UPDATE_SEATING.triggers = [
  { kind: 'user', phrase_examples: ['Move that party to table 12', 'Re-seat the Hendersons by the window'] },
  { kind: 'event', on: 'Guest requests a table change on arrival', externalEvent: true, eventId: 'event.external.seating_request.submitted' },
];

export { UPDATE_SEATING };
