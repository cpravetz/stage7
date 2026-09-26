import { type ReactNode } from 'react';

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
};

export const REFERENCE_SOURCE_LABELS: Record<string, string> = {
  'career-job-discovery-fit-ranking': 'Job Discovery & Fit Ranking',
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
  if (sourceId && REFERENCE_SOURCE_LABELS[sourceId]) {
    return REFERENCE_SOURCE_LABELS[sourceId];
  }
  if (sourceId) {
    return sfHumanizeKey(sourceId.replace(/-/g, '_'));
  }
  return '';
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

export interface SchemaFieldsProps {
  schema: SchemaRecord;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  namePrefix?: string;
}

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
                const optionLabel = typeof option === 'object' && option !== null ? (option as Record<string, unknown>).label ?? option : option;
                return <option key={String(optionValue)} value={String(optionValue)}>{String(optionLabel)}</option>;
              })}
            </select>
          );
        } else if (sfIsReferenceSchema(fieldSchema)) {
          const referenceSource = sfGetReferenceSource(fieldSchema);
          const referenceSourceLabel = sfGetReferenceSourceLabel(fieldSchema);
          const referenceLoadingMessage = referenceSourceLabel
            ? `Loading references from ${referenceSourceLabel}...`
            : 'Loading references...';
          if (fieldSchema.type === 'array') {
            const arrayValue = Array.isArray(value) ? value : [];
            control = (
              <div className="skill-reference-picker">
                <div className="skill-reference-picker__hint">{referenceLoadingMessage}</div>
                <div className="skill-reference-picker__options">
                  <span className="skill-reference-picker__empty">Reference data not yet available.</span>
                </div>
                <input type="hidden" value={arrayValue.map((item) => sfFormatTextValue(item)).join(',')} />
              </div>
            );
          } else {
            control = (
              <div className="skill-reference-picker">
                <div className="skill-reference-picker__hint">{referenceLoadingMessage}</div>
                <select
                  id={fieldId}
                  className={controlClass}
                  value={typeof value === 'string' ? value : ''}
                  onChange={(e) => onChange(key, e.target.value)}
                  disabled
                >
                  <option value="">Select an option</option>
                </select>
              </div>
            );
          }
        } else if (fieldSchema.type === 'array') {
          const arrayValue = Array.isArray(value) ? value : [];
          control = (
            <textarea
              id={fieldId}
              className={controlClass}
              rows={3}
              value={arrayValue.map((item) => sfFormatTextValue(item)).join('\n')}
              onChange={(e) => onChange(key, e.target.value.split(/[\n,]/))}
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
