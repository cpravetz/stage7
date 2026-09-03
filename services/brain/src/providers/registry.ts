import { LLMProvider } from './Provider';
import { OpenAICompatibleProvider } from './OpenAICompatibleProvider';
import { AnthropicProvider } from './AnthropicProvider';
import { GeminiProvider } from './GeminiProvider';

export function buildProviderRegistry(): LLMProvider[] {
  const providers: LLMProvider[] = [];

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    providers.push(new OpenAICompatibleProvider({
      id: 'openai',
      name: 'OpenAI',
      apiBase: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
      apiKey: openaiKey,
      listModelsPath: '/models',
      defaultModels: [
        { id: 'gpt-4o', capabilities: ['chat', 'vision', 'code', 'reasoning'], maxTokens: 128000, costPer1kTokens: 2.5 },
        { id: 'gpt-4o-mini', capabilities: ['chat', 'vision', 'code', 'reasoning'], maxTokens: 128000, costPer1kTokens: 0.15 },
        { id: 'gpt-4-turbo', capabilities: ['chat', 'vision', 'code', 'reasoning'], maxTokens: 128000, costPer1kTokens: 10 },
        { id: 'gpt-3.5-turbo', capabilities: ['chat', 'code'], maxTokens: 16385, costPer1kTokens: 0.5 },
        { id: 'o1', capabilities: ['chat', 'code', 'reasoning'], maxTokens: 200000, costPer1kTokens: 15 },
        { id: 'o1-mini', capabilities: ['chat', 'code', 'reasoning'], maxTokens: 128000, costPer1kTokens: 3 },
        { id: 'o3-mini', capabilities: ['chat', 'code', 'reasoning'], maxTokens: 200000, costPer1kTokens: 1.1 },
      ],
    }));
  }

  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (openrouterKey) {
    providers.push(new OpenAICompatibleProvider({
      id: 'openrouter',
      name: 'OpenRouter',
      apiBase: process.env.OPENROUTER_URL || 'https://openrouter.ai/api/v1',
      apiKey: openrouterKey,
      listModelsPath: '/models',
      defaultModels: [
        { id: 'openai/gpt-4o', capabilities: ['chat', 'vision', 'code', 'reasoning'], maxTokens: 128000, costPer1kTokens: 2.5 },
        { id: 'openai/gpt-4o-mini', capabilities: ['chat', 'vision', 'code', 'reasoning'], maxTokens: 128000, costPer1kTokens: 0.15 },
        { id: 'anthropic/claude-3.5-sonnet', capabilities: ['chat', 'code', 'reasoning', 'creative'], maxTokens: 200000, costPer1kTokens: 3 },
        { id: 'google/gemini-2.0-flash-exp', capabilities: ['chat', 'code', 'reasoning'], maxTokens: 1048576, costPer1kTokens: 0 },
        { id: 'deepseek/deepseek-chat', capabilities: ['chat', 'code', 'reasoning'], maxTokens: 64000, costPer1kTokens: 0.14 },
        { id: 'meta-llama/llama-4-maverick', capabilities: ['chat', 'vision', 'code'], maxTokens: 128000, costPer1kTokens: 0.18 },
      ],
    }));
  }

  const mistralKey = process.env.MISTRAL_API_KEY;
  if (mistralKey) {
    providers.push(new OpenAICompatibleProvider({
      id: 'mistral',
      name: 'Mistral',
      apiBase: process.env.MISTRAL_API_BASE || 'https://api.mistral.ai/v1',
      apiKey: mistralKey,
      listModelsPath: '/models',
      defaultModels: [
        { id: 'mistral-large-latest', capabilities: ['chat', 'code', 'reasoning'], maxTokens: 128000, costPer1kTokens: 2 },
        { id: 'mistral-small-latest', capabilities: ['chat', 'code'], maxTokens: 32000, costPer1kTokens: 0.2 },
        { id: 'codestral-latest', capabilities: ['chat', 'code'], maxTokens: 32000, costPer1kTokens: 0.3 },
        { id: 'open-mistral-7b', capabilities: ['chat'], maxTokens: 32000, costPer1kTokens: 0.25 },
      ],
    }));
  }

  const grokKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  if (grokKey) {
    providers.push(new OpenAICompatibleProvider({
      id: 'grok',
      name: 'Grok (xAI)',
      apiBase: process.env.GROK_API_BASE || 'https://api.x.ai/v1',
      apiKey: grokKey,
      listModelsPath: '/models',
      defaultModels: [
        { id: 'grok-2-latest', capabilities: ['chat', 'code', 'reasoning', 'search'], maxTokens: 131072, costPer1kTokens: 2 },
        { id: 'grok-2-mini', capabilities: ['chat', 'code'], maxTokens: 131072, costPer1kTokens: 0.2 },
        { id: 'grok-beta', capabilities: ['chat', 'code', 'reasoning'], maxTokens: 131072, costPer1kTokens: 5 },
      ],
    }));
  }

  const hfKey = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN;
  if (hfKey) {
    providers.push(new OpenAICompatibleProvider({
      id: 'huggingface',
      name: 'Hugging Face',
      apiBase: process.env.HUGGINGFACE_API_BASE || 'https://router.huggingface.co/v1',
      apiKey: hfKey,
      listModelsPath: '/models',
      defaultModels: [
        { id: 'meta-llama/Llama-3.1-8B-Instruct', capabilities: ['chat', 'code'], maxTokens: 128000, costPer1kTokens: 0.06 },
        { id: 'meta-llama/Llama-3.1-70B-Instruct', capabilities: ['chat', 'code', 'reasoning'], maxTokens: 128000, costPer1kTokens: 0.59 },
        { id: 'Qwen/Qwen2.5-72B-Instruct', capabilities: ['chat', 'code', 'reasoning'], maxTokens: 32000, costPer1kTokens: 0.35 },
        { id: 'mistralai/Mistral-7B-Instruct-v0.3', capabilities: ['chat'], maxTokens: 32000, costPer1kTokens: 0.05 },
      ],
    }));
  }

  const openwebUrl = process.env.OPENWEB_URL;
  if (openwebUrl) {
    providers.push(new OpenAICompatibleProvider({
      id: 'openwebui',
      name: 'OpenWebUI / Ollama',
      apiBase: openwebUrl.replace(/\/+$/, '') + (openwebUrl.includes('/v1') ? '' : '/api/v1'),
      apiKey: process.env.OPENWEBUI_API_KEY,
      listModelsPath: '/models',
      defaultModels: [
        { id: 'llama3.2', capabilities: ['chat'], maxTokens: 8192, costPer1kTokens: 0 },
        { id: 'mistral', capabilities: ['chat'], maxTokens: 8192, costPer1kTokens: 0 },
        { id: 'codellama', capabilities: ['chat', 'code'], maxTokens: 16384, costPer1kTokens: 0 },
        { id: 'gemma2', capabilities: ['chat', 'reasoning'], maxTokens: 8192, costPer1kTokens: 0 },
      ],
    }));
  }

  if (process.env.ANTHROPIC_API_KEY) {
    providers.push(new AnthropicProvider());
  }

  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    providers.push(new GeminiProvider());
  }

  return providers;
}
