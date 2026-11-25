/**
 * Generic TTL-cached reader for a settings document stored in the artifacts
 * documents API — the machinery behind the mission approval settings
 * (`missionSettings.ts`).
 *
 * Semantics (shared by every consumer):
 * - A missing (404) or unreachable document keeps the last known values, so an
 *   operator's correction never flickers off while the artifacts service is
 *   unavailable. Failed fetches are not cached — the next refresh retries.
 * - `refresh()` coalesces concurrent calls into a single fetch and returns the
 *   cached snapshot while it is fresh. Never rejects.
 * - `startPolling()` fetches immediately, then on each interval; the timer is
 *   unref'd so it never keeps the process alive.
 */

import { httpRequest } from '../utils/httpClient';

export type SettingsDocStatus = 'ok' | 'missing' | 'unreachable' | 'unfetched';

export interface SettingsDocSnapshot<T> {
  status: SettingsDocStatus;
  /** Last known values. Empty (per `initialValue`) until the first refresh resolves. */
  value: T;
  /** Present when status is 'unreachable'. */
  reason?: string;
  /** True when this snapshot was not fetched fresh (cached, missing, or unreachable). */
  fromCache: boolean;
}

export interface ParsedSettingsDoc<T> {
  status: 'ok' | 'unreachable';
  value: T;
  reason?: string;
}

/**
 * Interprets a fetched document body. Field-level problems belong inside the
 * parser (warn and drop individually) — the source only handles HTTP outcomes.
 */
export type SettingsDocParser<T> = (payload: unknown, logger?: Pick<Console, 'warn'>) => ParsedSettingsDoc<T>;

export interface SettingsDocSource<T> {
  /** Last-known snapshot. Unfetched until the first refresh resolves. */
  current(): SettingsDocSnapshot<T>;
  refresh(): Promise<SettingsDocSnapshot<T>>;
  startPolling(intervalMs?: number): void;
}

export interface SettingsDocSourceOptions<T> {
  parse: SettingsDocParser<T>;
  /** Builds the value of an unfetched snapshot (usually `() => ({})`). */
  initialValue: () => T;
  /** Prefix for warn logs so operators can tell which settings surface spoke. */
  logPrefix: string;
  artifactsUrl?: string;
  docId?: string;
  /** How long a successful fetch stays fresh. Default 30s, matching loadLlmSettings(). */
  ttlMs?: number;
  fetcher?: (url: string) => Promise<Pick<Response, 'ok' | 'status' | 'statusText' | 'json'>>;
  now?: () => number;
  logger?: Pick<Console, 'warn'>;
}

/** Parses a positive integer at most `max` from an environment value. */
export function intFromEnv(env: Record<string, string | undefined>, key: string, fallback: number, max: number): number {
  const parsed = Number(env[key]);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= max ? parsed : fallback;
}

/** Passes a document field through the same validation used for environment values. */
export function resolveOverride(value: unknown, max: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= max ? value : undefined;
}

export function createSettingsDocSource<T>(options: SettingsDocSourceOptions<T>): SettingsDocSource<T> {
  const artifactsUrl = (options.artifactsUrl ?? process.env.ARTIFACTS_URL ?? 'http://artifacts:4200').replace(/\/$/, '');
  const docId = options.docId ?? DEFAULT_SETTINGS_DOC_ID;
  const ttlMs = options.ttlMs ?? 30_000;
  const fetcher = options.fetcher ?? ((url) => httpRequest(url));
  const now = options.now ?? Date.now;
  const logger = options.logger ?? console;
  const { parse, initialValue, logPrefix } = options;

  let cached: SettingsDocSnapshot<T> = { status: 'unfetched', value: initialValue(), fromCache: true };
  let fetchedAt = -Infinity; // -Infinity forces the first refresh to fetch
  let inFlight: Promise<SettingsDocSnapshot<T>> | undefined;
  let pollTimer: NodeJS.Timeout | undefined;

  function keepLastKnownValue(status: Extract<SettingsDocStatus, 'missing' | 'unreachable'>, reason?: string): SettingsDocSnapshot<T> {
    return { status, reason, value: { ...(cached.value as object) } as T, fromCache: true };
  }

  async function fetchOnce(): Promise<SettingsDocSnapshot<T>> {
    let snapshot: SettingsDocSnapshot<T>;
    try {
      const response = await fetcher(`${artifactsUrl}/api/artifacts/documents/${docId}`);
      if (response.status === 404) {
        // The document has never been written: an expected state until an
        // operator saves settings, so no warning.
        snapshot = keepLastKnownValue('missing');
      } else if (!response.ok) {
        const reason = response.statusText || String(response.status);
        logger.warn(`[${logPrefix}] Settings document request failed with ${response.status}; falling back to the last known values`);
        snapshot = keepLastKnownValue('unreachable', reason);
      } else {
        const parsed = parse(await response.json(), logger);
        if (parsed.status === 'ok') {
          snapshot = { status: 'ok', value: parsed.value, fromCache: false };
        } else {
          // A 200 with an unusable body is treated like any other failure:
          // keep the last known values rather than resetting them.
          snapshot = keepLastKnownValue('unreachable', parsed.reason);
        }
      }
    } catch (reason) {
      logger.warn(`[${logPrefix}] Failed to read settings document (${reason instanceof Error ? reason.message : String(reason)}); falling back to the last known values`);
      snapshot = keepLastKnownValue('unreachable', reason instanceof Error ? reason.message : String(reason));
    }
    cached = snapshot;
    if (snapshot.status === 'ok') fetchedAt = now();
    return { ...cached };
  }

  function refresh(): Promise<SettingsDocSnapshot<T>> {
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

/** Default settings document id when an option does not override it. */
export const DEFAULT_SETTINGS_DOC_ID = 'settings/config';
