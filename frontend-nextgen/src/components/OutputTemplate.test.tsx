import '@testing-library/jest-dom';
import { render } from '@testing-library/react';

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
