import { MissionArtifact, Task } from '@stage7-nextgen/shared';
import type { MissionPendingInteraction } from '../types/workflow';

export interface TaskExecutionResult {
  output: string;
  incompleteReason?: string;
  artifacts: MissionArtifact[];
  actionReceipts?: Array<{
    toolId: string;
    isError: boolean;
    content: string;
    outcome: 'success' | 'failure' | 'denied' | 'question_asked' | 'permission_required';
    actionKey?: string;
    fallbackForToolId?: string;
    resolvedToolId?: string;
  }>;
  interruption?: Pick<MissionPendingInteraction, 'kind' | 'question' | 'credentialRequest' | 'requestId' | 'permission'>;
  tokensUsed: number;
  model?: string;
  provider?: string;
  requestId?: string;
  reasoning?: string;
}

export interface PromptTaskRequest {
  taskId: string;
  type: string;
  prompt: string;
  phaseId?: string;
  expectedArtifacts?: string[];
  requiredActions?: NonNullable<Task['requiredActions']>;
  context?: Record<string, unknown>;
  requireCompletedReceipt?: boolean;
  executionPolicy?: {
    mode?: string;
    maxActions?: number;
    maxCompletionTokens?: number;
    maxCompletionTokensPerCall?: number;
    maxDelegations?: number;
  };
  retryGuidance?: string;
}
