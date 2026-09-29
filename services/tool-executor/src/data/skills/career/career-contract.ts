/**
 * Presentation contract for career skills output.
 *
 * Every career skill must emit `present` — an array of blocks that the generic
 * UI renderer can display. Each block carries `id`, `body`, an optional `title`
 * and `kind`. The renderer never needs to know the domain; the skill renders the
 * body text itself.
 */
export const CAREER_PRESENT_SCHEMA = {
  type: 'array',
  description: 'User-formatted blocks conforming to the generic presentation contract',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      title: { type: 'string' },
      kind: { type: 'string' },
      body: { type: 'string' },
    },
    required: ['id', 'body'],
  },
};

/**
 * Result schema for career wrapper skills.
 *
 * Nullable fields are declared with a union type but deliberately kept out of
 * `required`: a field that is legitimately null on a failure path is not a
 * contract violation. `success` and `present` are required so a skill that
 * forgets to render is caught rather than silently shown as a JSON dump.
 */
export const careerResultSchema = (dataDescription: string) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', description: 'Whether the skill completed the work it claims to have done' },
    status: {
      type: ['string', 'null'],
      description: 'ok, partial, failed, blocked, not-connected, confirmation-required, dry-run, or error',
    },
    data: { type: ['object', 'null'], description: dataDescription },
    error: { type: ['string', 'null'], description: 'Failure message' },
    present: CAREER_PRESENT_SCHEMA,
  },
  required: ['success', 'present'],
});
