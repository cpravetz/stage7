import {
  KnowledgeEntryWithMeta,
  applyKnowledgeBudget,
  knowledgeBudgetChars,
  knowledgeQueryTokens,
  rankKnowledgeEntries,
} from '../services/knowledgeBudget';
import { StoredKnowledgeEntry } from '@stage7-nextgen/shared';
import { logger } from '@stage7-nextgen/shared';

function entry(overrides: Partial<StoredKnowledgeEntry>): StoredKnowledgeEntry {
  return {
    id: 'entry-1',
    title: 'Entry One',
    content: 'Some content',
    assistantId: null,
    scope: 'shared',
    origin: 'authored',
    ...overrides,
  };
}

function meta(entry_: StoredKnowledgeEntry, updatedAt: number): KnowledgeEntryWithMeta {
  return { entry: entry_, updatedAt };
}

describe('knowledgeQueryTokens', () => {
  it('tokenizes assistant identity and prompt, dropping short words', () => {
    const tokens = knowledgeQueryTokens('cto-advisor', 'CTO Advisor', 'Plan the budget for Q3 now');
    expect(tokens.has('cto')).toBe(true);
    expect(tokens.has('advisor')).toBe(true);
    expect(tokens.has('budget')).toBe(true);
    expect(tokens.has('now')).toBe(true);
    expect(tokens.has('q3')).toBe(false);
  });
});

describe('rankKnowledgeEntries', () => {
  it('ranks tag matches above non-matches regardless of recency', () => {
    const tokens = knowledgeQueryTokens('cto', 'CTO Advisor', '');
    const ranked = rankKnowledgeEntries(
      [
        meta(entry({ id: 'old-match', tags: ['cto'] }), 100),
        meta(entry({ id: 'new-plain' }), 200),
      ],
      tokens,
    );
    expect(ranked.map((r) => r.entry.id)).toEqual(['old-match', 'new-plain']);
    expect(ranked[0].relevance).toBe(1);
    expect(ranked[1].relevance).toBe(0);
  });

  it('breaks relevance ties by recency, newest first', () => {
    const tokens = knowledgeQueryTokens('cto', 'CTO Advisor', '');
    const ranked = rankKnowledgeEntries(
      [
        meta(entry({ id: 'older' }), 100),
        meta(entry({ id: 'newer' }), 200),
      ],
      tokens,
    );
    expect(ranked.map((r) => r.entry.id)).toEqual(['newer', 'older']);
  });

  it('treats a domain match as relevant', () => {
    const tokens = knowledgeQueryTokens('healthcare', 'Healthcare Advisor', '');
    const ranked = rankKnowledgeEntries(
      [meta(entry({ id: 'domain-match', domain: 'Healthcare' }), 100)],
      tokens,
    );
    expect(ranked[0].relevance).toBe(1);
  });
});

describe('applyKnowledgeBudget', () => {
  it('keeps everything when the ranked set fits the budget', () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    try {
      const tokens = knowledgeQueryTokens('cto', 'CTO Advisor', '');
      const ranked = rankKnowledgeEntries(
        [
          meta(entry({ id: 'a', title: 'A', content: 'x'.repeat(50) }), 200),
          meta(entry({ id: 'b', title: 'B', content: 'y'.repeat(50) }), 100),
        ],
        tokens,
      );
      const result = applyKnowledgeBudget(ranked, 10000);
      expect(result.selected.map((r) => r.entry.id)).toEqual(['a', 'b']);
      expect(result.dropped).toEqual([]);
      expect(result.injectedChars).toBeGreaterThan(0);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('drops lowest-ranked entries beyond the budget and logs them', () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    try {
      const tokens = knowledgeQueryTokens('cto', 'CTO Advisor', '');
      const big = 'z'.repeat(600);
      const ranked = rankKnowledgeEntries(
        [
          meta(entry({ id: 'big', title: 'Big', content: big }), 300),
          meta(entry({ id: 'mid', title: 'Mid', content: 'm'.repeat(600) }), 200),
          meta(entry({ id: 'small', title: 'Small', content: 's' }), 100),
        ],
        tokens,
      );
      const result = applyKnowledgeBudget(ranked, 1000);
      expect(result.selected.map((r) => r.entry.id)).toEqual(['big', 'small']);
      expect(result.dropped.map((d) => d.id)).toEqual(['mid']);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ droppedCount: 1, budgetChars: 1000 }),
        'Knowledge injection budget: dropped low-ranked entries',
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('injects the top entry alone even when it alone exceeds the budget', () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    try {
      const ranked: KnowledgeEntryWithMeta[] = [
        meta(entry({ id: 'huge', title: 'Huge', content: 'h'.repeat(2000) }), 100),
      ];
      const result = applyKnowledgeBudget(ranked, 100);
      expect(result.selected.map((r) => r.entry.id)).toEqual(['huge']);
      expect(result.dropped).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('knowledgeBudgetChars', () => {
  it('falls back to the default on missing or invalid values', () => {
    expect(knowledgeBudgetChars({} as NodeJS.ProcessEnv)).toBe(24000);
    expect(knowledgeBudgetChars({ KNOWLEDGE_BUDGET_CHARS: 'nope' })).toBe(24000);
    expect(knowledgeBudgetChars({ KNOWLEDGE_BUDGET_CHARS: '-5' })).toBe(24000);
  });

  it('honours a positive override', () => {
    expect(knowledgeBudgetChars({ KNOWLEDGE_BUDGET_CHARS: '500' })).toBe(500);
  });
});
