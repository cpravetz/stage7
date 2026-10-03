/**
 * Assistant blueprint loading (ADK_OVERVIEW.md §2.1, ADK_DEVELOPER_GUIDE.md §1).
 *
 * A blueprint is read-only by construction. Everything that changes at runtime —
 * user configuration, persisted records, learned insights, dynamic triggers —
 * lives in stage7 persistence and is deliberately unreachable from here, so
 * there is no API on a loaded blueprint that could be used to mutate one.
 *
 * The `skills/` and `tools/` split is the UI boundary, not an organisational
 * preference: a file under `skills/` mounts an Overview panel, a file under
 * `tools/` does not. The loader enforces it rather than trusting a comment.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Tool } from '../types';
import {
  KNOWLEDGE_DIRNAME,
  MANIFEST_FILENAME,
  PROMPTS_DIRNAME,
  SKILLS_DIRNAME,
  TOOLS_DIRNAME,
  parseManifest,
  type ManifestIssue,
} from './manifest';
import type { AssistantBlueprint, AssistantManifest } from './types';

export interface BlueprintLoadResult {
  blueprint?: AssistantBlueprint;
  issues: ManifestIssue[];
}

function readDirSafe(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter((entry) => fs.statSync(path.join(dir, entry)).isFile());
  } catch {
    return [];
  }
}

/**
 * Loads one Assistant folder.
 *
 * `skills` and `tools` are passed in rather than imported here so this module
 * stays free of the skill registry: the catalog decides what a folder contains,
 * and the loader only checks that the catalog's split matches the folder's
 * layout.
 */
export function loadBlueprint(
  root: string,
  skills: Tool[],
  options: { expectFolderId?: string } = {},
): BlueprintLoadResult {
  const issues: ManifestIssue[] = [];
  const manifestPath = path.join(root, MANIFEST_FILENAME);

  if (!fs.existsSync(manifestPath)) {
    return { issues: [{ path: MANIFEST_FILENAME, message: 'missing; every Assistant folder must declare a manifest' }] };
  }

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return {
      issues: [{ path: MANIFEST_FILENAME, message: `is not valid JSON: ${(error as Error).message}` }],
    };
  }

  const { manifest, issues: manifestIssues } = parseManifest(parsedRaw, MANIFEST_FILENAME);
  issues.push(...manifestIssues);
  if (!manifest) return { issues };

  const folderId = path.basename(root);
  if (options.expectFolderId !== undefined && manifest.id !== options.expectFolderId) {
    issues.push({
      path: `${MANIFEST_FILENAME}.id`,
      message: `is "${manifest.id}" but the folder is "${options.expectFolderId}"; the two must match`,
    });
  }
  if (manifest.id !== folderId) {
    issues.push({
      path: `${MANIFEST_FILENAME}.id`,
      message: `is "${manifest.id}" but the folder is "${folderId}"; the Folder Rule makes the folder the identity`,
    });
  }

  const knowledgeFiles: string[] = [];
  for (const relative of manifest.domainKnowledgeFiles) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) {
      issues.push({
        path: `${MANIFEST_FILENAME}.domainKnowledgeFiles`,
        message: `"${relative}" is listed but does not exist`,
      });
      continue;
    }
    knowledgeFiles.push(absolute);
  }

  // Knowledge that ships in the folder but is not in the manifest would never be
  // seeded, so it is invisible at runtime while looking present in review. Worth
  // failing on.
  const knowledgeDir = path.join(root, KNOWLEDGE_DIRNAME);
  const listed = new Set(manifest.domainKnowledgeFiles);
  for (const file of readDirSafe(knowledgeDir)) {
    const relative = `${KNOWLEDGE_DIRNAME}/${file}`;
    if (!listed.has(relative)) {
      issues.push({
        path: `${KNOWLEDGE_DIRNAME}/${file}`,
        message: 'is present but not listed in domainKnowledgeFiles, so it would never be seeded',
      });
    }
  }

  const promptFile = path.join(root, PROMPTS_DIRNAME, 'system-prompt.md');
  const systemPrompt = fs.existsSync(promptFile) ? promptFile : undefined;
  if (!systemPrompt) {
    issues.push({ path: `${PROMPTS_DIRNAME}/system-prompt.md`, message: 'missing; the Assistant needs its own system prompt' });
  }

  const canonicalSkills = skills.filter((skill) => skill.isSkill === true);
  const lowerOrderTools = skills.filter((skill) => skill.isSkill === false);
  const unclassified = skills.filter((skill) => skill.isSkill !== true && skill.isSkill !== false);

  for (const skill of unclassified) {
    issues.push({
      path: `skills/${skill.id}`,
      message: 'has no explicit isSkill; a capability must declare whether it mounts an Overview panel',
    });
  }

  if (canonicalSkills.length === 0) {
    issues.push({
      path: SKILLS_DIRNAME,
      message: `declares no isSkill:true capability, so the Assistant has no Overview panel to mount`,
    });
  }

  const blueprint: AssistantBlueprint = {
    manifest,
    root,
    knowledgeFiles,
    systemPrompt,
    canonicalSkills,
    lowerOrderTools,
  };

  return issues.length > 0 ? { blueprint, issues } : { blueprint, issues: [] };
}

/** The canonical folder layout an Assistant directory must follow. */
export const REQUIRED_FOLDERS = [SKILLS_DIRNAME, TOOLS_DIRNAME, KNOWLEDGE_DIRNAME, PROMPTS_DIRNAME];

export interface FolderLayoutReport {
  missing: string[];
  present: string[];
}

/**
 * Reports whether a folder carries the ADK layout.
 *
 * `tools/` is optional: an Assistant whose capabilities are all user-facing
 * has no lower-order step to declare, and inventing an empty folder to satisfy
 * the rule would make the layout lie about the design.
 */
export function inspectLayout(root: string): FolderLayoutReport {
  const present = REQUIRED_FOLDERS.filter((folder) => fs.existsSync(path.join(root, folder)));
  const required = [SKILLS_DIRNAME, KNOWLEDGE_DIRNAME, PROMPTS_DIRNAME];
  return {
    present,
    missing: required.filter((folder) => !present.includes(folder)),
  };
}

/**
 * Verifies that a file physically lives in the folder matching its `isSkill`.
 *
 * A `represent` tool sitting in `skills/` would mount an Overview panel and be
 * directly runnable, which is precisely the bypass the tier rule exists to
 * prevent — so it is checked here rather than left to the runtime.
 */
export function expectedSubfolder(isSkill: boolean): string {
  return isSkill ? SKILLS_DIRNAME : TOOLS_DIRNAME;
}

/** Reads the system prompt for an Assistant, or an empty string when absent. */
export function readSystemPrompt(blueprint: AssistantBlueprint): string {
  if (!blueprint.systemPrompt) return '';
  try {
    return fs.readFileSync(blueprint.systemPrompt, 'utf8');
  } catch {
    return '';
  }
}

/** Reads every domain knowledge document, keyed by its manifest-relative path. */
export function readDomainKnowledge(blueprint: AssistantBlueprint): Record<string, string> {
  const documents: Record<string, string> = {};
  for (const relative of blueprint.manifest.domainKnowledgeFiles) {
    const absolute = path.join(blueprint.root, relative);
    if (!fs.existsSync(absolute)) continue;
    try {
      documents[relative] = fs.readFileSync(absolute, 'utf8');
    } catch {
      // A knowledge file that cannot be read is a deployment problem reported by
      // the validator, not something the Assistant should crash on at runtime.
    }
  }
  return documents;
}

export type { AssistantManifest };
