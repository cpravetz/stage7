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
 * - spendLimits.system: operator default cap for the `system` attribution
 *   bucket — { limit: estimated USD, period: day|week|month }, uncapped until set
 *
 * A missing field falls back to its BRAIN_* environment variable, then to the
 * built-in default. Invalid document fields are dropped individually — one bad
 * field never discards good ones.
 */

import { createSettingsDocSource, resolveOverride, intFromEnv } from './settingsDocSource';
import type { SettingsDocStatus, SettingsDocSnapshot } from './settingsDocSource';

/** Upper bounds so a settings typo cannot wedge the service. */
export const MAX_BRAIN_PROVIDER_TIMEOUT_MS = 600_000;
export const MAX_BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS = 1_800_000;
export const MAX_BRAIN_COMPLETION_DEADLINE_MS = 7_200_000;
/** Period boundaries for a spending cap. All UTC. */
export type SpendLimitPeriod = 'day' | 'week' | 'month';

/** Operator-configurable cap. Estimated USD; 0 and negatives are never valid. */
export const MAX_BRAIN_SPEND_LIMIT_USD = 1_000_000;
export const DEFAULT_SPEND_LIMIT_PERIOD: SpendLimitPeriod = 'month';

/** One cap: an estimated-USD ceiling over a UTC period. */
export interface SpendLimitConfig {
  limit: number;
  period: SpendLimitPeriod;
}

export interface BrainSettingsOverrides {
  providerTimeoutMs?: number;
  providerAttemptTimeoutMs?: number;
  completionDeadlineMs?: number;
  circuitThreshold?: number;
  circuitCooldownMs?: number;
  /** Operator defaults; `system` is the bucket for calls with no resolvable user. */
  spendLimits?: {
    system?: SpendLimitConfig;
  };
}

export interface BrainSettings {
  providerTimeoutMs: number;
  providerAttemptTimeoutMs: number;
  completionDeadlineMs: number;
  circuitThreshold: number;
  circuitCooldownMs: number;
  /** Uncapped (undefined) until an operator sets one. */
  spendLimits: {
    system?: SpendLimitConfig;
  };
}

/** Validates a spending-limit period value; undefined passes through untouched. */
export function parseSpendLimitPeriod(value: unknown): SpendLimitPeriod | undefined {
  return value === 'day' || value === 'week' || value === 'month' ? value : undefined;
}

/** Validates a spending-limit amount: a finite number in (0, MAX_BRAIN_SPEND_LIMIT_USD]. */
export function parseSpendLimitUsd(value: unknown, max = MAX_BRAIN_SPEND_LIMIT_USD): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max ? value : undefined;
}

/** Validates one bucket of the settings doc's spendLimits section, field by field. */
function parseSpendLimitBucket(
  value: unknown,
  label: string,
  logger?: Pick<Console, 'warn'>,
): SpendLimitConfig | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    logger?.warn(`[brainSettings] Ignoring invalid ${label} value in settings document: ${String(value)}`);
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const limit = parseSpendLimitUsd(record.limit);
  if (record.limit !== undefined && limit === undefined) {
    logger?.warn(`[brainSettings] Ignoring invalid ${label}.limit value in settings document: ${String(record.limit)}`);
  }
  const period = record.period === undefined ? DEFAULT_SPEND_LIMIT_PERIOD : parseSpendLimitPeriod(record.period);
  if (record.period !== undefined && period === undefined) {
    logger?.warn(`[brainSettings] Ignoring invalid ${label}.period value in settings document: ${String(record.period)}`);
  }
  if (limit === undefined) return undefined;
  return { limit, period: period ?? DEFAULT_SPEND_LIMIT_PERIOD };
}

function parseSpendLimitsOverrides(
  value: unknown,
  logger?: Pick<Console, 'warn'>,
): BrainSettingsOverrides['spendLimits'] {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    logger?.warn(`[brainSettings] Ignoring invalid spendLimits value in settings document: ${String(value)}`);
    return undefined;
  }
  const system = parseSpendLimitBucket((value as Record<string, unknown>).system, 'spendLimits.system', logger);
  return system ? { system } : {};
}
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

/** The flat numeric knobs this module owns — used to whitelist document fields. */
type BrainNumericKnob = Exclude<keyof BrainSettingsOverrides, 'spendLimits'>;
const KNOB_KEYS: BrainNumericKnob[] = [
  'providerTimeoutMs',
  'providerAttemptTimeoutMs',
  'completionDeadlineMs',
  'circuitThreshold',
  'circuitCooldownMs',
];

