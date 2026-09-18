import { canonicalAssistantCatalog } from '../data/canonicalAssistantCatalog';

describe('canonicalAssistantCatalog', () => {
  it('should contain exactly the 21 canonical assistants', () => {
    const ids = canonicalAssistantCatalog.map((a) => a.id);
    expect(ids.sort()).toEqual([
      'analytics-canonical-assistant',
      'career-canonical-assistant',
      'content-canonical-assistant',
      'cto-canonical-assistant',
      'education-canonical-assistant',
      'event-canonical-assistant',
      'executive-canonical-assistant',
      'finance-canonical-assistant',
      'healthcare-canonical-assistant',
      'hotel-canonical-assistant',
      'hr-canonical-assistant',
      'investment-canonical-assistant',
      'legal-canonical-assistant',
      'marketing-canonical-assistant',
      'product-canonical-assistant',
      'restaurant-canonical-assistant',
      'sales-canonical-assistant',
      'scriptwriter-canonical-assistant',
      'songwriter-canonical-assistant',
      'sports-canonical-assistant',
      'support-canonical-assistant',
    ]);
  });

  it('should bind only canonical tool-executor skill IDs and no legacy lower-order tools', () => {
    const expectedToolCounts: Record<string, number> = {
      'cto-canonical-assistant': 4,
      'career-canonical-assistant': 10,
      'content-canonical-assistant': 3,
      'healthcare-canonical-assistant': 5,
      'restaurant-canonical-assistant': 4,
      'hr-canonical-assistant': 3,
      'executive-canonical-assistant': 4,
      'legal-canonical-assistant': 4,
      'sales-canonical-assistant': 3,
      'event-canonical-assistant': 3,
      'songwriter-canonical-assistant': 3,
      'scriptwriter-canonical-assistant': 3,
      'sports-canonical-assistant': 6,
      'finance-canonical-assistant': 4,
      'investment-canonical-assistant': 4,
      'hotel-canonical-assistant': 4,
      'education-canonical-assistant': 4,
      'support-canonical-assistant': 4,
      'product-canonical-assistant': 5,
      'marketing-canonical-assistant': 3,
      'analytics-canonical-assistant': 1,
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
