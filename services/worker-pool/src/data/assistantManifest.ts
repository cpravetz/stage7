import { AssistantDefinition } from '@stage7-nextgen/shared';
import { canonicalAssistantCatalog } from './canonicalAssistantCatalog';

export interface AssistantManifest {
  selectedIds: string[];
  validIds: string[];
  missing: string[];
  catalog: AssistantDefinition[];
}

export function normalizeAssistantId(id: string): string {
  return id.trim().replace(/-canonical-assistant$/i, '');
}

export function parseSTAGE7_ASSISTANTS(envValue?: string): string[] {
  if (!envValue || envValue.trim() === '') return [];
  return envValue
    .split(',')
    .map(normalizeAssistantId)
    .filter((id) => id.length > 0);
}

export function validateManifest(
  assistantIds: string[],
  catalog: AssistantDefinition[] = canonicalAssistantCatalog,
): { valid: boolean; missing: string[]; validIds: string[] } {
  const catalogIds = new Set(catalog.map((a) => normalizeAssistantId(a.id)));
  const normalizedIds = assistantIds.map(normalizeAssistantId);
  const missing = normalizedIds.filter((id) => !catalogIds.has(id));
  const validIds = normalizedIds.filter((id) => catalogIds.has(id));
  return {
    valid: missing.length === 0,
    missing,
    validIds,
  };
}

export function filterCatalogByManifest(
  assistantIds: string[],
  catalog: AssistantDefinition[] = canonicalAssistantCatalog,
): AssistantDefinition[] {
  if (assistantIds.length === 0) return catalog;
  const idSet = new Set(assistantIds.map(normalizeAssistantId));
  return catalog.filter((a) => idSet.has(normalizeAssistantId(a.id)));
}

export function buildAssistantManifest(
  envValue?: string,
  catalog: AssistantDefinition[] = canonicalAssistantCatalog,
): AssistantManifest {
  const selectedIds = parseSTAGE7_ASSISTANTS(envValue);
  const { valid, missing, validIds } = validateManifest(selectedIds, catalog);
  return {
    selectedIds,
    validIds,
    missing,
    catalog: filterCatalogByManifest(validIds, catalog),
  };
}

export function getSelectedAssistantIds(
  manifest: AssistantManifest,
): string[] {
  return manifest.validIds;
}

export function hasManifestSelection(
  manifest: AssistantManifest,
): boolean {
  return manifest.selectedIds.length > 0;
}

export function getManifestValidationError(
  manifest: AssistantManifest,
): string | null {
  if (manifest.missing.length === 0) return null;
  return `STAGE7_ASSISTANTS references unknown assistant(s): ${manifest.missing.join(', ')}`;
}
