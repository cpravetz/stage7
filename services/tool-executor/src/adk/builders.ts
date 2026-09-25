import {
  createCodeSkill as createLegacyCodeSkill,
  type CreateCodeSkillOptions as LegacyCreateCodeSkillOptions,
} from '../data/skills/code-skill-factory';
import type { Tool } from '../types';
import type {
  ApprovalPolicy,
  ApprovalPolicyInput,
  ApprovalRecord,
  ApprovalRequest,
  AssistantConfiguration,
  AssistantConfigurationInput,
  AssistantContext,
  AssistantContextPolicy,
  AssistantContextPolicyInput,
  AssistantContextResolution,
  AssistantContextResult,
  AssistantDefinition,
  AssistantDefinitionParameters,
  AssistantPersistencePolicy,
  AssistantPersistencePort,
  AssistantRuntimeState,
  AssistantSkill,
  AssistantSkillParameters,
  AssistantWorkflow,
  AssistantWorkflowParameters,
  CreateCodeSkillParameters,
  CreateToolParameters,
  WorkflowLane,
  WorkflowLaneParameters,
  WorkflowStage,
  WorkflowStageParameters,
} from './contracts';

const DEFAULT_CONTEXT_KEYS = [
  'patient',
  'patientId',
  'targetRole',
  'targetRoles',
  'jobId',
  'jobIds',
  'jobTitle',
  'campaign',
  'campaignId',
  'ticket',
  'ticketId',
  'case',
  'matter',
  'lead',
  'opportunity',
  'event',
  'eventId',
  'object',
  'objectId',
  'productId',
  'entityId',
  'context',
  'operation',
] as const;
const DEFAULT_APPROVAL_STATES = ['draft', 'recommendation'] as const;

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function requireText(value: string, field: string): void {
  if (!value.trim()) {
    throw new Error(`${field} is required`);
  }
}

function assertUnique(values: readonly string[], field: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`Duplicate ${field}: ${value}`);
    }
    seen.add(value);
  }
}

export function createTool(parameters: CreateToolParameters): Tool {
  const now = new Date();
  const tool: Tool = {
    id: parameters.id,
    name: parameters.name,
    description: parameters.description,
    type: parameters.type,
    manifest: parameters.manifest ?? {},
    inputSchema: parameters.inputSchema,
    outputSchema: parameters.outputSchema,
    configSchema: parameters.configSchema,
    reasoningConfig: parameters.reasoningConfig,
    externalConfig: parameters.externalConfig,
    triggers: parameters.triggers,
    confirmBeforeSend: parameters.confirmBeforeSend,
    isSkill: parameters.isSkill,
    createdAt: parameters.createdAt ?? now,
    updatedAt: parameters.updatedAt ?? now,
  };
  return tool;
}

export function createCodeSkill(parameters: CreateCodeSkillParameters): Tool {
  const legacyParameters: LegacyCreateCodeSkillOptions = {
    id: parameters.id,
    name: parameters.name,
    description: parameters.description,
    manifest: parameters.manifest,
    inputSchema: parameters.inputSchema,
    outputSchema: parameters.outputSchema,
    triggers: parameters.triggers,
    confirmBeforeSend: parameters.confirmBeforeSend,
    tier: parameters.tier,
    domainKnowledge: parameters.domainKnowledge,
    isSkill: parameters.isSkill,
  };
  const tool = createLegacyCodeSkill(legacyParameters);
  tool.createdAt = parameters.createdAt ?? tool.createdAt;
  tool.updatedAt = parameters.updatedAt ?? tool.updatedAt;
  return tool;
}

export function createSkill(parameters: AssistantSkillParameters): AssistantSkill {
  requireText(parameters.tool.id, 'skill tool id');
  return {
    id: parameters.id ?? parameters.tool.id,
    name: parameters.name ?? parameters.tool.name,
    description: parameters.description ?? parameters.tool.description,
    tool: parameters.tool,
    laneId: parameters.laneId,
    stageId: parameters.stageId,
    triggers: parameters.triggers ?? parameters.tool.triggers,
    metadata: parameters.metadata,
  };
}

