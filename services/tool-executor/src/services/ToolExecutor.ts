import { createContextPolicy } from '../adk';
import {
  Tool, ToolExecution, WorkflowState, CredentialRequest, CredentialRequiredError, ConfirmationRequiredError,
  CrossObjectHandoffError, ApprovalSummary, HandoffRequest, RuntimeWorkflow, RuntimeWorkflowAction,
  ExecutionRecord, ExecutionReconciliation,
} from '../types';
import logger from '../utils/logger';
import { ErrorHandler } from '../utils/ErrorHandler';
import { credentialProvider } from '../services/CredentialProvider';
import { MCPClient, MCPHTTPClient, MCPServerConfig } from '../services/MCPClient';
import { allWorkflows } from '../data/skills';
import type { AssistantWorkflow } from '../adk/workflow-common';
import { AssistantWorkspaceManager } from './AssistantWorkspaceManager';
import type { StoreWrite } from '../adk/events';
import { createInMemoryEventLog, type EventLog } from './EventLog';
import { createExecutionRecordStore, type ExecutionRecordStore } from './ExecutionRecordStore';
import { ToolConfigResolver, redactSecrets } from './ToolConfig';
import { ToolDispatcher } from './ToolDispatcher';
import { ToolEventDispatcher } from './ToolEventDispatcher';

const MAX_NESTING_DEPTH = 4;

/**
 * Object-continuity keys, expressed as an ADK context policy so the guard and
 * the policy cannot drift apart.
 *
 * The key list is the executor's own deliberately narrow set. The policy's
 * broader default also contains keys that name an action rather than a product
 * object, so adopting it wholesale would make unrelated skills look like a
 * cross-object handoff. Adding a key here widens what counts as the same
 * object, so treat it as a governance change.
 */
const CONTEXT_POLICY = createContextPolicy({
  objectKeys: [
    'patient', 'patientId', 'jobId', 'campaign', 'campaignId', 'ticket', 'ticketId',
    'case', 'matter', 'lead', 'opportunity', 'event', 'eventId',
  ],
});
const CONTEXT_KEYS = CONTEXT_POLICY.objectKeys;

/**
 * Normalizes a non-skill callee's payload into the `{ success, data }` envelope
 * that every skill already reads off `__execute_tool`.
 *
 * A skill callee emits its own JSON, so the bridge hands that back verbatim and
 * `success`/`data` are present. Every OTHER callee type returns its raw payload
 * instead, and none of them carry a `success` key:
 *
 *   - `reasoning` -> `{ summary, _raw, _model, _provider, _tokensUsed }`
 *   - `native`    -> `{ ...data, durationMs }`, with `success` deliberately
 *                    stripped by dispatch, or `{ error }` on failure
 *   - `openapi`   -> `{ status, data }`
 *   - `mcp`       -> `{ content, isError }`, or `{ error }` on failure
 *
 * So a skill that delegated to one of those and checked `result.success` saw
 * `undefined`, judged the call FAILED, and fell through to a redundant fallback
 * or reported the callee as offline. That is how four successful brain calls
 * were logged as a dead brain. The raw fields are spread through untouched, so
 * callers reading them directly (e.g. `search_web`'s `results`) keep working, and
 * existing keys are never clobbered.
 */
function normalizeNestedPayload(output: unknown): Record<string, unknown> {
  const raw: Record<string, unknown> = output && typeof output === 'object' && !Array.isArray(output)
    ? (output as Record<string, unknown>)
    : {};
  // Already an envelope (a code skill that emitted one, or a payload that
  // carries its own success flag): pass it through untouched.
  if ('success' in raw) return raw;
  const nestedError = (raw as { output?: { error?: unknown } })?.output?.error;
  const failed = raw.isError === true || (raw.error !== undefined && raw.error !== null && raw.error !== '') || (nestedError !== undefined && nestedError !== null && String(nestedError) !== '');
  return {
    ...raw,
    success: !failed,
    // Preserve an HTTP status (openapi) rather than overwriting it with a
    // lifecycle word; only supply a status when the callee did not.
    status: 'status' in raw ? raw.status : (failed ? 'failed' : 'ok'),
    data: 'data' in raw ? raw.data : raw,
    error: raw.error !== undefined ? raw.error : (nestedError !== undefined ? String(nestedError) : null),
  };
}

export type { FtpExecutionOptions, FtpExecutionResult } from '../executors/FtpExecutor';
export type { WebhookDispatchOptions, WebhookDispatchResult } from '../executors/WebhookExecutor';
export type { DatabaseQueryOptions, DatabaseQueryResult } from '../executors/DatabaseExecutor';
export type { FileStorageOptions, FileStorageResult } from '../executors/FileStorageExecutor';
export type { ApprovalSummary } from '../types';

interface PendingCredentialRequest {
executionId: string;
toolId: string;
toolName: string;
tool: Tool;
input: Record<string, unknown>;
request: CredentialRequest;
  credentials: Record<string, string | undefined>;
  opts?: { workspaceId?: string; assistantId?: string; context?: Record<string, unknown>; executionId?: string; idempotencyKey?: string; requestId?: string; [key: string]: unknown };
}

export class ToolExecutor {
  private mcpClients = new Map<string, MCPClient | MCPHTTPClient>();
  private mcpServerConfigs = new Map<string, MCPServerConfig>();
  private pendingCredentialRequests = new Map<string, PendingCredentialRequest>();
  private pendingCredentialOverrides = new Map<string, Record<string, string>>();
  private nestedExecutionDepth = 0;
  private currentExecutionApproved = false;
  private activeContextObject: string | null = null;
  private executionStates: Map<string, WorkflowState> = new Map();
  private toolRegistry: Map<string, Tool> | null = null;
  private handoffRequests = new Map<string, HandoffRequest>();
  private executionContexts = new Map<string, { workspaceId?: string; assistantId?: string; context?: Record<string, unknown> }>();
  private workspaceManager: AssistantWorkspaceManager | null = null;
  private readonly config: ToolConfigResolver;
  private readonly dispatcher: ToolDispatcher;
  private readonly events: ToolEventDispatcher;
  private readonly executionRecordStore: ExecutionRecordStore;

  constructor(
    toolRegistry?: Map<string, Tool>,
    workspaceManager?: AssistantWorkspaceManager,
    eventLog: EventLog = createInMemoryEventLog(),
    executionRecordStore: ExecutionRecordStore = createExecutionRecordStore(),
  ) {
    this.toolRegistry = toolRegistry || null;
    this.workspaceManager = workspaceManager || null;
    this.executionRecordStore = executionRecordStore;
    // Collaborators share the registry / MCP map / override map by reference, so
    // tools registered after construction stay visible to all of them.
    const nestedExecutor = this.nestedExecutorCallback();
    this.config = new ToolConfigResolver(this.pendingCredentialOverrides);
    this.dispatcher = new ToolDispatcher(this.toolRegistry, this.mcpClients, this.config, nestedExecutor);
    this.events = new ToolEventDispatcher(this.toolRegistry, eventLog, nestedExecutor);
  }

  findDownstreamEventTriggers(eventId: string, emitterId?: string): Tool[] {
    return this.events.findDownstreamEventTriggers(eventId, emitterId);
  }

