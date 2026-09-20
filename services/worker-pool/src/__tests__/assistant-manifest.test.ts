import {
  parseSTAGE7_ASSISTANTS,
  validateManifest,
  filterCatalogByManifest,
  buildAssistantManifest,
  getManifestValidationError,
  hasManifestSelection,
} from '../data/assistantManifest';
import { canonicalAssistantCatalog } from '../data/canonicalAssistantCatalog';
import { AssistantDefinition } from '@stage7-nextgen/shared';

describe('parseSTAGE7_ASSISTANTS', () => {
  it('should return empty array for undefined', () => {
    expect(parseSTAGE7_ASSISTANTS(undefined)).toEqual([]);
  });

  it('should return empty array for empty string', () => {
    expect(parseSTAGE7_ASSISTANTS('')).toEqual([]);
  });

  it('should return empty array for whitespace', () => {
    expect(parseSTAGE7_ASSISTANTS('   ')).toEqual([]);
  });

  it('should parse single assistant ID', () => {
    expect(parseSTAGE7_ASSISTANTS('cto')).toEqual(['cto']);
  });

  it('should parse comma-separated assistant IDs', () => {
    expect(parseSTAGE7_ASSISTANTS('cto,hr')).toEqual([
      'cto',
      'hr',
    ]);
  });

  it('should trim whitespace around IDs', () => {
    expect(parseSTAGE7_ASSISTANTS(' cto , hr ')).toEqual([
      'cto',
      'hr',
    ]);
  });

  it('should handle trailing comma', () => {
    expect(parseSTAGE7_ASSISTANTS('cto,')).toEqual(['cto']);
  });

  it('should normalize legacy canonical assistant IDs', () => {
    expect(parseSTAGE7_ASSISTANTS('cto-canonical-assistant,hr-canonical-assistant')).toEqual(['cto', 'hr']);
  });
});

describe('validateManifest', () => {
  it('should report valid for single existing assistant', () => {
    const result = validateManifest(['cto'], canonicalAssistantCatalog);
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.validIds).toEqual(['cto']);
  });

  it('should report valid for multiple existing assistants', () => {
    const ids = ['cto', 'hr', 'sales'];
    const result = validateManifest(ids, canonicalAssistantCatalog);
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.validIds).toEqual(ids);
  });

  it('should report missing for unknown assistant IDs', () => {
    const result = validateManifest(['nonexistent-assistant'], canonicalAssistantCatalog);
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(['nonexistent-assistant']);
    expect(result.validIds).toEqual([]);
  });

  it('should report mixed valid and missing IDs', () => {
    const result = validateManifest(['cto', 'fake-assistant'], canonicalAssistantCatalog);
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(['fake-assistant']);
    expect(result.validIds).toEqual(['cto']);
  });

  it('should handle empty selection as valid', () => {
    const result = validateManifest([], canonicalAssistantCatalog);
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.validIds).toEqual([]);
  });
});

describe('filterCatalogByManifest', () => {
  it('should return full catalog for empty selection', () => {
    const result = filterCatalogByManifest([], canonicalAssistantCatalog);
    expect(result).toHaveLength(canonicalAssistantCatalog.length);
  });

  it('should filter to single assistant for one selection', () => {
    const result = filterCatalogByManifest(['cto'], canonicalAssistantCatalog);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('cto');
  });

  it('should filter to multiple assistants for multi selection', () => {
    const selectedIds = ['cto', 'hr', 'sales'];
    const result = filterCatalogByManifest(selectedIds, canonicalAssistantCatalog);
    expect(result).toHaveLength(3);
    const ids = result.map((a) => a.id).sort();
    expect(ids).toEqual(selectedIds.sort());
  });

  it('should return empty for all-unknown selection', () => {
    const result = filterCatalogByManifest(['fake-assistant'], canonicalAssistantCatalog);
    expect(result).toHaveLength(0);
  });

  it('should preserve assistant definition structure', () => {
    const result = filterCatalogByManifest(['cto-canonical-assistant'], canonicalAssistantCatalog);
    expect(result[0]).toHaveProperty('id');
    expect(result[0]).toHaveProperty('name');
    expect(result[0]).toHaveProperty('systemPrompt');
    expect(result[0]).toHaveProperty('tools');
    expect(result[0]).toHaveProperty('metadata');
    expect(result[0].tools).toBeInstanceOf(Array);
  });
});

