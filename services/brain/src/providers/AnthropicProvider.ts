import { LLMProvider, ProviderInfo, CompletionRequest, CompletionResponse } from './Provider';

export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic';
  readonly name = 'Anthropic';
  readonly info: ProviderInfo;
  private apiKey?: string;
  private apiBase: string;
  private defaultModels: Array<{ id: string; capabilities: string[]; maxTokens: number; costPer1kTokens: number }> = [
    { id: 'claude-3-5-sonnet-latest', capabilities: ['chat', 'code', 'reasoning', 'creative'], maxTokens: 200000, costPer1kTokens: 3 },
    { id: 'claude-3-5-haiku-latest', capabilities: ['chat', 'code'], maxTokens: 200000, costPer1kTokens: 0.25 },
    { id: 'claude-3-opus-latest', capabilities: ['chat', 'code', 'reasoning', 'creative'], maxTokens: 200000, costPer1kTokens: 15 },
  ];

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY;
    this.apiBase = 'https://api.anthropic.com';
    this.info = {
      id: this.id,
      name: this.name,
      apiBase: this.apiBase,
      hasApiKey: !!this.apiKey,
      openAICompatible: false,
    };
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async listModels() {
    return this.defaultModels;
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    if (!this.apiKey) throw new Error('ANTHROPIC_API_KEY not set');
    const systemMsg = req.messages.find((m) => m.role === 'system');
    const userMessages = req.messages.filter((m) => m.role !== 'system');
    const body: Record<string, unknown> = {
      model: req.model,
      max_tokens: req.maxTokens || 4096,
      messages: userMessages,
    };
    if (systemMsg) body['system'] = systemMsg.content;
    if (req.temperature !== undefined) body['temperature'] = req.temperature;

    const res = await fetch(`${this.apiBase}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`[anthropic] completion failed: ${res.status} ${errText}`);
    }
    const data = await res.json() as { content?: Array<{ type: string; text?: string }>; model?: string; usage?: { input_tokens?: number; output_tokens?: number } };
    const textBlock = data.content?.find((b) => b.type === 'text');
    const content = textBlock?.text ?? '';
    const tokens = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
    return {
      content,
      model: data.model || req.model,
      provider: this.id,
      tokensUsed: tokens || undefined,
      raw: data,
    };
  }
}
