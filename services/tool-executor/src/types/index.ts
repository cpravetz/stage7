/**
 * Schema property definition with full UI metadata support.
 * Extends JSON Schema with fields needed by the skill panel UI.
 */
export type SchemaPropertyType = string | string[];

export type SchemaPropertyValue =
  | SchemaProperty
  | SchemaRecord
  | string
  | number
  | boolean
  | null
  | readonly SchemaPropertyValue[];

export interface SchemaProperty {
  type?: SchemaPropertyType;
  title?: string;
  label?: string;
  'x-label'?: string;
  description?: string;
  hint?: string;
  default?: unknown;
  examples?: unknown[];
  format?: string;
  multiline?: boolean;
  sensitive?: boolean;
  order?: number;
  group?: string;
  required?: boolean;
  enum?: readonly unknown[];
  items?: SchemaPropertyValue | readonly SchemaPropertyValue[];
  properties?: Record<string, SchemaPropertyValue>;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  [key: string]: unknown;
}

export type SchemaRecord = Record<string, unknown> & {
  type?: SchemaPropertyType;
  properties?: Record<string, SchemaPropertyValue>;
  required?: readonly string[];
  additionalProperties?: boolean | SchemaPropertyValue;
  [key: string]: unknown;
};

export type SkillTrigger =
  | { kind: 'user'; phrase_examples: string[] }
  | { kind: 'schedule'; cadence: string }
  | { kind: 'event'; on: string }
  | { kind: 'data'; condition: string };

export interface Tool {
  id: string;
  name: string;
  description: string;
  type: 'mcp' | 'openapi' | 'code' | 'reasoning';
  manifest: Record<string, unknown>;
  inputSchema?: SchemaRecord;
  outputSchema?: SchemaRecord;
  configSchema?: SchemaRecord;
  createdAt: Date;
  updatedAt: Date;
  isSkill?: boolean;
  triggers?: SkillTrigger[];
  reasoningConfig?: Record<string, unknown>;
  externalConfig?: Record<string, unknown>;
  confirmBeforeSend?: boolean;
}

export type WorkflowState = 'analysis' | 'recommendation' | 'draft' | 'approved' | 'executed' | 'rejected';

export interface ToolExecution {
  executionId: string;
  toolId: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  workflowState?: WorkflowState;
  startedAt: Date;
  completedAt?: Date;
}

export interface ToolRegistry {
  tools: Map<string, Tool>;
}

export interface PluginGenerationRequest {
  description: string;
  requirements?: string[];
  context?: Record<string, unknown>;
}

export interface PluginGenerationResult {
  success: boolean;
  tool?: Tool;
  error?: string;
}

export interface CredentialRequest {
  executionId: string;
  toolId: string;
  toolName: string;
  missingCredentials: Array<{
    key: string;
    source: { vaultSecretId?: string; envVar?: string; configKey?: string };
    label?: string;
  }>;
  message: string;
}

export interface CredentialSubmission {
  executionId: string;
  toolId: string;
  credentials: Record<string, string>;
  storeInVault?: boolean;
  vaultSecretId?: string;
}

export class CredentialRequiredError extends Error {
  readonly request: CredentialRequest;

  constructor(request: CredentialRequest) {
    super(request.message);
    this.name = 'CredentialRequiredError';
    this.request = request;
  }
}

export class ConfirmationRequiredError extends Error {
  readonly toolId: string;
  readonly toolName: string;

  constructor(tool: Tool) {
    super(`Tool "${tool.name}" requires explicit confirmation before execution`);
    this.name = 'ConfirmationRequiredError';
    this.toolId = tool.id;
    this.toolName = tool.name;
  }
}
