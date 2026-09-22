import type {
  AssistantWorkspace,
  WorkspaceApprovalEntry,
  WorkspaceExecutionEntry,
  StateTransitionEvent,
  RuntimeWorkflow,
} from './workflow';

export interface WorkflowStateContract {
  states: string[];
  transitions: Record<string, string[]>;
  initial: string;
}

export interface StateHistoryResponse {
  stateHistory: StateTransitionEvent[];
}

export interface PreviewResponse {
  summary: {
    toolName: string;
    toolId: string;
    action: string;
    object: string | undefined;
    scope: Record<string, unknown>;
    confirmBeforeSend: boolean;
    requiresConfirmation: boolean;
    dryRun: boolean;
    affectedRecords: number;
    expectedSideEffects: string[];
  };
}

// Sprint 5: workspace API responses consumed by the assistant workspace UI.
export interface WorkspacesListResponse {
  workspaces: AssistantWorkspace[];
  count: number;
}

export interface WorkspaceResponse {
  workspace: AssistantWorkspace;
}

export interface AllowedTransitionsResponse {
  allowedTransitions: string[];
}

export interface ApprovalSummaryResponse {
  approvals: WorkspaceApprovalEntry[];
  pending: WorkspaceApprovalEntry[];
  lastActor?: string;
}

export interface ExecutionSummaryResponse {
  executions: WorkspaceExecutionEntry[];
  lastStatus?: 'completed' | 'failed';
  lastResultId?: string;
}

export interface NextActionsResponse {
  nextActions: string[];
}

export interface TransitionResponse {
  workspace: AssistantWorkspace;
  allowedTransitions: string[];
}

export interface RuntimeWorkflowResponse {
  success: boolean;
  runtime: RuntimeWorkflow;
}