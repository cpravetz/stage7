/**
 * The Assistant catalog.
 *
 * Every Assistant is discovered from its own folder under `src/assistants/`
 * (ADK_OVERVIEW.md §2.1). Nothing about an Assistant is registered here beyond
 * its identifier: the folder is the blueprint, and this module is the list of
 * blueprints that ship. Adding an Assistant means adding a folder.
 *
 * The catalog is also where blueprint immutability is made real — every loaded
 * Skill is frozen before it is handed out, so a caller that reaches through the
 * catalog and mutates a Skill cannot change what the next caller sees.
 */

import * as path from 'path';
import type { Tool } from '../types';
import { loadBlueprint, inspectLayout } from './blueprint';
import { producibleEventIndex, validateBlueprint, type ValidationReport } from './validate';
import type { AssistantBlueprint, AssistantManifest } from './types';

/** Folder holding every Assistant blueprint, relative to `src/`. */
export const ASSISTANTS_DIRNAME = 'assistants';

export const ASSISTANT_IDS = [
  'analytics',
  'career',
  'content',
  'cto',
  'education',
  'event',
  'executive',
  'finance',
  'healthcare',
  'hotel',
  'hr',
  'investment',
  'legal',
  'marketing',
  'product',
  'restaurant',
  'sales',
  'scriptwriting',
  'songwriting',
  'sports',
  'support',
] as const;

export type AssistantId = (typeof ASSISTANT_IDS)[number];

/**
 * Deep-freezes a Skill before it enters the catalog.
 *
 * `Object.freeze` is shallow, so the nested schema objects need their own pass —
 * a schema mutated in place after registration would be a blueprint change
 * slipping through the one check meant to prevent it.
 */
function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== 'object' || value === null) return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);

  Object.freeze(value);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    deepFreeze((value as Record<string, unknown>)[key], seen);
  }
  return value;
}

export function freezeTool(tool: Tool): Tool {
  return deepFreeze(tool);
}

export interface AssistantRegistration {
  id: AssistantId;
  skills: Tool[];
  /** Human-readable scope line shown on the Overview page. */
  productObject: string;
  flow: string;
}

export interface AssistantCatalog {
  blueprints: Map<AssistantId, AssistantBlueprint>;
  order: AssistantId[];
}

export function createCatalog(): AssistantCatalog {
  return { blueprints: new Map(), order: [] };
}

export function registerAssistant(catalog: AssistantCatalog, registration: AssistantRegistration): AssistantBlueprint {
  const root = path.join(__dirname, '..', ASSISTANTS_DIRNAME, registration.id);
  const skills = registration.skills.map(freezeTool);

  // The folder is the blueprint, so the manifest is read from it rather than
  // assembled here. `skills` is the only thing the catalog contributes, because
  // the Skill registry lives in the Assistant's own `index.ts`.
  const { blueprint, issues } = loadBlueprint(root, skills, { expectFolderId: registration.id });
  if (!blueprint) {
    const detail = issues.map((issue) => `  ${issue.path}: ${issue.message}`).join('\n');
    throw new Error(`Assistant "${registration.id}" is not a valid blueprint:\n${detail}`);
  }

  catalog.blueprints.set(registration.id, blueprint);
  if (!catalog.order.includes(registration.id)) catalog.order.push(registration.id);
  return blueprint;
}

export function getBlueprint(catalog: AssistantCatalog, id: AssistantId): AssistantBlueprint | undefined {
  return catalog.blueprints.get(id);
}

/** Every Skill in the catalog, canonical and lower-order alike. */
export function allCatalogSkills(catalog: AssistantCatalog): Tool[] {
  return catalog.order.flatMap((id) => {
    const blueprint = catalog.blueprints.get(id);
    return blueprint ? [...blueprint.canonicalSkills, ...blueprint.lowerOrderTools] : [];
  });
}

/** Every Skill that mounts an Overview panel, across the whole catalog. */
export function allCanonicalSkills(catalog: AssistantCatalog): Tool[] {
  return catalog.order.flatMap((id) => catalog.blueprints.get(id)?.canonicalSkills ?? []);
}

/**
 * Validates every Assistant folder against the checklist rules.
 *
 * Reports the folder's own structural problems as well as the blueprint's, so a
 * folder missing `prompts/` fails here rather than at deployment.
 */
export function validateCatalog(catalog: AssistantCatalog): ValidationReport[] {
  const reports: ValidationReport[] = [];
  // Computed once across every Assistant: a producer and its subscriber are
  // often in different ones, so a per-Assistant set would flag valid edges.
  const index = producibleEventIndex(
    catalog.order.flatMap((id) => {
      const blueprint = catalog.blueprints.get(id);
      return blueprint ? [blueprint] : [];
    }),
  );

  for (const id of catalog.order) {
    const blueprint = catalog.blueprints.get(id);
    if (!blueprint) continue;
    reports.push(
      validateBlueprint(blueprint, {
        layout: inspectLayout(blueprint.root),
        producibleEventIds: index.ids,
        eventProducers: index.producers,
      }),
    );
  }

  return reports;
}

/** Manifests of every registered Assistant, in catalog order. */
export function catalogManifests(catalog: AssistantCatalog): AssistantManifest[] {
  return catalog.order.flatMap((id) => {
    const blueprint = catalog.blueprints.get(id);
    return blueprint ? [blueprint.manifest] : [];
  });
}
