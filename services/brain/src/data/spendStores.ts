import { Collection } from 'mongodb';
import { MongoBaseStore, stripMongoId } from '@stage7-nextgen/shared';
import type { SpendLimitPeriod } from '@stage7-nextgen/shared';

/** A spending period: explicit UTC boundaries, so rollover is a data comparison. */
export interface SpendWindow {
  period: SpendLimitPeriod;
  periodStart: Date;
  periodEnd: Date;
}

export interface SpendLedgerDoc {
  userId: string;
  period: SpendLimitPeriod;
  periodStart: Date;
  periodEnd: Date;
  /** Cap in effect when this window was last reserved against; reporting only. */
  limit: number;
  /** Estimated USD spent in this window. */
  spent: number;
  updatedAt: Date;
}

export interface UserSpendLimitDoc {
  userId: string;
  /** Estimated USD ceiling per period. */
  limit: number;
  period: SpendLimitPeriod;
  currency: 'USD';
  updatedAt: Date;
}

export type ReserveOutcome =
  | { ok: true; spentAfter: number }
  | { ok: false; spent?: number };

/** Ledger contract the gate depends on; real store and test fakes both fit. */
export interface SpendLedger {
  reserve(userId: string, window: SpendWindow, limit: number, estimate: number): Promise<ReserveOutcome>;
  reconcile(userId: string, periodStart: Date, delta: number): Promise<void>;
  usage(userId: string, periodStart: Date): Promise<number | undefined>;
}

/** User-limit store contract the gate depends on. */
export interface UserLimitStore {
  get(userId: string): Promise<UserSpendLimitDoc | undefined>;
  set(userId: string, limit: number, period: SpendLimitPeriod): Promise<UserSpendLimitDoc>;
  clear(userId: string): Promise<boolean>;
}

/**
 * Per-user, per-period spend ledger (collection `spendLedger`). One document
 * per user per window; the reservation is an atomic conditional increment so
 * concurrent calls near the cap cannot each pass the check before any write
 * lands.
 */
export class SpendLedgerStore extends MongoBaseStore implements SpendLedger {
  protected readonly storeName = 'SpendLedgerStore';
  private ledger: Collection<SpendLedgerDoc & { _id?: string }> | null = null;

  protected async initialize(): Promise<void> {
    this.ledger = this.db!.collection<SpendLedgerDoc & { _id?: string }>('spendLedger');
    await this.ledger.createIndex({ userId: 1, periodStart: 1 }, { unique: true });
  }

  protected override onConnectFailed(): void {
    this.ledger = null;
  }

  private async collection(): Promise<Collection<SpendLedgerDoc & { _id?: string }>> {
    if (!this.ledger) await this.connect();
    return this.ledger!;
  }

  /**
   * Reserves `estimate` USD of the user's remaining budget for the window.
   * The refusal decision is the single conditional findOneAndUpdate: it
   * succeeds (and increments) only while `spent < limit`, and returns a
   * refusal without mutating anything once the cap is reached. A new period's
   * window simply reserves into a fresh document — no timers.
   */
  async reserve(userId: string, window: SpendWindow, limit: number, estimate: number): Promise<ReserveOutcome> {
    const ledger = await this.collection();
    const now = new Date();
    // Idempotent window setup: the first caller in a period creates the
    // document, later callers refresh the cap it reports. Never touches
    // `spent`, so this cannot be used to bypass the conditional increment.
    await ledger.updateOne(
      { userId, periodStart: window.periodStart },
      {
        $setOnInsert: { period: window.period, periodEnd: window.periodEnd, spent: 0 },
        $set: { limit, updatedAt: now },
      },
      { upsert: true },
    );
    const reserved = await ledger.findOneAndUpdate(
      { userId, periodStart: window.periodStart, spent: { $lt: limit } },
      { $inc: { spent: estimate }, $set: { updatedAt: now } },
      { returnDocument: 'after' },
    );
    if (reserved) return { ok: true, spentAfter: reserved.spent };
    // At cap: report the window's recorded spend, if the document can be read.
    const current = await ledger.findOne({ userId, periodStart: window.periodStart });
    return { ok: false, spent: current?.spent };
  }

  /**
   * Applies a post-call correction to an existing reservation: the positive
   * difference when the actual estimated cost exceeded the reservation, or a
   * refund (negative delta) when the reservation is released. No-op when the
   * window document is gone.
   */
  async reconcile(userId: string, periodStart: Date, delta: number): Promise<void> {
    if (delta === 0) return;
    const ledger = await this.collection();
    await ledger.updateOne(
      { userId, periodStart },
      { $inc: { spent: delta }, $set: { updatedAt: new Date() } },
    );
  }

  /** Estimated spend recorded for the window, or undefined when it has none. */
  async usage(userId: string, periodStart: Date): Promise<number | undefined> {
    const ledger = await this.collection();
    const doc = await ledger.findOne({ userId, periodStart });
    return doc?.spent;
  }
}

/**
 * Per-user spending limits (collection `spendLimits`). Absence of a document
 * means the user is uncapped.
 */
export class UserSpendLimitStore extends MongoBaseStore implements UserLimitStore {
  protected readonly storeName = 'UserSpendLimitStore';
  private limits: Collection<UserSpendLimitDoc & { _id?: string }> | null = null;

  protected async initialize(): Promise<void> {
    this.limits = this.db!.collection<UserSpendLimitDoc & { _id?: string }>('spendLimits');
    await this.limits.createIndex({ userId: 1 }, { unique: true });
  }

  protected override onConnectFailed(): void {
    this.limits = null;
  }

  private async collection(): Promise<Collection<UserSpendLimitDoc & { _id?: string }>> {
    if (!this.limits) await this.connect();
    return this.limits!;
  }

  async get(userId: string): Promise<UserSpendLimitDoc | undefined> {
    const limits = await this.collection();
    const doc = await limits.findOne({ userId });
    return doc ? stripMongoId<UserSpendLimitDoc>(doc) : undefined;
  }

  async set(userId: string, limit: number, period: SpendLimitPeriod): Promise<UserSpendLimitDoc> {
    const limits = await this.collection();
    const doc: UserSpendLimitDoc & { _id?: string } = { userId, limit, period, currency: 'USD', updatedAt: new Date() };
    await limits.replaceOne({ userId }, doc, { upsert: true });
    return doc;
  }

  async clear(userId: string): Promise<boolean> {
    const limits = await this.collection();
    const result = await limits.deleteOne({ userId });
    return result.deletedCount > 0;
  }
}
