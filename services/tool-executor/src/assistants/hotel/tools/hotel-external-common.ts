import { Tool } from '../../../types';
import { createSchemaRecord, SchemaProps } from '../../../adk/code-skill-factory';

export const HOTEL_EXTERNAL_OUTPUT_SCHEMA = createSchemaRecord({
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

export const HOTEL_EXTERNAL_CONFIG_SCHEMA = createSchemaRecord({
  hotelHome: SchemaProps.text({
    description: 'Hotel PMS base URL or local hotel service home',
    default: 'HOTEL_HOME',
  }),
  apiToken: SchemaProps.password({ description: 'Bearer token for the hotel PMS' }),
  provider: SchemaProps.text({ description: 'PMS or channel manager provider, such as opera, mews, cloudbeds, or custom' }),
  apiVersion: SchemaProps.text({ description: 'Optional hotel API version' }),
});

/** Task-input fields shared by every property-operations skill. */
export const HOTEL_PROPERTY_BASE_INPUT = {
  propertyId: SchemaProps.reference('hotel-properties', { description: 'Hotel property identifier', required: true }),
  dryRun: SchemaProps.boolean({ description: 'Validate the request without sending a live mutation', default: true }),
  confirmation: SchemaProps.boolean({ description: 'Explicit approval for a live mutating request; dryRun does not require approval', default: false }),
};

export const HOTEL_LOCATION_INPUT = SchemaProps.object({
  label: SchemaProps.text({ description: 'Human-readable location' }),
  floor: SchemaProps.text({ description: 'Floor or building area' }),
  roomNumber: SchemaProps.text({ description: 'Room number when applicable' }),
}, { description: 'Physical location for an operational task' });
