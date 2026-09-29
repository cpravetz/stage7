/**
 * Domain-local output contract for the HR Recruitment skills.
 *
 * This is the shape every HR skill returns, expressed in terms of the generic presentation
 * contract in the shared type package. It lives inside the HR domain on purpose: the core
 * executor and renderer know only that a result may carry a list of presentation blocks, and this
 * module is what binds that generic shape to how the HR skills are expected to be written.
 */
import { SchemaRecord } from '../../../types';

export const HR_PRESENT_SCHEMA: SchemaRecord = {
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
export const hrResultSchema = (dataDescription: string): SchemaRecord => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', description: 'Whether the skill completed the work it claims to have done' },
    status: { type: ['string', 'null'], description: 'ok, partial, failed, blocked, not-connected, confirmation-required, or error' },
    data: { type: ['object', 'null'], description: dataDescription },
    error: { type: ['string', 'null'], description: 'Failure message' },
    present: HR_PRESENT_SCHEMA,
  },
  required: ['success', 'present'],
});

/**
 * Output contract for the external-action transport tools in the HR domain.
 *
 * `createExternalActionSkill` always emits a boolean `success` plus the constant `system` and
 * `action` strings, initialising `request`, `response`, and `error` to null. Those fields are
 * declared with a union type and kept out of `required`; only the fields genuinely always present
 * stay required.
 */
export const HR_EXTERNAL_OUTPUT_SCHEMA: SchemaRecord = {
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
    present: HR_PRESENT_SCHEMA,
  },
  required: ['success', 'system', 'action', 'present'],
};