  dispatchEventTrigger(tool: Tool, upstreamData: unknown, workspaceId?: string): Promise<void> {
    return this.events.dispatchEventTrigger(tool, upstreamData, workspaceId);
  }

  private normalizeAssistantId(assistantId?: string): string {
    return (assistantId || '')
      .replace(/-canonical-assistant$/i, '')
      .replace(/_/g, '-')
      .trim()
      .toLowerCase();
  }

  private findWorkflow(assistantId?: string): AssistantWorkflow | undefined {
    if (!assistantId) return undefined;
    const normalized = this.normalizeAssistantId(assistantId);
    return allWorkflows.find((workflow) => (
      this.normalizeAssistantId(workflow.assistant) === normalized ||
      workflow.assistant.toLowerCase() === assistantId.toLowerCase()
    ));
  }


  private ensureWorkspace(
    tool: Tool,
    input: Record<string, unknown>,
    opts?: { workspaceId?: string; assistantId?: string; context?: Record<string, unknown> }
  ): { workspaceId?: string; workflow?: AssistantWorkflow } {
    if (!this.workspaceManager) {
      return { workspaceId: opts?.workspaceId, workflow: this.findWorkflow(opts?.assistantId) };
    }

    const workflow = this.findWorkflow(opts?.assistantId);
    if (opts?.workspaceId) {
      const existing = this.workspaceManager.getWorkspace(opts.workspaceId);
      if (!existing && workflow) {
        const created = this.workspaceManager.createWorkspace(
          workflow.assistant,
          workflow.productObject,
        );
        if (opts.context) created.context = { ...opts.context };
        return { workspaceId: created.workspaceId, workflow };
      }
      if (existing && opts.context) {
        existing.context = { ...(existing.context || {}), ...opts.context };
        existing.updatedAt = new Date();
        this.workspaceManager.persist();
      }
      return { workspaceId: opts.workspaceId, workflow: workflow || this.findWorkflow(existing?.assistant) };
    }

    if (opts?.assistantId && workflow) {
      const created = this.workspaceManager.createOrResumeWorkspace(
        workflow.assistant,
        workflow.productObject,
        { context: opts.context },
      ).workspace;
      return { workspaceId: created.workspaceId, workflow };
    }

    return { workspaceId: opts?.workspaceId, workflow };
  }

  private recordWorkspaceExecution(
    execution: ToolExecution,
    tool: Tool,
    opts?: { workspaceId?: string; assistantId?: string; context?: Record<string, unknown> },
    workflow?: AssistantWorkflow,
  ): void {
    if (!this.workspaceManager || !opts?.workspaceId || !workflow) return;
    try {
      const workspace = this.workspaceManager.getWorkspace(opts.workspaceId);
      if (!workspace) return;
      this.workspaceManager.recordExecutionFromResult(opts.workspaceId, {
        executionId: execution.executionId,
        toolId: tool.id,
        toolName: tool.name,
        status: execution.status === 'completed' ? 'completed' : 'failed',
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
        workflowState: execution.workflowState,
      });
      const runtime = this.workspaceManager.buildRuntimeWorkflow(opts.workspaceId, workflow, execution.executionId);
      if (runtime) this.workspaceManager.setNextActions(opts.workspaceId, runtime.nextActions);
    } catch (error) {
      logger.warn({ workspaceId: opts.workspaceId, error: error instanceof Error ? error.message : String(error) }, 'Failed to update workflow workspace');
    }
  }

  private recordWorkspaceApproval(
    tool: Tool,
    input: Record<string, unknown>,
    executionId: string,
    opts?: { workspaceId?: string; assistantId?: string; context?: Record<string, unknown> },
  ): void {
    if (!this.workspaceManager || !opts?.workspaceId) return;
    try {
      const summary = this.generateApprovalSummary(tool, input);
      this.workspaceManager.recordApproval(opts.workspaceId, {
        executionId,
        toolId: tool.id,
        toolName: tool.name,
        state: 'draft',
        actor: 'user',
        scope: summary.scope,
        timestamp: new Date(),
      });
    } catch {
      // Approval history is best-effort; execution safeguards remain authoritative.
    }
  }


