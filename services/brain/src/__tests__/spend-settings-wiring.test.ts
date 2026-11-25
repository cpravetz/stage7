import { getSpendGate, SpendLimitReachedError } from '../services/SpendGate';
import { brainInstance } from '../utils/sharedInstance';
import { spendLimitsSettings } from '@stage7-nextgen/shared';
import { dropTestDb, useSpendTestDb } from './spend-test-support';
import type { LLMProvider, CompletionRequest, CompletionResponse } from '../providers/Provider';

/**
 * Finding A of the OD-5 rework — the operator's `spendLimits.system` default
 * is wired onto the settings-doc mechanism that survives on the release
 * branch (`settingsDocSource`, the missionSettings pattern). The shared
 * singleton source is real here; only its artifacts HTTP fetch is mocked, so
 * the production wiring in getSpendGate()/BrainService is what is under test.
 */

jest.mock('../../../../shared-nextgen/src/utils/httpClient', () => ({
  httpRequest: jest.fn(),
  interServiceTimeoutMs: jest.fn(() => 1_000),
  llmCallTimeoutMs: jest.fn(() => 60_000),
}));

import { httpRequest } from '../../../../shared-nextgen/src/utils/httpClient';
const httpRequestMock = httpRequest as jest.Mock;

const OPERATOR_DOC = {
  spendLimits: { system: { limit: 0.5, period: 'month' } },
};

const MODEL = { id: 'm1', provider: 'fake', costPer1kTokens: 2, maxTokens: 8_192, capabilities: [] as string[] };

function fakeProvider(): LLMProvider {
  return {
    id: 'fake',
    name: 'Fake',
    info: { hasApiKey: true, openAICompatible: false },
    isAvailable: () => true,
    listModels: async () => [{ ...MODEL, name: MODEL.id }],
    complete: jest.fn(async (_req: CompletionRequest): Promise<CompletionResponse> => ({
      // 1000 tokens at the model's $2/1k = $2.00 actual — above the $0.50
      // operator cap, so the first completion's reconcile crosses it.
      content: 'ok', model: 'm1', provider: 'fake', tokensUsed: 1_000,
    })),
    embed: async () => { throw new Error('embed not implemented'); },
  } as unknown as LLMProvider;
}

function stubRouter(provider: LLMProvider): void {
  const router = {
    getCandidates: jest.fn().mockReturnValue([{ model: MODEL }]),
    setPerformanceMetrics: jest.fn(),
    listModels: jest.fn().mockReturnValue([MODEL]),
    updateProviderHealth: jest.fn(),
    registerModels: jest.fn(),
    registerModel: jest.fn(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (brainInstance as any).router = router;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (brainInstance as any).providers = [provider];
}

const uniquePrompt = (label: string): string => `${label} ${Date.now()}_${Math.random()}`;

describe('Operator spendLimits.system default wiring (OD-5 finding A)', () => {
  const dbName = useSpendTestDb();

  beforeAll(() => {
    httpRequestMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/artifacts/documents/')) {
        return { ok: true, status: 200, statusText: 'OK', json: async () => OPERATOR_DOC };
      }
      throw new Error(`unexpected fetch in test: ${url}`);
    });
  });

  afterAll(async () => {
    await dropTestDb(dbName);
  });

  it('caps the system bucket from the settings document through the production gate', async () => {
    const gate = getSpendGate();
    // Production refreshes the source on the completion path
    // (BrainService.enforceSpendLimit); mirror that before reading.
    await spendLimitsSettings.refresh();
    await expect(gate.limitFor('system')).resolves.toEqual({ limit: 0.5, period: 'month' });
  });

  it('leaves a named user uncapped under the same operator default', async () => {
    const gate = getSpendGate();
    await expect(gate.limitFor('usr_nobody')).resolves.toBeUndefined();
  });

  it('refuses system-attributed completions at the operator cap (end to end)', async () => {
    const provider = fakeProvider();
    stubRouter(provider);
    const brain = brainInstance;

    // First identity-less completion: the system bucket starts at 0, so the
    // reservation passes and the provider call happens.
    await expect(brain.complete(uniquePrompt('system-once'), {})).resolves.toMatchObject({ cached: false });
    expect(provider.complete).toHaveBeenCalledTimes(1);

    // Second one is refused at the operator's cap, with the exact contract.
    let refusal: SpendLimitReachedError | undefined;
    try {
      await brain.complete(uniquePrompt('system-twice'), {});
    } catch (err) {
      refusal = err as SpendLimitReachedError;
    }
    expect(refusal).toBeInstanceOf(SpendLimitReachedError);
    expect(refusal?.payload).toMatchObject({
      error: 'SPEND_LIMIT_REACHED',
      userId: 'system',
      period: 'month',
      limit: 0.5,
    });
    // The provider was never reached again.
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });
});
