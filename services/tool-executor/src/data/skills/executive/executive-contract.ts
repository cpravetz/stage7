/**
 * Domain-local output contract for the Executive Advisor skills.
 *
 * This is the shape every executive skill returns, expressed in terms of the generic presentation
 * contract in the shared type package. It lives inside the executive domain on purpose: the core
 * executor and renderer know only that a result may carry a list of presentation blocks, and this
 * module is what binds that generic shape to how the executive skills are expected to be written.
 */
export const EXECUTIVE_PRESENT_SCHEMA = {
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
export const executiveResultSchema = (dataDescription: string) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', description: 'Whether the skill completed the work it claims to have done' },
    status: { type: ['string', 'null'], description: 'ok, partial, failed, blocked, not-connected, safety-escalation, confirmation-required, or error' },
    data: { type: ['object', 'null'], description: dataDescription },
    error: { type: ['string', 'null'], description: 'Failure message' },
    present: EXECUTIVE_PRESENT_SCHEMA,
  },
  required: ['success', 'present'],
});