describe('buildAssistantManifest', () => {
  it('should build manifest for single assistant (one selection)', () => {
    const manifest = buildAssistantManifest('cto', canonicalAssistantCatalog);
    expect(manifest.selectedIds).toEqual(['cto']);
    expect(manifest.validIds).toEqual(['cto']);
    expect(manifest.missing).toEqual([]);
    expect(manifest.catalog).toHaveLength(1);
    expect(manifest.catalog[0].id).toBe('cto');
  });

  it('should build manifest for multiple assistants (multi selection)', () => {
    const ids = ['cto', 'hr', 'sales', 'product'];
    const manifest = buildAssistantManifest(ids.join(','), canonicalAssistantCatalog);
    expect(manifest.selectedIds).toEqual(ids);
    expect(manifest.validIds).toEqual(ids);
    expect(manifest.missing).toEqual([]);
    expect(manifest.catalog).toHaveLength(4);
    const catalogIds = manifest.catalog.map((a) => a.id).sort();
    expect(catalogIds).toEqual(ids.sort());
  });

  it('should build manifest for custom mixed selection with validations', () => {
    const ids = ['cto', 'fake-assistant', 'hr'];
    const manifest = buildAssistantManifest(ids.join(','), canonicalAssistantCatalog);
    expect(manifest.selectedIds).toEqual(ids);
    expect(manifest.validIds).toEqual(['cto', 'hr']);
    expect(manifest.missing).toEqual(['fake-assistant']);
    expect(manifest.catalog).toHaveLength(2);
  });

  it('should return full catalog for empty/unset env', () => {
    const manifest = buildAssistantManifest(undefined, canonicalAssistantCatalog);
    expect(manifest.selectedIds).toEqual([]);
    expect(manifest.validIds).toEqual([]);
    expect(manifest.missing).toEqual([]);
    expect(manifest.catalog).toHaveLength(canonicalAssistantCatalog.length);
  });
});

describe('getManifestValidationError', () => {
  it('should return null when all IDs are valid', () => {
    const manifest = buildAssistantManifest('cto,hr', canonicalAssistantCatalog);
    expect(getManifestValidationError(manifest)).toBeNull();
  });

  it('should return error message when IDs are missing', () => {
    const manifest = buildAssistantManifest('cto,fake-assistant', canonicalAssistantCatalog);
    const error = getManifestValidationError(manifest);
    expect(error).toBeTruthy();
    expect(error!).toContain('fake-assistant');
  });
});

describe('hasManifestSelection', () => {
  it('should return false for empty selection', () => {
    const manifest = buildAssistantManifest('', canonicalAssistantCatalog);
    expect(hasManifestSelection(manifest)).toBe(false);
  });

  it('should return true for non-empty selection', () => {
    const manifest = buildAssistantManifest('cto', canonicalAssistantCatalog);
    expect(hasManifestSelection(manifest)).toBe(true);
  });
});

describe('Assistant manifest integration with canonical catalog', () => {
  it('should filter catalog correctly for one selection', () => {
    const manifest = buildAssistantManifest('cto', canonicalAssistantCatalog);
    expect(manifest.catalog).toHaveLength(1);
    expect(manifest.catalog[0].tools.length).toBeGreaterThan(0);
  });

  it('should filter catalog correctly for multi selection', () => {
    const selectedCount = 5;
    const selected = canonicalAssistantCatalog.slice(0, selectedCount).map((a) => a.id);
    const manifest = buildAssistantManifest(selected.join(','), canonicalAssistantCatalog);
    expect(manifest.catalog).toHaveLength(selectedCount);
  });

  it('should handle custom selection with mix of valid and invalid', () => {
    const validAssistant = canonicalAssistantCatalog[0].id;
    const manifest = buildAssistantManifest(`${validAssistant},custom-assistant-1,custom-assistant-2`, canonicalAssistantCatalog);
    expect(manifest.validIds).toEqual([validAssistant]);
    expect(manifest.missing).toEqual(['custom-assistant-1', 'custom-assistant-2']);
    expect(manifest.catalog).toHaveLength(1);
  });

  it('should preserve all tool definitions in filtered catalog', () => {
    const manifest = buildAssistantManifest('cto', canonicalAssistantCatalog);
    const assistant = manifest.catalog[0];
    expect(assistant.tools).toBeInstanceOf(Array);
    expect(assistant.tools.length).toBeGreaterThan(0);
    for (const tool of assistant.tools) {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('inputSchema');
    }
  });
});
