import {
  BRAIN_SETTINGS_DOC_TYPE,
  DEFAULT_BRAIN_COMPLETION_DEADLINE_MS,
  DEFAULT_BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS,
  MAX_BRAIN_CIRCUIT_COOLDOWN_MS,
  MAX_BRAIN_CIRCUIT_THRESHOLD,
  MAX_BRAIN_COMPLETION_DEADLINE_MS,
  MAX_BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS,
  MAX_BRAIN_PROVIDER_TIMEOUT_MS,
  brainSettings,
  createBrainSettingsSource,
  parseBrainSettingsDoc,
  resolveBrainSettings,
} from '../src/config/brainSettings';

const DOC = {
  type: BRAIN_SETTINGS_DOC_TYPE,
  providerTimeoutMs: 45_000,
  providerAttemptTimeoutMs: 600_000,
  completionDeadlineMs: 1_500_000,
  circuitThreshold: 4,
  circuitCooldownMs: 90_000,
  // Unknown document fields must be ignored, not rejected.
  freeModelsOnly: true,
};

const DOC_OVERRIDES = {
  providerTimeoutMs: 45_000,
  providerAttemptTimeoutMs: 600_000,
  completionDeadlineMs: 1_500_000,
  circuitThreshold: 4,
  circuitCooldownMs: 90_000,
};

interface FakeResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
}

function jsonResponse(status: number, body: unknown): FakeResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 500 ? 'Internal Server Error' : '',
    json: async () => body,
  };
}

