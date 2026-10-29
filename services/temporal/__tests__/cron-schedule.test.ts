import { isValidCronSchedule } from '../src/schedules/cronSchedule';
import { missionRecurrenceSchema, missionRecurrenceToCron } from '../src/schedules/missionRecurrence';
import { isMissedMissionOccurrence, nextMissionOccurrence } from '../src/schedules/missionScheduler';

describe('Temporal cron schedule validation', () => {
  it('accepts standard five-field numeric and named schedules', () => {
    expect(isValidCronSchedule('0 9 * * 1')).toBe(true);
    expect(isValidCronSchedule('*/15 8-18 * JAN,MAR MON-FRI')).toBe(true);
    expect(isValidCronSchedule('0 0 ? * SUN')).toBe(true);
  });

  describe('friendly mission recurrence', () => {
    it('converts daily, weekly, and monthly settings to Temporal cron expressions', () => {
      expect(missionRecurrenceToCron({ frequency: 'daily', time: '09:05' })).toBe('5 9 * * *');
      expect(missionRecurrenceToCron({ frequency: 'weekly', time: '17:30', dayOfWeek: 1 })).toBe('30 17 * * 1');
      expect(missionRecurrenceToCron({ frequency: 'monthly', time: '00:00', dayOfMonth: 31 })).toBe('0 0 31 * *');
    });

    it('rejects invalid time and frequency-specific values', () => {
      expect(missionRecurrenceSchema.safeParse({ frequency: 'daily', time: '24:00' }).success).toBe(false);
      expect(missionRecurrenceSchema.safeParse({ frequency: 'weekly', time: '09:00', dayOfWeek: 7 }).success).toBe(false);
      expect(missionRecurrenceSchema.safeParse({ frequency: 'monthly', time: '09:00', dayOfMonth: 32 }).success).toBe(false);
    });

    it('calculates the next UTC recurrence and skips old occurrences', () => {
      expect(nextMissionOccurrence(
        { frequency: 'daily', time: '09:00' },
        new Date('2026-10-28T08:00:00.000Z'),
      ).toISOString()).toBe('2026-10-28T09:00:00.000Z');
      expect(nextMissionOccurrence(
        { frequency: 'weekly', time: '09:00', dayOfWeek: 1 },
        new Date('2026-10-27T10:00:00.000Z'),
      ).toISOString()).toBe('2026-11-02T09:00:00.000Z');
      expect(nextMissionOccurrence(
        { frequency: 'monthly', time: '09:00', dayOfMonth: 31 },
        new Date('2026-02-01T10:00:00.000Z'),
      ).toISOString()).toBe('2026-03-31T09:00:00.000Z');
      expect(isMissedMissionOccurrence(
        new Date('2026-10-28T09:00:00.000Z'),
        new Date('2026-10-28T09:00:31.000Z'),
      )).toBe(true);
      expect(isMissedMissionOccurrence(
        new Date('2026-10-28T09:00:00.000Z'),
        new Date('2026-10-28T09:00:15.000Z'),
      )).toBe(false);
    });
  });

  it('rejects malformed, out-of-range, and unsupported schedules', () => {
    expect(isValidCronSchedule('0 9 * *')).toBe(false);
    expect(isValidCronSchedule('90 9 * * *')).toBe(false);
    expect(isValidCronSchedule('0 9 * 13 *')).toBe(false);
    expect(isValidCronSchedule('0 9 * * FUNDAY')).toBe(false);
  });
});
