import type { Tool } from '../types';
import { gateFieldsFor, type GovernanceTier } from './gates';
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
  CreateToolParameters,
} from './contracts';

/**
 * Input keys that identify the product object an invocation acts on. A skill
 * that receives any of these is implicitly scoped to that object, which is how
 * continuity ("do not mix event A with event B") is enforced.
 */
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
] as const;

/**
 * Workflow states in which an approval gate applies. These are the states where
 * work is still advisory and a human can sensibly stop it before it acts.
 */
const DEFAULT_APPROVAL_STATES = ['draft', 'recommendation'] as const;

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

export function requireText(value: string, field: string): void {
  if (!value.trim()) {
    throw new Error(`${field} is required`);
  }
}

export function assertUnique(values: readonly string[], field: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`Duplicate ${field}: ${value}`);
    }
    seen.add(value);
  }
}

/**
 * Builds a Tool/Skill definition.
 *
 * The approval gate is derived from `tier` here rather than accepted as an
 * input, so a definition assembled by this builder and one assembled by
 * `createDeclarativeCodeSkill` behave identically at runtime
 * (ADK_DEVELOPER_GUIDE.md §2.2).
 */
export function createTool(parameters: CreateToolParameters): Tool {
  requireText(parameters.id, 'tool id');
  requireText(parameters.name, 'tool name');
  const now = new Date();
  const gate = parameters.tier ? gateFieldsFor(parameters.tier) : undefined;
  return {
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
    schemaVersion: parameters.schemaVersion ?? 1,
    ...(gate ? { confirmBeforeSend: gate.confirmBeforeSend } : {}),
    tier: parameters.tier,
    isSkill: parameters.isSkill,
    createdAt: parameters.createdAt ?? now,
    updatedAt: parameters.updatedAt ?? now,
  };
}

export function createContext<TData extends Record<string, unknown> = Record<string, unknown>>(
  parameters: {
    productObject: string;
    objectId?: string;
    data: TData;
    version?: number;
  },
): AssistantContext<TData> {
  requireText(parameters.productObject, 'product object');
  return {
    productObject: parameters.productObject,
    objectId: parameters.objectId,
    data: { ...parameters.data },
    version: parameters.version ?? 1,
  };
}

/**
 * Builds the object-continuity policy for an assistant.
 *
 * The default validator rejects an input that names a different product object
 * than the active context, which is what stops one conversation from silently
 * accumulating results across unrelated objects.
 */
export function createContextPolicy<TData extends Record<string, unknown> = Record<string, unknown>>(
  parameters: AssistantContextPolicyInput<TData> = {},
): AssistantContextPolicy<TData> {
  const objectKeys = parameters.objectKeys ?? DEFAULT_CONTEXT_KEYS;
  const allowCrossObjectHandoff = parameters.allowCrossObjectHandoff ?? false;

  const extract = parameters.extract ?? ((input: Record<string, unknown>) => {
    const objectId = objectKeys
      .map((key) => input[key])
      .find((value): value is string => typeof value === 'string' && value.length > 0);
    if (objectId === undefined) {
      return undefined;
    }
    const productObject = typeof input.productObject === 'string' ? input.productObject : undefined;
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (!objectKeys.includes(key as string) && key !== 'productObject') {
        data[key] = value;
      }
    }
    return { productObject, objectId, data: data as Partial<TData> };
  });

  const validate = parameters.validate ?? ((context, input, current) => {
    const resolution = extract(input);
    if (!resolution) {
      return true;
    }
    const activeContext = current ?? context;
    if (
      !allowCrossObjectHandoff &&
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
    allowCrossObjectHandoff,
  };
}

/**
 * Folds an invocation's input into the active context and validates continuity.
 * Returns `valid: false` with a human-readable reason when the input would move
 * the conversation onto a different object.
 */
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

/**
 * Decides whether an invocation needs human confirmation.
 *
 * A dry run never needs approval because it does not act. Outside the policy's
 * allowed states the gate does not apply, because the work has already been
 * approved or executed. Otherwise the policy's own requirement decides.
 */
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

/**
 * Merges caller overrides over the assistant defaults and enforces required
 * keys, so a misconfigured assistant fails loudly before a skill runs.
 */
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

/**
 * Composes an assistant from a flat skill set plus the policies that govern it.
 * There are no stages or lanes: an assistant is a set of skills bound to an
 * object, a configuration contract, an object-continuity rule, and an approval
 * gate.
 */
export function createAssistant<TContext extends Record<string, unknown>, TConfiguration extends Record<string, unknown>>(
  parameters: AssistantDefinitionParameters<TContext, TConfiguration>,
): AssistantDefinition<TContext, TConfiguration> {
  requireText(parameters.identity.id, 'assistant id');
  requireText(parameters.identity.name, 'assistant name');
  if (parameters.productObjects.length === 0) {
    throw new Error('At least one product object is required');
  }
  assertUnique(parameters.skills.map((skill) => skill.id), 'assistant skill');
  assertUnique(parameters.productObjects, 'assistant product object');

  const skillTools = [...parameters.skills];
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
export const createAssistantTool = createTool;
export const createAssistantContext = createContext;
export const createAssistantApprovalPolicy = createApprovalPolicy;
export const createAssistantConfiguration = createConfiguration;
