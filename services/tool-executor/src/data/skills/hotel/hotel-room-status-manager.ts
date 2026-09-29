import { createExternalActionSkill, createSchemaRecord, SchemaProps } from '../code-skill-factory';
import {
  HOTEL_EXTERNAL_CONFIG_SCHEMA,
  HOTEL_EXTERNAL_OUTPUT_SCHEMA,
  HOTEL_PROPERTY_BASE_INPUT,
  withConfirmation,
} from './hotel-external-common';

const ROOM_STATUS_INPUT_SCHEMA = createSchemaRecord({
  ...HOTEL_PROPERTY_BASE_INPUT,
  roomId: SchemaProps.text({ description: 'Room identifier' }),
  roomIds: SchemaProps.stringArray({ description: 'Room identifiers for bulk status changes' }),
  status: SchemaProps.select(['available', 'occupied', 'reserved', 'cleaning', 'clean', 'inspected', 'out-of-order'], {
    description: 'Target room status; out-of-order removes the room from sale',
  }),
  notes: SchemaProps.textarea({ description: 'Status change note for the audit trail' }),
  filters: SchemaProps.object({}, { description: 'Room status query filters', additionalProperties: true }),
  data: SchemaProps.object({}, { description: 'Room status-specific data', additionalProperties: true }),
  payload: SchemaProps.object({}, { description: 'Full operation payload for connector-specific fields', additionalProperties: true }),
}, { required: ['propertyId'] });

export const ROOM_STATUS_MANAGER_SKILL = withConfirmation(createExternalActionSkill({
  id: 'hotel-room-status-manager',
  name: 'Room Status & Availability',
  description: 'Update room status and saleable availability, including marking a room occupied on arrival, available on departure, or out of order. Mutating requests require confirmation and default to dry-run.',
  system: 'hotel-pms',
  action: 'room-status',
  endpoint: { envVar: 'HOTEL_HOME', method: 'POST' },
  auth: { type: 'bearer', credentialEnvKeyMap: { token: 'HOTEL_API_TOKEN' } },
  credentialSource: { token: { envVar: 'HOTEL_API_TOKEN', configKey: 'hotel.token' } },
  inputSchema: ROOM_STATUS_INPUT_SCHEMA,
  outputSchema: HOTEL_EXTERNAL_OUTPUT_SCHEMA,
  configSchema: HOTEL_EXTERNAL_CONFIG_SCHEMA,
  timeoutMs: 45000,
  tier: 'represent',
  domainKnowledge: 'Hotel room status and inventory control: arrival and departure sequencing, housekeeping-state gating of saleable inventory, out-of-order rooms, and room-state audit trails.',
  triggers: [
    { kind: 'event', on: 'Guest check-in or check-out' },
    { kind: 'user', phrase_examples: ['Mark room 405 occupied', 'Set room 118 to available', 'Take room 210 out of order'] },
  ],
  isSkill: true,
}));
