/**
 * Client-side types and parsers for the Brain per-user spending-limit
 * feature. The refusal contract mirrors the backend's HTTP 429 payload
 * (`services/brain/src/services/SpendGate.ts`).
 */

export type SpendPeriod = 'day' | 'week' | 'month';

/** Body of a refused completion: HTTP 429 with `error: SPEND_LIMIT_REACHED`. */
export interface SpendLimitRefusal {
  error: 'SPEND_LIMIT_REACHED';
  userId?: string;
  period: SpendPeriod;
  /** Estimated USD cap for the period. */
  limit: number;
  /** Estimated USD recorded when the call was refused. */
  spent: number;
  /** When activity resumes: the period's UTC end, ISO-encoded. */
  periodEnd: string;
}

export interface UserSpendLimit {
  limit: number;
  period: SpendPeriod;
}

export interface SpendUsage {
  period: SpendPeriod;
  periodStart: string;
  periodEnd: string;
  limit?: number;
  spent: number;
}

const PERIODS: SpendPeriod[] = ['day', 'week', 'month'];

function isSpendPeriod(value: unknown): value is SpendPeriod {
  return typeof value === 'string' && (PERIODS as string[]).includes(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Extracts a spend-limit refusal from a thrown error. Only a 429 response
 * whose body names `SPEND_LIMIT_REACHED` and carries the contract fields
 * produces a refusal; anything else (other statuses, malformed bodies, plain
 * Errors) yields undefined so unrelated failures never trigger the notice.
 */
export function parseSpendLimitRefusal(err: unknown): SpendLimitRefusal | undefined {
  if (!(err instanceof Error) || !('status' in err) || !('body' in err)) return undefined;
  const api = err as Error & { status?: unknown; body?: unknown };
  if (api.status !== 429) return undefined;
  const body = api.body;
  if (typeof body !== 'object' || body === null) return undefined;
  const record = body as Record<string, unknown>;
  if (record.error !== 'SPEND_LIMIT_REACHED') return undefined;
  if (!isSpendPeriod(record.period) || !isFiniteNumber(record.limit)
    || !isFiniteNumber(record.spent) || typeof record.periodEnd !== 'string') {
    return undefined;
  }
  return {
    error: 'SPEND_LIMIT_REACHED',
    period: record.period,
    limit: record.limit,
    spent: record.spent,
    periodEnd: record.periodEnd,
  };
}

/**
 * Renders a refusal's `periodEnd` as a concrete resumption time in UTC, e.g.
 * "Dec 1 2026, 00:00 UTC". An unparseable timestamp is returned unchanged
 * rather than fabricating a date.
 */
export function formatResumption(iso: string, now: Date = new Date()): string {
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return iso;
  const sameYear = end.getUTCFullYear() === now.getUTCFullYear();
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(end);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    // h23 renders midnight as 00:00; hour12:false can yield 24:00.
    hourCycle: 'h23',
  }).format(end);
  return `${date}, ${time} UTC`;
}

/** "≈ $12.40 of $25.00 used this month (estimated)" for cards and notices. */
export function formatUsage(spent: number, limit: number, period: SpendPeriod): string {
  return `≈ $${spent.toFixed(2)} of $${limit.toFixed(2)} used this ${period} (estimated)`;
}