export function createWorkflowStage(parameters: WorkflowStageParameters): WorkflowStage {
  requireText(parameters.id, 'stage id');
  requireText(parameters.name, 'stage name');
  assertUnique(parameters.skillIds, 'stage skill id');
  assertUnique(parameters.transitions ?? [], 'stage transition');
  return {
    id: parameters.id,
    name: parameters.name,
    description: parameters.description,
    skillIds: [...parameters.skillIds],
    transitions: [...(parameters.transitions ?? [])],
    approvalPolicy: parameters.approvalPolicy,
    metadata: parameters.metadata,
  };
}

export function createWorkflowLane(parameters: WorkflowLaneParameters): WorkflowLane {
  requireText(parameters.id, 'lane id');
  requireText(parameters.name, 'lane name');
  assertUnique(parameters.stageIds, 'lane stage id');
  assertUnique(parameters.modes ?? [], 'lane mode');
  return {
    id: parameters.id,
    name: parameters.name,
    description: parameters.description,
    stageIds: [...parameters.stageIds],
    modes: [...(parameters.modes ?? [])],
    metadata: parameters.metadata,
  };
}

export function createWorkflow(parameters: AssistantWorkflowParameters): AssistantWorkflow {
  requireText(parameters.assistantId, 'assistant id');
  requireText(parameters.productObject, 'product object');
  requireText(parameters.flow, 'workflow flow');
  assertUnique(parameters.stages.map((stage) => stage.id), 'workflow stage id');
  assertUnique(parameters.lanes.map((lane) => lane.id), 'workflow lane id');

  const stageIds = new Set(parameters.stages.map((stage) => stage.id));
  for (const stage of parameters.stages) {
    for (const transition of stage.transitions) {
      if (!stageIds.has(transition)) {
        throw new Error(`Workflow stage ${stage.id} transitions to unknown stage ${transition}`);
      }
    }
  }
  for (const lane of parameters.lanes) {
    for (const stageId of lane.stageIds) {
      if (!stageIds.has(stageId)) {
        throw new Error(`Workflow lane ${lane.id} references unknown stage ${stageId}`);
      }
    }
  }

  return {
    id: parameters.id ?? `${parameters.assistantId}-workflow`,
    assistantId: parameters.assistantId,
    productObject: parameters.productObject,
    flow: parameters.flow,
    stages: parameters.stages.map((stage) => ({ ...stage })),
    lanes: parameters.lanes.map((lane) => ({ ...lane })),
  };
}

export function createContextPolicy<TData extends Record<string, unknown> = Record<string, unknown>>(
  parameters: AssistantContextPolicyInput<TData> = {},
): AssistantContextPolicy<TData> {
  const objectKeys = parameters.objectKeys ?? DEFAULT_CONTEXT_KEYS;
  const extract = parameters.extract ?? ((input: Record<string, unknown>) => {
    const objectId = objectKeys
      .map((key) => input[key])
      .find((value): value is string => typeof value === 'string' && value.length > 0);
    if (objectId === undefined) {
      return undefined;
    }
    const productObject = typeof input.productObject === 'string' ? input.productObject : undefined;
    const stageId = typeof input.stageId === 'string' ? input.stageId : undefined;
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (!objectKeys.includes(key as string) && key !== 'productObject' && key !== 'stageId') {
        data[key] = value;
      }
    }
    return { productObject, objectId, stageId, data: data as Partial<TData> };
  });

  const validate = parameters.validate ?? ((context, input, current) => {
    const resolution = extract(input);
    if (!resolution) {
      return true;
    }
    const activeContext = current ?? context;
    if (
      !parameters.allowCrossObjectHandoff &&
      activeContext.objectId &&
      resolution.objectId &&
      activeContext.objectId !== resolution.objectId
    ) {
      return `Object context changed from ${activeContext.objectId} to ${resolution.objectId}`;
    }
    if (
      activeContext.productObject &&
      resolution.productObject &&
      activeContext.productObject !== resolution.productObject
    ) {
      return `Product context changed from ${activeContext.productObject} to ${resolution.productObject}`;
    }
    return true;
  });

  return {
    objectKeys: [...objectKeys],
    extract,
    validate,
    allowCrossObjectHandoff: parameters.allowCrossObjectHandoff ?? false,
  };
}

