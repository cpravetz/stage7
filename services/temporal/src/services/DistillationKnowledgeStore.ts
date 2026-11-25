import { createHash } from 'node:crypto';
import {
  HeuristicEntry,
  StoredKnowledgeEntry,
  EmbeddingsClient,
  embeddableContentHash,
  logger,
} from '@stage7-nextgen/shared';

/**
 * Upper bound on `acquired` knowledge entries per assistant. Distillation
 * emits a handful of heuristics per mission; without a cap the store grows
 * without bound over the life of an assistant.
 */
const MAX_ACQUIRED_PER_ASSISTANT = 50;

export interface PersistHeuristicsInput {
  assistantId: string;
  tenantId?: string;
  missionId?: string;
  heuristics: HeuristicEntry[];
}

interface ArtifactDocument {
  id: string;
  data: StoredKnowledgeEntry;
}

interface ArtifactSearchResponse {
  documents: ArtifactDocument[];
}

/** What actually lands in `data`, including the eviction-order timestamp. */
type PersistedKnowledgeEntry = StoredKnowledgeEntry & { ts: string };

/**
 * Persists brain distillation output into the knowledge store, the same
 * `knowledge` collection the worker-pool KnowledgeService reads when
 * assembling prompts. Entries are written directly through the artifacts
 * documents API (temporal has no in-process ArtifactsService), so the store
 * enforces the same protections KnowledgeService.publish does for its own
 * writes:
 *
 * - `acquired` entries never overwrite `authored` ones (a shared id means the
 *   authored entry wins and the heuristic is dropped).
 * - Duplicate rules collapse onto one deterministic id, so re-learning the
 *   same rule never grows the store.
 * - The per-assistant acquired set is capped, evicting the oldest entries.
 */
export class DistillationKnowledgeStore {
  private static instance: DistillationKnowledgeStore | undefined;
  private readonly artifactsUrl = (process.env.ARTIFACTS_URL || process.env.PERSISTENCE_URL || 'http://artifacts:4200').replace(/\/+$/, '');
  private readonly embeddings = new EmbeddingsClient();

  static getInstance(): DistillationKnowledgeStore {
    this.instance ??= new DistillationKnowledgeStore();
    return this.instance;
  }

  private entryId(assistantId: string, rule: string): string {
    const hash = createHash('sha256').update(`${assistantId}\0${rule}`).digest('hex');
    return `knowledge-acquired-${hash.slice(0, 24)}`;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.artifactsUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
    if (!response.ok) {
      const details = (await response.text()).slice(0, 300);
      throw new Error(`Artifacts request failed (${response.status}): ${details}`);
    }
    return (response.status === 204 ? (undefined as T) : response.json()) as Promise<T>;
  }

  /** The entry shape persisted for one heuristic, including its confidence. */
  private toPersistedEntry(
    input: PersistHeuristicsInput,
    heuristic: HeuristicEntry,
    id: string,
  ): PersistedKnowledgeEntry {
    const rule = heuristic.rule.trim();
    return {
      id,
      title: rule.length > 80 ? `${rule.slice(0, 77)}...` : rule,
      // ts backs the cap's oldest-first eviction and surfaces in the
      // Canvas knowledge list.
      ts: typeof heuristic.ts === 'string' ? heuristic.ts : new Date().toISOString(),
      content: [
        rule,
        ...(heuristic.rationale ? [`Rationale: ${heuristic.rationale}`] : []),
        ...(heuristic.evidence?.length ? [`Evidence: ${heuristic.evidence.join('; ')}`] : []),
      ].join('\n'),
      source: 'distillation',
      tags: ['distillation', ...(input.missionId ? [input.missionId] : [])],
      assistantId: input.assistantId,
      scope: 'assistant',
      origin: 'acquired',
      ...(typeof heuristic.confidence === 'number' ? { confidence: heuristic.confidence } : {}),
    };
  }

  /**
   * Embeds the entry and upserts its vector through the artifacts HTTP API,
   * best-effort: an embedding failure must never fail the knowledge write.
   */
  private syncVector(entry: PersistedKnowledgeEntry): void {
    void (async () => {
      try {
        const result = await this.embeddings.embed([`${entry.title}\n${entry.content}`]);
        if (!result) return; // no embedding model available — lexical-only
        await this.request(`/api/artifacts/vectors/${encodeURIComponent(entry.id)}`, {
          method: 'PUT',
          body: JSON.stringify({
            vector: result.vectors[0],
            model: result.model,
            dim: result.dim,
            contentHash: embeddableContentHash([entry.title, entry.content]),
            collection: 'knowledge',
            filter: { scope: entry.scope, assistantId: entry.assistantId ?? null },
          }),
        });
      } catch (err) {
        logger.warn({ knowledgeId: entry.id, err }, 'Distillation vector sync failed; entry remains lexical-only');
      }
    })();
  }

