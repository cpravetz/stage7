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

export class InMemoryStore {
  private documents: Map<string, PersistenceDocument> = new Map();
  private missions: Map<string, MissionState> = new Map();
  private agents: Map<string, AgentState> = new Map();
  private vectors: Map<string, number[]> = new Map();
  private assistants: Map<string, AssistantDefinition> = new Map();
  private assistantRuntimes: Map<string, AssistantRuntimeConfig> = new Map();
  private assistantTemplates: Map<string, AssistantTemplate> = new Map();
  private missionPlans: Map<string, any> = new Map();
  private missionPhases: Map<string, Map<string, any>> = new Map();
  private missionTasks: Map<string, Map<string, any>> = new Map();
  private missionEvents: Map<string, any[]> = new Map();

  createDocument(doc: Omit<PersistenceDocument, 'createdAt' | 'updatedAt'>): Promise<PersistenceDocument> {
    const now = new Date();
    const document: PersistenceDocument = {
      ...doc,
      createdAt: now,
      updatedAt: now,
    };
    this.documents.set(document.id, document);
    logger.debug({ documentId: document.id, collection: document.collection }, 'Document created');
    return Promise.resolve(document);
  }

  getDocument(id: string): Promise<PersistenceDocument | undefined> {
    return Promise.resolve(this.documents.get(id));
  }

  updateDocument(id: string, updates: Partial<PersistenceDocument>): Promise<PersistenceDocument | undefined> {
    const existing = this.documents.get(id);
    if (!existing) return Promise.resolve(undefined);

    const updated: PersistenceDocument = {
      ...existing,
      ...updates,
      id: existing.id,
      updatedAt: new Date(),
    };
    this.documents.set(id, updated);
    logger.debug({ documentId: id }, 'Document updated');
    return Promise.resolve(updated);
  }

  deleteDocument(id: string): Promise<boolean> {
    const existed = this.documents.has(id);
    this.documents.delete(id);
    this.vectors.delete(id);
    if (existed) logger.debug({ documentId: id }, 'Document deleted');
    return Promise.resolve(existed);
  }

  queryDocuments(query: PersistenceQuery): Promise<PersistenceResult> {
    let results = Array.from(this.documents.values()).filter(d => d.collection === query.collection);

    if (query.filter) {
      results = results.filter(doc => {
        return Object.entries(query.filter!).every(([key, value]) => {
          const docValue = (doc.data as any)?.[key];
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            return JSON.stringify(docValue) === JSON.stringify(value);
          }
          return docValue === value;
        });
      });
    }

    const total = results.length;
    const offset = query.offset || 0;
    const limit = query.limit || 10;

    if (query.sort) {
      const [field, direction] = Object.entries(query.sort)[0];
      results.sort((a, b) => {
        const aVal = (a.data as any)?.[field];
        const bVal = (b.data as any)?.[field];
        if (aVal === bVal) return a.id > b.id ? 1 : -1;
        if (direction === -1) return aVal > bVal ? -1 : 1;
        return aVal > bVal ? 1 : -1;
      });
    }

    const paginated = results.slice(offset, offset + limit);

