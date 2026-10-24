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
