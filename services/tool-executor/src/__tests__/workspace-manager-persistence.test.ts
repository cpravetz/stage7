import { AssistantWorkspaceManager } from '../services/AssistantWorkspaceManager';
import { WorkflowState } from '../types';

// AssistantWorkspaceManager uses in-memory storage when ARTIFACTS_URL is not set.
// These tests validate the in-memory behavior, not file-based persistence.
// Cross-instance data sharing only works via the Artifacts/MongoDB backend.

describe('AssistantWorkspaceManager - In-Memory Workspace Operations', () => {
  let manager: AssistantWorkspaceManager;

  beforeEach(() => {
    manager = new AssistantWorkspaceManager();
  });

  it('creates workspace and stores in memory', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    expect(ws.workspaceId).toBeTruthy();
    expect(ws.assistant).toBe('CTO');
    expect(ws.productObject).toBe('system / incident');
    expect(ws.workflowState).toBe('analysis');
    expect(ws.currentStage).toBe('analysis');
    expect(ws.approvalHistory).toEqual([]);
    expect(ws.executionHistory).toEqual([]);
  });

  it('retrieves workspace by ID from memory', () => {
    const ws = manager.createWorkspace('Education', 'learner');
    const retrieved = manager.getWorkspace(ws.workspaceId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.assistant).toBe('Education');
    expect(retrieved!.productObject).toBe('learner');
    expect(retrieved!.createdAt).toBeInstanceOf(Date);
    expect(retrieved!.updatedAt).toBeInstanceOf(Date);
  });

  it('returns undefined for non-existent workspace', () => {
    expect(manager.getWorkspace('non-existent-id')).toBeUndefined();
  });

  it('updates stage and tracks revisions', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    manager.updateStage(ws.workspaceId, 'diagnose');

    const updated = manager.getWorkspace(ws.workspaceId);
    expect(updated!.currentStage).toBe('diagnose');

    const revisions = manager.getRevisions(ws.workspaceId);
    expect(revisions.length).toBeGreaterThanOrEqual(2);
    const triggers = revisions.map(r => r.trigger);
    expect(triggers).toContain('create');
    expect(triggers).toContain('stage_change');
  });

  it('transitions workflow state through valid transitions', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    const wsId = ws.workspaceId;

    manager.transitionTo(wsId, 'recommendation');
    expect(manager.getWorkspace(wsId)!.workflowState).toBe('recommendation');

    manager.transitionTo(wsId, 'draft');
    expect(manager.getWorkspace(wsId)!.workflowState).toBe('draft');

    manager.transitionTo(wsId, 'approved');
    expect(manager.getWorkspace(wsId)!.workflowState).toBe('approved');

    manager.transitionTo(wsId, 'executed');
    expect(manager.getWorkspace(wsId)!.workflowState).toBe('executed');
  });

  it('rejects invalid workflow state transitions', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    const wsId = ws.workspaceId;

    // Can't jump from analysis directly to executed
    expect(manager.transitionTo(wsId, 'executed')).toBe(false);
    expect(manager.getWorkspace(wsId)!.workflowState).toBe('analysis');

    // Can go from analysis to rejected
    expect(manager.transitionTo(wsId, 'rejected')).toBe(true);
    expect(manager.getWorkspace(wsId)!.workflowState).toBe('rejected');

    // From rejected, can go to draft
    expect(manager.transitionTo(wsId, 'draft')).toBe(true);
    expect(manager.getWorkspace(wsId)!.workflowState).toBe('draft');
  });

  it('records approvals in workspace history', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    const wsId = ws.workspaceId;

    manager.recordApproval(wsId, {
      executionId: 'exec-1',
      toolId: 'tool-1',
      toolName: 'Approve Tool',
      state: 'approved' as WorkflowState,
      actor: 'user-1',
      scope: { object: 'system / incident' },
      timestamp: new Date(),
    });

    const updated = manager.getWorkspace(wsId);
    expect(updated!.approvalHistory).toHaveLength(1);
    expect(updated!.approvalHistory[0].actor).toBe('user-1');

    const revisions = manager.getRevisions(wsId);
    const approvalRev = revisions.find(r => r.trigger === 'approval');
    expect(approvalRev).toBeDefined();
    expect(approvalRev!.metadata).toHaveProperty('entry');
  });

  it('records executions in workspace history', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    const wsId = ws.workspaceId;

    manager.recordExecution(wsId, {
      executionId: 'exec-1',
      toolId: 'tool-1',
      toolName: 'Execute Tool',
      workflowState: 'executed' as WorkflowState,
      status: 'completed',
      startedAt: new Date(),
      completedAt: new Date(),
    });

    const updated = manager.getWorkspace(wsId);
    expect(updated!.executionHistory).toHaveLength(1);
    expect(updated!.executionHistory[0].status).toBe('completed');

    const revisions = manager.getRevisions(wsId);
    const executionRev = revisions.find(r => r.trigger === 'execution');
    expect(executionRev).toBeDefined();
    expect(executionRev!.metadata).toHaveProperty('entry');
  });

  it('records execution results via recordExecutionFromResult', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    const wsId = ws.workspaceId;

    manager.recordExecutionFromResult(wsId, {
      executionId: 'exec-2',
      toolId: 'tool-2',
      toolName: 'Test Tool',
      status: 'completed',
      startedAt: new Date(),
      completedAt: new Date(),
      workflowState: 'approved',
    });

    const updated = manager.getWorkspace(wsId);
    expect(updated!.executionHistory).toHaveLength(1);
    expect(updated!.lastResultId).toBe('exec-2');
  });

  it('resumeFromRevision restores previous state', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    const wsId = ws.workspaceId;

    manager.transitionTo(wsId, 'recommendation');
    manager.transitionTo(wsId, 'draft');
    manager.transitionTo(wsId, 'approved');

    const revisions = manager.getRevisions(wsId);
    const draftRevision = revisions.find(r => r.trigger === 'transition' && r.metadata && (r.metadata as any).to === 'draft');
    expect(draftRevision).toBeDefined();

    manager.transitionTo(wsId, 'executed');
    expect(manager.getWorkspace(wsId)!.workflowState).toBe('executed');

    const success = manager.resumeFromRevision(wsId, draftRevision!.revisionId);
    expect(success).toBe(true);
    expect(manager.getWorkspace(wsId)!.workflowState).toBe('draft');
  });

  it('resetWorkspace clears history and returns to initial state', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    const wsId = ws.workspaceId;

    manager.transitionTo(wsId, 'recommendation');
    manager.transitionTo(wsId, 'draft');
    manager.setNextActions(wsId, ['approve', 'execute']);
    manager.recordApproval(wsId, {
      executionId: 'exec-1',
      toolId: 'tool-1',
      toolName: 'Approve Tool',
      state: 'approved' as WorkflowState,
      actor: 'user-1',
      scope: { object: 'system / incident' },
      timestamp: new Date(),
    });

    manager.resetWorkspace(wsId);

    const resetWs = manager.getWorkspace(wsId)!;
    expect(resetWs.workflowState).toBe('analysis');
    expect(resetWs.currentStage).toBe('analysis');
    expect(resetWs.nextActions).toEqual([]);
    expect(resetWs.approvalHistory).toEqual([]);
    expect(resetWs.executionHistory).toEqual([]);
    expect(resetWs.lastResultId).toBeUndefined();
  });

  it('deleteWorkspace removes workspace and revisions', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    const wsId = ws.workspaceId;

    manager.transitionTo(wsId, 'recommendation');

    expect(manager.getWorkspace(wsId)).toBeDefined();
    expect(manager.getRevisions(wsId).length).toBeGreaterThan(0);

    const deleted = manager.deleteWorkspace(wsId);
    expect(deleted).toBe(true);
    expect(manager.getWorkspace(wsId)).toBeUndefined();
    expect(manager.getRevisions(wsId)).toEqual([]);
  });

  it('getAllowedTransitions returns correct allowed states', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    const wsId = ws.workspaceId;

    expect(manager.getAllowedTransitions(wsId)).toEqual(['recommendation', 'rejected']);

    manager.transitionTo(wsId, 'recommendation');
    expect(manager.getAllowedTransitions(wsId)).toEqual(['draft', 'rejected']);

    manager.transitionTo(wsId, 'draft');
    expect(manager.getAllowedTransitions(wsId)).toEqual(['approved', 'rejected']);

    manager.transitionTo(wsId, 'approved');
    expect(manager.getAllowedTransitions(wsId)).toEqual(['executed', 'rejected']);

    manager.transitionTo(wsId, 'executed');
    expect(manager.getAllowedTransitions(wsId)).toEqual([]);

    // From rejected state
    const ws2 = manager.createWorkspace('Education', 'learner');
    manager.transitionTo(ws2.workspaceId, 'rejected');
    expect(manager.getAllowedTransitions(ws2.workspaceId)).toEqual(['draft']);
  });

  it('getApprovalSummary returns approvals and pending', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    const wsId = ws.workspaceId;

    manager.recordApproval(wsId, {
      executionId: 'exec-1',
      toolId: 'tool-1',
      toolName: 'Tool 1',
      state: 'analysis' as WorkflowState,
      actor: 'user-1',
      scope: {},
      timestamp: new Date(),
    });

    manager.recordApproval(wsId, {
      executionId: 'exec-2',
      toolId: 'tool-2',
      toolName: 'Tool 2',
      state: 'draft' as WorkflowState,
      actor: 'user-2',
      scope: {},
      timestamp: new Date(),
    });

    const summary = manager.getApprovalSummary(wsId)!;
    expect(summary.approvals).toHaveLength(2);
    expect(summary.pending).toHaveLength(1);
    expect(summary.pending[0].actor).toBe('user-2');
    expect(summary.lastActor).toBe('user-2');
  });

  it('getExecutionSummary returns executions and last status', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    const wsId = ws.workspaceId;

    manager.recordExecution(wsId, {
      executionId: 'exec-1',
      toolId: 'tool-1',
      toolName: 'Tool 1',
      workflowState: 'analysis' as WorkflowState,
      status: 'completed',
      startedAt: new Date(),
      completedAt: new Date(),
    });

    manager.recordExecution(wsId, {
      executionId: 'exec-2',
      toolId: 'tool-2',
      toolName: 'Tool 2',
      workflowState: 'draft' as WorkflowState,
      status: 'failed',
      startedAt: new Date(),
      completedAt: new Date(),
    });

    manager.setLastResult(wsId, 'result-123');

    const summary = manager.getExecutionSummary(wsId)!;
    expect(summary.executions).toHaveLength(2);
    expect(summary.lastStatus).toBe('failed');
    expect(summary.lastResultId).toBe('result-123');
  });

  it('filterWorkspaces supports all filter criteria', () => {
    manager.createWorkspace('CTO', 'system / incident');
    manager.createWorkspace('CTO', 'infrastructure');
    manager.createWorkspace('Education', 'learner');
    manager.createWorkspace('Marketing', 'campaign');

    const all = manager.filterWorkspaces({});
    expect(all).toHaveLength(4);

    const cto = manager.filterWorkspaces({ assistant: 'CTO' });
    expect(cto).toHaveLength(2);

    const system = manager.filterWorkspaces({ productObject: 'system / incident' });
    expect(system).toHaveLength(1);
    expect(system[0].assistant).toBe('CTO');

    const analysis = manager.filterWorkspaces({ workflowState: 'analysis' });
    expect(analysis).toHaveLength(4);

    const ctoAnalysis = manager.filterWorkspaces({ assistant: 'CTO', workflowState: 'analysis' });
    expect(ctoAnalysis).toHaveLength(2);
  });

  it('revision limit caps at 100 entries', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    const wsId = ws.workspaceId;

    for (let i = 0; i < 110; i++) {
      manager.updateStage(wsId, `stage-${i}`);
    }

    const revisions = manager.getRevisions(wsId);
    expect(revisions.length).toBeLessThanOrEqual(100);
  });

  it('revision metadata captures transition details', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    const wsId = ws.workspaceId;

    manager.transitionTo(wsId, 'recommendation');

    const revisions = manager.getRevisions(wsId);
    const transitionRev = revisions.find(r => r.trigger === 'transition');
    expect(transitionRev).toBeDefined();
    expect(transitionRev!.metadata).toHaveProperty('from');
    expect(transitionRev!.metadata).toHaveProperty('to');
    expect((transitionRev!.metadata as any).from).toBe('analysis');
    expect((transitionRev!.metadata as any).to).toBe('recommendation');
  });

  it('setNextActions updates next actions on workspace', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    manager.setNextActions(ws.workspaceId, ['review findings', 'schedule meeting']);
    expect(manager.getWorkspace(ws.workspaceId)!.nextActions).toEqual(['review findings', 'schedule meeting']);
  });

  it('updateWorkspace persists context and runtime inputs', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    manager.updateWorkspace(ws.workspaceId, {
      runtimeInputs: { runInputs: { foo: 'bar' }, runResults: {} },
      context: { incidentId: 'INC-123' },
      nextActions: ['investigate', 'mitigate'],
    });

    const updated = manager.getWorkspace(ws.workspaceId);
    expect(updated!.context).toMatchObject({ incidentId: 'INC-123' });
    expect(updated!.nextActions).toEqual(['investigate', 'mitigate']);
  });

  it('new manager instance does not retain data from previous instance (in-memory only)', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    manager.transitionTo(ws.workspaceId, 'recommendation');

    // New manager instance should start with empty memory
    const mgr2 = new AssistantWorkspaceManager();
    expect(mgr2.getWorkspace(ws.workspaceId)).toBeUndefined();
    expect(mgr2.getAllWorkspaces()).toEqual([]);
    expect(mgr2.getWorkspacesByAssistant('CTO')).toEqual([]);
  });
});

