export interface PersistenceDocument {
  id: string;
  tenantId: string;
  collection: string;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  version?: number;
}

export interface PersistenceQuery {
  collection: string;
  filter?: Record<string, unknown>;
  limit?: number;
  offset?: number;
  sort?: Record<string, 1 | -1>;
}

export interface PersistenceResult {
  documents: PersistenceDocument[];
  total: number;
  hasMore: boolean;
}

export interface VectorSearchQuery {
  collection: string;
  query: number[];
  limit?: number;
  filter?: Record<string, unknown>;
  minScore?: number;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  document: PersistenceDocument;
  metadata?: Record<string, unknown>;
}

export interface AgentState {
  agentId: string;
  tenantId: string;
  missionId: string;
  status: string;
  context: Record<string, unknown>;
  artifacts: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MissionState {
  missionId: string;
  tenantId: string;
  assistantId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'canceled' | 'awaiting_review' | 'incomplete';
  currentStep: number;
  totalSteps: number;
  history: unknown[];
  input: unknown;
  output?: unknown;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}
