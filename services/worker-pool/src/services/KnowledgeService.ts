import { ArtifactsService } from '@stage7-nextgen/artifacts';

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  source?: string;
  tags?: string[];
  domain?: string;
}

export class KnowledgeService {
  constructor(private artifacts: ArtifactsService) {}

  async getSkillKnowledge(knowledgeIds: string[]): Promise<KnowledgeEntry[]> {
    if (!knowledgeIds.length) return [];
    const docs = await this.artifacts.queryDocuments({
      collection: 'knowledge',
      filter: { id: { $in: knowledgeIds } },
    });
    return docs.documents.map(d => d.data as unknown as KnowledgeEntry);
  }

  async getAssistantKnowledge(assistantId: string): Promise<KnowledgeEntry[]> {
    const assistant = await this.artifacts.getAssistant(assistantId);
    if (!assistant?.knowledge) return [];
    return assistant.knowledge;
  }

  async searchKnowledge(query: string, knowledgeIds?: string[]): Promise<KnowledgeEntry[]> {
    const docs = await this.artifacts.queryDocuments({
      collection: 'knowledge',
      limit: 100,
    });
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const entries = docs.documents
      .map(d => d.data as unknown as KnowledgeEntry)
      .filter(entry => {
        if (knowledgeIds?.length && !knowledgeIds.includes(entry.id)) return false;
        if (!terms.length) return true;
        const searchable = [entry.title, entry.content, ...(entry.tags || []), entry.domain]
          .filter((value): value is string => typeof value === 'string')
          .join(' ')
          .toLowerCase();
        return terms.some(term => searchable.includes(term));
      });
    return entries.slice(0, 5);
  }

  async saveKnowledge(entry: KnowledgeEntry): Promise<void> {
    await this.artifacts.createDocument({
      id: entry.id,
      collection: 'knowledge',
      tenantId: 'system',
      data: entry as unknown as Record<string, unknown>,
    });
  }
}
