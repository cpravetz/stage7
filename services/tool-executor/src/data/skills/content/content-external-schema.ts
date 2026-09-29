/**
 * Output contract for the content domain's external-action transport tools.
 *
 * `createExternalActionSkill` always emits a boolean `success` plus the constant `system` and
 * `action` strings, but it initialises `request`, `response`, and `error` to null and only fills
 * them in on some paths. The previous schema listed all three of those in `required`, so every
 * not-connected run reported the contract as violated. They are declared with a union type and kept
 * out of `required`; the fields that are genuinely always present stay required.
 */
export const CONTENT_EXTERNAL_OUTPUT_SCHEMA = {
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
