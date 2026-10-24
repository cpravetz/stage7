import { ArtifactsService } from '@stage7-nextgen/artifacts';
import type { PersistenceDocument, PersistenceQuery } from '@stage7-nextgen/artifacts';

export function createTestArtifactsService(): ArtifactsService {
  const artifacts = new ArtifactsService();
  const documents = new Map<string, PersistenceDocument>();
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
