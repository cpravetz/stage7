import { ArtifactsService } from '@stage7-nextgen/artifacts';
import {
  AssistantKnowledgeEntry,
  StoredKnowledgeEntry,
  EmbeddingsClient,
  EmbeddingResult,
  embeddableContentHash,
  logger,
} from '@stage7-nextgen/shared';
import type { KnowledgeEntryWithMeta } from './knowledgeBudget';

const COLLECTION = 'knowledge';

/**
 * Knowledge store, backed by the artifacts service `documents` collection.
 *
 * This is the single runtime home for assistant knowledge. Entries are read
 * when an assistant executes so that the store is on the critical path for
 * every model call, rather than being a write-only side channel.
 *
 * Scope determines who receives an entry: `assistant` entries go to their owner
 * only, `shared` entries go to every assistant and agent.
 */
export class KnowledgeService {
  constructor(
    private artifacts: ArtifactsService,
    private embeddings = new EmbeddingsClient(),
  ) {}

  /**
   * Writes an entry, replacing any existing entry with the same id.
   * Idempotent, so it is safe to call on every startup.
   *
   * Acquired knowledge is protected: an `authored` entry never silently
   * overwrites an existing `acquired` entry of the same id, because that would
   * discard knowledge learned at runtime and cannot be recovered from a file.
   */
  async publish(entry: StoredKnowledgeEntry, tenantId = 'system'): Promise<StoredKnowledgeEntry> {
    // The backing store must be settled first, or the write lands in the
    // in-memory store and is discarded when Mongo replaces it.
    await this.artifacts.ready();

    const existing = await this.artifacts.getDocument(entry.id);
    const previous = existing?.data as unknown as StoredKnowledgeEntry | undefined;

    if (previous && previous.origin === 'acquired' && entry.origin !== 'acquired') {
      logger.error(
        { knowledgeId: entry.id, existingOrigin: previous.origin, incomingOrigin: entry.origin },
        'Refusing to overwrite acquired knowledge with authored content; choose a different id',
      );
      return previous;
    }

    if (existing) {
      const updated = await this.artifacts.updateDocument(entry.id, {
        tenantId,
        collection: COLLECTION,
        data: { ...entry },
      });
      logger.debug({ knowledgeId: entry.id, scope: entry.scope }, 'Knowledge entry updated');
      this.syncVectorForEntry(entry);
      return (updated?.data as unknown as StoredKnowledgeEntry);
    }

    await this.artifacts.createDocument({
      id: entry.id,
      tenantId,
      collection: COLLECTION,
      data: { ...entry },
    });
    logger.debug({ knowledgeId: entry.id, scope: entry.scope }, 'Knowledge entry published');
    this.syncVectorForEntry(entry);
    return entry;
  }

  /**
   * Embeds the entry and upserts its vector, without ever blocking or failing
   * the publish that triggered it. An unchanged contentHash skips the embed
   * entirely — that is what makes the idempotent boot sync free. Best-effort:
   * a failure leaves the entry lexical-only.
   */
  private syncVectorForEntry(entry: StoredKnowledgeEntry): void {
    void (async () => {
      try {
        const contentHash = embeddableContentHash([entry.title, entry.content]);
        const existing = await this.artifacts.getVector(entry.id);
        if (existing?.contentHash === contentHash && existing.model) return;

        const result = await this.embeddings.embed([`${entry.title}\n${entry.content}`]);
        if (!result) return; // no embedding model available — lexical-only

        await this.artifacts.upsertVector(entry.id, result.vectors[0], {
          model: result.model,
          dim: result.dim,
          contentHash,
          collection: COLLECTION,
          filter: { scope: entry.scope, assistantId: entry.assistantId ?? null },
        });
      } catch (err) {
        logger.warn({ knowledgeId: entry.id, err }, 'Knowledge vector sync failed; entry remains lexical-only');
      }
    })();
  }

  /**
   * Everything `assistantId` should be told, with store timestamps for
   * recency ranking. Own entries come first, then shared ones.
   */
  async listForAssistantWithMeta(assistantId: string): Promise<KnowledgeEntryWithMeta[]> {
    await this.artifacts.ready();
    const { documents } = await this.artifacts.queryDocuments({
      collection: COLLECTION,
      filter: { scope: 'shared' },
      limit: 500,
    });

    const own = await this.artifacts.queryDocuments({
      collection: COLLECTION,
      filter: { scope: 'assistant', assistantId },
      limit: 500,
    });

    return [...own.documents, ...documents].map((d) => ({
      entry: d.data as unknown as StoredKnowledgeEntry,
      updatedAt: d.updatedAt ? new Date(d.updatedAt).getTime() : 0,
    }));
  }