  private normalizeExecutionId(requested?: string | null): string | undefined {
    if (typeof requested !== 'string') return undefined;
    const trimmed = requested.trim();
    if (!trimmed || trimmed.length > 200) return undefined;
    if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) return undefined;
    return trimmed;
  }


  private isCredentialRequiredError(error: unknown): error is CredentialRequiredError & { request: CredentialRequest } {
    if (error instanceof CredentialRequiredError) return true;
    if (!error || typeof error !== 'object') return false;
    const e: any = error;
    return e.name === 'CredentialRequiredError' || (e.request && Array.isArray(e.request.missingCredentials));
  }

  private requestedExecutionId(input: Record<string, unknown>, opts?: { executionId?: string; idempotencyKey?: string; requestId?: string; context?: Record<string, unknown> }): string | undefined {
    const ctx = (opts?.context || {}) as Record<string, unknown>;
    return this.normalizeExecutionId(
      opts?.executionId || opts?.idempotencyKey || opts?.requestId ||
      (input.executionId as string) || (input.idempotencyKey as string) || (input.requestId as string) ||
      (ctx.executionId as string) || (ctx.idempotencyKey as string) || (ctx.requestId as string)
    );
  }

  private isTerminalLifecycle(status?: string): boolean {
    return status === 'completed' || status === 'failed';
  }

  private async loadExecutionRecord(executionId: string): Promise<ExecutionRecord | null> {
    try { return await this.executionRecordStore.get(executionId); } catch (err) {
      logger.warn({ executionId, err: err instanceof Error ? err.message : String(err) }, 'Execution record load failed');
      return null;
    }
  }

  private async saveExecutionRecord(record: ExecutionRecord): Promise<void> {
    try {
      await this.executionRecordStore.save({ ...record, updatedAt: new Date(), version: (record.version || 0) + 1 });
    } catch (err) {
      logger.warn({ executionId: record.executionId, err: err instanceof Error ? err.message : String(err) }, 'Execution record save failed');
    }
  }

  private executionFromRecord(record: ExecutionRecord): ToolExecution {
    return {
      executionId: record.executionId,
      idempotencyKey: record.idempotencyKey || record.executionId,
      toolId: record.toolId,
      toolName: record.toolName,
      input: record.input || {},
      output: record.output,
      error: record.error,
      status: record.status,
      workflowState: record.workflowState,
      startedAt: record.startedAt ? new Date(record.startedAt) : new Date(),
      completedAt: record.completedAt ? new Date(record.completedAt) : undefined,
      workspaceId: record.workspaceId,
      assistantId: record.assistantId,
      context: record.context,
      runtimeWorkflow: record.runtimeWorkflow,
      metadata: record.metadata,
      reconciliation: record.reconciliation,
      updatedAt: record.updatedAt ? new Date(record.updatedAt) : undefined,
    };
  }

  private mergeExecutionReconciliation(output: unknown, reconciliation?: ExecutionReconciliation): unknown {
    if (!reconciliation) return output;
    const out: Record<string, unknown> = (output && typeof output === 'object' && !Array.isArray(output))
      ? { ...(output as Record<string, unknown>) }
      : { value: output };
    const existing = (out.reconciliation && typeof out.reconciliation === 'object' && !Array.isArray(out.reconciliation))
      ? (out.reconciliation as Record<string, unknown>)
      : {};
    out.reconciliation = { ...existing, ...reconciliation };
    if (reconciliation.idempotencyKey && out.idempotencyKey === undefined) out.idempotencyKey = reconciliation.idempotencyKey;
    if (reconciliation.providerRequestId && out.providerRequestId === undefined) out.providerRequestId = reconciliation.providerRequestId;
    if (reconciliation.outcomeKnown !== undefined && out.outcomeKnown === undefined) out.outcomeKnown = reconciliation.outcomeKnown;
    return out;
  }

  async getExecutionRecord(executionId: string): Promise<ExecutionRecord | null> {
    const key = this.normalizeExecutionId(executionId) || executionId;
    const stored = await this.loadExecutionRecord(key);
    if (stored) {
      if (stored.status === 'pending_credentials' && stored.pendingCredentialRequest) {
        this.restorePendingCredentialRequest(stored);
      }
      return stored;
    }
    const pending = this.pendingCredentialRequests.get(key);
    if (pending) {
      return {
        executionId: key,
        idempotencyKey: key,
        toolId: pending.toolId,
        toolName: pending.toolName,
        input: pending.input,
        status: 'pending_credentials',
        startedAt: new Date(),
        pendingCredentialRequest: pending.request,
        context: pending.opts?.context,
        workspaceId: pending.opts?.workspaceId,
        assistantId: pending.opts?.assistantId,
        version: 1,
      };
    }
    return null;
  }

  private restorePendingCredentialRequest(record: ExecutionRecord): void {
    if (!record.pendingCredentialRequest) return;
    if (this.pendingCredentialRequests.has(record.executionId)) return;
    const tool = this.resolveNestedTool(record.toolId) || ({ id: record.toolId, name: record.toolName || record.toolId } as Tool);
    this.pendingCredentialRequests.set(record.executionId, {
      executionId: record.executionId,
      toolId: record.toolId,
      toolName: record.toolName || tool.name || record.toolId,
      tool,
      input: record.input || {},
      request: record.pendingCredentialRequest,
      credentials: {},
      opts: { workspaceId: record.workspaceId, assistantId: record.assistantId, context: record.context },
    });
  }

  private providerCapability(tool: Tool): 'email' | 'webhook' | 'api_client' | 'vendor' | 'unknown' {
    const key = (tool.manifest as any)?.executor;
    if (key === 'email') return 'email';
    if (key === 'webhook') return 'webhook';
    if (key === 'api_client') return 'api_client';
    if (key === 'vendor') return 'vendor';
    const name = (tool.name || '').toLowerCase();
    if (name.includes('email')) return 'email';
    if (name.includes('webhook')) return 'webhook';
    if (name.includes('api')) return 'api_client';
    return 'unknown';
  }

  private async reconcileExternalExecution(tool: Tool, input: Record<string, unknown>, idempotencyKey: string, prior?: ExecutionRecord | null): Promise<ExecutionReconciliation | null> {
    const capability = this.providerCapability(tool);
    if (capability === 'unknown') return null;
    const base: ExecutionReconciliation = {
      idempotencyKey,
      provider: capability,
      lookupAttempted: false,
      outcomeKnown: false,
      note: 'No provider outcome lookup available for this executor; do not retry automatically when a prior response was lost.',
    };
    if (capability === 'email') {
      // SMTP/nodemailer has no portable post-send status lookup by client key.
      // Nodemailer accepts `headers` but providers vary; callers should use a provider-specific integration for delivery tracking.
      return {
        ...base,
        note: 'SMTP email delivery outcome cannot be determined by tool-executor after a lost response. Provider accepted requests may or may not have been delivered; use a provider-specific message/status API and pass providerRequestId when available. Automatic retry was avoided for repeated idempotent requests.',
      };
    }
    if (capability === 'webhook' || capability === 'api_client' || capability === 'vendor') {
      // Generic HTTP/provider hooks: support caller-supplied idempotency headers/keys and explicit status lookup URL when available.
      const lookupUrl = (input.reconciliationLookupUrl || input.statusLookupUrl || input.lookupUrl) as string | undefined;
      if (lookupUrl && typeof lookupUrl === 'string') {
        try {
          const res = await fetch(lookupUrl, { method: 'GET', headers: { 'Accept': 'application/json' } });
          const text = await res.text().catch(() => '');
          let body: any = text;
          try { body = text ? JSON.parse(text) : text; } catch {}
          return {
            ...base,
            lookupAttempted: true,
            lookupStatus: String(res.status),
            outcomeKnown: res.ok,
            lookupOutcome: typeof body === 'string' ? body.slice(0, 500) : JSON.stringify(body).slice(0, 500),
            note: res.ok ? 'Provider/status lookup completed.' : 'Provider/status lookup attempted but did not confirm outcome.',
          };
        } catch (err) {
          return { ...base, lookupAttempted: true, outcomeKnown: false, note: `Provider/status lookup failed: ${err instanceof Error ? err.message : String(err)}` };
        }
      }
      return {
        ...base,
        note: prior ? 'Prior execution exists but provider outcome is unknown (no lookup URL/capability configured). Do not assume success or blindly retry.' : 'Provider may accept idempotency headers when supplied, but no outcome lookup was configured. If response is lost, outcome may be unknown.',
      };
    }
    return base;
  }


  async execute(tool: Tool, input: Record<string, unknown>, opts?: { workspaceId?: string; assistantId?: string; context?: Record<string, unknown>; executionId?: string; idempotencyKey?: string; requestId?: string; [key: string]: unknown }): Promise<ToolExecution> {
    const requestedId = this.requestedExecutionId(input, opts);
    const executionId = requestedId || `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startedAt = new Date();

    if (requestedId) {
      const existing = await this.loadExecutionRecord(executionId);
      if (existing) {
        if (existing.status === 'in_progress' && !(opts as any)?.resumePending) {
          return this.executionFromRecord(existing);
        }
        if (this.isTerminalLifecycle(existing.status)) {
          return this.executionFromRecord({
            ...existing,
            reconciliation: {
              ...(existing.reconciliation || {}),
              idempotencyKey: executionId,
              duplicatePrevented: true,
              outcomeKnown: existing.reconciliation?.outcomeKnown ?? true,
              note: existing.reconciliation?.note || 'Returned existing execution record for repeated idempotent request.',
            },
          });
        }
        if (existing.status === 'pending_credentials' && existing.pendingCredentialRequest) {
          this.restorePendingCredentialRequest(existing);
          return this.executionFromRecord(existing);
        }
      }
      const reconciliation = await this.reconcileExternalExecution(tool, input, executionId, existing);
      opts = { ...(opts || {}), __reconciliation: reconciliation };
    }

    await this.saveExecutionRecord({
      executionId,
      idempotencyKey: executionId,
      toolId: tool.id,
      toolName: tool.name,
      input,
      status: 'in_progress',
      startedAt,
      workspaceId: opts?.workspaceId,
      assistantId: opts?.assistantId,
      context: opts?.context,
      reconciliation: (opts as any)?.__reconciliation,
      version: 0,
    });

    if (opts?.workspaceId || opts?.assistantId || opts?.context) {
      this.executionContexts.set(executionId, {
        workspaceId: opts.workspaceId,
        assistantId: opts.assistantId,
        context: opts.context,
      });
    }

    const workspace = this.ensureWorkspace(tool, input, opts);
    if (workspace.workspaceId) opts = { ...opts, workspaceId: workspace.workspaceId };
    const workflow = workspace.workflow;

    logger.info({ executionId, idempotencyKey: executionId, toolId: tool.id, toolName: tool.name, toolType: tool.type, workspaceId: opts?.workspaceId, assistantId: opts?.assistantId }, 'Tool execution started');

    const secretValues: string[] = [];
    try {
      this.enforceConfirmation(tool, input, executionId);
      this.validateSameContext(tool, input);
      const configResult = await this.config.validateConfigSchema(tool, input, executionId);
      if (configResult) {
        this.events.dispatchOutcomeEvent(
          tool, 'aborted', 'invalid or incomplete configuration', opts?.workspaceId, opts?.assistantId, executionId,
        );
        return configResult;
      }
      const { resolved, sources } = await this.config.resolveCredentials(tool, input, executionId);
      const hydratedInput = await this.config.hydrateSecretInputs(tool, { ...input, executionId, idempotencyKey: executionId }, secretValues);
      const rawOutput = await this.dispatcher.dispatch(tool, hydratedInput, { resolved, sources });
      const storedOutput = await this.config.storeSecretOutputs(tool, rawOutput, opts?.context?.tenantId, secretValues);
      const output = redactSecrets(storedOutput, secretValues) as typeof rawOutput;
      this.pendingCredentialOverrides.delete(tool.id);
      const executionFailed = Boolean(output && output.error !== undefined);
      // `dispatch` reports failure as `{ error }` rather than throwing, so a
      // tool that "succeeded" with an error payload must not emit its event.
      if (!executionFailed) {
        this.events.dispatchUpstreamEvents(
          tool, output, opts?.workspaceId, opts?.assistantId, executionId, input,
          (output as { storeWrites?: StoreWrite[] } | undefined)?.storeWrites,
        );
      } else {
        this.events.dispatchOutcomeEvent(
          tool, 'failed', String(output.error), opts?.workspaceId, opts?.assistantId, executionId,
        );
      }
      const completedAt = new Date();

      logger.info(
        { executionId, toolId: tool.id, status: executionFailed ? 'failed' : 'completed' },
        executionFailed ? 'Tool execution returned a failure result' : 'Tool execution completed',
      );
      if (!executionFailed) this.transitionTo(executionId, 'executed');

      const executorError = typeof output === 'object' && output !== null
        ? (output as { output?: { error?: string } })?.output?.error
        : undefined;

      const reconciliation = (opts as any)?.__reconciliation as ExecutionReconciliation | undefined;
      const mergedOutput = this.mergeExecutionReconciliation(output, reconciliation);
      const result: ToolExecution = {
        executionId,
        idempotencyKey: executionId,
        toolId: tool.id,
        toolName: tool.name,
        input,
        output: mergedOutput as any,
        ...(executionFailed
          ? { error: String((mergedOutput as any)?.error ?? output?.error) }
          : executorError !== undefined
            ? { error: String(executorError) }
            : {}),
        status: executionFailed ? 'failed' : 'completed',
        workflowState: this.getWorkflowState(executionId),
        startedAt,
        completedAt,
        workspaceId: opts?.workspaceId,
        assistantId: opts?.assistantId,
        context: opts?.context,
        runtimeWorkflow: workflow ? this.buildRuntimeWorkflow({
          executionId,
          workflow,
          workspaceId: opts?.workspaceId,
          assistantId: opts?.assistantId,
          context: opts?.context,
        }) : undefined,
        reconciliation,
      };
      this.recordWorkspaceExecution(result, tool, opts, workflow);
      await this.saveExecutionRecord({ ...(result as any), version: 0, pendingCredentialRequest: undefined });
      return result;
    } catch (error) {
      if (error instanceof ConfirmationRequiredError) {
        this.events.dispatchOutcomeEvent(
          tool, 'aborted', 'awaiting user confirmation', opts?.workspaceId, opts?.assistantId, executionId,
        );
        throw error;
      }

      const completedAt = new Date();
      const errorMessage = String(redactSecrets(error instanceof Error ? error.message : String(error), secretValues));
      this.events.dispatchOutcomeEvent(
        tool, 'failed', errorMessage, opts?.workspaceId, opts?.assistantId, executionId,
      );

      logger.error({ executionId, toolId: tool.id, error: errorMessage }, 'Tool execution failed');

      const result: ToolExecution = {
        executionId,
        idempotencyKey: executionId,
        toolId: tool.id,
        toolName: tool.name,
        input,
        error: errorMessage,
        status: 'failed',
        workflowState: this.getWorkflowState(executionId),
        startedAt,
        completedAt,
        workspaceId: opts?.workspaceId,
        assistantId: opts?.assistantId,
        context: opts?.context,
        runtimeWorkflow: workflow ? this.buildRuntimeWorkflow({
          executionId,
          workflow,
          workspaceId: opts?.workspaceId,
          assistantId: opts?.assistantId,
          context: opts?.context,
        }) : undefined,
        reconciliation: (opts as any)?.__reconciliation,
      };
      this.recordWorkspaceExecution(result, tool, opts, workflow);
      await this.saveExecutionRecord({ ...(result as any), version: 0, pendingCredentialRequest: undefined });
      return result;
    }
  }

  async executeOrRequestCredentials(tool: Tool, input: Record<string, unknown>, providedCredentials?: Record<string, string>, opts?: { workspaceId?: string; assistantId?: string; context?: Record<string, unknown>; executionId?: string; idempotencyKey?: string; requestId?: string; [key: string]: unknown }): Promise<ToolExecution | CredentialRequiredError> {
    const requestedId = this.requestedExecutionId(input, opts);
    const executionId = requestedId || `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startedAt = new Date();

    if (requestedId) {
      const existing = await this.loadExecutionRecord(executionId);
      if (existing?.status === 'in_progress' && !(opts as any)?.resumePending) return this.executionFromRecord(existing);
      if (existing && this.isTerminalLifecycle(existing.status)) {
        const reconciliation = { ...(existing.reconciliation || {}), idempotencyKey: executionId, duplicatePrevented: true, outcomeKnown: existing.reconciliation?.outcomeKnown ?? true, note: existing.reconciliation?.note || 'Returned existing execution record for repeated idempotent request.' };
        return this.executionFromRecord({ ...existing, reconciliation });
      }
      if (existing?.status === 'pending_credentials' && existing.pendingCredentialRequest && !(providedCredentials && Object.keys(providedCredentials).length > 0)) {
        this.restorePendingCredentialRequest(existing);
        return new CredentialRequiredError(existing.pendingCredentialRequest);
      }
      if (existing?.status === 'pending_credentials' && providedCredentials && Object.keys(providedCredentials).length > 0) {
        this.restorePendingCredentialRequest(existing);
        this.pendingCredentialOverrides.set(tool.id, providedCredentials);
        const resumed = await this.submitCredentials(executionId, { credentials: providedCredentials });
        if (this.isCredentialRequiredError(resumed)) return resumed instanceof CredentialRequiredError ? resumed : new CredentialRequiredError((resumed as any).request);
        return resumed;
      }
      const reconciliation = await this.reconcileExternalExecution(tool, input, executionId, existing);
      (opts as any) = { ...(opts || {}), __reconciliation: reconciliation };
    }

    await this.saveExecutionRecord({
      executionId,
      idempotencyKey: executionId,
      toolId: tool.id,
      toolName: tool.name,
      input,
      status: 'in_progress',
      startedAt,
      workspaceId: opts?.workspaceId,
      assistantId: opts?.assistantId,
      context: opts?.context,
      reconciliation: (opts as any)?.__reconciliation,
      version: 0,
    });

    if (opts?.workspaceId || opts?.assistantId || opts?.context) {
      this.executionContexts.set(executionId, {
        workspaceId: opts.workspaceId,
        assistantId: opts.assistantId,
        context: opts.context,
      });
    }

    const workspace = this.ensureWorkspace(tool, input, opts);
    if (workspace.workspaceId) opts = { ...opts, workspaceId: workspace.workspaceId };
    const workflow = workspace.workflow;

    logger.info({ executionId, idempotencyKey: executionId, toolId: tool.id, toolName: tool.name, toolType: tool.type, workspaceId: opts?.workspaceId, assistantId: opts?.assistantId }, 'Tool execution started');

    if (providedCredentials && Object.keys(providedCredentials).length > 0) {
      this.pendingCredentialOverrides.set(tool.id, providedCredentials);
    }

    const secretValues: string[] = [];
    try {
      this.enforceConfirmation(tool, input, executionId);
      this.validateSameContext(tool, input);
      const configResult = await this.config.validateConfigSchema(tool, input, executionId);
      if (configResult) {
        this.events.dispatchOutcomeEvent(
          tool, 'aborted', 'invalid or incomplete configuration', opts?.workspaceId, opts?.assistantId, executionId,
        );
        return configResult;
      }
      const { resolved, sources } = await this.config.resolveCredentials(tool, input, executionId);
      const hydratedInput = await this.config.hydrateSecretInputs(tool, { ...input, executionId, idempotencyKey: executionId }, secretValues);
      const rawOutput = await this.dispatcher.dispatch(tool, hydratedInput, { resolved, sources });
      const storedOutput = await this.config.storeSecretOutputs(tool, rawOutput, opts?.context?.tenantId, secretValues);
      const output = redactSecrets(storedOutput, secretValues) as typeof rawOutput;
      this.pendingCredentialOverrides.delete(tool.id);
      const executionFailed = Boolean(output && output.error !== undefined);
      // `dispatch` reports failure as `{ error }` rather than throwing, so a
      // tool that "succeeded" with an error payload must not emit its event.
      if (!executionFailed) {
        this.events.dispatchUpstreamEvents(
          tool, output, opts?.workspaceId, opts?.assistantId, executionId, input,
          (output as { storeWrites?: StoreWrite[] } | undefined)?.storeWrites,
        );
      } else {
        this.events.dispatchOutcomeEvent(
          tool, 'failed', String(output.error), opts?.workspaceId, opts?.assistantId, executionId,
        );
      }
      const completedAt = new Date();

      logger.info(
        { executionId, toolId: tool.id, status: executionFailed ? 'failed' : 'completed' },
        executionFailed ? 'Tool execution returned a failure result' : 'Tool execution completed',
      );
      if (!executionFailed) this.transitionTo(executionId, 'executed');

      const executorError = typeof output === 'object' && output !== null
        ? (output as { output?: { error?: string } })?.output?.error
        : undefined;

      const reconciliation = (opts as any)?.__reconciliation as ExecutionReconciliation | undefined;
      const mergedOutput = this.mergeExecutionReconciliation(output, reconciliation);
      const result: ToolExecution = {
        executionId,
        idempotencyKey: executionId,
        toolId: tool.id,
        toolName: tool.name,
        input,
        output: mergedOutput as any,
        ...(executionFailed
          ? { error: String((mergedOutput as any)?.error ?? output?.error) }
          : executorError !== undefined
            ? { error: String(executorError) }
            : {}),
        status: executionFailed ? 'failed' : 'completed',
        workflowState: this.getWorkflowState(executionId),
        startedAt,
        completedAt,
        workspaceId: opts?.workspaceId,
        assistantId: opts?.assistantId,
        context: opts?.context,
        runtimeWorkflow: workflow ? this.buildRuntimeWorkflow({
          executionId,
          workflow,
          workspaceId: opts?.workspaceId,
          assistantId: opts?.assistantId,
          context: opts?.context,
        }) : undefined,
        reconciliation,
      };
      this.recordWorkspaceExecution(result, tool, opts, workflow);
      await this.saveExecutionRecord({ ...(result as any), version: 0, pendingCredentialRequest: undefined });
      return result;
    } catch (error) {
      const completedAt = new Date();

      if (this.isCredentialRequiredError(error)) {
        this.events.dispatchOutcomeEvent(
          tool, 'aborted', 'missing credentials', opts?.workspaceId, opts?.assistantId, executionId,
        );
        const request = (error as any).request as CredentialRequest;
        request.executionId = executionId;
        request.idempotencyKey = executionId;
        request.workspaceId = opts?.workspaceId;
        request.assistantId = opts?.assistantId;
        request.context = opts?.context;
        this.pendingCredentialRequests.set(executionId, {
          executionId,
          toolId: tool.id,
          toolName: tool.name,
          tool,
          input,
          request,
          credentials: request.missingCredentials.reduce((acc, mc) => ({ ...acc, [mc.key]: undefined }), {}),
          opts,
        });
        await this.saveExecutionRecord({
          executionId,
          idempotencyKey: executionId,
          toolId: tool.id,
          toolName: tool.name,
          input,
          status: 'pending_credentials',
          startedAt,
          workspaceId: opts?.workspaceId,
          assistantId: opts?.assistantId,
          context: opts?.context,
          pendingCredentialRequest: request,
          reconciliation: (opts as any)?.__reconciliation,
          version: 0,
        });
        return new CredentialRequiredError(request);
      }
      if (error instanceof ConfirmationRequiredError) {
        this.events.dispatchOutcomeEvent(
          tool, 'aborted', 'awaiting user confirmation', opts?.workspaceId, opts?.assistantId, executionId,
        );
        this.recordWorkspaceApproval(tool, input, executionId, opts);
        throw error;
      }

      const errorMessage = String(redactSecrets(error instanceof Error ? error.message : String(error), secretValues));
      this.events.dispatchOutcomeEvent(
        tool, 'failed', errorMessage, opts?.workspaceId, opts?.assistantId, executionId,
      );
      logger.error({ executionId, toolId: tool.id, error: errorMessage }, 'Tool execution failed');

      const result: ToolExecution = {
        executionId,
        idempotencyKey: executionId,
        toolId: tool.id,
        toolName: tool.name,
        input,
        error: errorMessage,
        status: 'failed',
        workflowState: this.getWorkflowState(executionId),
        startedAt,
        completedAt,
        workspaceId: opts?.workspaceId,
        assistantId: opts?.assistantId,
        context: opts?.context,
        runtimeWorkflow: workflow ? this.buildRuntimeWorkflow({
          executionId,
          workflow,
          workspaceId: opts?.workspaceId,
          assistantId: opts?.assistantId,
          context: opts?.context,
        }) : undefined,
        reconciliation: (opts as any)?.__reconciliation,
      };
      this.recordWorkspaceExecution(result, tool, opts, workflow);
      await this.saveExecutionRecord({ ...(result as any), version: 0, pendingCredentialRequest: undefined });
      return result;
    }
  }

  async generatePlugin(request: { description: string; requirements?: string[]; context?: Record<string, unknown> }): Promise<{ success: boolean; tool?: Tool; error?: string }> {
    return this.dispatcher.generatePlugin(request);
  }

  async healCodeTool(tool: Tool, input: Record<string, unknown>, errorMessage: string): Promise<{ success: boolean; fixedSourceCode?: string; error?: string }> {
    return this.dispatcher.healCodeTool(tool, input, errorMessage);
  }

