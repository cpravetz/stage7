import { useEffect, useState, type ReactNode } from 'react';

export type SchemaRecord = Record<string, unknown>;

export type EnumOption = string | number | boolean | { value: unknown; label?: unknown } | Record<string, unknown>;

export const FIELD_LABEL_MAP: Record<string, string> = {
  operation: 'Action',
  provider: 'Service Provider',
  endpointUrl: 'Connect Service',
  baseUrl: 'Connect Service',
  apiKey: 'API Key',
  dryRun: 'Preview only',
  confirmation: 'Approve & send',
  approved: 'Approve & send',
  // Names the user would not use for the field. Kept here so the schema does not
  // have to carry a display name for every field to read correctly.
  locationMetrics: 'Practice figures by location',
  rows: 'Rows',
  payload: 'Details to send',
  remediation: 'Change to apply',
  focusArea: 'What you need help with',
  executive: 'Person',
  objective: 'What you want to achieve',
  objectiveRow: 'Objective',
  processes: 'Processes',
  processAreas: 'Process areas',
  learner: 'Learner',
  insightData: 'Learner insights',
  courseContext: 'Course context',
  targetRole: 'Target role',
  subject: 'Subject',
  grade: 'Grade level',
};


export const sfGetSchemaProperties = (schema?: SchemaRecord): Record<string, SchemaRecord> => {
  const properties = schema?.properties;
  return properties && typeof properties === 'object' && !Array.isArray(properties)
    ? properties as Record<string, SchemaRecord>
    : {};
};

export const sfGetSchemaTitle = (key: string, schema?: SchemaRecord): string => (
  String(schema?.title || schema?.label || schema?.['x-label'] || schema?.['x-referenceLabel'] || FIELD_LABEL_MAP[key] || sfHumanizeKey(key))
);

export const sfGetSchemaDescription = (schema?: SchemaRecord): string => (
  String(schema?.description || schema?.hint || '')
);

export const sfIsLongTextSchema = (key: string, schema?: SchemaRecord): boolean => (
  schema?.multiline === true ||
  schema?.format === 'long-text' ||
  schema?.format === 'textarea' ||
  /message|prompt|content|description|instructions|text|body|query|keywords|topic|resume/i.test(key) ||
  /prompt|message|content|instructions/i.test(sfGetSchemaDescription(schema))
);

export const sfIsReferenceSchema = (schema?: SchemaRecord): boolean => (
  schema?.format === 'reference' || Boolean(schema?.['x-referenceSource'])
);

export const sfGetReferenceSource = (schema?: SchemaRecord): string => (
  String(schema?.['x-referenceSource'] || '')
);

export const sfGetReferenceSourceLabel = (schema?: SchemaRecord): string => {
  const sourceId = String(schema?.['x-referenceSource'] || '');
  if (schema?.['x-referenceLabel']) {
    return String(schema['x-referenceLabel']);
  }
  if (sourceId) {
    return sfHumanizeKey(sourceId.replace(/-/g, '_'));
  }
  return '';
};

/**
 * Which property of a reference item is written back into the field.
 *
 * Most skills identify a posting by its id, so that is the default. Skills that take a
 * role by name (interview prep, pipeline tracking) declare `x-referenceValueField: 'title'`
 * so picking a job fills the field with the value that field actually expects.
 */
export const sfGetReferenceValueField = (schema?: SchemaRecord): string => (
  String(schema?.['x-referenceValueField'] || 'id')
);

/**
 * An optional narrowing of the fetched set, e.g. `x-referenceFilter: 'type=resume'`.
 * Passed through to the reference-data endpoint as `?filter=`, so a field can offer
 * only the slice of a source that matches what it accepts instead of the whole set.
 */
export const sfGetReferenceFilter = (schema?: SchemaRecord): string | undefined => {
  const filter = schema?.['x-referenceFilter'];
  return filter && typeof filter === 'string' ? filter : undefined;
};

export interface SfReferenceItem {
  value: string;
  label: string;
  url?: string;
  detail?: string;
}

// Fetched reference sets are cached by source so re-rendering a form (or opening a second
// field off the same source) does not re-request them.
const sfReferenceCache = new Map<string, SfReferenceItem[]>();
const sfReferencePending = new Map<string, Promise<SfReferenceItem[]>>();

export const sfClearReferenceCache = (): void => {
  sfReferenceCache.clear();
  sfReferencePending.clear();
};

const sfFirstString = (record: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return '';
};

/**
 * Turn a reference payload into picker options.
 *
 * The payload is the shape a reference source endpoint returns: an array of records, or an
 * object wrapping one under `listings` / `items` / `results` / `data`. Each record must yield
 * a value written back into the field, a human label, and — when the record points at a real
 * posting or document — a URL, so the option is also a link the user can open.
 */