  /** Deletes the entry's vector, best-effort (cap eviction / overwrite cleanup). */
  private deleteVector(id: string): void {
    void this.request(`/api/artifacts/vectors/${encodeURIComponent(id)}`, { method: 'DELETE' })
      .catch((err: unknown) => logger.warn({ knowledgeId: id, err }, 'Distillation vector delete failed'));
  }

  /**
   * Writes each heuristic as an acquired knowledge entry owned by
   * `assistantId`. Returns the number of entries created; duplicates,
   * authored collisions, and cap evictions are logged, not thrown.
   */
  async persist(input: PersistHeuristicsInput): Promise<number> {
    const heuristics = input.heuristics.filter((h) => typeof h?.rule === 'string' && h.rule.trim().length > 0);
    if (!heuristics.length) return 0;

    const existing = await this.request<ArtifactSearchResponse>('/api/artifacts/documents/search', {
      method: 'POST',
      body: JSON.stringify({
        collection: 'knowledge',
        filter: { scope: 'assistant', assistantId: input.assistantId, origin: 'acquired' },
        limit: 1000,
      }),
    });
    const existingIds = new Set(existing.documents.map((d) => d.id));

    const created: string[] = [];
    for (const heuristic of heuristics) {
      const rule = heuristic.rule.trim();
      const id = this.entryId(input.assistantId, rule);

      // Deterministic id doubles as rule-level dedupe, but an authored entry
      // could still hold this id — check before writing, and yield to it.
      const current = await this.request<ArtifactDocument | undefined>(`/api/artifacts/documents/${encodeURIComponent(id)}`)
        .catch((err: unknown) => {
          if (err instanceof Error && err.message.includes('(404)')) return undefined;
          throw err;
        });
      if (current) {
        if (current.data?.origin !== 'acquired') {
          logger.warn({ knowledgeId: id, assistantId: input.assistantId, origin: current.data?.origin }, 'Skipping distillation heuristic; id belongs to a non-acquired knowledge entry');
        } else {
          // Re-learning the same rule strengthens it: overwrite the acquired
          // entry only when the new confidence is higher. A missing stored
          // confidence never blocks the update.
          const storedConfidence = typeof current.data?.confidence === 'number' ? current.data.confidence : -Infinity;
          const newConfidence = typeof heuristic.confidence === 'number' ? heuristic.confidence : -Infinity;
          if (newConfidence > storedConfidence) {
            const entry = this.toPersistedEntry(input, heuristic, id);
            await this.request(`/api/artifacts/documents/${encodeURIComponent(id)}`, {
              method: 'PUT',
              body: JSON.stringify({ data: entry }),
            });
            this.syncVector(entry);
            logger.info({ knowledgeId: id, assistantId: input.assistantId, confidence: heuristic.confidence }, 'Strengthened re-learned distillation heuristic');
          }
        }
        continue;
      }
      if (existingIds.has(id)) continue;

      const entry = this.toPersistedEntry(input, heuristic, id);
      await this.request(`/api/artifacts/documents`, {
        method: 'POST',
        body: JSON.stringify({
          id,
          tenantId: input.tenantId || 'system',
          collection: 'knowledge',
          data: entry,
        }),
      });
      this.syncVector(entry);
      existingIds.add(id);
      created.push(id);
    }

    await this.enforceCap(input.assistantId);
    if (created.length) {
      logger.info({ assistantId: input.assistantId, missionId: input.missionId, count: created.length }, 'Persisted distillation heuristics to the knowledge store');
    }
    return created.length;
  }

  /** Evicts the oldest acquired entries once the assistant exceeds the cap. */
  private async enforceCap(assistantId: string): Promise<void> {
    const search = await this.request<ArtifactSearchResponse>('/api/artifacts/documents/search', {
      method: 'POST',
      body: JSON.stringify({
        collection: 'knowledge',
        filter: { scope: 'assistant', assistantId, origin: 'acquired' },
        limit: 1000,
        sort: { ts: 1 },
      }),
    });
    const excess = search.documents.slice(0, Math.max(0, search.documents.length - MAX_ACQUIRED_PER_ASSISTANT));
    for (const doc of excess) {
      await this.request(`/api/artifacts/documents/${encodeURIComponent(doc.id)}`, { method: 'DELETE' });
      this.deleteVector(doc.id);
      logger.info({ knowledgeId: doc.id, assistantId }, 'Evicted oldest acquired knowledge entry to stay under the per-assistant cap');
    }
  }
}
