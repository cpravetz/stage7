import { httpRequest, interServiceTimeoutMs } from './httpClient';
import { getServiceAuthorizationHeaders } from './serviceAuth';
import { logger } from './logger';

/**
 * Shared settings resolver for the `llm-config` settings document
 * (collection `settings`, tenantId `system`, stored via the artifacts
 * documents API).
 *
 * Every field is validated on read; a missing or invalid value falls back to
 * the documented env var, then to the hardcoded default that equals today's
 * env fallback. An old doc that contains only `{ freeModelsOnly }` therefore
 * behaves exactly as it did before the other fields existed.
 */

export type BrainDeadlineVariant = 'brain' | 'agentRuntime' | 'temporal';

// Defaults verified against the env fallbacks the services use today.
export const DEFAULT_PROVIDER_TIMEOUT_MS = 300_000; // BRAIN_PROVIDER_TIMEOUT_MS
export const DEFAULT_PROVIDER_ATTEMPT_TIMEOUT_MS = 310_000; // BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS
export const DEFAULT_COMPLETION_DEADLINE_MS = 900_000; // flat fallback when no env deadline
export const DEFAULT_CIRCUIT_THRESHOLD = 8; // BRAIN_CIRCUIT_THRESHOLD
export const DEFAULT_CIRCUIT_COOLDOWN_MS = 60_000; // BRAIN_CIRCUIT_COOLDOWN_MS
export const TEMPORAL_DEADLINE_HEADROOM_MS = 60_000; // temporal adds 60s over the brain deadline
export const DEFAULT_APPROVAL_TIMEOUT_MS = 24 * 60 * 60 * 1000; // APPROVAL_TIMEOUT_MS (24h)
export const DEFAULT_APPROVAL_POLL_INTERVAL_MS = 3_000; // APPROVAL_POLL_INTERVAL_MS
export const DEFAULT_WATCH_SCHEDULER_POLL_MS = 60_000; // WATCH_SCHEDULER_POLL_MS

/** Parsed settings document. `completionDeadlineMs` is undefined when absent so the consumer applies its variant formula. */
export interface LlmSettings {
  freeModelsOnly: boolean;
  providerTimeoutMs: number;
  providerAttemptTimeoutMs: number;
  completionDeadlineMs: number | undefined;
  circuitThreshold: number;
  circuitCooldownMs: number;
  preferredModelIds: string[];
  forbiddenModelIds: string[];
  approvalTimeoutMs: number;
  approvalPollIntervalMs: number;
  watchSchedulerPollMs: number;
}

function isValidPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function envNumber(envName: string): number | undefined {
  const configured = Number(process.env[envName]);
  return isValidPositive(configured) ? configured : undefined;
}

function readPositiveNumber(data: Record<string, unknown> | undefined, key: string, envName: string, fallback: number): number {
  const docValue = data?.[key];
  if (isValidPositive(docValue)) return docValue;
  return envNumber(envName) ?? fallback;
}

function readPositiveInteger(data: Record<string, unknown> | undefined, key: string, envName: string, fallback: number): number {
  const docValue = data?.[key];
  if (typeof docValue === 'number' && Number.isInteger(docValue) && docValue > 0) return docValue;
  return envNumber(envName) ?? fallback;
}

