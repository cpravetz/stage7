import { ToolExecutor } from '../services/ToolExecutor';
import { AssistantWorkspaceManager } from '../services/AssistantWorkspaceManager';
import { Tool, WorkflowState } from '../types';
import { createCodeSkill, createSchemaRecord, SchemaProps } from '../data/skills/code-skill-factory';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const originalPersistencePath = process.env.WORKSPACE_PERSISTENCE_PATH;
let persistenceFile: string | undefined;

function createContextTool(overrides: { id?: string; name?: string; confirmBeforeSend?: boolean } = {}): Tool {
  return createCodeSkill({
    id: overrides.id || `ctx-tool-${Math.random().toString(36).substr(2, 9)}`,
    name: overrides.name || 'Context Tool',
    description: 'A tool for testing context validation',
    manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: 'console.log("ok")' },
    inputSchema: createSchemaRecord({
      patient: SchemaProps.object({
        id: SchemaProps.text({ description: 'Patient ID' }),
        name: SchemaProps.text({ description: 'Patient name' }),
      }, { description: 'Patient context' }),
      campaign: SchemaProps.object({
        id: SchemaProps.text({ description: 'Campaign ID' }),
        name: SchemaProps.text({ description: 'Campaign name' }),
      }, { description: 'Campaign context' }),
      object: SchemaProps.text({ description: 'Object context' }),
      dryRun: SchemaProps.boolean({ description: 'Dry run mode' }),
      confirmation: SchemaProps.boolean({ description: 'Confirmation' }),
    }),
    outputSchema: createSchemaRecord({
      success: SchemaProps.boolean({ description: 'Success' }),
      data: SchemaProps.object({ id: SchemaProps.text({ description: 'Result data' }) }, { description: 'Result data' }),
    }, { required: ['success'] }),
    confirmBeforeSend: overrides.confirmBeforeSend,
  });
}

describe('Behavioral Tests - Cross-Object Handoff Enforcement', () => {
  let executor: ToolExecutor;
  let readTool: Tool;

  beforeEach(() => {
    executor = new ToolExecutor();
    readTool = createContextTool({ id: 'read-tool', name: 'Read Patient' });
  });

  it('allows execution when no context is set yet', async () => {
    const result = await executor.execute(readTool, { patient: { id: 'patient-1', name: 'John' } });
    expect(result.status).not.toBe('failed');
  });

  it('allows repeated execution with same context', async () => {
    const result1 = await executor.execute(readTool, { patient: { id: 'patient-1', name: 'John' } });
    const result2 = await executor.execute(readTool, { patient: { id: 'patient-1', name: 'John' } });
    expect(result1.status).not.toBe('failed');
    expect(result2.status).not.toBe('failed');
  });

  it('rejects cross-object handoff by failing execution', async () => {
    await executor.execute(readTool, { patient: { id: 'patient-1', name: 'John' } });
    const result = await executor.execute(readTool, { patient: { id: 'patient-2', name: 'Jane' } });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Cross-object handoff');
    expect(result.error).toContain('patient-1');
    expect(result.error).toContain('patient-2');
  });

  it('rejects cross-object handoff between different object types by failing execution', async () => {
    await executor.execute(readTool, { campaign: { id: 'campaign-1', name: 'Summer Campaign' } });
    const result = await executor.execute(readTool, { patient: { id: 'patient-1', name: 'John' } });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Cross-object handoff');
  });

  it('rejects cross-object handoff when switching from object to different object', async () => {
    await executor.execute(readTool, { object: 'account-1' });
    const result = await executor.execute(readTool, { object: 'account-2' });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Cross-object handoff');
  });
});

