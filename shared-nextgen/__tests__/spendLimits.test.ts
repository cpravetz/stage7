import {
  parseSpendLimitRefusalPayload,
  parseSpendLimitPeriod,
  parseSpendLimitUsd,
  parseSpendLimitsDoc,
  parseSpendLimitsOverrides,
  createSpendLimitsSettingsSource,
  SPEND_LIMIT_REACHED,
  BRAIN_SETTINGS_DOC_ID,
} from '../src/config/spendLimits';

/**
 * The shared spend-limit contract: the strict 429 refusal parser (consumed by
 * worker-pool to preserve Brain refusals) and the operator settings-doc
 * source for the `system` attribution bucket (consumed by the Brain's gate).
 */

const VALID_REFUSAL = {
  error: SPEND_LIMIT_REACHED,
  userId: 'usr_me',
  period: 'month',
  limit: 25,
  spent: 25.03,
  periodEnd: '2026-12-01T00:00:00.000Z',
};

describe('parseSpendLimitRefusalPayload', () => {
  it('accepts a well-formed refusal payload', () => {
    expect(parseSpendLimitRefusalPayload(VALID_REFUSAL)).toEqual(VALID_REFUSAL);
  });

  it('rejects a body that does not name SPEND_LIMIT_REACHED', () => {
    expect(parseSpendLimitRefusalPayload({ ...VALID_REFUSAL, error: 'OTHER_ERROR' })).toBeUndefined();
  });

  it('rejects payloads missing contract fields', () => {
    const noPeriod = { ...VALID_REFUSAL } as Record<string, unknown>;
    delete noPeriod.period;
    expect(parseSpendLimitRefusalPayload(noPeriod)).toBeUndefined();
    const noLimit = { ...VALID_REFUSAL } as Record<string, unknown>;
    delete noLimit.limit;
    expect(parseSpendLimitRefusalPayload(noLimit)).toBeUndefined();
    const noEnd = { ...VALID_REFUSAL } as Record<string, unknown>;
    delete noEnd.periodEnd;
    expect(parseSpendLimitRefusalPayload(noEnd)).toBeUndefined();
  });

  it('rejects non-finite amounts and unknown periods', () => {
    expect(parseSpendLimitRefusalPayload({ ...VALID_REFUSAL, limit: Number.NaN })).toBeUndefined();
    expect(parseSpendLimitRefusalPayload({ ...VALID_REFUSAL, spent: '25.03' })).toBeUndefined();
    expect(parseSpendLimitRefusalPayload({ ...VALID_REFUSAL, period: 'fortnight' })).toBeUndefined();
    expect(parseSpendLimitRefusalPayload({ ...VALID_REFUSAL, periodEnd: 17 })).toBeUndefined();
  });

  it('rejects non-object bodies', () => {
    expect(parseSpendLimitRefusalPayload(undefined)).toBeUndefined();
    expect(parseSpendLimitRefusalPayload(null)).toBeUndefined();
    expect(parseSpendLimitRefusalPayload('nope')).toBeUndefined();
  });
});

describe('spend-limit field validators', () => {
  it('accepts day, week, and month periods only', () => {
    expect(parseSpendLimitPeriod('day')).toBe('day');
    expect(parseSpendLimitPeriod('week')).toBe('week');
    expect(parseSpendLimitPeriod('month')).toBe('month');
    expect(parseSpendLimitPeriod('year')).toBeUndefined();
    expect(parseSpendLimitPeriod(undefined)).toBeUndefined();
  });

  it('accepts positive finite USD amounts up to the bound', () => {
    expect(parseSpendLimitUsd(25.5)).toBe(25.5);
    expect(parseSpendLimitUsd(0)).toBeUndefined();
    expect(parseSpendLimitUsd(-1)).toBeUndefined();
    expect(parseSpendLimitUsd(Number.NaN)).toBeUndefined();
    expect(parseSpendLimitUsd(1_000_001)).toBeUndefined();
    expect(parseSpendLimitUsd(1_000_000)).toBe(1_000_000);
  });
});

