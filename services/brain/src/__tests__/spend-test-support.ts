import { MongoClient } from 'mongodb';
import type { SpendLimitPeriod } from '@stage7-nextgen/shared';
import type {
  ReserveOutcome,
  SpendLedger,
  SpendWindow,
  UserLimitStore,
  UserSpendLimitDoc,
} from '../data/spendStores';

/**
 * In-memory ledger with the real store's reservation semantics: the window
 * doc is created on first reserve, the refusal decision is a check-then-
 * increment, and `spent` may overshoot the cap by one reservation (bounded by
 * in-flight calls), exactly like the spec's conditional findOneAndUpdate.
 */
export class FakeSpendLedger implements SpendLedger {
  private windows = new Map<string, { window: SpendWindow; limit: number; spent: number }>();
  reserveCalls = 0;
  reconciles: Array<{ userId: string; periodStart: Date; delta: number }> = [];

  constructor(private failReserves = false) {}

  private key(userId: string, periodStart: Date): string {
    return `${userId}\u0000${periodStart.toISOString()}`;
  }

  async reserve(userId: string, window: SpendWindow, limit: number, estimate: number): Promise<ReserveOutcome> {
    this.reserveCalls++;
    if (this.failReserves) throw new Error('ledger unavailable');
    const key = this.key(userId, window.periodStart);
    if (!this.windows.has(key)) {
      this.windows.set(key, { window, limit, spent: 0 });
    }
    const doc = this.windows.get(key)!;
    doc.limit = limit;
    if (doc.spent >= limit) return { ok: false, spent: doc.spent };
    doc.spent += estimate;
    return { ok: true, spentAfter: doc.spent };
  }

  async reconcile(userId: string, periodStart: Date, delta: number): Promise<void> {
    if (this.failReserves) throw new Error('ledger unavailable');
    this.reconciles.push({ userId, periodStart, delta });
    const doc = this.windows.get(this.key(userId, periodStart));
    if (doc) doc.spent += delta;
  }

  async usage(userId: string, periodStart: Date): Promise<number | undefined> {
    return this.windows.get(this.key(userId, periodStart))?.spent;
  }

  spentFor(userId: string, periodStart: Date): number {
    return this.windows.get(this.key(userId, periodStart))?.spent ?? 0;
  }
}

/** In-memory user-limit store; `failReads` simulates the store being down. */
export class FakeUserLimitStore implements UserLimitStore {
  private docs = new Map<string, UserSpendLimitDoc>();
  failReads = false;

  async get(userId: string): Promise<UserSpendLimitDoc | undefined> {
    if (this.failReads) throw new Error('limit store unavailable');
    const doc = this.docs.get(userId);
    return doc ? { ...doc } : undefined;
  }

  async set(userId: string, limit: number, period: SpendLimitPeriod): Promise<UserSpendLimitDoc> {
    const doc: UserSpendLimitDoc = { userId, limit, period, currency: 'USD', updatedAt: new Date() };
    this.docs.set(userId, doc);
    return { ...doc };
  }

  async clear(userId: string): Promise<boolean> {
    return this.docs.delete(userId);
  }
}

/**
 * Gives the store-backed suites an isolated database. MongoBaseStore reads
 * MONGO_URI/MONGO_DB at call time (tests/setup.ts points MONGO_URI at a
 * reachable local Mongo when it can), so setting the env here scopes every
 * store in this worker to a throwaway db.
 */
export function useSpendTestDb(): string {
  const dbName = `stage7_spend_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
  process.env.MONGO_DB = dbName;
  return dbName;
}

export async function dropTestDb(dbName: string): Promise<void> {
  const client = new MongoClient(process.env.MONGO_URI || 'mongodb://localhost:27017', {
    serverSelectionTimeoutMS: 2_000,
  });
  try {
    await client.connect();
    await client.db(dbName).dropDatabase();
  } finally {
    await client.close();
  }
}

/** Lets fire-and-forget ledger writes (promise + .catch) settle before asserts. */
export async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}
