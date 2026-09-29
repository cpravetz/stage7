/**
 * Domain-local output contract for the Investment Advisor skills.
 *
 * This is the shape every investment skill returns, expressed in terms of the
 * generic presentation contract in the shared type package. It lives inside the
 * investment domain on purpose: the core executor, the router, the tool
 * registry, and the UI renderer know only that a result may carry a list of
 * presentation blocks, and this module is what binds that generic shape to how
 * the investment skills are expected to be written.
 *
 * Adding an investment skill must not require editing anything outside this
 * directory.
 */
export const INVESTMENT_PRESENT_SCHEMA = {
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

/**
 * `present` is required so a skill that forgets to render is caught by the
 * runtime validator rather than silently shown to the user as a JSON dump.
 * Nullable fields are declared with a union type but deliberately kept out of
 * `required`: a field that is legitimately null on a failure path is not a
 * contract violation.
 */
export const investmentResultSchema = (dataDescription: string) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', description: 'Whether the skill completed the work it claims to have done' },
    status: {
      type: ['string', 'null'],
      description: 'ok, partial, failed, blocked, not-connected, confirmation-required, dry-run, or error',
    },
    data: { type: ['object', 'null'], description: dataDescription },
    error: { type: ['string', 'null'], description: 'Failure message' },
    present: INVESTMENT_PRESENT_SCHEMA,
  },
  required: ['success', 'present'],
});
