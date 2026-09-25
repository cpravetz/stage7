import { type ReactNode } from 'react';

type JsonObject = Record<string, unknown>;

const srTryParseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const srFormatTextValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

const srHumanizeKey = (key: string): string => {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const acronyms = new Set(['API', 'URL', 'ID', 'JSON', 'HTML', 'SEO', 'CRM', 'HTTP', 'UUID', 'CSV', 'PDF', 'XML', 'RSS', 'SSL', 'TLS']);
  return words.map((word) => {
    const upper = word.toUpperCase();
    return acronyms.has(upper) ? upper : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
};

const srGetErrorMessage = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const record = value as JsonObject;
    if (typeof record.message === 'string') return record.message;
    if (typeof record.error === 'string') return record.error;
  }
  return srFormatTextValue(value) || 'Execution failed';
};

const srGetDisplayMessage = (value: unknown, fallback: string): string => {
  if (value === null || value === undefined) return fallback;
  return srGetErrorMessage(value) || fallback;
};

const srRenderValue = (value: unknown): ReactNode => {
  if (value === null || value === undefined) return <span className="muted">—</span>;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const stringValue = String(value);
    return typeof value === 'string' && stringValue.length > 200
      ? <span title={stringValue}>{stringValue.slice(0, 200)}…</span>
      : <>{stringValue}</>;
  }
  if (Array.isArray(value)) {
    const items = value as unknown[];
    return (
      <span>
        <span className="muted">({items.length} items)</span>
        {items.length > 0 && items.length <= 5 && (
          <ul className="result-list">
            {items.map((item, index) => <li key={index}>{srRenderValue(item)}</li>)}
          </ul>
        )}
        {items.length > 5 && <span className="muted"> Showing first 5 of {items.length}</span>}
      </span>
    );
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as JsonObject).filter(([, nestedValue]) => nestedValue !== null && nestedValue !== undefined);
    if (entries.length === 0) return <span className="muted">—</span>;
    return (
      <div className="result-sub">
        {entries.map(([key, nestedValue]) => (
          <div key={key}>
            <span className="muted">{srHumanizeKey(key)}:</span>{' '}
            {srRenderValue(nestedValue)}
          </div>
        ))}
      </div>
    );
  }
  return <pre className="code-block">{String(value)}</pre>;
};

const srRenderObject = (object: JsonObject, depth = 0): ReactNode => {
  const hasError = object.success === false ||
    (object.error !== undefined && object.error !== null && object.error !== '');
  if (hasError) {
    return (
      <div className="skill-result error">
        <h6>Last result</h6>
        <div className="error-banner">{srGetDisplayMessage((object.error !== undefined && object.error !== null && object.error !== '') ? object.error : object.message, 'Execution failed')}</div>
        {typeof object.mode === 'string' && object.mode && <span className="badge">{object.mode}</span>}
      </div>
    );
  }

  if (object.mode === 'not-connected') {
    const message = srGetDisplayMessage((object.error !== undefined && object.error !== null && object.error !== '') ? object.error : object.message, 'Not connected');
    return (
      <div className="skill-result warning">
        <h6>Last result</h6>
        <div className="warning-banner">{message}</div>
        {Array.isArray(object.delegatedTo) && object.delegatedTo.length > 0 && (
          <p className="muted">Delegated to: {object.delegatedTo.map((item) => String(item)).join(', ')}</p>
        )}
      </div>
    );
  }

  if (typeof object.output === 'string' && depth < 5) {
    const nested = srTryParseJson(object.output);
    if (nested !== undefined) {
      if (nested !== null && typeof nested === 'object') {
        return srRenderObject(nested as JsonObject, depth + 1);
      }
      return srRenderValue(nested);
    }
  }

  const data = object.data && typeof object.data === 'object' && !Array.isArray(object.data)
    ? object.data as JsonObject
    : object;
  const entries = Object.entries(data).filter(([key, value]) =>
    !key.startsWith('_') && value !== null && value !== undefined
  );

  return (
    <div className="skill-result success">
      <h6>Last result</h6>
      {entries.map(([key, value]) => (
        <div key={key} className="result-field">
          <strong>{srHumanizeKey(key)}:</strong>{' '}
          {srRenderValue(value)}
        </div>
      ))}
      {Array.isArray(object.delegatedTo) && object.delegatedTo.length > 0 && (
        <p className="muted">Delegated to: {object.delegatedTo.map((item) => String(item)).join(', ')}</p>
      )}
    </div>
  );
};

interface StructuredResultProps {
  text: string;
}

export const StructuredResult = ({ text }: StructuredResultProps): ReactNode => {
  const parsed = srTryParseJson(text);
  if (parsed === undefined) {
    return <pre className="code-block">{text}</pre>;
  }

  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return srRenderObject(parsed as JsonObject);
  }
  return <pre className="code-block">{text}</pre>;
};
