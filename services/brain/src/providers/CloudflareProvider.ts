import { LLMProvider, ProviderInfo, CompletionRequest, CompletionResponse } from './Provider';
import { fetchProvider } from '../utils/providerFetch';

export class CloudflareProvider implements LLMProvider {
  readonly id = 'cloudflare';
  readonly name = 'Cloudflare Workers AI';
  readonly info: ProviderInfo;
  private apiKey?: string;
  private accountId?: string;
  private apiBase = 'https://api.cloudflare.com/client/v4';
  private validated = false;
  private validationError: Error | null = null;
  private defaultModels: Array<{ id: string; capabilities: string[]; maxTokens: number; costPer1kTokens: number }> = [
    { id: '@cf/meta/llama-3-8b-instruct', capabilities: ['chat', 'code'], maxTokens: 8192, costPer1kTokens: 0 },
    { id: '@cf/meta/llama-3.1-8b-instruct', capabilities: ['chat', 'code'], maxTokens: 8192, costPer1kTokens: 0 },
    { id: '@cf/mistral/mistral-7b-instruct-v0.1', capabilities: ['chat', 'code'], maxTokens: 8192, costPer1kTokens: 0 },
    { id: '@cf/google/gemma-2b-it-lora', capabilities: ['chat'], maxTokens: 8192, costPer1kTokens: 0 },
    { id: '@cf/openai/whisper', capabilities: ['audio'], maxTokens: 0, costPer1kTokens: 0 },
  ];

  constructor() {
    this.apiKey = process.env.CLOUDFLARE_WORKERS_AI_API_TOKEN;
    this.accountId = process.env.CLOUDFLARE_WORKERS_AI_ACCOUNT_ID;
    this.info = {
      id: this.id,
      name: this.name,
      apiBase: this.apiBase,
      hasApiKey: !!this.apiKey && !!this.accountId,
      openAICompatible: false,
    };
  }

  isAvailable(): boolean {
    if (!this.apiKey || !this.accountId) return false;
    if (this.validated && this.validationError) return false;
    return true;
  }

  async listModels() {
    await this.ensureValidated();
    if (this.validationError) throw this.validationError;
    return this.defaultModels;
  }

  private async ensureValidated() {
    if (this.validated) return;
    this.validated = true;

    if (!this.apiKey || !this.accountId) {
      this.validationError = new Error('CLOUDFLARE_WORKERS_AI_API_TOKEN and CLOUDFLARE_WORKERS_AI_ACCOUNT_ID must be set');
      return;
    }

    try {
      const url = `${this.apiBase}/accounts/${this.accountId}/ai/models/search`;
      const res = await fetchProvider(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });
      if (!res.ok) {
        const errText = await res.text();
        this.validationError = new Error(`Cloudflare validation failed: ${res.status} ${errText}`);
        return;
      }
    } catch (err) {
      this.validationError = err instanceof Error ? err : new Error(String(err));
    }
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    await this.ensureValidated();
    if (this.validationError) throw this.validationError;

    const systemMsg = req.messages.find((m) => m.role === 'system');
    const userMessages = req.messages.filter((m) => m.role !== 'system');
    const messages = systemMsg ? [{ role: 'system', content: systemMsg.content }, ...userMessages] : userMessages;

    const url = `${this.apiBase}/accounts/${this.accountId}/ai/chat/completions`;
    const res = await fetchProvider(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        messages,
        max_tokens: req.maxTokens,
        temperature: req.temperature,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`[cloudflare] completion failed: ${res.status} ${errText}`);
    }
    const data = await res.json() as { result?: { response?: string; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }; success?: boolean; errors?: Array<{ message?: string }> };
    const content = data.result?.response || '';
    const tokensUsed = data.result?.usage?.total_tokens || (data.result?.usage?.prompt_tokens || 0) + (data.result?.usage?.completion_tokens || 0);
    if (!data.success || data.errors?.length) {
      throw new Error(`[cloudflare] completion failed: ${data.errors?.map((e) => e.message).join(', ') || 'unknown error'}`);
    }
    return {
      content,
      model: req.model,
      provider: this.id,
      tokensUsed: tokensUsed || undefined,
      raw: data,
    };
  }
}
