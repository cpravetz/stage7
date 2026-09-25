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

const GUEST_EXPERIENCE_INPUT_SCHEMA = createSchemaRecord({
  propertyId: SchemaProps.text({ description: 'Hotel property identifier', required: true }),
  guestId: SchemaProps.text({ description: 'Guest identifier' }),
  reservationId: SchemaProps.text({ description: 'Related reservation identifier' }),
  requestId: SchemaProps.text({ description: 'Guest-service request identifier' }),
  query: SchemaProps.textarea({ description: 'Concierge question or local-information search query' }),
  category: SchemaProps.select(['dining', 'transport', 'attractions', 'events', 'wellness', 'shopping', 'business', 'emergency'], {
    description: 'Concierge or local-information category',
  }),
  language: SchemaProps.text({ description: 'Preferred response language code, such as en, es, or fr' }),
  location: SchemaProps.object({
    address: SchemaProps.text({ description: 'Street address or place name' }),
    latitude: SchemaProps.number({ description: 'Latitude coordinate' }),
    longitude: SchemaProps.number({ description: 'Longitude coordinate' }),
  }, { description: 'Location used to center recommendations or local results' }),
  radiusKm: SchemaProps.number({ description: 'Search radius in kilometers', minimum: 0 }),
  rating: SchemaProps.number({ description: 'Minimum recommendation rating', minimum: 0, maximum: 5 }),
  tags: SchemaProps.stringArray({ description: 'Recommendation or content tags' }),
  channel: SchemaProps.select(['email', 'sms', 'push', 'portal', 'phone', 'whatsapp'], { description: 'Guest communication channel' }),
  templateId: SchemaProps.text({ description: 'Communication template identifier' }),
  subject: SchemaProps.text({ description: 'Guest message subject' }),
  message: SchemaProps.textarea({ description: 'Guest-facing message or service response draft' }),
  variables: SchemaProps.object({}, { description: 'Template variables for personalized communication', additionalProperties: true }),
  scheduledAt: SchemaProps.datetime({ description: 'Scheduled communication time in ISO 8601 format' }),
  urgency: SchemaProps.select(['low', 'medium', 'high', 'urgent'], { description: 'Guest-service request urgency' }),
  filters: SchemaProps.object({}, { description: 'Operation-specific search or service filters', additionalProperties: true }),
  data: SchemaProps.object({}, { description: 'Operation-specific guest-experience data', additionalProperties: true }),
  payload: SchemaProps.object({}, { description: 'Full operation payload for connector-specific fields', additionalProperties: true }),
  dryRun: SchemaProps.boolean({ description: 'Validate the request without sending a live mutation', default: true }),
  confirmation: SchemaProps.boolean({ description: 'Explicit approval for a live mutating request; dryRun does not require approval', default: false }),
}, { required: ['propertyId'] });

export const GUEST_EXPERIENCE_SKILL = withConfirmation(createExternalActionSkill({
  id: 'hotel-guest-experience',
  name: 'Guest Experience',
  description: 'Unified PMS router for concierge knowledge, local recommendations, guest services, and guest communications. Mutating requests require confirmation and default to dry-run.',
  system: 'hotel-pms',
  action: 'guest-experience',
  endpoint: { envVar: 'HOTEL_HOME', method: 'POST' },
  auth: { type: 'bearer', credentialEnvKeyMap: { token: 'HOTEL_API_TOKEN' } },
  credentialSource: { token: { envVar: 'HOTEL_API_TOKEN', configKey: 'hotel.token' } },
  inputSchema: GUEST_EXPERIENCE_INPUT_SCHEMA,
  outputSchema: EXTERNAL_OUTPUT_SCHEMA,
  configSchema: EXTERNAL_CONFIG_SCHEMA,
  timeoutMs: 45000,
  tier: 'aid',
  domainKnowledge: 'Hotel guest services, concierge knowledge, local information, and guest communication',
  triggers: [
    { kind: 'user', phrase_examples: ['Recommend a local restaurant', 'Handle a guest request', 'Draft a guest message'] },
  ],
isSkill: true,
}));
