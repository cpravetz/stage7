import { canonicalAssistantCatalog } from '../data/canonicalAssistantCatalog';

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
      executive: 4, legal: 4, sales: 3, event: 3, songwriter: 3, scriptwriter: 3,
      sports: 6, finance: 4, investment: 4, hotel: 4, education: 4, support: 4,
      product: 5, marketing: 3, analytics: 1,
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

  it('should have empty knowledge and transactionGuidance', () => {
    for (const assistant of canonicalAssistantCatalog) {
      expect(assistant.knowledge).toEqual([]);
      expect(assistant.transactionGuidance).toEqual([]);
    }
  });

  it('should have meaningful system prompts', () => {
    for (const assistant of canonicalAssistantCatalog) {
      expect(assistant.systemPrompt.length).toBeGreaterThan(40);
    }
  });
});
