import { OpenAICompatibleProvider, OpenAICompatibleConfig } from '../src/providers/OpenAICompatibleProvider';
import type { CompletionRequest } from '../src/providers/Provider';

const mockFetchProvider = jest.fn();

jest.mock('../src/utils/providerFetch', () => ({
  fetchProvider: (...args: unknown[]) => mockFetchProvider(...args),
  providerTimeoutMs: 30000,
}));

function providerWith(payload: unknown, id = 'testprovider', extra: Partial<OpenAICompatibleConfig> = {}) {
  mockFetchProvider.mockResolvedValue({ ok: true, json: async () => payload });
  return new OpenAICompatibleProvider({
    id,
    name: id,
    apiBase: 'https://example.test/v1',
    apiKey: 'key',
    defaultModels: [],
    listModelsPath: '/models',
    ...extra,
  });
}

describe('OpenAICompatibleProvider.listModels metadata parsing', () => {
  beforeEach(() => mockFetchProvider.mockReset());

  describe('cost per 1k tokens', () => {
    // Gateways publish USD per TOKEN; costPer1kTokens is USD per 1000 tokens.
    // So 0.0000025 USD/token is 2.5 USD per 1k, and 0.00000174 is 0.00174 per 1k.

    it('reads OpenRouter-style pricing.prompt as USD per token', async () => {
      const models = await providerWith({
        data: [{ id: 'openai/gpt-4o', pricing: { prompt: '0.0000025' } }],
      }).listModels();
      expect(models[0].costPer1kTokens).toBeCloseTo(0.0025, 9);
    });

    it('matches the hand-declared registry price for a known model', async () => {
      // registry.ts declares gpt-4o at costPer1kTokens 2.5, and OpenRouter quotes
      // 0.0000025 per token. These must agree.
      const models = await providerWith({
        data: [{ id: 'gpt-4o', pricing: { prompt: '0.0000025' } }],
      }).listModels();
      expect(models[0].costPer1kTokens * 1000).toBeCloseTo(2.5, 6);
    });

    it('reads Requesty-style flat input_price as USD per token', async () => {
      const models = await providerWith({
        data: [{ id: 'requesty-model', input_price: 0.00000174 }],
      }).listModels();
      expect(models[0].costPer1kTokens).toBeCloseTo(0.00174, 9);
    });

    it('reads Requesty-style pricing array of tier objects', async () => {
      const models = await providerWith({
        data: [{ id: 'tiered', pricing: [{ prompt_tokens_threshold: 0, input_price: 0.000002 }] }],
      }).listModels();
      expect(models[0].costPer1kTokens).toBeCloseTo(0.002, 9);
    });

    it('prefers the flat input_price when both forms are present', async () => {
      const models = await providerWith({
        data: [{
          id: 'both',
          input_price: 0.000003,
          pricing: [{ prompt_tokens_threshold: 0, input_price: 0.000009 }],
        }],
      }).listModels();
      expect(models[0].costPer1kTokens).toBeCloseTo(0.003, 9);
    });

    it('preserves a genuine zero price instead of treating it as missing', async () => {
      const models = await providerWith({
        data: [{ id: 'free-model', input_price: 0, output_price: 0 }],
      }).listModels();
      expect(models[0].costPer1kTokens).toBe(0);
    });

    it('accepts numeric (non-string) prices', async () => {
      const models = await providerWith({
        data: [{ id: 'numeric', input_price: 0.0005 }],
      }).listModels();
      expect(models[0].costPer1kTokens).toBeCloseTo(0.5, 9);
    });

    it('falls back to 0 when a gateway publishes no pricing at all', async () => {
      const models = await providerWith({ data: [{ id: 'no-price' }] }).listModels();
      expect(models[0].costPer1kTokens).toBe(0);
    });
  });

  describe('context window', () => {
    it('reads OpenRouter-style context_length', async () => {
      const models = await providerWith({
        data: [{ id: 'a', context_length: 128000 }],
      }).listModels();
      expect(models[0].maxTokens).toBe(128000);
    });

    it('reads Requesty-style context_window', async () => {
      const models = await providerWith({
        data: [{ id: 'b', context_window: 1048576 }],
      }).listModels();
      expect(models[0].maxTokens).toBe(1048576);
    });

    it('ignores a non-positive context_window and falls back', async () => {
      const models = await providerWith({
        data: [{ id: 'c', context_window: 0 }],
      }).listModels();
      expect(models[0].maxTokens).toBe(8192);
    });

    it('prefers an explicit context_length over context_window', async () => {
      const models = await providerWith({
        data: [{ id: 'd', context_length: 64000, context_window: 1000000 }],
      }).listModels();
      expect(models[0].maxTokens).toBe(64000);
    });
  });

  describe('capability flags', () => {
    it('uses supports_reasoning and supports_vision flags', async () => {
      const models = await providerWith({
        data: [{
          id: 'vendor/flags-only',
          supports_reasoning: true,
          supports_vision: true,
          supports_image_generation: true,
        }],
      }).listModels();
      expect(models[0].capabilities).toEqual(
        expect.arrayContaining(['chat', 'reasoning', 'vision', 'creative']),
      );
    });

    it('does not invent a reasoning flag when the gateway says false', async () => {
      const models = await providerWith({
        data: [{ id: 'vendor/chat-only', supports_reasoning: false }],
      }).listModels();
      expect(models[0].capabilities).toEqual(['chat']);
    });

    it('keeps the id-based heuristic as a fallback', async () => {
      const models = await providerWith({
        data: [{ id: 'vendor/gpt-5-reasoner' }],
      }).listModels();
      expect(models[0].capabilities).toContain('reasoning');
    });
  });

  describe('embedding models', () => {
    it('still tags embeddings and reads their context window', async () => {
      const models = await providerWith({
        data: [{ id: 'vendor/text-embedding-3', context_window: 8191, input_price: 0.00000002 }],
      }).listModels();
      expect(models[0].capabilities).toEqual(['embedding']);
      expect(models[0].maxTokens).toBe(8191);
    });
  });

  describe('regression: paid gateway models must not look free', () => {
    it('gives every paid Requesty model a non-zero cost', async () => {
      const paid = [
        { id: 'vendor/a', input_price: 0.00000174, context_window: 200000 },
        { id: 'vendor/b', input_price: 0.000003, context_window: 1000000 },
      ];
      const models = await providerWith({ data: paid }).listModels();
      // A zero here would let paid models slip through the freeOnly and budget
      // filters in ModelRouter, which both treat costPer1kTokens === 0 as free.
      expect(models.every((m) => m.costPer1kTokens > 0)).toBe(true);
    });
  });
});