describe('AssistantWorkspaceManager - API Scope Validation', () => {
  let manager: AssistantWorkspaceManager;

  beforeEach(() => {
    manager = new AssistantWorkspaceManager();
  });

  it('validateObjectContext validates matching context', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    const result = manager.validateObjectContext(ws.workspaceId, 'system / incident');
    expect(result.valid).toBe(true);
    expect(result.workspace).toBeDefined();
  });

  it('validateObjectContext rejects mismatching context', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    const result = manager.validateObjectContext(ws.workspaceId, 'campaign / marketing');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('system / incident');
    expect(result.error).toContain('campaign / marketing');
    expect(result.workspace).toBeDefined();
  });

  it('validateObjectContext rejects non-existent workspace', () => {
    const result = manager.validateObjectContext('non-existent', 'any');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not found');
    expect(result.workspace).toBeUndefined();
  });

  it('getWorkspaceCount returns correct count', () => {
    expect(manager.getWorkspaceCount()).toBe(0);
    manager.createWorkspace('CTO', 'system / incident');
    expect(manager.getWorkspaceCount()).toBe(1);
    manager.createWorkspace('Education', 'learner');
    expect(manager.getWorkspaceCount()).toBe(2);
  });

  it('getWorkspacesByState filters by workflow state', () => {
    const ws1 = manager.createWorkspace('CTO', 'system / incident');
    const ws2 = manager.createWorkspace('Education', 'learner');

    manager.transitionTo(ws1.workspaceId, 'recommendation');

    const analysis = manager.getWorkspacesByState('analysis');
    expect(analysis).toHaveLength(1);
    expect(analysis[0].workspaceId).toBe(ws2.workspaceId);

    const recommendation = manager.getWorkspacesByState('recommendation');
    expect(recommendation).toHaveLength(1);
    expect(recommendation[0].workspaceId).toBe(ws1.workspaceId);
  });

  it('getWorkspacesByAssistant filters by assistant', () => {
    manager.createWorkspace('CTO', 'system / incident');
    manager.createWorkspace('CTO', 'infrastructure');
    manager.createWorkspace('Education', 'learner');

    const cto = manager.getWorkspacesByAssistant('CTO');
    expect(cto).toHaveLength(2);
    expect(cto.every(ws => ws.assistant === 'CTO')).toBe(true);
  });

  it('getStateHistory returns state transition events', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    manager.transitionTo(ws.workspaceId, 'recommendation');
    manager.transitionTo(ws.workspaceId, 'draft');

    const history = manager.getStateHistory(ws.workspaceId);
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history.some(e => e.to === 'recommendation')).toBe(true);
    expect(history.some(e => e.to === 'draft')).toBe(true);
  });
});
