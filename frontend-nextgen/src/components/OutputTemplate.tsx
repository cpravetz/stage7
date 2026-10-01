import React, { type ReactNode, useState } from 'react';
import type { PresentationBlock, PresentationLink, PresentationAction } from '@stage7-nextgen/shared';
import { deleteResource } from '../utils/api';

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

    // Unwrap successive transport envelopes. Tool results arrive as an MCP content array whose
    // text is the executor payload, whose own `output` is the skill's JSON string. Peel whichever
    // envelopes are present so the renderer only ever sees the skill's own result object.
    let current: Record<string, unknown> = record;
    let unwrapped = false;

    for (let depth = 0; depth < 6 && !unwrapped; depth += 1) {
      if (Array.isArray(current.content)) {
        const textItem = current.content.find(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && typeof (item as Record<string, unknown>).text === 'string',
        );
        if (textItem) {
          const parsedContent = outputTryParseJson(textItem.text as string);
          const base =
            parsedContent !== undefined && parsedContent !== null && typeof parsedContent === 'object'
              ? (parsedContent as Record<string, unknown>)
              : { text: textItem.text };
          if (current.isError === true && !base.error) {
            base.error = base.text || 'Tool execution failed';
          }
          current = base;
          unwrapped = true;
        }
      }
      if (!unwrapped && typeof current.output === 'string') {
        const parsedOutput = outputTryParseJson(current.output);
        if (parsedOutput !== undefined && parsedOutput !== null && typeof parsedOutput === 'object') {
          const merged: Record<string, unknown> = { ...(parsedOutput as Record<string, unknown>) };
          for (const [key, val] of Object.entries(current)) {
            if (key !== 'output') merged[key] = val;
          }
          current = merged;
          unwrapped = true;
        }
      }
    }

    if (unwrapped) return parseExecutionResult(current, depth + 1);

    const flattened: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (typeof value === 'string') {
        const parsed = outputTryParseJson(value);
        if (parsed !== undefined && parsed !== null && typeof parsed === 'object') {
          flattened[key] = parseExecutionResult(parsed, depth + 1);
        } else {
          flattened[key] = value;
        }
      } else if (value !== null && typeof value === 'object') {
        flattened[key] = parseExecutionResult(value, depth + 1);
      } else {
        flattened[key] = value;
      }
    }
    return flattened;
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
  'mode', 'delegatedTo', 'data', 'output', 'present',
]);

// Envelope-level keys that describe transport, not result content. A skill whose declared
// outputSchema is { success, data, error } must not have those keys read off its payload.
const ENVELOPE_KEYS = new Set(['success', 'error', 'status', 'message', 'output', 'present']);

const outputIsPresentationBlock = (value: unknown): value is PresentationBlock => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.body === 'string' && candidate.body.trim() !== '';
};

/**
 * Collect the presentation blocks a result exposes, wherever they sit in the envelope. Only the
 * generic contract is inspected: an array of { body: string } blocks. No skill-specific fields.
 */
const outputCollectPresentation = (value: unknown, depth = 0): PresentationBlock[] => {
  if (depth > 6 || value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => outputCollectPresentation(item, depth + 1));
  }
  if (typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  const blocks: PresentationBlock[] = [];

  if (outputIsPresentationBlock(record)) {
    blocks.push(record);
    return blocks;
  }
  if (Array.isArray(record.present)) {
    for (const item of record.present) {
      if (outputIsPresentationBlock(item)) blocks.push(item);
    }
  }
  for (const [key, nested] of Object.entries(record)) {
    if (key === 'present') continue;
    if (nested && typeof nested === 'object') {
      blocks.push(...outputCollectPresentation(nested, depth + 1));
    }
  }
  return blocks;
};

/**
 * Descend through `data` wrappers until reaching the object that actually holds the result. A skill
 * returning `{ success, data: {...} }` nests one level; a delegating skill nests a second. Descending
 * stops as soon as a level carries fields of its own, so a payload with a legitimate `data` property
 * is never skipped over.
 */