function readStringArray(data: Record<string, unknown> | undefined, key: string): string[] {
  const value = data?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

/**
 * Validates the raw `data` of the llm-config document into the settings
 * shape, applying env fallbacks then defaults field by field.
 */
export function parseLlmSettings(data: unknown): LlmSettings {
  const doc = (data && typeof data === 'object' ? data : undefined) as Record<string, unknown> | undefined;
  const docDeadline = doc?.completionDeadlineMs;
  const envDeadline = envNumber('BRAIN_COMPLETION_DEADLINE_MS');
  return {
    freeModelsOnly: typeof doc?.freeModelsOnly === 'boolean' ? doc.freeModelsOnly : false,
    providerTimeoutMs: readPositiveNumber(doc, 'providerTimeoutMs', 'BRAIN_PROVIDER_TIMEOUT_MS', DEFAULT_PROVIDER_TIMEOUT_MS),
    providerAttemptTimeoutMs: readPositiveNumber(doc, 'providerAttemptTimeoutMs', 'BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS', DEFAULT_PROVIDER_ATTEMPT_TIMEOUT_MS),
    completionDeadlineMs: isValidPositive(docDeadline) ? docDeadline : envDeadline,
    circuitThreshold: readPositiveInteger(doc, 'circuitThreshold', 'BRAIN_CIRCUIT_THRESHOLD', DEFAULT_CIRCUIT_THRESHOLD),
    circuitCooldownMs: readPositiveNumber(doc, 'circuitCooldownMs', 'BRAIN_CIRCUIT_COOLDOWN_MS', DEFAULT_CIRCUIT_COOLDOWN_MS),
    preferredModelIds: readStringArray(doc, 'preferredModelIds'),
    forbiddenModelIds: readStringArray(doc, 'forbiddenModelIds'),
    approvalTimeoutMs: readPositiveNumber(doc, 'approvalTimeoutMs', 'APPROVAL_TIMEOUT_MS', DEFAULT_APPROVAL_TIMEOUT_MS),
    approvalPollIntervalMs: readPositiveNumber(doc, 'approvalPollIntervalMs', 'APPROVAL_POLL_INTERVAL_MS', DEFAULT_APPROVAL_POLL_INTERVAL_MS),
    watchSchedulerPollMs: readPositiveNumber(doc, 'watchSchedulerPollMs', 'WATCH_SCHEDULER_POLL_MS', DEFAULT_WATCH_SCHEDULER_POLL_MS),
  };
}

/**
 * Resolves the brain completion deadline from an optional settings value and
 * the service's fallback shape:
 *
 * - `settingsValue` wins whenever it is a positive finite number.
 * - `brain` / `agentRuntime` derive the default from the per-attempt timeout
 *   (3x, capped at 15 minutes, floored at the attempt timeout itself), with
 *   310000 as the attempt timeout when none was supplied.
 * - `temporal` adds a 60-second headroom over an already-resolved brain
 *   deadline passed as `attemptTimeoutMs`, falling back to the flat 900000
 *   default when no deadline is available.
 */
export function resolveBrainCompletionDeadlineMs(input: {
  settingsValue?: number;
  attemptTimeoutMs?: number;
  variant: BrainDeadlineVariant;
}): number {
  const { settingsValue, attemptTimeoutMs, variant } = input;
  if (isValidPositive(settingsValue)) return settingsValue;
  if (variant === 'temporal') {
    return isValidPositive(attemptTimeoutMs)
      ? attemptTimeoutMs + TEMPORAL_DEADLINE_HEADROOM_MS
      : DEFAULT_COMPLETION_DEADLINE_MS;
  }
  const attempt = isValidPositive(attemptTimeoutMs) ? attemptTimeoutMs : DEFAULT_PROVIDER_ATTEMPT_TIMEOUT_MS;
  return Math.max(attempt, Math.min(attempt * 3, DEFAULT_COMPLETION_DEADLINE_MS));
}

const LLM_SETTINGS_TTL_MS = 30_000;

let settingsCache: { settings: LlmSettings; fetchedAt: number } | null = null;

/**
 * Fetches and parses the llm-config document, cached for 30 seconds. A 404 or
 * any other failure resolves to null — "restriction unknown" — without
 * caching, so the next call retries rather than pinning the outage for a full
 * TTL. Callers should treat null as "no settings", not as an error.
 */
export async function fetchLlmSettingsDoc(artifactsUrl: string): Promise<LlmSettings | null> {
  const cached = settingsCache;
  if (cached && Date.now() - cached.fetchedAt < LLM_SETTINGS_TTL_MS) {
    return cached.settings;
  }
  const base = artifactsUrl.replace(/\/+$/, '');
  try {
    const headers = { 'Content-Type': 'application/json', ...(await getServiceAuthorizationHeaders()) };
    const response = await httpRequest(`${base}/api/artifacts/documents/llm-config`, {
      method: 'GET',
      headers,
      timeoutMs: interServiceTimeoutMs(),
    });
    if (!response.ok) {
      logger.warn({ status: response.status }, 'Failed to read llm-config settings document');
      return null;
    }
    const doc = await response.json() as { data?: Record<string, unknown> };
    const settings = parseLlmSettings(doc?.data);
    settingsCache = { settings, fetchedAt: Date.now() };
    return settings;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Failed to load llm-config settings document');
    return null;
  }
}

/** Clears the settings cache; used by tests. */
export function resetLlmSettingsCacheForTests(): void {
  settingsCache = null;
}
