import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import {
  formatResumption,
  formatUsage,
  parseSpendLimitRefusal,
} from './spendLimits';

const refusalBody = {
  error: 'SPEND_LIMIT_REACHED',
  userId: 'usr_123',
  period: 'month',
  limit: 25,
  spent: 25.03,
  periodEnd: '2026-12-01T00:00:00.000Z',
};

describe('parseSpendLimitRefusal', () => {
  it('parses a 429 SPEND_LIMIT_REACHED payload from an ApiError', () => {
    const err = new ApiError(429, 'Too Many Requests', '/api/brain/complete', refusalBody);
    expect(parseSpendLimitRefusal(err)).toEqual({
      error: 'SPEND_LIMIT_REACHED',
      period: 'month',
      limit: 25,
      spent: 25.03,
      periodEnd: '2026-12-01T00:00:00.000Z',
    });
  });

  it('rejects other statuses and other error codes', () => {
    expect(parseSpendLimitRefusal(
      new ApiError(400, 'Bad Request', '/api/brain/complete', refusalBody),
    )).toBeUndefined();
    expect(parseSpendLimitRefusal(
      new ApiError(429, 'Too Many Requests', '/api/brain/complete', { error: 'RATE_LIMITED' }),
    )).toBeUndefined();
  });

  it('rejects malformed 429 bodies and non-Api errors', () => {
    expect(parseSpendLimitRefusal(
      new ApiError(429, 'Too Many Requests', '/api/brain/complete', { error: 'SPEND_LIMIT_REACHED' }),
    )).toBeUndefined();
    expect(parseSpendLimitRefusal(
      new ApiError(429, 'Too Many Requests', '/api/brain/complete', {
        error: 'SPEND_LIMIT_REACHED', period: 'fortnight', limit: '25', spent: null, periodEnd: 5,
      }),
    )).toBeUndefined();
    expect(parseSpendLimitRefusal(new Error('API error: 429'))).toBeUndefined();
    expect(parseSpendLimitRefusal('nope')).toBeUndefined();
  });
});

describe('formatResumption', () => {
  it('renders the UTC period end as a readable resumption time', () => {
    const now = new Date('2026-11-25T12:00:00Z');
    expect(formatResumption('2026-12-01T00:00:00.000Z', now))
      .toBe('Dec 1, 00:00 UTC');
  });

  it('includes the year when the period ends in another year', () => {
    const now = new Date('2026-11-25T12:00:00Z');
    expect(formatResumption('2027-01-01T00:00:00.000Z', now))
      .toBe('Jan 1, 2027, 00:00 UTC');
  });

  it('returns an unparseable timestamp unchanged', () => {
    expect(formatResumption('not-a-date')).toBe('not-a-date');
  });
});

describe('formatUsage', () => {
  it('labels figures as estimated', () => {
    expect(formatUsage(12.4, 25, 'month'))
      .toBe('≈ $12.40 of $25.00 used this month (estimated)');
  });
});
