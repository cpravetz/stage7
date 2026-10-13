export type AgentId = string

export interface AgentExecutionPolicy {
  maxBrainCalls: number
  maxActions: number
  maxCompletionTokens: number
  maxCompletionTokensPerCall: number
  maxDelegations: number
}

export interface AgentToolPolicy {
  mode: 'all' | 'allowlist'
}

export const DEFAULT_AGENT_EXECUTION_POLICY: AgentExecutionPolicy = {
  maxBrainCalls: 8,
  maxActions: 6,
  maxCompletionTokens: 16_384,
  maxCompletionTokensPerCall: 2_048,
  maxDelegations: 2,
}

export interface AgentDefinition {
  id: string
  tenantId: string
  name: string
  description: string
  type: string
  systemPrompt: string
  tools: string[]
  toolPolicy?: AgentToolPolicy
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

export type AgentLearningSource = 'human_feedback' | 'validated_outcome'

export interface AgentLearning {
  id: string
  tenantId: string
  agentId: string
  domain: string
  guidance: string
  evidence?: string
  source: AgentLearningSource
  sourceRef: string
  recordedBy: string
  confidence: number
  createdAt: string
}

export type AgentLearningInput = Omit<AgentLearning, 'id' | 'tenantId' | 'agentId' | 'createdAt'>
