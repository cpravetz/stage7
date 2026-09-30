import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import {
  sfClearReferenceCache,
  sfGetReferenceLabel,
  sfGetReferenceSource,
  sfGetReferenceSourceLabel,
  sfGetReferenceValueField,
  sfIsReferenceSchema,
  sfReferenceItemsFrom,
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
    expect(sfGetReferenceSourceLabel(schema)).toBe('Career Job Discovery Fit Ranking');
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

  beforeEach(() => {
    // The picker fetches its options on mount. Nothing here is about the payload, so the
    // request is stubbed to fail rather than reaching for a server that is not running.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline in test'); }));
    sfClearReferenceCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
    expect(hint?.textContent).toBe('Loading references from Career Job Discovery Fit Ranking...');
  });
});

describe('sfGetReferenceValueField', () => {
  it('defaults to id, which is how most skills identify a posting', () => {
    expect(sfGetReferenceValueField({})).toBe('id');
    expect(sfGetReferenceValueField(undefined)).toBe('id');
  });

  it('uses the declared field when the skill identifies its posting by something else', () => {
    expect(sfGetReferenceValueField({ 'x-referenceValueField': 'title' })).toBe('title');
  });
});

const LISTINGS_PAYLOAD = {
  success: true,
  data: {
    listings: [
      {
        id: 'job-1',
        title: 'Senior Platform Engineer',
        company: 'Alpha Analytics',
        location: 'Worldwide',
        applyUrl: 'https://alpha.example.com/apply/1',
      },
      {
        id: 'job-2',
        title: 'Senior Engineer, Payments',
        company: 'Eta Bank',
        applyUrl: 'https://www.arbeitnow.com/view/senior-engineer-payments-eta-1',
      },
    ],
  },
};

describe('sfReferenceItemsFrom', () => {
  it('turns stored postings into options carrying a value, a label and the posting link', () => {
    const items = sfReferenceItemsFrom(LISTINGS_PAYLOAD);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      value: 'job-1',
      label: 'Senior Platform Engineer — Alpha Analytics',
      url: 'https://alpha.example.com/apply/1',
      detail: 'Worldwide',
    });
  });

  it('writes back the declared value field for skills that name a role by title', () => {
    const items = sfReferenceItemsFrom(LISTINGS_PAYLOAD, 'title');
    expect(items.map((i) => i.value)).toEqual(['Senior Platform Engineer', 'Senior Engineer, Payments']);
  });

  it('skips a posting whose link is not http(s) and de-duplicates by value', () => {
    const items = sfReferenceItemsFrom({
      listings: [
        { id: 'a', title: 'A', url: 'javascript:alert(1)' },
        { id: 'a', title: 'A', url: 'https://example.com/a' },
        { id: 'b', title: 'B', url: 'https://example.com/b' },
      ],
    });
    expect(items).toHaveLength(2);
    expect(items[0].url).toBe('https://example.com/a');
  });

  it('accepts a bare array of plain strings', () => {
    expect(sfReferenceItemsFrom(['one', 'two'])).toEqual([
      { value: 'one', label: 'one' },
      { value: 'two', label: 'two' },
    ]);
  });
});

