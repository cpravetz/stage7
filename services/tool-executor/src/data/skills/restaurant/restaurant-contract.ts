/**
 * Domain-local output contract for the Restaurant Operations skills.
 *
 * This is the shape every restaurant skill returns, expressed in terms of the
 * generic presentation contract in the shared type package. It lives inside
 * the restaurant domain on purpose: the core executor and renderer know only
 * that a result may carry a list of presentation blocks, and this module is what
 * binds that generic shape to how the restaurant skills are expected to be
 * written.
 */

const SAFETY_BOUNDARY =
  'This output is derived from the inputs you supplied and local computation only; it is not a substitute for professional financial, legal, or operational advice. Forecasts are illustrative. When an external endpoint is not configured, the skill reports not-connected rather than fabricating data. A manager must authorise any live mutation.';

export const RESTAURANT_SAFETY_BOUNDARY = SAFETY_BOUNDARY;

export const RESTAURANT_PRESENT_SCHEMA = {
  type: 'array',
  description: 'User-formatted blocks conforming to the generic presentation contract',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      title: { type: 'string' },
      body: { type: 'string' },
      kind: { type: 'string' },
    },
    required: ['id', 'body'],
  },
};

export const restaurantResultSchema = (dataDescription: string) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', description: 'Whether the skill completed the work it claims to have done' },
    status: { type: ['string', 'null'], description: 'ok, partial, failed, blocked, not-connected, confirmation-required, or error' },
    data: { type: ['object', 'null'], description: dataDescription },
    error: { type: ['string', 'null'], description: 'Failure message' },
    present: RESTAURANT_PRESENT_SCHEMA,
  },
  required: ['success', 'present'],
});

export const RESTAURANT_EXTERNAL_OUTPUT_SCHEMA = {
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
  required: ['success', 'system', 'action'],
};
