import {
  parseLlmSettings,
  resolveBrainCompletionDeadlineMs,
  fetchLlmSettingsDoc,
  resetLlmSettingsCacheForTests,
  DEFAULT_PROVIDER_TIMEOUT_MS,
  DEFAULT_PROVIDER_ATTEMPT_TIMEOUT_MS,
  DEFAULT_COMPLETION_DEADLINE_MS,
  DEFAULT_CIRCUIT_THRESHOLD,
  DEFAULT_CIRCUIT_COOLDOWN_MS,
  DEFAULT_APPROVAL_TIMEOUT_MS,
  DEFAULT_APPROVAL_POLL_INTERVAL_MS,
  DEFAULT_WATCH_SCHEDULER_POLL_MS,
} from '../src/utils/settings';
import { resetServiceAuthForTests } from '../src/utils/serviceAuth';

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? undefined : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('parseLlmSettings field validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    for (const key of [
      'BRAIN_PROVIDER_TIMEOUT_MS',
      'BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS',
      'BRAIN_COMPLETION_DEADLINE_MS',
      'BRAIN_CIRCUIT_THRESHOLD',
      'BRAIN_CIRCUIT_COOLDOWN_MS',
      'APPROVAL_TIMEOUT_MS',
      'APPROVAL_POLL_INTERVAL_MS',
      'WATCH_SCHEDULER_POLL_MS',
    ]) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('applies defaults for a missing or empty document', () => {
    const settings = parseLlmSettings(undefined);
    expect(settings).toEqual({
      freeModelsOnly: false,
      providerTimeoutMs: DEFAULT_PROVIDER_TIMEOUT_MS,
      providerAttemptTimeoutMs: DEFAULT_PROVIDER_ATTEMPT_TIMEOUT_MS,
      completionDeadlineMs: undefined,
      circuitThreshold: DEFAULT_CIRCUIT_THRESHOLD,
      circuitCooldownMs: DEFAULT_CIRCUIT_COOLDOWN_MS,
      preferredModelIds: [],
      forbiddenModelIds: [],
      approvalTimeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS,
      approvalPollIntervalMs: DEFAULT_APPROVAL_POLL_INTERVAL_MS,
      watchSchedulerPollMs: DEFAULT_WATCH_SCHEDULER_POLL_MS,
    });
  });

  it('keeps an old doc that contains only freeModelsOnly behaving as before', () => {
    const settings = parseLlmSettings({ freeModelsOnly: true });
    expect(settings.freeModelsOnly).toBe(true);
    expect(settings.providerTimeoutMs).toBe(DEFAULT_PROVIDER_TIMEOUT_MS);
    expect(settings.completionDeadlineMs).toBeUndefined();
  });

  it('rejects invalid values field by field and falls back to defaults', () => {
    const settings = parseLlmSettings({
      freeModelsOnly: 'yes',
      providerTimeoutMs: -5,
      providerAttemptTimeoutMs: 0,
      completionDeadlineMs: Number.POSITIVE_INFINITY,
      circuitThreshold: 2.5,
      circuitCooldownMs: 'fast',
      preferredModelIds: 'openai:gpt-4o',
      forbiddenModelIds: [42, null, 'openai:gpt-3.5-turbo'],
      approvalTimeoutMs: 0,
      approvalPollIntervalMs: -1,
      watchSchedulerPollMs: Number.NaN,
    });
    expect(settings.freeModelsOnly).toBe(false);
    expect(settings.providerTimeoutMs).toBe(DEFAULT_PROVIDER_TIMEOUT_MS);
    expect(settings.providerAttemptTimeoutMs).toBe(DEFAULT_PROVIDER_ATTEMPT_TIMEOUT_MS);
    expect(settings.completionDeadlineMs).toBeUndefined();
    expect(settings.circuitThreshold).toBe(DEFAULT_CIRCUIT_THRESHOLD);
    expect(settings.circuitCooldownMs).toBe(DEFAULT_CIRCUIT_COOLDOWN_MS);
    expect(settings.preferredModelIds).toEqual([]);
    // String entries survive the filter; non-strings are dropped.
    expect(settings.forbiddenModelIds).toEqual(['openai:gpt-3.5-turbo']);
    expect(settings.approvalTimeoutMs).toBe(DEFAULT_APPROVAL_TIMEOUT_MS);
    expect(settings.approvalPollIntervalMs).toBe(DEFAULT_APPROVAL_POLL_INTERVAL_MS);
    expect(settings.watchSchedulerPollMs).toBe(DEFAULT_WATCH_SCHEDULER_POLL_MS);
  });

  it('accepts valid values and filters the model id lists', () => {
    const settings = parseLlmSettings({
      freeModelsOnly: true,
      providerTimeoutMs: 120000,
      providerAttemptTimeoutMs: 130000,
      completionDeadlineMs: 600000,
      circuitThreshold: 3,
      circuitCooldownMs: 45000,
      preferredModelIds: ['openai:gpt-4o', '', 'mistral:large'],
      forbiddenModelIds: ['provider-a:model-a'],
      approvalTimeoutMs: 7200000,
      approvalPollIntervalMs: 1500,
      watchSchedulerPollMs: 30000,
    });
    expect(settings.freeModelsOnly).toBe(true);
    expect(settings.providerTimeoutMs).toBe(120000);
    expect(settings.providerAttemptTimeoutMs).toBe(130000);
    expect(settings.completionDeadlineMs).toBe(600000);
    expect(settings.circuitThreshold).toBe(3);
    expect(settings.circuitCooldownMs).toBe(45000);
    expect(settings.preferredModelIds).toEqual(['openai:gpt-4o', 'mistral:large']);
    expect(settings.forbiddenModelIds).toEqual(['provider-a:model-a']);
    expect(settings.approvalTimeoutMs).toBe(7200000);
    expect(settings.approvalPollIntervalMs).toBe(1500);
    expect(settings.watchSchedulerPollMs).toBe(30000);
  });

  it('falls back to the env var layer beneath the settings doc', () => {
    process.env.BRAIN_PROVIDER_TIMEOUT_MS = '250000';
    process.env.APPROVAL_TIMEOUT_MS = '3600000';
    const settings = parseLlmSettings({ freeModelsOnly: false });
    expect(settings.providerTimeoutMs).toBe(250000);
    expect(settings.approvalTimeoutMs).toBe(3600000);
  });

  it('prefers the settings doc over the env var layer', () => {
    process.env.BRAIN_PROVIDER_TIMEOUT_MS = '250000';
    const settings = parseLlmSettings({ providerTimeoutMs: 111000 });
    expect(settings.providerTimeoutMs).toBe(111000);
  });

  it('falls back to BRAIN_COMPLETION_DEADLINE_MS env when the doc omits the deadline', () => {
    process.env.BRAIN_COMPLETION_DEADLINE_MS = '1234567';
    const settings = parseLlmSettings({});
    expect(settings.completionDeadlineMs).toBe(1234567);
  });
});

