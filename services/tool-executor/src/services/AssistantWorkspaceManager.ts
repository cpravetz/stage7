import * as fs from 'fs';
import * as path from 'path';
import { WorkflowState, AssistantWorkspace, WorkspaceApprovalEntry, WorkspaceExecutionEntry, WorkspaceRevision, StateTransitionEvent, WorkflowStateContract, RuntimeWorkflow, RuntimeWorkflowAction, RuntimeWorkflowStage } from '../types';
import { AssistantWorkflow } from '../data/skills/workflow-common';
import logger from '../utils/logger';

const DEFAULT_PERSISTENCE_PATH = path.join(process.cwd(), 'data', 'workspaces.json');
const DEFAULT_REVISIONS_PATH = path.join(process.cwd(), 'data', 'workspace-revisions.json');

function getPersistencePath(): string {
  return process.env.WORKSPACE_PERSISTENCE_PATH || DEFAULT_PERSISTENCE_PATH;
}

function getRevisionsPath(): string {
  return process.env.WORKSPACE_REVISIONS_PATH || DEFAULT_REVISIONS_PATH;
}

export class AssistantWorkspaceManager {
  private workspaces: Map<string, AssistantWorkspace> = new Map();
  private revisions: Map<string, WorkspaceRevision[]> = new Map();

  constructor() {
    this.load();
  }

  private save(): void {
    try {
      const target = getPersistencePath();
      const dir = path.dirname(target);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data: Record<string, AssistantWorkspace> = {};
      for (const [id, ws] of this.workspaces) data[id] = ws;
      fs.writeFileSync(target, JSON.stringify(data, null, 2));
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Failed to persist workspaces');
    }
    this.saveRevisions();
  }

  private saveRevisions(): void {
    try {
      const target = getRevisionsPath();
      const dir = path.dirname(target);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data: Record<string, WorkspaceRevision[]> = {};
      for (const [id, revs] of this.revisions) data[id] = revs;
      fs.writeFileSync(target, JSON.stringify(data, null, 2));
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Failed to persist workspace revisions');
    }
  }

  private load(): void {
    try {
      const target = getPersistencePath();
      if (!fs.existsSync(target)) return;
      const raw = fs.readFileSync(target, 'utf-8');
      const data: Record<string, AssistantWorkspace> = JSON.parse(raw);
      for (const [id, ws] of Object.entries(data)) {
        if (ws && typeof ws === 'object') {
          if (ws.createdAt && typeof ws.createdAt === 'string') ws.createdAt = new Date(ws.createdAt);
          if (ws.updatedAt && typeof ws.updatedAt === 'string') ws.updatedAt = new Date(ws.updatedAt);
          if (ws.approvalHistory) for (const e of ws.approvalHistory) { if (e.timestamp && typeof e.timestamp === 'string') e.timestamp = new Date(e.timestamp); }
          if (ws.executionHistory) for (const e of ws.executionHistory) { if (e.startedAt && typeof e.startedAt === 'string') e.startedAt = new Date(e.startedAt); if (e.completedAt && typeof e.completedAt === 'string') e.completedAt = new Date(e.completedAt); }
          if (ws.stateHistory) for (const e of ws.stateHistory) { if (e.timestamp && typeof e.timestamp === 'string') e.timestamp = new Date(e.timestamp); }
          this.workspaces.set(id, ws);
        }
      }
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Failed to load workspaces');
      this.workspaces.clear();
    }
    this.loadRevisions();
  }

  private loadRevisions(): void {
    try {
      const target = getRevisionsPath();
      if (!fs.existsSync(target)) return;
      const raw = fs.readFileSync(target, 'utf-8');
      const data: Record<string, WorkspaceRevision[]> = JSON.parse(raw);
      for (const [id, revs] of Object.entries(data)) {
        if (Array.isArray(revs)) {
          const parsed = revs.map(r => ({
            ...r,
            timestamp: r.timestamp && typeof r.timestamp === 'string' ? new Date(r.timestamp) : new Date(r.timestamp),
            workspace: r.workspace ? {
              ...r.workspace,
              createdAt: r.workspace.createdAt && typeof r.workspace.createdAt === 'string' ? new Date(r.workspace.createdAt) : r.workspace.createdAt,
              updatedAt: r.workspace.updatedAt && typeof r.workspace.updatedAt === 'string' ? new Date(r.workspace.updatedAt) : r.workspace.updatedAt,
              approvalHistory: r.workspace.approvalHistory?.map((e: WorkspaceApprovalEntry) => ({
                ...e,
                timestamp: e.timestamp && typeof e.timestamp === 'string' ? new Date(e.timestamp) : e.timestamp,
              })) || [],
              executionHistory: r.workspace.executionHistory?.map((e: WorkspaceExecutionEntry) => ({
                ...e,
                startedAt: e.startedAt && typeof e.startedAt === 'string' ? new Date(e.startedAt) : e.startedAt,
                completedAt: e.completedAt && typeof e.completedAt === 'string' ? new Date(e.completedAt) : e.completedAt,
              })) || [],
            } : undefined,
          }));
          this.revisions.set(id, parsed);
        }
      }
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Failed to load workspace revisions');
      this.revisions.clear();
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

  public persist(): void {
    this.save();
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
    this.save();
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
          this.save();
        }
        return { workspace: existing, resumed: true };
      }
    }

    const ws = this.createWorkspace(assistant, productObject, opts?.initialStage);
    if (opts?.context) {
      (ws as any).context = { ...opts.context };
      this.save();
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
    this.save();
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
    this.save();
    return true;
  }

  updateWorkflowState(workspaceId: string, state: WorkflowState): boolean {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return false;
    const prevState = ws.workflowState;
    ws.workflowState = state;
    ws.updatedAt = new Date();
    this.createRevision(workspaceId, 'state_change', { previousState: prevState, newState: state });
    this.save();
    return true;
  }

  setNextActions(workspaceId: string, actions: string[]): boolean {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return false;
    ws.nextActions = actions;
    ws.updatedAt = new Date();
    this.createRevision(workspaceId, 'actions_update', { actions });
    this.save();
    return true;
  }

  recordApproval(workspaceId: string, entry: WorkspaceApprovalEntry): boolean {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return false;
    ws.approvalHistory.push(entry);
    ws.updatedAt = new Date();
    this.createRevision(workspaceId, 'approval', { entry });
    this.save();
    return true;
  }

  recordExecution(workspaceId: string, entry: WorkspaceExecutionEntry): boolean {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return false;
    ws.executionHistory.push(entry);
    ws.updatedAt = new Date();
    this.createRevision(workspaceId, 'execution', { entry });
    this.save();
    return true;
  }

  setLastResult(workspaceId: string, resultId: string): boolean {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return false;
    ws.lastResultId = resultId;
    ws.updatedAt = new Date();
    this.createRevision(workspaceId, 'result_update', { resultId });
    this.save();
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
      this.save();
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
    this.save();
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
    this.save();
    return true;
  }

  deleteWorkspace(workspaceId: string): boolean {
    const deleted = this.workspaces.delete(workspaceId);
    if (deleted) {
      this.revisions.delete(workspaceId);
      this.save();
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
        available: isCurrent,
        reason: isCurrent ? undefined : `Not available in stage '${stage.name}' (current: '${ws.currentStage}')`,
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