describe('parseBrainSettingsDoc', () => {
  it('accepts the full Tier-1 knob set and ignores unknown document fields', () => {
    const parsed = parseBrainSettingsDoc(DOC);
    expect(parsed.status).toBe('ok');
    expect(parsed.overrides).toEqual(DOC_OVERRIDES);
  });

  it('drops invalid fields individually and keeps the valid ones', () => {
    const logger = { warn: jest.fn() };
    const parsed = parseBrainSettingsDoc(
      {
        providerTimeoutMs: 45_000.5, // non-integer
        providerAttemptTimeoutMs: '600000', // wrong type
        completionDeadlineMs: MAX_BRAIN_COMPLETION_DEADLINE_MS + 1, // out of bounds
        circuitThreshold: 0, // not positive
        circuitCooldownMs: 90_000,
        freeModelsOnly: true, // unknown field, no warning
      },
      logger,
    );
    expect(parsed.overrides).toEqual({ circuitCooldownMs: 90_000 });
    expect(logger.warn).toHaveBeenCalledTimes(4);
    expect(String(logger.warn.mock.calls[0][0])).toContain('providerTimeoutMs');
    expect(String(logger.warn.mock.calls[1][0])).toContain('providerAttemptTimeoutMs');
    expect(String(logger.warn.mock.calls[2][0])).toContain('completionDeadlineMs');
    expect(String(logger.warn.mock.calls[3][0])).toContain('circuitThreshold');
  });

  it('reports a non-object body as unreachable without throwing', () => {
    const logger = { warn: jest.fn() };
    const parsed = parseBrainSettingsDoc('{not valid', logger);
    expect(parsed.status).toBe('unreachable');
    expect(parsed.reason).toBe('invalid JSON');
    expect(parsed.overrides).toEqual({});
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});

describe('resolveBrainSettings', () => {
  it('falls back to built-in defaults when no document or environment value is set', () => {
    expect(resolveBrainSettings(undefined, {})).toEqual({
      providerTimeoutMs: 300_000,
      providerAttemptTimeoutMs: DEFAULT_BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS,
      completionDeadlineMs: DEFAULT_BRAIN_COMPLETION_DEADLINE_MS,
      circuitThreshold: 8,
      circuitCooldownMs: 60_000,
      spendLimits: undefined,
    });
  });

  it('derives the completion deadline from the attempt ceiling when both are unset', () => {
    const resolved = resolveBrainSettings({ providerAttemptTimeoutMs: 700_000 }, {});
    expect(resolved.completionDeadlineMs).toBe(Math.max(700_000, Math.min(700_000 * 3, DEFAULT_BRAIN_COMPLETION_DEADLINE_MS)));
  });

  it('reads the environment as the fallback and lets document values win', () => {
    const env = {
      BRAIN_PROVIDER_TIMEOUT_MS: '45000',
      BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS: '600000',
      BRAIN_COMPLETION_DEADLINE_MS: '1500000',
      BRAIN_CIRCUIT_THRESHOLD: '4',
      BRAIN_CIRCUIT_COOLDOWN_MS: '90000',
    };
    const fromEnv = resolveBrainSettings(undefined, env);
    expect(fromEnv).toEqual(DOC_OVERRIDES);

    const fromDoc = resolveBrainSettings(
      { providerTimeoutMs: 30_000, circuitThreshold: 2 },
      env,
    );
    expect(fromDoc.providerTimeoutMs).toBe(30_000);
    expect(fromDoc.circuitThreshold).toBe(2);
    expect(fromDoc.providerAttemptTimeoutMs).toBe(600_000);
  });

  it('ignores invalid environment values and uses the default instead', () => {
    const env = {
      BRAIN_PROVIDER_TIMEOUT_MS: 'abc',
      BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS: '0',
      BRAIN_COMPLETION_DEADLINE_MS: '-5',
      BRAIN_CIRCUIT_THRESHOLD: '6000',
      BRAIN_CIRCUIT_COOLDOWN_MS: '30000.5',
    };
    expect(resolveBrainSettings(undefined, env)).toEqual(resolveBrainSettings(undefined, {}));
  });
});

describe('createBrainSettingsSource', () => {
  it('caches a successful fetch for the TTL and refetches after it expires', async () => {
    let clock = 1_700_000_000_000;
    const now = () => clock;
    const fetcher = jest.fn().mockResolvedValue(jsonResponse(200, DOC));
    const source = createBrainSettingsSource({ artifactsUrl: 'http://artifacts', fetcher, ttlMs: 1_000, now });

    const first = await source.refresh();
    expect(first.status).toBe('ok');
    expect(first.fromCache).toBe(false);
    expect(source.current().overrides).toEqual(DOC_OVERRIDES);

    clock += 500;
    await source.refresh();
    expect(fetcher).toHaveBeenCalledTimes(1);

    clock += 500;
    await source.refresh();
    clock += 500;
    const refetched = await source.refresh();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(refetched.fromCache).toBe(false);
  });

  it('coalesces concurrent refreshes into one fetch', async () => {
    let resolveFetch: (value: FakeResponse) => void = () => {};
    const fetcher = jest.fn().mockImplementation(
      () => new Promise<FakeResponse>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const source = createBrainSettingsSource({ artifactsUrl: 'http://artifacts', fetcher, ttlMs: 60_000 });

    const a = source.refresh();
    const b = source.refresh();
    resolveFetch(jsonResponse(200, DOC));
    const [ra, rb] = await Promise.all([a, b]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(ra.status).toBe('ok');
    expect(rb.status).toBe('ok');
  });

  it('isolates sources by document id', async () => {
    const fetcher = jest.fn().mockResolvedValue(jsonResponse(200, DOC));
    const sourceA = createBrainSettingsSource({ artifactsUrl: 'http://artifacts', fetcher, ttlMs: 60_000, docId: 'brain/settings/llm-config' });
    const sourceB = createBrainSettingsSource({ artifactsUrl: 'http://artifacts', fetcher, ttlMs: 60_000, docId: 'brain/settings/other' });

    await sourceA.refresh();
    await sourceB.refresh();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('reports a missing document without a warning and without throwing', async () => {
    const logger = { warn: jest.fn() };
    const fetcher = jest.fn().mockResolvedValue(jsonResponse(404, { ok: false }));
    const source = createBrainSettingsSource({ artifactsUrl: 'http://artifacts', fetcher, logger });

    const missing = await source.refresh();
    expect(missing.status).toBe('missing');
    expect(missing.overrides).toEqual({});
    expect(logger.warn).not.toHaveBeenCalled();
    expect(resolveBrainSettings(missing.overrides, {}).providerAttemptTimeoutMs).toBe(DEFAULT_BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS);
  });

  it('reports an unreachable artifacts service without throwing and retries on the next refresh', async () => {
    const fetcher = jest.fn()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
      .mockResolvedValue(jsonResponse(200, DOC));
    const source = createBrainSettingsSource({ artifactsUrl: 'http://artifacts', fetcher });

    const failed = await source.refresh();
    expect(failed.status).toBe('unreachable');
    expect(failed.reason).toBe('connect ECONNREFUSED');
    expect(failed.overrides).toEqual({});

    // Failed fetches are not cached: the next refresh retries and recovers.
    const recovered = await source.refresh();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(recovered.status).toBe('ok');
    expect(recovered.overrides).toEqual(DOC_OVERRIDES);
  });

  it('keeps previously fetched overrides when a later fetch reports a bad status', async () => {
    let response: FakeResponse = jsonResponse(200, DOC);
    const fetcher = jest.fn().mockImplementation(async () => response);
    const logger = { warn: jest.fn() };
    const source = createBrainSettingsSource({ artifactsUrl: 'http://artifacts', fetcher, ttlMs: 0, logger });

    await source.refresh();
    expect(source.current().overrides).toEqual(DOC_OVERRIDES);

    response = jsonResponse(500, { ok: false, error: 'Internal Server Error' });
    const bad = await source.refresh();
    expect(bad.status).toBe('unreachable');
    expect(bad.overrides).toEqual(DOC_OVERRIDES);
    expect(bad.fromCache).toBe(true);
    // Exactly one warning: the service-level 5xx notice, not a parse warning
    // (the body was valid JSON; the document itself was not the problem).
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(String(logger.warn.mock.calls[0][0])).toContain('500');
    expect(resolveBrainSettings(source.current().overrides, {}).providerTimeoutMs).toBe(45_000);
  });
});

describe('process-wide source', () => {
  it('exposes a shared source with the default document id', () => {
    expect(brainSettings.current().overrides).toEqual({});
  });

  it('startPolling fetches immediately, then on each interval, and is idempotent', async () => {
    jest.useFakeTimers();
    try {
      const fetcher = jest.fn().mockResolvedValue(jsonResponse(200, DOC));
      const source = createBrainSettingsSource({ artifactsUrl: 'http://artifacts', fetcher, ttlMs: 1_000 });

      source.startPolling();
      source.startPolling(); // second call must not add another timer
      expect(fetcher).toHaveBeenCalledTimes(1); // immediate fetch

      await jest.advanceTimersByTimeAsync(3_000);
      // The poll interval equals the TTL, so each tick refetches: t=1000,
      // t=2000, t=3000.
      expect(fetcher).toHaveBeenCalledTimes(4);
    } finally {
      jest.useRealTimers();
    }
  });
});
