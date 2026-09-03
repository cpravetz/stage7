import type { MCPTool } from './mcp';

export interface AssistantDefinition {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  model: string;
  capabilities: string[];
  systemPrompt: string;
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
  model: string;
  capabilities: string[];
  systemPrompt: string;
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
  model: string;
  capabilities: string[];
  systemPrompt: string;
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
