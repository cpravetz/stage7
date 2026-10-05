import { buildProviderRegistry } from '../providers/registry';

// Every key that can switch a built-in provider on. Cleared before each test so a
// key present in the developer's own environment cannot make a provider appear
// that the test did not enable.
const PROVIDER_KEYS = [
  'OPENAI_API_KEY',
  'OPENAI_API_BASE',
  'CLOUDFLARE_WORKERS_AI_API_TOKEN',
  'CLOUDFLARE_WORKERS_AI_ACCOUNT_ID',
  'OPENROUTER_API_KEY',
  'MISTRAL_API_KEY',
  'GROK_API_KEY',
  'XAI_API_KEY',
  'HUGGINGFACE_API_KEY',
  'HF_TOKEN',
  'NVIDIA_API_KEY',
  'NVIDIA_API_BASE',
  'OPENWEB_URL',
  'OPENWEBUI_URL',
  'OLLAMA_API_BASE',
  'OLLAMA_URL',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'CUSTOM_PROVIDERS',
];

describe('buildProviderRegistry', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    for (const key of PROVIDER_KEYS) delete process.env[key];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('registers NVIDIA when NVIDIA_API_KEY is set', () => {
    process.env.NVIDIA_API_KEY = 'nvapi-test-key';

    const nvidia = buildProviderRegistry().find((p) => p.id === 'nvidia');

    expect(nvidia).toBeDefined();
    expect(nvidia!.info.apiBase).toBe('https://integrate.api.nvidia.com/v1');
  });

  it('omits NVIDIA when NVIDIA_API_KEY is absent', () => {
    const ids = buildProviderRegistry().map((p) => p.id);

    expect(ids).not.toContain('nvidia');
  });

  it('honours NVIDIA_API_BASE when it is overridden', () => {
    process.env.NVIDIA_API_KEY = 'nvapi-test-key';
    process.env.NVIDIA_API_BASE = 'https://proxy.internal/v1/';

    const nvidia = buildProviderRegistry().find((p) => p.id === 'nvidia');

    expect(nvidia!.info.apiBase).toBe('https://proxy.internal/v1');
  });

  it('seeds NVIDIA with priced models rather than zero-cost ones', async () => {
    process.env.NVIDIA_API_KEY = 'nvapi-test-key';

    const nvidia = buildProviderRegistry().find((p) => p.id === 'nvidia')!;
    // No /models fetch happens here, so this exercises the seed catalogue. A zero
    // cost would make NVIDIA models look free to the router's freeOnly filter.
    const models = await nvidia.listModels();

    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.costPer1kTokens > 0)).toBe(true);
  });

  it('registers NVIDIA alongside other providers without an id collision', () => {
    process.env.NVIDIA_API_KEY = 'nvapi-test-key';
    process.env.OPENAI_API_KEY = 'sk-test-key';

    const ids = buildProviderRegistry().map((p) => p.id);

    expect(ids).toContain('nvidia');
    expect(ids).toContain('openai');
  });
});