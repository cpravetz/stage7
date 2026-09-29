import { cadenceToMs, runWatchLoop, DEFAULT_CADENCE_MS, WatchLoopDeps } from '../workflows/watchLoop';

const sleepCalls: number[] = [];

function makeDeps(overrides: Partial<WatchLoopDeps> = {}): WatchLoopDeps {
  return {
    fetchWatch: async () => ({ enabled: true, cadence: '1s' }),
    runWatch: async () => ({ success: true }),
    sleep: async (ms: number) => {
      sleepCalls.push(ms);
    },
    ...overrides,
  };
}

beforeEach(() => {
  sleepCalls.length = 0;
});

describe('cadenceToMs', () => {
  it('understands the named cadences', () => {
    expect(cadenceToMs('hourly')).toBe(60 * 60 * 1000);
    expect(cadenceToMs('daily')).toBe(24 * 60 * 60 * 1000);
  });

  it('understands explicit unit forms', () => {
    expect(cadenceToMs('30s')).toBe(30_000);
    expect(cadenceToMs('5m')).toBe(300_000);
    expect(cadenceToMs('2h')).toBe(7_200_000);
    expect(cadenceToMs('3d')).toBe(259_200_000);
  });

  // A typo must fall back to daily, never to a tight loop that would hammer the executor.
  it('falls back to daily for missing or unrecognised cadences', () => {
    for (const value of [undefined, null, '', 'often', '5x', {}, '0']) {
      expect(cadenceToMs(value)).toBe(DEFAULT_CADENCE_MS);
    }
  });
});

describe('runWatchLoop', () => {
  it('repeats the watch for the requested number of cycles, sleeping the cadence each time', async () => {
    let runs = 0;
    const result = await runWatchLoop(
      'w1',
      makeDeps({
        fetchWatch: async () => ({ enabled: true, cadence: '5m' }),
        runWatch: async () => {
          runs += 1;
          return { success: true };
        },
      }),
      { maxCycles: 3 },
    );

    expect(runs).toBe(3);
    expect(result).toMatchObject({ cycles: 3, succeeded: 3, failed: 0, reason: 'max-cycles' });
    // 3 cycles means 3 runs but only 2 waits, because the loop stops before sleeping after the last.
    expect(sleepCalls).toEqual([300_000, 300_000]);
  });

  it('stops when the watch is disabled', async () => {
    const result = await runWatchLoop('w1', makeDeps({ fetchWatch: async () => ({ enabled: false }) }), {
      maxCycles: 5,
    });
    expect(result.reason).toBe('disabled');
    expect(result.cycles).toBe(0);
  });

  it('stops when the watch no longer exists', async () => {
    const result = await runWatchLoop('w1', makeDeps({ fetchWatch: async () => null }));
    expect(result.reason).toBe('missing');
  });

  // The previous orchestrator swallowed every activity failure and always reported success.
  it('counts a failed cycle as failed and keeps going', async () => {
    const result = await runWatchLoop(
      'w1',
      makeDeps({
        fetchWatch: async () => ({ enabled: true, cadence: '1s' }),
        runWatch: async () => ({ success: false, error: 'tool exploded' }),
      }),
      { maxCycles: 2 },
    );

    expect(result).toMatchObject({ cycles: 2, succeeded: 0, failed: 2, lastError: 'tool exploded' });
  });

  it('counts a thrown cycle as failed rather than crashing the loop', async () => {
    const result = await runWatchLoop(
      'w1',
      makeDeps({
        runWatch: async () => {
          throw new Error('network down');
        },
      }),
      { maxCycles: 2 },
    );

    expect(result).toMatchObject({ cycles: 2, failed: 2, lastError: 'network down' });
  });

  it('clears the last error once a cycle succeeds again', async () => {
    let attempt = 0;
    const result = await runWatchLoop(
      'w1',
      makeDeps({
        runWatch: async () => {
          attempt += 1;
          return attempt === 1 ? { success: false, error: 'blip' } : { success: true };
        },
      }),
      { maxCycles: 2 },
    );

    expect(result).toMatchObject({ cycles: 2, succeeded: 1, failed: 1, lastError: null });
  });

  // A watch whose document cannot be read must not kill its own orchestrator.
  it('backs off and retries when the watch document cannot be read', async () => {
    let reads = 0;
    const result = await runWatchLoop(
      'w1',
      makeDeps({
        fetchWatch: async () => {
          reads += 1;
          if (reads === 1) throw new Error('artifacts unreachable');
          return null;
        },
      }),
    );

    expect(reads).toBe(2);
    expect(sleepCalls).toEqual([60_000]);
    expect(result.reason).toBe('missing');
  });
});
