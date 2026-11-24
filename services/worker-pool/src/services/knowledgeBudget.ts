import { StoredKnowledgeEntry, logger } from '@stage7-nextgen/shared';

/**
 * Default knowledge injection budget in characters (~6k tokens at ~4 chars
 * per token). Override with KNOWLEDGE_BUDGET_CHARS.
 */
const DEFAULT_BUDGET_CHARS = 24000;

/** Words of length >= 3; short tokens ("and", "for") carry no relevance signal. */
const MIN_TOKEN_LENGTH = 3;

/**
 * Characters rendered per entry beyond title+content: `### ` before the title
 * and the two newlines separating entries.
 */
const PER_ENTRY_OVERHEAD_CHARS = 6;

export interface KnowledgeEntryWithMeta {
  entry: StoredKnowledgeEntry;
  /** Store-level last-write time; drives recency ranking. */
  updatedAt: number;
}

export interface RankedKnowledgeEntry extends KnowledgeEntryWithMeta {
  /** 1 when the entry's tags or domain match the assistant/task, else 0. */
  relevance: number;
}

export interface DroppedKnowledgeEntry {
  id: string;
  title: string;
  chars: number;
}

export interface KnowledgeBudgetResult {
  /** Entries to inject, in ranked order. */
  selected: KnowledgeEntryWithMeta[];
  dropped: DroppedKnowledgeEntry[];
  injectedChars: number;
  budgetChars: number;
}

/**
 * Injection budget in characters, from KNOWLEDGE_BUDGET_CHARS. Invalid or
 * missing values fall back to the default rather than disabling the budget.
 */
export function knowledgeBudgetChars(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.KNOWLEDGE_BUDGET_CHARS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_BUDGET_CHARS;
}

/**
 * Lowercased alphanumeric words shared between the entries' tags and the
 * assistant identity plus the task prompt. This is the whole vocabulary a tag
 * can match against — kept separate from ranking so the token rules are
 * testable on their own.
 */
export function knowledgeQueryTokens(
  assistantId: string,
  assistantName: string,
  taskPrompt: string,
): Set<string> {
  const tokens = new Set<string>();
  for (const source of [assistantId, assistantName, taskPrompt]) {
    for (const token of source.toLowerCase().split(/[^a-z0-9]+/)) {
      if (token.length >= MIN_TOKEN_LENGTH) tokens.add(token);
    }
  }
  return tokens;
}

function entryChars(entry: StoredKnowledgeEntry): number {
  return PER_ENTRY_OVERHEAD_CHARS + entry.title.length + entry.content.length;
}

function matchesTokens(entry: StoredKnowledgeEntry, tokens: Set<string>): boolean {
  const tags = (entry.tags ?? [])
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim().toLowerCase());
  const domain = typeof entry.domain === 'string' ? entry.domain.trim().toLowerCase() : '';
  return [...tags, domain].some((tag) => tag.length >= MIN_TOKEN_LENGTH && tokens.has(tag));
}

/**
 * Orders entries most-relevant-first: tag/domain match against the assistant
 * or task beats recency; recency (updatedAt desc) breaks ties. Sort is stable,
 * so entries otherwise keep their store order.
 */
export function rankKnowledgeEntries(
  entries: KnowledgeEntryWithMeta[],
  tokens: Set<string>,
): RankedKnowledgeEntry[] {
  return entries
    .map((item) => ({
      ...item,
      relevance: matchesTokens(item.entry, tokens) ? 1 : 0,
    }))
    .sort((a, b) => b.relevance - a.relevance || b.updatedAt - a.updatedAt);
}

/**
 * Greedy first-fit over entries already in priority order: take entries until
 * the next would exceed `budgetChars`. The top entry is always injected even if
 * it alone exceeds the budget — some knowledge beats none — and nothing else
 * fits after it.
 */
export function applyKnowledgeBudget(
  ranked: ReadonlyArray<KnowledgeEntryWithMeta>,
  budgetChars: number = knowledgeBudgetChars(),
): KnowledgeBudgetResult {
  const selected: KnowledgeEntryWithMeta[] = [];
  const dropped: DroppedKnowledgeEntry[] = [];
  let injectedChars = 0;

  for (const item of ranked) {
    const chars = entryChars(item.entry);
    const fits = injectedChars + chars <= budgetChars;
    if (fits || selected.length === 0) {
      selected.push(item);
      injectedChars += chars;
      if (!fits) break;
    } else {
      dropped.push({ id: item.entry.id, title: item.entry.title, chars });
    }
  }

  if (dropped.length > 0) {
    logger.warn(
      {
        budgetChars,
        injectedChars,
        selectedCount: selected.length,
        droppedCount: dropped.length,
        dropped,
      },
      'Knowledge injection budget: dropped low-ranked entries',
    );
  }

  return { selected, dropped, injectedChars, budgetChars };
}
