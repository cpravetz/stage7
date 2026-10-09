import { AssistantDefinition, AssistantRuntimeConfig } from '@stage7-nextgen/shared';
import { ArtifactsService } from '@stage7-nextgen/artifacts';
import { logger } from '@stage7-nextgen/shared';
import { buildAssistantManifest, validateManifest } from '../data/assistantManifest';

export class AssistantLoader {
  private persistence: ArtifactsService;
  private assistants: Map<string, AssistantDefinition>;
  private runtimes: Map<string, AssistantRuntimeConfig>;
  private manifestCache: { validIds: string[]; catalog: AssistantDefinition[] } | null = null;

  constructor(persistence: ArtifactsService) {
    this.persistence = persistence;
    this.assistants = new Map();
    this.runtimes = new Map();
  }

  refreshManifestCache(): void {
    const manifest = buildAssistantManifest(process.env.STAGE7_ASSISTANTS);
    this.manifestCache = { validIds: manifest.validIds, catalog: manifest.catalog };
  }

  getManifestCatalog(): AssistantDefinition[] {
    if (!this.manifestCache) {
      this.refreshManifestCache();
    }
    return this.manifestCache!.catalog;
  }

  getManifestSelectedIds(): string[] {
    if (!this.manifestCache) {
      this.refreshManifestCache();
    }
    return this.manifestCache!.validIds;
  }

  getValidationResult(): { valid: boolean; missing: string[]; validIds: string[] } {
    return validateManifest(this.getManifestSelectedIds());
  }

  async loadFromPersistence(): Promise<number> {
    const stored = await this.persistence.listAssistants();

    // Detect persisted assistants that lack tool bindings. This should not
    // happen under normal operation because assistant catalog seeding writes
    // canonical tool lists on first registration. If such records are found,
    // emit a diagnostic log with timestamps to help track how they were created.
    const problematic: Array<{ id: string; createdAt?: Date; updatedAt?: Date; tools?: any }> = [];

    for (const assistant of stored) {
      this.assistants.set(assistant.id, assistant);
      if (!assistant.tools || assistant.tools.length === 0) {
        problematic.push({ id: assistant.id, createdAt: assistant.createdAt, updatedAt: assistant.updatedAt, tools: assistant.tools });
      }
    }

    if (problematic.length > 0) {
      logger.warn({ count: problematic.length, assistants: problematic }, 'Found persisted assistant(s) with missing or empty tool bindings');
      // Also provide a higher-visibility info log that operators can search for
      // in deployments that aggregate logs separately from warnings.
      logger.info({ assistants: problematic.map((p) => ({ id: p.id, createdAt: p.createdAt, updatedAt: p.updatedAt })) }, 'Persisted assistants missing tools (investigate how these records were created)');
    }

    const runtimes = await this.persistence.listAssistantRuntimes();
    for (const rt of runtimes) {
      this.runtimes.set(rt.assistantId, rt);
    }
    logger.info({ count: stored.length }, 'Assistants loaded from persistence');
    return stored.length;
  }

  async register(definition: AssistantDefinition): Promise<AssistantDefinition> {
    // Ensure no `model` is persisted with assistant definitions
    const defToSave = { ...(definition as any) } as any;
    if (defToSave.model) delete defToSave.model;

    // Defensive fix: if an assistant is being registered with no tools (empty
    // or missing), inject the canonical tools from the on-disk manifest if
    // available. This prevents accidental persistence of assistants without
    // their canonical skill bindings (observed as an operational failure).
    // Do not overwrite non-empty user-provided tools.
    if ((!defToSave.tools || defToSave.tools.length === 0)) {
      try {
        const catalog = this.getManifestCatalog();
        const canonical = catalog.find((a) => a.id === defToSave.id);
        if (canonical && Array.isArray(canonical.tools) && canonical.tools.length > 0) {
          defToSave.tools = canonical.tools;
          logger.info({ assistantId: defToSave.id }, 'Injected canonical tools into assistant before persisting (defensive)');
        }
      } catch (err) {
        // Non-fatal: if manifest cannot be read for any reason, continue with
        // the given definition and let the earlier diagnostic logs catch it.
        logger.warn({ err, assistantId: defToSave.id }, 'Failed to inject canonical tools while persisting assistant');
      }
    }

    const saved = await this.persistence.saveAssistant(defToSave as AssistantDefinition);
    this.assistants.set(saved.id, saved);
    logger.info({ assistantId: saved.id }, 'Assistant registered and persisted');
    return saved;
  }

  async unregister(assistantId: string): Promise<boolean> {
    const existed = this.assistants.has(assistantId);
    await this.persistence.deleteAssistant(assistantId);
    this.assistants.delete(assistantId);
    this.runtimes.delete(assistantId);
    if (existed) logger.info({ assistantId }, 'Assistant unregistered and removed from persistence');
    return existed;
  }

  async update(assistantId: string, updates: Partial<AssistantDefinition>): Promise<AssistantDefinition | undefined> {
    const existing = this.assistants.get(assistantId);
    if (!existing) return undefined;
    // Prevent persisting any `model` value on assistants
    const sanitizedUpdates = { ...(updates as any) } as any;
    if (sanitizedUpdates.model) delete sanitizedUpdates.model;
    const updated: AssistantDefinition = {
      ...existing,
      ...sanitizedUpdates,
      id: existing.id,
      tenantId: existing.tenantId,
      updatedAt: new Date(),
    };
    const saved = await this.persistence.saveAssistant(updated);
    this.assistants.set(assistantId, saved);
    logger.info({ assistantId }, 'Assistant updated and persisted');
    return saved;
  }

  get(assistantId: string): AssistantDefinition | undefined {
    return this.assistants.get(assistantId);
  }

  list(): AssistantDefinition[] {
    return Array.from(this.assistants.values());
  }

  async configureRuntime(assistantId: string, config: Partial<AssistantRuntimeConfig>): Promise<AssistantRuntimeConfig> {
    const existing = this.runtimes.get(assistantId) || {
      assistantId,
      workerId: `worker-${assistantId}`,
      taskQueue: `queue-${assistantId}`,
      maxConcurrency: 1,
      timeoutMs: 30000,
    };
    const merged = { ...existing, ...config, assistantId };
    await this.persistence.saveAssistantRuntime(assistantId, merged);
    this.runtimes.set(assistantId, merged);
    return merged;
  }

  getRuntime(assistantId: string): AssistantRuntimeConfig | undefined {
    return this.runtimes.get(assistantId);
  }

  listRuntimes(): AssistantRuntimeConfig[] {
    return Array.from(this.runtimes.values());
  }
}
