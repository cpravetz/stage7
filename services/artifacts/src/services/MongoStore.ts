import { MongoClient, Db, Collection } from 'mongodb';
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

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017';
const MONGO_DB = process.env.MONGO_DB || 'stage7';

type VectorDoc = { _id: string; vector: number[] };

export class MongoStore {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private connected = false;

  private documents!: Collection<PersistenceDocument>;
  private missions!: Collection<MissionState & { _id?: string }>;
  private agents!: Collection<AgentState & { _id?: string }>;
  private vectors!: Collection<VectorDoc>;
  private assistants!: Collection<AssistantDefinition & { _id?: string }>;
  private assistantRuntimes!: Collection<AssistantRuntimeConfig & { _id?: string }>;
  private assistantTemplates!: Collection<AssistantTemplate & { _id?: string }>;
  private missionPlans!: Collection<{ missionId: string; plan: any }>;
  private missionPhases!: Collection<any>;
  private missionTasks!: Collection<any>;
  private missionEvents!: Collection<any>;

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      this.client = new MongoClient(MONGO_URI);
      await this.client.connect();
      this.db = this.client.db(MONGO_DB);

      this.documents = this.db.collection<PersistenceDocument>('documents');
      this.missions = this.db.collection<MissionState & { _id?: string }>('missions');
      this.agents = this.db.collection<AgentState & { _id?: string }>('agents');
      this.vectors = this.db.collection<VectorDoc>('vectors');
      this.assistants = this.db.collection<AssistantDefinition & { _id?: string }>('assistants');
      this.assistantRuntimes = this.db.collection<AssistantRuntimeConfig & { _id?: string }>('assistantRuntimes');
      this.assistantTemplates = this.db.collection<AssistantTemplate & { _id?: string }>('assistantTemplates');
      this.missionPlans = this.db.collection<{ missionId: string; plan: any }>('missionPlans');
      this.missionPhases = this.db.collection<any>('missionPhases');
      this.missionTasks = this.db.collection<any>('missionTasks');
      this.missionEvents = this.db.collection<any>('missionEvents');

      await this.documents.createIndex({ id: 1 }, { unique: true });
      await this.missions.createIndex({ missionId: 1 }, { unique: true });
      await this.agents.createIndex({ agentId: 1 }, { unique: true });
      await this.assistants.createIndex({ id: 1 }, { unique: true });
      await this.assistantTemplates.createIndex({ id: 1 }, { unique: true });
      await this.missionPlans.createIndex({ missionId: 1 }, { unique: true });
      await this.missionPhases.createIndex({ missionId: 1, phaseId: 1 }, { unique: true });
      await this.missionTasks.createIndex({ missionId: 1, taskId: 1 }, { unique: true });
      await this.missionEvents.createIndex({ missionId: 1, timestamp: 1 });

