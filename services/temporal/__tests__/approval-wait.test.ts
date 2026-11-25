import { waitForApproval } from '../src/activities/approvalWait';

type Settings = { approvalTimeoutMs?: number; approvalPollIntervalMs?: number } | null;

describe('waitForApproval settings consumption', () => {
  const defaultOptions = {
    missionId: 'mission-1',
    phaseId: 'phase-1',
    heartbeat: async () => {},
  };

  afterEach(() => {
    delete process.env.APPROVAL_TIMEOUT_MS;
    delete process.env.APPROVAL_POLL_INTERVAL_MS;
  });

  it('uses settings-doc values for the window and poll interval', async () => {
    const fetchSettings = jest.fn(async () => ({ approvalTimeoutMs: 50, approvalPollIntervalMs: 10 }) as Settings);
    // Approved on the 4th poll: 4 sleeps at the 10ms settings interval.
    let checks = 0;
    const sleeps: number[] = [];
    const verdict = await waitForApproval({
      ...defaultOptions,
      fetchSettings,
      sleep: async (ms) => { sleeps.push(ms); },
      checkPhase: async () => ({ status: ++checks < 4 ? 'awaiting_approval' : 'approved' }),
    });

    expect(verdict).toEqual({ approved: true });
    expect(checks).toBe(4);
    expect(sleeps).toEqual([10, 10, 10, 10]);
  });

  it('falls back to env/defaults when the settings document is missing', async () => {
    process.env.APPROVAL_TIMEOUT_MS = '100';
    process.env.APPROVAL_POLL_INTERVAL_MS = '5';
    const fetchSettings = jest.fn(async () => null);
    const sleeps: number[] = [];
    const verdict = await waitForApproval({
      ...defaultOptions,
      fetchSettings,
      sleep: async (ms) => { sleeps.push(ms); },
      checkPhase: async () => ({ status: 'awaiting_approval' }),
    });

    // The window never approves, so the captured 100ms timeout expires and the
    // loop reports the timeout verdict; every tick slept the env interval.
    expect(verdict).toEqual({ approved: false, reason: 'Approval timeout' });
    expect(sleeps.length).toBeGreaterThan(0);
    expect(sleeps.every((ms) => ms === 5)).toBe(true);
  });

  it('captures the window once before the poll loop: a mid-wait change cannot shrink it', async () => {
    const settings: Settings = { approvalTimeoutMs: 60, approvalPollIntervalMs: 5 };
    const fetchSettings = jest.fn(async () => settings);
    let checks = 0;
    const verdict = await waitForApproval({
      ...defaultOptions,
      fetchSettings,
      sleep: async () => {
        // After the first tick, pretend the settings document shrank the
        // window to 1ms. The wait must not re-read it: the running window was
        // captured at loop start.
        if (++checks === 1) settings.approvalTimeoutMs = 1;
      },
      checkPhase: async () => ({ status: checks >= 8 ? 'approved' : 'awaiting_approval' }),
    });

    expect(verdict).toEqual({ approved: true });
    // Eight ticks ran inside the originally captured 60ms window — a mid-wait
    // re-read would have timed out after the first tick.
    expect(checks).toBeGreaterThanOrEqual(8);
    // The settings fetch happened exactly once, before the loop.
    expect(fetchSettings).toHaveBeenCalledTimes(1);
  });

  it('reports rejection reasons from the phase document', async () => {
    const fetchSettings = jest.fn(async () => null);
    const verdict = await waitForApproval({
      ...defaultOptions,
      fetchSettings,
      sleep: async () => {},
      checkPhase: async () => ({ status: 'rejected', rejectionReason: 'not acceptable' }),
    });

    expect(verdict).toEqual({ approved: false, reason: 'not acceptable' });
  });
});