export function createContext<TData extends Record<string, unknown> = Record<string, unknown>>(
  parameters: {
    productObject: string;
    objectId?: string;
    stageId?: string;
    data: TData;
    version?: number;
  },
): AssistantContext<TData> {
  requireText(parameters.productObject, 'product object');
  return {
    productObject: parameters.productObject,
    objectId: parameters.objectId,
    stageId: parameters.stageId,
    data: { ...parameters.data },
    version: parameters.version ?? 1,
  };
}

export function resolveContext<TData extends Record<string, unknown> = Record<string, unknown>>(
  policy: AssistantContextPolicy<TData>,
  input: Record<string, unknown>,
  current?: AssistantContext<TData>,
): AssistantContextResult<TData> {
  const resolution: AssistantContextResolution<TData> | undefined = policy.extract?.(input);
  const data = resolution?.data
    ? ({ ...(current?.data ?? {}), ...resolution.data } as TData)
    : (current?.data ?? ({} as TData));
  const context: AssistantContext<TData> = resolution
    ? {
        productObject: resolution.productObject ?? current?.productObject ?? '',
        objectId: resolution.objectId ?? current?.objectId,
        stageId: resolution.stageId ?? current?.stageId,
        data,
        version: (current?.version ?? 0) + 1,
      }
    : current ?? {
        productObject: '',
        data: {} as TData,
        version: 1,
      };

  if (policy.validate) {
    const result = policy.validate(context, input, current);
    if (result !== true) {
      return { valid: false, context, error: typeof result === 'string' ? result : 'Context validation failed' };
    }
  }
  return { valid: true, context };
}

export function createApprovalPolicy(parameters: ApprovalPolicyInput = {}): ApprovalPolicy {
  return {
    requiresConfirmation: parameters.requiresConfirmation ?? false,
    dryRunByDefault: parameters.dryRunByDefault ?? true,
    allowedStates: [...(parameters.allowedStates ?? DEFAULT_APPROVAL_STATES)],
    summarize:
      parameters.summarize ??
      ((request: ApprovalRequest) => ({
        toolName: request.toolName ?? request.toolId,
        toolId: request.toolId,
        action: request.action,
        object: request.object,
        scope: { ...request.scope },
        confirmBeforeSend: request.confirmBeforeSend ?? false,
        requiresConfirmation:
          typeof parameters.requiresConfirmation === 'function'
            ? parameters.requiresConfirmation(request)
            : (parameters.requiresConfirmation ?? false),
        dryRun: request.dryRun ?? true,
      })),
  };
}

export function shouldRequireApproval(policy: ApprovalPolicy, request: ApprovalRequest): boolean {
  if (request.dryRun && policy.dryRunByDefault) {
    return false;
  }
  if (request.workflowState && !policy.allowedStates.includes(request.workflowState)) {
    return false;
  }
  return typeof policy.requiresConfirmation === 'function'
    ? policy.requiresConfirmation(request)
    : policy.requiresConfirmation;
}

