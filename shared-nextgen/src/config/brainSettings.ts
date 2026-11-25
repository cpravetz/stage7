/**
 * Runtime settings for the Brain service, stored as the `brain/settings/llm-config`
 * document in the artifacts service and resolved with the environment as fallback —
 * the same pattern as the existing `llm-config` settings document consumed by
 * BrainService.loadLlmSettings().
 *
 * Recognized document fields (camelCase, all optional):
 * - providerTimeoutMs: provider HTTP fetch timeout
 * - providerAttemptTimeoutMs: per-model attempt ceiling (wraps every attempt, incl. timeouts)
 * - completionDeadlineMs: whole-completion deadline
 * - circuitThreshold: consecutive provider failures that open the breaker
 * - circuitCooldownMs: open-state cooldown before a probe attempt
 *
 * A missing field falls back to its BRAIN_* environment variable, then to the
 * built-in default. Invalid document fields are dropped individually — one bad
 * field never discards good ones.
 */

import { httpRequest } from '../utils/httpClient';

/** Upper bounds so a settings typo cannot wedge the service. */
export const MAX_BRAIN_PROVIDER_TIMEOUT_MS = 600_000;
export const MAX_BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS = 1_800_000;
export const MAX_BRAIN_COMPLETION_DEADLINE_MS = 7_200_000;
export const MAX_BRAIN_CIRCUIT_THRESHOLD = 1_000;
export const MAX_BRAIN_CIRCUIT_COOLDOWN_MS = 3_600_000;

export const DEFAULT_BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS = 310_000;
export const DEFAULT_BRAIN_COMPLETION_DEADLINE_MS = 900_000;

export const DEFAULT_BRAIN_SETTINGS_DOC_ID = 'brain/settings/llm-config';
export const BRAIN_SETTINGS_DOC_TYPE = 'llm-config';

export interface BrainSettingsOverrides {
  providerTimeoutMs?: number;
  providerAttemptTimeoutMs?: number;
  completionDeadlineMs?: number;
  circuitThreshold?: number;
  circuitCooldownMs?: number;
}

export interface BrainSettings {
  providerTimeoutMs: number;
  providerAttemptTimeoutMs: number;
  completionDeadlineMs: number;
  circuitThreshold: number;
  circuitCooldownMs: number;
}

/** The knobs this module owns — used to whitelist document fields. */
const KNOB_KEYS: Array<keyof BrainSettingsOverrides> = [
  'providerTimeoutMs',
  'providerAttemptTimeoutMs',
  'completionDeadlineMs',
  'circuitThreshold',
  'circuitCooldownMs',
];

const KNOB_LIMITS: Record<keyof BrainSettingsOverrides, number> = {
  providerTimeoutMs: MAX_BRAIN_PROVIDER_TIMEOUT_MS,
  providerAttemptTimeoutMs: MAX_BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS,
  completionDeadlineMs: MAX_BRAIN_COMPLETION_DEADLINE_MS,
  circuitThreshold: MAX_BRAIN_CIRCUIT_THRESHOLD,
  circuitCooldownMs: MAX_BRAIN_CIRCUIT_COOLDOWN_MS,
};

export type BrainSettingsDocStatus = 'ok' | 'missing' | 'unreachable' | 'unfetched';

export interface BrainSettingsSnapshot {
  status: BrainSettingsDocStatus;
  overrides: BrainSettingsOverrides;
  /** Present when status is 'unreachable'. */
  reason?: string;
  /** True when this snapshot was not fetched fresh (cached, missing, or unreachable). */
  fromCache: boolean;
}

/**
 * Validates an artifacts documents-API payload for the settings doc.
 * Returns 'ok' with the whitelisted numeric overrides, 'missing' for an absent
 * document, or 'unreachable' for a service error / malformed body. Field-level
 * problems (wrong type, non-integer, out of bounds) are dropped individually
 * with a warning — a bad field never discards good ones.
 */
