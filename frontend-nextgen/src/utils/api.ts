import type {
  AssistantWorkflow,
  AssistantWorkspace,
  ApprovalSummaryResponse,
  ExecutionSummaryResponse,
  NextActionsResponse,
  StateHistoryResponse,
  TransitionResponse,
  WorkspacesListResponse,
  AllowedTransitionsResponse,
  RuntimeWorkflowResponse,
} from '../types';

const API_BASE = '';

export async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function postJSON<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...init,
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function deleteResource(path: string): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
}

export async function putJSON<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...init,
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function patchJSON<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...init,
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// Sprint 5: typed helpers for the tool-executor workspace contract.
export const workspaceApi = {
  list: (params?: Record<string, string>): Promise<WorkspacesListResponse> => {
    const query = params && Object.keys(params).length
      ? `?${new URLSearchParams(params).toString()}`
      : '';
    return fetchJSON(`/api/tool-executor/workspaces${query}`);
  },
  create: (assistant: string, productObject: string): Promise<{ workspace: AssistantWorkspace; resumed: boolean }> =>
    postJSON(`/api/tool-executor/workspaces`, { assistant, productObject }),
  get: (workspaceId: string): Promise<AssistantWorkspace> =>
    fetchJSON(`/api/tool-executor/workspaces/${workspaceId}`),
  updateStage: (workspaceId: string, stage: string): Promise<AssistantWorkspace> =>
    patchJSON(`/api/tool-executor/workspaces/${workspaceId}/stage`, { stage }),
  updateState: (workspaceId: string, state: string): Promise<AssistantWorkspace> =>
    patchJSON(`/api/tool-executor/workspaces/${workspaceId}/state`, { state }),
  transition: (workspaceId: string, state: string): Promise<TransitionResponse> =>
    postJSON(`/api/tool-executor/workspaces/${workspaceId}/transition`, { state }),
  allowedTransitions: (workspaceId: string): Promise<AllowedTransitionsResponse> =>
    fetchJSON(`/api/tool-executor/workspaces/${workspaceId}/allowed-transitions`),
  stateHistory: (workspaceId: string): Promise<StateHistoryResponse> =>
    fetchJSON(`/api/tool-executor/workspaces/${workspaceId}/state-history`),
  nextActions: (workspaceId: string): Promise<NextActionsResponse> =>
    fetchJSON(`/api/tool-executor/workspaces/${workspaceId}/next-actions`),
  approvalSummary: (workspaceId: string): Promise<ApprovalSummaryResponse> =>
    fetchJSON(`/api/tool-executor/workspaces/${workspaceId}/approval-summary`),
  executionSummary: (workspaceId: string): Promise<ExecutionSummaryResponse> =>
    fetchJSON(`/api/tool-executor/workspaces/${workspaceId}/execution-summary`),
  reset: (workspaceId: string): Promise<AssistantWorkspace> =>
    postJSON(`/api/tool-executor/workspaces/${workspaceId}/reset`, {}),
  delete: (workspaceId: string): Promise<void> =>
    deleteResource(`/api/tool-executor/workspaces/${workspaceId}`),
};

export const workflowsApi = {
  list: (): Promise<{ workflows: AssistantWorkflow[] }> =>
    fetchJSON(`/api/tool-executor/workflows`),
  get: (assistant: string): Promise<AssistantWorkflow> =>
    fetchJSON(`/api/tool-executor/workflows/${encodeURIComponent(assistant)}`),
  getRuntime: (assistant: string, params?: { workspaceId?: string; executionId?: string; lastResultId?: string }): Promise<RuntimeWorkflowResponse> => {
    const query = params && Object.keys(params).length
      ? `?${new URLSearchParams(params as Record<string, string>).toString()}`
      : '';
    return fetchJSON(`/api/tool-executor/workflows/${encodeURIComponent(assistant)}/runtime${query}`);
  },
};