describe('Behavioral Tests - Assistant Workspace Manager', () => {
  let manager: AssistantWorkspaceManager;

  beforeEach(() => {
    persistenceFile = path.join(os.tmpdir(), `ws-behavioral-${process.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.json`);
    process.env.WORKSPACE_PERSISTENCE_PATH = persistenceFile;
    manager = new AssistantWorkspaceManager();
  });

  afterEach(() => {
    if (persistenceFile && fs.existsSync(persistenceFile)) {
      fs.unlinkSync(persistenceFile);
    }
    if (originalPersistencePath === undefined) {
      delete process.env.WORKSPACE_PERSISTENCE_PATH;
    } else {
      process.env.WORKSPACE_PERSISTENCE_PATH = originalPersistencePath;
    }
  });

  it('creates a workspace with correct initial state', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    expect(ws.workspaceId).toBeTruthy();
    expect(ws.assistant).toBe('CTO');
    expect(ws.productObject).toBe('system / incident');
    expect(ws.currentStage).toBe('analysis');
    expect(ws.workflowState).toBe('analysis');
    expect(ws.nextActions).toEqual([]);
    expect(ws.approvalHistory).toEqual([]);
    expect(ws.executionHistory).toEqual([]);
    expect(ws.createdAt).toBeInstanceOf(Date);
    expect(ws.updatedAt).toBeInstanceOf(Date);
  });

  it('retrieves a workspace by ID', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    const retrieved = manager.getWorkspace(ws.workspaceId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.workspaceId).toBe(ws.workspaceId);
  });

  it('returns undefined for non-existent workspace', () => {
    expect(manager.getWorkspace('non-existent')).toBeUndefined();
  });

  it('updates workflow state', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    const result = manager.updateWorkflowState(ws.workspaceId, 'approved');
    expect(result).toBe(true);
    const updated = manager.getWorkspace(ws.workspaceId)!;
    expect(updated.workflowState).toBe('approved');
  });

  it('updates stage', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    const result = manager.updateStage(ws.workspaceId, 'approve');
    expect(result).toBe(true);
    const updated = manager.getWorkspace(ws.workspaceId)!;
    expect(updated.currentStage).toBe('approve');
  });

  it('records approval entry', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    const entry = {
      executionId: 'exec-1',
      toolId: 'tool-1',
      toolName: 'Approve Tool',
      state: 'approved' as WorkflowState,
      actor: 'user-1',
      scope: { object: 'system / incident', action: 'execute' },
      timestamp: new Date(),
    };
    const result = manager.recordApproval(ws.workspaceId, entry);
    expect(result).toBe(true);
    const updated = manager.getWorkspace(ws.workspaceId)!;
    expect(updated.approvalHistory).toHaveLength(1);
    expect(updated.approvalHistory[0].actor).toBe('user-1');
  });

  it('records execution entry', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    const entry = {
      executionId: 'exec-1',
      toolId: 'tool-1',
      toolName: 'Execute Tool',
      workflowState: 'executed' as WorkflowState,
      status: 'completed' as const,
      startedAt: new Date(),
      completedAt: new Date(),
    };
    const result = manager.recordExecution(ws.workspaceId, entry);
    expect(result).toBe(true);
    const updated = manager.getWorkspace(ws.workspaceId)!;
    expect(updated.executionHistory).toHaveLength(1);
  });

  it('sets next actions', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    const result = manager.setNextActions(ws.workspaceId, ['approve', 'execute', 'review']);
    expect(result).toBe(true);
    const updated = manager.getWorkspace(ws.workspaceId)!;
    expect(updated.nextActions).toEqual(['approve', 'execute', 'review']);
  });

  it('sets last result', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    manager.setNextActions(ws.workspaceId, ['approve']);
    const result = manager.setLastResult(ws.workspaceId, 'result-1');
    expect(result).toBe(true);
    const updated = manager.getWorkspace(ws.workspaceId)!;
    expect(updated.lastResultId).toBe('result-1');
  });

  it('validates matching object context', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    const result = manager.validateObjectContext(ws.workspaceId, 'system / incident');
    expect(result.valid).toBe(true);
  });

  it('rejects mismatching object context', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    const result = manager.validateObjectContext(ws.workspaceId, 'campaign / marketing');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('system / incident');
    expect(result.error).toContain('campaign / marketing');
  });

  it('rejects non-existent workspace validation', () => {
    const result = manager.validateObjectContext('non-existent', 'any');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns all workspaces', () => {
    manager.createWorkspace('CTO', 'system / incident');
    manager.createWorkspace('Education', 'learner');
    const all = manager.getAllWorkspaces();
    expect(all).toHaveLength(2);
  });

  it('filters workspaces by assistant', () => {
    manager.createWorkspace('CTO', 'system / incident');
    manager.createWorkspace('CTO', 'infra');
    manager.createWorkspace('Education', 'learner');
    expect(manager.getWorkspacesByAssistant('CTO')).toHaveLength(2);
    expect(manager.getWorkspacesByAssistant('Education')).toHaveLength(1);
  });

  it('supports full workflow lifecycle via transitions', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    expect(manager.transitionTo(ws.workspaceId, 'recommendation')).toBe(true);
    expect(ws.workflowState).toBe('recommendation');
    expect(manager.transitionTo(ws.workspaceId, 'draft')).toBe(true);
    expect(ws.workflowState).toBe('draft');
    expect(manager.transitionTo(ws.workspaceId, 'approved')).toBe(true);
    expect(ws.workflowState).toBe('approved');
    expect(manager.transitionTo(ws.workspaceId, 'executed')).toBe(true);
    expect(ws.workflowState).toBe('executed');
    expect(manager.transitionTo(ws.workspaceId, 'analysis')).toBe(false);
    expect(manager.transitionTo(ws.workspaceId, 'draft')).toBe(false);
    expect(manager.transitionTo(ws.workspaceId, 'recommendation')).toBe(false);
    expect(manager.transitionTo(ws.workspaceId, 'approved')).toBe(false);
  });

  it('rejects invalid transitions', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    manager.transitionTo(ws.workspaceId, 'recommendation');
    expect(manager.transitionTo(ws.workspaceId, 'approved')).toBe(false);
    expect(manager.transitionTo(ws.workspaceId, 'executed')).toBe(false);
    expect(manager.transitionTo(ws.workspaceId, 'recommendation')).toBe(false);
    manager.transitionTo(ws.workspaceId, 'draft');
    manager.transitionTo(ws.workspaceId, 'approved');
    manager.transitionTo(ws.workspaceId, 'executed');
    expect(manager.transitionTo(ws.workspaceId, 'draft')).toBe(false);
    expect(manager.transitionTo(ws.workspaceId, 'recommendation')).toBe(false);
    expect(manager.transitionTo(ws.workspaceId, 'approved')).toBe(false);
    expect(manager.transitionTo(ws.workspaceId, 'analysis')).toBe(false);

  });

  it('allows rejection from any state and recovery from rejection', () => {
    const ws = manager.createWorkspace('CTO', 'system / incident');
    expect(manager.transitionTo(ws.workspaceId, 'rejected')).toBe(true);
    expect(ws.workflowState).toBe('rejected');
    expect(manager.transitionTo(ws.workspaceId, 'draft')).toBe(true);
    expect(ws.workflowState).toBe('draft');
  });

  it('persists workspace to disk after creation', () => {
    const tmpFile = path.join(os.tmpdir(), `ws-persist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.json`);
    const originalPath = process.env.WORKSPACE_PERSISTENCE_PATH;
    process.env.WORKSPACE_PERSISTENCE_PATH = tmpFile;
    try {
      const mgr = new AssistantWorkspaceManager();
      const ws = mgr.createWorkspace('CTO', 'system / incident');
      const raw = fs.readFileSync(tmpFile, 'utf-8');
      const data = JSON.parse(raw);
      expect(data[ws.workspaceId]).toBeTruthy();
      expect(data[ws.workspaceId].assistant).toBe('CTO');
      expect(data[ws.workspaceId].workflowState).toBe('analysis');
    } finally {
      if (originalPath === undefined) delete process.env.WORKSPACE_PERSISTENCE_PATH;
      else process.env.WORKSPACE_PERSISTENCE_PATH = originalPath;
      try { fs.unlinkSync(tmpFile); } catch { fs.rmSync(tmpFile, { force: true }); }
    }
  });

  it('loads workspace from disk on new instance', () => {
    const tmpFile = path.join(os.tmpdir(), `ws-load-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.json`);
    const originalPath = process.env.WORKSPACE_PERSISTENCE_PATH;
    process.env.WORKSPACE_PERSISTENCE_PATH = tmpFile;
    let wsId;
    try {
      const mgr1 = new AssistantWorkspaceManager();
      const ws = mgr1.createWorkspace('Education', 'learner');
      wsId = ws.workspaceId;
      const mgr2 = new AssistantWorkspaceManager();
      const loaded = mgr2.getWorkspace(wsId);
      expect(loaded).toBeDefined();
      expect(loaded!.assistant).toBe('Education');
      expect(loaded!.productObject).toBe('learner');
      expect(loaded!.createdAt).toBeInstanceOf(Date);
      expect(loaded!.updatedAt).toBeInstanceOf(Date);
    } finally {
      if (originalPath === undefined) delete process.env.WORKSPACE_PERSISTENCE_PATH;
      else process.env.WORKSPACE_PERSISTENCE_PATH = originalPath;
      try { fs.unlinkSync(tmpFile); } catch { fs.rmSync(tmpFile, { force: true }); }
    }
  });

  it('survives restart with workflow state', () => {
    const tmpFile = path.join(os.tmpdir(), `ws-restart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.json`);
    const originalPath = process.env.WORKSPACE_PERSISTENCE_PATH;
    process.env.WORKSPACE_PERSISTENCE_PATH = tmpFile;
    let wsId;
    try {
      const mgr1 = new AssistantWorkspaceManager();
      const ws = mgr1.createWorkspace('CTO', 'system / incident');
      wsId = ws.workspaceId;
      expect(mgr1.transitionTo(wsId, 'recommendation')).toBe(true);
      expect(mgr1.transitionTo(wsId, 'draft')).toBe(true);
      expect(mgr1.transitionTo(wsId, 'approved')).toBe(true);
      const mgr2 = new AssistantWorkspaceManager();
      const loaded = mgr2.getWorkspace(wsId);
      expect(loaded).toBeDefined();
      expect(loaded!.workflowState).toBe('approved');
      expect(loaded!.updatedAt).toBeInstanceOf(Date);
    } finally {
      if (originalPath === undefined) delete process.env.WORKSPACE_PERSISTENCE_PATH;
      else process.env.WORKSPACE_PERSISTENCE_PATH = originalPath;
      try { fs.unlinkSync(tmpFile); } catch { fs.rmSync(tmpFile, { force: true }); }
    }
  });
});

