import type { MCPTool } from './mcp';

// ---------------------------------------------------------------------------
// Harness² types (as specified for learning enhancements)
// ---------------------------------------------------------------------------

export interface SynthesizedSkillRef {
  skillId: string;
  name: string;
  description?: string;
  source?: 'synthesized' | 'acquired' | 'authored';
  path?: string;
  hash?: string;
  createdAt?: Date;
  validatedAt?: Date;
  language?: 'bash' | 'python' | 'typescript' | 'javascript';
  metadata?: Record<string, unknown>;
}

export interface HeuristicEntry {
  id: string;
  rule: string;
  rationale?: string;
  confidence?: number;
  source?: 'experience' | 'distillation' | 'manual';
  appliedCount?: number;
  lastAppliedAt?: Date;
  metadata?: Record<string, unknown>;
  evidence?: string[];
  active?: boolean;
  ts?: string | Date;
  context?: string;
}

export interface AssistantHarness {
  version?: string;
  harnessVersion?: number;
  systemPrompt?: string;
  tools?: MCPTool[];
  skills?: SynthesizedSkillRef[];
  synthesizedSkills?: SynthesizedSkillRef[];
  heuristics?: HeuristicEntry[];
  heuristicsLog?: HeuristicEntry[];
  memory?: {
    episodic?: unknown[];
    semantic?: unknown[];
    working?: Record<string, unknown>;
  };
  subAgents?: Array<{
    id: string;
    role: string;
    capabilities?: string[];
    config?: Record<string, unknown>;
  }>;
  routing?: {
    strategy?: string;
    rules?: Array<Record<string, unknown>>;
    preferences?: Record<string, unknown>;
  };
  routingRules?: Record<string, unknown>;
  guardrails?: {
    policies?: string[];
    constraints?: string[];
    approvalRules?: Record<string, unknown>;
  };
  sandboxPolicy?: { timeoutMs: number; network: 'off' | 'restricted'; fs: 'ephemeral' };
  metadata?: Record<string, unknown>;
  history?: Array<{ version: string | number; snapshot: AssistantHarness; timestamp: Date; reason?: string }>;
  updatedAt?: Date;
}

export interface AssistantKnowledgeEntry {
  id: string;
  title: string;
  content: string;
  source?: string;
  tags?: string[];
  domain?: string;
}

/**
 * Which assistants an entry is offered to.
 * - `assistant`: owned by one assistant, returned only to that assistant.
 * - `shared`: offered to every assistant and agent.
 */
export type AssistantKnowledgeScope = 'assistant' | 'shared';

/**
 * Where the content came from.
 * - `authored`: committed as a file under services/worker-pool/knowledge/assistants.
 * - `acquired`: derived at runtime and stored back to the knowledge store.
 */
export type AssistantKnowledgeOrigin = 'authored' | 'acquired';

/** Shape of a knowledge entry as persisted in the artifacts documents store. */
export interface StoredKnowledgeEntry extends AssistantKnowledgeEntry {
  /** Owning assistant, or null for shared entries. */
  assistantId: string | null;
  scope: AssistantKnowledgeScope;
  origin: AssistantKnowledgeOrigin;
}

export interface AssistantDefinition {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  systemPrompt: string;
  knowledge?: AssistantKnowledgeEntry[];
  transactionGuidance?: string[];
  tools: MCPTool[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  /** Optional Harness² — the optimizable surface. Absent for backward compat. */
  harness?: AssistantHarness;
}

export interface AssistantTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  systemPrompt: string;
  knowledge?: Array<{ id: string; title: string; content: string; source?: string }>;
  transactionGuidance?: string[];
  tools: MCPTool[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  /** Optional Harness² template. Absent for backward compat. */
  harness?: AssistantHarness;
}

export interface AssistantInstance {
  id: string;
  tenantId: string;
  templateId?: string;
  name: string;
  description: string;
  systemPrompt: string;
  knowledge?: Array<{ id: string; title: string; content: string; source?: string }>;
  transactionGuidance?: string[];
  tools: MCPTool[];
  metadata: Record<string, unknown>;
  status: 'active' | 'inactive' | 'error';
  runtimeConfig?: AssistantRuntimeConfig;
  memoryContext?: Record<string, unknown>;
  missionHistory?: Array<{ missionId: string; status: string; timestamp: string }>;
  createdAt: Date;
  updatedAt: Date;
  /** Optional Harness² — the optimizable surface. Absent for backward compat. */
  harness?: AssistantHarness;
}

export interface AssistantRuntimeConfig {
  assistantId: string;
  workerId: string;
  taskQueue: string;
  maxConcurrency: number;
  timeoutMs: number;
}

export interface AssistantExecutionResult {
  assistantId: string;
  success: boolean;
  output?: unknown;
  error?: string;
  tokensUsed?: number;
  durationMs?: number;
}
