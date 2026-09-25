import { useMemo } from 'react';

export interface FeedOption {
  key: string;
  label: string;
  description: string;
  producedBy: string;
  schema?: Record<string, unknown>;
}

export type ProducedFeedEntry =
  | string
  | { name: string; description?: string; schema?: Record<string, unknown> };

export interface SkillDef {
  id?: string;
  key?: string;
  name?: string;
  description?: string;
  produces?: ProducedFeedEntry[];
  outputSchema?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface FeedSelectorProps {
  consumes: string[];
  availableFeeds: FeedOption[];
  value: string;
  onChange: (feedKey: string) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
}

const ACRONYMS = new Set([
  'API', 'URL', 'ID', 'JSON', 'HTML', 'SEO', 'CRM', 'HTTP', 'UUID', 'CSV', 'PDF', 'XML', 'RSS', 'SSL', 'TLS',
]);

const fsHumanizeKey = (key: string): string => {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return words
    .map((word) => {
      const upper = word.toUpperCase();
      return ACRONYMS.has(upper) ? upper : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
};

const fsSkillDisplayName = (skill: SkillDef): string =>
  skill.name || skill.id || skill.key || 'skill';

const fsNormalizeId = (value: string | undefined): string =>
  (typeof value === 'string' ? value : '').toLowerCase();

const fsBuildCatalog = (available: SkillDef[]): Map<string, SkillDef> => {
  const catalog = new Map<string, SkillDef>();
  for (const skill of available) {
    for (const id of [skill.id, skill.key, skill.name]) {
      const normalized = fsNormalizeId(id);
      if (normalized) catalog.set(normalized, skill);
    }
  }
  return catalog;
};

const fsHasProducesOrSchema = (skill: SkillDef): boolean =>
  Array.isArray(skill.produces) ||
  (skill.outputSchema !== undefined && skill.outputSchema !== null);

const fsResolveSkill = (bound: SkillDef, catalog: Map<string, SkillDef>): SkillDef => {
  if (fsHasProducesOrSchema(bound)) return bound;
  for (const id of [bound.id, bound.key, bound.name]) {
    const match = catalog.get(fsNormalizeId(id));
    if (match) return match;
  }
  return bound;
};

const fsSchemaForFeed = (
  skill: SkillDef | undefined,
  feedKey: string,
): Record<string, unknown> | undefined => {
  const schema = skill?.outputSchema;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return undefined;
  const properties = (schema as Record<string, unknown>).properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return undefined;
  }
  const prop = (properties as Record<string, unknown>)[feedKey];
  return prop && typeof prop === 'object' && !Array.isArray(prop)
    ? (prop as Record<string, unknown>)
    : undefined;
};

const fsFieldDescription = (schema?: Record<string, unknown>): string => {
  if (!schema) return '';
  const candidates: unknown[] = [schema.description, schema.title, schema.hint];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
};

const fsToFeedEntry = (
  entry: ProducedFeedEntry,
): { name: string; label?: string; description?: string; schema?: Record<string, unknown> } => {
  if (typeof entry === 'string') {
    return { name: entry, label: fsHumanizeKey(entry) };
  }
  return {
    name: entry.name,
    label: entry.name ? fsHumanizeKey(entry.name) : undefined,
    description: entry.description || undefined,
    schema: entry.schema,
  };
};

const fsCollectFeeds = (
  skill: SkillDef,
): Array<{ name: string; label?: string; description?: string; schema?: Record<string, unknown> }> => {
  if (Array.isArray(skill.produces) && skill.produces.length > 0) {
    return skill.produces.map(fsToFeedEntry);
  }
  const schema = skill.outputSchema;
  if (schema && typeof schema === 'object' && !Array.isArray(schema)) {
    const properties = (schema as Record<string, unknown>).properties;
    if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
      const props = properties as Record<string, unknown>;
      return Object.keys(props).map((name) => {
        const prop = props[name];
        const propSchema =
          prop && typeof prop === 'object' && !Array.isArray(prop)
            ? (prop as Record<string, unknown>)
            : undefined;
        return {
          name,
          description: fsFieldDescription(propSchema),
          schema: propSchema,
        };
      });
    }
  }
  return [];
};

export const buildFeedOptions = (
  availableSkills: SkillDef[] | undefined,
  boundSkills: SkillDef[] | undefined,
): FeedOption[] => {
  const available = Array.isArray(availableSkills) ? availableSkills : [];
  const bound = Array.isArray(boundSkills) ? boundSkills : [];
  if (bound.length === 0) return [];

  const catalog = fsBuildCatalog(available);
  const options: FeedOption[] = [];
  const seen = new Set<string>();

  for (const boundSkill of bound) {
    const full = fsResolveSkill(boundSkill, catalog);
    const producer = fsSkillDisplayName(boundSkill);
    const feeds = fsCollectFeeds(full);
    for (const feed of feeds) {
      if (seen.has(feed.name)) continue;
      seen.add(feed.name);
      const schema = feed.schema ?? fsSchemaForFeed(full, feed.name);
      const description =
        feed.description ||
        fsFieldDescription(schema) ||
        (full.description && typeof full.description === 'string'
          ? full.description
          : '') ||
        '';
      options.push({
        key: feed.name,
        label: feed.label ?? fsHumanizeKey(feed.name),
        description,
        producedBy: producer,
        schema,
      });
    }
  }
  return options;
};

export const FeedSelector = ({
  consumes,
  availableFeeds,
  value,
  onChange,
  label,
  required,
  placeholder,
}: FeedSelectorProps) => {
  const options = useMemo<FeedOption[]>(() => {
    const feeds = Array.isArray(availableFeeds) ? availableFeeds : [];
    if (!Array.isArray(consumes) || consumes.length === 0) return feeds;
    const wants = new Set(consumes);
    return feeds.filter((f) => wants.has(f.key));
  }, [consumes, availableFeeds]);

  const selectedFeed =
    value && options.some((f) => f.key === value)
      ? options.find((f) => f.key === value)
      : undefined;

  const hint = 'No upstream skills producing this feed. Bind a producer skill first.';

  return (
    <div className="feed-selector">
      {label ? (
        <label className="field-label">
          {label}
          {required ? ' *' : ''}
        </label>
      ) : null}
      {options.length === 0 ? (
        <>
          <select disabled>
            <option value="">{hint}</option>
          </select>
          <p className="muted">{hint}</p>
        </>
      ) : (
        <>
          <select
            value={value}
            required={required}
            onChange={(e) => onChange(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 6,
              color: '#e2e8f0',
            }}
          >
            <option value="" disabled hidden>
              {placeholder || `— Select ${label ? label : 'a feed'} —`}
            </option>
            {options.map((f) => (
              <option key={f.key} value={f.key} title={f.description || f.producedBy}>
                {f.label} — {f.producedBy}
              </option>
            ))}
          </select>
          {selectedFeed ? (
            <p className="muted">
              Produced by {selectedFeed.producedBy}
              {selectedFeed.description ? `. ${selectedFeed.description}` : ''}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
};

export default FeedSelector;
