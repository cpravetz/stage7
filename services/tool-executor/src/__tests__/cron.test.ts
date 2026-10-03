import { isValidCron, parseCadence, parseCron } from '../adk/cron';

/**
 * The cron parser is the difference between a declared schedule that fires and
 * one that does not, so these tests care about the awkward cases: day-of-week vs
 * day-of-month precedence, the strictly-after boundary, and expressions that can
 * never fire.
 */

/** Local-time constructor, because the parser works in local time. */
function local(y: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(y, month - 1, day, hour, minute, 0, 0);
}

function expectNext(expression: string, from: Date): Date {
  const schedule = parseCron(expression);
  expect(schedule.valid).toBe(true);
  const next = schedule.nextFireAfter(from);
  expect(next).not.toBeNull();
  return next as Date;
}

describe('parseCron', () => {
  it('rejects expressions that are not five fields', () => {
    for (const expression of ['', '   ', '0 9 * *', '0 9 * * * *', '* * * *']) {
      const schedule = parseCron(expression);
      expect(schedule.valid).toBe(false);
      expect(schedule.error).toBeTruthy();
      expect(isValidCron(expression)).toBe(false);
    }
  });

  it('rejects out-of-range and unparseable fields with a named reason', () => {
    expect(parseCron('99 9 * * *').error).toContain('out of range');
    expect(parseCron('0 9 32 * *').error).toContain('out of range');
    expect(parseCron('0 9 * 13 *').error).toContain('out of range');
    expect(parseCron('0 9 * * 8').error).toContain('out of range');
    expect(parseCron('0 9 * * abc').error).toContain('not a number or known name');
    expect(parseCron('0 9 * * */0').error).toContain('invalid step');
    expect(parseCron('1,,2 * * * *').error).toContain('empty term');
  });

  it('treats ? as the wildcard so quartz-style expressions parse', () => {
    const schedule = parseCron('0 9 ? * MON');
    expect(schedule.valid).toBe(true);
    expect(expectNext('0 9 ? * MON', local(2026, 10, 5)).getHours()).toBe(9);
  });

  it('accepts month and weekday names', () => {
    expect(parseCron('0 0 1 JAN *').valid).toBe(true);
    expect(parseCron('0 0 * * SUN').valid).toBe(true);
    expect(expectNext('0 0 1 JAN *', local(2026, 6, 1)).getMonth()).toBe(0);
  });

  it('accepts 7 as Sunday', () => {
    const schedule = parseCron('0 9 * * 7');
    expect(schedule.valid).toBe(true);
    expect(schedule.matches(local(2026, 10, 4, 9))).toBe(true); // a Sunday
    expect(schedule.matches(local(2026, 10, 5, 9))).toBe(false); // a Monday
    // Folding 7 onto 0 must not turn a full-week range into a sparse one.
    expect(parseCron('0 9 * * 0-7').matches(local(2026, 10, 7, 9))).toBe(true);
  });

  it('expands lists, ranges and steps', () => {
    const weekdays = parseCron('0 9 * * 1,3,5');
    expect(weekdays.matches(local(2026, 10, 5, 9))).toBe(true); // Monday
    expect(weekdays.matches(local(2026, 10, 6, 9))).toBe(false); // Tuesday
    expect(weekdays.matches(local(2026, 10, 7, 9))).toBe(true); // Wednesday

    const every15 = parseCron('*/15 * * * *');
    expect(every15.matches(local(2026, 10, 5, 9, 0))).toBe(true);
    expect(every15.matches(local(2026, 10, 5, 9, 15))).toBe(true);
    expect(every15.matches(local(2026, 10, 5, 9, 16))).toBe(false);

    const hours = parseCron('0 9-17/4 * * *');
    expect(hours.matches(local(2026, 10, 5, 9))).toBe(true);
    expect(hours.matches(local(2026, 10, 5, 13))).toBe(true);
    expect(hours.matches(local(2026, 10, 5, 14))).toBe(false);
    expect(hours.matches(local(2026, 10, 5, 18))).toBe(false);
  });

  it('wraps a reversed range rather than matching nothing', () => {
    const schedule = parseCron('0 22-2 * * *');
    expect(schedule.matches(local(2026, 10, 5, 23))).toBe(true);
    expect(schedule.matches(local(2026, 10, 5, 1))).toBe(true);
    expect(schedule.matches(local(2026, 10, 5, 12))).toBe(false);
  });
});

describe('cron day precedence', () => {
  it('ORs day-of-month with day-of-week when both are restricted', () => {
    // POSIX: with both restricted, either matching fires.
    const schedule = parseCron('0 0 13 * 5'); // the 13th, or any Friday
    expect(schedule.matches(local(2026, 11, 13))).toBe(true); // 13th, a Friday
    expect(schedule.matches(local(2026, 10, 9))).toBe(true); // a Friday, not the 13th
    expect(schedule.matches(local(2026, 10, 13))).toBe(true); // the 13th, a Tuesday
    expect(schedule.matches(local(2026, 10, 7))).toBe(false); // neither
  });

  it('uses day-of-month alone when only it is restricted', () => {
    const schedule = parseCron('0 0 13 * *');
    expect(schedule.matches(local(2026, 10, 13))).toBe(true);
    expect(schedule.matches(local(2026, 10, 14))).toBe(false);
  });

  it('uses day-of-week alone when only it is restricted', () => {
    const schedule = parseCron('0 0 * * 1');
    expect(schedule.matches(local(2026, 10, 5))).toBe(true);
    expect(schedule.matches(local(2026, 10, 6))).toBe(false);
  });
});