const outputResolvePayload = (
  record: Record<string, unknown>,
  outputSchema: Record<string, unknown> | undefined,
): Record<string, unknown> => {
  const schemaKeys = Object.keys(outputGetSchemaProperties(outputSchema));
  let current: Record<string, unknown> = record;

  for (let depth = 0; depth < 4; depth += 1) {
    const inner = current.data;
    if (!inner || typeof inner !== 'object' || Array.isArray(inner)) break;
    const innerRecord = inner as Record<string, unknown>;

    if (schemaKeys.some((key) => key in innerRecord)) return innerRecord;
    const innerKeys = Object.keys(innerRecord);
    const isBareEnvelope = innerKeys.length > 0 && innerKeys.every((key) => ENVELOPE_KEYS.has(key));
    if (!isBareEnvelope) return innerRecord;

    current = innerRecord;
  }

  if (current.data && typeof current.data === 'object' && !Array.isArray(current.data)) {
    return current.data as Record<string, unknown>;
  }
  return current;
};

// The blocks, without a wrapper, so a failure path can show the skill's own report underneath a
// status banner instead of discarding the report and leaving the user with a one-line error.
const outputRenderPresentationBlocks = (blocks: PresentationBlock[]): ReactNode => (
  <>
    {blocks.map((block, i) => (
      <div key={block.id || i} className="result-field" style={{ marginBottom: i < blocks.length - 1 ? 16 : 0 }}>
        {block.title ? <strong style={{ display: 'block' }}>{block.title}</strong> : null}
        <div style={{ whiteSpace: 'pre-wrap' }}>{block.body.trim()}</div>
        {outputRenderPresentationLinks(block.links)}
        {outputRenderPresentationActions(block.actions)}
      </div>
    ))}
  </>
);

// A skill that found a set of real things — postings, documents, articles — attaches them to its
// block as links. Rendering them here is what makes a result actionable: a report that says it
// found 81 postings and shows none of them leaves the user with a number and no way to act on it.
// Each opens in a new tab, since the target is an external posting page.
const outputRenderPresentationLinks = (links?: PresentationLink[]): ReactNode => {
  if (!Array.isArray(links) || links.length === 0) return null;
  const usable = links.filter(
    (link): link is PresentationLink =>
      Boolean(link) && typeof link.url === 'string' && /^https?:\/\//i.test(link.url.trim()) && typeof link.label === 'string' && link.label.trim() !== '',
  );
  if (usable.length === 0) return null;
  return (
    <ul className="result-links">
      {usable.map((link, i) => (
        <li key={`${link.url}-${i}`}>
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            {link.label}
          </a>
          {link.detail ? <span className="muted"> — {link.detail}</span> : null}
        </li>
      ))}
    </ul>
  );
};

// A presentation block may declare actions the user can take on it — currently
// only `delete`, which removes a specific item from a skill-store array. The
// button is rendered beside the block's body so a list of templates or
// artifacts each carries its own Delete affordance. Confirmation + error
// handling live here; the shared type only carries the declarative payload.
const outputRenderPresentationActions = (actions?: PresentationAction[]): ReactNode => {
  if (!Array.isArray(actions) || actions.length === 0) return null;
  const deletes = actions.filter((a): a is PresentationAction => a.type === 'delete');
  if (deletes.length === 0) return null;
  return (
    <div className="result-actions" style={{ marginTop: '6px' }}>
      {deletes.map((action, i) => (
        <PresentationDeleteButton
          key={`${action.collection}:${action.key}:${action.itemId}-${i}`}
          action={action}
        />
      ))}
    </div>
  );
};

const PresentationDeleteButton: React.FC<{ action: PresentationAction }> = ({ action }) => {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = action.label || 'Delete';
  const path = `/api/skill-store/${action.collection}/${action.key}/${action.itemId}`;

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (window.confirm(`Delete "${action.itemId}"?`)) {
      setPending(true);
      setError(null);
      try {
        await deleteResource(path);
        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Delete failed');
      } finally {
        setPending(false);
      }
    }
  };

  if (done) {
    return <span className="muted">Deleted</span>;
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <button
        className="danger small"
        onClick={handleClick}
        disabled={pending}
        title={`Delete ${action.itemId} from ${action.collection}/${action.key}`}
      >
        {pending ? 'Deleting…' : label}
      </button>
      {error ? <span className="muted" style={{ color: '#ef4444' }}>{error}</span> : null}
    </span>
  );
};

