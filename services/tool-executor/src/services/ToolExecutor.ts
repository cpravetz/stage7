import { createContextPolicy } from '../adk';
import { Tool, ToolExecution, WorkflowState, CredentialRequest, CredentialRequiredError, ConfirmationRequiredError, CrossObjectHandoffError, SchemaRecord, ApprovalSummary, HandoffRequest, ExecutionResult, RuntimeWorkflow, RuntimeWorkflowAction } from '../types';
import logger from '../utils/logger';
import { ErrorHandler, ClassifiedError } from '../utils/ErrorHandler';
import { EmailExecutor } from '../executors/EmailExecutor';
import { SearchExecutor } from '../executors/SearchExecutor';
import { CodeExecutor, CodeExecutorCredentials } from '../executors/CodeExecutor';
import { FtpExecutor, FtpExecutionOptions } from '../executors/FtpExecutor';
import { WebhookExecutor, WebhookDispatchOptions } from '../executors/WebhookExecutor';
import { DatabaseExecutor, DatabaseQueryOptions } from '../executors/DatabaseExecutor';
import { FileStorageExecutor, FileStorageOptions } from '../executors/FileStorageExecutor';
import { VendorApiExecutor } from '../executors/VendorApiExecutor';
import { credentialProvider, NamedCredentialSource } from '../services/CredentialProvider';
import { ReasoningExecutor } from '../executors/ReasoningExecutor';
import { WeatherExecutor, WeatherOptions } from '../executors/WeatherExecutor';
import { MathExecutor, MathOptions } from '../executors/MathExecutor';
import { ApiClientExecutor, ApiClientOptions } from '../executors/ApiClientExecutor';
import { DataAnalysisExecutor, DataAnalysisOptions } from '../executors/DataAnalysisExecutor';
import { CalendarExecutor, CalendarOptions } from '../executors/CalendarExecutor';
import { NativeExecutorKey } from '../types';
import { PluginGenerator } from '../services/PluginGenerator';
import { ToolDiscovery } from '../services/ToolDiscovery';
import { MCPClient, MCPHTTPClient, MCPServerConfig } from '../services/MCPClient';
import { allWorkflows } from '../data/skills';
import type { AssistantWorkflow } from '../adk/workflow-common';
import { AssistantWorkspaceManager } from './AssistantWorkspaceManager';
import { TriggerExecutionEngine } from './TriggerExecutionEngine';
import {
  announcedEventIds,
  buildCompletionEvents,
  buildOutcomeEvent,
  completionEventId,
  declaredEventIds,
  isDryRun,
  type StoreWrite,
} from '../adk/events';
import { createInMemoryEventLog, type EventLog } from './EventLog';
import { SkillTrigger } from '../types';
import { validateAgainstOutputSchema, parseToolOutputJson } from '../utils/schemaValidator';

const BRAIN_URL = process.env.BRAIN_URL || 'http://brain:3100';
const HEALING_SYSTEM_PROMPT = `You are a senior engineer debugging a failed code execution. Given the error message, source code, and input that caused the failure, provide a corrected version of the code. Output ONLY a single JSON object with this exact shape: { "sourceCode": "corrected code string", "explanation": "brief explanation of the fix" }`;
const MAX_HEALING_ATTEMPTS = 2;
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
  const failed = raw.isError === true || (raw.error !== undefined && raw.error !== null && raw.error !== '');
  return {
    ...raw,
    success: !failed,
    // Preserve an HTTP status (openapi) rather than overwriting it with a
    // lifecycle word; only supply a status when the callee did not.
    status: 'status' in raw ? raw.status : (failed ? 'failed' : 'ok'),
    data: 'data' in raw ? raw.data : raw,
    error: 'error' in raw ? raw.error : null,
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
  opts?: { workspaceId?: string; assistantId?: string; context?: Record<string, unknown> };
}

export class ToolExecutor {
  private emailExecutor = new EmailExecutor();
  private searchExecutor = new SearchExecutor();
  private codeExecutor = new CodeExecutor();
  private pluginGenerator = new PluginGenerator();
  private toolDiscovery = new ToolDiscovery();
  private ftpExecutor = new FtpExecutor();
  private webhookExecutor = new WebhookExecutor();
  private databaseExecutor = new DatabaseExecutor();
  private fileStorageExecutor = new FileStorageExecutor();
  private vendorApiExecutor = new VendorApiExecutor();
  private reasoningExecutor = new ReasoningExecutor();
  private weatherExecutor = new WeatherExecutor();
  private mathExecutor = new MathExecutor();
  private apiClientExecutor = new ApiClientExecutor();
  private dataAnalysisExecutor = new DataAnalysisExecutor();
  private calendarExecutor = new CalendarExecutor();
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
  /**
   * Event-dispatch runtime. Built lazily because the registry is a mutable Map
   * that the constructor may never receive (tools are registered after boot) —
   * sharing the Map by reference keeps the engine's view current either way.
   */
  private triggerEngine: TriggerExecutionEngine | null = null;
  /** Payload of the most recent emit per event id, so an engine-driven dispatch has something to pass downstream. */
  private recentEventPayloads: Map<string, unknown> = new Map();
  /** Guards against an emit loop: A emits e, B listens to e and re-emits e, A listens to e... */
  private eventDispatchChain: Set<string> = new Set();
  /**
   * Where completed runs are recorded.
   *
   * Injected rather than constructed inline so a test can read back what a run
   * announced, and so the append stays best-effort: a log outage must not be able
   * to fail a run that already changed data.
   */
  private readonly eventLog: EventLog;
  /** Skill id to owning assistant, built on first event and reused thereafter. */
  private skillOwners: Map<string, string> | null = null;

  constructor(
    toolRegistry?: Map<string, Tool>,
    workspaceManager?: AssistantWorkspaceManager,
    eventLog: EventLog = createInMemoryEventLog(),
  ) {
    this.toolRegistry = toolRegistry || null;
    this.workspaceManager = workspaceManager || null;
    this.eventLog = eventLog;
    this.getTriggerEngine();
  }

  private getTriggerEngine(): TriggerExecutionEngine {
    if (!this.triggerEngine) {
      // Same Map instance as toolRegistry when present, so tools registered
      // later are visible without rebuilding the engine.
      this.triggerEngine = new TriggerExecutionEngine(this.toolRegistry || new Map<string, Tool>());
      this.triggerEngine.registerConsumer('event', (toolId, trigger) => this.onEventTrigger(toolId, trigger));
    }
    return this.triggerEngine;
  }

