import { WorkflowState, AssistantWorkspace, WorkspaceApprovalEntry, WorkspaceExecutionEntry, WorkspaceRevision, StateTransitionEvent, WorkflowStateContract, RuntimeWorkflow, RuntimeWorkflowAction, RuntimeWorkflowStage } from '../types';
import { AssistantWorkflow } from '../data/skills/workflow-common';
import logger from '../utils/logger';

// Runtime persistence goes through the MongoDB-backed Artifacts service, not
// local JSON. Local JSON was tied to a single process's CWD, was lost on
// restart, and was never shared across replicas, so workspace state vanished
// whenever the service was restarted or a request hit a different instance.
// The artifacts service already owns assistant runtime config and mission
// state in MongoDB; workspace state belongs there too. When ARTIFACTS_URL is
// not set (e.g. some local dev setups) the manager degrades to in-memory only,
// exactly like the old behaviour without the fragile JSON file.
const ARTIFACTS_URL = process.env.ARTIFACTS_URL || '';
const WORKSPACE_COLLECTION = 'assistant-workspaces';
const REVISIONS_COLLECTION = 'assistant-workspace-revisions';

async function artifactsFetch(path: string, init?: RequestInit): Promise<any | null> {
  if (!ARTIFACTS_URL) return null;
  try {
    const res = await fetch(`${ARTIFACTS_URL}/api/artifacts/documents${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), path }, 'Artifacts persistence unavailable');
    return null;
  }
}

export class AssistantWorkspaceManager {
  private workspaces: Map<string, AssistantWorkspace> = new Map();
  private revisions: Map<string, WorkspaceRevision[]> = new Map();

  constructor() {
    this.load();
  }

  private async persistDocument(collection: string, id: string, data: Record<string, unknown>): Promise<void> {
    const existing = await artifactsFetch(`/${encodeURIComponent(id)}`);
    if (existing) {
      await artifactsFetch(`/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ data }) });
    } else {
      await artifactsFetch('/', {
        method: 'POST',
        body: JSON.stringify({ id, tenantId: 'default', collection, data }),
      });
    }
  }

  private async deleteDocument(id: string): Promise<void> {
    await artifactsFetch(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  private async save(): Promise<void> {
    if (!ARTIFACTS_URL) return;
    try {
      for (const [id, ws] of this.workspaces) {
        await this.persistDocument(WORKSPACE_COLLECTION, id, ws as unknown as Record<string, unknown>);
      }
      for (const [id, revs] of this.revisions) {
        await this.persistDocument(REVISIONS_COLLECTION, `revisions-${id}`, { workspaceId: id, revisions: revs });
      }
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Failed to persist workspaces to artifacts');
    }
  }

  // Fire-and-forget wrapper so synchronous API methods don't have to await.
  public persist(): void {
    this.save().catch(() => {});
  }

  private async load(): Promise<void> {
    if (!ARTIFACTS_URL) return;
    try {
      const res = await artifactsFetch('/search', {
        method: 'POST',
        body: JSON.stringify({ collection: WORKSPACE_COLLECTION, limit: 500 }),
      });
      const docs: any[] = res?.documents || [];
      for (const doc of docs) {
        const ws = doc.data as AssistantWorkspace;
        if (ws && ws.workspaceId) {
          if (ws.createdAt && typeof ws.createdAt === 'string') ws.createdAt = new Date(ws.createdAt);
          if (ws.updatedAt && typeof ws.updatedAt === 'string') ws.updatedAt = new Date(ws.updatedAt);
          this.workspaces.set(ws.workspaceId, ws);
        }
      }
      const revRes = await artifactsFetch('/search', {
        method: 'POST',
        body: JSON.stringify({ collection: REVISIONS_COLLECTION, limit: 500 }),
      });
      const revDocs: any[] = revRes?.documents || [];
      for (const doc of revDocs) {
        const data = doc.data as { workspaceId: string; revisions: WorkspaceRevision[] };
        if (data?.workspaceId && Array.isArray(data.revisions)) {
          this.revisions.set(data.workspaceId, data.revisions);
        }
      }
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Failed to load workspaces from artifacts');
    }
  }

  private createRevision(workspaceId: string, trigger: WorkspaceRevision['trigger'], metadata?: Record<string, unknown>): void {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return;
    const revision: WorkspaceRevision = {
      revisionId: `rev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      workspaceId,
      trigger,
      workspace: { ...ws },
      timestamp: new Date(),
      metadata,
    };
    const revs = this.revisions.get(workspaceId) || [];
    revs.push(revision);
    if (revs.length > 100) revs.shift();
    this.revisions.set(workspaceId, revs);
  }

  createWorkspace(assistant: string, productObject: string, initialStage?: string): AssistantWorkspace {
    const workspace: AssistantWorkspace = {
      workspaceId: `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      assistant,
      productObject,
      currentStage: initialStage || 'analysis',
      workflowState: 'analysis',
      nextActions: [],
      approvalHistory: [],
      executionHistory: [],
      stateHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.workspaces.set(workspace.workspaceId, workspace);
    this.createRevision(workspace.workspaceId, 'create');
    this.persist();
    return workspace;
  }

  /**
   * Create a new workspace or resume an existing one for the same
   * assistant/product object pair. Returns the workspace plus whether it
   * was resumed (true) or freshly created (false).
   */
  createOrResumeWorkspace(
    assistant: string,
    productObject: string,
    opts?: { workspaceId?: string; context?: Record<string, unknown>; initialStage?: string }
  ): { workspace: AssistantWorkspace; resumed: boolean } {
    if (opts?.workspaceId) {
      const existing = this.getWorkspace(opts.workspaceId);
      if (existing) {
        if (opts.context) {
          (existing as any).context = { ...((existing as any).context || {}), ...opts.context };
          existing.updatedAt = new Date();
          this.persist();
        }
        return { workspace: existing, resumed: true };
      }
    }

    const ws = this.createWorkspace(assistant, productObject, opts?.initialStage);
    if (opts?.context) {
      (ws as any).context = { ...opts.context };
      this.persist();
    }
    return { workspace: ws, resumed: false };
  }

  /**
   * Link an execution result into a workspace's history, updating the
   * workflow state and last result id when appropriate.
   */
  recordExecutionFromResult(
    workspaceId: string,
    execution: { executionId: string; toolId: string; toolName?: string; status: 'completed' | 'failed'; startedAt: Date; completedAt?: Date; workflowState?: WorkflowState }
  ): AssistantWorkspace | null {
    const ws = this.getWorkspace(workspaceId);
    if (!ws) return null;

    const entry: WorkspaceExecutionEntry = {
      executionId: execution.executionId,
      toolId: execution.toolId,
      toolName: execution.toolName || execution.toolId,
      workflowState: execution.workflowState || ws.workflowState,
      status: execution.status,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
    };
    ws.executionHistory.push(entry);
    if (execution.status === 'completed') {
      ws.lastResultId = execution.executionId;
    }
    ws.updatedAt = new Date();
    this.createRevision(workspaceId, 'execution', { entry });
    this.persist();
    return ws;
  }

  getWorkspace(workspaceId: string): AssistantWorkspace | undefined {
    return this.workspaces.get(workspaceId);
  }

  updateStage(workspaceId: string, stage: string): boolean {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return false;
    const prevStage = ws.currentStage;
    ws.currentStage = stage;
    ws.updatedAt = new Date();
    this.createRevision(workspaceId, 'stage_change', { previousStage: prevStage, newStage: stage });
    this.persist();
    return true;
  }

  updateWorkflowState(workspaceId: string, state: WorkflowState): boolean {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return false;
    const prevState = ws.workflowState;
    ws.workflowState = state;
    ws.updatedAt = new Date();
    this.createRevision(workspaceId, 'state_change', { previousState: prevState, newState: state });
    this.persist();
    return true;
  }

  setNextActions(workspaceId: string, actions: string[]): boolean {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return false;
    ws.nextActions = actions;
    ws.updatedAt = new Date();
    this.createRevision(workspaceId, 'actions_update', { actions });
    this.persist();
    return true;
  }

  recordApproval(workspaceId: string, entry: WorkspaceApprovalEntry): boolean {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return false;
    ws.approvalHistory.push(entry);
    ws.updatedAt = new Date();
    this.createRevision(workspaceId, 'approval', { entry });
    this.persist();
    return true;
  }

  recordExecution(workspaceId: string, entry: WorkspaceExecutionEntry): boolean {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return false;
    ws.executionHistory.push(entry);
    ws.updatedAt = new Date();
    this.createRevision(workspaceId, 'execution', { entry });
    this.persist();
    return true;
  }

  setLastResult(workspaceId: string, resultId: string): boolean {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return false;
    ws.lastResultId = resultId;
    ws.updatedAt = new Date();
    this.createRevision(workspaceId, 'result_update', { resultId });
    this.persist();
    return true;
  }

  updateWorkspace(workspaceId: string, data: Record<string, unknown>): boolean {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return false;
    if (data.runtimeInputs !== undefined && data.runtimeInputs !== null) {
      ws.runtimeInputs = data.runtimeInputs as string | Record<string, unknown>;
    }
    if (data.context !== undefined && typeof data.context === 'object') {
      ws.context = { ...ws.context, ...data.context as Record<string, unknown> };
    }
    if (data.nextActions !== undefined) {
      ws.nextActions = data.nextActions as string[];
    }
    ws.updatedAt = new Date();
    this.createRevision(workspaceId, 'actions_update', { data });
    this.persist();
    return true;
  }

  validateObjectContext(workspaceId: string, objectId: string): { valid: boolean; workspace?: AssistantWorkspace; error?: string } {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) {
      return { valid: false, error: `Workspace ${workspaceId} not found` };
    }
    if (ws.productObject !== objectId) {
      return {
        valid: false,
        workspace: ws,
        error: `Object context mismatch: workspace is for "${ws.productObject}" but received "${objectId}"`,
      };
    }
    return { valid: true, workspace: ws };
  }

  transitionTo(workspaceId: string, state: WorkflowState): boolean {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return false;
    const allowed: Record<WorkflowState, WorkflowState[]> = {
      analysis: ['recommendation', 'rejected'],
      recommendation: ['draft', 'rejected'],
      draft: ['approved', 'rejected'],
      approved: ['executed', 'rejected'],
      executed: [],
      rejected: ['draft'],
    };
    const allowedStates = allowed[ws.workflowState];
    if (allowedStates && allowedStates.includes(state)) {
      const prevState = ws.workflowState;
      ws.workflowState = state;
      ws.updatedAt = new Date();
      const event: StateTransitionEvent = {
        from: prevState,
        to: state,
        timestamp: new Date(),
        trigger: 'transition',
      };
      ws.stateHistory.push(event);
      this.createRevision(workspaceId, 'transition', { from: prevState, to: state });
      this.persist();
      return true;
    }
    return false;
  }

  getAllowedTransitions(workspaceId: string): WorkflowState[] {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return [];
    const allowed: Record<WorkflowState, WorkflowState[]> = {
      analysis: ['recommendation', 'rejected'],
      recommendation: ['draft', 'rejected'],
      draft: ['approved', 'rejected'],
      approved: ['executed', 'rejected'],
      executed: [],
      rejected: ['draft'],
    };
    return allowed[ws.workflowState] || [];
  }

  getApprovalSummary(workspaceId: string): { approvals: WorkspaceApprovalEntry[]; pending: WorkspaceApprovalEntry[]; lastActor?: string } | null {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return null;
    const pending = ws.approvalHistory.filter(e => e.state === 'draft' || e.state === 'recommendation');
    return {
      approvals: ws.approvalHistory,
      pending,
      lastActor: ws.approvalHistory.length > 0 ? ws.approvalHistory[ws.approvalHistory.length - 1].actor : undefined,
    };
  }

  getExecutionSummary(workspaceId: string): { executions: WorkspaceExecutionEntry[]; lastStatus?: 'completed' | 'failed'; lastResultId?: string } | null {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return null;
    const lastExec = ws.executionHistory[ws.executionHistory.length - 1];
    return {
      executions: ws.executionHistory,
      lastStatus: lastExec?.status,
      lastResultId: ws.lastResultId,
    };
  }

  getStateHistory(workspaceId: string): StateTransitionEvent[] {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return [];
    return [...ws.stateHistory];
  }

  getStateTransitionEvents(workspaceId: string): StateTransitionEvent[] {
    return this.getStateHistory(workspaceId);
  }

  getRevisions(workspaceId: string): WorkspaceRevision[] {
    return this.revisions.get(workspaceId) || [];
  }

  getRevision(workspaceId: string, revisionId: string): WorkspaceRevision | undefined {
    return this.revisions.get(workspaceId)?.find(r => r.revisionId === revisionId);
  }

  resumeFromRevision(workspaceId: string, revisionId: string): boolean {
    const revision = this.getRevision(workspaceId, revisionId);
    if (!revision || !revision.workspace) return false;
    const restored = revision.workspace;
    restored.updatedAt = new Date();
    this.workspaces.set(workspaceId, restored);
    this.createRevision(workspaceId, 'resume', { fromRevision: revisionId });
    this.persist();
    return true;
  }

  resetWorkspace(workspaceId: string): boolean {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return false;
    ws.currentStage = 'analysis';
    ws.workflowState = 'analysis';
    ws.nextActions = [];
    ws.approvalHistory = [];
    ws.executionHistory = [];
    ws.stateHistory = [];
    ws.lastResultId = undefined;
    ws.updatedAt = new Date();
    this.createRevision(workspaceId, 'reset');
    this.persist();
    return true;
  }

  deleteWorkspace(workspaceId: string): boolean {
    const deleted = this.workspaces.delete(workspaceId);
    if (deleted) {
      this.revisions.delete(workspaceId);
      this.deleteDocument(workspaceId).catch(() => {});
      this.deleteDocument(`revisions-${workspaceId}`).catch(() => {});
      this.persist();
    }
    return deleted;
  }

  getAllWorkspaces(): AssistantWorkspace[] {
    return [...this.workspaces.values()];
  }

  getWorkspacesByAssistant(assistant: string): AssistantWorkspace[] {
    return [...this.workspaces.values()].filter(ws => ws.assistant === assistant);
  }

  filterWorkspaces(filter: {
    assistant?: string;
    productObject?: string;
    workflowState?: WorkflowState;
    currentStage?: string;
    createdAfter?: Date;
    createdBefore?: Date;
  }): AssistantWorkspace[] {
    let results = [...this.workspaces.values()];
    if (filter.assistant) results = results.filter(ws => ws.assistant === filter.assistant);
    if (filter.productObject) results = results.filter(ws => ws.productObject === filter.productObject);
    if (filter.workflowState) results = results.filter(ws => ws.workflowState === filter.workflowState);
    if (filter.currentStage) results = results.filter(ws => ws.currentStage === filter.currentStage);
    if (filter.createdAfter) results = results.filter(ws => ws.createdAt >= filter.createdAfter!);
    if (filter.createdBefore) results = results.filter(ws => ws.createdAt <= filter.createdBefore!);
    return results;
  }

  getWorkspaceCount(): number {
    return this.workspaces.size;
  }

  listWorkspaces(): AssistantWorkspace[] {
    return [...this.workspaces.values()];
  }

  getWorkspacesByState(state: WorkflowState): AssistantWorkspace[] {
    return [...this.workspaces.values()].filter(ws => ws.workflowState === state);
  }

  /**
   * Build a runtime-visible workflow snapshot for a workspace.
   * Integrates workspace identity, current stage, available/next actions,
   * workflow state, and next step into a single runtime object.
   */
  buildRuntimeWorkflow(workspaceId: string, workflow: AssistantWorkflow, executionId?: string): RuntimeWorkflow | null {
    const ws = this.getWorkspace(workspaceId);
    if (!ws) return null;

    const stages: RuntimeWorkflowStage[] = workflow.stages.map((stage, idx) => {
      const isCurrent = stage.name === ws.currentStage;
      const skills: RuntimeWorkflowAction[] = (stage.skills || []).map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        type: skill.type,
        confirmBeforeSend: skill.confirmBeforeSend,
        isSkill: skill.isSkill,
        stage: stage.name,
        available: true,
        reason: undefined,
      }));
      return {
        name: stage.name,
        description: stage.description,
        status: isCurrent ? 'current' : idx < workflow.stages.findIndex((s) => s.name === ws.currentStage) ? 'completed' : 'pending',
        skills,
      };
    });

    const allowedTransitions = this.getAllowedTransitions(workspaceId);
    const nextActions = this.deriveNextActions(workflow, ws.currentStage, ws.workflowState);
    const nextStep = this.deriveNextStep(workflow, ws.currentStage, ws.workflowState, allowedTransitions);

    return {
      executionId: executionId || `runtime_${ws.workspaceId}`,
      workspaceId: ws.workspaceId,
      assistantId: ws.assistant,
      assistant: ws.assistant,
      productObject: ws.productObject,
      flow: workflow.flow,
      currentStage: ws.currentStage,
      stages,
      workflowState: ws.workflowState,
      nextActions,
      allowedTransitions,
      stateHistory: ws.stateHistory,
      approvalHistory: ws.approvalHistory,
      executionHistory: ws.executionHistory,
      lastResultId: ws.lastResultId,
      context: {
        assistant: ws.assistant,
        productObject: ws.productObject,
        workspaceId: ws.workspaceId,
      },
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
}