export type AgentId = string

export interface AgentDefinition {
  id: string
  tenantId: string
  name: string
  description: string
  type: string
  capabilities: string[]
  systemPrompt: string
  model?: string
  tools: string[]
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AgentState {
  agentId: string
  tenantId: string
  missionId: string
  status: 'idle' | 'running' | 'waiting' | 'completed' | 'failed'
  context: Record<string, unknown>
  artifacts: string[]
  assignedAt: string
  startedAt?: string
  completedAt?: string
}

export interface AgentTask {
  taskId: string
  agentId: string
  type: string
  input: Record<string, unknown>
  priority: number
  status: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  result?: unknown
  error?: string
}

export interface AgentCollaboration {
  collaborationId: string
  participants: string[]
  status: string
  messages: Array<{ from: string; to: string; content: string; timestamp: string }>
  createdAt: string
  updatedAt: string
}

export interface AgentSpecialization {
  domain: string
  confidence: number
  examples: string[]
  lastUsed: string
}