  /**
   * Consumer for `kind: 'event'` triggers. Reached via TriggerExecutionEngine so
   * the declared trigger metadata (not the raw emit call) decides what runs, and
   * the engine's validation still applies.
   */
  private async onEventTrigger(toolId: string, trigger: SkillTrigger): Promise<void> {
    const tool = this.toolRegistry?.get(toolId);
    if (!tool) return;
    const eventId = trigger.kind === 'event' ? trigger.eventId : undefined;
    const payload = eventId ? this.recentEventPayloads.get(eventId) : undefined;
    await this.dispatchEventTrigger(tool, payload);
  }

  /** Every event id a tool announces on completion. Never empty: a run with no
   * declared id still announces the derived completion event for its assistant. */
  private getEmitEventIds(tool: Tool, assistantId?: string): string[] {
    const declared = declaredEventIds(tool);
    return declared.length > 0 ? declared : [completionEventId(assistantId ?? '', tool.id)];
  }

  /**
   * Every tool that subscribes to `eventId` with a machine-readable `eventId` on
   * its trigger. Skills that declare `kind: 'event'` with only prose `on:` text
   * are deliberately excluded: there is no way to match prose to an emit.
   */
  findDownstreamEventTriggers(eventId: string, emitterId?: string): Tool[] {
    if (!this.toolRegistry || !eventId) return [];
    const downstream: Tool[] = [];
    for (const tool of this.toolRegistry.values()) {
      // Never route an event back to the Skill that announced it. A self
      // subscription is a real hazard rather than a theoretical one: it makes
      // the Skill run a second time for a single user action, which for a
      // `represent` Skill means sending the message or filing the application
      // twice.
      if (emitterId !== undefined && tool.id === emitterId) continue;
      const triggers = tool.triggers || [];
      const subscribed = triggers.some(
        (trigger) => trigger.kind === 'event' && trigger.eventId === eventId,
      );
      if (subscribed) downstream.push(tool);
    }
    return downstream;
  }

  /**
   * Run a downstream skill with the upstream result as its input. Resolves
   * rather than rejects on failure: a downstream skill that breaks must not
   * fail the upstream one that triggered it.
   */
  async dispatchEventTrigger(tool: Tool, upstreamData: unknown, workspaceId?: string): Promise<void> {
    // Keyed on the tool alone: a nested re-entry of the same Skill is a cycle
    // whatever ids are involved.
    const chainKey = tool.id;
    if (this.eventDispatchChain.has(chainKey)) {
      logger.warn({ toolId: tool.id }, 'Skipping event dispatch: cycle already in progress');
      return;
    }

    this.eventDispatchChain.add(chainKey);
    try {
      const result = await this.nestedExecutorCallback()(tool.id, { upstreamData, workspaceId });
      if (result && result.success === false) {
        logger.warn(
          { toolId: tool.id, error: result.error },
          'Downstream event-triggered skill reported failure',
        );
      }
    } catch (err) {
      logger.error({ toolId: tool.id, err: err instanceof Error ? err.message : String(err) }, 'Downstream event dispatch threw');
    } finally {
      this.eventDispatchChain.delete(chainKey);
    }
  }

  /**
   * Announce a run that did not complete, so a failure is not silent.
   *
   * `failed` means the run was attempted and broke. `aborted` means it never got
   * that far — awaiting confirmation, missing credentials, invalid config. Both
   * are dispatched to subscribers exactly like a completion, so an Assistant can
   * react to a Skill that did not deliver rather than discovering it downstream.
   */
  private dispatchOutcomeEvent(
    tool: Tool,
    status: 'failed' | 'aborted',
    error: string,
    workspaceId?: string,
    assistantId?: string,
    executionId?: string,
  ): void {
    const owningAssistant = this.owningAssistantId(tool, assistantId);
    const event = buildOutcomeEvent({
      tool,
      assistantId: owningAssistant,
      status,
      error,
      ...(executionId ? { executionId } : {}),
      ...(workspaceId ? { workspaceId } : {}),
      emittedAt: new Date(),
    });

    void this.eventLog.append(event).catch((err) => {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Outcome event log append failed');
    });

    const downstream = this.findDownstreamEventTriggers(event.id, tool.id);
    if (downstream.length === 0) {
      logger.debug({ toolId: tool.id, status, eventId: event.id }, 'No downstream subscribers for outcome event');
      return;
    }

    logger.info(
      { toolId: tool.id, status, eventId: event.id, downstream: downstream.map((t) => t.id) },
      'Dispatching outcome event to downstream skills',
    );
    for (const target of downstream) {
      void this.dispatchEventTrigger(target, { status, error, skillId: tool.id }, workspaceId);
    }
  }

  /**
   * Announce a completed run and fire every downstream subscriber of each outcome.
   *
   * A run announces one event per declared outcome, not one per run. A Skill that
   * books an appointment and sends a confirmation has two changes, and announcing
   * only the first leaves the second invisible to everything watching for it. All
   * events from one run share an `executionId`, so a consumer can tell they came
   * from a single execution.
   *
   * A dry run announces only the derived completion event. It did finish, but the
   * change its declared ids name did not happen, and announcing that anyway is how
   * `finance.report.published` came to fire for reports that were never delivered.
   *
   * Dispatch is fire-and-forget by design: the upstream result is already resolved
   * and the caller must not wait on (or inherit failures from) the chain it just
   * triggered. The same is true of the log write.
   */
  private dispatchUpstreamEvents(
    tool: Tool,
    output: unknown,
    workspaceId?: string,
    assistantId?: string,
    executionId?: string,
    input?: Record<string, unknown>,
    writes?: StoreWrite[],
  ): void {
    const owningAssistant = this.owningAssistantId(tool, assistantId);
    const dryRun = isDryRun(input, output);
    // `writes` is only ever set on a successful run, so a Skill that wrote records
    // and then failed announces nothing. A declared id still wins inside
    // `announcedEventIds`, so curating an event never yields a second, derived one
    // for the same change.
    const { ids, rejected } = announcedEventIds(tool, owningAssistant, output, writes);
    for (const id of rejected) {
      logger.warn(
        { toolId: tool.id, eventId: id },
        'Run reported an emittedEvent the Skill does not declare; dropped so the event graph stays checkable',
      );
    }

    const events = buildCompletionEvents({
      tool,
      assistantId: owningAssistant,
      ...(executionId ? { executionId } : {}),
      ...(workspaceId ? { workspaceId } : {}),
      data: output,
      emittedAt: new Date(),
      derivedOnly: dryRun,
      // A dry run announces completion only, so it must not narrow to the ids.
      ...(dryRun ? {} : { ids }),
    });

    const dispatched = new Set<string>();
    for (const event of events) {
      // Kept for the in-process path: a downstream Skill reads its upstream payload
      // synchronously, right after the upstream finishes.
      this.recentEventPayloads.set(event.id, output);

      void this.eventLog.append(event).catch((err) => {
        logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Event log append failed');
      });

      const downstream = this.findDownstreamEventTriggers(event.id, tool.id);
      if (downstream.length === 0) {
        logger.debug({ toolId: tool.id, eventId: event.id }, 'Event emitted with no downstream subscribers');
        continue;
      }

      logger.info(
        { toolId: tool.id, eventId: event.id, downstream: downstream.map((t) => t.id) },
        'Dispatching event to downstream skills',
      );
      for (const target of downstream) {
        // Two declared ids can share a subscriber; run it once for this execution.
        if (dispatched.has(target.id)) continue;
        dispatched.add(target.id);
        void this.dispatchEventTrigger(target, output, workspaceId);
      }
    }
  }

