import { LLMProvider, ProviderInfo, CompletionRequest, CompletionResponse, CompletionMessage } from './Provider';

export interface OpenAICompatibleConfig {
  id: string;
  name: string;
  apiBase: string;
  apiKey?: string;
  defaultModels: Array<{ id: string; capabilities: string[]; maxTokens: number; costPer1kTokens: number }>;
  extraHeaders?: Record<string, string>;
  listModelsPath?: string;
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly id: string;
  readonly name: string;
  readonly info: ProviderInfo;
  private apiBase: string;
  private apiKey?: string;
  private extraHeaders: Record<string, string>;
  private defaultModels: OpenAICompatibleConfig['defaultModels'];
  private listModelsPath?: string;
  private modelCache: Array<{ id: string; capabilities: string[]; maxTokens: number; costPer1kTokens: number }> | null = null;

  constructor(config: OpenAICompatibleConfig) {
    this.id = config.id;
    this.name = config.name;
    this.apiBase = config.apiBase.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.extraHeaders = config.extraHeaders || {};
    this.defaultModels = config.defaultModels;
    this.listModelsPath = config.listModelsPath;
    this.info = {
      id: config.id,
      name: config.name,
      apiBase: this.apiBase,
      hasApiKey: !!config.apiKey,
      openAICompatible: true,
    };
  }

  isAvailable(): boolean {
    return !!this.apiBase;
  }

  async listModels(): Promise<Array<{ id: string; capabilities: string[]; maxTokens: number; costPer1kTokens: number }>> {
    if (this.modelCache) return this.modelCache;
    if (this.listModelsPath) {
      try {
        const headers: Record<string, string> = {
      'Connection': 'close', ...this.extraHeaders };
        if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
        const res = await fetch(`${this.apiBase}${this.listModelsPath}`, { headers });
        if (res.ok) {
          const data = await res.json() as { data?: Array<{ id: string; context_length?: number; pricing?: { prompt?: string }; architecture?: { modality?: string } }> } | Array<{ id: string; name?: string }>;
          const arr = Array.isArray(data) ? data : (data.data || []);
          const mapped = arr.map((m) => {
            const id = m.id || (m as any).name || '';
            if (!id) return null;
            const pricing = (m as any).pricing;
            const cost = pricing ? (parseFloat(pricing.prompt || '0') || 0) * 1000 : 0;
            if (id.includes('embed') || (m as any).architecture?.modality === 'embedding') return { id, capabilities: ['embedding'], maxTokens: (m as any).context_length || 8192, costPer1kTokens: cost };
            const caps: string[] = ['chat'];
            if (id.includes('vision') || (m as any).architecture?.modality === 'vision+text') caps.push('vision');
            if (id.includes('code') || id.includes('coder')) caps.push('code');
            if (id.includes('reason') || id.includes('r1') || id.includes('think') || id.includes('o1') || id.includes('o3')) caps.push('reasoning');
            if (id.includes('creative') || id.includes('image') || id.includes('dall')) caps.push('creative');
            return {
              id,
              capabilities: caps,
              maxTokens: (m as any).context_length || 8192,
              costPer1kTokens: cost,
            };
          }).filter((m): m is { id: string; capabilities: string[]; maxTokens: number; costPer1kTokens: number } => !!m);
          if (mapped.length > 0) {
            this.modelCache = mapped;
            return mapped;
          }
        }
      } catch {
        // fall through to defaults
      }
    }
    this.modelCache = this.defaultModels;
    return this.defaultModels;
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const headers: Record<string, string> = {
      'Connection': 'close',
      'Content-Type': 'application/json',
      ...this.extraHeaders,
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    const res = await fetch(`${this.apiBase}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        max_tokens: req.maxTokens,
        temperature: req.temperature,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`[${this.id}] completion failed: ${res.status} ${errText}`);
    }
    const data = await res.json() as { choices?: Array<{ message?: { content?: string | null; reasoning?: string; refusal?: string | null } }>; usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number; reasoning_tokens?: number }; model?: string };
    let content = data.choices?.[0]?.message?.content ?? '';
    if ((!content || content.trim() === '') && data.choices?.[0]?.message?.reasoning) {
      content = data.choices[0].message.reasoning;
    }
    if (!content && data.choices?.[0]?.message?.refusal) {
      throw new Error(`[${this.id}] model refused: ${data.choices[0].message.refusal}`);
    }
    const tokensUsed = (data.usage?.completion_tokens && data.usage?.prompt_tokens)
      ? (data.usage.completion_tokens + data.usage.prompt_tokens)
      : data.usage?.total_tokens;
    return {
      content,
      model: data.model || req.model,
      provider: this.id,
      tokensUsed,
      raw: data,
    };
  }
}
