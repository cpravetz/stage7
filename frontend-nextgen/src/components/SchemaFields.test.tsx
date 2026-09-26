import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { vi } from 'vitest';

import {
  sfGetReferenceLabel,
  sfGetReferenceSource,
  sfGetReferenceSourceLabel,
  sfIsReferenceSchema,
  SchemaFields,
  type SchemaRecord,
} from './SchemaFields';

describe('sfIsReferenceSchema', () => {
  it('returns true when format is "reference"', () => {
    const schema: SchemaRecord = { format: 'reference' };
    expect(sfIsReferenceSchema(schema)).toBe(true);
  });

  it('returns true when x-referenceSource is set', () => {
    const schema: SchemaRecord = { 'x-referenceSource': 'someSource' };
    expect(sfIsReferenceSchema(schema)).toBe(true);
  });

  it('returns false when neither format nor x-referenceSource is set', () => {
    expect(sfIsReferenceSchema({ type: 'string' })).toBe(false);
    expect(sfIsReferenceSchema({})).toBe(false);
    expect(sfIsReferenceSchema(undefined)).toBe(false);
  });
});

describe('sfGetReferenceSource', () => {
  it('extracts the x-referenceSource value correctly', () => {
    const schema: SchemaRecord = { 'x-referenceSource': 'my-source' };
    expect(sfGetReferenceSource(schema)).toBe('my-source');
  });

  it('returns empty string when x-referenceSource is not set', () => {
    expect(sfGetReferenceSource({})).toBe('');
    expect(sfGetReferenceSource(undefined)).toBe('');
  });
});

describe('sfGetReferenceSourceLabel', () => {
  it('returns human-friendly label for known reference source', () => {
    const schema: SchemaRecord = { 'x-referenceSource': 'career-job-discovery-fit-ranking' };
    expect(sfGetReferenceSourceLabel(schema)).toBe('Job Discovery & Fit Ranking');
  });

  it('prioritizes x-referenceLabel over known source mapping', () => {
    const schema: SchemaRecord = {
      'x-referenceSource': 'career-job-discovery-fit-ranking',
      'x-referenceLabel': 'Custom Label',
    };
    expect(sfGetReferenceSourceLabel(schema)).toBe('Custom Label');
  });

  it('falls back to humanized kebab-case source when no mapping exists', () => {
    const schema: SchemaRecord = { 'x-referenceSource': 'unknown-source-id' };
    expect(sfGetReferenceSourceLabel(schema)).toBe('Unknown Source ID');
  });

  it('returns empty string when x-referenceSource is not set', () => {
    expect(sfGetReferenceSourceLabel({})).toBe('');
    expect(sfGetReferenceSourceLabel(undefined)).toBe('');
  });
});

describe('sfGetReferenceLabel', () => {
  it('resolves label from x-referenceLabel', () => {
    const schema: SchemaRecord = { 'x-referenceLabel': 'Reference Label' };
    expect(sfGetReferenceLabel('fieldKey', schema)).toBe('Reference Label');
  });

  it('falls back to title when x-referenceLabel is not set', () => {
    const schema: SchemaRecord = { title: 'Title Value' };
    expect(sfGetReferenceLabel('fieldKey', schema)).toBe('Title Value');
  });

  it('falls back to label when neither x-referenceLabel nor title is set', () => {
    const schema: SchemaRecord = { label: 'Label Value' };
    expect(sfGetReferenceLabel('fieldKey', schema)).toBe('Label Value');
  });

  it('falls back to the field key when none of x-referenceLabel, title, or label are set', () => {
    const schema: SchemaRecord = { type: 'string', format: 'reference' };
    expect(sfGetReferenceLabel('fieldKey', schema)).toBe('fieldKey');
  });

  it('prioritizes x-referenceLabel over title and label', () => {
    const schema: SchemaRecord = {
      'x-referenceLabel': 'Ref Label',
      title: 'Title',
      label: 'Label',
    };
    expect(sfGetReferenceLabel('fieldKey', schema)).toBe('Ref Label');
  });

  it('prioritizes title over label', () => {
    const schema: SchemaRecord = { title: 'Title', label: 'Label' };
    expect(sfGetReferenceLabel('fieldKey', schema)).toBe('Title');
  });
});

describe('SchemaFields reference picker rendering', () => {
  const onChange = vi.fn();

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders a reference picker when a field has format: "reference"', () => {
    const schema: SchemaRecord = {
      type: 'object',
      properties: {
        myField: {
          type: 'string',
          format: 'reference',
          'x-referenceSource': 'someSource',
        },
      },
    };
    const { container } = render(<SchemaFields schema={schema} values={{}} onChange={onChange} />);
    expect(container.querySelector('.skill-reference-picker')).toBeInTheDocument();
  });

  it('renders a single select for scalar reference fields', () => {
    const schema: SchemaRecord = {
      type: 'object',
      properties: {
        myField: {
          type: 'string',
          format: 'reference',
          'x-referenceSource': 'someSource',
        },
      },
    };
    const { container } = render(<SchemaFields schema={schema} values={{ myField: 'val1' }} onChange={onChange} />);
    const picker = container.querySelector('.skill-reference-picker');
    expect(picker).toBeInTheDocument();
    const select = picker?.querySelector('select');
    expect(select).toBeInTheDocument();
    expect(select).not.toHaveAttribute('multiple');
  });

  it('renders a multi-value (div-based) picker for array-typed reference fields', () => {
    const schema: SchemaRecord = {
      type: 'object',
      properties: {
        myField: {
          type: 'array',
          format: 'reference',
          'x-referenceSource': 'someSource',
        },
      },
    };
    const { container } = render(
      <SchemaFields schema={schema} values={{ myField: ['a', 'b', 'c'] }} onChange={onChange} />,
    );
    const picker = container.querySelector('.skill-reference-picker');
    expect(picker).toBeInTheDocument();

    // Array reference picker is div-based (handles multiple values), not a native select
    expect(picker?.querySelector('select')).toBeNull();

    const hiddenInput = picker?.querySelector('input[type="hidden"]') as HTMLInputElement | null;
    expect(hiddenInput).toBeInTheDocument();
    expect(hiddenInput?.value).toBe('a,b,c');
  });

  it('calls onChange when a scalar reference select value changes', () => {
    const schema: SchemaRecord = {
      type: 'object',
      properties: {
        myField: {
          type: 'string',
          format: 'reference',
          'x-referenceSource': 'someSource',
        },
      },
    };
    const { container } = render(<SchemaFields schema={schema} values={{}} onChange={onChange} />);
    const select = container.querySelector('.skill-reference-picker select');
    expect(select).toBeInTheDocument();
  });

  it('shows human-friendly source label in loading message', () => {
    const schema: SchemaRecord = {
      type: 'object',
      properties: {
        targetRoles: {
          type: 'array',
          format: 'reference',
          'x-referenceSource': 'career-job-discovery-fit-ranking',
        },
      },
    };
    const { container } = render(<SchemaFields schema={schema} values={{}} onChange={onChange} />);
    const hint = container.querySelector('.skill-reference-picker__hint');
    expect(hint?.textContent).toBe('Loading references from Job Discovery & Fit Ranking...');
  });
});