  /**
   * The assistant a Skill belongs to, used to namespace its derived event id.
   *
   * Ownership, not the assistant that happened to run it: the same Skill can be
   * executed by the watch runner, a scheduled tick, or a user, and a derived event
   * id that changed with the caller would be a different event every time. So the
   * owning workflow is looked up first and the run's assistant id is only a
   * fallback for a Skill that belongs to none.
   */
  private owningAssistantId(tool: Tool, runAssistantId?: string): string {
    if (!this.skillOwners) {
      const owners = new Map<string, string>();
      for (const workflow of allWorkflows) {
        for (const skill of workflow.skills ?? []) {
          if (!owners.has(skill.id)) owners.set(skill.id, workflow.assistant.trim().toLowerCase());
        }
      }
      this.skillOwners = owners;
    }
    return this.skillOwners.get(tool.id) ?? runAssistantId ?? 'unassigned';
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

  async execute(tool: Tool, input: Record<string, unknown>, opts?: { workspaceId?: string; assistantId?: string; context?: Record<string, unknown> }): Promise<ToolExecution> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startedAt = new Date();

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

    logger.info({ executionId, toolId: tool.id, toolName: tool.name, toolType: tool.type, workspaceId: opts?.workspaceId, assistantId: opts?.assistantId }, 'Tool execution started');

    try {
      this.enforceConfirmation(tool, input, executionId);
      this.validateSameContext(tool, input);
      const configResult = this.validateConfigSchema(tool, input, executionId);
      if (configResult) {
        this.dispatchOutcomeEvent(
          tool, 'aborted', 'invalid or incomplete configuration', opts?.workspaceId, opts?.assistantId, executionId,
        );
        return configResult;
      }
      const { resolved, sources } = await this.resolveCredentials(tool, input);
      const output = await this.dispatch(tool, input, { resolved, sources });
      this.pendingCredentialOverrides.delete(tool.id);
      // `dispatch` reports failure as `{ error }` rather than throwing, so a
      // tool that "succeeded" with an error payload must not emit its event.
      if (!output || output.error === undefined) {
        this.dispatchUpstreamEvents(
          tool, output, opts?.workspaceId, opts?.assistantId, executionId, input,
          (output as { storeWrites?: StoreWrite[] } | undefined)?.storeWrites,
        );
      } else {
        this.dispatchOutcomeEvent(
          tool, 'failed', String(output.error), opts?.workspaceId, opts?.assistantId, executionId,
        );
      }
      const completedAt = new Date();

      logger.info({ executionId, toolId: tool.id, status: 'completed' }, 'Tool execution completed');
      this.transitionTo(executionId, 'executed');

      const result: ToolExecution = {
        executionId,
        toolId: tool.id,
        input,
        output,
        status: 'completed',
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
      };
      this.recordWorkspaceExecution(result, tool, opts, workflow);
      return result;
    } catch (error) {
      if (error instanceof ConfirmationRequiredError) {
        this.dispatchOutcomeEvent(
          tool, 'aborted', 'awaiting user confirmation', opts?.workspaceId, opts?.assistantId, executionId,
        );
        throw error;
      }

      const completedAt = new Date();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.dispatchOutcomeEvent(
        tool, 'failed', errorMessage, opts?.workspaceId, opts?.assistantId, executionId,
      );

      logger.error({ executionId, toolId: tool.id, error: errorMessage }, 'Tool execution failed');

      const result: ToolExecution = {
        executionId,
        toolId: tool.id,
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
      };
      this.recordWorkspaceExecution(result, tool, opts, workflow);
      return result;
    }
  }

  async executeOrRequestCredentials(tool: Tool, input: Record<string, unknown>, providedCredentials?: Record<string, string>, opts?: { workspaceId?: string; assistantId?: string; context?: Record<string, unknown> }): Promise<ToolExecution | CredentialRequiredError> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startedAt = new Date();

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

    logger.info({ executionId, toolId: tool.id, toolName: tool.name, toolType: tool.type, workspaceId: opts?.workspaceId, assistantId: opts?.assistantId }, 'Tool execution started');

    if (providedCredentials && Object.keys(providedCredentials).length > 0) {
      this.pendingCredentialOverrides.set(tool.id, providedCredentials);
    }