describe('Behavioral Tests - Cross-Context Integration', () => {
  let executor: ToolExecutor;
  let readTool: Tool;
  let writeTool: Tool;

  beforeEach(() => {
    executor = new ToolExecutor();
    readTool = createContextTool({ id: 'read-patient', name: 'Read Patient' });
    writeTool = createContextTool({
      id: 'write-patient',
      name: 'Update Patient',
      confirmBeforeSend: false,
    });
  });

  it('complete flow: read same object twice', async () => {
    const r1 = await executor.execute(readTool, { patient: { id: 'patient-1', name: 'John' } });
    const r2 = await executor.execute(readTool, { patient: { id: 'patient-1', name: 'John' } });
    expect(r1.status).not.toBe('failed');
    expect(r2.status).not.toBe('failed');
  });

  it('complete flow: read same object then attempt cross-object write fails', async () => {
    await executor.execute(readTool, { patient: { id: 'patient-1', name: 'John' } });
    const result = await executor.execute(writeTool, { patient: { id: 'patient-2', name: 'Jane' } });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Cross-object handoff');
  });

  it('complete flow: read same object then write same object succeeds', async () => {
    await executor.execute(readTool, { patient: { id: 'patient-1', name: 'John' } });
    const result = await executor.execute(writeTool, { patient: { id: 'patient-1', name: 'John' } });
    if (result.error && result.error.includes('Cross-object')) {
      fail('Should not throw CrossObjectHandoffError for same-object write');
    }
  });
});
