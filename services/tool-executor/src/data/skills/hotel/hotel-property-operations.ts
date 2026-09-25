import { Tool, SchemaRecord } from '../../../types';
import { createExternalActionSkill, createSchemaRecord, SchemaProps } from '../code-skill-factory';

const HOTEL_HOME = process.env.HOTEL_HOME || '/tmp/hotel';

const EXTERNAL_OUTPUT_SCHEMA = createSchemaRecord({
  success: SchemaProps.boolean({ description: 'Whether the external operation completed successfully' }),
  status: SchemaProps.select(['dry-run', 'live', 'error'], { description: 'Execution status returned by the connector' }),
  system: SchemaProps.text({ description: 'Hotel system that handled the operation' }),
  action: SchemaProps.text({ description: 'High-level action executed by the connector' }),
  request: SchemaProps.object({
    input: SchemaProps.object({}, { description: 'Input sent to the hotel connector', additionalProperties: true }),
    endpoint: SchemaProps.text({ description: 'Resolved hotel connector endpoint' }),
    method: SchemaProps.text({ description: 'HTTP method used for the request' }),
    headers: SchemaProps.object({}, { description: 'Redacted request headers', additionalProperties: true }),
  }, { description: 'Details of the external request' }),
  response: SchemaProps.object({
    status: SchemaProps.number({ description: 'HTTP response status code' }),
    data: SchemaProps.object({}, { description: 'Data returned by the hotel connector', additionalProperties: true }),
  }, { description: 'Response from the hotel connector' }),
  error: SchemaProps.text({ description: 'Error message when the operation fails' }),
}, {
  required: ['success', 'status', 'system', 'action', 'request', 'response', 'error'],
});

const EXTERNAL_CONFIG_SCHEMA = createSchemaRecord({
  confirmBeforeSend: SchemaProps.boolean({
    description: 'Require explicit confirmation before sending a mutating hotel request',
    default: true,
  }),
  hotelHome: SchemaProps.text({
    description: 'Hotel PMS base URL or local hotel service home',
    default: HOTEL_HOME,
  }),
  apiToken: SchemaProps.password({ description: 'Bearer token for the hotel PMS' }),
  provider: SchemaProps.text({ description: 'PMS or channel manager provider, such as opera, mews, cloudbeds, or custom' }),
  apiVersion: SchemaProps.text({ description: 'Optional hotel API version' }),
});

function withConfirmation(skill: Tool): Tool {
  return {
    ...skill,
    confirmBeforeSend: true,
    manifest: {
      ...skill.manifest,
      confirmBeforeSend: true,
    },
  };
}

const PROPERTY_OPERATIONS_INPUT_SCHEMA = createSchemaRecord({
  propertyId: SchemaProps.text({ description: 'Hotel property identifier', required: true }),
  roomId: SchemaProps.text({ description: 'Room identifier' }),
  roomIds: SchemaProps.stringArray({ description: 'Room identifiers for bulk operations' }),
  staffId: SchemaProps.text({ description: 'Staff member identifier' }),
  staffIds: SchemaProps.stringArray({ description: 'Staff identifiers for assignments or dispatch' }),
  taskId: SchemaProps.text({ description: 'Task or work-order identifier' }),
  issueId: SchemaProps.text({ description: 'Issue or incident identifier' }),
  itemId: SchemaProps.text({ description: 'Inventory item identifier' }),
  status: SchemaProps.select(['available', 'occupied', 'reserved', 'cleaning', 'clean', 'inspected', 'out-of-order', 'maintenance'], {
    description: 'Target room or work-item status',
  }),
  housekeepingStatus: SchemaProps.select(['dirty', 'clean', 'inspected', 'out-of-service'], {
    description: 'Housekeeping cleanliness state',
  }),
  priority: SchemaProps.select(['low', 'medium', 'high', 'urgent', 'emergency'], {
    description: 'Task, maintenance, or issue priority',
  }),
  category: SchemaProps.text({ description: 'Maintenance, issue, or inventory category' }),
  severity: SchemaProps.select(['minor', 'moderate', 'major', 'critical'], { description: 'Issue severity' }),
  location: SchemaProps.object({
    label: SchemaProps.text({ description: 'Human-readable location' }),
    floor: SchemaProps.text({ description: 'Floor or building area' }),
    roomNumber: SchemaProps.text({ description: 'Room number when applicable' }),
  }, { description: 'Physical location for an operational task' }),
  dueTime: SchemaProps.datetime({ description: 'Task or maintenance due time in ISO 8601 format' }),
  scheduledAt: SchemaProps.datetime({ description: 'Scheduled start time in ISO 8601 format' }),
  estimatedMinutes: SchemaProps.integer({ description: 'Estimated task duration in minutes', minimum: 1 }),
  quantity: SchemaProps.number({ description: 'Inventory quantity to adjust or order', minimum: 0 }),
  unit: SchemaProps.text({ description: 'Inventory quantity unit, such as each, case, or liter' }),
  minStockLevel: SchemaProps.number({ description: 'Minimum stock threshold for reorder alerts', minimum: 0 }),
  action: SchemaProps.select(['create', 'update', 'assign', 'dispatch', 'complete', 'close', 'resolve', 'escalate', 'adjust', 'list'], {
    description: 'Action to apply within the selected operation',
  }),
  notes: SchemaProps.textarea({ description: 'Operational notes or handoff instructions' }),
  filters: SchemaProps.object({}, { description: 'Operation-specific query filters', additionalProperties: true }),
  data: SchemaProps.object({}, { description: 'Operation-specific property data', additionalProperties: true }),
  payload: SchemaProps.object({}, { description: 'Full operation payload for connector-specific fields', additionalProperties: true }),
  dryRun: SchemaProps.boolean({ description: 'Validate the request without sending a live mutation', default: true }),
  confirmation: SchemaProps.boolean({ description: 'Explicit approval for a live mutating request; dryRun does not require approval', default: false }),
}, { required: ['propertyId'] });

export const PROPERTY_OPERATIONS_SKILL = withConfirmation(createExternalActionSkill({
  id: 'hotel-property-operations',
  name: 'Property Operations',
  description: 'Unified PMS router for housekeeping, maintenance, room status, task dispatch, issue tracking, and inventory operations. Mutating requests require confirmation and default to dry-run.',
  system: 'hotel-pms',
  action: 'property-operations',
  endpoint: { envVar: 'HOTEL_HOME', method: 'POST' },
  auth: { type: 'bearer', credentialEnvKeyMap: { token: 'HOTEL_API_TOKEN' } },
  credentialSource: { token: { envVar: 'HOTEL_API_TOKEN', configKey: 'hotel.token' } },
  inputSchema: PROPERTY_OPERATIONS_INPUT_SCHEMA,
  outputSchema: EXTERNAL_OUTPUT_SCHEMA,
  configSchema: EXTERNAL_CONFIG_SCHEMA,
  timeoutMs: 60000,
  tier: 'represent',
  domainKnowledge: 'Hotel property operations, housekeeping, maintenance, and room management',
  triggers: [
    { kind: 'user', phrase_examples: ['Update room status', 'Dispatch housekeeping', 'Create a maintenance issue', 'Check inventory'] },
  ],
}));
