import { TemporalClient } from '../client/TemporalClient';
import { fetchWatchActivity, runWatchActivity } from '../activities/watchActivity';

jest.mock('../activities/watchActivity', () => ({
  runWatchActivity: jest.fn(async () => ({
    success: true,
    runId: 'run-1',
    skill: 'test-skill',
    runAt: '2026-01-01T00:00:00.000Z',
    persisted: true,
    lastRunRecorded: true,
    error: null,
    result: {},
  })),
  // Default: the watch disappears on the second read, so a started loop terminates promptly.
  fetchWatchActivity: jest.fn(),
}));

const fetchMock = fetchWatchActivity as jest.MockedFunction<typeof fetchWatchActivity>;
const runMock = runWatchActivity as jest.MockedFunction<typeof runWatchActivity>;

/** A promise that never settles, used to hold a fallback loop open. */
function never<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

function clientWith(stub: unknown): TemporalClient {
  const client = new TemporalClient('test-ns');
  (client as any).client = stub;
  return client;
}

function alreadyStartedError() {
  const err = new Error('workflow execution already started');
  err.name = 'WorkflowExecutionAlreadyStartedError';
  return err;
}

beforeEach(() => {
  fetchMock.mockReset();
  runMock.mockReset();
  runMock.mockResolvedValue({
    success: true,
    runId: 'run-1',
    skill: 'test-skill',
    runAt: '2026-01-01T00:00:00.000Z',
    persisted: true,
    lastRunRecorded: true,
    error: null,
    result: {},
  } as any);
});

describe('startWatchOrchestrator does not duplicate running watches', () => {
  // This is the defect: the scheduler re-offers every enabled watch on every poll. Temporal answers
  // "already started" once the durable orchestrator is up, and the old code read that as a failure
  // and started an in-process loop too - so every poll added another runner and the watch fired
  // once per runner, forever.
  it('treats an already-started workflow as success and does not fall back', async () => {
    fetchMock.mockImplementation(() => never());
    const start = jest.fn().mockRejectedValue(alreadyStartedError());
    const client = clientWith({ workflow: { start } });

    for (let i = 0; i < 5; i += 1) {
      const workflowId = await client.startWatchOrchestrator('w1');
      expect(workflowId).toBe('watch-orch-w1');
    }

    expect(start).toHaveBeenCalledTimes(5);
    // The in-process loop must never have been entered.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(runMock).not.toHaveBeenCalled();
  });

  it('also recognises the error by message, not only by class', async () => {
    fetchMock.mockImplementation(() => never());
    const start = jest.fn().mockRejectedValue(new Error('Workflow execution is already started'));
    const client = clientWith({ workflow: { start } });

    await client.startWatchOrchestrator('w1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back at most once per watch when Temporal genuinely cannot start the workflow', async () => {
    // Held open so the fallback stays in the "running" slot across subsequent polls.
    fetchMock.mockImplementation(() => never());
    const start = jest.fn().mockRejectedValue(new Error('temporal unavailable'));
    const client = clientWith({ workflow: { start } });

    for (let i = 0; i < 4; i += 1) {
      await client.startWatchOrchestrator('w1');
    }

    expect(start).toHaveBeenCalledTimes(4);
    // One loop, not four.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps separate fallbacks for different watches', async () => {
    fetchMock.mockImplementation(() => never());
    const client = clientWith(null);

    await client.startWatchOrchestrator('w1');
    await client.startWatchOrchestrator('w2');
    await client.startWatchOrchestrator('w1');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('starts a fresh fallback once a previous loop has finished', async () => {
    // The watch is gone on the first read, so the loop completes and releases its slot.
    fetchMock.mockResolvedValue(null);
    const client = clientWith(null);

    await client.startWatchOrchestrator('w1');
    await new Promise((resolve) => setTimeout(resolve, 10));
    await client.startWatchOrchestrator('w1');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('startWatch single-shot path', () => {
  it('does not fall back when the workflow is already started', async () => {
    const start = jest.fn().mockRejectedValue(alreadyStartedError());
    const client = clientWith({ workflow: { start } });

    const workflowId = await client.startWatch('w1');

    expect(workflowId).toBe('watch-w1');
    expect(runMock).not.toHaveBeenCalled();
  });
});
