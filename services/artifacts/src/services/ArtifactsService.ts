import { MongoStore } from './MongoStore';
import {
  PersistenceDocument,
  PersistenceQuery,
  PersistenceResult,
  BrainLogRecord,
  BrainPerformanceMetric,
  VectorSearchQuery,
  VectorSearchResult,
  MissionState,
  AgentState,
} from '../types';
import { AssistantDefinition, AssistantTemplate, AssistantRuntimeConfig } from '@stage7-nextgen/shared';
import { logger } from '@stage7-nextgen/shared';

export class ArtifactsService {
  private store: MongoStore | null = null;
  private readyPromise: Promise<void> | null = null;
  private lastMongoError: unknown = null;

  /** Connects on first use and never falls back to process-local memory. */
  ready(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = this.connectMongo().catch((err: unknown) => {
        this.readyPromise = null;
        throw err;
      });
    }
    return this.readyPromise;
  }

  isDurable(): boolean {
    return this.store?.isConnected() ?? false;
  }

  isDegraded(): boolean {
    return !this.isDurable();
  }

  isPersistenceAvailable(): boolean {
    return this.isDurable();
  }

  getMongoError(): unknown {
    return this.lastMongoError;
  }

  private async connectMongo(): Promise<void> {
    const attempts = 5;
    let lastErr: unknown = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const mongoStore = new MongoStore();
      try {
        await mongoStore.connect();
        this.store = mongoStore;
        this.lastMongoError = null;
        logger.info({ attempts: attempt }, 'ArtifactsService using MongoDB');
        return;
      } catch (err) {
        lastErr = err;
        logger.warn({ attempt, attempts, err }, 'MongoDB connection attempt failed');
        try {
          await mongoStore.disconnect();
        } catch (closeError) {
          logger.warn({ attempt, err: closeError }, 'Failed to close MongoDB client after connection failure');
        }
        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        }
      }
    }

    this.lastMongoError = lastErr;
    logger.error(
      { err: lastErr, uri: process.env.MONGO_URI },
      'MongoDB unreachable after retries; artifacts persistence is unavailable',
    );
    throw new Error('MongoDB unavailable; artifacts persistence cannot continue', { cause: lastErr });
  }

  private async useStore<T>(operation: (store: MongoStore) => Promise<T>): Promise<T> {
    await this.ready();
    if (!this.store?.isConnected()) {
      throw new Error('MongoDB is not connected; artifacts persistence is unavailable');
    }
    return operation(this.store);
  }

  async createDocument(doc: Omit<PersistenceDocument, 'createdAt' | 'updatedAt'>): Promise<PersistenceDocument> {
    return this.useStore((store) => store.createDocument(doc));
  }

  async getDocument(id: string): Promise<PersistenceDocument | undefined> {
    return this.useStore((store) => store.getDocument(id));
  }

  async updateDocument(id: string, updates: Partial<PersistenceDocument>): Promise<PersistenceDocument | undefined> {
    return this.useStore((store) => store.updateDocument(id, updates));
  }

  async deleteDocument(id: string): Promise<boolean> {
    return this.useStore((store) => store.deleteDocument(id));
  }

  async queryDocuments(query: PersistenceQuery): Promise<PersistenceResult> {
    return this.useStore((store) => store.queryDocuments(query));
  }

  async listBrainLogs(limit = 200): Promise<BrainLogRecord[]> {
    return this.useStore((store) => store.listBrainLogs(limit));
  }

  async appendBrainLog(entry: BrainLogRecord): Promise<void> {
    return this.useStore((store) => store.appendBrainLog(entry));
  }

  async saveBrainPerformanceMetric(metric: BrainPerformanceMetric): Promise<void> {
    return this.useStore((store) => store.saveBrainPerformanceMetric(metric));
  }

  async listBrainPerformanceMetrics(): Promise<BrainPerformanceMetric[]> {
    return this.useStore((store) => store.listBrainPerformanceMetrics());
  }

  async clearBrainPerformanceMetrics(): Promise<void> {
    return this.useStore((store) => store.clearBrainPerformanceMetrics());
  }

  async searchVectors(query: VectorSearchQuery): Promise<VectorSearchResult[]> {
    return this.useStore((store) => store.searchVectors(query));
  }

  async saveMissionState(state: MissionState): Promise<void> {
    return this.useStore((store) => store.saveMissionState(state));
  }

  async getMissionState(missionId: string): Promise<MissionState | undefined> {
    return this.useStore((store) => store.getMissionState(missionId));
  }

  async listMissionStates(tenantId?: string): Promise<MissionState[]> {
    return this.useStore((store) => store.listMissionStates(tenantId));
  }

  async claimMissionRecoveryLease(
    missionId: string,
    ownerId: string,
    expiresAt: Date,
    now: Date,
  ): Promise<boolean> {
    return this.useStore((store) => store.claimMissionRecoveryLease(missionId, ownerId, expiresAt, now));
  }

  async renewMissionRecoveryLease(missionId: string, ownerId: string, expiresAt: Date): Promise<boolean> {
    return this.useStore((store) => store.renewMissionRecoveryLease(missionId, ownerId, expiresAt));
  }

  async releaseMissionRecoveryLease(missionId: string, ownerId: string): Promise<boolean> {
    return this.useStore((store) => store.releaseMissionRecoveryLease(missionId, ownerId));
  }

  async deleteMissionState(missionId: string): Promise<void> {
    return this.useStore((store) => store.deleteMissionState(missionId));
  }

  async saveAgentState(state: AgentState): Promise<void> {
    return this.useStore((store) => store.saveAgentState(state));
  }

  async getAgentState(agentId: string): Promise<AgentState | undefined> {
    return this.useStore((store) => store.getAgentState(agentId));
  }

  async listAgentStates(tenantId?: string): Promise<AgentState[]> {
    return this.useStore((store) => store.listAgentStates(tenantId));
  }

  async saveAssistant(definition: AssistantDefinition): Promise<AssistantDefinition> {
    return this.useStore((store) => store.saveAssistant(definition));
  }

  async getAssistant(id: string): Promise<AssistantDefinition | undefined> {
    return this.useStore((store) => store.getAssistant(id));
  }

  async listAssistants(tenantId?: string): Promise<AssistantDefinition[]> {
    return this.useStore((store) => store.listAssistants(tenantId));
  }

  async deleteAssistant(id: string): Promise<boolean> {
    return this.useStore((store) => store.deleteAssistant(id));
  }

  async saveAssistantRuntime(assistantId: string, config: AssistantRuntimeConfig): Promise<void> {
    return this.useStore((store) => store.saveAssistantRuntime(assistantId, config));
  }

  async getAssistantRuntime(assistantId: string): Promise<AssistantRuntimeConfig | undefined> {
    return this.useStore((store) => store.getAssistantRuntime(assistantId));
  }

  async listAssistantRuntimes(): Promise<AssistantRuntimeConfig[]> {
    return this.useStore((store) => store.listAssistantRuntimes());
  }

  async saveTemplate(template: AssistantTemplate): Promise<AssistantTemplate> {
    return this.useStore((store) => store.saveTemplate(template));
  }

  async getTemplate(id: string): Promise<AssistantTemplate | undefined> {
    return this.useStore((store) => store.getTemplate(id));
  }

  async listTemplates(): Promise<AssistantTemplate[]> {
    return this.useStore((store) => store.listTemplates());
  }

  async deleteTemplate(id: string): Promise<boolean> {
    return this.useStore((store) => store.deleteTemplate(id));
  }

  async saveMissionPlan(missionId: string, plan: any): Promise<any> {
    return this.useStore((store) => store.saveMissionPlan(missionId, plan));
  }
  async getMissionPlan(missionId: string): Promise<any | undefined> {
    return this.useStore((store) => store.getMissionPlan(missionId));
  }
  async updateMissionPhase(missionId: string, phaseId: string, update: any): Promise<any> {
    return this.useStore((store) => store.updateMissionPhase(missionId, phaseId, update));
  }
  async getMissionPhase(missionId: string, phaseId: string): Promise<any | undefined> {
    return this.useStore((store) => store.getMissionPhase(missionId, phaseId));
  }
  async updateMissionTask(missionId: string, taskId: string, update: any): Promise<any> {
    return this.useStore((store) => store.updateMissionTask(missionId, taskId, update));
  }
  async getMissionTask(missionId: string, taskId: string): Promise<any | undefined> {
    return this.useStore((store) => store.getMissionTask(missionId, taskId));
  }
  async appendMissionEvent(missionId: string, event: any): Promise<any> {
    return this.useStore((store) => store.appendMissionEvent(missionId, event));
  }
  async listMissionEvents(missionId: string): Promise<any[]> {
    return this.useStore((store) => store.listMissionEvents(missionId));
  }

  async listPendingApprovals(): Promise<Array<{ missionId: string; phaseId: string; phaseName: string; question: string; assistantId?: string }>> {
    return this.useStore((store) => store.listPendingApprovals());
  }

}

export const artifactsService = new ArtifactsService();
