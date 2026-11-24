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

/**
 * Index of the bracket that closes the JSON value starting at `start`, or -1.
 * String literals and escapes are skipped so braces inside strings do not
 * confuse the scan.
 */
function findJsonBlockEnd(value: string, start: number): number {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index++) {
    const char = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{' || char === '[') stack.push(char === '{' ? '}' : ']');
    else if (char === '}' || char === ']') {
      if (stack.pop() !== char) return -1;
      if (stack.length === 0) return index;
    }
  }
  return -1;
}

/**
 * Removes structured JSON payloads embedded in agent text. Agent replies are
 * prose; a JSON object or array in a reply is internal data (a tool manifest,
 * plan, receipt, or action), never something to show a person.
 */
export function stripStructuredPayloads(value: string): string {
  if (!value) return '';
  let result = '';
  let index = 0;
  while (index < value.length) {
    const char = value[index];
    if (char === '{' || char === '[') {
      const end = findJsonBlockEnd(value, index);
      if (end > index) {
        const candidate = value.slice(index, end + 1);
        if (isJsonPayload(candidate)) {
          result += ' ';
          index = end + 1;
          continue;
        }
      }
    }
    result += char;
    index++;
  }
  return result.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function stripInternalReasoning(value: unknown): string {
  const source = typeof value === 'string' ? value : '';
  return stripStructuredPayloads(source
    .replace(/```(?:json|javascript|ts|typescript)?\s*[\s\S]*?```/gi, ' '))
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

/**
 * True for any structured JSON payload authored by an agent. Agent-to-user
 * conversation is prose; JSON is always internal transport (a tool manifest,
 * plan, receipt, action, or execution record) regardless of its keys. Key
 * sniffing previously let tool manifests named with `id`/`name`/`inputSchema`
 * reach the conversation as raw JSON dumps.
 */
export function isAgentConversationPayload(value: unknown): boolean {
  return isJsonPayload(value);
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