import {
  DEFAULT_MISSION_APPROVAL_POLL_INTERVAL_MS,
  DEFAULT_MISSION_APPROVAL_TIMEOUT_MS,
  MAX_MISSION_APPROVAL_POLL_INTERVAL_MS,
  MAX_MISSION_APPROVAL_TIMEOUT_MS,
  createMissionSettingsSource,
  parseMissionSettingsDoc,
  resolveMissionSettings,
} from '../src/config/missionSettings';

const DOC = {
  type: 'approval-config',
  approvalTimeoutMs: 4 * 24 * 60 * 60 * 1000,
  approvalPollIntervalMs: 10_000,
  // Unknown document fields must be ignored, not rejected.
  freeModelsOnly: true,
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

describe('parseMissionSettingsDoc', () => {
  it('accepts the full knob set and ignores unknown document fields', () => {
    const parsed = parseMissionSettingsDoc(DOC);
    expect(parsed.status).toBe('ok');
    expect(parsed.overrides).toEqual({
      approvalTimeoutMs: 4 * 24 * 60 * 60 * 1000,
      approvalPollIntervalMs: 10_000,
    });
  });

  it('drops invalid fields individually and keeps the valid ones', () => {
    const logger = { warn: jest.fn() };
    const parsed = parseMissionSettingsDoc(
      {
        approvalTimeoutMs: '86400000', // wrong type
        approvalPollIntervalMs: MAX_MISSION_APPROVAL_POLL_INTERVAL_MS + 1, // out of bounds
        approvalWindowMs: 1000, // unknown field, no warning
      },
      logger,
    );
    expect(parsed.overrides).toEqual({});
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(String(logger.warn.mock.calls[0][0])).toContain('approvalTimeoutMs');
    expect(String(logger.warn.mock.calls[1][0])).toContain('approvalPollIntervalMs');
  });

  it('rejects values above the upper bounds', () => {
    const parsed = parseMissionSettingsDoc({
      approvalTimeoutMs: MAX_MISSION_APPROVAL_TIMEOUT_MS + 1,
      approvalPollIntervalMs: 0,
    });
    expect(parsed.overrides).toEqual({});
  });

  it('reports a non-object body as unreachable without throwing', () => {
    const logger = { warn: jest.fn() };
    const parsed = parseMissionSettingsDoc('not an object', logger);
    expect(parsed.status).toBe('unreachable');
    expect(parsed.reason).toBe('invalid JSON');
    expect(parsed.overrides).toEqual({});
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});

describe('resolveMissionSettings', () => {
  it('falls back to built-in defaults when no document or environment value is set', () => {
    expect(resolveMissionSettings(undefined, {})).toEqual({
      approvalTimeoutMs: DEFAULT_MISSION_APPROVAL_TIMEOUT_MS,
      approvalPollIntervalMs: DEFAULT_MISSION_APPROVAL_POLL_INTERVAL_MS,
    });
  });

  it('reads the environment as the fallback and lets document values win', () => {
    const env = {
      APPROVAL_TIMEOUT_MS: '172800000',
      APPROVAL_POLL_INTERVAL_MS: '15000',
    };
    const fromEnv = resolveMissionSettings(undefined, env);
    expect(fromEnv).toEqual({ approvalTimeoutMs: 172_800_000, approvalPollIntervalMs: 15_000 });

    const fromDoc = resolveMissionSettings({ approvalTimeoutMs: 60_000 }, env);
    expect(fromDoc.approvalTimeoutMs).toBe(60_000);
    expect(fromDoc.approvalPollIntervalMs).toBe(15_000);
  });

  it('ignores invalid environment values and uses the default instead', () => {
    const env = {
      APPROVAL_TIMEOUT_MS: 'abc',
      APPROVAL_POLL_INTERVAL_MS: '0',
    };
    expect(resolveMissionSettings(undefined, env)).toEqual(resolveMissionSettings(undefined, {}));
  });
});

describe('createMissionSettingsSource', () => {
  it('fetches the mission settings document id by default', async () => {
    const fetcher = jest.fn().mockResolvedValue(jsonResponse(200, DOC));
    const source = createMissionSettingsSource({ artifactsUrl: 'http://artifacts', fetcher });

    const snapshot = await source.refresh();
    expect(fetcher).toHaveBeenCalledWith('http://artifacts/api/artifacts/documents/mission/settings/approval-config');
    expect(snapshot.status).toBe('ok');
    expect(snapshot.overrides).toEqual({
      approvalTimeoutMs: 4 * 24 * 60 * 60 * 1000,
      approvalPollIntervalMs: 10_000,
    });
  });

  it('keeps the last known overrides when the document becomes unreachable', async () => {
    let response: FakeResponse = jsonResponse(200, DOC);
    const fetcher = jest.fn().mockImplementation(async () => response);
    const source = createMissionSettingsSource({ artifactsUrl: 'http://artifacts', fetcher, ttlMs: 0 });

    await source.refresh();
    response = jsonResponse(503, {});
    const failed = await source.refresh();
    expect(failed.status).toBe('unreachable');
    expect(failed.overrides).toEqual({
      approvalTimeoutMs: 4 * 24 * 60 * 60 * 1000,
      approvalPollIntervalMs: 10_000,
    });
    expect(resolveMissionSettings(failed.overrides, {}).approvalTimeoutMs).toBe(4 * 24 * 60 * 60 * 1000);
  });

  it('never rejects when the artifacts service is down', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));
    const source = createMissionSettingsSource({ artifactsUrl: 'http://artifacts', fetcher });

    const snapshot = await source.refresh();
    expect(snapshot.status).toBe('unreachable');
    expect(snapshot.reason).toBe('connect ECONNREFUSED');
    expect(snapshot.overrides).toEqual({});
  });
});