export const sfReferenceItemsFrom = (payload: unknown, valueField = 'id'): SfReferenceItem[] => {
  const unwrap = (value: unknown): unknown[] => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    const record = value as Record<string, unknown>;
    for (const key of ['listings', 'items', 'results', 'options', 'references', 'data']) {
      const nested = record[key];
      if (Array.isArray(nested)) return nested;
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        const deeper = unwrap(nested);
        if (deeper.length > 0) return deeper;
      }
    }
    return [];
  };

  const records = unwrap(payload);

  const items: SfReferenceItem[] = [];
  const indexByValue = new Map<string, number>();
  for (const raw of records) {
    if (typeof raw === 'string' || typeof raw === 'number') {
      const scalar = String(raw);
      if (!scalar || indexByValue.has(scalar)) continue;
      indexByValue.set(scalar, items.length);
      items.push({ value: scalar, label: scalar });
      continue;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;
    const value = sfFirstString(record, [valueField, 'id', 'value', 'title', 'name']);
    if (!value) continue;
    const url = sfFirstString(record, ['applyUrl', 'url', 'href', 'link', 'sourceUrl']);
    const safeUrl = /^https?:\/\//i.test(url) ? url : undefined;
    const existing = indexByValue.get(value);
    if (existing !== undefined) {
      // The same posting can arrive twice, one copy carrying a link and one not. Keep the
      // first copy but take the link if only a later one has a usable one, so a posting is
      // never left unopenable because a linkless duplicate came first.
      if (!items[existing].url && safeUrl) items[existing].url = safeUrl;
      continue;
    }
    indexByValue.set(value, items.length);
    const title = sfFirstString(record, ['title', 'label', 'name']) || value;
    const company = sfFirstString(record, ['company', 'organisation', 'organization']);
    const location = sfFirstString(record, ['location']);
    items.push({
      value,
      label: company && company !== title ? title + ' — ' + company : title,
      url: safeUrl,
      detail: location && location !== company ? location : undefined,
    });
  }
  return items;
};

export const sfFetchReferenceItems = async (sourceId: string, valueField = 'id', filter?: string): Promise<SfReferenceItem[]> => {
  const cacheKey = sourceId + '::' + valueField + '::' + (filter || '');
  const cached = sfReferenceCache.get(cacheKey);
  if (cached) return cached;
  const inFlight = sfReferencePending.get(cacheKey);
  if (inFlight) return inFlight;

  const request = (async () => {
    try {
      const url = filter
        ? `/api/tool-executor/tools/reference-data/${encodeURIComponent(sourceId)}?filter=${encodeURIComponent(filter)}`
        : `/api/tool-executor/tools/reference-data/${encodeURIComponent(sourceId)}`;
      const response = await fetch(url);
      if (!response.ok) return [];
      const items = sfReferenceItemsFrom(await response.json(), valueField);
      sfReferenceCache.set(cacheKey, items);
      return items;
    } catch {
      // A picker that cannot load its options still renders: it falls back to manual entry
      // rather than blocking the whole form.
      sfReferenceCache.set(cacheKey, []);
      return [];
    } finally {
      sfReferencePending.delete(cacheKey);
    }
  })();
  sfReferencePending.set(cacheKey, request);
  return request;
};

export const sfGetReferenceLabel = (key: string, schema?: SchemaRecord): string => (
  String(schema?.['x-referenceLabel'] || schema?.title || schema?.label || key)
);

export const sfIsFileUploadSchema = (schema?: SchemaRecord): boolean => {
  if (!schema || schema.type !== 'object') return false;
  const props = sfGetSchemaProperties(schema);
  return Boolean(props.name && props.mimeType && props.content);
};

export const sfReadFileAsUploadValue = (file: File): Promise<{ name: string; mimeType: string; content: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const isText = /^text\/|json|xml/.test(file.type) || /\.(md|txt)$/i.test(file.name);
      const content = isText ? result : result.split(',')[1] || '';
      resolve({ name: file.name, mimeType: file.type || 'application/octet-stream', content });
    };
    if (/^text\/|json|xml/.test(file.type) || /\.(md|txt)$/i.test(file.name)) {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file);
    }
  });
};

export const sfFormatTextValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

export const sfFormatNumberValue = (value: unknown): number | '' => (
  typeof value === 'number' ? value : ''
);

