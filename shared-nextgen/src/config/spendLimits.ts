/**
 * Spend-limit types and bounds shared by the Brain's spend gate, its routes,
 * and the frontend settings surface.
 *
 * The operator's `system`-bucket default lives in the settings document
 * (`settingsDocSource`); per-user limits are Mongo documents owned by the
 * Brain. All figures are estimated USD and all period boundaries are UTC.
 */

import { createSettingsDocSource } from './settingsDocSource';
import type { SettingsDocSnapshot } from './settingsDocSource';

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

/**
 * Body of an HTTP 429 spend-limit refusal — the contract callers and the
 * frontend build against (`services/brain/src/services/SpendGate.ts` is the
 * producer; the frontend's `utils/spendLimits.ts` mirrors the parser).
 */
export interface SpendLimitRefusalPayload {
  error: 'SPEND_LIMIT_REACHED';
  userId: string;
  period: SpendLimitPeriod;
  /** The cap, in estimated USD. */
  limit: number;
  /** Estimated USD recorded for the period when the call was refused. */
  spent: number;
  /** When activity resumes: the period's UTC end, ISO-encoded. */
  periodEnd: string;
}

/** Error code carried by every spend-limit refusal. */
export const SPEND_LIMIT_REACHED = 'SPEND_LIMIT_REACHED';

/**
 * Validates a spend-limit refusal body. Strict by design — only a payload
 * naming `SPEND_LIMIT_REACHED` with every contract field well-formed yields a
 * refusal, so a malformed error body can never fabricate a notice.
 */
export function parseSpendLimitRefusalPayload(payload: unknown): SpendLimitRefusalPayload | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const record = payload as Record<string, unknown>;
  if (record.error !== SPEND_LIMIT_REACHED) return undefined;
  const period = record.period;
  const limit = record.limit;
  const spent = record.spent;
  const periodEnd = record.periodEnd;
  const validPeriod = parseSpendLimitPeriod(period);
  if (validPeriod === undefined) return undefined;
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return undefined;
  if (typeof spent !== 'number' || !Number.isFinite(spent)) return undefined;
  if (typeof periodEnd !== 'string') return undefined;
  return {
    error: SPEND_LIMIT_REACHED,
    userId: typeof record.userId === 'string' ? record.userId : '',
    period: validPeriod,
    limit,
    spent,
    periodEnd,
  };
}

// Operator settings-doc source for the `system` attribution bucket. The
// settings document (`brain/settings/llm-config`, the doc the retired
// brainSettings module read) carries a `spendLimits` section; per-user limits
// are Mongo documents owned by the Brain's spend-limits routes.

/** Document section: the operator's per-bucket defaults. */
export interface SpendLimitsOverrides {
  /** Cap for calls with no resolvable user or assistant owner. */
  system?: SpendLimitConfig;
}

export const BRAIN_SETTINGS_DOC_ID = 'brain/settings/llm-config';

/** Validates a spending-limit period value; undefined passes through untouched. */
export function parseSpendLimitPeriod(value: unknown): SpendLimitPeriod | undefined {
  return value === 'day' || value === 'week' || value === 'month' ? value : undefined;
}

/** Validates a spending-limit amount: a finite number in (0, max]. */
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
    logger?.warn(`[spendLimits] Ignoring invalid ${label} value in settings document: ${String(value)}`);
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const limit = parseSpendLimitUsd(record.limit);
  if (record.limit !== undefined && limit === undefined) {
    logger?.warn(`[spendLimits] Ignoring invalid ${label}.limit value in settings document: ${String(record.limit)}`);
  }
  const period = record.period === undefined ? DEFAULT_SPEND_LIMIT_PERIOD : parseSpendLimitPeriod(record.period);
  if (record.period !== undefined && period === undefined) {
    logger?.warn(`[spendLimits] Ignoring invalid ${label}.period value in settings document: ${String(record.period)}`);
  }
  if (limit === undefined) return undefined;
  return { limit, period: period ?? DEFAULT_SPEND_LIMIT_PERIOD };
}

