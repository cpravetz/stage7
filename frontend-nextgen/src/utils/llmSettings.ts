/**
 * Client-side contract for the `llm-config` settings document
 * (collection `settings`, tenantId `system`, stored via the artifacts
 * documents API).
 *
 * The artifacts POST upserts `data` wholesale, so the UI must round-trip
 * every field it knows about on save; `buildSavePayload` merges the edited
 * fields over the raw document as loaded so unknown fields survive too.
 *
 * Defaults mirror the server-side resolver in
 * shared-nextgen/src/utils/settings.ts (the browser has no env vars, so the
 * hardcoded default is the final fallback layer).
 */

export const LLM_CONFIG_DOC_ID = 'llm-config';

export const DEFAULT_PROVIDER_TIMEOUT_MS = 300_000;
export const DEFAULT_PROVIDER_ATTEMPT_TIMEOUT_MS = 310_000;
export const DEFAULT_COMPLETION_DEADLINE_MS = 900_000;
export const DEFAULT_CIRCUIT_THRESHOLD = 8;
export const DEFAULT_CIRCUIT_COOLDOWN_MS = 60_000;
export const DEFAULT_APPROVAL_TIMEOUT_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_APPROVAL_POLL_INTERVAL_MS = 3_000;
export const DEFAULT_WATCH_SCHEDULER_POLL_MS = 60_000;

export interface LlmSettings {
  freeModelsOnly: boolean;
  providerTimeoutMs: number;
  providerAttemptTimeoutMs: number;
  completionDeadlineMs: number;
  circuitThreshold: number;
  circuitCooldownMs: number;
  preferredModelIds: string[];
  forbiddenModelIds: string[];
  approvalTimeoutMs: number;
  approvalPollIntervalMs: number;
  watchSchedulerPollMs: number;
}

export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  freeModelsOnly: false,
  providerTimeoutMs: DEFAULT_PROVIDER_TIMEOUT_MS,
  providerAttemptTimeoutMs: DEFAULT_PROVIDER_ATTEMPT_TIMEOUT_MS,
  completionDeadlineMs: DEFAULT_COMPLETION_DEADLINE_MS,
  circuitThreshold: DEFAULT_CIRCUIT_THRESHOLD,
  circuitCooldownMs: DEFAULT_CIRCUIT_COOLDOWN_MS,
  preferredModelIds: [],
  forbiddenModelIds: [],
  approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS,
  approvalPollIntervalMs: DEFAULT_APPROVAL_POLL_INTERVAL_MS,
  watchSchedulerPollMs: DEFAULT_WATCH_SCHEDULER_POLL_MS,
};

function isValidPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function readPositiveNumber(data: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = data?.[key];
  return isValidPositive(value) ? value : fallback;
}

function readPositiveInteger(data: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = data?.[key];
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function readStringArray(data: Record<string, unknown> | undefined, key: string): string[] {
  const value = data?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

/**
 * Validates the raw `data` of the llm-config document into the settings
 * shape; a missing or invalid field falls back to the default so an old doc
 * containing only `{ freeModelsOnly }` renders exactly as before.
 */
export function parseLlmSettingsDoc(data: unknown): LlmSettings {
  const doc = (data && typeof data === 'object' ? data : undefined) as Record<string, unknown> | undefined;
  return {
    freeModelsOnly: typeof doc?.freeModelsOnly === 'boolean' ? doc.freeModelsOnly : DEFAULT_LLM_SETTINGS.freeModelsOnly,
    providerTimeoutMs: readPositiveNumber(doc, 'providerTimeoutMs', DEFAULT_PROVIDER_TIMEOUT_MS),
    providerAttemptTimeoutMs: readPositiveNumber(doc, 'providerAttemptTimeoutMs', DEFAULT_PROVIDER_ATTEMPT_TIMEOUT_MS),
    completionDeadlineMs: readPositiveNumber(doc, 'completionDeadlineMs', DEFAULT_COMPLETION_DEADLINE_MS),
    circuitThreshold: readPositiveInteger(doc, 'circuitThreshold', DEFAULT_CIRCUIT_THRESHOLD),
    circuitCooldownMs: readPositiveNumber(doc, 'circuitCooldownMs', DEFAULT_CIRCUIT_COOLDOWN_MS),
    preferredModelIds: readStringArray(doc, 'preferredModelIds'),
    forbiddenModelIds: readStringArray(doc, 'forbiddenModelIds'),
    approvalTimeoutMs: readPositiveNumber(doc, 'approvalTimeoutMs', DEFAULT_APPROVAL_TIMEOUT_MS),
    approvalPollIntervalMs: readPositiveNumber(doc, 'approvalPollIntervalMs', DEFAULT_APPROVAL_POLL_INTERVAL_MS),
    watchSchedulerPollMs: readPositiveNumber(doc, 'watchSchedulerPollMs', DEFAULT_WATCH_SCHEDULER_POLL_MS),
  };
}

/** Parses a comma-separated model-id list from a text input; blanks are dropped. */
export function parseModelIdList(text: string): string[] {
  return text
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Builds the save payload for the llm-config document: every known field is
 * written from the current form state (the artifacts POST replaces `data`
 * wholesale), merged over the raw document as loaded so fields the UI does
 * not model are preserved rather than silently dropped.
 */
export function buildSavePayload(
  rawLoadedData: Record<string, unknown> | undefined,
  settings: LlmSettings,
  preferredText: string,
  forbiddenText: string
): Record<string, unknown> {
  return {
    ...(rawLoadedData ?? {}),
    freeModelsOnly: settings.freeModelsOnly,
    providerTimeoutMs: settings.providerTimeoutMs,
    providerAttemptTimeoutMs: settings.providerAttemptTimeoutMs,
    completionDeadlineMs: settings.completionDeadlineMs,
    circuitThreshold: settings.circuitThreshold,
    circuitCooldownMs: settings.circuitCooldownMs,
    preferredModelIds: parseModelIdList(preferredText),
    forbiddenModelIds: parseModelIdList(forbiddenText),
    approvalTimeoutMs: settings.approvalTimeoutMs,
    approvalPollIntervalMs: settings.approvalPollIntervalMs,
    watchSchedulerPollMs: settings.watchSchedulerPollMs,
  };
}