describe('OpenAICompatibleProvider excludeModelIds', () => {
  beforeEach(() => mockFetchProvider.mockReset());

  // The model must never reach the router, rather than being filtered at
  // routing time, so it can neither be auto-selected nor survive as an
  // explicit modelId request.
  it('drops excluded ids from the discovered catalogue', async () => {
    const models = await providerWith(
      { data: [{ id: 'apodex/apodex-1.1-mini:free' }, { id: 'openrouter/other:free' }] },
      'openrouter',
      { excludeModelIds: ['apodex/apodex-1.1-mini:free'] },
    ).listModels();
    expect(models.map((m) => m.id)).toEqual(['openrouter/other:free']);
  });

  it('drops excluded ids from the declared defaults too', async () => {
    mockFetchProvider.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });
    const models = await providerWith(null, 'openrouter', {
      excludeModelIds: ['apodex/apodex-1.1-mini:free'],
      defaultModels: [
        { id: 'apodex/apodex-1.1-mini:free', capabilities: ['chat'], maxTokens: 8192, costPer1kTokens: 0 },
        { id: 'openrouter/other:free', capabilities: ['chat'], maxTokens: 8192, costPer1kTokens: 0 },
      ],
    }).listModels();
    expect(models.map((m) => m.id)).toEqual(['openrouter/other:free']);
  });

  it('matches ids exactly, without prefix or case leniency', async () => {
    const models = await providerWith(
      { data: [{ id: 'apodex/apodex-1.1-mini:free' }, { id: 'apodex/apodex-1.1-mini' }] },
      'openrouter',
      { excludeModelIds: ['apodex/apodex-1.1-mini:free'] },
    ).listModels();
    expect(models.map((m) => m.id)).toEqual(['apodex/apodex-1.1-mini']);
  });
});

