import { NextGenError } from '@stage7-nextgen/shared';
import { brainInstance } from '../utils/sharedInstance';
import { BrainService, CompletionResult } from '../services/BrainService';
import { SpendGate, SpendLimitReachedError, periodWindow, resolveAttribution } from '../services/SpendGate';
import { FakeSpendLedger, FakeUserLimitStore, flushAsync } from './spend-test-support';
import type { LLMProvider, CompletionRequest, CompletionResponse } from '../providers/Provider';

/*
 * D2/D3 — the pre-call gate and cost reconciliation. The gate is exercised
 * both directly (with in-memory fakes for the stores) and through
 * BrainService.complete with a stubbed provider/router so the funnel's
 * placement rules are what is under test: gate after cache, refund on
 * provider failure, fire-and-forget reconcile.
 */

jest.mock('../../../../shared-nextgen/src/utils/httpClient', () => ({
  httpRequest: jest.fn().mockRejectedValue(new Error('offline in test')),
  interServiceTimeoutMs: jest.fn(() => 1_000),
}));

const MODEL = { id: 'm1', provider: 'fake', costPer1kTokens: 2, maxTokens: 8_192, capabilities: [] as string[] };

function fakeProvider(completeImpl: (req: CompletionRequest) => Promise<CompletionResponse>): LLMProvider {
  return {
    id: 'fake',
    name: 'Fake',
    info: { hasApiKey: true, openAICompatible: false },
    isAvailable: () => true,
    listModels: async () => [{ ...MODEL, name: MODEL.id }],
    complete: jest.fn(completeImpl),
    embed: async () => { throw new Error('embed not implemented'); },
  } as unknown as LLMProvider;
}