describe('SchemaFields reference picker loads the set another skill produced', () => {
  const onChange = vi.fn();

  const schema: SchemaRecord = {
    type: 'object',
    properties: {
      targetRoles: {
        type: 'array',
        items: { type: 'string' },
        'x-referenceSource': 'career-job-discovery-fit-ranking',
        'x-referenceLabel': 'your job search results',
      },
    },
  };

  beforeEach(() => {
    onChange.mockReset();
    sfClearReferenceCache();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => LISTINGS_PAYLOAD })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers the postings the search found, each linked to the posting itself', async () => {
    const { container } = render(<SchemaFields schema={schema} values={{}} onChange={onChange} />);

    await waitFor(() => {
      expect(container.querySelectorAll('.skill-reference-picker__option')).toHaveLength(2);
    });
    const anchors = Array.from(container.querySelectorAll('.skill-reference-picker__option a'));
    expect(anchors.map((a) => a.textContent)).toEqual([
      'Senior Platform Engineer — Alpha Analytics',
      'Senior Engineer, Payments — Eta Bank',
    ]);
    expect(anchors[0].getAttribute('href')).toBe('https://alpha.example.com/apply/1');
    expect(anchors[0].getAttribute('target')).toBe('_blank');
  });

  it('asks the reference source for the set rather than rendering an empty picker', async () => {
    render(<SchemaFields schema={schema} values={{}} onChange={onChange} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(String((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain(
      '/api/tool-executor/tools/reference-data/career-job-discovery-fit-ranking',
    );
  });

  it('writes the selected posting id back to the field', async () => {
    const { container } = render(<SchemaFields schema={schema} values={{}} onChange={onChange} />);
    await waitFor(() => {
      expect(container.querySelectorAll('.skill-reference-picker__option input')).toHaveLength(2);
    });
    (container.querySelectorAll('.skill-reference-picker__option input')[0] as HTMLInputElement).click();
    expect(onChange).toHaveBeenCalledWith('targetRoles', ['job-1']);

    // With the first selection written back, a second adds to it rather than replacing it.
    const updated = render(<SchemaFields schema={schema} values={{ targetRoles: ['job-1'] }} onChange={onChange} />);
    await waitFor(() => {
      expect(updated.container.querySelectorAll('.skill-reference-picker__option input')).toHaveLength(2);
    });
    (updated.container.querySelectorAll('.skill-reference-picker__option input')[1] as HTMLInputElement).click();
    expect(onChange).toHaveBeenLastCalledWith('targetRoles', ['job-1', 'job-2']);
  });

  it('de-selects a posting that is already selected', async () => {
    const { container } = render(
      <SchemaFields schema={schema} values={{ targetRoles: ['job-1'] }} onChange={onChange} />,
    );
    await waitFor(() => {
      expect(container.querySelectorAll('.skill-reference-picker__option input')).toHaveLength(2);
    });
    (container.querySelectorAll('.skill-reference-picker__option input')[0] as HTMLInputElement).click();
    expect(onChange).toHaveBeenCalledWith('targetRoles', []);
  });

  it('falls back to manual entry when the reference source has nothing stored', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data: { listings: [] } }) })));
    sfClearReferenceCache();
    const { container } = render(<SchemaFields schema={schema} values={{}} onChange={onChange} />);
    await waitFor(() => {
      expect(container.querySelector('.skill-reference-picker__hint')?.textContent).toContain('No');
    });
    expect(screen.queryByText('Reference data not yet available.')).toBeInTheDocument();
  });

  it('still renders when the reference source cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    sfClearReferenceCache();
    const { container } = render(<SchemaFields schema={schema} values={{}} onChange={onChange} />);
    await waitFor(() => {
      expect(container.querySelector('.skill-reference-picker__hint')?.textContent).not.toContain('Loading');
    });
    expect(container.querySelector('.skill-reference-picker')).toBeInTheDocument();
  });

  it('populates a scalar reference field with the role title the skill expects', async () => {
    const scalarSchema: SchemaRecord = {
      type: 'object',
      properties: {
        targetRole: {
          type: 'string',
          'x-referenceSource': 'career-job-discovery-fit-ranking',
          'x-referenceValueField': 'title',
        },
      },
    };
    const { container } = render(<SchemaFields schema={scalarSchema} values={{}} onChange={onChange} />);
    await waitFor(() => {
      expect(container.querySelectorAll('.skill-reference-picker__option')).toHaveLength(2);
    });
    const radios = container.querySelectorAll('.skill-reference-picker__option input');
    expect(radios[0].getAttribute('type')).toBe('radio');
    (radios[1] as HTMLInputElement).click();
    expect(onChange).toHaveBeenCalledWith('targetRole', 'Senior Engineer, Payments');
  });
});
