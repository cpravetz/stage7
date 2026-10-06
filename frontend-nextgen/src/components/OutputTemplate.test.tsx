import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { vi } from 'vitest';

import OutputTemplate, { parseExecutionResult } from './OutputTemplate';

const posting = {
  success: true,
  status: 'ok',
  present: [
    {
      id: 'listings',
      title: 'Job postings (2)',
      kind: 'text',
      body: 'Every posting this search found, linked to the posting itself.',
      links: [
        { label: 'Senior Platform Engineer — Alpha Analytics', url: 'https://alpha.example.com/apply/1', detail: 'Worldwide · remoteok' },
        { label: 'Senior Engineer, Payments — Eta Bank', url: 'https://www.arbeitnow.com/view/senior-engineer-payments-eta-1' },
      ],
    },
  ],
};

describe('OutputTemplate presentation links', () => {
  it('renders every posting attached to a block as its own link', () => {
    const { container } = render(<OutputTemplate outputSchema={undefined} result={posting} />);
    const anchors = Array.from(container.querySelectorAll('.result-links a'));
    expect(anchors).toHaveLength(2);
    expect(anchors.map((a) => a.textContent)).toEqual([
      'Senior Platform Engineer — Alpha Analytics',
      'Senior Engineer, Payments — Eta Bank',
    ]);
    expect(anchors[0].getAttribute('href')).toBe('https://alpha.example.com/apply/1');
  });

  it('opens each posting in a new tab without handing it the opener', () => {
    const { container } = render(<OutputTemplate outputSchema={undefined} result={posting} />);
    for (const anchor of Array.from(container.querySelectorAll('.result-links a'))) {
      expect(anchor.getAttribute('target')).toBe('_blank');
      expect(anchor.getAttribute('rel')).toContain('noopener');
    }
  });

  it('shows the supporting detail beside the link when the skill provided one', () => {
    const { container } = render(<OutputTemplate outputSchema={undefined} result={posting} />);
    expect(container.textContent).toContain('Worldwide · remoteok');
  });

  it('renders links that survive the transport envelopes a tool result arrives in', () => {
    const wrapped = { content: [{ text: JSON.stringify({ output: JSON.stringify(posting) }) }] };
    const { container } = render(<OutputTemplate outputSchema={undefined} result={wrapped} />);
    expect(container.querySelectorAll('.result-links a')).toHaveLength(2);
  });

  it('drops links that are not http(s) rather than rendering them as anchors', () => {
    const unsafe = {
      success: true,
      present: [
        {
          id: 'listings',
          body: 'Postings found',
          links: [
            { label: 'Real posting', url: 'https://alpha.example.com/apply/1' },
            { label: 'Injected', url: 'javascript:alert(1)' },
            { label: '', url: 'https://alpha.example.com/apply/2' },
          ],
        },
      ],
    };
    const { container } = render(<OutputTemplate outputSchema={undefined} result={unsafe} />);
    const anchors = Array.from(container.querySelectorAll('.result-links a'));
    expect(anchors).toHaveLength(1);
    expect(anchors[0].textContent).toBe('Real posting');
  });

  it('leaves blocks without links exactly as they were', () => {
    const { container } = render(
      <OutputTemplate
        outputSchema={undefined}
        result={{ success: true, present: [{ id: 'discovery-summary', title: 'Search summary', body: 'Listings found: 81' }] }}
      />,
    );
    expect(container.querySelector('.result-links')).toBeNull();
    expect(container.textContent).toContain('Listings found: 81');
  });
});

describe('parseExecutionResult', () => {
  it('preserves presentation links while unwrapping', () => {
    const parsed = parseExecutionResult({ output: JSON.stringify(posting) }) as Record<string, unknown>;
    const blocks = parsed.present as Array<{ links?: unknown[] }>;
    expect(blocks[0].links).toHaveLength(2);
  });
});


const deletePosting = {
  success: true,
  status: 'ok',
  present: [
    {
      id: 'listings',
      title: 'Templates (1)',
      kind: 'text',
      body: 'One template remains.',
      actions: [
        {
          type: 'delete',
          label: 'Delete',
          target: 'skill-store',
          collection: 'resume',
          key: 'templates',
          itemId: 'tpl-1',
        },
      ],
    },
  ],
};

describe('OutputTemplate presentation actions', () => {
  it('renders a Delete button for every delete action declared on a block', () => {
    const { container } = render(<OutputTemplate outputSchema={undefined} result={deletePosting} />);
    const buttons = Array.from(container.querySelectorAll('.result-actions button.danger.small'));
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe('Delete');
    expect(buttons[0].getAttribute('title')).toContain('tpl-1');
  });

  it('does not render actions when a block declares none', () => {
    const { container } = render(
      <OutputTemplate
        outputSchema={undefined}
        result={{ success: true, present: [{ id: 'summary', body: 'Nothing actionable' }] }}
      />,
    );
    expect(container.querySelector('.result-actions')).toBeNull();
  });

  it('confirms before deleting and calls DELETE /api/skill-store/...', async () => {
    const user = await import('@testing-library/user-event').then((m) => m.default.setup());
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('/api/skill-store/resume/templates/tpl-1');
      expect(init?.method).toBe('DELETE');
      return { ok: true, status: 200, json: async () => ({ success: true, removed: true }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<OutputTemplate outputSchema={undefined} result={deletePosting} />);
    const button = container.querySelector('.result-actions button.danger.small') as HTMLButtonElement;
    await user.click(button);

    expect(confirmSpy).toHaveBeenCalledWith('Delete "tpl-1"?');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Deleted');

    vi.unstubAllGlobals();
  });

  it('shows an error inline when the delete request fails', async () => {
    const user = await import('@testing-library/user-event').then((m) => m.default.setup());
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, statusText: 'Server Error', json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<OutputTemplate outputSchema={undefined} result={deletePosting} />);
    const button = container.querySelector('.result-actions button.danger.small') as HTMLButtonElement;
    await user.click(button);

    expect(container.textContent).toContain('API error: 500 Server Error');
    expect(container.textContent).not.toContain('Deleted');

    vi.unstubAllGlobals();
  });

  it('does nothing when the user cancels the confirmation', async () => {
    const user = await import('@testing-library/user-event').then((m) => m.default.setup());
    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal('confirm', confirmSpy);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<OutputTemplate outputSchema={undefined} result={deletePosting} />);
    const button = container.querySelector('.result-actions button.danger.small') as HTMLButtonElement;
    await user.click(button);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('Deleted');

    vi.unstubAllGlobals();
  });
});
