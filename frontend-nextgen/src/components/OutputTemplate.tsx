import React, { type ReactNode } from 'react';

const ACRONYMS = new Set([
  'API', 'URL', 'ID', 'JSON', 'HTML', 'SEO', 'CRM', 'HTTP', 'UUID', 'CSV', 'PDF', 'XML', 'RSS', 'SSL', 'TLS',
]);

const outputHumanizeKey = (key: string): string => {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return words.map((word) => {
    const upper = word.toUpperCase();
    return ACRONYMS.has(upper) ? upper : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
};

const outputTryParseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

export const parseExecutionResult = (result: unknown, depth = 0): unknown => {
  if (depth > 10) return result;
  if (result === null || result === undefined) return result;

  if (typeof result === 'string') {
    const parsed = outputTryParseJson(result);
    if (parsed !== undefined && parsed !== null && typeof parsed === 'object') {
      return parseExecutionResult(parsed, depth + 1);
    }
    return result;
  }

  if (Array.isArray(result)) {
    return result.map((item) => parseExecutionResult(item, depth + 1));
  }

  if (typeof result === 'object') {
    const record = result as Record<string, unknown>;

    if (typeof record.output === 'string') {
      const parsedOutput = outputTryParseJson(record.output);
      if (parsedOutput !== undefined && parsedOutput !== null && typeof parsedOutput === 'object') {
        const merged: Record<string, unknown> = { ...(parsedOutput as Record<string, unknown>) };
        for (const [key, val] of Object.entries(record)) {
          if (key !== 'output') {
            merged[key] = val;
          }
        }
        return parseExecutionResult(merged, depth + 1);
      }
    }

    const unwrapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (typeof value === 'string') {
        const parsed = outputTryParseJson(value);
        if (parsed !== undefined && parsed !== null && typeof parsed === 'object') {
          unwrapped[key] = parseExecutionResult(parsed, depth + 1);
        } else {
          unwrapped[key] = value;
        }
      } else if (value !== null && typeof value === 'object') {
        unwrapped[key] = parseExecutionResult(value, depth + 1);
      } else {
        unwrapped[key] = value;
      }
    }
    return unwrapped;
  }

  return result;
};

const outputGetSchemaProperties = (
  schema?: Record<string, unknown>,
): Record<string, Record<string, unknown>> => {
  const properties = schema?.properties;
  return properties && typeof properties === 'object' && !Array.isArray(properties)
    ? properties as Record<string, Record<string, unknown>>
    : {};
};

const outputGetFieldLabel = (key: string, schema?: Record<string, unknown>): string => {
  if (schema) {
    const label = String(schema.title || schema.label || schema['x-label'] || '');
    if (label) return label;
  }
  return outputHumanizeKey(key);
};

const outputGetFieldDescription = (schema?: Record<string, unknown>): string => {
  if (!schema) return '';
  return String(schema.description || schema.hint || '');
};

const outputExtractDisplayMessage = (value: unknown, fallback: string): string => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const field of ['message', 'error', 'reason', 'detail', 'description']) {
      const msg = record[field];
      if (typeof msg === 'string' && msg.trim()) return msg.trim();
    }
  }
  return fallback;
};

const INTERNAL_KEYS = new Set([
  'success', 'status', 'error', 'message', 'exitCode', 'durationMs',
  'mode', 'delegatedTo', 'data', 'output',
]);

const MAX_RENDER_DEPTH = 5;
const MAX_ARRAY_ITEMS = 5;
const MAX_STRING_LENGTH = 200;