      this.connected = true;
      logger.info({ uri: MONGO_URI, db: MONGO_DB }, 'MongoStore connected');
    } catch (err) {
      logger.error({ err }, 'MongoStore connection failed');
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.connected = false;
      this.client = null;
      this.db = null;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async createDocument(doc: Omit<PersistenceDocument, 'createdAt' | 'updatedAt'>): Promise<PersistenceDocument> {
    const now = new Date();
    const document: PersistenceDocument = {
      ...doc,
      createdAt: now,
      updatedAt: now,
    };
    await this.documents.insertOne(document);
    logger.debug({ documentId: document.id, collection: document.collection }, 'Document created');
    return document;
  }

  async getDocument(id: string): Promise<PersistenceDocument | undefined> {
    const result = await this.documents.findOne({ id } as any);
    return result ?? undefined;
  }

  async updateDocument(id: string, updates: Partial<PersistenceDocument>): Promise<PersistenceDocument | undefined> {
    const existing = await this.documents.findOne({ id } as any);
    if (!existing) return undefined;

    const updated: PersistenceDocument = {
      ...existing,
      ...updates,
      id: existing.id,
      updatedAt: new Date(),
    };
    await this.documents.replaceOne({ id } as any, updated);
    logger.debug({ documentId: id }, 'Document updated');
    return updated;
  }

  async deleteDocument(id: string): Promise<boolean> {
    const result = await this.documents.deleteOne({ id } as any);
    await this.vectors.deleteOne({ _id: id } as any);
    const existed = result.deletedCount > 0;
    if (existed) logger.debug({ documentId: id }, 'Document deleted');
    return existed;
  }

  async queryDocuments(query: PersistenceQuery): Promise<PersistenceResult> {
    const mongoQuery: Record<string, unknown> = { collection: query.collection };

    if (query.filter) {
      for (const [key, value] of Object.entries(query.filter)) {
        mongoQuery[`data.${key}`] = value;
      }
    }

    const total = await this.documents.countDocuments(mongoQuery);

    let cursor = this.documents.find(mongoQuery);

    if (query.sort) {
      const [field, direction] = Object.entries(query.sort)[0];
      cursor = cursor.sort({ [`data.${field}`]: direction === -1 ? -1 : 1, id: 1 } as any);
    }

    const offset = query.offset || 0;
    const limit = query.limit || 10;

    cursor = cursor.skip(offset).limit(limit);

    const documents = await cursor.toArray();

    return {
      documents,
      total,
      hasMore: offset + limit < total,
    };
  }

  async searchVectors(query: VectorSearchQuery): Promise<VectorSearchResult[]> {
    const vectors = await this.vectors.find({}).toArray();

    const results: VectorSearchResult[] = [];

    for (const entry of vectors) {
      const score = this.cosineSimilarity(query.query, entry.vector);
      if (score >= (query.minScore || 0)) {
        const doc = await this.getDocument(entry._id);
        if (doc && (!query.filter || this.matchesFilter(doc, query.filter))) {
          results.push({
            id: entry._id,
            score,
            document: doc,
          });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, query.limit || 10);
  }

  async saveMissionState(state: MissionState): Promise<void> {
    const doc = { ...state, _id: state.missionId } as any;
    await this.missions.replaceOne({ missionId: state.missionId } as any, doc, { upsert: true });
    logger.debug({ missionId: state.missionId, status: state.status }, 'Mission state saved');
  }

  async getMissionState(missionId: string): Promise<MissionState | undefined> {
    const result = await this.missions.findOne({ missionId } as any);
    if (!result) return undefined;
    const { _id, ...rest } = result as any;
    return rest;
  }

  async listMissionStates(tenantId?: string): Promise<MissionState[]> {
    const query: Record<string, string> = tenantId ? { tenantId } : {};
    const results = await this.missions.find(query).toArray();
    return results.map((r: any) => {
      const { _id, ...rest } = r;
      return rest;
    });
  }

  async deleteMissionState(missionId: string): Promise<void> {
    await this.missions.deleteOne({ missionId } as any);
  }

  async saveAgentState(state: AgentState): Promise<void> {
    const doc = { ...state, _id: state.agentId } as any;
    await this.agents.replaceOne({ agentId: state.agentId } as any, doc, { upsert: true });
    logger.debug({ agentId: state.agentId }, 'Agent state saved');
  }

  async getAgentState(agentId: string): Promise<AgentState | undefined> {
    const result = await this.agents.findOne({ agentId } as any);
    if (!result) return undefined;
    const { _id, ...rest } = result as any;
    return rest;
  }

  async listAgentStates(tenantId?: string): Promise<AgentState[]> {
    const query: Record<string, string> = tenantId ? { tenantId } : {};
    const results = await this.agents.find(query).toArray();
    return results.map((r: any) => {
      const { _id, ...rest } = r;
      return rest;
    });
  }

  async saveAssistant(definition: AssistantDefinition): Promise<AssistantDefinition> {
    const now = new Date();
    const existing = await this.assistants.findOne({ id: definition.id } as any);
    const assistant: AssistantDefinition = {
      ...definition,
      createdAt: (existing as any)?.createdAt || definition.createdAt || now,
      updatedAt: now,
    };
    await this.assistants.replaceOne({ id: assistant.id } as any, assistant as any, { upsert: true });
    logger.debug({ assistantId: definition.id }, 'Assistant saved');
    return assistant;
  }

  async getAssistant(id: string): Promise<AssistantDefinition | undefined> {
    const result = await this.assistants.findOne({ id } as any);
    return result ?? undefined;
  }

  async listAssistants(tenantId?: string): Promise<AssistantDefinition[]> {
    const query: Record<string, string> = tenantId ? { tenantId } : {};
    const results = await this.assistants.find(query as any).toArray();
    return results.map((r: any) => {
      const { _id, ...rest } = r;
      return rest;
    });
  }

  async deleteAssistant(id: string): Promise<boolean> {
    const result = await this.assistants.deleteOne({ id } as any);
    await this.assistantRuntimes.deleteOne({ _id: id } as any);
    const existed = result.deletedCount > 0;
    if (existed) logger.debug({ assistantId: id }, 'Assistant deleted');
    return existed;
  }

  async saveAssistantRuntime(assistantId: string, config: AssistantRuntimeConfig): Promise<void> {
    const doc = { ...config, _id: assistantId } as any;
    await this.assistantRuntimes.replaceOne({ _id: assistantId } as any, doc, { upsert: true });
    logger.debug({ assistantId }, 'Assistant runtime saved');
  }

  async getAssistantRuntime(assistantId: string): Promise<AssistantRuntimeConfig | undefined> {
    const result = await this.assistantRuntimes.findOne({ _id: assistantId } as any);
    if (!result) return undefined;
    const { _id, ...rest } = result as any;
    return rest;
  }

  async listAssistantRuntimes(): Promise<AssistantRuntimeConfig[]> {
    const results = await this.assistantRuntimes.find({}).toArray();
    return results.map((r: any) => {
      const { _id, ...rest } = r;
      return rest;
    });
  }

  async saveTemplate(template: AssistantTemplate): Promise<AssistantTemplate> {
    const now = new Date();
    const existing = await this.assistantTemplates.findOne({ id: template.id } as any);
    const saved: AssistantTemplate = {
      ...template,
      createdAt: (existing as any)?.createdAt || template.createdAt || now,
      updatedAt: now,
    };
    await this.assistantTemplates.replaceOne({ id: saved.id } as any, saved as any, { upsert: true });
    logger.debug({ templateId: template.id }, 'Assistant template saved');
    return saved;
  }

  async getTemplate(id: string): Promise<AssistantTemplate | undefined> {
    const result = await this.assistantTemplates.findOne({ id } as any);
    return result ?? undefined;
  }

  async listTemplates(): Promise<AssistantTemplate[]> {
    const results = await this.assistantTemplates.find({}).toArray();
    return results.map((r: any) => {
      const { _id, ...rest } = r;
      return rest;
    });
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const result = await this.assistantTemplates.deleteOne({ id } as any);
    const existed = result.deletedCount > 0;
    if (existed) logger.debug({ templateId: id }, 'Assistant template deleted');
    return existed;
  }

  async saveMissionPlan(missionId: string, plan: any): Promise<any> {
    await this.missionPlans.replaceOne({ missionId }, { missionId, plan }, { upsert: true });
    return plan;
  }

  async getMissionPlan(missionId: string): Promise<any | undefined> {
    const result = await this.missionPlans.findOne({ missionId });
    return result?.plan;
  }

  async updateMissionPhase(missionId: string, phaseId: string, update: any): Promise<any> {
    const existing = await this.missionPhases.findOne({ missionId, phaseId });
    const merged = { ...(existing || { id: phaseId, missionId }), ...update, id: phaseId, missionId, updatedAt: Date.now() };
    await this.missionPhases.replaceOne({ missionId, phaseId }, merged, { upsert: true });

    const planResult = await this.missionPlans.findOne({ missionId });
    if (planResult?.plan && Array.isArray(planResult.plan.phases)) {
      const newPhases = planResult.plan.phases.map((p: any) =>
        p.id === phaseId ? { ...p, ...update } : p
      );
      await this.missionPlans.replaceOne({ missionId }, { missionId, plan: { ...planResult.plan, phases: newPhases } }, { upsert: true });
    }

    return merged;
  }

  async getMissionPhase(missionId: string, phaseId: string): Promise<any | undefined> {
    const result = await this.missionPhases.findOne({ missionId, phaseId });
    return result;
  }

  async updateMissionTask(missionId: string, taskId: string, update: any): Promise<any> {
    const existing = await this.missionTasks.findOne({ missionId, taskId });
    const merged = { ...(existing || { id: taskId, missionId }), ...update, id: taskId, missionId, updatedAt: Date.now() };
    await this.missionTasks.replaceOne({ missionId, taskId }, merged, { upsert: true });

    const planResult = await this.missionPlans.findOne({ missionId });
    if (planResult?.plan && Array.isArray(planResult.plan.phases)) {
      const newPhases = planResult.plan.phases.map((phase: any) => {
        if (Array.isArray(phase.tasks)) {
          const newTasks = phase.tasks.map((t: any) =>
            t.id === taskId ? { ...t, ...update } : t
          );
          return { ...phase, tasks: newTasks };
        }
        return phase;
      });
      await this.missionPlans.replaceOne({ missionId }, { missionId, plan: { ...planResult.plan, phases: newPhases } }, { upsert: true });
    }

    return merged;
  }

  async getMissionTask(missionId: string, taskId: string): Promise<any | undefined> {
    const result = await this.missionTasks.findOne({ missionId, taskId });
    return result;
  }

  async appendMissionEvent(missionId: string, event: any): Promise<any> {
    const e = { ...event, timestamp: event.timestamp || Date.now(), missionId };
    await this.missionEvents.insertOne(e);
    return e;
  }

  async listMissionEvents(missionId: string): Promise<any[]> {
    const results = await this.missionEvents.find({ missionId }).sort({ timestamp: 1 }).toArray();
    return results;
  }

  async upsertVector(id: string, vector: number[]): Promise<void> {
    await this.vectors.replaceOne({ _id: id }, { _id: id, vector } as any, { upsert: true });
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private matchesFilter(doc: PersistenceDocument, filter: Record<string, unknown>): boolean {
    return Object.entries(filter).every(([key, value]) => {
      const docValue = (doc.data as any)?.[key];
      return JSON.stringify(docValue) === JSON.stringify(value);
    });
  }
}
