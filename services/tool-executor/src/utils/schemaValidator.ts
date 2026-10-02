import { SchemaRecord } from '../types';

export interface SchemaValidationIssue {
  path: string;
  message: string;
}

type Schema = Record<string, unknown> | undefined;

const typeOf = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
};

const typeMatches = (value: unknown, expected: string): boolean => {
  const actual = typeOf(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  if (expected === 'integer') return actual === 'integer';
  if (expected === 'object') return actual === 'object';
  return actual === expected;
};

const collectIssues = (value: unknown, schema: Schema, path: string, issues: SchemaValidationIssue[]): void => {
  if (!schema || typeof schema !== 'object') return;

  const expectedType = schema.type;
  if (typeof expectedType === 'string') {
    if (!typeMatches(value, expectedType)) {
      issues.push({ path: path || '(root)', message: `expected type ${expectedType}, received ${typeOf(value)}` });
      return;
    }
  } else if (Array.isArray(expectedType)) {
    const allowed = expectedType.filter((t): t is string => typeof t === 'string');
    if (allowed.length > 0 && !allowed.some((t) => typeMatches(value, t))) {
      issues.push({
        path: path || '(root)',
        message: `expected one of [${allowed.join(', ')}], received ${typeOf(value)}`,
      });
      return;
    }
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    // An enum entry may be a bare value or a { value, label } pair. The pair exists
    // so a select can show wording a user can act on ("Assess your own
    // emotional intelligence") while still submitting a stable identifier; only the
    // value half takes part in validation.
    const allowed = schema.enum.map((entry) =>
      entry !== null && typeof entry === 'object' && 'value' in (entry as Record<string, unknown>)
        ? (entry as { value: unknown }).value
        : entry,
    );
    if (!allowed.includes(value as never)) {
      issues.push({
        path: path || '(root)',
        message: `value ${JSON.stringify(value)} is not one of the declared enum`,
      });
    }
  }

  if (Array.isArray(value)) {
    const items = schema.items as Schema;
    if (items) {
      value.forEach((item, i) => collectIssues(item, items, `${path}[${i}]`, issues));
    }
    return;
  }

  if (typeOf(value) !== 'object') return;

  const record = value as Record<string, unknown>;
  const properties = (schema.properties as Record<string, Schema> | undefined) || undefined;

  if (Array.isArray(schema.required)) {
    for (const key of schema.required) {
      if (typeof key !== 'string') continue;
      const present = record[key] !== undefined && record[key] !== null;
      if (!present) {
        issues.push({ path: path ? `${path}.${key}` : key, message: 'required property is missing' });
      }
    }
  }

  if (properties) {
    for (const [key, childSchema] of Object.entries(properties)) {
      if (record[key] === undefined) continue;
      collectIssues(record[key], childSchema, path ? `${path}.${key}` : key, issues);
    }
  }
};

/**
 * Validate a tool result against the tool's declared outputSchema.
 *
 * This is deliberately schema-driven with no knowledge of any individual tool: a skill that
 * declares an outputSchema should be held to it, and drift between the declared contract and the
 * emitted payload should be observable rather than silent.
 */
export const validateAgainstOutputSchema = (
  value: unknown,
  schema: SchemaRecord | undefined,
): SchemaValidationIssue[] => {
  if (!schema || typeof schema !== 'object') return [];
  if (!schema.properties && !schema.required) return [];
  const issues: SchemaValidationIssue[] = [];
  collectIssues(value, schema as Schema, '', issues);
  return issues;
};

/** Parse a code tool's stdout as JSON, returning undefined when it is not JSON. */
export const parseToolOutputJson = (output: unknown): unknown => {
  if (output === null || output === undefined) return undefined;
  if (typeof output !== 'string') return output;
  const trimmed = output.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
};