export function parseBrainSettingsDoc(
  payload: unknown,
  logger?: Pick<Console, 'warn'>,
): { status: BrainSettingsDocStatus; overrides: BrainSettingsOverrides; reason?: string; fromCache: false } {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    logger?.warn('[brainSettings] Settings document body is not a JSON object; ignoring it');
    return { status: 'unreachable', overrides: {}, reason: 'invalid JSON', fromCache: false };
  }
  const record = payload as Record<string, unknown>;
  const overrides: BrainSettingsOverrides = {};
  for (const key of KNOB_KEYS) {
    const value = record[key];
    if (value === undefined) continue;
    const valid = typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= KNOB_LIMITS[key];
    if (!valid) {
      logger?.warn(`[brainSettings] Ignoring invalid ${key} value in settings document: ${String(value)}`);
      continue;
    }
    overrides[key] = value;
  }
  return { status: 'ok', overrides, fromCache: false };
}

function intFromEnv(env: Record<string, string | undefined>, key: string, fallback: number, max: number): number {
  const parsed = Number(env[key]);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= max ? parsed : fallback;
}

function resolveOverride(value: unknown, max: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= max ? value : undefined;
}

/**
 * Resolves effective Brain settings: document overrides first, then the
 * BRAIN_* environment variable, then built-in defaults. The completion
 * deadline derives from the attempt ceiling when neither is set, so a longer
 * attempt ceiling cannot exceed the outer deadline.
 */
export function resolveBrainSettings(
  overrides?: BrainSettingsOverrides,
  env: Record<string, string | undefined> = process.env,
): BrainSettings {
  const providerAttemptTimeoutMs = resolveOverride(overrides?.providerAttemptTimeoutMs, MAX_BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS)
    ?? intFromEnv(env, 'BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS', DEFAULT_BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS, MAX_BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS);
  const completionDeadlineMs = resolveOverride(overrides?.completionDeadlineMs, MAX_BRAIN_COMPLETION_DEADLINE_MS)
    ?? intFromEnv(
      env,
      'BRAIN_COMPLETION_DEADLINE_MS',
      Math.max(providerAttemptTimeoutMs, Math.min(providerAttemptTimeoutMs * 3, DEFAULT_BRAIN_COMPLETION_DEADLINE_MS)),
      MAX_BRAIN_COMPLETION_DEADLINE_MS,
    );
  return {
    providerTimeoutMs: resolveOverride(overrides?.providerTimeoutMs, MAX_BRAIN_PROVIDER_TIMEOUT_MS)
      ?? intFromEnv(env, 'BRAIN_PROVIDER_TIMEOUT_MS', 300_000, MAX_BRAIN_PROVIDER_TIMEOUT_MS),
    providerAttemptTimeoutMs,
    completionDeadlineMs,
    circuitThreshold: resolveOverride(overrides?.circuitThreshold, MAX_BRAIN_CIRCUIT_THRESHOLD)
      ?? intFromEnv(env, 'BRAIN_CIRCUIT_THRESHOLD', 8, MAX_BRAIN_CIRCUIT_THRESHOLD),
    circuitCooldownMs: resolveOverride(overrides?.circuitCooldownMs, MAX_BRAIN_CIRCUIT_COOLDOWN_MS)
      ?? intFromEnv(env, 'BRAIN_CIRCUIT_COOLDOWN_MS', 60_000, MAX_BRAIN_CIRCUIT_COOLDOWN_MS),
  };
}

export interface BrainSettingsSource {
  /** Last-known snapshot. Empty (status 'unfetched') until the first refresh resolves. */
  current(): BrainSettingsSnapshot;
  /**
   * Returns the cached snapshot while it is fresh; otherwise fetches the
   * settings document once. Failed fetches are not cached — the next refresh
   * retries — so a recovering artifacts service is picked up immediately.
   * Never rejects.
   */
  refresh(): Promise<BrainSettingsSnapshot>;
  /**
   * Starts a background poll so `current()` stays fresh without any read
   * having to perform I/O — request hot paths read the last snapshot
   * synchronously. Fetches immediately, then every `intervalMs`. Idempotent;
   * the timer is unref'd so it never keeps the process alive.
   */
  startPolling(intervalMs?: number): void;
}