    return Promise.resolve({
      documents: paginated,
      total,
      hasMore: offset + limit < total,
    });
  }

  searchVectors(query: VectorSearchQuery): Promise<VectorSearchResult[]> {
    const results: VectorSearchResult[] = [];

    for (const [id, vector] of this.vectors.entries()) {
      const score = this.cosineSimilarity(query.query, vector);
      if (score >= (query.minScore || 0)) {
        const doc = this.documents.get(id);
        if (doc && (!query.filter || this.matchesFilter(doc, query.filter))) {
          results.push({
            id,
            score,
            document: doc,
          });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return Promise.resolve(results.slice(0, query.limit || 10));
  }

  saveMissionState(state: MissionState): Promise<void> {
    this.missions.set(state.missionId, state);
    logger.debug({ missionId: state.missionId, status: state.status }, 'Mission state saved');
    return Promise.resolve();
  }

  getMissionState(missionId: string): Promise<MissionState | undefined> {
    return Promise.resolve(this.missions.get(missionId));
  }

  listMissionStates(): Promise<MissionState[]> {
    return Promise.resolve(Array.from(this.missions.values()));
  }

  async deleteMissionState(missionId: string): Promise<void> {
    this.missions.delete(missionId);
    return Promise.resolve();
  }

  saveAgentState(state: AgentState): Promise<void> {
    this.agents.set(state.agentId, state);
    logger.debug({ agentId: state.agentId }, 'Agent state saved');
    return Promise.resolve();
  }

  getAgentState(agentId: string): Promise<AgentState | undefined> {
    return Promise.resolve(this.agents.get(agentId));
  }

  listAgentStates(): Promise<AgentState[]> {
    return Promise.resolve(Array.from(this.agents.values()));
  }

  saveAssistant(definition: AssistantDefinition): Promise<AssistantDefinition> {
    const now = new Date();
    const existing = this.assistants.get(definition.id);
    const assistant: AssistantDefinition = {
      ...definition,
      createdAt: existing?.createdAt || definition.createdAt || now,
      updatedAt: now,
    };
    this.assistants.set(definition.id, assistant);
    logger.debug({ assistantId: definition.id }, 'Assistant saved');
    return Promise.resolve(assistant);
  }

  getAssistant(id: string): Promise<AssistantDefinition | undefined> {
    return Promise.resolve(this.assistants.get(id));
  }

  listAssistants(tenantId?: string): Promise<AssistantDefinition[]> {
    const all = Array.from(this.assistants.values());
    if (tenantId) {
      return Promise.resolve(all.filter((a) => a.tenantId === tenantId));
    }
    return Promise.resolve(all);
  }

  deleteAssistant(id: string): Promise<boolean> {
    const existed = this.assistants.has(id);
    this.assistants.delete(id);
    this.assistantRuntimes.delete(id);
    if (existed) logger.debug({ assistantId: id }, 'Assistant deleted');
    return Promise.resolve(existed);
  }

  saveAssistantRuntime(assistantId: string, config: AssistantRuntimeConfig): Promise<void> {
    this.assistantRuntimes.set(assistantId, config);
    logger.debug({ assistantId }, 'Assistant runtime saved');
    return Promise.resolve();
  }

  getAssistantRuntime(assistantId: string): Promise<AssistantRuntimeConfig | undefined> {
    return Promise.resolve(this.assistantRuntimes.get(assistantId));
  }

  listAssistantRuntimes(): Promise<AssistantRuntimeConfig[]> {
    return Promise.resolve(Array.from(this.assistantRuntimes.values()));
  }

  saveTemplate(template: AssistantTemplate): Promise<AssistantTemplate> {
    const now = new Date();
    const existing = this.assistantTemplates.get(template.id);
    const saved: AssistantTemplate = {
      ...template,
      createdAt: existing?.createdAt || template.createdAt || now,
      updatedAt: now,
    };
    this.assistantTemplates.set(template.id, saved);
    logger.debug({ templateId: template.id }, 'Assistant template saved');
    return Promise.resolve(saved);
  }

  getTemplate(id: string): Promise<AssistantTemplate | undefined> {
    return Promise.resolve(this.assistantTemplates.get(id));
  }

  listTemplates(): Promise<AssistantTemplate[]> {
    return Promise.resolve(Array.from(this.assistantTemplates.values()));
  }

  deleteTemplate(id: string): Promise<boolean> {
    const existed = this.assistantTemplates.has(id);
    this.assistantTemplates.delete(id);
    if (existed) logger.debug({ templateId: id }, 'Assistant template deleted');
    return Promise.resolve(existed);
  }

  upsertVector(id: string, vector: number[]): Promise<void> {
    this.vectors.set(id, vector);
    return Promise.resolve();
  }


  saveMissionPlan(missionId: string, plan: any): Promise<any> {
    this.missionPlans.set(missionId, plan);
    return Promise.resolve(plan);
  }
  getMissionPlan(missionId: string): Promise<any | undefined> {
    return Promise.resolve(this.missionPlans.get(missionId));
  }
  updateMissionPhase(missionId: string, phaseId: string, update: any): Promise<any> {
    let phases = this.missionPhases.get(missionId);
    if (!phases) { phases = new Map(); this.missionPhases.set(missionId, phases); }
    const existing = phases.get(phaseId) || { id: phaseId, missionId };
    const merged = { ...existing, ...update, id: phaseId, missionId, updatedAt: Date.now() };
    phases.set(phaseId, merged);

    const plan = this.missionPlans.get(missionId);
    if (plan && Array.isArray(plan.phases)) {
      const newPhases = plan.phases.map((p: any) =>
        p.id === phaseId ? { ...p, ...update } : p
      );
      this.missionPlans.set(missionId, { ...plan, phases: newPhases });
    }

    return Promise.resolve(merged);
  }
  getMissionPhase(missionId: string, phaseId: string): Promise<any | undefined> {
    return Promise.resolve(this.missionPhases.get(missionId)?.get(phaseId));
  }
  updateMissionTask(missionId: string, taskId: string, update: any): Promise<any> {
    let tasks = this.missionTasks.get(missionId);
    if (!tasks) { tasks = new Map(); this.missionTasks.set(missionId, tasks); }
    const existing = tasks.get(taskId) || { id: taskId, missionId };
    const merged = { ...existing, ...update, id: taskId, missionId, updatedAt: Date.now() };
    tasks.set(taskId, merged);

    const plan = this.missionPlans.get(missionId);
    if (plan && Array.isArray(plan.phases)) {
      const newPhases = plan.phases.map((phase: any) => {
        if (Array.isArray(phase.tasks)) {
          const newTasks = phase.tasks.map((t: any) =>
            t.id === taskId ? { ...t, ...update } : t
          );
          return { ...phase, tasks: newTasks };
        }
        return phase;
      });
      this.missionPlans.set(missionId, { ...plan, phases: newPhases });
    }

    return Promise.resolve(merged);
  }
  getMissionTask(missionId: string, taskId: string): Promise<any | undefined> {
    return Promise.resolve(this.missionTasks.get(missionId)?.get(taskId));
  }
  appendMissionEvent(missionId: string, event: any): Promise<any> {
    const existing = this.missionEvents.get(missionId) || [];
    const e = { ...event, timestamp: event.timestamp || Date.now() };
    existing.push(e);
    this.missionEvents.set(missionId, existing);
    return Promise.resolve(e);
  }
  listMissionEvents(missionId: string): Promise<any[]> {
    return Promise.resolve(this.missionEvents.get(missionId) || []);
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