describe('OpenAICompatibleProvider completion endpoint discovery', () => {
  beforeEach(() => mockFetchProvider.mockReset());

  const completion = { choices: [{ message: { content: 'hello' } }], usage: { completion_tokens: 3, prompt_tokens: 4 } };

  it('finds the chat route when the configured one does not exist', async () => {
    // A gateway that serves the API under a different prefix must still work
    // instead of failing with an unhelpful "page not found".
    mockFetchProvider.mockImplementation(async (url: string) => {
      if (url === 'https://example.test/v1/chat/completions') {
        return { ok: true, status: 200, json: async () => completion };
      }
      return { ok: false, status: 404, text: async () => '404 page not found' };
    });

    const provider = new OpenAICompatibleProvider({
      id: 'requesty',
      name: 'Requesty',
      apiBase: 'https://example.test/v1',
      apiKey: 'key',
      defaultModels: [],
      chatCompletionsPath: '/chat',
    });

    const result = await provider.complete({
      model: 'some-model',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 16,
      temperature: 0,
    });

    expect(result.content).toBe('hello');
    const probed = mockFetchProvider.mock.calls.map((call) => call[0]);
    expect(probed).toContain('https://example.test/v1/chat');
    expect(probed).toContain('https://example.test/v1/chat/completions');
  });

  it('probes the version prefixed route when the base has no version', async () => {
    mockFetchProvider.mockImplementation(async (url: string) => {
      if (url === 'https://example.test/v1/chat/completions') {
        return { ok: true, status: 200, json: async () => completion };
      }
      return { ok: false, status: 404, text: async () => '404 page not found' };
    });

    const provider = new OpenAICompatibleProvider({
      id: 'gateway',
      name: 'Gateway',
      apiBase: 'https://example.test',
      apiKey: 'key',
      defaultModels: [],
    });

    const result = await provider.complete({
      model: 'some-model',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 16,
      temperature: 0,
    });

    expect(result.content).toBe('hello');
    expect(mockFetchProvider.mock.calls.map((call) => call[0])).toContain(
      'https://example.test/v1/chat/completions',
    );
  });

  it('remembers the route that answered for later calls', async () => {
    mockFetchProvider.mockImplementation(async (url: string) => {
      if (url === 'https://example.test/v1/chat/completions') {
        return { ok: true, status: 200, json: async () => completion };
      }
      return { ok: false, status: 404, text: async () => '404 page not found' };
    });

    const provider = new OpenAICompatibleProvider({
      id: 'gateway',
      name: 'Gateway',
      apiBase: 'https://example.test/v1',
      apiKey: 'key',
      defaultModels: [],
      chatCompletionsPath: '/chat',
    });

    const request: CompletionRequest = {
      model: 'some-model',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 16,
      temperature: 0,
    };
    await provider.complete(request);
    mockFetchProvider.mockClear();
    await provider.complete(request);

    // The second call goes straight to the route that answered.
    expect(mockFetchProvider.mock.calls.map((call) => call[0])).toEqual([
      'https://example.test/v1/chat/completions',
    ]);
  });

  it('reports the routes it tried when none of them serve the request', async () => {
    mockFetchProvider.mockResolvedValue({ ok: false, status: 404, text: async () => '404 page not found' });

    const provider = new OpenAICompatibleProvider({
      id: 'requesty',
      name: 'Requesty',
      apiBase: 'https://example.test/v1',
      apiKey: 'key',
      defaultModels: [],
      chatCompletionsPath: '/chat',
    });

    await expect(
      provider.complete({
        model: 'some-model',
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 16,
        temperature: 0,
      }),
    ).rejects.toThrow(/REQUESTY_CHAT_PATH/);
  });

  it('does not probe other routes when the server reports a non routing error', async () => {
    mockFetchProvider.mockResolvedValue({ ok: false, status: 402, text: async () => 'insufficient credits' });

    const provider = new OpenAICompatibleProvider({
      id: 'requesty',
      name: 'Requesty',
      apiBase: 'https://example.test/v1',
      apiKey: 'key',
      defaultModels: [],
    });

    await expect(
      provider.complete({
        model: 'some-model',
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 16,
        temperature: 0,
      }),
    ).rejects.toThrow(/402/);
    expect(mockFetchProvider).toHaveBeenCalledTimes(1);
  });
});