/** Extracts the `spendLimits` section from a settings document body. */
export function parseSpendLimitsOverrides(
  value: unknown,
  logger?: Pick<Console, 'warn'>,
): SpendLimitsOverrides {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    logger?.warn(`[spendLimits] Ignoring invalid spendLimits value in settings document: ${String(value)}`);
    return {};
  }
  const system = parseSpendLimitBucket((value as Record<string, unknown>).system, 'spendLimits.system', logger);
  return system ? { system } : {};
}

/**
 * Validates an artifacts documents-API payload for the spend-limits section.
 * Field-level problems (wrong type, non-positive, out of bounds) are dropped
 * individually with a warning — one bad field never discards good ones, and a
 * missing section means uncapped.
 */
export function parseSpendLimitsDoc(
  payload: unknown,
  logger?: Pick<Console, 'warn'>,
): { status: 'ok' | 'unreachable'; overrides: SpendLimitsOverrides; reason?: string } {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    logger?.warn('[spendLimits] Settings document body is not a JSON object; ignoring it');
    return { status: 'unreachable', overrides: {}, reason: 'invalid JSON' };
  }
  return { status: 'ok', overrides: parseSpendLimitsOverrides((payload as Record<string, unknown>).spendLimits, logger) };
}

export interface SpendLimitsSettingsView {
  status: 'ok' | 'missing' | 'unreachable' | 'unfetched';
  overrides: SpendLimitsOverrides;
  /** Present when status is 'unreachable'. */
  reason?: string;
  fromCache: boolean;
}

export interface SpendLimitsSettingsSource {
  /** Last-known snapshot. Empty (status 'unfetched') until the first refresh resolves. */
  current(): SpendLimitsSettingsView;
  /**
   * Returns the cached snapshot while it is fresh; otherwise fetches the
   * settings document once. Failed fetches are not cached — the next refresh
   * retries. Never rejects.
   */
  refresh(): Promise<SpendLimitsSettingsView>;
  startPolling(intervalMs?: number): void;
}

export interface SpendLimitsSettingsSourceOptions {
  artifactsUrl?: string;
  docId?: string;
  ttlMs?: number;
  fetcher?: (url: string) => Promise<Pick<Response, 'ok' | 'status' | 'statusText' | 'json'>>;
  now?: () => number;
  logger?: Pick<Console, 'warn'>;
}

function snapshotWithOverrides(
  { status, value, reason, fromCache }: SettingsDocSnapshot<SpendLimitsOverrides>,
): SpendLimitsSettingsView {
  return { status, overrides: value, ...(reason !== undefined ? { reason } : {}), fromCache };
}

/**
 * Creates a TTL-cached reader for the operator's spend-limits settings
 * document. Follows the missionSettings pattern: the source never rejects and
 * keeps the last known values on fetch failure, so a spend gate reading it
 * never throws from settings.
 */
export function createSpendLimitsSettingsSource(
  options: SpendLimitsSettingsSourceOptions = {},
): SpendLimitsSettingsSource {
  const source = createSettingsDocSource<SpendLimitsOverrides>({
    parse: (payload, logger) => {
      const parsed = parseSpendLimitsDoc(payload, logger);
      if (parsed.status === 'unreachable') return { status: 'unreachable', value: parsed.overrides, reason: parsed.reason };
      return { status: 'ok', value: parsed.overrides };
    },
    initialValue: () => ({}),
    logPrefix: 'spendLimits',
    artifactsUrl: options.artifactsUrl,
    docId: options.docId ?? BRAIN_SETTINGS_DOC_ID,
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

/** Process-wide settings-doc source for the operator's system-bucket default. */
export const spendLimitsSettings: SpendLimitsSettingsSource = createSpendLimitsSettingsSource();
