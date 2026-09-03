import { AssistantDefinition, AssistantRuntimeConfig } from '@stage7-nextgen/shared';
import { ArtifactsService } from "../shared/artifacts";
import { logger } from '@stage7-nextgen/shared';

export class AssistantLoader {
  private persistence: ArtifactsService;
  private assistants: Map<string, AssistantDefinition>;
  private runtimes: Map<string, AssistantRuntimeConfig>;

  constructor(persistence: ArtifactsService) {
    this.persistence = persistence;
    this.assistants = new Map();
    this.runtimes = new Map();
  }

  async loadFromPersistence(): Promise<number> {
    const stored = await this.persistence.listAssistants();
    for (const assistant of stored) {
      this.assistants.set(assistant.id, assistant);
    }
    const runtimes = await this.persistence.listAssistantRuntimes();
    for (const rt of runtimes) {
      this.runtimes.set(rt.assistantId, rt);
    }
    logger.info({ count: stored.length }, 'Assistants loaded from persistence');
    return stored.length;
  }

  async register(definition: AssistantDefinition): Promise<AssistantDefinition> {
    const saved = await this.persistence.saveAssistant(definition);
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
    const updated: AssistantDefinition = {
      ...existing,
      ...updates,
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
