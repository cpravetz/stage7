import type { MCPTool } from './mcp';

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
