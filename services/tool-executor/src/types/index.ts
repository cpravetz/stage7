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
  | { kind: 'event'; on: string; eventId?: string }
  | { kind: 'data'; condition: string };

export type NativeExecutorKey =
  | 'search'
  | 'weather'
  | 'math'
  | 'files'
  | 'ftp'
  | 'webhook'
  | 'database'
  | 'email'
  | 'vendor'
  | 'data_analysis'
  | 'calendar'
  | 'api_client';

export interface ToolManifest {
  /** Event id this tool emits when it completes; downstream skills subscribe via an event trigger. */
  emitEvent?: string;
  executor?: NativeExecutorKey;
  /**
   * The external system this Skill integrates with, when it is a named SaaS
   * rather than a generic HTTP endpoint.
   *
   * This was previously declared but never set by any Skill, so an external
   * dependency was only discoverable by grepping handler source for a
   * `process.env` name. Naming the system here is what lets the platform reason
   * about it: a default source for a public system, and a credential shape for
   * a private one.
   */
  vendor?:
    | 'jira'
    | 'confluence'
    | 'slack'
    | 'github'
    | 'workday'
    | 'sap'
    | 'salesforce'
    | 'servicenow'
    | 'google_workspace'
    | 'microsoft_365';
  type?: 'mcp' | 'openapi' | 'code' | 'reasoning' | 'native';
  language?: string;
  sourceCode?: string;
  server?: string;
  urlTemplate?: string;
  actionLabel?: string;
  [key: string]: unknown;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  type: 'mcp' | 'openapi' | 'code' | 'reasoning' | 'native';
  manifest: ToolManifest;
  inputSchema?: SchemaRecord;
  outputSchema?: SchemaRecord;
  configSchema?: SchemaRecord;
  createdAt: Date;
  updatedAt: Date;
  isSkill?: boolean;
  triggers?: SkillTrigger[];
  reasoningConfig?: Record<string, unknown>;
  externalConfig?: Record<string, unknown>;
  /**
   * Version of this Skill's input, config and output schemas.
   *
   * Stamped onto records on write and used to select hydration adapters on read,
   * so a blueprint deployment can be upgraded without a database migration
   * (ADK_OVERVIEW.md §5).
   */
  schemaVersion?: number;
  /**
   * Cached projection of `tier`, written by the factory and read by the
   * executor. Authors do not set it: the gate is derived from the tier and
   * cannot be declared separately (ADK_DEVELOPER_GUIDE.md §2.2).
   */
  confirmBeforeSend?: boolean;
  tier?: 'advise' | 'aid' | 'represent';
  domainKnowledge?: string;
  knowledgeIds?: string[];
  actionLabel?: string;
}

export type WorkflowState = 'analysis' | 'recommendation' | 'draft' | 'approved' | 'executed' | 'rejected';

export interface StateTransitionEvent {
  from: WorkflowState;
  to: WorkflowState;
  timestamp: Date;
  trigger?: string;
}

export interface WorkflowStateContract {
  states: WorkflowState[];
  transitions: Record<WorkflowState, WorkflowState[]>;
  initial: WorkflowState;
}

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
  workspaceId?: string;
  assistantId?: string;
  context?: Record<string, unknown>;
  runtimeWorkflow?: RuntimeWorkflow;
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
  workspaceId?: string;
  assistantId?: string;
  context?: Record<string, unknown>;
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

export interface ApprovalSummary {
  toolName: string;
  toolId: string;
  action: string;
  object: string | undefined;
  scope: Record<string, unknown>;
  confirmBeforeSend: boolean;
  requiresConfirmation: boolean;
  dryRun: boolean;
  affectedRecords: number;
  expectedSideEffects: string[];
}

export interface ExecutionResult {
  executionId: string;
  toolId: string;
  toolName?: string;
  status: 'completed' | 'failed' | 'pending_credentials';
  output?: unknown;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  metadata?: Record<string, unknown>;
  workspaceId?: string;
  assistantId?: string;
  context?: Record<string, unknown>;
}

