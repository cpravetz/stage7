/**
 * A small, dependency-free cron parser for Skill `schedule` triggers.
 *
 * Skills declare cron because the vocabulary already exists in every operations
 * tool people use, and because `validateNativeTriggers` has always required a
 * cron expression. What was missing was a runtime that could read one: the only
 * scheduler in the platform understood `hourly` / `daily` / `<n>[smhd]`
 * (`services/temporal/src/workflows/watchLoop.ts`), so every declared cron was
 * decorative.
 *
 * This is deliberately pure — no clock, no I/O, no Temporal — so the schedule a
 * Skill declares can be validated and tested without a database or a running
 * service. `TriggerScheduler` supplies the clock.
 *
 * Supported: the wildcard, a single value, a `a-b` range, a range with a step, a
 * wildcard with a step, comma lists, `?` as a synonym for the wildcard, and
 * three-letter month / weekday names. Five fields, minute-first:
 * `minute hour day-of-month month day-of-week`.
 *
 * Day matching follows POSIX: when *both* day-of-month and day-of-week are
 * restricted, a date matching *either* fires. When only one is restricted, that
 * one decides. This is why `0 9 * * 1` is every Monday and `0 9 13 * *` is the
 * 13th of every month.
 */

export interface CronSchedule {
  /** The expression this schedule was parsed from, for logs and error messages. */
  readonly expression: string;
  /** Every field was well formed and the expression can fire. */
  readonly valid: boolean;
  /** Why parsing failed, when `valid` is false. */
  readonly error?: string;
  /** True when the expression names at least one minute, so a next fire exists. */
  matches(date: Date): boolean;
  /**
   * The first firing strictly after `from`, or null when the expression cannot
   * fire within the search horizon (for example `0 0 30 2 *`, February 30th).
   */
  nextFireAfter(from: Date): Date | null;
}

interface Bounds {
  min: number;
  max: number;
}

const FIELD_BOUNDS: Bounds[] = [
  { min: 0, max: 59 }, // minute
  { min: 0, max: 23 }, // hour
  { min: 1, max: 31 }, // day of month
  { min: 1, max: 12 }, // month
  // Day of week accepts 7 as a second spelling of Sunday; it is folded onto 0
  // once parsed, so a range like 0-7 still means every day.
  { min: 0, max: 7 },
];

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const DAY_NAMES: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

/**
 * How far ahead `nextFireAfter` will look before deciding an expression never
 * fires. Four years covers every date-based expression including 29 February,
 * so a legitimate schedule is never reported as impossible.
 */
const SEARCH_HORIZON_DAYS = 366 * 4;

/** Expand one comma-separated field into the set of values it matches. */
function parseField(spec: string, bounds: Bounds, names?: Record<string, number>): Set<number> {
  const values = new Set<number>();
  const trimmed = spec.trim();
  if (trimmed === '' || trimmed === '*' || trimmed === '?') {
    for (let v = bounds.min; v <= bounds.max; v += 1) values.add(v);
    return values;
  }

  for (const part of trimmed.split(',')) {
    const token = part.trim();
    if (token === '') throw new Error(`empty term in "${spec}"`);

    const [rangePart, stepPart] = token.split('/');
    let step = 1;
    if (stepPart !== undefined) {
      step = Number(stepPart);
      if (!Number.isInteger(step) || step < 1) throw new Error(`invalid step "${stepPart}" in "${token}"`);
    }

    let start: number;
    let end: number;
    const range = rangePart.trim();
    if (range === '*' || range === '?') {
      start = bounds.min;
      end = bounds.max;
    } else if (range.includes('-')) {
      const [fromText, toText] = range.split('-', 2);
      start = resolveValue(fromText, names, spec);
      end = resolveValue(toText, names, spec);
    } else {
      start = resolveValue(range, names, spec);
      end = stepPart === undefined ? start : bounds.max;
    }

    if (start < bounds.min || start > bounds.max) throw new Error(`value ${start} out of range in "${spec}"`);
    if (end < bounds.min || end > bounds.max) throw new Error(`value ${end} out of range in "${spec}"`);

    // A wrapping range such as `22-2` for hours is common enough in hand-written
    // crontabs to be worth honouring, and costs one comparison.
    if (end < start) {
      for (let v = start; v <= bounds.max; v += step) values.add(v);
      for (let v = bounds.min; v <= end; v += step) values.add(v);
      continue;
    }
    for (let v = start; v <= end; v += step) values.add(v);
  }

  if (values.size === 0) throw new Error(`"${spec}" matches nothing`);
  return values;
}

function resolveValue(text: string, names: Record<string, number> | undefined, spec: string): number {
  const token = text.trim().toLowerCase();
  if (names && token in names) return names[token];
  if (!/^\d+$/.test(token)) throw new Error(`"${text}" is not a number or known name in "${spec}"`);
  return Number(token);
}

/** Fields that were not written as `*` or `?` take part in the POSIX day rule. */
function isRestricted(spec: string): boolean {
  const trimmed = spec.trim();
  return trimmed !== '*' && trimmed !== '?' && trimmed !== '';
}

