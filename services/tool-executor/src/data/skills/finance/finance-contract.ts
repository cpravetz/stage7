/**
 * Domain-local output contract for the Finance Advisor skills.
 *
 * Each finance skill must emit a `present` array of user-facing presentation blocks
 * conforming to the generic presentation contract. This module defines that shape
 * for the finance domain and a small helper to produce the overall result schema.
 */
export const FINANCE_PRESENT_SCHEMA = {
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

export const financeResultSchema = (dataDescription: string) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', description: 'Whether the skill completed the work it claims to have done' },
    status: { type: ['string', 'null'], description: 'ok, partial, failed, blocked, not-connected, or confirmation-required' },
    data: { type: ['object', 'null'], description: dataDescription },
    error: { type: ['string', 'null'], description: 'Failure message' },
    present: FINANCE_PRESENT_SCHEMA,
  },
  required: ['success', 'present'],
});