// Generic heuristic: when an object looks like a mapping of uniform items (e.g. numeric
// keys or multiple properties whose values are objects with the same shape), render
// it as a list of items rather than a table of properties. This keeps shared code
// generic and avoids skill-specific assumptions.
const outputShouldRenderAsList = (obj: Record<string, unknown>): boolean => {
  const entries = Object.entries(obj);
  if (entries.length === 0) return false;

  // If keys are numeric or sequential, treat as list-like.
  const numericKeys = entries.every(([k]) => /^[0-9]+$/.test(k));
  if (numericKeys) return true;

  // If many values are objects and share most top-level keys, render as list.
  const objectValues = entries.filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v));
  if (objectValues.length >= 2) {
    const keySets = objectValues.map(([, v]) => Object.keys(v as Record<string, unknown>).sort().join('|'));
    const common = keySets.reduce((a, b) => (a === b ? a : ''));
    if (common) return true;
  }
  return false;
};

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

  // Presentation blocks are the skill's own user-facing report, and a skill is required to emit
  // them on failure paths too — a not-connected or blocked run usually has more to say than the
  // one-line error. So they are collected before the status branches below, and the status only
  // decides the styling, never whether the report is shown.
  const presentation = outputCollectPresentation(record);

  const notConnected = record.status === 'not-connected';
  const errText =
    record.error !== undefined && record.error !== null && record.error !== ''
      ? outputExtractDisplayMessage(record.error, 'Execution failed')
      : (notConnected
          ? outputExtractDisplayMessage(record.message || record.reason, 'Not connected to the service')
          : null);
  const failureState =
    notConnected ||
    record.success === false ||
    record.status === 'failed' ||
    (record.error !== undefined && record.error !== null && record.error !== '');

  if (presentation.length > 0) {
    return (
      <div className={'skill-result ' + (notConnected ? 'warning' : failureState ? 'error' : 'success')}>
        {notConnected && errText ? <div className="warning-banner">{errText}</div> : null}
        {!notConnected && errText ? <div className="error-banner">{errText}</div> : null}
        {outputRenderPresentationBlocks(presentation)}
      </div>
    );
  }

  if (notConnected) {
    return (
      <div className="skill-result warning">
        <div className="warning-banner">{errText}</div>
      </div>
    );
  }

  const isError = failureState;

  if (isError) {
    return (
      <div className="skill-result error">
        <div className="error-banner">{errText || 'Execution failed'}</div>
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

  // A skill controls its own user-facing formatting by returning presentation blocks. The core
  // only knows the generic { id, title, body } shape, never a specific skill's field names.
  // (Collected above, before the status branches, so failure paths keep their report.)

  // Skills emit { success, data: <payload> } and delegating skills emit one more layer of
  // `data`, so descend to the level that actually holds the result before rendering.
  const data = outputResolvePayload(record, outputSchema);

  // If payload is an object that actually represents a list (numeric keys or
  // mapping of uniform objects), render it as a list of items instead of a
  // table of properties. This keeps rendering generic and skill-agnostic.
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (outputShouldRenderAsList(d)) {
      return (
        <div className="skill-result success">
          {outputRenderValue(Object.values(d), 0)}
        </div>
      );
    }

    for (const candidate of ['jobs', 'results', 'items']) {
      const arr = d[candidate];
      if (Array.isArray(arr) && arr.length > 0) {
        return (
          <div className="skill-result success">
            {outputRenderValue(arr, 0)}
          </div>
        );
      }
    }
  }

  const properties = outputGetSchemaProperties(outputSchema);
  // Only render schema fields the payload actually carries. Rendering a { success, data, error }
  // schema against a payload that has none of those keys produced a panel of empty dashes.
  const schemaKeys = Object.keys(properties).filter(
    (k) => !k.startsWith('_') && !ENVELOPE_KEYS.has(k) && data[k] !== undefined,
  );

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
