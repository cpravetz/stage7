export interface Tool {
  id: string
  name: string
  description: string
  type: 'mcp' | 'openapi' | 'code'
  manifest: Record<string, unknown>
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface ToolExecution {
  executionId: string
  toolId: string
  input: Record<string, unknown>
  output?: Record<string, unknown>
  error?: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  startedAt: Date
  completedAt?: Date
}

export interface ToolRegistry {
  tools: Map<string, Tool>
}

export interface PluginGenerationRequest {
  description: string
  requirements?: string[]
  context?: Record<string, unknown>
}

export interface PluginGenerationResult {
  success: boolean
  tool?: Tool
  error?: string
}

export interface CredentialRequest {
  executionId: string
  toolId: string
  toolName: string
  missingCredentials: Array<{
    key: string
    source: { vaultSecretId?: string; envVar?: string; configKey?: string }
    label?: string
  }>
  message: string
}

export interface CredentialSubmission {
  executionId: string
  toolId: string
  credentials: Record<string, string>
  storeInVault?: boolean
  vaultSecretId?: string
}

export class CredentialRequiredError extends Error {
  readonly request: CredentialRequest;

  constructor(request: CredentialRequest) {
    super(request.message);
    this.name = 'CredentialRequiredError';
    this.request = request;
  }
}