    try {
      this.enforceConfirmation(tool, input, executionId);
      this.validateSameContext(tool, input);
      const configResult = this.validateConfigSchema(tool, input, executionId);
      if (configResult) {
        this.dispatchOutcomeEvent(
          tool, 'aborted', 'invalid or incomplete configuration', opts?.workspaceId, opts?.assistantId, executionId,
        );
        return configResult;
      }
      const { resolved, sources } = await this.resolveCredentials(tool, input);
      const output = await this.dispatch(tool, input, { resolved, sources });
      this.pendingCredentialOverrides.delete(tool.id);
      // `dispatch` reports failure as `{ error }` rather than throwing, so a
      // tool that "succeeded" with an error payload must not emit its event.
      if (!output || output.error === undefined) {
        this.dispatchUpstreamEvents(
          tool, output, opts?.workspaceId, opts?.assistantId, executionId, input,
          (output as { storeWrites?: StoreWrite[] } | undefined)?.storeWrites,
        );
      } else {
        this.dispatchOutcomeEvent(
          tool, 'failed', String(output.error), opts?.workspaceId, opts?.assistantId, executionId,
        );
      }
      const completedAt = new Date();

      logger.info({ executionId, toolId: tool.id, status: 'completed' }, 'Tool execution completed');
      this.transitionTo(executionId, 'executed');

      const result: ToolExecution = {
        executionId,
        toolId: tool.id,
        input,
        output,
        status: 'completed',
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
      };
      this.recordWorkspaceExecution(result, tool, opts, workflow);
      return result;
    } catch (error) {
      const completedAt = new Date();

      if (error instanceof CredentialRequiredError) {
        this.dispatchOutcomeEvent(
          tool, 'aborted', 'missing credentials', opts?.workspaceId, opts?.assistantId, executionId,
        );
        (error.request as CredentialRequest).workspaceId = opts?.workspaceId;
        (error.request as CredentialRequest).assistantId = opts?.assistantId;
        (error.request as CredentialRequest).context = opts?.context;
        this.pendingCredentialRequests.set(error.request.executionId, {
          executionId: error.request.executionId,
          toolId: error.request.toolId,
          toolName: error.request.toolName,
          tool,
          input,
          request: error.request,
          credentials: error.request.missingCredentials.reduce((acc, mc) => ({ ...acc, [mc.key]: undefined }), {}),
        });
        return error;
      }
      if (error instanceof ConfirmationRequiredError) {
        this.dispatchOutcomeEvent(
          tool, 'aborted', 'awaiting user confirmation', opts?.workspaceId, opts?.assistantId, executionId,
        );
        this.recordWorkspaceApproval(tool, input, executionId, opts);
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.dispatchOutcomeEvent(
        tool, 'failed', errorMessage, opts?.workspaceId, opts?.assistantId, executionId,
      );
      logger.error({ executionId, toolId: tool.id, error: errorMessage }, 'Tool execution failed');

      const result: ToolExecution = {
        executionId,
        toolId: tool.id,
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
      };
      this.recordWorkspaceExecution(result, tool, opts, workflow);
      return result;
    }
  }

async generatePlugin(request: { description: string; requirements?: string[]; context?: Record<string, unknown> }): Promise<{ success: boolean; tool?: Tool; error?: string }> {
return this.pluginGenerator.generate(request);
}

async healCodeTool(tool: Tool, input: Record<string, unknown>, errorMessage: string): Promise<{ success: boolean; fixedSourceCode?: string; error?: string }> {
const manifest = tool.manifest as Record<string, unknown> | undefined;
const sourceCode = (manifest?.sourceCode as string) || '';
if (!sourceCode) {
return { success: false, error: 'No sourceCode to heal' };
}

const userPrompt = `ERROR: ${errorMessage}\n\nINPUT: ${JSON.stringify(input, null, 2)}\n\nCODE:\n${sourceCode}\n\nProvide the corrected code.`;

try {
const response = await fetch(`${BRAIN_URL}/api/brain/complete`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
prompt: userPrompt,
systemPrompt: HEALING_SYSTEM_PROMPT,
options: { temperature: 0.2, maxTokens: 4096 },
}),
});

if (!response.ok) {
const text = await response.text();
return { success: false, error: `Brain returned ${response.status}: ${text.slice(0, 200)}` };
}

const data = await response.json() as { content: string };
const jsonMatch = data.content.match(/\{[\s\S]*\}/);
if (!jsonMatch) {
return { success: false, error: 'LLM response did not contain valid JSON' };
}

const parsed = JSON.parse(jsonMatch[0]);
const fixedSourceCode = parsed.sourceCode as string;
if (!fixedSourceCode || typeof fixedSourceCode !== 'string') {
return { success: false, error: 'LLM response missing sourceCode' };
}

logger.info({ toolId: tool.id, healing: true }, 'Code tool healed by Brain');
return { success: true, fixedSourceCode };
} catch (err) {
const errorMessage = err instanceof Error ? err.message : 'Unknown error';
logger.error({ toolId: tool.id, error: errorMessage }, 'Code healing failed');
return { success: false, error: errorMessage };
}
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

getCredentialRequest(executionId: string): CredentialRequest | undefined {
const pending = this.pendingCredentialRequests.get(executionId);
return pending?.request;
}

async submitCredentials(executionId: string, submission: { credentials: Record<string, string>; storeInVault?: boolean; vaultSecretId?: string }): Promise<ToolExecution | CredentialRequiredError> {
const pending = this.pendingCredentialRequests.get(executionId);
if (!pending) {
throw new Error(`No pending credential request for execution ${executionId}`);
}

this.pendingCredentialOverrides.set(pending.tool.id, submission.credentials);

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

this.pendingCredentialRequests.delete(executionId);

return this.executeOrRequestCredentials(pending.tool, pending.input);
}