export interface ExecutionRequest {
  tool: Tool;
  input: Record<string, unknown>;
  credentials?: Record<string, string>;
  dryRun?: boolean;
  confirmation?: boolean;
  timeout?: number;
  context?: Record<string, unknown>;
  isSkill?: boolean;
  workspaceId?: string;
  assistantId?: string;
}

export interface RuntimeWorkflowAction {
  id: string;
  name: string;
  description: string;
  type: Tool['type'];
  confirmBeforeSend?: boolean;
  tier?: 'advise' | 'aid' | 'represent';
  isSkill?: boolean;
  available: boolean;
  reason?: string;
}

export interface RuntimeWorkflow {
  executionId: string;
  workspaceId?: string;
  assistantId?: string;
  assistant?: string;
  productObject?: string;
  flow?: string;
  skills: RuntimeWorkflowAction[];
  workflowState: WorkflowState;
  nextActions: string[];
  allowedTransitions: WorkflowState[];
  stateHistory: StateTransitionEvent[];
  approvalHistory: WorkspaceApprovalEntry[];
  executionHistory: WorkspaceExecutionEntry[];
  lastResultId?: string;
  context: Record<string, unknown>;
  nextStep?: string;
  generatedAt: string;
}

export interface CreateOrResumeWorkspaceRequest {
  assistant: string;
  productObject: string;
  workspaceId?: string;
  context?: Record<string, unknown>;
}

export interface HandoffRequest {
  id: string;
  sourceContext: string;
  destinationToolId: string;
  destinationToolName: string;
  objectContext: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
  decision?: 'accepted' | 'rejected';
  decisionAt?: Date;
}

export class ConfirmationRequiredError extends Error {
  readonly toolId: string;
  readonly toolName: string;
  readonly summary?: ApprovalSummary;

  constructor(tool: Tool, summary?: ApprovalSummary) {
    super(`Tool "${tool.name}" requires explicit confirmation before execution`);
    this.name = 'ConfirmationRequiredError';
    this.toolId = tool.id;
    this.toolName = tool.name;
    this.summary = summary;
  }
}

export class CrossObjectHandoffError extends Error {
  readonly activeContext: string;
  readonly currentContext: string;
  readonly toolId: string;
  readonly handoffId?: string;

  constructor(activeContext: string, currentContext: string, toolId: string, handoffId?: string) {
    super(`Cross-object handoff rejected: active context "${activeContext}" does not match current context "${currentContext}"`);
    this.name = 'CrossObjectHandoffError';
    this.activeContext = activeContext;
    this.currentContext = currentContext;
    this.toolId = toolId;
    this.handoffId = handoffId;
  }
}

export interface AssistantWorkspace {
  workspaceId: string;
  assistant: string;
  productObject: string;
  workflowState: WorkflowState;
  lastResultId?: string;
  nextActions: string[];
  approvalHistory: WorkspaceApprovalEntry[];
  executionHistory: WorkspaceExecutionEntry[];
  stateHistory: StateTransitionEvent[];
  context?: Record<string, unknown>;
  runtimeInputs?: string | Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceApprovalEntry {
  executionId: string;
  toolId: string;
  toolName: string;
  state: WorkflowState;
  actor: string;
  scope: Record<string, unknown>;
  timestamp: Date;
}

export interface WorkspaceExecutionEntry {
  executionId: string;
  toolId: string;
  toolName: string;
  workflowState: WorkflowState;
  status: 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
}

export type RevisionTrigger = 'create' | 'stage_change' | 'state_change' | 'actions_update' | 'approval' | 'execution' | 'result_update' | 'transition' | 'reset' | 'resume';

export interface WorkspaceRevision {
  revisionId: string;
  workspaceId: string;
  trigger: RevisionTrigger;
  workspace?: AssistantWorkspace;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export const WORKFLOW_STATE_MACHINE: WorkflowStateContract = {
  states: ['analysis', 'recommendation', 'draft', 'approved', 'executed', 'rejected'],
  transitions: {
    analysis: ['recommendation', 'rejected'],
    recommendation: ['draft', 'rejected'],
    draft: ['approved', 'rejected'],
    approved: ['executed', 'rejected'],
    executed: [],
    rejected: ['draft'],
  },
  initial: 'analysis',
};
