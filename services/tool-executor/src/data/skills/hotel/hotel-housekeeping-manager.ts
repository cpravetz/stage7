import { createExternalActionSkill, createSchemaRecord, SchemaProps } from '../code-skill-factory';
import {
  HOTEL_EXTERNAL_CONFIG_SCHEMA,
  HOTEL_EXTERNAL_OUTPUT_SCHEMA,
  HOTEL_LOCATION_INPUT,
  HOTEL_PROPERTY_BASE_INPUT,
  withConfirmation,
} from './hotel-external-common';

const HOUSEKEEPING_INPUT_SCHEMA = createSchemaRecord({
  ...HOTEL_PROPERTY_BASE_INPUT,
  roomId: SchemaProps.text({ description: 'Room identifier' }),
  roomIds: SchemaProps.stringArray({ description: 'Room identifiers for bulk housekeeping rounds' }),
  staffId: SchemaProps.text({ description: 'Housekeeping attendant identifier' }),
  staffIds: SchemaProps.stringArray({ description: 'Housekeeping attendants to assign or dispatch' }),
  taskId: SchemaProps.text({ description: 'Housekeeping task identifier' }),
  housekeepingStatus: SchemaProps.select(['dirty', 'clean', 'inspected', 'out-of-service'], {
    description: 'Housekeeping cleanliness state for the room',
  }),
  priority: SchemaProps.select(['low', 'medium', 'high', 'urgent'], {
    description: 'Housekeeping task priority',
  }),
  location: HOTEL_LOCATION_INPUT,
  dueTime: SchemaProps.datetime({ description: 'Housekeeping due time in ISO 8601 format' }),
  scheduledAt: SchemaProps.datetime({ description: 'Scheduled start time in ISO 8601 format' }),
  estimatedMinutes: SchemaProps.integer({ description: 'Estimated task duration in minutes', minimum: 1 }),
  action: SchemaProps.select(['create', 'update', 'assign', 'dispatch', 'complete'], {
    description: 'Housekeeping action to apply to the task or room',
  }),
  notes: SchemaProps.textarea({ description: 'Housekeeping notes or attendant handoff instructions' }),
  filters: SchemaProps.object({}, { description: 'Housekeeping query filters', additionalProperties: true }),
  data: SchemaProps.object({}, { description: 'Housekeeping-specific data', additionalProperties: true }),
  payload: SchemaProps.object({}, { description: 'Full operation payload for connector-specific fields', additionalProperties: true }),
}, { required: ['propertyId'] });

export const HOUSEKEEPING_MANAGER_SKILL = withConfirmation(createExternalActionSkill({
  id: 'hotel-housekeeping-manager',
  name: 'Housekeeping & Room Turnover',
  description: 'Create, update, assign, dispatch, and complete housekeeping tasks and room turnover work. Mutating requests require confirmation and default to dry-run.',
  system: 'hotel-pms',
  action: 'housekeeping',
  endpoint: { envVar: 'HOTEL_HOME', method: 'POST' },
  auth: { type: 'bearer', credentialEnvKeyMap: { token: 'HOTEL_API_TOKEN' } },
  credentialSource: { token: { envVar: 'HOTEL_API_TOKEN', configKey: 'hotel.token' } },
  inputSchema: HOUSEKEEPING_INPUT_SCHEMA,
  outputSchema: HOTEL_EXTERNAL_OUTPUT_SCHEMA,
  configSchema: HOTEL_EXTERNAL_CONFIG_SCHEMA,
  timeoutMs: 60000,
  tier: 'represent',
  domainKnowledge: 'Hotel housekeeping operations: room turnover sequencing, attendant assignment, cleanliness states, inspection standards, and staffing workload balance.',
  triggers: [
    { kind: 'event', on: 'Room status change requiring housekeeping turnover' },
    { kind: 'schedule', cadence: 'daily' },
    { kind: 'user', phrase_examples: ['Assign a housekeeper to room 204', 'Mark room 301 as cleaned', 'Dispatch the morning housekeeping round'] },
  ],
  isSkill: true,
}));
