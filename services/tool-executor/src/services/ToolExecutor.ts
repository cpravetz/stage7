import { Tool, ToolExecution, WorkflowState, CredentialRequest, CredentialRequiredError, ConfirmationRequiredError, CrossObjectHandoffError, SchemaRecord, ApprovalSummary, HandoffRequest, ExecutionResult, RuntimeWorkflow, RuntimeWorkflowAction, RuntimeWorkflowStage } from '../types';
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
import { PluginGenerator } from '../services/PluginGenerator';
import { ToolDiscovery } from '../services/ToolDiscovery';
import { MCPClient, MCPHTTPClient, MCPServerConfig } from '../services/MCPClient';
import { allWorkflows } from '../data/skills';
import type { AssistantWorkflow } from '../data/skills/workflow-common';
import { AssistantWorkspaceManager } from './AssistantWorkspaceManager';

const BRAIN_URL = process.env.BRAIN_URL || 'http://brain:3100';
const HEALING_SYSTEM_PROMPT = `You are a senior engineer debugging a failed code execution. Given the error message, source code, and input that caused the failure, provide a corrected version of the code. Output ONLY a single JSON object with this exact shape: { "sourceCode": "corrected code string", "explanation": "brief explanation of the fix" }`;
const MAX_HEALING_ATTEMPTS = 2;
const MAX_NESTING_DEPTH = 4;

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
  private mcpClients = new Map<string, MCPClient | MCPHTTPClient>();
  private mcpServerConfigs = new Map<string, MCPServerConfig>();
  private pendingCredentialRequests = new Map<string, PendingCredentialRequest>();
  private pendingCredentialOverrides = new Map<string, Record<string, string>>();
  private nestedExecutionDepth = 0;
  private activeContextObject: string | null = null;
  private executionStates: Map<string, WorkflowState> = new Map();
  private toolRegistry: Map<string, Tool> | null = null;
  private handoffRequests = new Map<string, HandoffRequest>();
  private executionContexts = new Map<string, { workspaceId?: string; assistantId?: string; context?: Record<string, unknown> }>();
  private workspaceManager: AssistantWorkspaceManager | null = null;

  constructor(toolRegistry?: Map<string, Tool>, workspaceManager?: AssistantWorkspaceManager) {
    this.toolRegistry = toolRegistry || null;
    this.workspaceManager = workspaceManager || null;
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

  private getWorkflowStage(tool: Tool): string | undefined {
    const stage = tool.manifest?.workflowStage;
    return typeof stage === 'string' ? stage : undefined;
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
          this.getWorkflowStage(tool) || workflow.stages[0]?.name,
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
        {
          context: opts.context,
          initialStage: this.getWorkflowStage(tool) || workflow.stages[0]?.name,
        },
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
      const stage = this.getWorkflowStage(tool);
      if (stage && workflow.stages.some((candidate) => candidate.name === stage)) {
        this.workspaceManager.updateStage(opts.workspaceId, stage);
      }
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
        return configResult;
      }
      const { resolved, sources } = await this.resolveCredentials(tool, input);
      const output = await this.dispatch(tool, input, { resolved, sources });
      this.pendingCredentialOverrides.delete(tool.id);
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
        throw error;
      }

      const completedAt = new Date();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

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
        return configResult;
      }
      const { resolved, sources } = await this.resolveCredentials(tool, input);
      const output = await this.dispatch(tool, input, { resolved, sources });
      this.pendingCredentialOverrides.delete(tool.id);
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
        this.recordWorkspaceApproval(tool, input, executionId, opts);
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
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
    const contextKeys = ['patient', 'patientId', 'targetRole', 'targetRoles', 'jobId', 'jobIds', 'jobTitle', 'campaign', 'campaignId', 'ticket', 'ticketId', 'ticket', 'case', 'matter', 'lead', 'opportunity', 'event', 'eventId', 'object', 'context', 'operation'];
    for (const key of contextKeys) {
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
      if (callee.isSkill === true) {
        return { success: false, error: `Nested execution is not allowed for skill tools: ${callee.id}` };
      }

      this.nestedExecutionDepth++;
      try {
        const result = await this.executeOrRequestCredentials(callee, input);
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
          return output || {};
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

  private configEnvName(field: string): string {
    return field
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .toUpperCase();
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
      const endpointEnvVar = manifest?.endpointEnvVar;
      const envEndpoint = typeof endpointEnvVar === 'string' ? process.env[endpointEnvVar] : undefined;
      return this.hasValue(endpoint?.url)
        || this.hasValue(endpoint?.path)
        || this.hasValue(envEndpoint)
        || this.hasValue(input.endpointUrl)
        || this.hasValue(input.baseUrl);
    }

    if (this.isCredentialField(field)) {
      const credentialSource = manifest?.credentialSource as Record<string, { envVar?: string; configKey?: string; vaultSecretId?: string }> | undefined;
      const source = credentialSource?.[field];
      const envValue = source?.envVar ? process.env[source.envVar] : undefined;
      const configValue = source?.configKey ? this.getNestedValue(externalConfig, source.configKey) : undefined;
      return this.hasValue(envValue) || this.hasValue(configValue);
    }

    const envName = this.configEnvName(field);
    return Boolean(envName && this.hasValue(process.env[envName]));
  }

  private hasEndpoint(tool: Tool, input: Record<string, unknown>): boolean {
    const manifest = tool.manifest as Record<string, unknown> | undefined;
    const endpoint = manifest?.endpoint as Record<string, unknown> | undefined;
    const endpointEnvVar = manifest?.endpointEnvVar;
    const envEndpoint = typeof endpointEnvVar === 'string' ? process.env[endpointEnvVar] : undefined;
    return this.hasValue(endpoint?.url)
      || this.hasValue(endpoint?.path)
      || this.hasValue(envEndpoint)
      || this.hasValue(input.endpointUrl)
      || this.hasValue(input.baseUrl)
      || this.hasValue((tool.externalConfig as Record<string, unknown> | undefined)?.baseUrl);
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
const credentialSources: Array<{ logicalKey: string; label?: string; source: { vaultSecretId?: string; envVar?: string; configKey?: string } }> = [];

if (manifest?.credentialSource && typeof manifest.credentialSource === 'object') {
const cs = manifest.credentialSource as Record<string, { vaultSecretId?: string; envVar?: string; configKey?: string }>;
for (const [logicalKey, source] of Object.entries(cs)) {
if (source && typeof source === 'object') {
const s = source as { vaultSecretId?: string; envVar?: string; configKey?: string };
credentialSources.push({ logicalKey, label: logicalKey, source: s });
}
}
}

const namedSources: NamedCredentialSource[] = credentialSources.map(c => ({
logicalKey: c.logicalKey,
vaultSecretId: c.source.vaultSecretId,
envVar: c.source.envVar,
configKey: c.source.configKey,
}));
const resolved = await credentialProvider.resolveAll(namedSources);

const overrides = this.pendingCredentialOverrides.get(tool.id) || {};
const merged = { ...resolved, ...overrides };

const missing = credentialSources
.filter((c) => !merged[c.logicalKey])
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

private async dispatch(tool: Tool, input: Record<string, unknown>, credentials: { resolved: Record<string, string | undefined>; sources: NamedCredentialSource[] }): Promise<Record<string, unknown>> {
const { resolved, sources } = credentials;
const name = tool.name.toLowerCase();
const manifest = tool.manifest as Record<string, unknown> | undefined;
const capabilities = Array.isArray(manifest?.capabilities) ? manifest.capabilities as string[] : [];

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
{ language: language as 'javascript' | 'typescript' | 'python', code: codeToRun, input, executorCallback: this.nestedExecutorCallback() },
{ resolved, sources } as CodeExecutorCredentials,
);

if (result.success) {
if (healingAttempts > 0 && manifest && typeof manifest === 'object') {
(manifest as Record<string, unknown>).sourceCode = codeToRun;
logger.info({ toolId: tool.id, healingAttempts }, 'Healed code persisted to tool manifest');
}
return {
output: result.output,
exitCode: result.exitCode ?? 0,
durationMs: result.durationMs,
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
response = await fetch(url, fetchOptions);
} catch (err) {
const errMsg = err instanceof Error ? err.message : String(err);
logger.warn({ url, err: errMsg }, 'Initial fetch failed for openapi tool; attempting localhost/127.0.0.1 fallback');
if (url.includes('localhost')) {
const alt = url.replace('localhost', '127.0.0.1');
try {
response = await fetch(alt, fetchOptions);
logger.info({ url, alt }, 'Fetch succeeded with 127.0.0.1 fallback');
} catch (err2) {
const err2Msg = err2 instanceof Error ? err2.message : String(err2);
logger.warn({ url: alt, err: err2Msg }, '127.0.0.1 fallback failed, will try service env overrides');
}
}

const svcEnvCandidates = [process.env.ARTIFACTS_URL, process.env.PERSISTENCE_URL, process.env.BRAIN_URL, process.env.WORKER_POOL_URL, process.env.AGENT_RUNTIME_URL];
const triedAlts: string[] = [];
if (!response) {
for (const base of svcEnvCandidates) {
if (!base) continue;
try {
const original = new URL(url);
const baseUrl = new URL(base);
const alt = `${baseUrl.origin}${original.pathname}${original.search}`;
triedAlts.push(alt);
try {
response = await fetch(alt, fetchOptions);
if (response && response.ok) {
logger.info({ url, alt }, 'Fetch succeeded with service env override fallback');
break;
}
} catch (err3) {
logger.warn({ alt, err: err3 instanceof Error ? err3.message : String(err3) }, 'Service env override fetch failed');
}
} catch (e) {
// ignore invalid URL constructions
}
}
}

if (!response) {
try {
const pyHeaders = JSON.stringify(fetchOptions.headers || {});
const pyBody = fetchOptions.body ? JSON.stringify(JSON.parse(fetchOptions.body as string)) : null;
const pyCode = `import sys, json, urllib.request\n\nurl = ${JSON.stringify(url)}\nheaders = json.loads('''${pyHeaders}''')\nmethod = ${JSON.stringify(method)}\nbody = ${JSON.stringify(pyBody)}\n\nif body is not None and isinstance(body, str):\ndata = body.encode('utf-8')\nelse:\ndata = None\nreq = urllib.request.Request(url, data=data, headers=headers, method=method)\ntry:\nwith urllib.request.urlopen(req, timeout=10) as resp:\nstatus = resp.getcode()\ndata = resp.read().decode('utf-8')\nprint(json.dumps({'status': status, 'data': data}))\nexcept Exception as e:\nprint(json.dumps({'error': str(e)}))\nsys.exit(1)\n`;
const execResult = await this.codeExecutor.execute({ language: 'python', code: pyCode }, {} as any);
if (execResult.success && execResult.output) {
try {
const parsed = JSON.parse(execResult.output);
if (parsed && parsed.status) {
return { status: parsed.status, data: parsed.data } as any;
}
} catch {
// fall through to throwing
}
}
} catch (pyErr) {
logger.warn({ err: pyErr instanceof Error ? pyErr.message : String(pyErr) }, 'Python code-wrapper fallback failed');
}

const triedMsg = triedAlts.length > 0 ? `; tried overrides: ${triedAlts.join(',')}` : '';
const wrappedError = new Error(`Fetch to ${url} failed: ${errMsg}${triedMsg}`) as Error & { cause?: unknown };
wrappedError.cause = err;
throw wrappedError;
}
}

if (response && !response.ok && url.includes('localhost')) {
try {
const alt = url.includes('localhost') ? url.replace('localhost', '127.0.0.1') : url;
logger.info({ url, alt, status: response.status }, 'Non-OK response; retrying with alternate localhost host');
const retryRes = await fetch(alt, fetchOptions);
if (retryRes.ok) {
response = retryRes;
} else {
// keep original response
}
} catch (err) {
// ignore retry error and proceed to parse original response
}
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
} catch {
data = { text: await (response ? response.text() : Promise.resolve('')) };
}
return { status: response ? response.status : 0, data };
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
{ language: 'javascript', code: (generated.tool.manifest as Record<string, unknown>)?.sourceCode as string || '', input, executorCallback: this.nestedExecutorCallback() },
{ resolved, sources } as CodeExecutorCredentials,
);
if (retryResult.success) {
return {
output: retryResult.output,
exitCode: retryResult.exitCode ?? 0,
durationMs: retryResult.durationMs,
autoGenerated: true,
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
    const currentStage = workflow.stages[0]?.name || workflow.flow.split('→')[0]?.trim() || 'analysis';

    const stages: RuntimeWorkflowStage[] = workflow.stages.map((stage, idx) => {
      const isCurrent = stage.name === currentStage;
      const skills: RuntimeWorkflowAction[] = (stage.skills || []).map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        type: skill.type,
        confirmBeforeSend: skill.confirmBeforeSend,
        isSkill: skill.isSkill,
        stage: stage.name,
        available: isCurrent,
        reason: isCurrent ? undefined : `Not available in stage '${stage.name}' (current: '${currentStage}')`,
      }));
      return {
        name: stage.name,
        description: stage.description,
        status: isCurrent ? 'current' : idx < workflow.stages.findIndex((s) => s.name === currentStage) ? 'completed' : 'pending',
        skills,
      };
    });

    const allowedTransitions = this.stateTransitions[workflowState] || [];
    const nextActions = this.deriveNextActions(workflow, currentStage, workflowState);
    const nextStep = this.deriveNextStep(workflow, currentStage, workflowState, allowedTransitions);

    return {
      executionId,
      workspaceId: execContext.workspaceId || workspaceId,
      assistantId: execContext.assistantId || assistantId,
      assistant: workflow.assistant,
      productObject: workflow.productObject,
      flow: workflow.flow,
      currentStage,
      stages,
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

  private deriveNextActions(workflow: AssistantWorkflow, currentStage: string, workflowState: WorkflowState): string[] {
    const stage = workflow.stages.find((s) => s.name === currentStage);
    const actions: string[] = [];
    if (stage) {
      for (const skill of stage.skills || []) {
        actions.push(skill.name);
      }
    }
    if (workflowState !== 'executed' && workflowState !== 'rejected') {
      actions.push(`transition:${workflowState}`);
    }
    return actions;
  }

  private deriveNextStep(workflow: AssistantWorkflow, currentStage: string, workflowState: WorkflowState, allowedTransitions: WorkflowState[]): string | undefined {
    if (workflowState === 'executed') {
      return `Workflow complete for ${workflow.assistant}. Review results and close out.`;
    }
    if (workflowState === 'rejected') {
      return `Workflow rejected for ${workflow.assistant}. Resume from a prior revision to retry.`;
    }
    const stage = workflow.stages.find((s) => s.name === currentStage);
    if (stage && stage.skills && stage.skills.length > 0) {
      return `Execute one of the available skills in stage '${currentStage}': ${stage.skills.map((s) => s.name).join(', ')}`;
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
