import { OpenAICompatibleProvider } from '../providers/OpenAICompatibleProvider';

const mockFetchProvider = jest.fn();

jest.mock('../utils/providerFetch', () => ({
  fetchProvider: (...args: unknown[]) => mockFetchProvider(...args),
  providerTimeoutMs: 30000,
}));

function providerWith(payload: unknown, id = 'testprovider') {
  mockFetchProvider.mockResolvedValue({ ok: true, json: async () => payload });
  return new OpenAICompatibleProvider({
    id,
    name: id,
    apiBase: 'https://example.test/v1',
    apiKey: 'key',
    defaultModels: [],
    listModelsPath: '/models',
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
