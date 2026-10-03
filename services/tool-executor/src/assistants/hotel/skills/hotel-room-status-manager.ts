import { createDeclarativeCodeSkill, createSchemaRecord, SchemaProps } from '../../../adk/code-skill-factory';
import {
  HOTEL_EXTERNAL_OUTPUT_SCHEMA,
  HOTEL_PROPERTY_BASE_INPUT,
} from '../tools/hotel-external-common';

const ROOM_STATUS_INPUT_SCHEMA = createSchemaRecord({
  ...HOTEL_PROPERTY_BASE_INPUT,
  roomId: SchemaProps.reference('hotel-rooms', { description: 'Room identifier' }),
  roomIds: SchemaProps.referenceArray('hotel-rooms', { description: 'Room identifiers for bulk status changes' }),
  status: SchemaProps.select(['available', 'occupied', 'reserved', 'cleaning', 'clean', 'inspected', 'out-of-order'], {
    description: 'Target room status; out-of-order removes the room from sale',
  }),
  notes: SchemaProps.textarea({ description: 'Status change note for the audit trail' }),
  filters: SchemaProps.object({}, { description: 'Room status query filters', additionalProperties: true }),
  data: SchemaProps.object({}, { description: 'Room status-specific data', additionalProperties: true }),
  payload: SchemaProps.object({}, { description: 'Full operation payload for connector-specific fields', additionalProperties: true }),
}, { required: ['propertyId'] });

export const ROOM_STATUS_MANAGER_SKILL = createDeclarativeCodeSkill({
  id: 'hotel-room-status-manager',
  name: 'Room Status & Availability',
  description: 'Update room status and saleable availability, including marking a room occupied on arrival, available on departure, or out of order. Mutating requests require confirmation and default to dry-run.',
  persistenceEnvVar: 'HOTEL_HOME',
  inputSchema: ROOM_STATUS_INPUT_SCHEMA,
  outputSchema: HOTEL_EXTERNAL_OUTPUT_SCHEMA,
  tier: 'represent',
  confirmBeforeSend: true,
  domainKnowledge: 'Hotel room status and inventory control: arrival and departure sequencing, housekeeping-state gating of saleable inventory, out-of-order rooms, and room-state audit trails.',
  triggers: [
    { kind: 'event', on: 'Guest check-in or check-out' },
    { kind: 'user', phrase_examples: ['Mark room 405 occupied', 'Set room 118 to available', 'Take room 210 out of order'] },
  ],
  isSkill: true,
  async handler(input, ctx) {
    const roomStatuses = ctx.store.load('room_statuses');
    if (input.roomId && input.status) {
      const idx = roomStatuses.findIndex((r: any) => r.roomId === input.roomId);
      const updatedRecord = {
        roomId: input.roomId,
        status: input.status,
        notes: input.notes || '',
        updatedAt: new Date().toISOString(),
      };
      if (idx >= 0) {
        roomStatuses[idx] = updatedRecord;
      } else {
        roomStatuses.push(updatedRecord);
      }
      ctx.store.save('room_statuses', roomStatuses);
      return {
        success: true,
        data: { room: updatedRecord },
        present: [
          ctx.render.text('room-status-update', 'Room Status Updated', `Room ${input.roomId} is now ${input.status}.`),
        ],
      };
    }
    return {
      success: true,
      data: { roomStatuses },
      present: [
        ctx.render.text('room-status-list', 'Room Statuses', `Tracked room statuses count: ${roomStatuses.length}`),
      ],
    };
  },
});
