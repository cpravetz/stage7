/**
 * Domain-local output contract for the Sales Advisor skills.
 *
 * The generic presentation contract lives in the shared type package: a result may carry a list of
 * blocks shaped { id, title?, body, kind? }. This module binds that generic shape to how the sales
 * skills are expected to be written. It lives inside the sales domain on purpose — the core
 * executor, the router, and the UI renderer know only that a result may carry a list of
 * presentation blocks, never what a sales block contains or how it is laid out.
 *
 * Adding a sales skill must not require editing anything outside this directory.
 */
export const SALES_PRESENT_SCHEMA = {
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
 * `present` is required so a skill that forgets to render is caught by the runtime validator rather
 * than silently shown to the user as a JSON dump. Nullable fields are declared with a union type
 * but deliberately kept out of `required`: a field that is legitimately null on a failure path is
 * not a contract violation.
 */
export const salesResultSchema = (dataDescription: string) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', description: 'Whether the skill completed the work it claims to have done' },
    status: {
      type: ['string', 'null'],
      description: 'ok, partial, failed, blocked, not-connected, confirmation-required, dry-run, or error',
    },
    data: { type: ['object', 'null'], description: dataDescription },
    error: { type: ['string', 'null'], description: 'Failure message' },
    present: SALES_PRESENT_SCHEMA,
  },
  required: ['success', 'present'],
});
