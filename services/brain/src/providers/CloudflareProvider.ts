import { LLMProvider, ProviderInfo, CompletionRequest, CompletionResponse } from './Provider';

export class CloudflareProvider implements LLMProvider {
  readonly id = 'cloudflare';
  readonly name = 'Cloudflare Workers AI';
  readonly info: ProviderInfo;
  private apiKey?: string;
  private accountId?: string;
  private apiBase = 'https://api.cloudflare.com/client/v4';
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
    return !!this.apiKey && !!this.accountId;
  }

  async listModels() {
    return this.defaultModels;
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    if (!this.apiKey || !this.accountId) {
      throw new Error('CLOUDFLARE_WORKERS_AI_API_TOKEN and CLOUDFLARE_WORKERS_AI_ACCOUNT_ID must be set');
    }
    const systemMsg = req.messages.find((m) => m.role === 'system');
    const userMessages = req.messages.filter((m) => m.role !== 'system');
    const messages = systemMsg ? [{ role: 'system', content: systemMsg.content }, ...userMessages] : userMessages;

    const url = `${this.apiBase}/accounts/${this.accountId}/ai/chat/completions`;
    const res = await fetch(url, {
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
