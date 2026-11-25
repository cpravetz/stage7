import { ArtifactsService } from '@stage7-nextgen/artifacts';
import type { PersistenceDocument, PersistenceQuery } from '@stage7-nextgen/artifacts';

function cosine(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function createTestArtifactsService(): ArtifactsService {
  const artifacts = new ArtifactsService();
  const documents = new Map<string, PersistenceDocument>();
  const vectors = new Map<string, { vector: number[]; model?: string; dim?: number; contentHash?: string; collection?: string; filter?: Record<string, unknown> }>();
  jest.spyOn(artifacts, 'ready').mockResolvedValue();
  jest.spyOn(artifacts, 'createDocument').mockImplementation(async (input) => {
    const now = new Date();
    const document = { ...input, createdAt: now, updatedAt: now };
    documents.set(document.id, document);
    return document;
  });
  jest.spyOn(artifacts, 'getDocument').mockImplementation(async (id) => documents.get(id));
  jest.spyOn(artifacts, 'updateDocument').mockImplementation(async (id, updates) => {
    const existing = documents.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, id: existing.id, updatedAt: new Date() };
    documents.set(id, updated);
    return updated;
  });
  jest.spyOn(artifacts, 'deleteDocument').mockImplementation(async (id) => documents.delete(id));
  jest.spyOn(artifacts, 'getVector').mockImplementation(async (id) => vectors.get(id));
  jest.spyOn(artifacts, 'upsertVector').mockImplementation(async (id, vector, meta = {}) => {
    vectors.set(id, { vector, ...meta });
  });
  jest.spyOn(artifacts, 'deleteVector').mockImplementation(async (id) => vectors.delete(id));
  jest.spyOn(artifacts, 'searchVectors').mockImplementation(async (query) => {
    const results = [];
    for (const [id, entry] of vectors.entries()) {
      if (query.model && entry.model !== query.model) continue;
      if (entry.collection && entry.collection !== query.collection) continue;
      const doc = documents.get(id);
      if (doc && (!query.filter || Object.entries(query.filter).every(([k, v]) => doc.data[k] === v))) {
        results.push({
          id,
          score: cosine(query.query, entry.vector),
          document: doc,
        });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, query.limit || 10);
  });
  jest.spyOn(artifacts, 'queryDocuments').mockImplementation(async (query: PersistenceQuery) => {
    let matches = Array.from(documents.values()).filter((doc) => doc.collection === query.collection);
    if (query.filter) {
      matches = matches.filter((doc) =>
        Object.entries(query.filter!).every(([key, value]) => doc.data[key] === value),
      );
    }
    const total = matches.length;
    const offset = query.offset || 0;
    const limit = query.limit || 10;
    return {
      documents: matches.slice(offset, offset + limit),
      total,
      hasMore: offset + limit < total,
    };
  });
  return artifacts;
}
