import {
  NextGenError,
  MAX_BRAIN_SPEND_LIMIT_USD,
  spendLimitsSettings,
} from '@stage7-nextgen/shared';
import type { SpendLimitConfig, SpendLimitPeriod, SpendLimitRefusalPayload } from '@stage7-nextgen/shared';
import { SpendLedgerStore, UserSpendLimitStore } from '../data/spendStores';
import type { SpendLedger, SpendWindow, UserLimitStore, UserSpendLimitDoc } from '../data/spendStores';
import { logger } from '../utils/logger';

/**
 * Attribution bucket for LLM calls with no resolvable user — identity-less
 * scheduled runs, system jobs. Its cap is the operator's settings-doc default
 * and is uncapped until one is set.
 */
export const SYSTEM_ATTRIBUTION = 'system';

/**
 * Resolves a request's attribution. Explicit `userId` wins; PR 2 threads
 * assistant owners and mission creators into the callers so the fallback to
 * `system` becomes rare.
 */
export function resolveAttribution(userId: string | undefined): string {
  const trimmed = userId?.trim();
  return trimmed ? trimmed : SYSTEM_ATTRIBUTION;
}

/**
 * UTC window for a period. Days are midnight-to-midnight, weeks start Monday
 * 00:00 UTC (ISO), months start on the 1st. Pure so tests can pin the clock.
 */
export function periodWindow(period: SpendLimitPeriod, now: Date): SpendWindow {
  const dayStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const DAY_MS = 24 * 60 * 60 * 1000;
  switch (period) {
    case 'day':
      return { period, periodStart: new Date(dayStartMs), periodEnd: new Date(dayStartMs + DAY_MS) };
    case 'week': {
      // Monday = 0 under the ISO convention.
      const daysSinceMonday = (now.getUTCDay() + 6) % 7;
      const weekStartMs = dayStartMs - daysSinceMonday * DAY_MS;
      return { period, periodStart: new Date(weekStartMs), periodEnd: new Date(weekStartMs + 7 * DAY_MS) };
    }
    case 'month': {
      const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      return { period, periodStart, periodEnd };
    }
  }
}

/**
 * The 429 contract body, defined in shared so callers (and the frontend's
 * parser) build against one shape.
 */
export type SpendLimitReachedPayload = SpendLimitRefusalPayload;

/**
 * The typed refusal thrown by the gate and mapped by the completion route to
 * an HTTP 429 whose body is exactly the spec's contract.
 */
export class SpendLimitReachedError extends NextGenError {
  readonly payload: SpendLimitReachedPayload;

  constructor(payload: SpendLimitReachedPayload) {
    super(`LLM spending limit reached: estimated $${payload.spent.toFixed(2)} of $${payload.limit.toFixed(2)} used this ${payload.period}; activity resumes at ${payload.periodEnd}`, 429, {
      code: 'SPEND_LIMIT_REACHED',
      ...payload,
    });
    this.payload = payload;
  }
}

/** A successful pre-call reservation, reconciled or refunded after the call. */
export interface SpendReservation {
  userId: string;
  window: SpendWindow;
  limit: number;
  /** Estimated USD reserved before the provider call. */
  estimate: number;
}

export interface SpendGateOptions {
  ledger?: SpendLedger;
  limits?: UserLimitStore;
  /** Operator default, consulted only for the `system` attribution bucket. */
  operatorSystemDefault?: () => SpendLimitConfig | undefined;
  now?: () => Date;
}

/**
 * The spend gate: resolves the applicable limit, reserves budget atomically
 * before a provider call, and reconciles or refunds the reservation after.
 * The pre-call reads are fail-closed — refusing spend is the safe side of a
 * budget control — while post-call ledger writes are fire-and-forget.
 */
export class SpendGate {
  private readonly ledger: SpendLedger;
  private readonly limits: UserLimitStore;
  private readonly operatorSystemDefault: () => SpendLimitConfig | undefined;
  private readonly now: () => Date;

  constructor(options: SpendGateOptions = {}) {
    this.ledger = options.ledger ?? new SpendLedgerStore();
    this.limits = options.limits ?? new UserSpendLimitStore();
    this.operatorSystemDefault = options.operatorSystemDefault ?? (() => undefined);
    this.now = options.now ?? (() => new Date());
  }

  /**
   * The limit that applies to the attribution: the user's own settings doc,
   * else — for the system bucket only — the operator's default. Undefined
   * means uncapped.
   */
  async limitFor(attribution: string): Promise<SpendLimitConfig | undefined> {
    const userLimit = await this.limits.get(attribution);
    if (userLimit) return { limit: userLimit.limit, period: userLimit.period };
    if (attribution === SYSTEM_ATTRIBUTION) return this.operatorSystemDefault();
    return undefined;
  }