registerMCPServer(config: MCPServerConfig): void {
this.mcpServerConfigs.set(config.id, config);
if (config.url) {
this.mcpClients.set(config.id, new MCPHTTPClient(config));
} else {
this.mcpClients.set(config.id, new MCPClient(config));
}
logger.info({ serverId: config.id, name: config.name }, 'MCP server registered');
}

unregisterMCPServer(id: string): void {
const client = this.mcpClients.get(id);
if (client instanceof MCPClient) {
client.disconnect().catch(() => {});
}
this.mcpClients.delete(id);
this.mcpServerConfigs.delete(id);
}

async getCredentialRequest(executionId: string): Promise<CredentialRequest | undefined> {
  const key = this.normalizeExecutionId(executionId) || executionId;
  const pending = this.pendingCredentialRequests.get(key);
  if (pending?.request) return pending.request;
  const record = await this.getExecutionRecord(key);
  return record?.pendingCredentialRequest;
}

async submitCredentials(executionId: string, submission: { credentials: Record<string, string>; storeInVault?: boolean; vaultSecretId?: string; idempotencyKey?: string }): Promise<ToolExecution | CredentialRequiredError> {
  const key = this.normalizeExecutionId(executionId) || executionId;
  let pending = this.pendingCredentialRequests.get(key);
  if (!pending) {
    const record = await this.getExecutionRecord(key);
    if (record?.pendingCredentialRequest) this.restorePendingCredentialRequest(record);
    pending = this.pendingCredentialRequests.get(key);
  }
  if (!pending) {
    const existing = await this.getExecutionRecord(key);
    if (existing && this.isTerminalLifecycle(existing.status)) return this.executionFromRecord(existing);
    throw new Error(`No pending credential request for execution ${key}`);
  }

const resolvedCredentials: Record<string, string> = {};
for (const [key, submittedValue] of Object.entries(submission.credentials)) {
const vaultReference = submittedValue.match(/^vault:\/\/([a-zA-Z0-9._-]+)$/);
if (!vaultReference) {
resolvedCredentials[key] = submittedValue;
continue;
}

const storedValue = await credentialProvider.resolve({ vaultSecretId: vaultReference[1] });
if (storedValue === undefined) {
throw new Error(`Could not resolve the submitted Vault value for credential "${key}"`);
}

let credentialValue = storedValue;
if (storedValue.trimStart().startsWith('{')) {
let bundle: unknown;
try {
bundle = JSON.parse(storedValue) as unknown;
} catch {
throw new Error('The submitted Vault credential bundle is not valid JSON');
}
if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
throw new Error('The submitted Vault credential bundle must be a JSON object');
}
const fieldValue = (bundle as Record<string, unknown>)[key];
if (typeof fieldValue !== 'string') {
throw new Error(`The submitted credential bundle is missing a string value for "${key}"`);
}
credentialValue = fieldValue;
}
resolvedCredentials[key] = credentialValue;
}

