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

  constructor() {
    const mongoUri = process.env.MONGO_URI;
    this.store = new InMemoryStore();

    if (mongoUri) {
      this.mongoStore = new MongoStore();
      this.connectMongo();
    }
  }

  private async connectMongo(): Promise<void> {
    try {
      await this.mongoStore!.connect();
      this.store = this.mongoStore!;
      logger.info('ArtifactsService using MongoDB');
    } catch (err) {
      logger.warn({ err }, 'MongoDB connection failed, falling back to InMemoryStore');
      this.mongoStore = null;
    }
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

  async listMissionStates(): Promise<MissionState[]> {
    return this.store.listMissionStates();
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

  async listAgentStates(): Promise<AgentState[]> {
    return this.store.listAgentStates();
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

}
