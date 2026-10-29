import { createHash } from 'node:crypto';

export interface EntityMemoryInput {
  tenantId: string;
  entityId: string;
  assistantId: string;
  missionId: string;
  summary: string;
  preferences: string[];
  constraints: string[];
  decisions: string[];
}

export interface EntityMemoryDocument extends EntityMemoryInput {
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ArtifactDocument {
  id: string;
  data: EntityMemoryDocument;
}

interface ArtifactSearchResponse {
  documents: ArtifactDocument[];
}

export class EntityMemoryStore {
  private static instance: EntityMemoryStore | undefined;
  private readonly artifactsUrl = (process.env.ARTIFACTS_URL || 'http://artifacts:4200').replace(/\/+$/, '');

  static getInstance(): EntityMemoryStore {
    this.instance ??= new EntityMemoryStore();
    return this.instance;
  }

  private documentId(tenantId: string, assistantId: string, entityId: string): string {
    const hash = createHash('sha256')
      .update(`${tenantId}\0${assistantId}\0${entityId}`)
      .digest('hex');
    return `entity-memory-${hash}`;
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
    return response.json() as Promise<T>;
  }

  async upsert(input: EntityMemoryInput): Promise<EntityMemoryDocument> {
    const id = this.documentId(input.tenantId, input.assistantId, input.entityId);
    const search = await this.request<ArtifactSearchResponse>('/api/artifacts/documents/search', {
      method: 'POST',
      body: JSON.stringify({
        collection: 'entity_memories',
        filter: {
          tenantId: input.tenantId,
          assistantId: input.assistantId,
          entityId: input.entityId,
          active: true,
        },
        limit: 1,
      }),
    });
    const previous = search.documents[0]?.data;
    const unique = (prior: string[], next: string[]): string[] =>
      Array.from(new Set([...prior, ...next])).slice(-50);
    const now = new Date().toISOString();
    const document: EntityMemoryDocument = {
      ...input,
      summary: [previous?.summary, input.summary.trim()]
        .filter((entry): entry is string => Boolean(entry))
        .join('\n')
        .slice(-4000),
      preferences: unique(previous?.preferences ?? [], input.preferences),
      constraints: unique(previous?.constraints ?? [], input.constraints),
      decisions: unique(previous?.decisions ?? [], input.decisions),
      active: true,
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    };
    await this.request('/api/artifacts/documents', {
      method: 'POST',
      body: JSON.stringify({
        id,
        tenantId: input.tenantId,
        collection: 'entity_memories',
        data: document,
      }),
    });
    return document;
  }

  async getActive(entityId: string, assistantId?: string, tenantId?: string): Promise<EntityMemoryDocument[]> {
    const result = await this.request<ArtifactSearchResponse>('/api/artifacts/documents/search', {
      method: 'POST',
      body: JSON.stringify({
        collection: 'entity_memories',
        filter: {
          entityId,
          active: true,
          ...(assistantId ? { assistantId } : {}),
          ...(tenantId ? { tenantId } : {}),
        },
        limit: 10,
        sort: { updatedAt: -1 },
      }),
    });
    return result.documents.map((document) => document.data);
  }
}
