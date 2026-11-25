/**
 * Runtime settings for mission approval waits, stored as the
 * `mission/settings/approval-config` document in the artifacts service and
 * resolved with the environment as fallback — the same pattern as the Tier-1
 * Brain knobs (`brainSettings.ts`).
 *
 * Recognized document fields (camelCase, all optional):
 * - approvalTimeoutMs: how long a mission phase waits for human approval
 * - approvalPollIntervalMs: how often the approval state is polled while waiting
 *
 * A missing field falls back to its APPROVAL_* environment variable, then to
 * the built-in default. Invalid document fields are dropped individually —
 * one bad field never discards good ones.
 */

import { httpRequest, interServiceTimeoutMs } from '../utils/httpClient';
import { createSettingsDocSource, resolveOverride, intFromEnv } from './settingsDocSource';
import type { SettingsDocSnapshot } from './settingsDocSource';

/** Upper bounds so a settings typo cannot wedge a mission. */
export const MAX_MISSION_APPROVAL_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_MISSION_APPROVAL_POLL_INTERVAL_MS = 3_600_000;

export const DEFAULT_MISSION_APPROVAL_TIMEOUT_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_MISSION_APPROVAL_POLL_INTERVAL_MS = 3_000;

export const DEFAULT_MISSION_SETTINGS_DOC_ID = 'mission/settings/approval-config';
export const MISSION_SETTINGS_DOC_TYPE = 'approval-config';

export interface MissionSettingsOverrides {
  approvalTimeoutMs?: number;
  approvalPollIntervalMs?: number;
}

export interface MissionSettings {
  approvalTimeoutMs: number;
  approvalPollIntervalMs: number;
}

/** The knobs this module owns — used to whitelist document fields. */
const KNOB_KEYS: Array<keyof MissionSettingsOverrides> = [
  'approvalTimeoutMs',
  'approvalPollIntervalMs',
];

const KNOB_LIMITS: Record<keyof MissionSettingsOverrides, number> = {
  approvalTimeoutMs: MAX_MISSION_APPROVAL_TIMEOUT_MS,
  approvalPollIntervalMs: MAX_MISSION_APPROVAL_POLL_INTERVAL_MS,
};

/**
 * Validates an artifacts documents-API payload for the settings doc.
 * Field-level problems (wrong type, non-integer, out of bounds) are dropped
 * individually with a warning — a bad field never discards good ones.
 */
export function parseMissionSettingsDoc(
  payload: unknown,
  logger?: Pick<Console, 'warn'>,
): { status: 'ok' | 'unreachable'; overrides: MissionSettingsOverrides; reason?: string } {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    logger?.warn('[missionSettings] Settings document body is not a JSON object; ignoring it');
    return { status: 'unreachable', overrides: {}, reason: 'invalid JSON' };
  }
  const record = payload as Record<string, unknown>;
  const overrides: MissionSettingsOverrides = {};
  for (const key of KNOB_KEYS) {
    const value = record[key];
    if (value === undefined) continue;
    const resolved = resolveOverride(value, KNOB_LIMITS[key]);
    if (resolved === undefined) {
      logger?.warn(`[missionSettings] Ignoring invalid ${key} value in settings document: ${String(value)}`);
      continue;
    }
    overrides[key] = resolved;
  }
  return { status: 'ok', overrides };
}

/**
 * Resolves effective mission settings: document overrides first, then the
 * APPROVAL_* environment variable, then built-in defaults.
 */
export function resolveMissionSettings(
  overrides?: MissionSettingsOverrides,
  env: Record<string, string | undefined> = process.env,
): MissionSettings {
  return {
    approvalTimeoutMs: resolveOverride(overrides?.approvalTimeoutMs, MAX_MISSION_APPROVAL_TIMEOUT_MS)
      ?? intFromEnv(env, 'APPROVAL_TIMEOUT_MS', DEFAULT_MISSION_APPROVAL_TIMEOUT_MS, MAX_MISSION_APPROVAL_TIMEOUT_MS),
    approvalPollIntervalMs: resolveOverride(overrides?.approvalPollIntervalMs, MAX_MISSION_APPROVAL_POLL_INTERVAL_MS)
      ?? intFromEnv(env, 'APPROVAL_POLL_INTERVAL_MS', DEFAULT_MISSION_APPROVAL_POLL_INTERVAL_MS, MAX_MISSION_APPROVAL_POLL_INTERVAL_MS),
  };
}

export interface MissionSettingsSnapshotView {
  status: 'ok' | 'missing' | 'unreachable' | 'unfetched';
  overrides: MissionSettingsOverrides;
  /** Present when status is 'unreachable'. */
  reason?: string;
  fromCache: boolean;
}

export interface MissionSettingsSource {
  /** Last-known snapshot. Empty (status 'unfetched') until the first refresh resolves. */
  current(): MissionSettingsSnapshotView;
  /**
   * Returns the cached snapshot while it is fresh; otherwise fetches the
   * settings document once. Failed fetches are not cached — the next refresh
   * retries. Never rejects.
   */
  refresh(): Promise<MissionSettingsSnapshotView>;
  startPolling(intervalMs?: number): void;
}

export interface MissionSettingsSourceOptions {
  artifactsUrl?: string;
  docId?: string;
  ttlMs?: number;
  fetcher?: (url: string) => Promise<Pick<Response, 'ok' | 'status' | 'statusText' | 'json'>>;
  now?: () => number;
  logger?: Pick<Console, 'warn'>;
}

export type MissionSettingsSnapshot = SettingsDocSnapshot<MissionSettingsOverrides>;

function snapshotWithOverrides({ status, value, reason, fromCache }: MissionSettingsSnapshot): MissionSettingsSnapshotView {
  return { status, overrides: value, ...(reason !== undefined ? { reason } : {}), fromCache };
}

/**
 * Creates a TTL-cached reader for the mission settings document. The default
 * fetcher bounds the request with the inter-service timeout — unlike a circuit
 * of hot paths that read cached snapshots, a mission approval wait blocks on
 * this refresh before it can poll, so a hung artifacts service must not stall
 * it indefinitely.
 */
export function createMissionSettingsSource(options: MissionSettingsSourceOptions = {}): MissionSettingsSource {
  const fetcher = options.fetcher ?? ((url: string) => httpRequest(url, { timeoutMs: interServiceTimeoutMs() }));
  const source = createSettingsDocSource<MissionSettingsOverrides>({
    parse: (payload, logger) => {
      const parsed = parseMissionSettingsDoc(payload, logger);
      if (parsed.status === 'unreachable') return { status: 'unreachable', value: parsed.overrides, reason: parsed.reason };
      return { status: 'ok', value: parsed.overrides };
    },
    initialValue: () => ({}),
    logPrefix: 'missionSettings',
    artifactsUrl: options.artifactsUrl,
    docId: options.docId ?? DEFAULT_MISSION_SETTINGS_DOC_ID,
    ttlMs: options.ttlMs,
    fetcher,
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

/** Process-wide settings-doc source for the mission approval knobs. */
export const missionSettings: MissionSettingsSource = createMissionSettingsSource();