this.pendingCredentialOverrides.set(pending.tool.id, resolvedCredentials);

if (submission.storeInVault && submission.vaultSecretId) {
try {
    const vaultUrl = process.env.VAULT_URL || 'http://vault:4000';
    await fetch(`${vaultUrl}/secrets/${submission.vaultSecretId}/encrypt`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ plaintext: JSON.stringify(submission.credentials) }),
});
logger.info({ executionId, vaultSecretId: submission.vaultSecretId }, 'Credentials stored in Vault');
} catch (err) {
logger.warn({ executionId, err: err instanceof Error ? err.message : String(err) }, 'Failed to store credentials in Vault');
}
}

  this.pendingCredentialRequests.delete(key);
  await this.saveExecutionRecord({
    executionId: key,
    idempotencyKey: key,
    toolId: pending.toolId,
    toolName: pending.toolName,
    input: pending.input,
    status: 'in_progress',
    startedAt: new Date(),
    workspaceId: pending.opts?.workspaceId,
    assistantId: pending.opts?.assistantId,
    context: pending.opts?.context,
    version: 0,
  });
  return this.executeOrRequestCredentials(pending.tool, pending.input, undefined, { ...(pending.opts || {}), executionId: key, idempotencyKey: key, resumePending: true });
}

async retryExecution(executionId: string): Promise<ToolExecution | CredentialRequiredError> {
  const key = this.normalizeExecutionId(executionId) || executionId;
  let pending = this.pendingCredentialRequests.get(key);
  if (!pending) {
    const record = await this.getExecutionRecord(key);
    if (record?.pendingCredentialRequest) this.restorePendingCredentialRequest(record);
    pending = this.pendingCredentialRequests.get(key);
  }
  if (!pending) throw new Error(`No pending execution to retry for ${key}`);
  this.pendingCredentialRequests.delete(key);
  await this.saveExecutionRecord({
    executionId: key, idempotencyKey: key, toolId: pending.toolId, toolName: pending.toolName, input: pending.input,
    status: 'in_progress', startedAt: new Date(), workspaceId: pending.opts?.workspaceId, assistantId: pending.opts?.assistantId,
    context: pending.opts?.context, version: 0,
  });
  return this.executeOrRequestCredentials(pending.tool, pending.input, undefined, { ...(pending.opts || {}), executionId: key, idempotencyKey: key, resumePending: true });
}

  private enforceConfirmation(tool: Tool, input: Record<string, unknown>, executionId: string): void {
    const confirmBeforeSend = tool.confirmBeforeSend === true || (tool.manifest?.confirmBeforeSend === true);
    // Every execution re-derives its own gate, so reset the approval marker here
    // rather than letting a previous run's approval leak into this one.
    if (this.nestedExecutionDepth === 0) {
      this.currentExecutionApproved = false;
    }
    if (!confirmBeforeSend) {
      this.setWorkflowState(executionId, 'analysis');
      return;
    }
    const hasDryRun = input.dryRun === true;
    const hasConfirmation = input.confirmation === true;
    if (!hasDryRun && !hasConfirmation) {
      this.setWorkflowState(executionId, 'draft');
      const summary = this.generateApprovalSummary(tool, input);
      logger.info({ executionId, toolId: tool.id, summary }, 'Confirmation required for tool execution');
      throw new ConfirmationRequiredError(tool, summary);
    }
    if (hasConfirmation) {
      this.currentExecutionApproved = true;
      this.transitionTo(executionId, 'approved');
    } else {
      this.setWorkflowState(executionId, 'analysis');
    }
  }

  generateApprovalSummary(tool: Tool, input: Record<string, unknown>): ApprovalSummary {
    const manifest = tool.manifest || {};
    const action = (manifest.action as string) || (manifest.system as string) || tool.name;
    const objectKeys = ['object', 'patient', 'campaign', 'ticket', 'account', 'event', 'lead', 'opportunity'];
    let object: string | undefined;
    for (const key of objectKeys) {
      const val = input[key];
      if (val !== undefined && val !== null && val !== '') {
        object = typeof val === 'string' ? val : JSON.stringify(val);
        break;
      }
    }
    const scope: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (key === 'dryRun' || key === 'confirmation') continue;
      scope[key] = value;
    }
    const confirmBeforeSend = tool.confirmBeforeSend === true || (tool.manifest?.confirmBeforeSend === true);
    const affectedRecords = this.countAffectedRecords(input);
    const expectedSideEffects = this.inferSideEffects(action, input);
    return {
      toolName: tool.name,
      toolId: tool.id,
      action,
      object,
      scope,
      confirmBeforeSend,
      requiresConfirmation: confirmBeforeSend,
      dryRun: input.dryRun === true,
      affectedRecords,
      expectedSideEffects,
    };
  }

  previewAction(tool: Tool, input: Record<string, unknown>): ApprovalSummary {
    return this.generateApprovalSummary(tool, input);
  }

  private countAffectedRecords(input: Record<string, unknown>): number {
    const arrayKeys = ['records', 'items', 'patients', 'patients', 'leads', 'tickets', 'campaigns', 'accounts', 'events', 'opportunities', 'results', 'rows', 'entries', 'records', 'invoices', 'orders'];
    for (const key of arrayKeys) {
      const val = input[key];
      if (Array.isArray(val)) return val.length;
    }
    if (input.operation && (input.operation === 'delete' || input.operation === 'remove' || input.operation === 'update' || input.operation === 'resolve')) {
      return 1;
    }
    return 0;
  }

  private inferSideEffects(action: string, input: Record<string, unknown>): string[] {
    const effects: string[] = [];
    if (input.dryRun === true) {
      effects.push('dry-run: no changes will be persisted');
    }
    const actionLower = action.toLowerCase();
    if (actionLower.includes('create') || actionLower.includes('add') || actionLower.includes('new')) {
      effects.push('creates new record(s)');
    }
    if (actionLower.includes('update') || actionLower.includes('edit') || actionLower.includes('modify')) {
      effects.push('updates existing record(s)');
    }
    if (actionLower.includes('delete') || actionLower.includes('remove') || actionLower.includes('destroy')) {
      effects.push('deletes record(s)');
    }
    if (actionLower.includes('send') || actionLower.includes('dispatch') || actionLower.includes('publish') || actionLower.includes('submit')) {
      effects.push('sends or dispatches to external system');
    }
    if (actionLower.includes('approve') || actionLower.includes('accept') || actionLower.includes('confirm')) {
      effects.push('changes approval state');
    }
    if (actionLower.includes('escalate') || actionLower.includes('flag') || actionLower.includes('alert')) {
      effects.push('triggers notification or escalation');
    }
    if (effects.length === 0) {
      effects.push('executes tool operation');
    }
    return effects;
  }

  private extractContext(input: Record<string, unknown>): string | null {
    for (const key of CONTEXT_KEYS) {
      if (input[key] !== undefined && input[key] !== null && input[key] !== '') {
        const val = input[key];
        if (typeof val === 'string') return `${key}:${val}`;
        if (Array.isArray(val) && val.length > 0) return `${key}:${val.map(String).join(',')}`;
        if (typeof val === 'object') return `${key}:${JSON.stringify(val).slice(0, 60)}`;
      }
    }
    return null;
  }

  private validateSameContext(tool: Tool, input: Record<string, unknown>): void {
    const currentContext = this.extractContext(input);
    if (currentContext && this.activeContextObject && this.activeContextObject !== currentContext) {
      const handoffId = `ho_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.handoffRequests.set(handoffId, {
        id: handoffId,
        sourceContext: this.activeContextObject,
        destinationToolId: tool.id,
        destinationToolName: tool.name,
        objectContext: currentContext,
        status: 'pending',
        createdAt: new Date(),
      });
      logger.error({ activeContext: this.activeContextObject, currentContext, toolId: tool.id, handoffId }, 'Cross-object handoff rejected');
      throw new CrossObjectHandoffError(this.activeContextObject, currentContext, tool.id, handoffId);
    }
    if (currentContext) {
      this.activeContextObject = currentContext;
    }
  }

  requestHandoff(destinationToolId: string, destinationToolName: string, objectContext: string): HandoffRequest {
    const id = `ho_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const request: HandoffRequest = {
      id,
      sourceContext: this.activeContextObject || '',
      destinationToolId,
      destinationToolName,
      objectContext,
      status: 'pending',
      createdAt: new Date(),
    };
    this.handoffRequests.set(id, request);
    return request;
  }

  acceptHandoff(handoffId: string): boolean {
    const request = this.handoffRequests.get(handoffId);
    if (!request || request.status !== 'pending') return false;
    request.status = 'accepted';
    request.decision = 'accepted';
    request.decisionAt = new Date();
    this.activeContextObject = request.objectContext;
    return true;
  }

  rejectHandoff(handoffId: string): boolean {
    const request = this.handoffRequests.get(handoffId);
    if (!request || request.status !== 'pending') return false;
    request.status = 'rejected';
    request.decision = 'rejected';
    request.decisionAt = new Date();
    return true;
  }

  getHandoffRequest(handoffId: string): HandoffRequest | undefined {
    return this.handoffRequests.get(handoffId);
  }

  getHandoffRequests(): HandoffRequest[] {
    return [...this.handoffRequests.values()];
  }

  private readonly stateTransitions: Record<WorkflowState, WorkflowState[]> = {
    analysis: ['recommendation', 'rejected'],
    recommendation: ['draft', 'rejected'],
    draft: ['approved', 'rejected'],
    approved: ['executed', 'rejected'],
    executed: [],
    rejected: ['draft'],
  };

  private setWorkflowState(executionId: string, state: WorkflowState): void {
    this.executionStates.set(executionId, state);
  }

  private getWorkflowState(executionId: string): WorkflowState | undefined {
    return this.executionStates.get(executionId);
  }

  private transitionTo(executionId: string, state: WorkflowState): boolean {
    const current = this.getWorkflowState(executionId);
    if (!current) {
      this.setWorkflowState(executionId, state);
      return true;
    }
    const allowed = this.stateTransitions[current];
    if (allowed && allowed.includes(state)) {
      this.setWorkflowState(executionId, state);
      return true;
    }
    return false;
  }

  private nestedExecutorCallback(): (toolId: string, input: Record<string, unknown>) => Promise<Record<string, unknown>> {
    return async (toolId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> => {
      if (this.nestedExecutionDepth >= MAX_NESTING_DEPTH) {
        return { success: false, error: `Maximum nesting depth (${MAX_NESTING_DEPTH}) exceeded for tool: ${toolId}` };
      }

      const callee = this.resolveNestedTool(toolId);
      if (!callee) {
        const classified = ErrorHandler.classify(`Tool not found: ${toolId}`, toolId);
        return {
          success: false,
          error: classified.userMessage,
          status: 'not-connected',
          classified: { category: classified.category, severity: classified.severity, message: classified.message, userMessage: classified.userMessage, retryable: classified.retryable },
        };
      }
      // Skills are allowed to delegate to lower-order skills. MAX_NESTING_DEPTH is the real
      // recursion guard, so an isSkill check here only disabled the delegation half of every
      // composite skill (the caller swallowed the refusal and still reported success).
      // A represent-tier skill that would really act still needs approval: a dry run is safe to
      // nest, a live one is not.
      // The approval the caller already cleared propagates. The caller only reaches this
      // callback after enforceConfirmation approved it, so re-deriving the requirement here
      // discards a decision the user already made, at a layer they cannot act on, and no
      // gated skill could ever reach a gated callee. With nothing approved the gate stands.
      const needsApproval = callee.confirmBeforeSend === true || callee.manifest?.confirmBeforeSend === true;
      const inheritedApproval = this.currentExecutionApproved;
      if (needsApproval && input.dryRun !== true && !inheritedApproval) {
        return {
          success: false,
          error: `Nested execution requires confirmation for ${callee.id}; run it directly or pass dryRun.`,
        };
      }
      // Carry the approval into the callee so its own enforceConfirmation admits it.
      const calleeInput = inheritedApproval && input.confirmation !== true
        ? { ...input, confirmation: true }
        : input;

      this.nestedExecutionDepth++;
      try {
        const result = await this.executeOrRequestCredentials(callee, calleeInput);
        if (this.isCredentialRequiredError(result)) {
          return { success: false, error: `Credentials required for nested tool: ${callee.name}` };
        }
        const execResult = result as ToolExecution;
        if (execResult.status === 'completed') {
          const output = execResult.output;
          if (output && typeof output.output === 'string') {
            try {
              const parsed = JSON.parse(output.output);
              if (parsed && typeof parsed === 'object') {
                return parsed as Record<string, unknown>;
              }
            } catch {
              // leave as-is if not JSON
            }
          }
          return normalizeNestedPayload(output);
        }
        if (execResult.status === 'failed') {
          return { success: false, error: execResult.error || 'Nested tool execution failed' };
        }
        return { success: false, error: `Nested tool execution returned unexpected status: ${execResult.status}` };
      } catch (error) {
        if (this.isCredentialRequiredError(error)) {
          return { success: false, error: `Credentials required for nested tool: ${callee.name}` };
        }
        if (error instanceof ConfirmationRequiredError) {
          return { success: false, error: `Confirmation required for nested tool: ${callee.name}` };
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: `Nested tool execution failed: ${errorMessage}` };
      } finally {
        this.nestedExecutionDepth--;
        this.pendingCredentialOverrides.delete(callee.id);
      }
    };
  }

  private resolveNestedTool(toolId: string): Tool | undefined {
    if (!this.toolRegistry) return undefined;
    const direct = this.toolRegistry.get(toolId);
    if (direct) return direct;
    for (const tool of this.toolRegistry.values()) {
      if (tool.name === toolId) return tool;
    }
    return undefined;
  }

async discoverMCPTools(serverId?: string): Promise<Map<string, { tool: Tool; serverId: string }>> {
const discovered = new Map<string, { tool: Tool; serverId: string }>();
const servers = serverId ? [serverId] : Array.from(this.mcpServerConfigs.keys());

for (const sid of servers) {
const client = this.mcpClients.get(sid);
if (!client) continue;

try {
const mcpTools = await client.listTools();
for (const mcpTool of mcpTools) {
const tool: Tool = {
id: `${sid}:${mcpTool.name}`,
name: mcpTool.name,
description: mcpTool.description,
type: 'mcp',
manifest: {
server: sid,
capabilities: mcpTool.inputSchema ? Object.keys(mcpTool.inputSchema.properties || {}) : [],
},
inputSchema: mcpTool.inputSchema || { type: 'object', properties: {} },
outputSchema: {},
createdAt: new Date(),
updatedAt: new Date(),
};
discovered.set(tool.id, { tool, serverId: sid });
}
logger.info({ serverId: sid, toolCount: mcpTools.length }, 'MCP tools discovered');
} catch (err) {
logger.error({ serverId: sid, err: (err as Error).message }, 'MCP tool discovery failed');
}
}

return discovered;
}

  /**
   * Build a runtime-visible workflow snapshot for an execution.
   * Includes assistant/workflow identity, active product object, current stage,
   * available/next actions, workflow state, and next step.
   */
  buildRuntimeWorkflow(params: {
    executionId: string;
    workflow: AssistantWorkflow;
    workspaceId?: string;
    assistantId?: string;
    context?: Record<string, unknown>;
    lastResultId?: string;
  }): RuntimeWorkflow {
    const { executionId, workflow, workspaceId, assistantId, context, lastResultId } = params;
    const execState = this.getWorkflowState(executionId);
    const workflowState: WorkflowState = execState || 'analysis';
    const execContext = this.executionContexts.get(executionId) || { workspaceId, assistantId, context };
    const effectiveContext = execContext.context || context || {};
    const skills: RuntimeWorkflowAction[] = workflow.skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      type: skill.type,
      confirmBeforeSend: skill.confirmBeforeSend,
      isSkill: skill.isSkill,
      available: true,
    }));

    const allowedTransitions = this.stateTransitions[workflowState] || [];
    const nextActions = this.deriveNextActions(workflow, workflowState);
    const nextStep = this.deriveNextStep(workflow, workflowState, allowedTransitions);

    return {
      executionId,
      workspaceId: execContext.workspaceId || workspaceId,
      assistantId: execContext.assistantId || assistantId,
      assistant: workflow.assistant,
      productObject: workflow.productObject,
      flow: workflow.flow,
      skills,
      workflowState,
      nextActions,
      allowedTransitions,
      stateHistory: [],
      approvalHistory: [],
      executionHistory: [],
      lastResultId: execContext.workspaceId ? undefined : lastResultId,
      context: { assistant: workflow.assistant, productObject: workflow.productObject, ...effectiveContext },
      nextStep,
      generatedAt: new Date().toISOString(),
    };
  }

  private deriveNextActions(workflow: AssistantWorkflow, workflowState: WorkflowState): string[] {
    const actions: string[] = [];
    for (const skill of workflow.skills) {
      actions.push(skill.name);
    }
    if (workflowState !== 'executed' && workflowState !== 'rejected') {
      actions.push(`transition:${workflowState}`);
    }
    return actions;
  }

  private deriveNextStep(workflow: AssistantWorkflow, workflowState: WorkflowState, allowedTransitions: WorkflowState[]): string | undefined {
    if (workflowState === 'executed') {
      return `Workflow complete for ${workflow.assistant}. Review results and close out.`;
    }
    if (workflowState === 'rejected') {
      return `Workflow rejected for ${workflow.assistant}. Resume from a prior revision to retry.`;
    }
    if (workflow.skills.length > 0) {
      return `Choose a skill for ${workflow.assistant}: ${workflow.skills.map((s) => s.name).join(', ')}`;
    }
    if (allowedTransitions.length > 0) {
      return `Advance workflow state from '${workflowState}' to one of: ${allowedTransitions.join(', ')}`;
    }
    return undefined;
  }

  getExecutionStates(): Map<string, WorkflowState> {
    return new Map(this.executionStates);
  }

  clearExecutionState(executionId: string): boolean {
    return this.executionStates.delete(executionId) && this.executionContexts.delete(executionId);
  }
}