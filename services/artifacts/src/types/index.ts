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

export interface BrainLogRecord {
  timestamp: string;
  [key: string]: unknown;
}

export interface BrainPerformanceMetric {
  model: string;
  provider: string;
  [key: string]: unknown;
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
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'canceled' | 'awaiting_review' | 'incomplete';
  controlState?: 'running' | 'pause_requested' | 'paused' | 'terminate_requested' | 'terminated';
  /**
   * Set when the user deleted the mission while it was still winding down.
   * The mission runner still owns the state until it finalizes, so the
   * deletion is recorded here and applied by the runner once it is done.
   */
  pendingDeletion?: boolean;
  currentStep: number;
  totalSteps: number;
  history: unknown[];
  input: unknown;
  output?: unknown;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

export interface MissionRecoveryLease {
  missionId: string;
  ownerId: string;
  expiresAt: Date;
}

export type AgentActionOutcome = 'success' | 'failure' | 'denied' | 'question_asked' | 'permission_required';

export interface AgentActionReceipt {
  toolId: string;
  isError: boolean;
  content: string;
  outcome: AgentActionOutcome;
  actionKey?: string;
  executionId?: string;
  operation?: string;
  providerRequestId?: string;
  outcomeKnown?: boolean;
  binding?: Record<string, unknown>;
  reconciliation?: Record<string, unknown>;
  fallbackForToolId?: string;
  resolvedToolId?: string;
  [key: string]: unknown;
}

export interface AgentExecutionCheckpoint {
  agentId: string;
  taskId: string;
  version: 1 | 2;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  tokensUsed: number;
  toolCalls: number;
  brainCalls: number;
  completionTokensReserved: number;
  delegations: number;
  lastAction: string;
  repeatedActionCount: number;
  actionReceipts?: AgentActionReceipt[];
  pendingAction?: string;
  finalOutput?: string;
  incompleteReason?: string;
  lastRequestId?: string;
}
