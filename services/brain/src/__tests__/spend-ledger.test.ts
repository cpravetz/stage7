import { SpendLedgerStore, UserSpendLimitStore } from '../data/spendStores';
import { dropTestDb, useSpendTestDb } from './spend-test-support';

/**
 * D1 — the real Mongo stores: atomic reservation, cap refusal, fresh-window
 * rollover, and limit CRUD. Runs against the sandbox Mongo (tests/setup.ts
 * points MONGO_URI at it); every run gets a throwaway database.
 */
describe('SpendLedgerStore (Mongo)', () => {
  const dbName = useSpendTestDb();
  let ledger: SpendLedgerStore;
  let limits: UserSpendLimitStore;

  const window = (periodStartIso: string, periodEndIso: string) => ({
    period: 'month' as const,
    periodStart: new Date(periodStartIso),
    periodEnd: new Date(periodEndIso),
  });

  beforeAll(async () => {
    ledger = new SpendLedgerStore();
    limits = new UserSpendLimitStore();
  });

  afterAll(async () => {
    await ledger.disconnect();
    await limits.disconnect();
    await dropTestDb(dbName);
  });

  it('reserves under the cap and increments the window', async () => {
    const win = window('2026-03-01T00:00:00Z', '2026-04-01T00:00:00Z');
    const first = await ledger.reserve('usr_inc', win, 10, 2);
    expect(first).toEqual({ ok: true, spentAfter: 2 });
    const second = await ledger.reserve('usr_inc', win, 10, 3);
    expect(second).toEqual({ ok: true, spentAfter: 5 });
    await expect(ledger.usage('usr_inc', win.periodStart)).resolves.toBe(5);
  });

  it('refuses without incrementing once the cap is reached', async () => {
    const win = window('2026-03-01T00:00:00Z', '2026-04-01T00:00:00Z');
    await ledger.reserve('usr_cap', win, 5, 5);
    const refused = await ledger.reserve('usr_cap', win, 5, 0.5);
    expect(refused).toMatchObject({ ok: false, spent: 5 });
    await expect(ledger.usage('usr_cap', win.periodStart)).resolves.toBe(5);
  });

  it('bounds concurrent reserves so parallel calls cannot jointly run past the cap', async () => {
    const win = window('2026-03-01T00:00:00Z', '2026-04-01T00:00:00Z');
    const outcomes = await Promise.all(
      Array.from({ length: 10 }, () => ledger.reserve('usr_race', win, 1, 0.3)),
    );
    const successes = outcomes.filter((o) => o.ok);
    // Each 0.3 reservation passes only while spent < 1: 0.0..0.9 succeed
    // (4 increments to 1.2), everything after sees spent >= 1 and refuses.
    expect(successes).toHaveLength(4);
    await expect(ledger.usage('usr_race', win.periodStart)).resolves.toBe(1.2);
    // A late arrival after the cap cannot sneak in either.
    const late = await ledger.reserve('usr_race', win, 1, 0.3);
    expect(late).toMatchObject({ ok: false });
  });

  it('opens a fresh document for a new period window', async () => {
    const march = window('2026-03-01T00:00:00Z', '2026-04-01T00:00:00Z');
    const april = window('2026-04-01T00:00:00Z', '2026-05-01T00:00:00Z');
    await ledger.reserve('usr_roll', march, 10, 7);
    const next = await ledger.reserve('usr_roll', april, 10, 2);
    expect(next).toEqual({ ok: true, spentAfter: 2 });
    await expect(ledger.usage('usr_roll', march.periodStart)).resolves.toBe(7);
    await expect(ledger.usage('usr_roll', april.periodStart)).resolves.toBe(2);
  });

  it('reconciles a reservation to the actual cost (up or down)', async () => {
    const win = window('2026-03-01T00:00:00Z', '2026-04-01T00:00:00Z');
    await ledger.reserve('usr_rec', win, 10, 4);
    await ledger.reconcile('usr_rec', win.periodStart, 1.5);
    await expect(ledger.usage('usr_rec', win.periodStart)).resolves.toBe(5.5);
    await ledger.reconcile('usr_rec', win.periodStart, -2);
    await expect(ledger.usage('usr_rec', win.periodStart)).resolves.toBe(3.5);
  });
});

describe('UserSpendLimitStore (Mongo)', () => {
  useSpendTestDb();
  let limits: UserSpendLimitStore;

  beforeAll(() => {
    limits = new UserSpendLimitStore();
  });

  afterAll(async () => {
    await limits.disconnect();
  });

  it('persists, updates, and clears a limit', async () => {
    const saved = await limits.set('usr_settings', 25, 'month');
    expect(saved).toMatchObject({ userId: 'usr_settings', limit: 25, period: 'month', currency: 'USD' });

    const fetched = await limits.get('usr_settings');
    expect(fetched).toMatchObject({ userId: 'usr_settings', limit: 25, period: 'month' });

    const updated = await limits.set('usr_settings', 40, 'week');
    expect(updated).toMatchObject({ limit: 40, period: 'week' });
    await expect(limits.get('usr_settings')).resolves.toMatchObject({ limit: 40, period: 'week' });

    await expect(limits.clear('usr_settings')).resolves.toBe(true);
    await expect(limits.get('usr_settings')).resolves.toBeUndefined();
    await expect(limits.clear('usr_settings')).resolves.toBe(false);
  });

  it('reports absence of a limit as undefined (uncapped)', async () => {
    await expect(limits.get('usr_never_set')).resolves.toBeUndefined();
  });
});
