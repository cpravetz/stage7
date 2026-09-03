import { create } from 'zustand';

export interface Entity {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  type: 'assistant' | 'agent';
  status: string;
  model: string;
  systemPrompt: string;
  tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> } | string>;
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
  model: (raw.model as string) || '',
  systemPrompt: (raw.systemPrompt as string) || '',
  tools: Array.isArray(raw.tools) ? raw.tools as Entity['tools'] : [],
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
      const [assistantsRes, agentsRes] = await Promise.all([
        fetch('/api/workers/assistants').then((r) => r.json()),
        fetch('/api/agent-runtime/agents').then((r) => r.json()),
      ]);
      const assistants = (assistantsRes.assistants || []).map((a: Record<string, unknown>) => ({
        ...a,
        type: 'assistant' as const,
      }));
      const agents = (agentsRes.agents || []).map((a: Record<string, unknown>) => ({
        ...a,
        type: 'agent' as const,
      }));
      set({ entities: [...assistants, ...agents] });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load entities' });
    } finally {
      set({ loading: false });
    }
  },
  fetchEntity: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const [res1, res2] = await Promise.allSettled([
        fetch(`/api/workers/assistants/${id}`),
        fetch(`/api/agent-runtime/agents/${id}`),
      ]);

      const assistantRes = res1.status === 'fulfilled' && res1.value.ok ? res1.value : null;
      const agentRes = res2.status === 'fulfilled' && res2.value.ok ? res2.value : null;

      if (assistantRes) {
        const data = await assistantRes.json();
        const assistant = data.assistant || data;
        const normalized = normalizeEntity(assistant, 'assistant');
        set({ selectedEntity: normalized });
        return;
      }

      if (agentRes) {
        const data = await agentRes.json();
        const agent = data.agent || data;
        const normalized = normalizeEntity(agent, 'agent');
        set({ selectedEntity: normalized });
        return;
      }

      set({ error: `Entity not found: ${id}` });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch entity' });
    } finally {
      set({ loading: false });
    }
  },
  selectEntity: (entity: Entity | null) => set({ selectedEntity: entity }),
}));