export function parseCron(expression: string): CronSchedule {
  const invalid = (error: string): CronSchedule => ({
    expression,
    valid: false,
    error,
    matches: () => false,
    nextFireAfter: () => null,
  });

  if (typeof expression !== 'string' || expression.trim() === '') {
    return invalid('expression is empty');
  }

  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    return invalid(`expected 5 fields (minute hour day-of-month month day-of-week), received ${fields.length}`);
  }

  let minutes: Set<number>;
  let hours: Set<number>;
  let daysOfMonth: Set<number>;
  let months: Set<number>;
  let daysOfWeek: Set<number>;
  try {
    minutes = parseField(fields[0], FIELD_BOUNDS[0]);
    hours = parseField(fields[1], FIELD_BOUNDS[1]);
    daysOfMonth = parseField(fields[2], FIELD_BOUNDS[2]);
    months = parseField(fields[3], FIELD_BOUNDS[3], MONTH_NAMES);
    daysOfWeek = parseField(fields[4], FIELD_BOUNDS[4], DAY_NAMES);
  } catch (err) {
    return invalid(err instanceof Error ? err.message : String(err));
  }

  // 7 is an accepted spelling of Sunday in most cron dialects; POSIX numbered it
  // 0. Accepting only 0 here would reject crontabs operators already trust.
  if (daysOfWeek.delete(7)) daysOfWeek.add(0);

  const domRestricted = isRestricted(fields[2]);
  const dowRestricted = isRestricted(fields[4]);

  const dayMatches = (date: Date): boolean => {
    const domHit = daysOfMonth.has(date.getDate());
    const dowHit = daysOfWeek.has(date.getDay());
    if (domRestricted && dowRestricted) return domHit || dowHit;
    if (domRestricted) return domHit;
    if (dowRestricted) return dowHit;
    return true;
  };

  const matches = (date: Date): boolean =>
    minutes.has(date.getMinutes()) &&
    hours.has(date.getHours()) &&
    months.has(date.getMonth() + 1) &&
    dayMatches(date);

  const nextFireAfter = (from: Date): Date | null => {
    // Start at the first whole minute strictly after `from`: a schedule that
    // fired at 09:00 must not immediately report 09:00 again for a poll that
    // landed in the same minute.
    const cursor = new Date(from.getTime());
    cursor.setSeconds(0, 0);
    cursor.setMinutes(cursor.getMinutes() + 1);

    const horizon = new Date(from.getTime());
    horizon.setDate(horizon.getDate() + SEARCH_HORIZON_DAYS);

    while (cursor <= horizon) {
      if (!months.has(cursor.getMonth() + 1)) {
        // Skip to the first instant of the next month. setMonth(13) normalises
        // into January of the following year, so December needs no special case.
        cursor.setMonth(cursor.getMonth() + 1, 1);
        cursor.setHours(0, 0, 0, 0);
        continue;
      }
      if (!dayMatches(cursor)) {
        cursor.setDate(cursor.getDate() + 1);
        cursor.setHours(0, 0, 0, 0);
        continue;
      }
      if (!hours.has(cursor.getHours())) {
        cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
        continue;
      }
      if (!minutes.has(cursor.getMinutes())) {
        cursor.setMinutes(cursor.getMinutes() + 1, 0, 0);
        continue;
      }
      return new Date(cursor.getTime());
    }

    return null;
  };

  return { expression: expression.trim(), valid: true, matches, nextFireAfter };
}

/** Whether `expression` is a cron expression this scheduler can honour. */
export function isValidCron(expression: string): boolean {
  return parseCron(expression).valid;
}

/**
 * Resolve the `cadence` shorthand some Skills declare instead of a cron.
 *
 * Every `schedule` trigger in the shipped catalogue uses `cadence`, and almost all
 * of them use it as prose — "daily obligation review", "Every 5 minutes during
 * configured windows", "Weekly contract risk sweep (Mondays 07:00)". A scheduler
 * that inferred a frequency from those strings would eventually guess wrong, and
 * guessing "every 5 minutes" onto a run that was meant to be conditional is much
 * worse than not scheduling it at all.
 *
 * So only the forms with exactly one correct interpretation are accepted, and
 * everything else comes back as an error naming the cron to write instead. An
 * interval in hours or minutes fully determines its own times; a named period
 * like `daily` or `weekly` does not, because none of them says *when*.
 */
export function parseCadence(cadence: string): CronSchedule {
  const text = (cadence || '').trim().toLowerCase();
  const rejected = (why: string): CronSchedule => {
    const schedule = parseCron('');
    return {
      ...schedule,
      expression: cadence,
      error: `cadence "${cadence}" ${why}; declare cron with an exact expression instead`,
    };
  };

  // "every N minutes" / "every N hours": the interval is the whole meaning.
  const interval = /^every (\d{1,3}) (minute|min|hour|hr)s?$/.exec(text);
  if (interval) {
    const count = Number(interval[1]);
    if (count < 1) return rejected('has a zero interval');
    const isMinutes = interval[2].startsWith('minute') || interval[2] === 'min';
    const expression = isMinutes ? `*/${count} * * * *` : `0 */${count} * * *`;
    const schedule = parseCron(expression);
    return schedule.valid ? schedule : rejected('could not be turned into a cron expression');
  }

  // "hourly" is the one named period with a single interpretation: on the hour.
  if (text === 'hourly' || text === 'every hour') return parseCron('0 * * * *');

  return rejected(
    'does not say when it should run. Named periods (daily, weekly, monthly) leave the time open, ' +
      'and anything qualified ("during configured windows", "when X completes") is conditional',
  );
}