describe('nextFireAfter', () => {
  it('returns a time strictly after the argument, so one period does not double-fire', () => {
    const at9 = local(2026, 10, 5, 9, 0);
    const next = expectNext('0 9 * * *', at9);
    expect(next.getTime()).toBeGreaterThan(at9.getTime());
    expect(next.getDate()).toBe(6);
    expect(next.getHours()).toBe(9);
  });

  it('advances to the next minute within the hour', () => {
    const next = expectNext('*/5 * * * *', local(2026, 10, 5, 9, 1));
    expect(next.getMinutes()).toBe(5);
    expect(next.getHours()).toBe(9);
  });

  it('crosses a day boundary', () => {
    const next = expectNext('30 23 * * *', local(2026, 10, 5, 23, 45));
    expect(next.getDate()).toBe(6);
    expect(next.getHours()).toBe(23);
    expect(next.getMinutes()).toBe(30);
  });

  it('crosses a year boundary', () => {
    const next = expectNext('0 0 1 1 *', local(2026, 10, 5));
    expect(next.getFullYear()).toBe(2027);
    expect(next.getMonth()).toBe(0);
    expect(next.getDate()).toBe(1);
  });

  it('finds the next Friday at 09:00 from a Wednesday', () => {
    const next = expectNext('0 9 * * 5', local(2026, 10, 7, 12));
    expect(next.getDay()).toBe(5);
    expect(next.getDate()).toBe(9);
    expect(next.getHours()).toBe(9);
  });

  it('handles a leap day', () => {
    const next = expectNext('0 12 29 2 *', local(2026, 3, 1));
    expect(next.getFullYear()).toBe(2028);
    expect(next.getMonth()).toBe(1);
    expect(next.getDate()).toBe(29);
  });

  it('returns null for an expression that can never fire', () => {
    const schedule = parseCron('0 0 30 2 *'); // February 30th
    expect(schedule.valid).toBe(true);
    expect(schedule.nextFireAfter(local(2026, 1, 1))).toBeNull();
    expect(schedule.matches(local(2026, 2, 28))).toBe(false);
  });

  it('produces strictly increasing fire times', () => {
    const schedule = parseCron('17 3 * * *');
    let cursor = local(2026, 1, 1, 0, 0);
    let previous = cursor.getTime();
    for (let i = 0; i < 40; i += 1) {
      const next = schedule.nextFireAfter(cursor);
      expect(next).not.toBeNull();
      expect((next as Date).getTime()).toBeGreaterThan(previous);
      previous = (next as Date).getTime();
      cursor = next as Date;
    }
  });
});
describe('parseCadence', () => {
  /**
   * Every `schedule` trigger in the shipped catalogue uses `cadence`, and most use
   * it as prose. These tests pin the line between "exactly one interpretation" and
   * "the scheduler would have to guess", because guessing wrong here fires a Skill
   * the author meant to hold back.
   */
  it('accepts an interval that fully determines its own times', () => {
    expect(parseCadence('Every 15 minutes').expression).toBe('*/15 * * * *');
    expect(parseCadence('every 5 minutes').expression).toBe('*/5 * * * *');
    expect(parseCadence('every 2 hours').expression).toBe('0 */2 * * *');
    expect(parseCadence('hourly').expression).toBe('0 * * * *');
  });

  it('refuses a named period, because none of them says when', () => {
    for (const cadence of ['daily', 'weekly', 'monthly', 'Daily obligation review']) {
      const schedule = parseCadence(cadence);
      expect(schedule.valid).toBe(false);
      expect(schedule.error).toContain('does not say when it should run');
    }
  });

  it('refuses a conditional cadence rather than running it unconditionally', () => {
    for (const cadence of [
      'Every 5 minutes during configured windows',
      'After job discovery completes',
      'Pre-bet risk check',
      'Periodic model refresh from the configured data source',
    ]) {
      expect(parseCadence(cadence).valid).toBe(false);
    }
  });

  it('always tells the author what to write instead', () => {
    expect(parseCadence('Daily shift prep list generation').error).toContain(
      'declare cron with an exact expression',
    );
  });

  it('schedules an accepted cadence on its expected times', () => {
    const schedule = parseCadence('Every 15 minutes');
    expect(schedule.valid).toBe(true);
    expect(schedule.matches(new Date(2026, 9, 5, 9, 30))).toBe(true);
    expect(schedule.matches(new Date(2026, 9, 5, 9, 31))).toBe(false);
  });
});