async retryExecution(executionId: string): Promise<ToolExecution | CredentialRequiredError> {
const pending = this.pendingCredentialRequests.get(executionId);
if (!pending) {
throw new Error(`No pending execution to retry for ${executionId}`);
}

this.pendingCredentialRequests.delete(executionId);
return this.executeOrRequestCredentials(pending.tool, pending.input);
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
        if (result instanceof CredentialRequiredError) {
          return { success: false, error: `Credentials required for nested tool: ${callee.name}` };
        }
        if (result.status === 'completed') {
          const output = result.output;
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
        if (result.status === 'failed') {
          return { success: false, error: result.error || 'Nested tool execution failed' };
        }
        return { success: false, error: `Nested tool execution returned unexpected status: ${result.status}` };
      } catch (error) {
        if (error instanceof CredentialRequiredError) {
          return { success: false, error: `Credentials required for nested tool: ${callee.name}` };
        }
        if (error instanceof ConfirmationRequiredError) {
          return { success: false, error: `Confirmation required for nested tool: ${callee.name}` };
        }
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
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

  private hasValue(value: unknown): boolean {
    return value !== undefined && value !== null && value !== '';
  }

  private isCredentialField(field: string): boolean {
    return ['token', 'accessToken', 'apiKey', 'api_key', 'username', 'password', 'secret', 'clientSecret'].includes(field);
  }

  private getNestedValue(config: Record<string, unknown> | undefined, path: string): unknown {
    return path.split('.').reduce<unknown>((value, key) => {
      if (!value || typeof value !== 'object') return undefined;
      return (value as Record<string, unknown>)[key];
    }, config);
  }

  private isConfigured(tool: Tool, field: string, input: Record<string, unknown>): boolean {
    if (field === 'confirmBeforeSend') return true;

    const manifest = tool.manifest as Record<string, unknown> | undefined;
    const externalConfig = tool.externalConfig as Record<string, unknown> | undefined;
    const manifestConfig = manifest?.config as Record<string, unknown> | undefined;
    const directValue = input[field] ?? externalConfig?.[field] ?? manifestConfig?.[field] ?? manifest?.[field];
    if (this.hasValue(directValue)) return true;

    if (field === 'baseUrl' || field === 'endpoint' || field === 'endpointUrl') {
      const endpoint = manifest?.endpoint as Record<string, unknown> | undefined;
      // The endpoint config field is named by the Skill, so it is resolved from
      // configuration rather than guessed from an environment variable name.
      const endpointConfigKey = manifest?.endpointConfigKey;
      const configEndpoint = typeof endpointConfigKey === 'string'
        ? this.getNestedValue(externalConfig, endpointConfigKey)
        : undefined;
      return this.hasValue(endpoint?.url)
        || this.hasValue(endpoint?.path)
        || this.hasValue(configEndpoint)
        || this.hasValue(input.endpointUrl)
        || this.hasValue(input.baseUrl);
    }

    if (this.isCredentialField(field)) {
      const credentialSource = manifest?.credentialSource as Record<string, { envVar?: string; configKey?: string; vaultSecretId?: string }> | undefined;
      const source = credentialSource?.[field];
      // An `envVar` credential source is a deliberate deployment-level binding and
      // is still honoured; a config field is not backed by a guessed env var name.
      const envValue = source?.envVar ? process.env[source.envVar] : undefined;
      const configValue = source?.configKey ? this.getNestedValue(externalConfig, source.configKey) : undefined;
      return this.hasValue(envValue) || this.hasValue(configValue);
    }

    // No environment fallback: a required config field counts as configured only
    // when it is actually present in input, the Skill's external configuration,
    // or its manifest config. Deriving an env var name from the field name would
    // make a field silently satisfiable by an unrelated deployment variable.
    return false;
  }

  private hasEndpoint(tool: Tool, input: Record<string, unknown>): boolean {
    const manifest = tool.manifest as Record<string, unknown> | undefined;
    const endpoint = manifest?.endpoint as Record<string, unknown> | undefined;
    const externalConfig = tool.externalConfig as Record<string, unknown> | undefined;
    const endpointConfigKey = manifest?.endpointConfigKey;
    // Which config field holds the endpoint is declared by the Skill, so it is
    // looked up by name instead of derived from a process environment variable.
    const configEndpoint = typeof endpointConfigKey === 'string'
      ? this.getNestedValue(externalConfig, endpointConfigKey)
      : undefined;
    return this.hasValue(endpoint?.url)
      || this.hasValue(endpoint?.path)
      || this.hasValue(configEndpoint)
      || this.hasValue(input.endpointUrl)
      || this.hasValue(input.baseUrl)
      || this.hasValue(externalConfig?.baseUrl);
  }

  private validateConfigSchema(tool: Tool, input: Record<string, unknown>, executionId: string): ToolExecution | null {
    const configSchema = tool.configSchema || (tool.manifest?.configSchema as SchemaRecord | undefined);
    const isExternalAction = (tool.manifest?.system !== undefined && tool.manifest?.action !== undefined);
    const required = Array.isArray(configSchema?.required)
      ? configSchema.required.filter((field): field is string => typeof field === 'string')
      : [];
    const missing = required.filter((field) => !this.isConfigured(tool, field, input));

    if (isExternalAction && !this.hasEndpoint(tool, input) && !missing.includes('endpoint')) {
      missing.push('endpoint');
    }

    if (missing.length === 0) return null;

    const prefix = isExternalAction ? 'Not connected' : 'Missing required config';
    return {
      executionId,
      toolId: tool.id,
      input,
      error: `${prefix}: required config fields missing: ${missing.join(', ')}`,
      status: 'failed',
      startedAt: new Date(),
      completedAt: new Date(),
    };
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

private async resolveCredentials(tool: Tool, _input: Record<string, unknown>): Promise<{ resolved: Record<string, string | undefined>; sources: NamedCredentialSource[] }> {
const manifest = tool.manifest as Record<string, unknown> | undefined;
// A credential declared with `configKey` resolves against the Skill's own
// configuration, so the provider needs the resolved values.
const configuredValues = this.resolveSkillConfig(tool, _input);
const credentialSources: Array<{ logicalKey: string; label?: string; required: boolean; source: { vaultSecretId?: string; envVar?: string; configKey?: string } }> = [];

if (manifest?.credentialSource && typeof manifest.credentialSource === 'object') {
const cs = manifest.credentialSource as Record<string, { vaultSecretId?: string; envVar?: string; configKey?: string; label?: string; required?: boolean }>;
for (const [logicalKey, source] of Object.entries(cs)) {
if (source && typeof source === 'object') {
const s = source as { vaultSecretId?: string; envVar?: string; configKey?: string; label?: string; required?: boolean };
// A declared `label` is what the operator sees when a credential is missing, so
// it should say where the value goes rather than repeating the logical key.
// `required` defaults to true: declaring a credential has always meant the
        // Skill cannot run without it, and only Skills that can genuinely degrade
        // should opt out.
        credentialSources.push({ logicalKey, label: s.label || logicalKey, required: s.required !== false, source: s });
}
}
}

const namedSources: NamedCredentialSource[] = credentialSources.map(c => ({
logicalKey: c.logicalKey,
vaultSecretId: c.source.vaultSecretId,
envVar: c.source.envVar,
configKey: c.source.configKey,
}));
const resolved = await credentialProvider.resolveAll(namedSources, configuredValues);

const overrides = this.pendingCredentialOverrides.get(tool.id) || {};
const merged = { ...resolved, ...overrides };

const missing = credentialSources
.filter((c) => c.required && !merged[c.logicalKey])
.map((c) => ({
key: c.logicalKey,
label: c.label || c.logicalKey,
source: c.source,
}));

if (missing.length > 0) {
const request: CredentialRequest = {
executionId: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
toolId: tool.id,
toolName: tool.name,
missingCredentials: missing,
message: `Tool "${tool.name}" requires credentials: ${missing.map((m) => m.label).join(', ')}`,
};
throw new CredentialRequiredError(request);
}

return { resolved: merged, sources: namedSources };
}

/**
   * Resolved Skill configuration, using the same precedence as `isConfigured` so
   * the gate and the value a handler reads can never disagree.
   *
   * configSchema used to be a presence check only: the values were validated for
   * existence and then dropped, so a scheduled Skill could declare a required
   * selector (e.g. which genres to monitor) and have no way to read it. That made
   * configSchema indistinguishable from the "schema demands a value the handler
   * never reads" defect. Values declared per-run in `input` still win, because
   * that is how a one-off override has always been expressed.
   */
  private resolveSkillConfig(tool: Tool, input: Record<string, unknown>): Record<string, unknown> {
    const manifest = tool.manifest as Record<string, unknown> | undefined;
    const sources: Array<Record<string, unknown> | undefined> = [
      tool.externalConfig as Record<string, unknown> | undefined,
      manifest?.config as Record<string, unknown> | undefined,
    ];
    const config: Record<string, unknown> = {};
    for (const source of sources) {
      if (!source || typeof source !== 'object') continue;
      for (const [key, value] of Object.entries(source)) config[key] = value;
    }
    // A declared credentialSource maps a logical config key to a nested path.
    const credentialSource = manifest?.credentialSource as { [k: string]: { configKey?: string } } | undefined;
    if (credentialSource && typeof credentialSource === 'object') {
      for (const spec of Object.values(credentialSource)) {
        if (!spec?.configKey) continue;
        const nested = this.getNestedValue(tool.externalConfig as Record<string, unknown> | undefined, spec.configKey);
        if (nested !== undefined && config[spec.configKey.split('.').pop() as string] === undefined) {
          config[spec.configKey.split('.').pop() as string] = nested;
        }
      }
    }
    // Per-run input fills gaps only. A key the operator declared in configSchema
    // stays operator-owned: input is caller-supplied, so letting it win would let
    // any API caller replace the selector or endpoint that scoped the job. This
    // matches the rule the runtime documents for why config is a separate object
    // from input at all.
    const declared = new Set(Object.keys((manifest?.configSchema as { properties?: Record<string, unknown> } | undefined)?.properties ?? {}));
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      if (declared.has(key)) continue;
      config[key] = value;
    }
    return config;
  }

  private async dispatch(tool: Tool, input: Record<string, unknown>, credentials: { resolved: Record<string, string | undefined>; sources: NamedCredentialSource[] }): Promise<Record<string, unknown>> {
const { resolved, sources } = credentials;
const name = tool.name.toLowerCase();
const manifest = tool.manifest as Record<string, unknown> | undefined;
const capabilities = Array.isArray(manifest?.capabilities) ? manifest.capabilities as string[] : [];


  // === Explicit native executor binding (checked BEFORE name heuristics) ===
  const executorKey = manifest?.executor as NativeExecutorKey | undefined;
  if (executorKey) {
    // Input normalization: shallow-copy input and add camelCase aliases for snake_case keys
    const normalizedInput: Record<string, unknown> = { ...input };
    for (const key of Object.keys(input)) {
      if (key.includes('_')) {
        const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        if (camelKey !== key) {
          normalizedInput[camelKey] = input[key];
        }
      }
    }

    try {
      let result: { success: boolean; error?: string; durationMs?: number } | undefined;
      switch (executorKey) {
        case 'weather': {
          result = await this.weatherExecutor.execute(normalizedInput as unknown as WeatherOptions, resolved);
          break;
        }
        case 'math': {
          result = await this.mathExecutor.execute(normalizedInput as MathOptions, resolved);
          break;
        }
        case 'search': {
          result = await this.searchExecutor.execute(normalizedInput as { query: string; maxResults?: number; searchType?: 'web' | 'images' | 'news'; freshness?: 'day' | 'week' | 'month' | 'year' }, resolved);
          break;
        }
        case 'files': {
          result = await this.fileStorageExecutor.execute(normalizedInput as { operation: 'read' | 'write' | 'list' | 'delete' | 'exists' | 'mkdir'; path: string; content?: string; bucket?: string }, resolved);
          break;
        }
        case 'ftp': {
          result = await this.ftpExecutor.execute(normalizedInput as { host: string; port: number; username: string; password: string; operation: 'list' | 'upload' | 'download' | 'delete' | 'mkdir'; remotePath?: string; localPath?: string; content?: string }, resolved);
          break;
        }
        case 'webhook': {
          result = await this.webhookExecutor.execute(normalizedInput as { url: string; method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; headers?: Record<string, string>; body?: Record<string, unknown>; secret?: string; event?: string; retries?: number; timeoutMs?: number }, resolved);
          break;
        }
        case 'database': {
          result = await this.databaseExecutor.execute(normalizedInput as { engine: 'sqlite' | 'postgres' | 'mysql'; connectionString?: string; host?: string; port?: number; database?: string; username?: string; password?: string; query: string; params?: unknown[]; timeoutMs?: number }, resolved);
          break;
        }
        case 'email': {
          result = await this.emailExecutor.execute(normalizedInput as { to: string | string[]; subject: string; text?: string; html?: string; from?: string; attachments?: Array<{ filename?: string; content?: string | Buffer; path?: string }> }, resolved);
          break;
        }
        case 'vendor': {
          const vendor = manifest?.vendor as 'jira' | 'confluence' | 'slack' | 'github' | undefined;
          if (!vendor) {
            return { error: 'vendor executor requires manifest.vendor to be one of: jira, confluence, slack, github' };
          }
          result = await this.vendorApiExecutor.execute(
            { vendor, operation: (normalizedInput.operation as string) || 'query', input: normalizedInput },
            resolved,
          );
          break;
        }
        case 'data_analysis': {
          result = await this.dataAnalysisExecutor.execute(normalizedInput as { dataset: string | Array<Record<string, unknown>>; analysisType?: 'summary' | 'trend' | 'correlation' | 'distribution'; xColumn?: string; yColumn?: string; targetColumn?: string; topValuesLimit?: number }, resolved);
          break;
        }
        case 'calendar': {
          result = await this.calendarExecutor.execute(normalizedInput as { action: 'create' | 'update' | 'list' | 'delete' | 'check_availability' | 'export'; calendarPath?: string; summary?: string; start?: string; end?: string; durationMinutes?: number; attendees?: Array<{ email: string; name?: string }>; uid?: string; rangeStart?: string; rangeEnd?: string; windowStart?: string; windowEnd?: string; slotMinutes?: number; busy?: Array<{ attendee?: string; start: string; end: string }> }, resolved);
          break;
        }
        case 'api_client': {
          result = await this.apiClientExecutor.execute(normalizedInput as { path: string; method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'; query?: Record<string, string | number | boolean>; headers?: Record<string, string>; body?: unknown; timeoutMs?: number; auth?: 'none' | 'bearer' | 'basic' | 'apiKeyHeader'; acceptErrorResponses?: boolean }, resolved);
          break;
        }
        default: {
          // Unknown executor key - fall through to legacy heuristics
        }
      }

      if (result && typeof result === 'object' && 'success' in result) {
        if (!result.success) {
          return { error: result.error };
        }
        // Return success result with data fields and durationMs where available
        const { success, error, durationMs, ...data } = result;
        return { ...data, ...(durationMs !== undefined ? { durationMs } : {}) };
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error({ toolId: tool.id, executorKey, error }, 'Native executor failed');
      return { error };
    }
  }
  // If no executorKey, fall through to existing heuristic-based dispatch
if (tool.type === 'code' || manifest?.language) {
const language = (manifest?.language as string) || 'javascript';
const sourceCode = (manifest?.sourceCode as string) || '';
//const entrypoint = (manifest?.entrypoint as string) || 'index.js';

if (!sourceCode) {
return { error: 'Code tool is missing sourceCode in manifest' };
}

let codeToRun = sourceCode;
let healingAttempts = 0;
let lastError: string | undefined;

while (healingAttempts <= MAX_HEALING_ATTEMPTS) {
  const result = await this.codeExecutor.execute(
        { language: language as 'javascript' | 'typescript' | 'python', code: codeToRun, input, config: this.resolveSkillConfig(tool, input), credentials: credentials.resolved, executorCallback: this.nestedExecutorCallback(), timeoutMs: (manifest && typeof manifest === 'object' && (manifest as Record<string, unknown>).timeoutMs) as number | undefined, persistenceEnvVar: (manifest && typeof manifest === 'object' ? (manifest as Record<string, unknown>).persistenceEnvVar : undefined) as string | undefined },
        { resolved, sources } as CodeExecutorCredentials,
      );

if (result.success) {
if (healingAttempts > 0 && manifest && typeof manifest === 'object') {
(manifest as Record<string, unknown>).sourceCode = codeToRun;
logger.info({ toolId: tool.id, healingAttempts }, 'Healed code persisted to tool manifest');
}
// Hold code tools to their declared outputSchema. A skill that promises a contract and emits
// something else was previously indistinguishable from one that kept it.
const schemaIssues = validateAgainstOutputSchema(
parseToolOutputJson(result.output),
tool.outputSchema,
);
if (schemaIssues.length > 0) {
logger.error(
{ toolId: tool.id, issues: schemaIssues },
'Tool result does not match its declared outputSchema',
);
}
return {
output: result.output,
exitCode: result.exitCode ?? 0,
durationMs: result.durationMs,
...(result.storeWrites ? { storeWrites: result.storeWrites } : {}),
...(schemaIssues.length > 0 ? { outputSchemaIssues: schemaIssues } : {}),
};
}

lastError = result.error;
    if (healingAttempts >= MAX_HEALING_ATTEMPTS) break;

    // Classify the error — if it's a code execution error, try healing.
    // If it's a timeout or transient error, also try healing.
    const classified = ErrorHandler.classify(lastError, tool.id);

    if (ErrorHandler.isCodeExecutionError(classified)) {
      const healing = await this.healCodeTool(tool, input, lastError || 'Unknown execution error');
      if (!healing.success || !healing.fixedSourceCode) {
        logger.warn({ toolId: tool.id, healingError: healing.error, classified: classified.category }, 'Healing failed, aborting retries');
        break;
      }

      codeToRun = healing.fixedSourceCode;
      healingAttempts++;
      logger.info({ toolId: tool.id, attempt: healingAttempts, category: classified.category }, 'Retrying with healed code');
      continue;
    }

    // Non-code-execution error — don't heal, return classified error
    logger.warn({ toolId: tool.id, classified: classified.category, severity: classified.severity }, 'Non-healable error, returning classified result');
    return ErrorHandler.formatResult(classified);
  }

  // All healing attempts exhausted — return classified error
  const finalClassified = ErrorHandler.classify(lastError, tool.id);
  logger.warn({ toolId: tool.id, attempts: healingAttempts, classified: finalClassified.category }, 'Healing exhausted, returning classified error');
  return ErrorHandler.formatResult(finalClassified);
}

switch (tool.type) {
case 'openapi': {
if (!manifest?.urlTemplate) break;
const urlTemplate = manifest.urlTemplate as string;
const method = ((manifest?.method as string) || 'GET').toUpperCase();
const url = urlTemplate.replace(/\{(\w+)\}/g, (_, key) => encodeURIComponent((input[key] as string) || key));

// SSRF guard: validate the resolved URL
let targetUrl: URL;
try {
  targetUrl = new URL(url);
} catch {
  return { error: `Invalid URL template: ${urlTemplate}` };
}
if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
  return { error: `URL must use http or https, got ${targetUrl.protocol}` };
}
if (targetUrl.username || targetUrl.password) {
  return { error: 'URL must not embed credentials' };
}
const hostname = targetUrl.hostname.toLowerCase();
if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
  return { error: 'Requests to localhost/internal hosts are not allowed' };
}
if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
  const parts = hostname.split('.').map(Number);
  if (parts.some((p) => p > 255)) return { error: 'Invalid IP address' };
  if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return { error: 'Requests to private IP ranges are not allowed' };
  if (parts[0] === 192 && parts[1] === 168) return { error: 'Requests to private IP ranges are not allowed' };
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return { error: 'Requests to private IP ranges are not allowed' };
  if (parts[0] === 169 && parts[1] === 254) return { error: 'Requests to link-local addresses are not allowed' };
}

const fetchOptions: RequestInit = {
method,
headers: {
'Content-Type': 'application/json',
...(resolved.Authorization ? { Authorization: resolved.Authorization } : {}),
...(resolved['api-key'] ? { 'api-key': resolved['api-key'] } : {}),
...(manifest.headers as Record<string, string> || {}),
},
};

if (method !== 'GET' && method !== 'HEAD' && input.body !== undefined) {
fetchOptions.body = JSON.stringify(input.body);
}

let response: Response | null = null;
let data: any;
try {
// Manual redirect handling to prevent SSRF via redirect
let currentUrl = url;
const maxRedirects = 5;
for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
  response = await fetch(currentUrl, {
    ...fetchOptions,
    redirect: 'manual',
  });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location || redirectCount >= maxRedirects) {
      break;
    }
    let nextUrl: URL;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      break;
    }
    // SSRF guard: redirect must not go to private/internal addresses
    const nextHostname = nextUrl.hostname.toLowerCase();
    if (nextHostname === 'localhost' || nextHostname.endsWith('.localhost') || nextHostname.endsWith('.local') || nextHostname.endsWith('.internal')) {
      logger.warn({ from: currentUrl, to: nextUrl.toString() }, 'OpenAPI redirect rejected: localhost/internal host');
      return { error: 'Redirect to localhost/internal host not allowed' };
    }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(nextHostname)) {
      const parts = nextHostname.split('.').map(Number);
      if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 169 && parts[1] === 254)) {
        logger.warn({ from: currentUrl, to: nextUrl.toString() }, 'OpenAPI redirect rejected: private IP range');
        return { error: 'Redirect to private IP range not allowed' };
      }
    }
    currentUrl = nextUrl.toString();
    continue;
  }
  break;
}
} catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ url, err: errMsg }, 'OpenAPI fetch failed');
      return { error: `Request failed: ${errMsg}` };
    }

    try {
      if (!response) {
        data = { text: '' };
      } else if ((response as any).bodyUsed) {
        try {
          const txt = await (response as any).text();
          try {
            data = JSON.parse(txt);
          } catch {
            data = { text: txt };
          }
        } catch {
          data = { text: '' };
        }
      } else {
        try {
          data = await response.json();
        } catch (jsonErr) {
          try {
            const txt = await response.text();
            try {
              data = JSON.parse(txt);
            } catch {
              data = { text: txt };
            }
          } catch {
            data = { text: '' };
          }
        }
      }
      return { status: response ? response.status : 0, data };
    } catch {
      data = { text: await (response ? response.text() : Promise.resolve('')) };
      return { status: response ? response.status : 0, data };
    }
  }

  case 'mcp': {
if (!manifest?.server) break;
const serverId = manifest.server as string;
const client = this.mcpClients.get(serverId);
if (!client) {
return { error: `MCP server '${serverId}' not configured. Register it via registerMCPServer().` };
}

try {
const result = await client.callTool(tool.name, input);
return {
content: result.content,
isError: result.isError,
};
} catch (err) {
return { error: `MCP tool execution failed: ${(err as Error).message}` };
}
}
case 'reasoning': {
const result = await this.reasoningExecutor.execute(tool, input);
return result;
}
default:
break;
}

