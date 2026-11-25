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

/**
 * API failure with the response attached. Status and body ride on the error so
 * callers can react to a specific refusal contract (e.g. HTTP 429
 * SPEND_LIMIT_REACHED) instead of reparsing a formatted message.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, statusText: string, path: string, body?: unknown) {
    super(`API error: ${status} ${statusText} for ${path}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  // Default to no-cache so the UI always sees the latest assistant and tool
  // registry state. Browsers sometimes return 304s from a stale cache which
  // causes the workspace to render inconsistent bindings across refreshes.
  // Use no-store to avoid conditional GET/304 responses for dynamic assistant/tool
  // registry endpoints. This prevents the client from receiving 304 Not Modified
  // and misinterpreting it as an error which previously emptied the skill list
  // and caused a save that persisted an empty tools array.
  const defaultInit: RequestInit = { cache: 'no-store' };
  const response = await fetch(`${API_BASE}${path}`, { ...defaultInit, ...(init || {}) });
  if (response.status === 304) {
    // A conditional GET should never happen with no-store; treat it as a
    // specific, diagnosable failure instead of fabricating stale data.
    throw new Error(`API error: 304 Not Modified for ${path}`);
  }
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText, path);
  }
  const text = await response.text();
  if (!text) {
    throw new Error(`API error: ${response.status} empty response body for ${path}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`API error: ${response.status} invalid JSON response for ${path}`);
  }
}

export async function postJSON<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  return sendJSON<T>(path, 'POST', body, init);
}

async function sendJSON<T>(path: string, method: string, body: unknown, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...init,
  });
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText, path, await safeBody(response));
  }
  return response.json();
}

/** The refusal payload is diagnostic; a body that will not parse is not fatal. */
async function safeBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export async function postFormData<T>(path: string, body: FormData, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    body,
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
    throw new ApiError(response.status, response.statusText, path);
  }
}

export async function putJSON<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  return sendJSON<T>(path, 'PUT', body, init);
}

export async function patchJSON<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  return sendJSON<T>(path, 'PATCH', body, init);
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
  update: (workspaceId: string, data: Record<string, unknown>): Promise<AssistantWorkspace> =>
    patchJSON(`/api/tool-executor/workspaces/${workspaceId}`, data),
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