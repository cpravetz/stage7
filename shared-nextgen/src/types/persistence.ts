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
  /**
   * Embedding model id the query vector was produced with. When set, vectors
   * stored under a different model are excluded — cosine across models (or
   * dimensions) silently returns meaningless scores.
   */
  model?: string;
}

/** Metadata stored alongside an embedding vector. */
export interface VectorUpsertMeta {
  model?: string;
  dim?: number;
  /** Hash of the embedded content; unchanged hashes skip re-embedding. */
  contentHash?: string;
  /** Documents collection the vector's source document lives in. */
  collection?: string;
  /** Equality filter on the source document's data, pre-applied at search. */
  filter?: Record<string, unknown>;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  document: PersistenceDocument;
  metadata?: Record<string, unknown>;
}

export interface MissionState {
  missionId: string;
  tenantId: string;
  assistantId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'canceled';
  controlState?: 'running' | 'pause_requested' | 'paused' | 'terminate_requested' | 'terminated';
  currentStep: number;
  totalSteps: number;
  history: unknown[];
  input: unknown;
  output?: unknown;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
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
