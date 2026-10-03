/**
 * `assistant.json` parsing (ADK_DEVELOPER_GUIDE.md §1.1).
 *
 * The manifest is the whole of an Assistant's static identity. It carries no
 * approval setting: gating is derived from each Skill's tier (§2.2) and cannot
 * be switched off here, which is why `confirmBeforeSend` is rejected rather
 * than ignored if it ever appears.
 */

import type { AssistantManifest } from './types';

export const MANIFEST_FILENAME = 'assistant.json';
export const KNOWLEDGE_DIRNAME = 'knowledge';
export const PROMPTS_DIRNAME = 'prompts';
export const SKILLS_DIRNAME = 'skills';
export const TOOLS_DIRNAME = 'tools';

export interface ManifestIssue {
  path: string;
  message: string;
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** Manifest keys the ADK owns. Anything else must be a domain policy. */
const RESERVED_MANIFEST_KEYS = ['confirmBeforeSend', 'requiresConfirmation', 'approvalPolicy', 'deliveryMode', 'knowledgeDelivery'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(
  raw: Record<string, unknown>,
  key: string,
  path: string,
  issues: ManifestIssue[],
): string | undefined {
  const value = raw[key];
  if (typeof value !== 'string' || value.trim() === '') {
    issues.push({ path: `${path}.${key}`, message: 'must be a non-empty string' });
    return undefined;
  }
  return value;
}

/**
 * Validates a parsed manifest and returns the typed shape, or `null` when the
 * manifest cannot be used.
 *
 * Returning the issues alongside the manifest — rather than throwing — is what
 * lets `adk:validate` report every problem in a folder in one pass instead of
 * stopping at the first.
 */
export function parseManifest(raw: unknown, path = MANIFEST_FILENAME): { manifest?: AssistantManifest; issues: ManifestIssue[] } {
  const issues: ManifestIssue[] = [];

  if (!isPlainObject(raw)) {
    return { issues: [{ path, message: 'assistant.json must contain a JSON object' }] };
  }

  for (const key of RESERVED_MANIFEST_KEYS) {
    if (key in raw) {
      issues.push({
        path: `${path}.${key}`,
        message:
          'approval and knowledge-delivery behaviour is not configurable here; the gate is derived from each Skill tier and static knowledge is always seeded into the Vector Knowledge Store',
      });
    }
  }

  const id = requireString(raw, 'id', path, issues);
  const name = requireString(raw, 'name', path, issues);
  const description = requireString(raw, 'description', path, issues);
  const version = requireString(raw, 'version', path, issues);

  if (version !== undefined && !SEMVER.test(version)) {
    issues.push({ path: `${path}.version`, message: `must be a semantic version, got "${version}"` });
  }

  if (id !== undefined && !/^[a-z][a-z0-9-]*$/.test(id)) {
    issues.push({ path: `${path}.id`, message: 'must be a lowercase kebab-case identifier matching its folder name' });
  }

  const domainKnowledgeFilesRaw = raw.domainKnowledgeFiles;
  if (!Array.isArray(domainKnowledgeFilesRaw) || domainKnowledgeFilesRaw.length === 0) {
    issues.push({ path: `${path}.domainKnowledgeFiles`, message: 'must be a non-empty array of knowledge/ paths' });
  } else {
    for (const entry of domainKnowledgeFilesRaw) {
      if (typeof entry !== 'string' || entry.trim() === '') {
        issues.push({ path: `${path}.domainKnowledgeFiles`, message: 'every entry must be a non-empty path string' });
        continue;
      }
      if (entry.startsWith('/') || entry.includes('..') || !entry.startsWith(`${KNOWLEDGE_DIRNAME}/`)) {
        issues.push({
          path: `${path}.domainKnowledgeFiles`,
          message: `"${entry}" must be a folder-relative path inside ${KNOWLEDGE_DIRNAME}/`,
        });
      }
    }
  }

  if ('policies' in raw && !isPlainObject(raw.policies)) {
    issues.push({ path: `${path}.policies`, message: 'must be an object when present' });
  }

  if (issues.length > 0) return { issues };

  return {
    issues,
    manifest: {
      id: id as string,
      name: name as string,
      description: description as string,
      version: version as string,
      domainKnowledgeFiles: [...(domainKnowledgeFilesRaw as string[])],
      ...(isPlainObject(raw.policies) ? { policies: raw.policies } : {}),
    },
  };
}

/**
 * Human-readable summary of a manifest, used in validation output.
 */
export function describeManifest(manifest: AssistantManifest): string {
  const knowledge = manifest.domainKnowledgeFiles.length;
  const noun = knowledge === 1 ? 'knowledge file' : 'knowledge files';
  return `${manifest.id} v${manifest.version} — ${manifest.name} (${knowledge} ${noun})`;
}
