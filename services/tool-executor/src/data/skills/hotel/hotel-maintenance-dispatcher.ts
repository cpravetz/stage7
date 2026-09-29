import { createExternalActionSkill, createSchemaRecord, SchemaProps } from '../code-skill-factory';
import {
  HOTEL_EXTERNAL_CONFIG_SCHEMA,
  HOTEL_EXTERNAL_OUTPUT_SCHEMA,
  HOTEL_LOCATION_INPUT,
  HOTEL_PROPERTY_BASE_INPUT,
  withConfirmation,
} from './hotel-external-common';

const MAINTENANCE_INPUT_SCHEMA = createSchemaRecord({
  ...HOTEL_PROPERTY_BASE_INPUT,
  roomId: SchemaProps.text({ description: 'Room identifier' }),
  taskId: SchemaProps.text({ description: 'Maintenance work-order identifier' }),
  issueId: SchemaProps.text({ description: 'Reported issue or incident identifier' }),
  staffId: SchemaProps.text({ description: 'Maintenance technician identifier' }),
  staffIds: SchemaProps.stringArray({ description: 'Technicians to assign or dispatch' }),
  category: SchemaProps.text({ description: 'Maintenance trade or work category, such as hvac, plumbing, or electrical' }),
  severity: SchemaProps.select(['minor', 'moderate', 'major', 'critical'], { description: 'Issue severity' }),
  priority: SchemaProps.select(['low', 'medium', 'high', 'urgent', 'emergency'], {
    description: 'Work-order priority',
  }),
  status: SchemaProps.select(['open', 'assigned', 'in-progress', 'on-hold', 'completed', 'closed', 'resolved', 'escalated'], {
    description: 'Work-order lifecycle status',
  }),
  location: HOTEL_LOCATION_INPUT,
  dueTime: SchemaProps.datetime({ description: 'Work-order due time in ISO 8601 format' }),
  scheduledAt: SchemaProps.datetime({ description: 'Scheduled visit time in ISO 8601 format' }),
  estimatedMinutes: SchemaProps.integer({ description: 'Estimated repair duration in minutes', minimum: 1 }),
  action: SchemaProps.select(['create', 'update', 'assign', 'dispatch', 'complete', 'close', 'resolve', 'escalate'], {
    description: 'Maintenance action to apply to the work order',
  }),
  notes: SchemaProps.textarea({ description: 'Repair notes, parts used, or technician handoff instructions' }),
  filters: SchemaProps.object({}, { description: 'Maintenance work-order query filters', additionalProperties: true }),
  data: SchemaProps.object({}, { description: 'Maintenance-specific data', additionalProperties: true }),
  payload: SchemaProps.object({}, { description: 'Full operation payload for connector-specific fields', additionalProperties: true }),
}, { required: ['propertyId'] });

export const MAINTENANCE_DISPATCHER_SKILL = withConfirmation(createExternalActionSkill({
  id: 'hotel-maintenance-dispatcher',
  name: 'Maintenance Dispatch & Resolution',
  description: 'Create, update, assign, dispatch, complete, close, resolve, and escalate maintenance work orders from reported property issues. Mutating requests require confirmation and default to dry-run.',
  system: 'hotel-pms',
  action: 'maintenance',
  endpoint: { envVar: 'HOTEL_HOME', method: 'POST' },
  auth: { type: 'bearer', credentialEnvKeyMap: { token: 'HOTEL_API_TOKEN' } },
  credentialSource: { token: { envVar: 'HOTEL_API_TOKEN', configKey: 'hotel.token' } },
  inputSchema: MAINTENANCE_INPUT_SCHEMA,
  outputSchema: HOTEL_EXTERNAL_OUTPUT_SCHEMA,
  configSchema: HOTEL_EXTERNAL_CONFIG_SCHEMA,
  timeoutMs: 60000,
  tier: 'represent',
  domainKnowledge: 'Hotel maintenance operations: work-order lifecycle, trade specialization, severity and priority triage, preventive maintenance scheduling, and guest-impact assessment during repairs.',
  triggers: [
    { kind: 'event', on: 'Maintenance issue reported for a room or facility area' },
    { kind: 'user', phrase_examples: ['Report a leaking faucet in room 212', 'Dispatch a technician', 'Escalate the HVAC work order'] },
  ],
  isSkill: true,
}));
