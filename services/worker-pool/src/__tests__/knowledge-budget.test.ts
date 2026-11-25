import {
  KnowledgeEntryWithMeta,
  LESSON_MIN_CONFIDENCE,
  LESSON_TOP_N,
  applyKnowledgeBudget,
  fuseKnowledgeRankings,
  knowledgeBudgetChars,
  knowledgeQueryTokens,
  rankKnowledgeEntries,
  selectLessons,
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

describe('fuseKnowledgeRankings (RRF)', () => {
  it('ranks top-of-both-lists above top-of-one, which beats lexical-only', () => {
    // a: lexical #1 + cosine #1; b: #2 in both; c: lexical only.
    const fused = fuseKnowledgeRankings(['a', 'b', 'c'], new Map([['a', 0.9], ['b', 0.8]]));
    expect(fused.get('a')!).toBeGreaterThan(fused.get('b')!);
    expect(fused.get('b')!).toBeGreaterThan(fused.get('c')!);
  });

  it('contributes nothing for a list the id is missing from', () => {
    const fused = fuseKnowledgeRankings(['a'], new Map([['b', 1]]));
    expect(fused.get('a')).toBeCloseTo(1 / (60 + 1), 10);
    expect(fused.get('b')).toBeCloseTo(1 / (60 + 1), 10);
  });

  it('a cosine hit lifts an entry above the lexical leader', () => {
    // a leads lexically but has no vector; b is lexical #2 with the top cosine.
    const fused = fuseKnowledgeRankings(['a', 'b'], new Map([['b', 0.9]]));
    expect(fused.get('b')!).toBeGreaterThan(fused.get('a')!);
  });
});

describe('semantic ranking in rankKnowledgeEntries', () => {
  it('lifts a semantically-related entry above lexical-only results of equal recency', () => {
    const tokens = knowledgeQueryTokens('cto', 'CTO Advisor', '');
    const records = [
      meta(entry({ id: 'lexical-only' }), 200),
      meta(entry({ id: 'semantic' }), 200),
    ];
    const semanticScores = new Map([['semantic', 0.05], ['lexical-only', 0.01]]);
    const ranked = rankKnowledgeEntries(records, tokens, semanticScores);
    expect(ranked.map((r) => r.entry.id)).toEqual(['semantic', 'lexical-only']);
  });

  it('still ranks a tag match above semantic-only entries', () => {
    const tokens = knowledgeQueryTokens('cto', 'CTO Advisor', '');
    const records = [
      meta(entry({ id: 'semantic', domain: 'unrelated' }), 200),
      meta(entry({ id: 'tagged', tags: ['cto'] }), 100),
    ];
    const ranked = rankKnowledgeEntries(records, tokens, new Map([['semantic', 0.9]]));
    expect(ranked.map((r) => r.entry.id)).toEqual(['tagged', 'semantic']);
  });

  it('without semantic scores keeps the plain lexical order (degradation path)', () => {
    const tokens = knowledgeQueryTokens('cto', 'CTO Advisor', '');
    const records = [
      meta(entry({ id: 'older' }), 100),
      meta(entry({ id: 'newer' }), 200),
    ];
    expect(rankKnowledgeEntries(records, tokens).map((r) => r.entry.id))
      .toEqual(['newer', 'older']);
  });
});

describe('confidence ranking (lessons tier)', () => {
  it('ranks an acquired entry at or above LESSON_MIN_CONFIDENCE like a tag match', () => {
    const tokens = knowledgeQueryTokens('cto', 'CTO Advisor', '');
    const ranked = rankKnowledgeEntries(
      [
        meta(entry({ id: 'equal-recency-lexical', tags: ['unrelated'] }), 200),
        meta(entry({ id: 'lesson', origin: 'acquired', confidence: LESSON_MIN_CONFIDENCE }), 200),
      ],
      tokens,
    );
    expect(ranked[0].entry.id).toBe('lesson');
    expect(ranked[0].relevance).toBe(1);
  });

  it('does not boost authored entries or below-floor confidence', () => {
    const tokens = knowledgeQueryTokens('cto', 'CTO Advisor', '');
    const ranked = rankKnowledgeEntries(
      [
        meta(entry({ id: 'authored-high-confidence', confidence: 0.99 }), 300),
        meta(entry({ id: 'acquired-low-confidence', origin: 'acquired', confidence: 0.4 }), 300),
      ],
      tokens,
    );
    expect(ranked.every((r) => r.relevance === 0)).toBe(true);
  });
});

describe('selectLessons', () => {
  it('picks acquired entries at or above the floor, confidence desc with recency tiebreak', () => {
    const selected: KnowledgeEntryWithMeta[] = [
      meta(entry({ id: 'authored', confidence: 0.99 }), 300),
      meta(entry({ id: 'below-floor', origin: 'acquired', confidence: 0.5 }), 300),
      meta(entry({ id: 'mid', origin: 'acquired', confidence: 0.7 }), 100),
      meta(entry({ id: 'top', origin: 'acquired', confidence: 0.9 }), 100),
      meta(entry({ id: 'tie-newer', origin: 'acquired', confidence: 0.7 }), 200),
      meta(entry({ id: 'no-confidence', origin: 'acquired' }), 400),
    ];
    const lessons = selectLessons(selected);
    expect(lessons.map((l) => l.id)).toEqual(['top', 'tie-newer', 'mid']);
  });

  it('caps the section at LESSON_TOP_N', () => {
    const selected: KnowledgeEntryWithMeta[] = Array.from({ length: 8 }, (_, i) =>
      meta(entry({ id: `lesson-${i}`, origin: 'acquired', confidence: 0.6 + i / 100 }), 100 + i));
    expect(selectLessons(selected)).toHaveLength(LESSON_TOP_N);
  });

  it('returns nothing when no qualifying entry exists', () => {
    const selected: KnowledgeEntryWithMeta[] = [
      meta(entry({ id: 'plain', origin: 'acquired' }), 100),
      meta(entry({ id: 'authored', confidence: 1 }), 200),
    ];
    expect(selectLessons(selected)).toEqual([]);
  });
});

describe('lessons + knowledge budget accounting', () => {
  it('keeps lessons a subset of the budgeted selection so total injected chars stay bounded', () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    try {
      const tokens = knowledgeQueryTokens('cto', 'CTO Advisor', '');
      const records = [
        meta(entry({ id: 'lesson-1', origin: 'acquired', confidence: 0.9, title: 'L1', content: 'x'.repeat(50) }), 300),
        meta(entry({ id: 'lesson-2', origin: 'acquired', confidence: 0.8, title: 'L2', content: 'y'.repeat(50) }), 200),
        meta(entry({ id: 'plain', title: 'P', content: 'z'.repeat(50) }), 100),
      ];
      const ranked = rankKnowledgeEntries(records, tokens);
      const budgeted = applyKnowledgeBudget(ranked, 10000);
      const lessons = selectLessons(budgeted.selected);
      expect(lessons.map((l) => l.id)).toEqual(['lesson-1', 'lesson-2']);
      const lessonIds = new Set(lessons.map((l) => l.id));
      const plainKnowledge = budgeted.selected.filter((r) => !lessonIds.has(r.entry.id));
      // Every rendered entry was budgeted exactly once.
      expect(plainKnowledge.map((r) => r.entry.id)).toEqual(['plain']);
      expect(budgeted.injectedChars).toBeLessThanOrEqual(10000);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