if (name.includes('ftp')) {
const result = await this.ftpExecutor.execute(
{
host: (input.host as string) || '',
port: (input.port as number) || 21,
username: (input.username as string) || '',
password: (input.password as string) || '',
operation: (input.operation as FtpExecutionOptions['operation']) || 'list',
remotePath: input.remotePath as string,
localPath: input.localPath as string,
content: input.content as string,
},
resolved,
);

if (!result.success) {
return { error: result.error };
}

return { output: result.output, durationMs: result.durationMs };
}

if (name.includes('webhook')) {
const result = await this.webhookExecutor.execute(
{
url: (input.url as string) || '',
method: (input.method as WebhookDispatchOptions['method']) || 'POST',
headers: input.headers as Record<string, string>,
body: input.body as Record<string, unknown>,
secret: input.secret as string,
event: input.event as string,
retries: (input.retries as number) || 3,
timeoutMs: (input.timeoutMs as number) || 10000,
},
resolved,
);

if (!result.success) {
return { error: result.error };
}

return { statusCode: result.statusCode, response: result.response, durationMs: result.durationMs };
}

if (name.includes('database') || name.includes('db') || capabilities.includes('query')) {
const result = await this.databaseExecutor.execute(
{
engine: (input.engine as DatabaseQueryOptions['engine']) || 'sqlite',
connectionString: input.connectionString as string,
host: input.host as string,
port: input.port as number,
database: input.database as string,
username: input.username as string,
password: input.password as string,
query: (input.query as string) || '',
params: input.params as unknown[],
timeoutMs: (input.timeoutMs as number) || 30000,
},
resolved,
);

if (!result.success) {
return { error: result.error };
}

return { rows: result.rows, columns: result.columns, rowCount: result.rowCount, durationMs: result.durationMs };
}