const outputRenderValue = (value: unknown, depth = 0): ReactNode => {
  if (value === null || value === undefined) {
    return <span className="muted">—</span>;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const str = String(value);
    if (typeof value === 'string' && str.length > MAX_STRING_LENGTH) {
      return <span title={str}>{str.slice(0, MAX_STRING_LENGTH)}…</span>;
    }
    return <>{str}</>;
  }

  if (Array.isArray(value)) {
    const items = value as unknown[];
    if (items.length === 0) {
      return <span className="muted">No items</span>;
    }
    const displayed = items.slice(0, MAX_ARRAY_ITEMS);
    return (
      <span>
        <ul className="result-list">
          {displayed.map((item, i) => (
            <li key={i}>{outputRenderValue(item, depth + 1)}</li>
          ))}
        </ul>
        {items.length > MAX_ARRAY_ITEMS && (
          <span className="muted"> +{items.length - MAX_ARRAY_ITEMS} more</span>
        )}
      </span>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== null && v !== undefined,
    );
    if (entries.length === 0) {
      return <span className="muted">—</span>;
    }
    if (depth >= MAX_RENDER_DEPTH) {
      return (
        <span className="muted">
          {entries.length} propert{entries.length === 1 ? 'y' : 'ies'}
        </span>
      );
    }
    return (
      <div className="result-sub">
        {entries.map(([key, nestedValue]) => (
          <div key={key} className="result-field">
            <span className="muted">{outputHumanizeKey(key)}:</span>{' '}
            {outputRenderValue(nestedValue, depth + 1)}
          </div>
        ))}
      </div>
    );
  }

  return null;
};

interface OutputTemplateProps {
  outputSchema: Record<string, unknown> | undefined;
  result: unknown;
}

const OutputTemplate: React.FC<OutputTemplateProps> = ({ outputSchema, result }) => {
  const parsed = parseExecutionResult(result);

  if (parsed === null || parsed === undefined) {
    return <span className="muted">No output available</span>;
  }

  if (Array.isArray(parsed)) {
    return (
      <div className="skill-result success">
        {outputRenderValue(parsed)}
      </div>
    );
  }

  if (typeof parsed !== 'object') {
    return (
      <div className="skill-result success">
        <div className="result-field">{outputRenderValue(parsed)}</div>
      </div>
    );
  }

  const record = parsed as Record<string, unknown>;

  if (record.status === 'not-connected') {
    const message = outputExtractDisplayMessage(
      record.error || record.message || record.reason,
      'Not connected to the service',
    );
    return (
      <div className="skill-result warning">
        <div className="warning-banner">{message}</div>
      </div>
    );
  }

  const isError =
    record.success === false ||
    (record.error !== undefined && record.error !== null && record.error !== '') ||
    record.status === 'failed';

  if (isError) {
    const errValue =
      record.error !== undefined && record.error !== null && record.error !== ''
        ? record.error
        : record.message;
    const message = outputExtractDisplayMessage(errValue, 'Execution failed');
    return (
      <div className="skill-result error">
        <div className="error-banner">{message}</div>
      </div>
    );
  }

  if (typeof record.output === 'string' && record.output.trim() !== '') {
    return (
      <div className="skill-result success">
        <div className="result-field">{record.output}</div>
      </div>
    );
  }

  if (typeof record.data === 'string' && record.data.trim() !== '') {
    return (
      <div className="skill-result success">
        <div className="result-field">{record.data}</div>
      </div>
    );
  }

  const data: Record<string, unknown> =
    record.data && typeof record.data === 'object' && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : record;

  const properties = outputGetSchemaProperties(outputSchema);
  const schemaKeys = Object.keys(properties).filter((k) => !k.startsWith('_'));

  if (schemaKeys.length > 0) {
    return (
      <div className="skill-result success">
        {schemaKeys.map((key) => {
          const fieldSchema = properties[key] || {};
          const label = outputGetFieldLabel(key, fieldSchema);
          const description = outputGetFieldDescription(fieldSchema);
          const value = data[key];

          return (
            <div key={key} className="result-field">
              <strong>{label}</strong>
              {description ? (
                <span className="muted" style={{ display: 'block' }}>
                  {description}
                </span>
              ) : null}
              {outputRenderValue(value)}
            </div>
          );
        })}
      </div>
    );
  }

  const entries = Object.entries(data).filter(
    ([key, value]) =>
      !key.startsWith('_') &&
      !INTERNAL_KEYS.has(key) &&
      value !== null &&
      value !== undefined,
  );

  if (entries.length === 0) {
    return (
      <div className="skill-result success">
        <span className="muted">Operation completed successfully</span>
      </div>
    );
  }

  return (
    <div className="skill-result success">
      {entries.map(([key, value]) => (
        <div key={key} className="result-field">
          <strong>{outputHumanizeKey(key)}:</strong>{' '}
          {outputRenderValue(value)}
        </div>
      ))}
    </div>
  );
};

export default OutputTemplate;