export const sfHumanizeKey = (key: string): string => {
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

/**
 * Fallback label for an enum option that is a bare identifier.
 *
 * Only used when the schema supplies no `{ value, label }` pair. Note that
 * tidying the punctuation is all this does: `eq-assessment` becomes "Eq
 * Assessment", which is not an explanation. A skill whose options need real
 * wording must declare labels in its schema rather than rely on this.
 */
export const sfHumanizeEnumValue = (value: unknown): string => {
  const text = sfFormatTextValue(value);
  if (!text) return '';
  return sfHumanizeKey(text);
};

export interface SchemaFieldsProps {
  schema: SchemaRecord;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  namePrefix?: string;
}

type SfReferenceState = { loading: boolean; items: SfReferenceItem[] };

const sfEmptyReferenceState: SfReferenceState = { loading: false, items: [] };

interface SfReferencePickerProps {
  fieldId: string;
  schema: SchemaRecord;
  multiple: boolean;
  value: unknown;
  onChange: (value: unknown) => void;
}

/**
 * A field that picks from a set another skill produced — the job postings a search
 * returned, for instance. Without this the field can only be typed into by hand, so the
 * set a skill went to the trouble of discovering is invisible to every skill downstream
 * of it: they ask the user to name a posting rather than offering the ones already found.
 *
 * Each option carries the posting's link, so the set is browsable and readable, not just
 * selectable, and selecting stays a plain value write so the consuming skill needs no
 * special handling.
 */
const SfReferencePicker = ({ fieldId, schema, multiple, value, onChange }: SfReferencePickerProps) => {
  const sourceId = sfGetReferenceSource(schema);
  const valueField = sfGetReferenceValueField(schema);
  const referenceFilter = sfGetReferenceFilter(schema);
  const sourceLabel = sfGetReferenceSourceLabel(schema);
  const [state, setState] = useState<SfReferenceState>(sfEmptyReferenceState);

  useEffect(() => {
    let active = true;
    if (!sourceId) {
      setState(sfEmptyReferenceState);
      return () => { active = false; };
    }
    setState({ loading: true, items: [] });
    void sfFetchReferenceItems(sourceId, valueField, referenceFilter).then((items) => {
      if (active) setState({ loading: false, items });
    });
    return () => { active = false; };
  }, [sourceId, valueField, referenceFilter]);

  const selected = new Set<string>(multiple
    ? (Array.isArray(value) ? value : []).map((item) => sfFormatTextValue(item))
    : (value === undefined || value === null ? [] : [sfFormatTextValue(value)]));

  const hint = state.loading
    ? `Loading ${sourceLabel ? `options from ${sourceLabel}` : 'options'}...`
    : state.items.length
      ? `${state.items.length} available from ${sourceLabel || sourceId}.`
      : `Not connected to ${sourceLabel || 'a source system'}. Connect it to choose from a list here.`;

  const toggle = (itemValue: string) => {
    if (!multiple) {
      onChange(itemValue);
      return;
    }
    const next = new Set(selected);
    if (next.has(itemValue)) next.delete(itemValue);
    else next.add(itemValue);
    onChange([...next]);
  };

  const options = (
    <div className="skill-reference-picker__options">
      {state.items.length === 0 ? (
        <span className="skill-reference-picker__empty">
          {state.loading ? 'Loading...' : 'No options yet.'}
        </span>
      ) : (
        state.items.map((item) => (
          <div key={item.value} className="skill-reference-picker__option">
            <input
              id={`${fieldId}-${item.value}`}
              type={multiple ? 'checkbox' : 'radio'}
              name={`${fieldId}-reference`}
              checked={selected.has(item.value)}
              onChange={() => toggle(item.value)}
            />
            {item.url ? (
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                {item.label}
              </a>
            ) : (
              <label htmlFor={`${fieldId}-${item.value}`}>{item.label}</label>
            )}
            {item.detail ? <span className="muted"> — {item.detail}</span> : null}
          </div>
        ))
      )}
    </div>
  );

  if (!multiple) {
    // A select with no free-text escape hatch. The value has to come from the
    // source system, so allowing it to be typed invites an identifier the back end
    // cannot match; an empty select says plainly that the source is not connected.
    return (
      <div className="skill-reference-picker">
        <div className="skill-reference-picker__hint">{hint}</div>
        <select
          id={fieldId}
          className="skill-control"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">
            {state.items.length === 0 ? 'No options available yet' : 'Select an option'}
          </option>
          {state.items.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
        {options}
      </div>
    );
  }

  const arrayValue = Array.isArray(value) ? value : [];
  return (
    <div className="skill-reference-picker">
      <div className="skill-reference-picker__hint">{hint}</div>
      {options}
      <input type="hidden" value={arrayValue.map((item) => sfFormatTextValue(item)).join(',')} />
    </div>
  );
};

export const SchemaFields = ({ schema, values, onChange, namePrefix = 'skill-field' }: SchemaFieldsProps) => {
  const properties = sfGetSchemaProperties(schema);
  if (Object.keys(properties).length === 0) return null;

  return (
    <div className="skill-fields">
      {Object.entries(properties).map(([key, rawSchema]) => {
        const fieldSchema = (rawSchema || {}) as SchemaRecord;
        const value = values[key];
        const label = sfGetSchemaTitle(key, fieldSchema);
        const description = sfGetSchemaDescription(fieldSchema);
        const fieldId = `${namePrefix}-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
        const required = Array.isArray(schema.required) && (schema.required as unknown[]).includes(key);
        const controlClass = `skill-control${sfIsLongTextSchema(key, fieldSchema) ? ' skill-control-long' : ''}`;

        let control: ReactNode;
        if (fieldSchema.type === 'boolean') {
          control = (
            <input
              id={fieldId}
              className="skill-checkbox"
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => onChange(key, e.target.checked)}
            />
          );
        } else if (fieldSchema.type === 'number' || fieldSchema.type === 'integer') {
          control = (
            <input
              id={fieldId}
              className={controlClass}
              type="number"
              value={sfFormatNumberValue(value)}
              onChange={(e) => onChange(key, e.target.value === '' ? '' : Number(e.target.value))}
            />
          );
        } else if (Array.isArray(fieldSchema.enum)) {
          control = (
            <select
              id={fieldId}
              className={controlClass}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => onChange(key, e.target.value)}
            >
              <option value="">Select an option</option>
              {(fieldSchema.enum as EnumOption[]).map((option) => {
                const optionValue = typeof option === 'object' && option !== null ? (option as Record<string, unknown>).value : option;
                const optionLabel = typeof option === 'object' && option !== null
                  ? (option as Record<string, unknown>).label ?? option
                  : sfHumanizeEnumValue(option);
                return <option key={String(optionValue)} value={String(optionValue)}>{String(optionLabel)}</option>;
              })}
            </select>
          );
        } else if (sfIsReferenceSchema(fieldSchema)) {
          control = (
            <SfReferencePicker
              fieldId={fieldId}
              schema={fieldSchema}
              multiple={fieldSchema.type === 'array'}
              value={value}
              onChange={(next) => onChange(key, next)}
            />
          );
        } else if (fieldSchema.type === 'array') {
          const arrayValue = Array.isArray(value) ? value : [];
          control = (
            <textarea
              id={fieldId}
              className={controlClass}
              rows={3}
              value={arrayValue.map((item) => sfFormatTextValue(item)).join('\n')}
              onChange={(e) => onChange(key, e.target.value.split('\n'))}
              onBlur={(e) => onChange(key, e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
            />
          );
        } else if (sfIsFileUploadSchema(fieldSchema)) {
          const fileValue = value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
          control = (
            <div className="skill-file-upload">
              <input
                id={fieldId}
                className={controlClass}
                type="file"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  onChange(key, await sfReadFileAsUploadValue(file));
                }}
              />
              {fileValue?.name ? <span className="skill-file-name">Selected: {String(fileValue.name)}</span> : null}
            </div>
          );
        } else if (fieldSchema.type === 'object' && sfGetSchemaProperties(fieldSchema)) {
          const nestedValues = value && typeof value === 'object' && !Array.isArray(value)
            ? value as Record<string, unknown>
            : {};
          control = (
            <div className="skill-nested-fields">
              <SchemaFields
                schema={fieldSchema}
                values={nestedValues}
                onChange={(nestedKey, nestedValue) => onChange(key, { ...nestedValues, [nestedKey]: nestedValue })}
                namePrefix={`${namePrefix}-${key}`}
              />
            </div>
          );
        } else if (fieldSchema.type === 'string' && sfIsLongTextSchema(key, fieldSchema)) {
          control = (
            <textarea
              id={fieldId}
              className={controlClass}
              rows={3}
              value={sfFormatTextValue(value)}
              onChange={(e) => onChange(key, e.target.value)}
            />
          );
        } else {
          control = (
            <input
              id={fieldId}
              className={controlClass}
              type="text"
              value={sfFormatTextValue(value)}
              onChange={(e) => onChange(key, e.target.value)}
            />
          );
        }

        return (
          <div key={key} className="skill-field">
            <div className="skill-field-heading">
              <label htmlFor={fieldId}>{label}{required ? ' *' : ''}</label>
              {description && <span className="skill-field-description">{description}</span>}
            </div>
            {control}
          </div>
        );
      })}
    </div>
  );
};
