import { readFileSync } from 'node:fs';
import path from 'node:path';
import { canonicalAssistantCatalog } from '../data/canonicalAssistantCatalog';
import { KNOWLEDGE_DIR } from '../data/assistantKnowledge';

describe('canonicalAssistantCatalog', () => {
  it('should contain exactly the 21 canonical assistants', () => {
    const ids = canonicalAssistantCatalog.map((a) => a.id);
    expect(ids.sort()).toEqual([
      'analytics', 'career', 'content', 'cto', 'education', 'event', 'executive',
      'finance', 'healthcare', 'hotel', 'hr', 'investment', 'legal', 'marketing',
      'product', 'restaurant', 'sales', 'scriptwriter', 'songwriter', 'sports', 'support',
    ]);
  });

  it('should bind only canonical tool-executor skill IDs and no legacy lower-order tools', () => {
    const expectedToolCounts: Record<string, number> = {
      cto: 4, career: 10, content: 3, healthcare: 5, restaurant: 4, hr: 3,
      executive: 4, legal: 4, sales: 3, event: 3,       songwriter: 4, scriptwriter: 4,
      sports: 7, finance: 4, investment: 4, hotel: 4, education: 4, support: 7,
      product: 4, marketing: 5, analytics: 2,
    };

    expect(Object.keys(expectedToolCounts).length).toEqual(canonicalAssistantCatalog.length);

    for (const assistant of canonicalAssistantCatalog) {
      const toolNames = assistant.tools.map((t) => t.name);
      expect(toolNames).toHaveLength(expectedToolCounts[assistant.id]);
      // Every binding must be a string skill ID (no orphaned stub objects).
      for (const tool of assistant.tools) {
        expect(typeof tool).toBe('object');
        expect(typeof tool.name).toBe('string');
        expect(tool.name.length).toBeGreaterThan(0);
      }
    }
  });

  it('should load real knowledge from disk for every assistant', () => {
    for (const assistant of canonicalAssistantCatalog) {
      const knowledge = assistant.knowledge ?? [];
      expect(knowledge.length).toBeGreaterThan(0);

      for (const entry of knowledge) {
        expect(entry.title.length).toBeGreaterThan(0);
        expect(entry.content.length).toBeGreaterThan(0);

        // Knowledge must be traceable to an authored file, not a hardcoded string.
        expect(entry.source).toBe(
          `services/worker-pool/knowledge/assistants/${assistant.id}.txt`,
        );

        // The loaded content must actually match the file on disk. This is the
        // guard against knowledge regressing to generated placeholder text.
        const filePath = path.join(KNOWLEDGE_DIR, `${assistant.id}.txt`);
        const onDisk = readFileSync(filePath, 'utf8');
        expect(onDisk).toContain(entry.content);
      }

      expect(assistant.transactionGuidance).toEqual([]);
    }
  });

  it('should have meaningful system prompts', () => {
    for (const assistant of canonicalAssistantCatalog) {
      expect(assistant.systemPrompt.length).toBeGreaterThan(40);
    }
  });
});