if (name.includes('file') || name.includes('storage') || capabilities.includes('read') || capabilities.includes('write')) {
const result = await this.fileStorageExecutor.execute(
{
operation: (input.operation as FileStorageOptions['operation']) || 'read',
path: (input.path as string) || '',
content: input.content as string,
bucket: input.bucket as string,
},
resolved,
);

if (!result.success) {
return { error: result.error };
}

return { data: result.data, durationMs: result.durationMs };
}

if (name.includes('jira') || name.includes('confluence') || name.includes('slack') || name.includes('github')) {
const vendor = name.includes('jira') ? 'jira' :
 name.includes('confluence') ? 'confluence' :
 name.includes('slack') ? 'slack' : 'github';

const result = await this.vendorApiExecutor.execute(
{
vendor,
operation: (input.operation as string) || 'query',
input,
},
resolved,
);

if (!result.success) {
return { error: result.error };
}

return { data: result.data, durationMs: result.durationMs };
}

if (name.includes('email') || manifest?.server === 'email-mcp' || capabilities.includes('send')) {
const result = await this.emailExecutor.execute(
{
to: (input.to as string | string[]) || '',
subject: (input.subject as string) || '',
text: (input.body as string) || (input.text as string),
html: (input.html as string),
from: (input.from as string),
attachments: (input.attachments as Array<{ filename?: string; content?: string | Buffer; path?: string }>) || [],
},
resolved,
);

if (!result.success) {
return { error: result.error };
}

return { messageId: result.messageId, status: 'sent' };
}

