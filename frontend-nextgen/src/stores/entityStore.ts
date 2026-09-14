import { create } from 'zustand';

export interface EntityTool {
  name: string;
  displayName?: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  config?: Record<string, unknown>;
  configSchema?: Record<string, unknown>;
}

export interface Entity {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  type: 'assistant' | 'agent';
  status: string;
  systemPrompt: string;
  tools: Array<EntityTool | string>;
  knowledge?: Array<{ id: string; title: string; content: string; source?: string }>;
  transactionGuidance?: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  memory?: Record<string, unknown>;
  artifacts?: string[];
  missionHistory?: Array<{ missionId: string; status: string; timestamp: string; output?: string }>;
  integrations?: string[];
}

const normalizeEntity = (raw: Record<string, unknown>, type: 'assistant' | 'agent'): Entity => ({
  id: raw.id as string,
  tenantId: (raw.tenantId as string) || 'system',
  name: (raw.name as string) || (raw.id as string),
  description: (raw.description as string) || '',
  type,
  status: (raw.status as string) || 'active',
  systemPrompt: (raw.systemPrompt as string) || '',
  tools: Array.isArray(raw.tools) ? raw.tools as Entity['tools'] : [],
  knowledge: Array.isArray(raw.knowledge) ? raw.knowledge as Entity['knowledge'] : [],
  transactionGuidance: Array.isArray(raw.transactionGuidance) ? raw.transactionGuidance as Entity['transactionGuidance'] : [],
  metadata: (raw.metadata as Record<string, unknown>) || {},
  createdAt: (raw.createdAt as string) || new Date().toISOString(),
  updatedAt: (raw.updatedAt as string) || new Date().toISOString(),
  memory: raw.memory as Record<string, unknown> | undefined,
  artifacts: raw.artifacts as string[] | undefined,
  missionHistory: raw.missionHistory as Entity['missionHistory'] | undefined,
  integrations: raw.integrations as string[] | undefined,
});

interface EntityState {
  entities: Entity[];
  selectedEntity: Entity | null;
  loading: boolean;
  error: string | null;
  fetchEntities: () => Promise<void>;
  fetchEntity: (id: string) => Promise<void>;
  selectEntity: (entity: Entity | null) => void;
}

export const useEntityStore = create<EntityState>((set) => ({
  entities: [],
  selectedEntity: null,
  loading: false,
  error: null,
  fetchEntities: async () => {
    set({ loading: true, error: null });
    try {
      const assistantsRes = await fetch('/api/workers/assistants').then((r) => r.json());
      const assistants = (assistantsRes.assistants || []).map((a: Record<string, unknown>) => ({
        ...a,
        type: 'assistant' as const,
      }));
      // Do not fetch or expose system-wide agents. Missions create ephemeral agents at runtime.
      set({ entities: [...assistants] });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load entities' });
    } finally {
      set({ loading: false });
    }
  },
  fetchEntity: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/workers/assistants/${id}`);
      if (res.ok) {
        const data = await res.json();
        const assistant = data.assistant || data;
        const normalized = normalizeEntity(assistant, 'assistant');
        set({ selectedEntity: normalized });
        return;
      }
      // Do not look up agents by global ID — agents are mission-scoped and ephemeral.
      set({ error: `Entity not found: ${id}` });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch entity' });
    } finally {
      set({ loading: false });
    }
  },
  selectEntity: (entity: Entity | null) => set({ selectedEntity: entity }),
}));
