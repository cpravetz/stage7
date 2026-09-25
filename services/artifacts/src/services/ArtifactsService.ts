import { InMemoryStore } from './InMemoryStore';
import { MongoStore } from './MongoStore';
import {
  PersistenceDocument,
  PersistenceQuery,
  PersistenceResult,
  VectorSearchQuery,
  VectorSearchResult,
  MissionState,
  AgentState,
} from '../types';
import { AssistantDefinition, AssistantTemplate, AssistantRuntimeConfig } from '@stage7-nextgen/shared';
import { logger } from '@stage7-nextgen/shared';

type Store = InMemoryStore | MongoStore;

export class ArtifactsService {
  private store: Store;
  private mongoStore: MongoStore | null = null;
  private readyPromise: Promise<void>;
  private mongoConfigured = false;
  private lastMongoError: unknown = null;

  constructor() {
    this.store = new InMemoryStore();

    if (process.env.MONGO_URI) {
      this.mongoConfigured = true;
      this.mongoStore = new MongoStore();
      this.readyPromise = this.connectMongo();
    } else {
      this.readyPromise = Promise.resolve();
    }
  }

  /**
   * Resolves once the backing store has been chosen.
   *
   * `connectMongo` swaps `this.store` from the in-memory store to Mongo once
   * connected. Any write issued before that swap lands in the in-memory map and
   * is discarded when the store is replaced. Callers that persist data during
   * startup must await this first, otherwise the write is silently lost.
   */
  ready(): Promise<void> {
    return this.readyPromise;
  }

  /**
   * True when writes survive process exit. False when running on the in-memory
   * store, which is only a valid mode when Mongo is not configured at all.
   */
  isDurable(): boolean {
    return this.store instanceof MongoStore;
  }

  /**
   * True when MONGO_URI was set but the connection did not establish. This is a
   * misconfiguration, not a supported mode: data written now would be lost on
   * restart, so callers that must not lose data should refuse to start.
   */
  isDegraded(): boolean {
    return this.mongoConfigured && !this.isDurable();
  }

  getMongoError(): unknown {
    return this.lastMongoError;
  }

  private async connectMongo(): Promise<void> {
    const attempts = 5;
    let lastErr: unknown = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await this.mongoStore!.connect();
        this.store = this.mongoStore!;
        logger.info({ attempts: attempt }, 'ArtifactsService using MongoDB');
        return;
      } catch (err) {
        lastErr = err;
        logger.warn({ attempt, attempts, err }, 'MongoDB connection attempt failed');
        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        }
      }
    }

    this.lastMongoError = lastErr;
    // Fall back so the process can still start in environments without Mongo,
    // but isDurable() is false and isDegraded() is true so callers can refuse.
    this.mongoStore = null;
    logger.error(
      { err: lastErr, uri: process.env.MONGO_URI },
      'MongoDB unreachable after retries; artifacts are VOLATILE and will be lost on restart',
    );
  }

  async createDocument(doc: Omit<PersistenceDocument, 'createdAt' | 'updatedAt'>): Promise<PersistenceDocument> {
    return this.store.createDocument(doc);
  }

  async getDocument(id: string): Promise<PersistenceDocument | undefined> {
    return this.store.getDocument(id);
  }

  async updateDocument(id: string, updates: Partial<PersistenceDocument>): Promise<PersistenceDocument | undefined> {
    return this.store.updateDocument(id, updates);
  }

  async deleteDocument(id: string): Promise<boolean> {
    return this.store.deleteDocument(id);
  }

  async queryDocuments(query: PersistenceQuery): Promise<PersistenceResult> {
    return this.store.queryDocuments(query);
  }

  async searchVectors(query: VectorSearchQuery): Promise<VectorSearchResult[]> {
    return this.store.searchVectors(query);
  }

  async saveMissionState(state: MissionState): Promise<void> {
    this.store.saveMissionState(state);
  }

  async getMissionState(missionId: string): Promise<MissionState | undefined> {
    return this.store.getMissionState(missionId);
  }

  async listMissionStates(tenantId?: string): Promise<MissionState[]> {
    return this.store.listMissionStates(tenantId);
  }

  async deleteMissionState(missionId: string): Promise<void> {
    await this.store.deleteMissionState(missionId);
  }

  async saveAgentState(state: AgentState): Promise<void> {
    this.store.saveAgentState(state);
  }

  async getAgentState(agentId: string): Promise<AgentState | undefined> {
    return this.store.getAgentState(agentId);
  }

  async listAgentStates(tenantId?: string): Promise<AgentState[]> {
    return this.store.listAgentStates(tenantId);
  }

  async saveAssistant(definition: AssistantDefinition): Promise<AssistantDefinition> {
    return this.store.saveAssistant(definition);
  }

  async getAssistant(id: string): Promise<AssistantDefinition | undefined> {
    return this.store.getAssistant(id);
  }

  async listAssistants(tenantId?: string): Promise<AssistantDefinition[]> {
    return this.store.listAssistants(tenantId);
  }

  async deleteAssistant(id: string): Promise<boolean> {
    return this.store.deleteAssistant(id);
  }

  async saveAssistantRuntime(assistantId: string, config: AssistantRuntimeConfig): Promise<void> {
    this.store.saveAssistantRuntime(assistantId, config);
  }

  async getAssistantRuntime(assistantId: string): Promise<AssistantRuntimeConfig | undefined> {
    return this.store.getAssistantRuntime(assistantId);
  }

  async listAssistantRuntimes(): Promise<AssistantRuntimeConfig[]> {
    return this.store.listAssistantRuntimes();
  }

  async saveTemplate(template: AssistantTemplate): Promise<AssistantTemplate> {
    return this.store.saveTemplate(template);
  }

  async getTemplate(id: string): Promise<AssistantTemplate | undefined> {
    return this.store.getTemplate(id);
  }

  async listTemplates(): Promise<AssistantTemplate[]> {
    return this.store.listTemplates();
  }

  async deleteTemplate(id: string): Promise<boolean> {
    return this.store.deleteTemplate(id);
  }

  async saveMissionPlan(missionId: string, plan: any): Promise<any> {
    return this.store.saveMissionPlan(missionId, plan);
  }
  async getMissionPlan(missionId: string): Promise<any | undefined> {
    return this.store.getMissionPlan(missionId);
  }
  async updateMissionPhase(missionId: string, phaseId: string, update: any): Promise<any> {
    return this.store.updateMissionPhase(missionId, phaseId, update);
  }
  async getMissionPhase(missionId: string, phaseId: string): Promise<any | undefined> {
    return this.store.getMissionPhase(missionId, phaseId);
  }
  async updateMissionTask(missionId: string, taskId: string, update: any): Promise<any> {
    return this.store.updateMissionTask(missionId, taskId, update);
  }
  async getMissionTask(missionId: string, taskId: string): Promise<any | undefined> {
    return this.store.getMissionTask(missionId, taskId);
  }
  async appendMissionEvent(missionId: string, event: any): Promise<any> {
    return this.store.appendMissionEvent(missionId, event);
  }
  async listMissionEvents(missionId: string): Promise<any[]> {
    return this.store.listMissionEvents(missionId);
  }

  async listPendingApprovals(): Promise<Array<{ missionId: string; phaseId: string; phaseName: string; question: string; assistantId?: string }>> {
    return this.store.listPendingApprovals();
  }

}
