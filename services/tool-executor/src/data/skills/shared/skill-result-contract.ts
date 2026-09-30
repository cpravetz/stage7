/**
 * Domain-agnostic output contract for Stage7 Skills.
 *
 * Each skill must emit a `present` array of user-facing presentation blocks
 * conforming to the generic presentation contract. This module defines that shape
 * and standard schema builders.
 */

export const PRESENT_SCHEMA = {
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

export const present = (
  id: string,
  title: string,
  body: string,
  kind: 'text' | 'markdown' | 'json' | string = 'text'
) => ({
  id,
  title,
  body,
  kind,
});

export interface ResultSchemaOptions {
  extraStatuses?: string[];
  safetyBoundary?: string;
}

export function resultSchema(
  dataDescription: string,
  options?: ResultSchemaOptions
) {
  const defaultStatuses = ['ok', 'partial', 'failed', 'blocked', 'not-connected', 'confirmation-required'];
  const extraStatuses = options?.extraStatuses || [];
  const allStatuses = Array.from(new Set([...defaultStatuses, ...extraStatuses]));
  const statusDescription = `${allStatuses.join(', ')}${
    options?.safetyBoundary ? `. Safety boundary: ${options.safetyBoundary}` : ''
  }`;

  return {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the skill completed the work it claims to have done',
      },
      status: {
        type: ['string', 'null'],
        description: statusDescription,
      },
      data: { type: ['object', 'null'], description: dataDescription },
      error: { type: ['string', 'null'], description: 'Failure message' },
      present: PRESENT_SCHEMA,
    },
    required: ['success', 'present'],
  };
}

export const EXTERNAL_ACTION_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    system: { type: 'string' },
    action: { type: 'string' },
    request: {
      type: 'object',
      properties: {
        input: { type: 'object' },
        endpoint: { type: 'string' },
        method: { type: 'string' },
        headers: { type: 'object' },
      },
    },
    response: {
      type: 'object',
      properties: {
        status: { type: 'number' },
        data: { type: 'object' },
      },
    },
    error: { type: 'string' },
    present: PRESENT_SCHEMA,
  },
  required: ['success', 'system', 'action', 'request', 'response', 'error'],
};
