export interface AgentMessageSanitization {
  text: string;
  suppressed: boolean;
}

const INTERNAL_REASONING_PATTERNS: RegExp[] = [
  /\bthe phase reviewer\b/i,
  /\bsteps that ran\b/i,
  /\baction receipt\b/i,
  /\bvalidation failed\b/i,
  /\bcapability resolution\b/i,
  /\bbounded repair\b/i,
  /\boriginal failure\b/i,
  /\bexecution failed\b/i,
  /\btoolId\b/,
  /\btraceback \(most recent call last\)/i,
  /\bmoduleNotFoundError\b/i,
  /\btask output is incomplete\b/i,
];

export function isJsonPayload(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || !/^[[{]/.test(trimmed)) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

export function stripInternalReasoning(value: unknown): string {
  return (typeof value === 'string' ? value : '')
    .replace(/\n?\s*\[\s*\{?\s*\\?"toolId\\?"[\s\S]*$/i, '')
    .replace(/\s*Looking up tools, creating tools, or handing work off to another agent does not count as completing that action\.?/gi, '')
    .replace(/\s*Steps that ran:[\s\S]*$/i, '')
    .replace(/\s*The phase reviewer should use this blocker to regroup the task\.?/gi, '')
    .replace(/\s+—\s*$/, '')
    .trim();
}

export function isInternalReasoning(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  return INTERNAL_REASONING_PATTERNS.some((pattern) => pattern.test(value));
}

export function isAgentConversationPayload(value: unknown): boolean {
  if (!isJsonPayload(value)) return false;
  try {
    const parsed = JSON.parse(String(value).trim()) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return true;
    const record = parsed as Record<string, unknown>;
    return typeof record.tool === 'string'
      || typeof record.toolId === 'string'
      || typeof record.action === 'string'
      || typeof record.sourceCode === 'string'
      || typeof record.entrypoint === 'string'
      || Array.isArray(record.phases)
      || Array.isArray(record.tasks)
    || Array.isArray(record.artifacts)
    || 'plan' in record
    || typeof record.satisfied === 'boolean';
  } catch {
    return false;
  }
}

/**
 * Converts any agent-authored text into a message that is safe to publish in a
 * conversation. JSON actions, tool manifests, receipts, plans, and execution
 * traces are internal agent payloads, not user-facing replies.
 */
export function sanitizeAgentMessage(
  value: unknown,
  fallback = 'An Agent completed a step without a user-facing message.',
): AgentMessageSanitization {
  if (typeof value !== 'string') {
    return { text: fallback, suppressed: true };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { text: '', suppressed: false };
  }
  if (isAgentConversationPayload(trimmed)) {
    return { text: fallback, suppressed: true };
  }
  const cleaned = stripInternalReasoning(trimmed);
  if (!cleaned || isInternalReasoning(cleaned)) {
    return { text: fallback, suppressed: true };
  }
  return { text: cleaned, suppressed: false };
}

export function sanitizeAgentMessageList(
  values: readonly string[],
  fallback = 'An Agent completed a step without a user-facing message.',
): string {
  return values
    .map((value) => sanitizeAgentMessage(value, '').text)
    .filter((value) => value.length > 0)
    .join('; ') || fallback;
}