const KNOB_LIMITS: Record<BrainNumericKnob, number> = {
  providerTimeoutMs: MAX_BRAIN_PROVIDER_TIMEOUT_MS,
  providerAttemptTimeoutMs: MAX_BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS,
  completionDeadlineMs: MAX_BRAIN_COMPLETION_DEADLINE_MS,
  circuitThreshold: MAX_BRAIN_CIRCUIT_THRESHOLD,
  circuitCooldownMs: MAX_BRAIN_CIRCUIT_COOLDOWN_MS,
};

export type BrainSettingsDocStatus = SettingsDocStatus;

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
 * Returns 'ok' with the whitelisted numeric overrides, or 'unreachable' for a
 * malformed body. Field-level problems (wrong type, non-integer, out of
 * bounds) are dropped individually with a warning — a bad field never
 * discards good ones.
 */
export function parseBrainSettingsDoc(
  payload: unknown,
  logger?: Pick<Console, 'warn'>,
): { status: BrainSettingsDocStatus; overrides: BrainSettingsOverrides; reason?: string } {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    logger?.warn('[brainSettings] Settings document body is not a JSON object; ignoring it');
    return { status: 'unreachable', overrides: {}, reason: 'invalid JSON' };
  }
  const record = payload as Record<string, unknown>;
  const overrides: BrainSettingsOverrides = {};
  for (const key of KNOB_KEYS) {
    const value = record[key];
    if (value === undefined) continue;
    const resolved = resolveOverride(value, KNOB_LIMITS[key]);
    if (resolved === undefined) {
      logger?.warn(`[brainSettings] Ignoring invalid ${key} value in settings document: ${String(value)}`);
      continue;
    }
    overrides[key] = resolved;
  }
  const spendLimits = parseSpendLimitsOverrides(record.spendLimits, logger);
  if (spendLimits !== undefined) overrides.spendLimits = spendLimits;
  return { status: 'ok', overrides };
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
    spendLimits: {
      system: overrides?.spendLimits?.system
        ?? systemSpendLimitFromEnv(env),
    },
  };
}

/**
 * Environment fallback for the system-bucket operator default: a limit in
 * estimated USD plus an optional period (default month). Unset means the
 * system bucket stays uncapped.
 */
function systemSpendLimitFromEnv(env: Record<string, string | undefined>): SpendLimitConfig | undefined {
  const limit = parseSpendLimitUsd(Number(env.BRAIN_SPEND_LIMIT_SYSTEM_USD));
  if (limit === undefined) return undefined;
  const period = parseSpendLimitPeriod(env.BRAIN_SPEND_LIMIT_SYSTEM_PERIOD) ?? DEFAULT_SPEND_LIMIT_PERIOD;
  return { limit, period };
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

function snapshotWithOverrides({ status, value, reason, fromCache }: SettingsDocSnapshot<BrainSettingsOverrides>): BrainSettingsSnapshot {
  return { status, overrides: value, ...(reason !== undefined ? { reason } : {}), fromCache };
}

/**
 * Creates a TTL-cached reader for the settings document. Overrides seen in any
 * snapshot — even a failed or missing one — are kept so an operator's
 * correction never flickers off while the artifacts service is unavailable.
 */
export function createBrainSettingsSource(options: BrainSettingsSourceOptions = {}): BrainSettingsSource {
  const source = createSettingsDocSource<BrainSettingsOverrides>({
    parse: (payload, logger) => {
      const parsed = parseBrainSettingsDoc(payload, logger);
      if (parsed.status === 'unreachable') return { status: 'unreachable', value: parsed.overrides, reason: parsed.reason };
      return { status: 'ok', value: parsed.overrides };
    },
    initialValue: () => ({}),
    logPrefix: 'brainSettings',
    artifactsUrl: options.artifactsUrl,
    docId: options.docId ?? DEFAULT_BRAIN_SETTINGS_DOC_ID,
    ttlMs: options.ttlMs,
    fetcher: options.fetcher,
    now: options.now,
    logger: options.logger,
  });
  return {
    current() {
      return snapshotWithOverrides(source.current());
    },
    async refresh() {
      return snapshotWithOverrides(await source.refresh());
    },
    startPolling(intervalMs) {
      source.startPolling(intervalMs);
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
