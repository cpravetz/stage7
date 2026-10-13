import { BrainService } from '../services/BrainService';
import { SemanticCache } from '../services/SemanticCache';
import { LLMProvider, CompletionRequest, CompletionResponse, ProviderInfo } from '../providers/Provider';
import { BRAIN_MODEL_SELECTION_EXHAUSTED } from '@stage7-nextgen/shared';

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
  lastRequest: CompletionRequest | null = null;
  failure: Error | null = null;
  calls = 0;
  response: CompletionResponse = {
    content: 'mocked response',
    model: 'mock-model',
    provider: 'mock',
    tokensUsed: 10,
  };
  isAvailable(): boolean { return true; }
  async listModels() {
    return [
      { id: 'mock-model', capabilities: ['chat', 'code', 'reasoning', 'creative'], maxTokens: 128000, costPer1kTokens: 0.1 },
      { id: 'mock-expensive', capabilities: ['chat'], maxTokens: 8192, costPer1kTokens: 5 },
    ];
  }
  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    this.calls += 1;
    this.lastRequest = req;
    if (this.failure) throw this.failure;
    return this.response;
  }
}

const mockProviderInstance = new MockProvider();
const mockProviderInstances: LLMProvider[] = [mockProviderInstance];

jest.mock('../providers/registry', () => ({
  buildProviderRegistry: () => mockProviderInstances,
}));

describe('BrainService', () => {
  let brain: BrainService;
  let cache: SemanticCache;

  beforeEach(async () => {
    mockProviderInstances.splice(0, mockProviderInstances.length, mockProviderInstance);
    mockProviderInstance.lastRequest = null;
    mockProviderInstance.failure = null;
    mockProviderInstance.calls = 0;
    mockProviderInstance.response = {
      content: 'mocked response',
      model: 'mock-model',
      provider: 'mock',
      tokensUsed: 10,
    };
    cache = SemanticCache.getInstance();
    brain = new BrainService();
  });

  afterAll(() => {
    cache.disconnect();
  });

  it('should complete a prompt and return a result', async () => {
    const result = await brain.complete('Hello, world!');
    expect(result.content).toBe('mocked response');
    expect(result.model).toBe('mock-model');
    expect(result.provider).toBe('mock');
    expect(result.cached).toBe(false);
    expect(result.tokensUsed).toBe(10);
  });

  it('logs only completed provider calls with their resolved model and provider', async () => {
    await brain.complete('logging must use resolved provider metadata');

    const completionLogs = brain.getLogs().filter((entry) => entry.type === 'completion');
    expect(completionLogs).toHaveLength(1);
    expect(completionLogs[0]).toMatchObject({
      model: 'mock-model',
      provider: 'mock',
      success: true,
      durationMs: expect.any(Number),
    });
    expect(completionLogs.some((entry) => entry.model === 'auto')).toBe(false);
  });

  it('does not retry a provider after credit exhaustion and records the cause once', async () => {
    mockProviderInstance.failure = new Error(
      '402 {"error":"You have no remaining credits for this provider"}',
    );

    await expect(brain.complete('credit exhaustion should stop provider retries')).rejects.toThrow(
      'no remaining credits',
    );

    expect(mockProviderInstance.calls).toBe(1);
    const errors = brain.getLogs().filter((entry) => entry.type === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].error).toContain('no remaining credits');
  });

  it('tries another provider after the selected provider runs out of credits', async () => {
    mockProviderInstance.failure = new Error(
      '402 {"error":"Your organization has no remaining credits"}',
    );
    const fallbackProvider = {
      id: 'backup',
      name: 'Backup Provider',
      info: {
        id: 'backup',
        name: 'Backup Provider',
        apiBase: 'http://backup',
        hasApiKey: true,
        openAICompatible: true,
      },
      isAvailable: () => true,
      listModels: async () => [{
        id: 'mock-model',
        capabilities: ['chat', 'reasoning'],
        maxTokens: 128000,
        costPer1kTokens: 0.2,
      }],
      complete: jest.fn(async () => ({
        content: 'completed through backup',
        model: 'mock-model',
        provider: 'backup',
        tokensUsed: 12,
      })),
    } satisfies LLMProvider;
    mockProviderInstances.push(fallbackProvider);
    brain = new BrainService();

    const result = await brain.complete(
      'Try another provider after the preferred model runs out of credits',
    );

    expect(result).toMatchObject({
      content: 'completed through backup',
      model: 'mock-model',
      provider: 'backup',
    });
    expect(mockProviderInstance.calls).toBe(1);
    expect(fallbackProvider.complete).toHaveBeenCalledTimes(1);
  });

  it('should pass systemPrompt to the provider when provided', async () => {
    await brain.complete('hi', { systemPrompt: 'you are a cat' });
    expect(mockProviderInstance.lastRequest).not.toBeNull();
    expect(mockProviderInstance.lastRequest!.messages[0].role).toBe('system');
    expect(mockProviderInstance.lastRequest!.messages[0].content).toBe('you are a cat');
    expect(mockProviderInstance.lastRequest!.messages[1].role).toBe('user');
    expect(mockProviderInstance.lastRequest!.messages[1].content).toBe('hi');
  });

  it('should cache the result on a second identical call', async () => {
    const r1 = await brain.complete('cache test prompt');
    expect(r1.cached).toBe(false);
    const r2 = await brain.complete('cache test prompt');
    expect(r2.cached).toBe(true);
    expect(r2.content).toBe('mocked response');
  });

  it('should pick the cheapest model that matches required capabilities', async () => {
    const result = await brain.complete('Help me write some code');
    expect(result.model).toBe('mock-model');
  });

  it('tries a different eligible model on each routing-session call and then reports exhaustion', async () => {
    const options = { missionId: 'mission-routing', routingSessionId: 'mission-routing:planner' };

    await brain.complete('Help me with a chat response', options);
    expect(mockProviderInstance.lastRequest?.model).toBe('mock-model');

    await brain.complete('Help me with a chat response', options);
    expect(mockProviderInstance.lastRequest?.model).toBe('mock-expensive');
    expect(mockProviderInstance.calls).toBe(2);

    await expect(brain.complete('Help me with a chat response', options))
      .rejects.toMatchObject({
        details: {
          code: BRAIN_MODEL_SELECTION_EXHAUSTED,
          eligibleModelCount: 2,
          attemptedModelCount: 2,
        },
      });
    expect(mockProviderInstance.calls).toBe(2);
  });

  it('does not select paid models when free-model-only is enabled and no free candidates exist', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => ({
      ok: true,
      json: async () => ({ data: { freeModelsOnly: true } }),
    }) as Response);
    const freeOnlyBrain = new BrainService();

    try {
      await expect(freeOnlyBrain.complete('Help me with a chat response', {
        missionId: 'mission-free-routing',
        routingSessionId: 'mission-free-routing:planner',
      })).rejects.toMatchObject({
        details: {
          code: BRAIN_MODEL_SELECTION_EXHAUSTED,
          eligibleModelCount: 0,
          freeModelsOnly: true,
        },
      });
      expect(mockProviderInstance.calls).toBe(0);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('should list providers', () => {
    const providers = brain.listProviders();
    expect(providers.length).toBe(1);
    expect(providers[0].id).toBe('mock');
  });

  it('should expose available models', () => {
    const models = brain.listAvailableModels();
    expect(Array.isArray(models)).toBe(true);
  });

  it('should validate structured output', () => {
    const schema = require('zod').z.object({ name: require('zod').z.string() });
    const out = brain.validateStructuredOutput(schema, { name: 'alice' });
    expect(out).toEqual({ name: 'alice' });
  });
});
