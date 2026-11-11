import type {
  MissionCredentialRequest,
  MissionPendingInteraction,
} from '../types/workflow';
import type { TaskExecutionResult } from './TaskExecutionResult';

const ASK_USER_MARKER = '__ASK_USER__:';
const PERMISSION_MARKER = '__MISSION_PERMISSION__:';

function sanitizeQuestionText(question: string): string {
  let cleaned = question;
  // Remove any repeated ASK_USER markers or JSON fragments
  cleaned = cleaned.replace(/__ASK_USER__:\s*/g, '\n');
  cleaned = cleaned.replace(/__MISSION_PERMISSION__:\s*/g, '\n');
  // If there are multiple JSON objects concatenated, try to extract just the first clean question
  // Remove anything that looks like JSON arrays/objects after first question
  cleaned = cleaned.replace(/\n\s*\{[\s\S]*$/s, '');
  // Remove code fences
  cleaned = cleaned.replace(/```[\s\S]*```/g, '');
  cleaned = cleaned.trim();
  return cleaned;
}

export function parseInterruption(
  output: string,
): TaskExecutionResult['interruption'] | undefined {
  if (output.includes(ASK_USER_MARKER)) {
    // Extract only the first ASK_USER marker and its payload
    const firstMarkerIndex = output.indexOf(ASK_USER_MARKER);
    // Find where next marker starts or end of relevant content
    const afterFirst = output.slice(firstMarkerIndex);
    const nextMarkerIndex = afterFirst.indexOf(ASK_USER_MARKER, ASK_USER_MARKER.length);
    const payload = nextMarkerIndex >= 0 ? afterFirst.slice(ASK_USER_MARKER.length, nextMarkerIndex) : afterFirst.slice(ASK_USER_MARKER.length);
    let question = payload;
    let credentialRequest: MissionCredentialRequest | undefined;
    try {
      const parsed = JSON.parse(payload.trim()) as { question?: unknown; credentialRequest?: unknown };
      if (typeof parsed.question === 'string') question = parsed.question;
      if (parsed.credentialRequest && typeof parsed.credentialRequest === 'object' && !Array.isArray(parsed.credentialRequest)) {
        const candidate = parsed.credentialRequest as Record<string, unknown>;
        const missingCredentials = Array.isArray(candidate.missingCredentials)
          ? candidate.missingCredentials.filter((credential): credential is { key: string; label: string } =>
            Boolean(credential)
            && typeof credential === 'object'
            && !Array.isArray(credential)
            && typeof (credential as Record<string, unknown>).key === 'string'
            && typeof (credential as Record<string, unknown>).label === 'string',
          )
          : [];
        if (
          typeof candidate.executionId === 'string'
          && typeof candidate.toolId === 'string'
          && typeof candidate.toolName === 'string'
          && missingCredentials.length > 0
        ) {
          credentialRequest = {
            executionId: candidate.executionId,
            toolId: candidate.toolId,
            toolName: candidate.toolName,
            missingCredentials,
          };
        }
      }
    } catch {
      // Plain-text question markers remain supported.
    }
    question = sanitizeQuestionText(question);
    if (!question.trim()) throw new Error('Agent asked the user an empty question');
    return {
      kind: 'user_input',
      question: question.trim(),
      ...(credentialRequest ? { credentialRequest } : {}),
    };
  }

  if (!output.startsWith(PERMISSION_MARKER)) return undefined;
  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(output.slice(PERMISSION_MARKER.length)) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid permission request');
    }
    payload = parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Agent returned an invalid MCP permission request: ${error instanceof Error ? error.message : String(error)}`);
  }
  const request = payload.request && typeof payload.request === 'object'
    ? payload.request as Record<string, unknown>
    : {};
  const candidate = payload.candidate && typeof payload.candidate === 'object'
    ? payload.candidate as Record<string, unknown>
    : request.candidate && typeof request.candidate === 'object'
      ? request.candidate as Record<string, unknown>
      : {};
  const requestId = typeof request.id === 'string' ? request.id : '';
  const asStrings = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  if (!requestId || typeof candidate.name !== 'string') {
    throw new Error('Agent returned an MCP permission request without a request id or tool name');
  }
  const credentials = request.credentials && typeof request.credentials === 'object'
    ? request.credentials as Record<string, unknown>
    : {};
  const expiration = request.expiresAt;
  const expiresAt = typeof expiration === 'string' && Number.isFinite(Date.parse(expiration))
    ? new Date(expiration).toISOString()
    : undefined;
  const permission = {
    toolName: candidate.name,
    ...(typeof candidate.description === 'string' ? { toolDescription: candidate.description } : {}),
    ...(typeof candidate.publisher === 'string' ? { publisher: candidate.publisher } : {}),
    ...(typeof candidate.tier === 'string' ? { trustTier: candidate.tier } : {}),
    ...(typeof request.sideEffectClass === 'string' ? { sideEffectClass: request.sideEffectClass } : {}),
    dataClasses: asStrings(request.dataClasses),
    credentials: {
      needed: credentials.needed === true,
      ...(typeof credentials.source === 'string' ? { source: credentials.source } : {}),
      keys: asStrings(credentials.keys),
    },
    defaultScope: typeof request.defaultScope === 'string' ? request.defaultScope : 'task',
    availableScopes: asStrings(request.availableScopes),
    ...(expiresAt ? { expiresAt } : {}),
    explanation: typeof payload.prompt === 'string' ? payload.prompt : 'This discovered MCP tool requires your permission before it can be used.',
  };
  return { kind: 'mcp_permission', requestId, permission };
}
