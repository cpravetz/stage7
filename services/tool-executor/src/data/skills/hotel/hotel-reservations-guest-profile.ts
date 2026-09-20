import { Tool, SchemaRecord } from '../../../types';
import { createExternalActionSkill, createSchemaRecord, SchemaProps } from '../code-skill-factory';

const HOTEL_HOME = process.env.HOTEL_HOME || '/tmp/hotel';

const RESERVATION_OPERATIONS = [
  'manage-reservation',
  'room-assignment',
  'guest-profile',
  'external-booking',
  'billing',
];

const EXTERNAL_OUTPUT_SCHEMA = createSchemaRecord({
  success: SchemaProps.boolean({ description: 'Whether the external operation completed successfully' }),
  mode: SchemaProps.select(['dry-run', 'live', 'error'], { description: 'Execution mode returned by the connector' }),
  system: SchemaProps.text({ description: 'Hotel system that handled the operation' }),
  action: SchemaProps.text({ description: 'High-level action executed by the connector' }),
  operation: SchemaProps.text({ description: 'Selected hotel operation' }),
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
  required: ['success', 'mode', 'system', 'action', 'operation', 'request', 'response', 'error'],
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

const RESERVATIONS_INPUT_SCHEMA = createSchemaRecord({
  operation: SchemaProps.select(RESERVATION_OPERATIONS, {
    description: 'Reservation, room, guest, booking, or billing operation to perform',
    required: true,
  }),
  propertyId: SchemaProps.text({ description: 'Hotel property identifier', required: true }),
  reservationId: SchemaProps.text({ description: 'Reservation identifier' }),
  guestId: SchemaProps.text({ description: 'Guest profile identifier' }),
  roomId: SchemaProps.text({ description: 'Room identifier for assignment or status changes' }),
  guestName: SchemaProps.text({ description: 'Guest name for a new reservation or profile' }),
  email: SchemaProps.email({ description: 'Guest email address' }),
  phone: SchemaProps.text({ description: 'Guest phone number' }),
  checkIn: SchemaProps.text({ description: 'Check-in date in ISO 8601 or YYYY-MM-DD format' }),
  checkOut: SchemaProps.text({ description: 'Check-out date in ISO 8601 or YYYY-MM-DD format' }),
  roomType: SchemaProps.text({ description: 'Requested room type or rate-plan category' }),
  channel: SchemaProps.text({ description: 'External booking channel, such as direct, ota, gds, or a channel name' }),
  currency: SchemaProps.text({ description: 'Billing currency code, such as USD or EUR' }),
  amount: SchemaProps.number({ description: 'Billing amount or payment amount', minimum: 0 }),
  paymentMethod: SchemaProps.text({ description: 'Payment method or gateway reference' }),
  lineItems: SchemaProps.objectArray(SchemaProps.object({
    description: SchemaProps.text({ description: 'Line-item description' }),
    quantity: SchemaProps.number({ description: 'Line-item quantity', minimum: 0 }),
    unitPrice: SchemaProps.number({ description: 'Line-item unit price', minimum: 0 }),
    amount: SchemaProps.number({ description: 'Line-item total', minimum: 0 }),
  }, {}), { description: 'Folio, invoice, or booking line items' }),
  dateRange: SchemaProps.object({
    start: SchemaProps.text({ description: 'Range start date or timestamp' }),
    end: SchemaProps.text({ description: 'Range end date or timestamp' }),
  }, { description: 'Date range for reservation, billing, or booking operations' }),
  filters: SchemaProps.object({}, { description: 'Operation-specific query filters', additionalProperties: true }),
  data: SchemaProps.object({}, { description: 'Operation-specific reservation or guest data', additionalProperties: true }),
  payload: SchemaProps.object({}, { description: 'Full operation payload for connector-specific fields', additionalProperties: true }),
  dryRun: SchemaProps.boolean({ description: 'Validate the request without sending a live mutation', default: true }),
  confirmation: SchemaProps.boolean({ description: 'Explicit approval for a live mutating request; dryRun does not require approval', default: false }),
}, { required: ['operation', 'propertyId'] });

export const RESERVATIONS_SKILL = withConfirmation(createExternalActionSkill({
  id: 'hotel-reservations-guest-profile',
  name: 'Reservations & Guest Profile',
  description: 'Unified PMS router for reservation lifecycle, room assignment, guest profiles, external bookings, and billing. Mutating requests require confirmation and default to dry-run.',
  system: 'hotel-pms',
  action: 'reservations-guest-profile',
  endpoint: { envVar: 'HOTEL_HOME', method: 'POST' },
  auth: { type: 'bearer', credentialEnvKeyMap: { token: 'HOTEL_API_TOKEN' } },
  credentialSource: { token: { envVar: 'HOTEL_API_TOKEN', configKey: 'hotel.token' } },
  inputSchema: RESERVATIONS_INPUT_SCHEMA,
  outputSchema: EXTERNAL_OUTPUT_SCHEMA,
  configSchema: EXTERNAL_CONFIG_SCHEMA,
  timeoutMs: 60000,
  triggers: [
    { kind: 'user', phrase_examples: ['Manage a reservation', 'Assign a room', 'Update a guest profile', 'Check a folio'] },
    { kind: 'schedule', cadence: 'Daily reservation and billing review' },
  ],
}));
