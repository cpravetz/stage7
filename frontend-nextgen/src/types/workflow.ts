export interface WorkflowStage {
  name: string;
  description: string;
  skills: Array<{
    id: string;
    name: string;
    description: string;
  }>;
}

export interface AssistantWorkflow {
  assistant: string;
  productObject: string;
  flow: string;
  stages: WorkflowStage[];
}

export type WorkflowState = 'analysis' | 'recommendation' | 'draft' | 'approved' | 'executed' | 'rejected';

export interface StateTransitionEvent {
  from: string;
  to: string;
  timestamp: string;
  trigger?: string;
}

export interface WorkspaceState {
  workspaceId: string;
  assistant: string;
  productObject: string;
  currentStage: string;
  workflowState: WorkflowState;
  lastResultId?: string;
  nextActions: string[];
  approvalHistory: Array<{
    executionId: string;
    toolId: string;
    toolName: string;
    state: WorkflowState;
    actor: string;
    scope: Record<string, unknown>;
    timestamp: string;
  }>;
  executionHistory: Array<{
    executionId: string;
    toolId: string;
    toolName: string;
    workflowState: WorkflowState;
    status: 'completed' | 'failed';
    startedAt: string;
    completedAt?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

// Sprint 5: assistant workspace contract consumed from /api/tool-executor/workspaces.
export interface AssistantWorkspace {
  workspaceId: string;
  assistant: string;
  productObject: string;
  currentStage: string;
  workflowState: WorkflowState;
  lastResultId?: string;
  nextActions: string[];
  approvalHistory: WorkspaceApprovalEntry[];
  executionHistory: WorkspaceExecutionEntry[];
  stateHistory: StateTransitionEvent[];
  runtimeInputs?: string | Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeWorkflowAction {
  id: string;
  name: string;
  description: string;
  type: string;
  confirmBeforeSend?: boolean;
  isSkill?: boolean;
  stage?: string;
  available: boolean;
  reason?: string;
}

export interface RuntimeWorkflowStage {
  name: string;
  description: string;
  status: 'current' | 'pending' | 'completed' | 'skipped';
  skills: RuntimeWorkflowAction[];
}

export interface RuntimeWorkflow {
  executionId: string;
  workspaceId?: string;
  assistantId?: string;
  assistant?: string;
  productObject?: string;
  flow?: string;
  currentStage: string;
  stages: RuntimeWorkflowStage[];
  workflowState: WorkflowState;
  nextActions: string[];
  allowedTransitions: WorkflowState[];
  stateHistory: StateTransitionEvent[];
  approvalHistory: WorkspaceApprovalEntry[];
  executionHistory: WorkspaceExecutionEntry[];
  lastResultId?: string;
  context: Record<string, unknown>;
  nextStep?: string;
  generatedAt: string;
}

export interface WorkspaceApprovalEntry {
  executionId: string;
  toolId: string;
  toolName: string;
  state: WorkflowState;
  actor: string;
  scope: Record<string, unknown>;
  timestamp: string;
}

export interface WorkspaceExecutionEntry {
  executionId: string;
  toolId: string;
  toolName: string;
  workflowState: WorkflowState;
  status: 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
}

export interface ApprovalSummary {
  approvals: WorkspaceApprovalEntry[];
  pending: WorkspaceApprovalEntry[];
  lastActor?: string;
}

export interface ExecutionSummary {
  executions: WorkspaceExecutionEntry[];
  lastStatus?: 'completed' | 'failed';
  lastResultId?: string;
}
export type { ToolBinding } from './workspace';
export type { Entity } from '../stores/entityStore';
