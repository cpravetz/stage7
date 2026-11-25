import { BrainService } from '../src/services/BrainService';
import { SemanticCache } from '../src/services/SemanticCache';
import { LLMProvider, CompletionRequest, CompletionResponse, ProviderInfo } from '../src/providers/Provider';

const mockProviderInfo: ProviderInfo = {
  id: 'mock',
  name: 'Mock Provider',
  apiBase: 'http://mock',
  hasApiKey: true,
  openAICompatible: true,
};

class MockProvider implements LLMProvider {
  readonly id = 'mock';
  readonly name = 'Mock Provider';
  readonly info: ProviderInfo = mockProviderInfo;
  calls = 0;
  hangMs: number | null = null;
  async listModels() {
    return [
      { id: 'mock-model', capabilities: ['chat', 'code', 'reasoning', 'creative'], maxTokens: 128000, costPer1kTokens: 0.1, inputFormat: 'image', outputFormat: 'text' },
    ];
  }
  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    this.calls += 1;
    const hangMs = this.hangMs;
    if (hangMs !== null) await new Promise((resolve) => setTimeout(resolve, hangMs));
    return { content: 'mocked response', model: req.model, provider: 'mock', tokensUsed: 10 };
  }
  isAvailable(): boolean { return true; }
}

const provider = new MockProvider();
const providerInstances: LLMProvider[] = [provider];

jest.mock('../src/providers/registry', () => ({
  buildProviderRegistry: () => providerInstances,
}));

/** Mocks the artifacts endpoints BrainService touches and counts llm-config reads. */
function stubArtifacts(settings: Record<string, unknown>) {
  let llmConfigReads = 0;
  const spy = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/api/artifacts/documents/llm-config')) {
      llmConfigReads += 1;
      return { ok: true, json: async () => ({ data: settings }) } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  });
  return { spy, reads: () => llmConfigReads };
}

describe('BrainService settings consumption', () => {
  let brain: BrainService;

  beforeEach(() => {
    provider.hangMs = null;
    provider.calls = 0;
    providerInstances.splice(0, providerInstances.length, provider);
    SemanticCache.getInstance().disconnect();
    brain = new BrainService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('applies the settings attempt timeout to the actual provider call', async () => {
    stubArtifacts({ providerAttemptTimeoutMs: 60 });
    provider.hangMs = 5000; // far beyond the 60ms settings ceiling

    const started = Date.now();
    await expect(brain.complete('attempt timeout settings test')).rejects.toThrow();
    const elapsed = Date.now() - started;

    // Without the settings value reaching the provider wrapper, the attempt
    // ceiling stays at the 310s env default and this call would hang until
    // the jest timeout. The 60ms ceiling makes it fail fast instead.
    expect(elapsed).toBeLessThan(3000);
  });

  it('reconfigures boot-time circuit breakers when a settings refresh observes changed values', async () => {
    stubArtifacts({ circuitThreshold: 3, circuitCooldownMs: 5000 });

    await brain.complete('breaker reconfiguration test');

    const breaker = (brain as unknown as { circuitBreakers: Map<string, { threshold: number; cooldownMs: number }> }).circuitBreakers.get('mock');
    expect(breaker).toBeDefined();
    expect(breaker!.threshold).toBe(3);
    expect(breaker!.cooldownMs).toBe(5000);
  });

  it('reads the settings document once per TTL window, not once per completion', async () => {
    const stub = stubArtifacts({ freeModelsOnly: false });

    await brain.complete('settings cache test one');
    await brain.complete('settings cache test two');

    expect(stub.reads()).toBe(1);
  });

  it('reports preferred and forbidden lists in the exhaustion error metadata', async () => {
    stubArtifacts({
      freeModelsOnly: true,
      preferredModelIds: ['mock:mock-model'],
      forbiddenModelIds: ['mock:blocked-model'],
    });

    let caught: unknown;
    try {
      await brain.complete('exhaustion metadata test', { routingSessionId: 'session-1' });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    const details = (caught as { details?: Record<string, unknown> }).details ?? {};
    expect(details.eligibleModelCount).toBe(0);
    expect(details.preferredModelIds).toEqual(['mock:mock-model']);
    expect(details.forbiddenModelIds).toEqual(['mock:blocked-model']);
  });
});
