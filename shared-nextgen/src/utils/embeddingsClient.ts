import { createHash } from 'node:crypto';
import { httpRequest } from './httpClient';
import { logger } from './logger';

/**
 * Client for brain's embedding route.
 *
 * Brain is the only service with provider routing, so it is the only service
 * that talks to embedding models. Every caller degrades the same way: when no
 * embedding model is configured, or the call fails, `embed` resolves to null
 * and the caller continues on its lexical-only path. Embedding is an
 * enhancement, never a dependency — it must not block or fail a publish or an
 * execution.
 */
export interface EmbeddingResult {
  vectors: number[][];
  model: string;
  dim: number;
}

export class EmbeddingsClient {
  private readonly brainUrl: string;

  constructor(brainUrl = (process.env.BRAIN_URL || 'http://brain:3100').replace(/\/+$/, '')) {
    this.brainUrl = brainUrl;
  }

  /** Embeds `texts`; null means "no model / unavailable / failed" — not an error. */
  async embed(texts: string[]): Promise<EmbeddingResult | null> {
    if (!texts.length) return null;
    try {
      const res = await httpRequest(`${this.brainUrl}/api/brain/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts }),
        timeoutMs: 30_000,
      });
      if (!res.ok) {
        logger.warn({ status: res.status }, 'Brain embeddings request failed; continuing without vectors');
        return null;
      }
      const data = await res.json() as { available?: boolean; vectors?: number[][]; model?: string; reason?: string };
      if (!data.available || !data.vectors?.length || !data.model) {
        logger.debug({ reason: data.reason }, 'No embedding model available; continuing without vectors');
        return null;
      }
      return { vectors: data.vectors, model: data.model, dim: data.vectors[0].length };
    } catch (err) {
      logger.warn({ err }, 'Brain embeddings call threw; continuing without vectors');
      return null;
    }
  }
}

/** Stable content hash used to skip re-embedding unchanged knowledge. */
export function embeddableContentHash(parts: Array<string | undefined>): string {
  return createHash('sha256').update(parts.filter((p) => typeof p === 'string').join('\n')).digest('hex');
}