export function createApprovalRecord(
  request: ApprovalRequest,
  actor: string,
  decision: ApprovalRecord['decision'] = 'pending',
  id = `approval_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
): ApprovalRecord {
  return {
    id,
    requestId: id,
    assistantId: request.assistantId,
    toolId: request.toolId,
    action: request.action,
    object: request.object,
    scope: { ...request.scope },
    actor,
    decision,
    createdAt: new Date(),
  };
}

export function createConfiguration<TValues extends Record<string, unknown> = Record<string, unknown>>(
  parameters: AssistantConfigurationInput<TValues> = {},
): AssistantConfiguration<TValues> {
  return {
    defaults: { ...(parameters.defaults ?? {}) } as Readonly<TValues>,
    requiredKeys: [...(parameters.requiredKeys ?? [])],
    validate: parameters.validate,
  };
}

export function resolveConfiguration<TValues extends Record<string, unknown>>(
  configuration: AssistantConfiguration<TValues>,
  overrides: Partial<TValues> = {},
): Readonly<TValues> {
  const value = { ...configuration.defaults, ...overrides } as TValues;
  for (const key of configuration.requiredKeys) {
    if (value[key] === undefined || value[key] === null || value[key] === '') {
      throw new Error(`Required configuration value is missing: ${key}`);
    }
  }
  const error = configuration.validate?.(value);
  if (error) {
    throw new Error(error);
  }
  return value;
}

export class InMemoryPersistencePort<TState> {
  private readonly states = new Map<string, TState>();

  load(id: string): TState | undefined {
    const state = this.states.get(id);
    return state === undefined ? undefined : state;
  }

  save(id: string, state: TState): void {
    this.states.set(id, state);
  }

  delete(id: string): boolean {
    return this.states.delete(id);
  }

  list(): Array<{ id: string; state: TState }> {
    return Array.from(this.states.entries()).map(([id, state]) => ({ id, state }));
  }
}

export function createPersistencePolicy<TState>(
  port: AssistantPersistencePort<TState>,
  namespace = 'assistant',
  revisionLimit = 100,
): AssistantPersistencePolicy<TState> {
  return { port, namespace, revisionLimit };
}

export function createAssistant<TContext extends Record<string, unknown>, TConfiguration extends Record<string, unknown>>(
  parameters: AssistantDefinitionParameters<TContext, TConfiguration>,
): AssistantDefinition<TContext, TConfiguration> {
  requireText(parameters.identity.id, 'assistant id');
  requireText(parameters.identity.name, 'assistant name');
  if (parameters.productObjects.length === 0) {
    throw new Error('At least one product object is required');
  }
  if (parameters.workflow.assistantId !== parameters.identity.id) {
    throw new Error(`Workflow assistant ${parameters.workflow.assistantId} does not match assistant ${parameters.identity.id}`);
  }

  const stageIds = new Set(parameters.workflow.stages.map((stage) => stage.id));
  const laneIds = new Set(parameters.workflow.lanes.map((lane) => lane.id));
  const skillIds = new Set<string>();
  for (const skill of parameters.skills) {
    if (skillIds.has(skill.id)) {
      throw new Error(`Duplicate assistant skill: ${skill.id}`);
    }
    skillIds.add(skill.id);
    if (!stageIds.has(skill.stageId)) {
      throw new Error(`Skill ${skill.id} references unknown stage ${skill.stageId}`);
    }
    if (!laneIds.has(skill.laneId)) {
      throw new Error(`Skill ${skill.id} references unknown lane ${skill.laneId}`);
    }
  }

  const skillTools = parameters.skills.map((skill) => skill.tool);
  const tools = unique([...(parameters.tools ?? []), ...skillTools].map((tool) => tool.id)).map((id) => {
    const tool = [...(parameters.tools ?? []), ...skillTools].find((candidate) => candidate.id === id);
    if (!tool) {
      throw new Error(`Unable to resolve tool ${id}`);
    }
    return tool;
  });
  const persistence = parameters.persistence ?? {};
  const port = persistence.port ?? new InMemoryPersistencePort<AssistantRuntimeState<TContext, TConfiguration>>();

  return {
    id: parameters.identity.id,
    name: parameters.identity.name,
    description: parameters.identity.description,
    version: parameters.identity.version,
    productObjects: [...parameters.productObjects],
    workflow: parameters.workflow,
    skills: [...parameters.skills],
    tools,
    configuration: createConfiguration(parameters.configuration),
    contextPolicy: createContextPolicy(parameters.contextPolicy),
    approvalPolicy: createApprovalPolicy(parameters.approvalPolicy),
    persistence: {
      port,
      namespace: persistence.namespace ?? parameters.identity.id,
      revisionLimit: persistence.revisionLimit ?? 100,
    },
    metadata: parameters.metadata,
  };
}

export const composeAssistant = createAssistant;
export const createAssistantDefinition = createAssistant;
export const createWorkflowDefinition = createWorkflow;
export const createStage = createWorkflowStage;
export const createLane = createWorkflowLane;
export const createSkillDefinition = createSkill;
export const createAssistantTool = createTool;
export const createAssistantContext = createContext;
export const createAssistantApprovalPolicy = createApprovalPolicy;
export const createAssistantConfiguration = createConfiguration;
