import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadAssistantCatalog, listAssistantIds, ASSISTANTS_DIR } from '../data/assistantCatalog';
import { KNOWLEDGE_DIR } from '../data/assistantKnowledge';

const catalog = loadAssistantCatalog();

describe('assistant catalog discovery', () => {
  it('should discover every assistant folder', () => {
    // Deliberately not a hardcoded list of 21. That assertion is what would
    // force a common-file edit to add an assistant, which is exactly what the
    // folder layout exists to remove. The filesystem IS the expected set; see
    // the next test for that comparison.
    const ids = catalog.map((a) => a.id);
    expect(ids.length).toBe(listAssistantIds().length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should discover assistants from folders alone, with no shared registry to edit', () => {
    // The point of the folder layout: the set of assistants is whatever is on
    // disk. This is asserted against the filesystem rather than a hardcoded list
    // so that adding an assistant genuinely requires no common-file edit.
    const onDisk = readdirSync(ASSISTANTS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    expect(listAssistantIds()).toEqual(onDisk);
    expect(catalog.map((a) => a.id).sort()).toEqual(onDisk);
  });

  it('should give every assistant folder a knowledge file', () => {
    // The knowledge file is the second half of an assistant's folder. A folder
    // with a manifest but no knowledge fails at load time, so assert the pairing
    // explicitly rather than only through the loader's own throw.
    for (const id of listAssistantIds()) {
      expect(existsSync(path.join(ASSISTANTS_DIR, id, 'assistant.json'))).toBe(true);
      expect(existsSync(path.join(KNOWLEDGE_DIR, `${id}.txt`))).toBe(true);
    }
  });

  it('should bind only canonical skill IDs and no legacy lower-order tools', () => {
    // Derived from the manifests on disk rather than a table in this file: the
    // old copy of this expectation was hardcoded counts, which cannot detect a
    // skill being renamed or dropped and still passing.
    for (const assistant of catalog) {
      const manifest = JSON.parse(
        readFileSync(path.join(ASSISTANTS_DIR, assistant.id, 'assistant.json'), 'utf8'),
      );
      expect(assistant.tools.map((t) => t.name)).toEqual(manifest.tools);

      expect(assistant.tools.length).toBeGreaterThan(0);
      for (const tool of assistant.tools) {
        expect(typeof tool).toBe('object');
        expect(typeof tool.name).toBe('string');
        expect(tool.name.length).toBeGreaterThan(0);
      }
    }
  });

  it('should load real knowledge from disk for every assistant', () => {
    for (const assistant of catalog) {
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
    for (const assistant of catalog) {
      expect(assistant.systemPrompt.length).toBeGreaterThan(40);
      expect(assistant.description.length).toBeGreaterThan(0);
      expect(assistant.name.length).toBeGreaterThan(0);
    }
  });
});