export interface BrainSettingsSourceOptions {
  artifactsUrl?: string;
  docId?: string;
  /** How long a successful fetch stays fresh. Default 30s, matching loadLlmSettings(). */
  ttlMs?: number;
  fetcher?: (url: string) => Promise<Pick<Response, 'ok' | 'status' | 'statusText' | 'json'>>;
  now?: () => number;
  logger?: Pick<Console, 'warn'>;
}

/**
 * Creates a TTL-cached reader for the settings document. Overrides seen in any
 * snapshot — even a failed or missing one — are kept so an operator's
 * correction never flickers off while the artifacts service is unavailable.
 */
export function createBrainSettingsSource(options: BrainSettingsSourceOptions = {}): BrainSettingsSource {
  const artifactsUrl = (options.artifactsUrl ?? process.env.ARTIFACTS_URL ?? 'http://artifacts:4200').replace(/\/$/, '');
  const docId = options.docId ?? DEFAULT_BRAIN_SETTINGS_DOC_ID;
  const ttlMs = options.ttlMs ?? 30_000;
  const fetcher = options.fetcher ?? ((url) => httpRequest(url));
  const now = options.now ?? Date.now;
  const logger = options.logger ?? console;

  let cached: BrainSettingsSnapshot = { status: 'unfetched', overrides: {}, fromCache: true };
  let fetchedAt = -Infinity; // -Infinity forces the first refresh to fetch
  let inFlight: Promise<BrainSettingsSnapshot> | undefined;
  let pollTimer: NodeJS.Timeout | undefined;

  function keepOverridesOnFailure(
    status: Extract<BrainSettingsDocStatus, 'missing' | 'unreachable'>,
    reason?: string,
  ): BrainSettingsSnapshot {
    return { status, reason, overrides: { ...cached.overrides }, fromCache: true };
  }

  async function fetchOnce(): Promise<BrainSettingsSnapshot> {
    let snapshot: BrainSettingsSnapshot;
    try {
      const response = await fetcher(`${artifactsUrl}/api/artifacts/documents/${docId}`);
      if (response.status === 404) {
        // The document has never been written: an expected state until an
        // operator saves settings, so no warning.
        snapshot = keepOverridesOnFailure('missing');
      } else if (!response.ok) {
        const reason = response.statusText || String(response.status);
        logger.warn(`[brainSettings] Settings document request failed with ${response.status}; Brain knobs fall back to environment values`);
        snapshot = keepOverridesOnFailure('unreachable', reason);
      } else {
        const parsed = parseBrainSettingsDoc(await response.json(), logger);
        snapshot = { ...parsed, fromCache: false };
      }
    } catch (reason) {
      logger.warn(`[brainSettings] Failed to read settings document (${reason instanceof Error ? reason.message : String(reason)}); Brain knobs fall back to environment values`);
      snapshot = keepOverridesOnFailure('unreachable', reason instanceof Error ? reason.message : String(reason));
    }
    cached = snapshot;
    if (snapshot.status === 'ok') fetchedAt = now();
    return { ...cached };
  }

  function refresh(): Promise<BrainSettingsSnapshot> {
    if (inFlight) return inFlight;
    if (now() - fetchedAt < ttlMs) return Promise.resolve({ ...cached });
    inFlight = fetchOnce().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  }

  return {
    current() {
      return { ...cached };
    },
    refresh,
    startPolling(intervalMs = ttlMs) {
      if (pollTimer) return;
      void refresh();
      pollTimer = setInterval(() => {
        void refresh();
      }, intervalMs);
      pollTimer.unref?.();
    },
  };
}

/** Process-wide settings-doc source for the Brain knobs. */
export const brainSettings: BrainSettingsSource = createBrainSettingsSource();

let latestResolved: BrainSettings | undefined;

/**
 * Publishes the most recently resolved settings so synchronous hot paths that
 * have no request context (e.g. the provider fetch timeout) can pick up doc
 * overrides without blocking on a settings fetch. Published per completion by
 * the Brain service; a failed/unreachable doc simply leaves the last snapshot.
 */
export function publishResolvedBrainSettings(settings: BrainSettings): void {
  latestResolved = settings;
}

export function latestResolvedBrainSettings(): BrainSettings | undefined {
  return latestResolved;
}
