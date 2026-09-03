export interface WorkflowInput {
  missionId: string;
  tenantId: string;
  assistantId: string;
  prompt: string;
  contextChunks?: Array<{ content: string; tokens: number; priority: number }>;
  metadata?: Record<string, unknown>;
}

export interface WorkflowResult {
  missionId: string;
  status: 'completed' | 'failed' | 'canceled' | 'continued-as-new';
  output?: unknown;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

export interface WorkflowState {
  missionId: string;
  currentStep: number;
  totalSteps: number;
  history: Array<{
    step: number;
    status: 'pending' | 'running' | 'completed' | 'failed';
    startedAt?: number;
    completedAt?: number;
    result?: unknown;
    error?: string;
  }>;
}

export interface ActivityResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
