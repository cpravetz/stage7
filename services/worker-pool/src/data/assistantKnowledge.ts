import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { AssistantKnowledgeEntry, StoredKnowledgeEntry } from '@stage7-nextgen/shared';
import { logger } from '@stage7-nextgen/shared';

/**
 * Each assistant's authored knowledge lives in a plain text file under
 * `services/worker-pool/knowledge/assistants/<assistantId>.txt`.
 *
 * The file is the source of truth. A missing or empty file is a startup error,
 * never a silently empty knowledge base: an assistant that appears to have
 * knowledge but has none is indistinguishable, to the operator, from an
 * assistant with no knowledge configured.
 *
 * File format: an optional leading `# Title` heading (used as the entry title)
 * followed by the body (used verbatim as the entry content).
 */

/**
 * Resolves to `<packageRoot>/knowledge/assistants` in both the compiled
 * (`dist/data/`) and source (`src/data/`) layouts, since `dist` and `src` are
 * each one level below the package root.
 */
export const KNOWLEDGE_DIR = path.resolve(__dirname, '..', '..', 'knowledge', 'assistants');

function parseKnowledgeFile(assistantId: string, raw: string): AssistantKnowledgeEntry {
  const normalized = raw.replace(/\r\n/g, '\n').trim();

  if (!normalized) {
    throw new Error(
      `Knowledge file for assistant "${assistantId}" is empty: ${path.join(KNOWLEDGE_DIR, `${assistantId}.txt`)}`,
    );
  }

  const heading = /^#\s+(.+)$/m.exec(normalized);
  if (!heading) {
    throw new Error(
      `Knowledge file for assistant "${assistantId}" has no "# Title" heading: ` +
        `${path.join(KNOWLEDGE_DIR, `${assistantId}.txt`)}`,
    );
  }

  const title = heading[1].trim();
  // Remove exactly the heading line that produced the title, by span, rather
  // than re-matching a pattern that could land on a different line.
  const content = (normalized.slice(0, heading.index) + normalized.slice(
    heading.index + heading[0].length,
  )).trim();

  if (!content) {
    throw new Error(
      `Knowledge file for assistant "${assistantId}" has a title but no content: ` +
        `${path.join(KNOWLEDGE_DIR, `${assistantId}.txt`)}`,
    );
  }

  return {
    id: `${assistantId}-core-knowledge`,
    title,
    content,
    source: `services/worker-pool/knowledge/assistants/${assistantId}.txt`,
  };
}

/**
 * Reads the knowledge authored for `assistantId` from disk.
 * Throws if the file is absent, empty, or malformed — see the note above.
 */
export function loadAssistantKnowledge(assistantId: string): AssistantKnowledgeEntry[] {
  const file = path.join(KNOWLEDGE_DIR, `${assistantId}.txt`);

  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (err) {
    throw new Error(
      `Missing knowledge file for assistant "${assistantId}" at ${file}. ` +
        `Create it, or remove the assistant from the catalog. ` +
        `Underlying error: ${(err as Error).message}`,
      { cause: err },
    );
  }

  const entry = parseKnowledgeFile(assistantId, raw);
  logger.info({ assistantId, source: entry.source, contentLength: entry.content.length },
    'Loaded assistant knowledge from file');
  return [entry];
}

/**
 * Converts a file-loaded entry into its persisted form. Authored knowledge is
 * always assistant-scoped; shared entries are recorded separately at runtime.
 */
export function toStoredAuthoredEntry(
  assistantId: string,
  entry: AssistantKnowledgeEntry,
): StoredKnowledgeEntry {
  return {
    ...entry,
    assistantId,
    scope: 'assistant',
    origin: 'authored',
  };
}
