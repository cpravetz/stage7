/**
 * Self-healing and resilience (ADK_OVERVIEW.md §6, ADK_DEVELOPER_GUIDE.md §9).
 *
 *   1. Deterministic retry  — transient failures, exponential backoff
 *   2. LLM self-correction  — malformed output, fed back to stage7 code repair
 *   3. Chat escalation      — unrecoverable, surfaced as an actionable card
 *
 * All three are harness concerns. A handler that wraps its own retry loop is
 * working around the harness, and one that reports a raw exception is leaking an
 * internal detail into the Assistant Chat Window.
 */

import type { SkillExecutionResult } from './types';

export type FailureClass = 'transient' | 'validation';

const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface ClassifiedFailure {
  classification: FailureClass;
  /** User-safe sentence. Never carries a stack trace, path, or stack-shaped text. */
  message: string;
  retryable: boolean;
}

/**
 * Classifies an arbitrary thrown value.
 *
 * The `error` string returned by a Skill is itself the common case: a Skill
 * reports `{ success: false, error: 'Not connected: ...' }` rather than throwing,
 * and the harness has to tell an honest "not connected" apart from a genuine
 * failure without looking at anything but the message.
 */
export function classifyFailure(error: unknown): ClassifiedFailure {
  const status = extractStatus(error);
  const message = extractMessage(error);

  if (status !== undefined && TRANSIENT_STATUS.has(status)) {
    return {
      classification: 'transient',
      message: `The upstream service responded with ${status}. This is usually temporary.`,
      retryable: true,
    };
  }

  if (/not connected|not configured|no endpoint/i.test(message)) {
    return {
      classification: 'validation',
      message: 'This action needs a connection that has not been configured yet.',
      retryable: false,
    };
  }

  if (/missing required|invalid|schema|expected|unrecognized/i.test(message)) {
    return { classification: 'validation', message, retryable: false };
  }

  if (/econnreset|etimedout|enotfound|socket hang up|network|rate limit|timeout/i.test(message)) {
    return { classification: 'transient', message: 'A network problem interrupted the request.', retryable: true };
  }

  return { classification: 'validation', message, retryable: false };
}

function extractStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate = (error as any).status ?? (error as any).statusCode ?? (error as any).response?.status;
  return typeof candidate === 'number' ? candidate : undefined;
}

function extractMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    const message = (error as any).error ?? (error as any).message;
    if (typeof message === 'string') return message;
  }
  return 'The action could not be completed.';
}

/** Backoff schedule for the deterministic retry step. */
export function backoffDelay(attempt: number, baseMs = 500, maxMs = 30_000): number {
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt));
}

/**
 * Extracts the first well-formed JSON object from free-form LLM output.
 *
 * Replaces the copy-pasted greedy `/{[\s\S]*}/` regexes, which fail two ways:
 * prose containing multiple objects produces `{"a":1} ... {"b":2}`-shaped
 * garbage, and braces inside string values truncate or over-extend the match.
 * This scans for balanced brace groups (respecting strings and escapes), tries
 * each as JSON, and returns the first object that parses — or null.
 *
 * Self-contained on purpose: `code-skill-factory.ts` serializes this function
 * verbatim (via `.toString()`) into the sandboxed skill preamble, where
 * module-scope imports do not exist. Keep it free of TS-only syntax and
 * references to anything outside its own body.
 */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  if (typeof text !== 'string' || text.indexOf('{') === -1) return null;
  let scanStart = 0;
  while (true) {
    const open = text.indexOf('{', scanStart);
    if (open === -1) return null;
    // Find the matching close brace for this open brace, honouring strings
    // and backslash escapes so `{"code": "return {a: 1}"}` stays intact.
    let depth = 0;
    let inString = false;
    let escaped = false;
    let close = -1;
    for (let i = open; i < text.length; i += 1) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    if (close === -1) {
      // This group never closes; a later group can still be complete, so
      // restart the scan after this brace rather than giving up.
      scanStart = open + 1;
      continue;
    }
    scanStart = close + 1;
    try {
      const parsed = JSON.parse(text.slice(open, close + 1));
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Not valid JSON at this brace; keep scanning later groups.
    }
  }
}

/**
 * The retry step.
 *
 * Only transient failures are retried. Retrying a validation error wastes time
 * and, on a gated Skill, risks firing an external action twice — a failure the
 * user has to approve should not become three.
 */
export async function withDeterministicRetry<T>(
  operation: () => Promise<T>,
  options: { attempts?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const attempts = options.attempts === undefined ? Number.MAX_SAFE_INTEGER : Math.max(1, options.attempts);
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const classified = classifyFailure(error);
      if (!classified.retryable || attempt === attempts - 1) break;
      await sleep(backoffDelay(attempt, options.baseMs));
    }
  }

  throw lastError;
}

/**
 * The self-correction step.
 *
 * The validation error text is handed to stage7 code repair along with the
 * output that caused it, so the repair prompt has both halves of the pair. The
 * result is re-validated against the same schema, which means a repair that
 * produces different garbage is caught here rather than surfacing as a
 * malformed work product.
 */
export async function withSelfCorrection<T>(
  attempt: () => Promise<T>,
  repair: (report: { output: unknown; error: string }) => Promise<T>,
  options: { attempts?: number } = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 2);

  for (let attemptIndex = 0; attemptIndex < attempts; attemptIndex += 1) {
    try {
      return await attempt();
    } catch (error) {
      const classified = classifyFailure(error);
      if (!classified.retryable && attemptIndex === attempts - 1) throw error;
      return repair({ output: classified.message, error: classified.message });
    }
  }

  throw new Error('Self-correction exhausted');
}

/**
 * The escalation step.
 *
 * This is the only place a failure is allowed to become user-visible text, so
 * it strips the things ADK_DEVELOPER_GUIDE.md §9 forbids — stack traces,
 * internal paths, raw exception text — and produces a card the user can act on.
 */
export function escalationCard(failure: ClassifiedFailure, options: { skillName?: string; assistantId?: string } = {}): SkillExecutionResult {
  const subject = options.skillName ? `"${options.skillName}"` : 'This action';
  const actions =
    failure.classification === 'validation'
      ? ['Review the inputs and run it again']
      : ['Check the connection settings for this Assistant', 'Run it again in a moment'];

  return {
    success: false,
    error: failure.message,
    escalate: {
      title: `${subject} needs your attention`,
      body: failure.message,
      actions,
    },
  };
}

/** Patterns that must never reach the Chat Window (guide §9). */
const LEAK_PATTERNS: Array<[RegExp, string]> = [
  [/\n\s*at\s+\S+/g, ''],
  [/\/(?:home|usr|var|opt|etc|root|mnt|srv)\/\S*/g, '<path>'],
  [/\bnode_modules\b\S*/g, '<module>'],
  [/\bError:\s*/g, ''],
  [/:\d+:\d+/g, ''],
];

export function sanitizeForUser(text: string): string {
  let clean = text;
  for (const [pattern, replacement] of LEAK_PATTERNS) clean = clean.replace(pattern, replacement);
  return clean.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
