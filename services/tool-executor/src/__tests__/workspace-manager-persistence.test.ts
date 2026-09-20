import { AssistantWorkspaceManager } from '../services/AssistantWorkspaceManager';
import { WorkflowState } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const originalPersistencePath = process.env.WORKSPACE_PERSISTENCE_PATH;
const originalRevisionsPath = process.env.WORKSPACE_REVISIONS_PATH;
let persistenceFile: string | undefined;
let revisionsFile: string | undefined;

function setupTempFiles() {
  persistenceFile = path.join(os.tmpdir(), `ws-persist-${process.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.json`);
  revisionsFile = path.join(os.tmpdir(), `ws-revisions-${process.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.json`);
  process.env.WORKSPACE_PERSISTENCE_PATH = persistenceFile;
  process.env.WORKSPACE_REVISIONS_PATH = revisionsFile;
}

function cleanupTempFiles() {
  if (persistenceFile && fs.existsSync(persistenceFile)) {
    fs.unlinkSync(persistenceFile);
  }
  if (revisionsFile && fs.existsSync(revisionsFile)) {
    fs.unlinkSync(revisionsFile);
  }
  if (originalPersistencePath === undefined) {
    delete process.env.WORKSPACE_PERSISTENCE_PATH;
  } else {
    process.env.WORKSPACE_PERSISTENCE_PATH = originalPersistencePath;
  }
  if (originalRevisionsPath === undefined) {
    delete process.env.WORKSPACE_REVISIONS_PATH;
  } else {
    process.env.WORKSPACE_REVISIONS_PATH = originalRevisionsPath;
  }
}

describe('AssistantWorkspaceManager - Durable Persistence & Revision History', () => {
  let manager: AssistantWorkspaceManager;

  beforeEach(() => {
    setupTempFiles();
    manager = new AssistantWorkspaceManager();
  });

  afterEach(() => {
    cleanupTempFiles();
  });

  it('creates workspace and persists to disk', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    expect(ws.workspaceId).toBeTruthy();
    
    const raw = fs.readFileSync(persistenceFile!, 'utf-8');
    const data = JSON.parse(raw);
    expect(data[ws.workspaceId]).toBeTruthy();
    expect(data[ws.workspaceId].assistant).toBe('CTO');
    expect(data[ws.workspaceId].productObject).toBe('system / incident');
    expect(data[ws.workspaceId].workflowState).toBe('analysis');
  });

  it('loads workspace from disk on new instance', () => {
    const ws = manager.createWorkspace('Education', 'learner');
    const wsId = ws.workspaceId;
    
    const mgr2 = new AssistantWorkspaceManager();
    const loaded = mgr2.getWorkspace(wsId);
    expect(loaded).toBeDefined();
    expect(loaded!.assistant).toBe('Education');
    expect(loaded!.productObject).toBe('learner');
    expect(loaded!.createdAt).toBeInstanceOf(Date);
    expect(loaded!.updatedAt).toBeInstanceOf(Date);
  });

  it('persists revisions to separate file', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    manager.updateStage(ws.workspaceId, 'approve');
    manager.transitionTo(ws.workspaceId, 'recommendation');
    
    const raw = fs.readFileSync(revisionsFile!, 'utf-8');
    const data = JSON.parse(raw);
    expect(data[ws.workspaceId]).toBeDefined();
    expect(data[ws.workspaceId].length).toBeGreaterThanOrEqual(2);
    
    const triggers = data[ws.workspaceId].map((r: any) => r.trigger);
    expect(triggers).toContain('create');
    expect(triggers).toContain('stage_change');
    expect(triggers).toContain('transition');
  });

  it('loads revisions on new instance', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    const wsId = ws.workspaceId;
    manager.updateWorkflowState(wsId, 'recommendation');
    manager.transitionTo(wsId, 'draft');
    
    const mgr2 = new AssistantWorkspaceManager();
    const revisions = mgr2.getRevisions(wsId);
    expect(revisions.length).toBeGreaterThanOrEqual(3);
    const triggers = revisions.map(r => r.trigger);
    expect(triggers).toContain('create');
    expect(triggers).toContain('state_change');
    expect(triggers).toContain('transition');
  });

  it('survives restart with full workflow state and history', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    const wsId = ws.workspaceId;
    
    manager.transitionTo(wsId, 'recommendation');
    manager.transitionTo(wsId, 'draft');
    manager.transitionTo(wsId, 'approved');
    manager.transitionTo(wsId, 'executed');
    
    manager.recordApproval(wsId, {
      executionId: 'exec-1',
      toolId: 'tool-1',
      toolName: 'Approve Tool',
      state: 'approved',
      actor: 'user-1',
      scope: { object: 'system / incident' },
      timestamp: new Date(),
    });
    
    manager.recordExecution(wsId, {
      executionId: 'exec-1',
      toolId: 'tool-1',
      toolName: 'Execute Tool',
      workflowState: 'executed',
      status: 'completed',
      startedAt: new Date(),
      completedAt: new Date(),
    });
    
    const mgr2 = new AssistantWorkspaceManager();
    const loaded = mgr2.getWorkspace(wsId);
    expect(loaded).toBeDefined();
    expect(loaded!.workflowState).toBe('executed');
    expect(loaded!.approvalHistory).toHaveLength(1);
    expect(loaded!.executionHistory).toHaveLength(1);
    expect(loaded!.approvalHistory[0].actor).toBe('user-1');
  });

  it('revision history captures approval and execution entries', () => {
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
    
    manager.recordExecution(wsId, {
      executionId: 'exec-1',
      toolId: 'tool-1',
      toolName: 'Execute Tool',
      workflowState: 'executed' as WorkflowState,
      status: 'completed',
      startedAt: new Date(),
      completedAt: new Date(),
    });
    
    const revisions = manager.getRevisions(wsId);
    const approvalRev = revisions.find(r => r.trigger === 'approval');
    const executionRev = revisions.find(r => r.trigger === 'execution');
    
    expect(approvalRev).toBeDefined();
    expect(approvalRev!.metadata).toHaveProperty('entry');
    expect(executionRev).toBeDefined();
    expect(executionRev!.metadata).toHaveProperty('entry');
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
    
    // From rejected state (need to go through rejection path)
    const ws2 = manager.createWorkspace('Education', 'learner');
    const wsId2 = ws2.workspaceId;
    manager.transitionTo(wsId2, 'rejected');
    expect(manager.getAllowedTransitions(wsId2)).toEqual(['draft']);
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
});

describe('AssistantWorkspaceManager - API Scope Validation', () => {
  let manager: AssistantWorkspaceManager;

  beforeEach(() => {
    setupTempFiles();
    manager = new AssistantWorkspaceManager();
  });

  afterEach(() => {
    cleanupTempFiles();
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
});