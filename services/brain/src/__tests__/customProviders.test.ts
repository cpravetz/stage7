import { parseCustomProviderSpecs, buildCustomProvidersFromEnv } from '../providers/customProviders';

describe('customProviders', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('CUSTOM_') || key.match(/^REQUESTY_|^LLM7_|^TESTPROV_/)) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('parseCustomProviderSpecs', () => {
    it('returns empty array when CUSTOM_PROVIDERS is not set', () => {
      delete process.env.CUSTOM_PROVIDERS;
      expect(parseCustomProviderSpecs()).toEqual([]);
    });

    it('returns empty array when CUSTOM_PROVIDERS is empty', () => {
      process.env.CUSTOM_PROVIDERS = '';
      expect(parseCustomProviderSpecs()).toEqual([]);
    });

    it('parses a single provider from env vars', () => {
      process.env.CUSTOM_PROVIDERS = 'REQUESTY';
      process.env.REQUESTY_API_KEY = 'rqsty-sk-123';
      process.env.REQUESTY_API_NAME = 'Requesty';
      process.env.REQUESTY_API_URL = 'https://router.requesty.ai/v1';

      const specs = parseCustomProviderSpecs();
      expect(specs).toHaveLength(1);
      expect(specs[0]).toMatchObject({
        prefix: 'REQUESTY',
        id: 'requesty',
        name: 'Requesty',
        apiKey: 'rqsty-sk-123',
        apiBase: 'https://router.requesty.ai/v1',
        listModelsPath: '/models',
      });
    });

    it('parses multiple providers separated by commas', () => {
      process.env.CUSTOM_PROVIDERS = 'REQUESTY, LLM7';
      process.env.REQUESTY_API_KEY = 'rqsty-key';
      process.env.REQUESTY_API_NAME = 'Requesty';
      process.env.REQUESTY_API_URL = 'https://router.requesty.ai/v1';
      process.env.LLM7_API_KEY = 'llm7-key';
      process.env.LLM7_API_NAME = 'LLM7.io';
      process.env.LLM7_API_URL = 'https://llm7.io/v1';

      const specs = parseCustomProviderSpecs();
      expect(specs).toHaveLength(2);
      expect(specs.map((s) => s.id)).toEqual(['requesty', 'llm7']);
    });

    it('skips a provider missing an API key', () => {
      process.env.CUSTOM_PROVIDERS = 'NOCOLLECTION';
      // intentionally do not set NOCOLLECTION_API_KEY
      process.env.NOCOLLECTION_API_URL = 'https://noc.example.com/v1';

      const specs = parseCustomProviderSpecs();
      expect(specs).toEqual([]);
    });

    it('skips a provider missing an API URL', () => {
      process.env.CUSTOM_PROVIDERS = 'NOURL';
      process.env.NOURL_API_KEY = 'some-key';

      const specs = parseCustomProviderSpecs();
      expect(specs).toEqual([]);
    });

    it('skips a provider whose id conflicts with an existing provider', () => {
      const existing = new Set(['openai']);
      process.env.CUSTOM_PROVIDERS = 'OPENAI';
      process.env.OPENAI_API_KEY = 'key';
      process.env.OPENAI_API_URL = 'https://api.openai.com/v1';

      const specs = parseCustomProviderSpecs(existing);
      expect(specs).toEqual([]);
    });

    it('uses the prefix as the name when _API_NAME is not provided', () => {
      process.env.CUSTOM_PROVIDERS = 'TESTPROV';
      process.env.TESTPROV_API_KEY = 'test-key';
      process.env.TESTPROV_API_URL = 'https://test.example.com/v1';

      const specs = parseCustomProviderSpecs();
      expect(specs[0].name).toBe('testprov');
    });

    it('respects a custom LIST_MODELS_PATH override', () => {
      process.env.CUSTOM_PROVIDERS = 'TESTPROV';
      process.env.TESTPROV_API_KEY = 'test-key';
      process.env.TESTPROV_API_URL = 'https://test.example.com/v1';
      process.env.TESTPROV_LIST_MODELS_PATH = '/api/models';

      const specs = parseCustomProviderSpecs();
      expect(specs[0].listModelsPath).toBe('/api/models');
    });

    it('de-duplicates duplicate prefixes', () => {
      process.env.CUSTOM_PROVIDERS = 'TESTPROV, TESTPROV';
      process.env.TESTPROV_API_KEY = 'test-key';
      process.env.TESTPROV_API_URL = 'https://test.example.com/v1';

      const specs = parseCustomProviderSpecs();
      expect(specs).toHaveLength(1);
    });
  });

  describe('buildCustomProvidersFromEnv', () => {
    it('returns OpenAICompatibleProvider instances for configured providers', () => {
      process.env.CUSTOM_PROVIDERS = 'REQUESTY';
      process.env.REQUESTY_API_KEY = 'rqsty-sk-123';
      process.env.REQUESTY_API_NAME = 'Requesty';
      process.env.REQUESTY_API_URL = 'https://router.requesty.ai/v1';

      const providers = buildCustomProvidersFromEnv();
      expect(providers).toHaveLength(1);
      const p = providers[0];
      expect(p.id).toBe('requesty');
      expect(p.name).toBe('Requesty');
      expect(p.info.openAICompatible).toBe(true);
      expect(p.info.hasApiKey).toBe(true);
      expect(p.isAvailable()).toBe(true);
    });

    it('returns empty array when no providers are configured', () => {
      delete process.env.CUSTOM_PROVIDERS;
      const providers = buildCustomProvidersFromEnv();
      expect(providers).toEqual([]);
    });
  });
});
