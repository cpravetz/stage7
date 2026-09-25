import type { SchemaRecord, SkillTrigger, Tool, WorkflowState } from '../types';

export type AssistantContextData = Record<string, unknown>;
export type AssistantConfigurationValues = Record<string, unknown>;
export type AssistantTool = Tool;
export type AssistantStage = WorkflowStage;
export type AssistantLane = WorkflowLane;
export type MaybePromise<T> = T | Promise<T>;

export interface AssistantIdentity {
  id: string;
  name: string;
  description: string;
  version?: string;
}

export interface AssistantConfiguration<TValues extends AssistantConfigurationValues = AssistantConfigurationValues> {
  defaults: Readonly<TValues>;
  requiredKeys: readonly string[];
  validate?: (value: Readonly<TValues>) => string | undefined;
}

export interface AssistantConfigurationInput<TValues extends AssistantConfigurationValues = AssistantConfigurationValues> {
  defaults?: Partial<TValues>;
  requiredKeys?: readonly string[];
  validate?: (value: Readonly<TValues>) => string | undefined;
}

export interface AssistantContext<TData extends AssistantContextData = AssistantContextData> {
  productObject: string;
  objectId?: string;
  stageId?: string;
  data: TData;
  version: number;
}

export interface AssistantContextResolution<TData extends AssistantContextData = AssistantContextData> {
  productObject?: string;
  objectId?: string;
  stageId?: string;
  data?: Partial<TData>;
}

export interface AssistantContextPolicy<TData extends AssistantContextData = AssistantContextData> {
  objectKeys: readonly string[];
  extract?: (input: Record<string, unknown>) => AssistantContextResolution<TData> | undefined;
  validate?: (
    context: AssistantContext<TData>,
    input: Record<string, unknown>,
    current?: AssistantContext<TData>,
  ) => boolean | string;
  allowCrossObjectHandoff: boolean;
}

export interface AssistantContextPolicyInput<TData extends AssistantContextData = AssistantContextData> {
  objectKeys?: readonly string[];
  extract?: (input: Record<string, unknown>) => AssistantContextResolution<TData> | undefined;
  validate?: (
    context: AssistantContext<TData>,
    input: Record<string, unknown>,
    current?: AssistantContext<TData>,
  ) => boolean | string;
  allowCrossObjectHandoff?: boolean;
}

export interface AssistantContextResult<TData extends AssistantContextData = AssistantContextData> {
  valid: boolean;
  context?: AssistantContext<TData>;
  error?: string;
}

export interface ApprovalRequest {
  assistantId: string;
  toolId: string;
  toolName?: string;
  action: string;
  object?: string;
  scope: Record<string, unknown>;
  input: Record<string, unknown>;
  workflowState?: WorkflowState;
  dryRun?: boolean;
  confirmBeforeSend?: boolean;
}

export interface ApprovalSummary {
  toolName: string;
  toolId: string;
  action: string;
  object?: string;
  scope: Record<string, unknown>;
  confirmBeforeSend: boolean;
  requiresConfirmation: boolean;
  dryRun: boolean;
}

export type ApprovalSummaryFactory = (request: ApprovalRequest) => ApprovalSummary;

export interface ApprovalPolicy {
  requiresConfirmation: boolean | ((request: ApprovalRequest) => boolean);
  dryRunByDefault: boolean;
  allowedStates: readonly WorkflowState[];
  summarize: ApprovalSummaryFactory;
}

export interface ApprovalPolicyInput {
  requiresConfirmation?: boolean | ((request: ApprovalRequest) => boolean);
  dryRunByDefault?: boolean;
  allowedStates?: readonly WorkflowState[];
  summarize?: ApprovalSummaryFactory;
}

export type ApprovalDecision = 'pending' | 'approved' | 'rejected';

export interface ApprovalRecord {
  id: string;
  requestId: string;
  assistantId: string;
  toolId: string;
  action: string;
  object?: string;
  scope: Record<string, unknown>;
  actor: string;
  decision: ApprovalDecision;
  createdAt: Date;
}

export interface WorkflowStage {
  id: string;
  name: string;
  description: string;
  skillIds: readonly string[];
  transitions: readonly string[];
  approvalPolicy?: ApprovalPolicy;
  metadata?: Record<string, unknown>;
}

export interface WorkflowStageParameters {
  id: string;
  name: string;
  description: string;
  skillIds: readonly string[];
  transitions?: readonly string[];
  approvalPolicy?: ApprovalPolicy;
  metadata?: Record<string, unknown>;
}

export interface WorkflowLane {
  id: string;
  name: string;
  description: string;
  stageIds: readonly string[];
  modes: readonly string[];
  metadata?: Record<string, unknown>;
}

