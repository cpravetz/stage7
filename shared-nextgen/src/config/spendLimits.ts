/**
 * Spend-limit types and bounds shared by the Brain's spend gate, its routes,
 * and the frontend settings surface.
 *
 * The operator's `system`-bucket default lives in the settings document
 * (`settingsDocSource`); per-user limits are Mongo documents owned by the
 * Brain. All figures are estimated USD and all period boundaries are UTC.
 */

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