function stubRouter(brain: BrainService, provider: LLMProvider): void {
  const router = {
    getCandidates: jest.fn().mockReturnValue([{ model: MODEL }]),
    setPerformanceMetrics: jest.fn(),
    listModels: jest.fn().mockReturnValue([MODEL]),
    updateProviderHealth: jest.fn(),
    registerModels: jest.fn(),
    registerModel: jest.fn(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (brain as any).router = router;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (brain as any).providers = [provider];
}

function replaceGate(brain: BrainService, gate: SpendGate): SpendGate {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (brain as any).spendGate = gate;
  return gate;
}

const uniquePrompt = (label: string): string => `${label} ${Date.now()}_${Math.random()}`;

describe('SpendGate (unit, fake stores)', () => {
  let clock: Date;
  let ledger: FakeSpendLedger;
  let limits: FakeUserLimitStore;
  let gate: SpendGate;

  beforeEach(() => {
    clock = new Date('2026-03-15T10:00:00Z');
    ledger = new FakeSpendLedger();
    limits = new FakeUserLimitStore();
    gate = new SpendGate({ ledger, limits, now: () => clock });
  });

  it('returns null (uncapped) when no user limit and no operator default apply', async () => {
    await expect(gate.enforce('usr_free', 1)).resolves.toBeNull();
  });

  it('reserves under the cap and reports the window', async () => {
    await limits.set('usr_ok', 10, 'month');
    const reservation = await gate.enforce('usr_ok', 2);
    expect(reservation).toMatchObject({ userId: 'usr_ok', limit: 10, estimate: 2 });
    expect(reservation?.window.periodStart.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(reservation?.window.periodEnd.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('throws the typed refusal with the exact 429 payload at the cap', async () => {
    await limits.set('usr_capped', 5, 'month');
    await gate.enforce('usr_capped', 5);
    expect(ledger.spentFor('usr_capped', new Date('2026-03-01T00:00:00Z'))).toBe(5);
    try {
      await gate.enforce('usr_capped', 1);
      throw new Error('expected enforce to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SpendLimitReachedError);
      const refusal = err as SpendLimitReachedError;
      expect(refusal.payload).toEqual({
        error: 'SPEND_LIMIT_REACHED',
        userId: 'usr_capped',
        period: 'month',
        limit: 5,
        spent: 5,
        periodEnd: '2026-04-01T00:00:00.000Z',
      });
      expect((refusal as NextGenError).statusCode).toBe(429);
    }
  });

  it('fails closed with a 503 when the limit state is unreadable', async () => {
    limits.failReads = true;
    try {
      await gate.enforce('usr_any', 1);
      throw new Error('expected enforce to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(NextGenError);
      expect((err as NextGenError).statusCode).toBe(503);
    }
  });

  it('fails closed with a 503 when the ledger is unavailable', async () => {
    await limits.set('usr_ledger_down', 10, 'month');
    const downGate = new SpendGate({ ledger: new FakeSpendLedger(true), limits, now: () => clock });
    try {
      await downGate.enforce('usr_ledger_down', 1);
      throw new Error('expected enforce to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(NextGenError);
      expect((err as NextGenError).statusCode).toBe(503);
    }
  });

  it('applies the operator default only to the system bucket', async () => {
    const gateWithDefault = new SpendGate({
      ledger,
      limits,
      now: () => clock,
      operatorSystemDefault: () => ({ limit: 100, period: 'day' }),
    });
    // A named user with no settings doc stays uncapped even with an operator default.
    await expect(gateWithDefault.enforce('usr_named', 1)).resolves.toBeNull();
    // The system bucket picks the operator default up.
    const reservation = await gateWithDefault.enforce(undefined, 1);
    expect(reservation).toMatchObject({ userId: 'system', limit: 100 });
  });

  it('reconciles to the actual cost and refunds on failure without throwing', async () => {
    await limits.set('usr_rec', 10, 'month');
    const reservation = (await gate.enforce('usr_rec', 2))!;
    // Actual cost below the estimate: the difference is refunded.
    gate.reconcile(reservation, 1.5);
    // Ledger write failures are swallowed (fire-and-forget).
    ledger.failReserves = true;
    gate.reconcile(reservation, 9);
    gate.refund(reservation);
    await flushAsync();
    expect(ledger.spentFor('usr_rec', new Date('2026-03-01T00:00:00Z'))).toBe(1.5);
  });

  it('computes UTC period windows', () => {
    // 2026-03-15 is a Sunday; the week starts Monday 2026-03-09.
    expect(periodWindow('day', new Date('2026-03-15T10:00:00Z')).periodStart.toISOString()).toBe('2026-03-15T00:00:00.000Z');
    expect(periodWindow('week', new Date('2026-03-15T10:00:00Z')).periodStart.toISOString()).toBe('2026-03-09T00:00:00.000Z');
    expect(periodWindow('month', new Date('2026-03-15T10:00:00Z')).periodEnd.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('resolves attribution to the system bucket when no user is known', () => {
    expect(resolveAttribution(undefined)).toBe('system');
    expect(resolveAttribution('  ')).toBe('system');
    expect(resolveAttribution(' usr_1 ')).toBe('usr_1');
  });
});

describe('BrainService.complete spend gate (D2/D3)', () => {
  const brain = brainInstance;

  it('refuses at the cap with the exact payload and never calls the provider', async () => {
    const ledger = new FakeSpendLedger();
    const limits = new FakeUserLimitStore();
    await limits.set('usr_capped', 5, 'month');
    const clock = new Date('2026-03-15T10:00:00Z');
    const gate = new SpendGate({ ledger, limits, now: () => clock });
    replaceGate(brain, gate);
    const provider = fakeProvider(async () => ({ content: 'should not happen', model: 'm1', provider: 'fake' }));
    stubRouter(brain, provider);

    // Fill the window to the cap before the completion runs.
    await gate.enforce('usr_capped', 5);
    await expect(brain.complete(uniquePrompt('capped'), { userId: 'usr_capped' }))
      .rejects.toBeInstanceOf(SpendLimitReachedError);
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('reserves under the cap and reconciles the ledger to the actual cost', async () => {
    const ledger = new FakeSpendLedger();
    const limits = new FakeUserLimitStore();
    await limits.set('usr_ok', 100, 'month');
    const clock = new Date('2026-03-15T10:00:00Z');
    const gate = new SpendGate({ ledger, limits, now: () => clock });
    replaceGate(brain, gate);
    const provider = fakeProvider(async () => ({ content: 'ok', model: 'm1', provider: 'fake', tokensUsed: 1_500 }));
    stubRouter(brain, provider);

    const result: CompletionResult = await brain.complete(uniquePrompt('reconcile'), { userId: 'usr_ok' });
    expect(result.cached).toBe(false);

    // Actual estimated cost: 1500 tokens at $2/1k = $3. The reconciliation
    // replaces the pre-call reservation with the actual figure.
    await flushAsync();
    const windowStart = new Date('2026-03-01T00:00:00Z');
    expect(ledger.spentFor('usr_ok', windowStart)).toBeCloseTo(3, 8);
    expect(ledger.reconciles).toHaveLength(1);
  });

  it('serves cache hits without consulting the gate', async () => {
    const ledger = new FakeSpendLedger();
    const limits = new FakeUserLimitStore();
    const clock = new Date('2026-03-15T10:00:00Z');
    const gate = new SpendGate({ ledger, limits, now: () => clock });
    replaceGate(brain, gate);
    const provider = fakeProvider(async () => ({ content: 'cached answer', model: 'm1', provider: 'fake', tokensUsed: 10 }));
    stubRouter(brain, provider);

    const prompt = uniquePrompt('cacheable');
    // Uncapped first call primes the cache.
    await brain.complete(prompt, {});
    const reserveCallsBefore = ledger.reserveCalls;

    // Cap the user hard, then repeat the prompt: the cache answers.
    await limits.set('usr_cache', 0.001, 'month');
    const second = await brain.complete(prompt, { userId: 'usr_cache' });
    expect(second.cached).toBe(true);
    expect(ledger.reserveCalls).toBe(reserveCallsBefore);
  });

  it('refunds the reservation when every provider attempt fails', async () => {
    const ledger = new FakeSpendLedger();
    const limits = new FakeUserLimitStore();
    await limits.set('usr_fail', 100, 'month');
    const clock = new Date('2026-03-15T10:00:00Z');
    const gate = new SpendGate({ ledger, limits, now: () => clock });
    replaceGate(brain, gate);
    const provider = fakeProvider(async () => { throw new Error('provider exploded'); });
    stubRouter(brain, provider);

    await expect(brain.complete(uniquePrompt('failing'), { userId: 'usr_fail' })).rejects.toThrow('provider exploded');
    await flushAsync();
    expect(ledger.spentFor('usr_fail', new Date('2026-03-01T00:00:00Z'))).toBe(0);
    // The refund is a negative reconciliation of the original reservation.
    expect(ledger.reconciles.some((r) => r.delta < 0)).toBe(true);
  });

  it('does not fail the completion when the ledger throws during reconcile', async () => {
    const ledger = new FakeSpendLedger();
    const limits = new FakeUserLimitStore();
    await limits.set('usr_ledger_fail', 100, 'month');
    const clock = new Date('2026-03-15T10:00:00Z');
    const gate = new SpendGate({ ledger, limits, now: () => clock });
    replaceGate(brain, gate);
    const provider = fakeProvider(async () => ({ content: 'ok', model: 'm1', provider: 'fake', tokensUsed: 1_000 }));
    stubRouter(brain, provider);

    ledger.failReserves = false;
    // Post-reservation ledger failures must not fail the completion.
    jest.spyOn(ledger, 'reconcile').mockRejectedValue(new Error('ledger write failed'));
    const result = await brain.complete(uniquePrompt('ledger write fails'), { userId: 'usr_ledger_fail' });
    expect(result.content).toBe('ok');
  });

  it('fails closed when the ledger refuses the reservation', async () => {
    const ledger = new FakeSpendLedger(true);
    const limits = new FakeUserLimitStore();
    await limits.set('usr_down', 100, 'month');
    const clock = new Date('2026-03-15T10:00:00Z');
    const gate = new SpendGate({ ledger, limits, now: () => clock });
    replaceGate(brain, gate);
    const provider = fakeProvider(async () => ({ content: 'ok', model: 'm1', provider: 'fake' }));
    stubRouter(brain, provider);

    try {
      await brain.complete(uniquePrompt('down'), { userId: 'usr_down' });
      throw new Error('expected complete to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(NextGenError);
      expect((err as NextGenError).statusCode).toBe(503);
    }
    expect(provider.complete).not.toHaveBeenCalled();
  });
});
