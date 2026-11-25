// The scheduler reads ARTIFACTS_URL once at module load; the mocked shared
// module factory sets it before scheduler.ts is ever required.
process.env.ARTIFACTS_URL = 'http://artifacts:4200';

let mockSettings: { watchSchedulerPollMs?: number } | null = null;
let mockHttpRequestCalls = 0;

jest.mock('@stage7-nextgen/shared', () => {
  const actual = jest.requireActual('@stage7-nextgen/shared');
  return {
    ...actual,
    fetchLlmSettingsDoc: async () => mockSettings,
    httpRequest: async () => {
      mockHttpRequestCalls += 1;
      return { ok: true, status: 200, json: async () => ({ documents: [] }) };
    },
    getServiceAuthorizationHeaders: async () => ({ Authorization: 'Bearer test' }),
  };
});

import { startWatchScheduler, resolveWatchPollIntervalMs } from '../src/scheduler';
import { TemporalClient } from '../src/client/TemporalClient';

const stubClient = { startWatchOrchestrator: async () => {} } as unknown as TemporalClient;

afterEach(() => {
  delete process.env.WATCH_SCHEDULER_POLL_MS;
  mockSettings = null;
  mockHttpRequestCalls = 0;
});

describe('resolveWatchPollIntervalMs', () => {
  it('prefers the settings document, then env, then the default', async () => {
    const fetchSettings = jest.fn(async () => ({ watchSchedulerPollMs: 1234 }));
    await expect(resolveWatchPollIntervalMs(fetchSettings)).resolves.toBe(1234);

    process.env.WATCH_SCHEDULER_POLL_MS = '777';
    await expect(resolveWatchPollIntervalMs(async () => null)).resolves.toBe(777);

    delete process.env.WATCH_SCHEDULER_POLL_MS;
    await expect(resolveWatchPollIntervalMs(async () => null)).resolves.toBe(60_000);
  });

  it('ignores invalid env and settings values', async () => {
    process.env.WATCH_SCHEDULER_POLL_MS = 'not-a-number';
    await expect(resolveWatchPollIntervalMs(async () => ({ watchSchedulerPollMs: 0 }))).resolves.toBe(60_000);
  });
});

describe('watch scheduler per-tick interval', () => {
  it('applies a changed settings interval from the next cycle onward', async () => {
    jest.useFakeTimers();
    try {
      mockSettings = { watchSchedulerPollMs: 40 };
      const stop = startWatchScheduler(stubClient);

      // Tick 1 runs immediately on start.
      await jest.advanceTimersByTimeAsync(0);
      expect(mockHttpRequestCalls).toBe(1);

      // Tick 2 fires after the 40ms settings interval. Its own resolve reads
      // the settings AFTER its poll, so the change made before it runs is what
      // schedules the next cycle.
      mockSettings = { watchSchedulerPollMs: 80 };
      await jest.advanceTimersByTimeAsync(40);
      expect(mockHttpRequestCalls).toBe(2);

      // The next tick comes at the new 80ms value, not the old 40ms one.
      await jest.advanceTimersByTimeAsync(40);
      expect(mockHttpRequestCalls).toBe(2);
      await jest.advanceTimersByTimeAsync(40);
      expect(mockHttpRequestCalls).toBe(3);

      stop();
      await jest.advanceTimersByTimeAsync(80);
      expect(mockHttpRequestCalls).toBe(3);
    } finally {
      jest.useRealTimers();
    }
  });
});