export interface WorkflowLaneParameters {
  id: string;
  name: string;
  description: string;
  stageIds: readonly string[];
  modes?: readonly string[];
  metadata?: Record<string, unknown>;
}

export interface AssistantWorkflow {
  id: string;
  assistantId: string;
  productObject: string;
  flow: string;
  stages: readonly WorkflowStage[];
  lanes: readonly WorkflowLane[];
}

export interface AssistantWorkflowParameters {
  id?: string;
  assistantId: string;
  productObject: string;
  flow: string;
  stages: readonly WorkflowStage[];
  lanes: readonly WorkflowLane[];
}

export interface AssistantSkill {
  id: string;
  name: string;
  description: string;
  tool: Tool;
  laneId: string;
  stageId: string;
  triggers?: SkillTrigger[];
  metadata?: Record<string, unknown>;
}

export interface AssistantSkillParameters {
  id?: string;
  name?: string;
  description?: string;
  tool: Tool;
  laneId: string;
  stageId: string;
  triggers?: SkillTrigger[];
  metadata?: Record<string, unknown>;
}

export interface CreateToolParameters {
  id: string;
  name: string;
  description: string;
  type: Tool['type'];
  manifest?: Record<string, unknown>;
  inputSchema?: SchemaRecord;
  outputSchema?: SchemaRecord;
  configSchema?: SchemaRecord;
  reasoningConfig?: Record<string, unknown>;
  externalConfig?: Record<string, unknown>;
  triggers?: SkillTrigger[];
  confirmBeforeSend?: boolean;
  isSkill?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CodeSkillManifest {
  language: 'javascript' | 'typescript' | 'python';
  entrypoint: string;
  sourceCode: string;
  configSchema?: SchemaRecord;
  credentialSource?: Record<string, { vaultSecretId?: string; envVar?: string; configKey?: string }>;
  [key: string]: unknown;
}

export interface CreateCodeSkillParameters {
  id: string;
  name: string;
  description: string;
  manifest: Omit<CodeSkillManifest, 'language' | 'entrypoint'> & Partial<Pick<CodeSkillManifest, 'language' | 'entrypoint'>>;
  inputSchema: SchemaRecord;
  outputSchema: SchemaRecord;
  triggers?: SkillTrigger[];
  confirmBeforeSend?: boolean;
  tier?: 'advise' | 'aid' | 'represent';
  domainKnowledge?: string;
  isSkill?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AssistantPersistencePort<TState> {
  load(id: string): MaybePromise<TState | undefined>;
  save(id: string, state: TState): MaybePromise<void>;
  delete?(id: string): MaybePromise<boolean>;
  list?(): MaybePromise<Array<{ id: string; state: TState }>>;
}

export interface AssistantPersistencePolicy<TState> {
  port: AssistantPersistencePort<TState>;
  namespace: string;
  revisionLimit: number;
}

export interface AssistantRuntimeState<TContext extends AssistantContextData = AssistantContextData, TConfiguration extends AssistantConfigurationValues = AssistantConfigurationValues> {
  assistantId: string;
  context: AssistantContext<TContext>;
  configuration: Readonly<TConfiguration>;
  currentStageId?: string;
  workflowState: WorkflowState;
  approvals: readonly ApprovalRecord[];
  updatedAt: Date;
}

export interface AssistantDefinition<TContext extends AssistantContextData = AssistantContextData, TConfiguration extends AssistantConfigurationValues = AssistantConfigurationValues> {
  id: string;
  name: string;
  description: string;
  version?: string;
  productObjects: readonly string[];
  workflow: AssistantWorkflow;
  skills: readonly AssistantSkill[];
  tools: readonly Tool[];
  configuration: AssistantConfiguration<TConfiguration>;
  contextPolicy: AssistantContextPolicy<TContext>;
  approvalPolicy: ApprovalPolicy;
  persistence: AssistantPersistencePolicy<AssistantRuntimeState<TContext, TConfiguration>>;
  metadata?: Record<string, unknown>;
}

export interface AssistantDefinitionParameters<TContext extends AssistantContextData = AssistantContextData, TConfiguration extends AssistantConfigurationValues = AssistantConfigurationValues> {
  identity: AssistantIdentity;
  productObjects: readonly string[];
  workflow: AssistantWorkflow;
  skills: readonly AssistantSkill[];
  tools?: readonly Tool[];
  configuration?: AssistantConfigurationInput<TConfiguration>;
  contextPolicy?: AssistantContextPolicyInput<TContext>;
  approvalPolicy?: ApprovalPolicyInput;
  persistence?: Partial<Omit<AssistantPersistencePolicy<AssistantRuntimeState<TContext, TConfiguration>>, 'port'>> & {
    port?: AssistantPersistencePort<AssistantRuntimeState<TContext, TConfiguration>>;
  };
  metadata?: Record<string, unknown>;
}