if (name.includes('search') || name.includes('query') || capabilities.includes('search')) {
const result = await this.searchExecutor.execute(
{
query: (input.query as string) || (input.q as string) || '',
maxResults: (input.maxResults as number) || (input.max_results as number) || 10,
searchType: (input.searchType as 'web' | 'images' | 'news') || 'web',
    freshness: (input.freshness as 'day' | 'week' | 'month' | 'year') || undefined,
},
resolved,
);

if (!result.success) {
return { error: result.error };
}

return { results: result.results, count: result.results?.length ?? 0 };
}

const discovered = await this.toolDiscovery.discoverAndRegister(tool.name + ' ' + tool.description, {
register: (t: Tool) => {
if (this.toolRegistry) {
this.toolRegistry.set(t.id, t);
}
},
});

if (discovered) {
logger.info({ toolId: discovered.id, source: (discovered.manifest as Record<string, unknown>)?.source }, 'External tool discovered');
return {
status: 'discovered',
toolId: discovered.id,
source: (discovered.manifest as Record<string, unknown>)?.source as string,
packageName: (discovered.manifest as Record<string, unknown>)?.packageName as string,
installCommand: (discovered.manifest as Record<string, unknown>)?.installCommand as string,
message: `Discovered external tool: ${discovered.name}. Install it to use this capability.`,
requiresInstallation: true,
};
}

const generated = await this.pluginGenerator.generate({
description: tool.description || `Tool: ${tool.name}`,
requirements: [],
context: { toolName: tool.name, input },
});

if (generated.success && generated.tool) {
try {
const deployed = await this.pluginGenerator.deploy(generated.tool);
if (deployed.success) {
logger.info({ toolId: generated.tool.id, deployPath: deployed.deployPath }, 'Auto-generated plugin deployed');
  const retryResult = await this.codeExecutor.execute(
        { language: 'javascript', code: (generated.tool.manifest as Record<string, unknown>)?.sourceCode as string || '', input, executorCallback: this.nestedExecutorCallback(), timeoutMs: (generated.tool.manifest as Record<string, unknown>) && (generated.tool.manifest as Record<string, unknown>).timeoutMs as number | undefined, persistenceEnvVar: (generated.tool.manifest as Record<string, unknown>)?.persistenceEnvVar as string | undefined },
        { resolved, sources } as CodeExecutorCredentials,
      );
if (retryResult.success) {
return {
output: retryResult.output,
exitCode: retryResult.exitCode ?? 0,
durationMs: retryResult.durationMs,
autoGenerated: true,
...(retryResult.storeWrites ? { storeWrites: retryResult.storeWrites } : {}),
};
}
return { error: retryResult.error, exitCode: -1, autoGenerated: true };
}
} catch (deployErr) {
logger.warn({ toolId: generated.tool.id, err: deployErr instanceof Error ? deployErr.message : String(deployErr) }, 'Auto-deployment failed');
}
}

return {
    error: `Unsupported tool type: ${tool.type}. Register a real executor or MCP server for this tool.`,
    toolName: tool.name,
  };
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
