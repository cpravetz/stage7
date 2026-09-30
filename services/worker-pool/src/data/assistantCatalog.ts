import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { AssistantDefinition } from '@stage7-nextgen/shared';
import { loadAssistantKnowledge } from './assistantKnowledge';

/**
 * Assistants are discovered from the filesystem, not listed in code.
 *
 * Each assistant owns exactly one folder:
 *
 *   services/worker-pool/assistants/<assistantId>/assistant.json
 *   services/worker-pool/knowledge/assistants/<assistantId>.txt
 *
 * Adding an assistant therefore means creating a folder and its two files.
 * There is no shared registry to edit, and no import to add, so a new assistant
 * cannot be half-added by missing a second file.
 *
 * The JSON is the source of truth for identity (name, description, system
 * prompt, category) and for the ordered list of skill IDs bound to the
 * assistant. It is read at startup rather than imported so the build does not
 * need to know how many assistants exist.
 */

const SYSTEM_TENANT = 'system';

/**
 * Resolves to `<packageRoot>/assistants` in both the compiled (`dist/data/`) and
 * source (`src/data/`) layouts, since `dist` and `src` are each one level below
 * the package root.
 */
export const ASSISTANTS_DIR = path.resolve(__dirname, '..', '..', 'assistants');

/** The subset of `assistant.json` this module reads. */
interface AssistantManifestFile {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  category?: string;
  tools?: string[];
}

const REQUIRED_STRING_FIELDS = ['id', 'name', 'description', 'systemPrompt'] as const;

/**
 * Validates one manifest. Every problem is reported with the file that caused
 * it: a malformed assistant must fail startup naming itself, not as an
 * anonymous empty assistant.
 */
function parseAssistantFile(assistantId: string, file: string): AssistantDefinition {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(
      `Assistant manifest for "${assistantId}" at ${file} is not valid JSON. ` +
        `Underlying error: ${(err as Error).message}`,
    );
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Assistant manifest for "${assistantId}" at ${file} must be a JSON object.`);
  }

  const parsed = raw as Record<string, unknown>;

  for (const field of REQUIRED_STRING_FIELDS) {
    const value = parsed[field];
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(
        `Assistant manifest for "${assistantId}" at ${file} is missing a non-empty "${field}".`,
      );
    }
  }

  // The folder name is authoritative. A manifest that claims a different id
  // would seed an assistant whose folder does not match, and the mismatch only
  // surfaces later as confusing STAGE7_ASSISTANTS behaviour.
  if (parsed.id !== assistantId) {
    throw new Error(
      `Assistant manifest at ${file} declares id "${String(parsed.id)}" but lives in the ` +
        `"${assistantId}" folder. The folder name and the id must match.`,
    );
  }

  const tools = parsed.tools;
  if (tools !== undefined && !Array.isArray(tools)) {
    throw new Error(`Assistant manifest for "${assistantId}" at ${file} has a non-array "tools".`);
  }
  const toolIds = ((tools ?? []) as unknown[]).map((t) => {
    if (typeof t !== 'string' || !t.trim()) {
      throw new Error(
        `Assistant manifest for "${assistantId}" at ${file} has a non-string entry in "tools".`,
      );
    }
    return t;
  });

  const duplicate = toolIds.find((id, i) => toolIds.indexOf(id) !== i);
  if (duplicate) {
    throw new Error(
      `Assistant manifest for "${assistantId}" at ${file} lists "${duplicate}" more than once.`,
    );
  }

  const id = assistantId;

  return {
    id,
    tenantId: SYSTEM_TENANT,
    name: parsed.name as string,
    description: parsed.description as string,
    systemPrompt: parsed.systemPrompt as string,
    knowledge: loadAssistantKnowledge(id),
    transactionGuidance: [],
    tools: toolIds.map((toolId) => ({
      name: toolId,
      description: `Canonical skill binding: ${toolId}`,
      inputSchema: { type: 'object', properties: {} },
    })),
    metadata: {
      category: typeof parsed.category === 'string' ? parsed.category : 'general',
      catalog: 'canonical',
      source: 'tool-executor-canonical-skills',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** Assistant IDs, in stable directory order. */
export function listAssistantIds(): string[] {
  return readdirSync(ASSISTANTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Loads every assistant found on disk.
 *
 * Ordering is directory order, so the catalog is deterministic. A folder with
 * no manifest, or with more than one, throws: a half-added assistant that
 * silently seeds nothing is the failure this is designed to prevent.
 */
export function loadAssistantCatalog(): AssistantDefinition[] {
  const definitions: AssistantDefinition[] = [];

  for (const assistantId of listAssistantIds()) {
    const dir = path.join(ASSISTANTS_DIR, assistantId);
    const file = path.join(dir, 'assistant.json');

    if (!existsSync(file)) {
      throw new Error(
        `Assistant folder "${assistantId}" (${dir}) has no assistant.json. ` +
          `Every assistant folder must define exactly one assistant.json.`,
      );
    }

    definitions.push(parseAssistantFile(assistantId, file));
  }

  return definitions;
}