  /**
   * Everything `assistantId` should be told: its own entries plus shared ones.
   * Shared entries are included for every assistant so that knowledge recorded
   * once is available to all of them.
   */
  async listForAssistant(assistantId: string): Promise<StoredKnowledgeEntry[]> {
    const records = await this.listForAssistantWithMeta(assistantId);
    return records.map((r) => r.entry);
  }

  /** All entries in the store, for inspection by operators and the Canvas UI. */
  async listAll(): Promise<StoredKnowledgeEntry[]> {
    await this.artifacts.ready();
    const { documents } = await this.artifacts.queryDocuments({
      collection: COLLECTION,
      limit: 1000,
      sort: { title: 1 },
    });
    return documents.map((d) => d.data as unknown as StoredKnowledgeEntry);
  }

  /** Entries owned by one assistant. Shared entries are excluded. */
  async listOwnedByAssistant(assistantId: string): Promise<StoredKnowledgeEntry[]> {
    await this.artifacts.ready();
    const { documents } = await this.artifacts.queryDocuments({
      collection: COLLECTION,
      filter: { scope: 'assistant', assistantId },
      limit: 500,
    });
    return documents.map((d) => d.data as unknown as StoredKnowledgeEntry);
  }

  /**
   * Sets an assistant's authored knowledge to exactly `entries`.
   *
   * Only entries this assistant owns *and* that are `origin: 'authored'` are
   * reconciled. Acquired knowledge is never deleted or replaced here: it is not
   * reproducible from a file, and the callers of this method (the startup file
   * sync and the configuration UI) only ever supply the authored set. Without
   * that restriction, saving an assistant in the configuration UI would
   * silently destroy everything it had learned, because the UI submits only the
   * authored entries it knows about.
   */
  async replaceAssistantKnowledge(
    assistantId: string,
    entries: AssistantKnowledgeEntry[],
    tenantId = 'system',
  ): Promise<number> {
    await this.artifacts.ready();

    const existing = await this.listOwnedByAssistant(assistantId);
    const keep = new Set(entries.map((e) => e.id));
    for (const stale of existing) {
      if (stale.origin === 'acquired') continue;
      if (!keep.has(stale.id)) {
        await this.artifacts.deleteDocument(stale.id);
        await this.artifacts.deleteVector(stale.id).catch(() => undefined);
        logger.info({ knowledgeId: stale.id, assistantId }, 'Removed assistant knowledge entry');
      }
    }

    for (const entry of entries) {
      await this.publish({
        ...entry,
        assistantId,
        scope: 'assistant',
        origin: 'authored',
      }, tenantId);
    }
    return entries.length;
  }

  /**
   * Substring search over stored knowledge. Returns at most `limit` entries.
   * Matches on title, content, tags, and domain.
   */
  async search(query: string, assistantId?: string, limit = 10): Promise<StoredKnowledgeEntry[]> {
    await this.artifacts.ready();
    const all = assistantId ? await this.listForAssistant(assistantId) : await this.listAll();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return all.slice(0, limit);

    return all
      .filter((entry) => {
        const haystack = [entry.title, entry.content, entry.domain, ...(entry.tags ?? [])]
          .filter((v): v is string => typeof v === 'string')
          .join(' ')
          .toLowerCase();
        return terms.some((term) => haystack.includes(term));
      })
      .slice(0, limit);
  }

  async remove(id: string): Promise<boolean> {
    await this.artifacts.ready();
    // deleteDocument also removes the vector row; the explicit delete covers a
    // vector that outlived its document.
    await this.artifacts.deleteVector(id).catch(() => undefined);
    return this.artifacts.deleteDocument(id);
  }

  /**
   * Embeds one text via brain. Null means no embedding model is configured or
   * the call failed — callers continue on the lexical-only path. Never throws:
   * an embedding failure must not block an assistant execution.
   */
  async embedQuery(text: string): Promise<EmbeddingResult | null> {
    try {
      return await this.embeddings.embed([text]);
    } catch (err) {
      logger.warn({ err }, 'Knowledge embedding failed; continuing lexical-only');
      return null;
    }
  }

  /**
   * Cosine scores for the knowledge collection: id → similarity, best first
   * when sorted. Only vectors stored under the same embedding `model` are
   * searched, so mixed-model stores degrade to fewer matches, not garbage.
   */
  async semanticScores(query: number[], model: string, limit = 50): Promise<Map<string, number>> {
    await this.artifacts.ready();
    const results = await this.artifacts.searchVectors({
      collection: COLLECTION,
      query,
      model,
      limit,
    });
    return new Map(results.map((r) => [r.id, r.score]));
  }
}