describe('parseSpendLimitsDoc', () => {
  it('extracts the spendLimits section, defaulting the period', () => {
    const parsed = parseSpendLimitsDoc({ spendLimits: { system: { limit: 12.5 } } });
    expect(parsed.status).toBe('ok');
    expect(parsed.overrides.system).toEqual({ limit: 12.5, period: 'month' });
  });

  it('drops an invalid bucket field by field with the period kept', () => {
    const warnFn = jest.fn();
    const warn = { warn: warnFn } as unknown as Pick<Console, 'warn'>;
    const parsed = parseSpendLimitsDoc({ spendLimits: { system: { limit: -3, period: 'week' } } }, warn);
    expect(parsed.status).toBe('ok');
    expect(parsed.overrides.system).toBeUndefined();
    expect(warnFn).toHaveBeenCalledWith(expect.stringContaining('spendLimits.system.limit'));
  });

  it('drops an invalid period but keeps a valid limit', () => {
    const parsed = parseSpendLimitsDoc({ spendLimits: { system: { limit: 5, period: 'fortnight' } } });
    expect(parsed.overrides.system).toEqual({ limit: 5, period: 'month' });
  });

  it('treats a missing or malformed section as uncapped', () => {
    expect(parseSpendLimitsDoc({}).overrides).toEqual({});
    expect(parseSpendLimitsDoc({ spendLimits: 'nope' }).overrides).toEqual({});
    expect(parseSpendLimitsDoc({ spendLimits: { system: 'nope' } }).overrides).toEqual({});
  });

  it('reports an unreachable status for a non-object body', () => {
    const parsed = parseSpendLimitsDoc('not json');
    expect(parsed.status).toBe('unreachable');
    expect(parsed.overrides).toEqual({});
    expect(parsed.reason).toBe('invalid JSON');
  });

  it('round-trips through parseSpendLimitsOverrides', () => {
    expect(parseSpendLimitsOverrides(undefined)).toEqual({});
    expect(parseSpendLimitsOverrides({ system: { limit: 1, period: 'day' } })).toEqual({
      system: { limit: 1, period: 'day' },
    });
  });
});

describe('createSpendLimitsSettingsSource', () => {
  const doc = { spendLimits: { system: { limit: 40, period: 'week' } } };

  function fetcherFor(response: unknown): (url: string) => Promise<Pick<Response, 'ok' | 'status' | 'statusText' | 'json'>> {
    return async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => response,
    });
  }

  it('reads the operator system default from the settings document', async () => {
    const source = createSpendLimitsSettingsSource({ fetcher: fetcherFor(doc), logger: console });
    const snapshot = await source.refresh();
    expect(snapshot.status).toBe('ok');
    expect(source.current().overrides.system).toEqual({ limit: 40, period: 'week' });
  });

  it('is uncapped while the document is missing', async () => {
    const source = createSpendLimitsSettingsSource({
      fetcher: async () => ({ ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) }),
      logger: console,
    });
    const snapshot = await source.refresh();
    expect(snapshot.status).toBe('missing');
    expect(source.current().overrides.system).toBeUndefined();
  });

  it('keeps the last known values when a fetch fails and never rejects', async () => {
    let fail = false;
    const source = createSpendLimitsSettingsSource({
      fetcher: async () => {
        if (fail) throw new Error('artifacts down');
        return { ok: true, status: 200, statusText: 'OK', json: async () => doc };
      },
      ttlMs: 0, // every refresh fetches — no fresh-cache short-circuit
      logger: console,
    });
    await source.refresh();
    expect(source.current().overrides.system).toEqual({ limit: 40, period: 'week' });

    fail = true;
    await expect(source.refresh()).resolves.toMatchObject({ status: 'unreachable' });
    expect(source.current().overrides.system).toEqual({ limit: 40, period: 'week' });
  });

  it('defaults the document id to the brain settings document', () => {
    expect(BRAIN_SETTINGS_DOC_ID).toBe('brain/settings/llm-config');
  });
});
