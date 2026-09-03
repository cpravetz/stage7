import { LLMProvider, ProviderInfo, CompletionRequest, CompletionResponse } from './Provider';

export class GeminiProvider implements LLMProvider {
  readonly id = 'gemini';
  readonly name = 'Google Gemini';
  readonly info: ProviderInfo;
  private apiKey?: string;
  private apiBase = 'https://generativelanguage.googleapis.com';
  private defaultModels = [
    { id: 'gemini-2.0-flash-exp', capabilities: ['chat', 'vision', 'code', 'reasoning', 'search'], maxTokens: 1048576, costPer1kTokens: 0 },
    { id: 'gemini-1.5-pro', capabilities: ['chat', 'vision', 'code', 'reasoning'], maxTokens: 2097152, costPer1kTokens: 1.25 },
    { id: 'gemini-1.5-flash', capabilities: ['chat', 'vision', 'code'], maxTokens: 1048576, costPer1kTokens: 0.075 },
  ];

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
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
    if (!this.apiKey) throw new Error('GEMINI_API_KEY (or GOOGLE_API_KEY) not set');
    const systemInstruction = req.messages.find((m) => m.role === 'system');
    const userMessages = req.messages.filter((m) => m.role !== 'system');
    const lastUser = [...userMessages].reverse().find((m) => m.role === 'user');
    if (!lastUser) throw new Error('No user message for Gemini completion');

    const parts: Array<{ text: string }> = userMessages.map((m) => ({ text: m.content }));
    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        maxOutputTokens: req.maxTokens || 4096,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      },
    };
    if (systemInstruction) {
      body['systemInstruction'] = { parts: [{ text: systemInstruction.content }] };
    }

    const url = `${this.apiBase}/v1beta/models/${req.model}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`[gemini] completion failed: ${res.status} ${errText}`);
    }
    const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; modelVersion?: string; usageMetadata?: { totalTokenCount?: number } };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    return {
      content: text,
      model: data.modelVersion || req.model,
      provider: this.id,
      tokensUsed: data.usageMetadata?.totalTokenCount,
      raw: data,
    };
  }
}