describe('resolveBrainCompletionDeadlineMs', () => {
  it('prefers a valid settings value in every variant', () => {
    for (const variant of ['brain', 'agentRuntime', 'temporal'] as const) {
      expect(resolveBrainCompletionDeadlineMs({ settingsValue: 420000, attemptTimeoutMs: 100000, variant })).toBe(420000);
    }
  });

  it('derives the brain fallback from the attempt timeout (3x, capped, floored)', () => {
    // 3x attempt (300000) below the 900000 cap, above the attempt itself.
    expect(resolveBrainCompletionDeadlineMs({ attemptTimeoutMs: 100000, variant: 'brain' })).toBe(300000);
    // 3x attempt above the cap: capped at 900000.
    expect(resolveBrainCompletionDeadlineMs({ attemptTimeoutMs: 400000, variant: 'brain' })).toBe(900000);
    // 3x attempt below the attempt timeout floor cannot happen, but the
    // floor is expressed: huge attempt wins over the cap.
    expect(resolveBrainCompletionDeadlineMs({ attemptTimeoutMs: 5000000, variant: 'brain' })).toBe(5000000);
  });

  it('uses the same attempt-derived shape for agentRuntime', () => {
    expect(resolveBrainCompletionDeadlineMs({ attemptTimeoutMs: 100000, variant: 'agentRuntime' })).toBe(300000);
  });

  it('defaults the attempt timeout to 310000 for attempt-derived variants', () => {
    // 3x 310000 = 930000, which the 900000 cap brings back down.
    expect(resolveBrainCompletionDeadlineMs({ variant: 'brain' })).toBe(DEFAULT_COMPLETION_DEADLINE_MS);
    expect(resolveBrainCompletionDeadlineMs({ attemptTimeoutMs: Number.NaN, variant: 'agentRuntime' })).toBe(DEFAULT_COMPLETION_DEADLINE_MS);
  });

  it('adds a 60-second headroom over an already-resolved brain deadline for temporal', () => {
    expect(resolveBrainCompletionDeadlineMs({ attemptTimeoutMs: 930000, variant: 'temporal' })).toBe(990000);
  });

  it('falls back to the flat 900000 default for temporal without a resolved deadline', () => {
    expect(resolveBrainCompletionDeadlineMs({ variant: 'temporal' })).toBe(DEFAULT_COMPLETION_DEADLINE_MS);
    expect(resolveBrainCompletionDeadlineMs({ attemptTimeoutMs: 0, variant: 'temporal' })).toBe(DEFAULT_COMPLETION_DEADLINE_MS);
  });
});

describe('fetchLlmSettingsDoc', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetLlmSettingsCacheForTests();
    resetServiceAuthForTests();
    delete process.env.SERVICE_AUTH_ID;
    delete process.env.SERVICE_API_KEY;
    process.env.AUTH_URL = 'http://auth.test';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
    resetLlmSettingsCacheForTests();
    resetServiceAuthForTests();
  });

  it('returns parsed settings from the llm-config document', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/artifacts/documents/llm-config')) {
        return jsonResponse(200, { id: 'llm-config', data: { freeModelsOnly: true, approvalTimeoutMs: 3600000 } });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const settings = await fetchLlmSettingsDoc('http://artifacts:4200');

    expect(settings?.freeModelsOnly).toBe(true);
    expect(settings?.approvalTimeoutMs).toBe(3600000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('resolves to null on 404 and retries on the next call', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => jsonResponse(404, { error: 'Document not found' }));

    expect(await fetchLlmSettingsDoc('http://artifacts:4200')).toBeNull();
    expect(await fetchLlmSettingsDoc('http://artifacts:4200')).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('resolves to null when the request throws and does not cache the failure', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED'));
    expect(await fetchLlmSettingsDoc('http://artifacts:4200')).toBeNull();
    fetchSpy.mockImplementation(async () => jsonResponse(200, { data: { freeModelsOnly: true } }));
    expect((await fetchLlmSettingsDoc('http://artifacts:4200'))?.freeModelsOnly).toBe(true);
  });

  it('caches for 30 seconds and refetches after the TTL', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () =>
      jsonResponse(200, { data: { freeModelsOnly: true } }),
    );

    await fetchLlmSettingsDoc('http://artifacts:4200');
    await fetchLlmSettingsDoc('http://artifacts:4200');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const realNow = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(realNow + 31_000);
    try {
      await fetchLlmSettingsDoc('http://artifacts:4200');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
