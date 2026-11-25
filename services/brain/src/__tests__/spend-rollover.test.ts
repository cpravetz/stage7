import { SpendGate, SpendLimitReachedError } from '../services/SpendGate';
import { SpendLedgerStore, UserSpendLimitStore } from '../data/spendStores';
import { dropTestDb, useSpendTestDb } from './spend-test-support';

/**
 * D7 — period reset end-to-end against the real ledger: with a limit set and
 * spend at the cap, the gate refuses; once the simulated clock passes the
 * stored periodEnd, the next request reserves into a fresh window and
 * succeeds. No timers — the rollover is a data comparison.
 */
describe('Spend limit period rollover (D7, Mongo integration)', () => {
  const dbName = useSpendTestDb();
  let ledger: SpendLedgerStore;
  let limits: UserSpendLimitStore;
  let clock: Date;
  let gate: SpendGate;

  beforeAll(async () => {
    ledger = new SpendLedgerStore();
    limits = new UserSpendLimitStore();
    clock = new Date('2026-03-15T10:00:00Z');
    gate = new SpendGate({ ledger, limits, now: () => clock });
    await limits.set('usr_rollover', 1, 'month');
  });

  afterAll(async () => {
    await ledger.disconnect();
    await limits.disconnect();
    await dropTestDb(dbName);
  });

  it('refuses at the cap, then resumes in a fresh window after periodEnd', async () => {
    // Spend up to the cap: 0.6 + 0.5 = 1.1 reserved across two calls.
    const first = await gate.enforce('usr_rollover', 0.6);
    expect(first).not.toBeNull();
    const second = await gate.enforce('usr_rollover', 0.5);
    expect(second).not.toBeNull();

    // At the cap: refused, with the March window's resumption time.
    let refusal: SpendLimitReachedError | undefined;
    try {
      await gate.enforce('usr_rollover', 0.1);
    } catch (err) {
      refusal = err as SpendLimitReachedError;
    }
    expect(refusal).toBeInstanceOf(SpendLimitReachedError);
    expect(refusal?.payload).toMatchObject({
      error: 'SPEND_LIMIT_REACHED',
      userId: 'usr_rollover',
      period: 'month',
      limit: 1,
      spent: 1.1,
      periodEnd: '2026-04-01T00:00:00.000Z',
    });

    // The simulated clock crosses the stored periodEnd: the next request
    // reserves into a fresh April window and succeeds.
    clock = new Date('2026-04-02T00:00:00Z');
    const resumed = await gate.enforce('usr_rollover', 0.1);
    expect(resumed).not.toBeNull();
    expect(resumed?.window.periodStart.toISOString()).toBe('2026-04-01T00:00:00.000Z');

    // The ledger carries both windows; the new one starts from zero.
    await expect(ledger.usage('usr_rollover', new Date('2026-03-01T00:00:00Z'))).resolves.toBe(1.1);
    await expect(ledger.usage('usr_rollover', new Date('2026-04-01T00:00:00Z'))).resolves.toBe(0.1);
  });
});