  /**
   * Checks and reserves budget for one completion. Returns null when the
   * attribution is uncapped; throws SpendLimitReachedError at the cap and a
   * 503-class NextGenError when the limit or ledger state is unreadable
   * (fail closed).
   */
  async enforce(attribution: string | undefined, estimateUsd: number): Promise<SpendReservation | null> {
    const userId = resolveAttribution(attribution);
    let limit: SpendLimitConfig | undefined;
    try {
      limit = await this.limitFor(userId);
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err), userId }, 'Spend limit state unreadable; refusing the call (fail closed)');
      throw new NextGenError('Spending limit state is unavailable; the LLM call was refused', 503, {
        code: 'SPEND_LIMIT_STATE_UNAVAILABLE',
        userId,
      });
    }
    if (!limit) return null;

    const window = periodWindow(limit.period, this.now());
    let outcome;
    try {
      outcome = await this.ledger.reserve(userId, window, limit.limit, estimateUsd);
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err), userId }, 'Spend ledger unavailable; refusing the call (fail closed)');
      throw new NextGenError('Spending ledger is unavailable; the LLM call was refused', 503, {
        code: 'SPEND_LEDGER_UNAVAILABLE',
        userId,
      });
    }
    if (!outcome.ok) {
      throw new SpendLimitReachedError({
        error: 'SPEND_LIMIT_REACHED',
        userId,
        period: window.period,
        limit: limit.limit,
        // The ledger doc could not be read for the exact figure; the refusal
        // itself proves spend has reached the cap.
        spent: outcome.spent ?? limit.limit,
        periodEnd: window.periodEnd.toISOString(),
      });
    }
    return { userId, window, limit: limit.limit, estimate: estimateUsd };
  }

  /**
   * Trues the reservation up to the completion's actual estimated cost. A
   * missing cost leaves the reservation in place (the ledger only records
   * successful spend and this call succeeded). Never throws and never blocks
   * the completion.
   */
  reconcile(reservation: SpendReservation, estimatedCost: number | undefined): void {
    const delta = estimatedCost === undefined ? 0 : estimatedCost - reservation.estimate;
    if (delta === 0) return;
    this.ledger.reconcile(reservation.userId, reservation.window.periodStart, delta)
      .catch((err) => logger.warn({ err: err instanceof Error ? err.message : String(err), userId: reservation.userId }, 'Failed to reconcile spend reservation'));
  }

  /** Releases a reservation after a failed completion. Never throws. */
  refund(reservation: SpendReservation): void {
    this.ledger.reconcile(reservation.userId, reservation.window.periodStart, -reservation.estimate)
      .catch((err) => logger.warn({ err: err instanceof Error ? err.message : String(err), userId: reservation.userId }, 'Failed to refund spend reservation'));
  }

  // Settings-surface facade used by the spend-limits routes.

  async getLimit(userId: string): Promise<UserSpendLimitDoc | undefined> {
    return this.limits.get(userId);
  }

  async setLimit(userId: string, limit: number, period: SpendLimitPeriod): Promise<UserSpendLimitDoc> {
    return this.limits.set(userId, limit, period);
  }

  async clearLimit(userId: string): Promise<boolean> {
    return this.limits.clear(userId);
  }

  /** Current window and recorded spend for the attribution, when it is capped. */
  async usage(attribution: string): Promise<{
    period: SpendLimitPeriod;
    periodStart: string;
    periodEnd: string;
    limit: number | undefined;
    spent: number;
  } | undefined> {
    const userId = resolveAttribution(attribution);
    const config = await this.limitFor(userId);
    if (!config) return undefined;
    const window = periodWindow(config.period, this.now());
    const spent = await this.ledger.usage(userId, window.periodStart);
    return {
      period: window.period,
      periodStart: window.periodStart.toISOString(),
      periodEnd: window.periodEnd.toISOString(),
      limit: config.limit,
      spent: spent ?? 0,
    };
  }
}

/** Upper bound a per-user (or operator) cap may take, in estimated USD. */
export const MAX_SPEND_LIMITS = { perUserUsd: MAX_BRAIN_SPEND_LIMIT_USD };

let sharedGate: SpendGate | undefined;

/**
 * Process-wide gate. Per-user limits come from the Mongo store; the operator's
 * `system`-bucket default comes from the settings document, read through the
 * shared TTL-cached source that BrainService refreshes on the completion path.
 */
export function getSpendGate(): SpendGate {
  sharedGate ??= new SpendGate({
    // The operator's `system`-bucket default lives in the settings document
    // (`brain/settings/llm-config`); BrainService.refreshes the source on the
    // completion path so it is hot-applied here.
    operatorSystemDefault: () => spendLimitsSettings.current().overrides.system,
  });
  return sharedGate;
}
