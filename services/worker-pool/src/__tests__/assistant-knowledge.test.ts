import { loadAssistantKnowledge, KNOWLEDGE_DIR } from '../data/assistantKnowledge';
import { existsSync } from 'node:fs';
import path from 'node:path';

describe('loadAssistantKnowledge', () => {
  it('resolves the knowledge directory to the authored files', () => {
    expect(existsSync(KNOWLEDGE_DIR)).toBe(true);
  });

  it('loads a real entry for every canonical assistant id', () => {
    const ids = [
      'analytics', 'career', 'content', 'cto', 'education', 'event', 'executive',
      'finance', 'healthcare', 'hotel', 'hr', 'investment', 'legal', 'marketing',
      'product', 'restaurant', 'sales', 'scriptwriter', 'songwriter', 'sports', 'support',
    ];

    for (const id of ids) {
      expect(existsSync(path.join(KNOWLEDGE_DIR, `${id}.txt`))).toBe(true);

      const entries = loadAssistantKnowledge(id);
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe(`${id}-core-knowledge`);
      expect(entries[0].content.length).toBeGreaterThan(0);
    }
  });

  it('strips the title heading out of the content body', () => {
    const [entry] = loadAssistantKnowledge('healthcare');
    expect(entry.title).toBe('Healthcare Advisor');
    // The H1 is consumed as the title, not left duplicated in the body.
    expect(entry.content).not.toMatch(/^#\s+Healthcare Advisor$/m);
    expect(entry.content.startsWith('## Scope')).toBe(true);
  });

  it('throws rather than silently returning empty knowledge for a missing file', () => {
    expect(() => loadAssistantKnowledge('does-not-exist')).toThrow(/Missing knowledge file/);
  });
});
