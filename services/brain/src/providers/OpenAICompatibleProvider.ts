import { LLMProvider, ProviderInfo, CompletionRequest, CompletionResponse, CompletionMessage } from './Provider';

export interface OpenAICompatibleConfig {
  id: string;
  name: string;
  apiBase: string;
  apiKey?: string;
  defaultModels: Array<{ id: string; capabilities: string[]; maxTokens: number; costPer1kTokens: number }>;
  extraHeaders?: Record<string, string>;
  listModelsPath?: string;
  chatCompletionsPath?: string;
  completionsPath?: string;
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
  private chatCompletionsPath: string;
  private completionsPath: string;
  private modelCache: Array<{ id: string; capabilities: string[]; maxTokens: number; costPer1kTokens: number }> | null = null;

  constructor(config: OpenAICompatibleConfig) {
    this.id = config.id;
    this.name = config.name;
    this.apiBase = config.apiBase.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.extraHeaders = config.extraHeaders || {};
    this.defaultModels = config.defaultModels;
    this.listModelsPath = config.listModelsPath;
    this.chatCompletionsPath = config.chatCompletionsPath || '/chat/completions';
    this.completionsPath = config.completionsPath || '/completions';
    this.info = {
      id: config.id,
      name: config.name,
      apiBase: this.apiBase,
      hasApiKey: !!config.apiKey,
      openAICompatible: true,
    };
  }

  // Allow updating API path overrides at runtime (e.g., from persisted settings)
  updatePathOverrides(overrides: { apiBase?: string; listModelsPath?: string; chatCompletionsPath?: string; completionsPath?: string }) {
    if (overrides.apiBase) this.apiBase = overrides.apiBase.replace(/\/+$/, '');
    if (overrides.listModelsPath) this.listModelsPath = overrides.listModelsPath;
    if (overrides.chatCompletionsPath) this.chatCompletionsPath = overrides.chatCompletionsPath;
    if (overrides.completionsPath) this.completionsPath = overrides.completionsPath;
    // Invalidate model cache when api base or list path changes
    if (overrides.apiBase || overrides.listModelsPath) this.modelCache = null;
    this.info.apiBase = this.apiBase;
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
    // Try chat/completions first, fall back to /completions if the server doesn't support chat endpoint.
    let res = await fetch(`${this.apiBase}${this.chatCompletionsPath}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        max_tokens: req.maxTokens,
        temperature: req.temperature,
      }),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) } as any));

    let data: any;
    if (!res.ok) {
      const errText = await (res.text ? res.text() : Promise.resolve(String(res)));
      // If the server returns 400 with a "Model not found" message, try to
      // discover available models and retry with a known model once.
      if (res.status === 400 && /Model not found/i.test(errText)) {
        try {
          const available = await this.listModels();
          if (available && available.length > 0) {
            const fallbackModel = available[0].id;
            const prompt = req.messages.map((m: CompletionMessage) => `${m.role}: ${m.content}`).join('\n');
            res = await fetch(`${this.apiBase}${this.chatCompletionsPath}`, {
              method: 'POST',
              headers: headers,
              body: JSON.stringify({
                model: fallbackModel,
                messages: req.messages,
                max_tokens: req.maxTokens,
                temperature: req.temperature,
              }),
            }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) } as any));
            if (res.ok) {
              // proceed to parse below
              data = await res.json();
            } else {
              const errText2 = await (res.text ? res.text() : Promise.resolve(String(res)));
              throw new Error(`[${this.id}] completion failed after fallback model attempt: ${res.status} ${errText2}`);
            }
          }
        } catch (e) {
          // fall through to other fallback logic
        }
      }
      // If the server indicates the model or endpoint does not support chat (400),
      // or method not allowed / not found, try the older /completions endpoint.
      if (res.status === 400 && /does not support chat|does not support/i.test(errText)) {
        // fall through to completions path below
      }
      if (res.status === 405 || res.status === 404 || /Method Not Allowed/i.test(errText) || /Not Found/i.test(errText) || (res.status === 400 && /does not support chat|does not support/i.test(errText))) {
        const prompt = req.messages.map((m: CompletionMessage) => `${m.role}: ${m.content}`).join('\n');
        res = await fetch(`${this.apiBase}${this.completionsPath}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: req.model,
            prompt,
            max_tokens: req.maxTokens,
            temperature: req.temperature,
          }),
        }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) } as any));
        if (!res.ok) {
          const errText2 = await (res.text ? res.text() : Promise.resolve(String(res)));
          const upperId = this.id.toUpperCase().replace(/[^A-Z0-9]/g, '_');
          const alt = upperId.replace(/UI$/, '');
          const suggestion = `Set ${upperId}_CHAT_PATH or ${upperId}_COMPLETIONS_PATH (or ${alt}_CHAT_PATH / ${alt}_COMPLETIONS_PATH) env var to the provider's supported completion endpoint (e.g. /api/chat/completions, /completions).`;
          throw new Error(`[${this.id}] completion failed (chat then completions): ${res.status} ${errText2}. ${suggestion}`);
        }
        data = await res.json();
      } else {
        const upperId = this.id.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        const alt = upperId.replace(/UI$/, '');
        const suggestion = `Set ${upperId}_CHAT_PATH or ${upperId}_COMPLETIONS_PATH (or ${alt}_CHAT_PATH / ${alt}_COMPLETIONS_PATH) env var to the provider's supported completion endpoint (e.g. /api/chat/completions, /completions).`;
        throw new Error(`[${this.id}] completion failed: ${res.status} ${errText}. ${suggestion}`);
      }
    } else {
      data = await res.json();
    }
    // Normalize response for both /chat/completions and /completions
    let content = '';
    if (data.choices && data.choices[0] && data.choices[0].message) {
      content = data.choices[0].message.content ?? '';
      if ((!content || content.trim() === '') && data.choices[0].message.reasoning) {
        content = data.choices[0].message.reasoning;
      }
      if (!content && data.choices[0].message.refusal) {
        throw new Error(`[${this.id}] model refused: ${data.choices[0].message.refusal}`);
      }
    } else if (data.choices && data.choices[0] && data.choices[0].text) {
      content = data.choices[0].text;
    } else if (data.output && Array.isArray(data.output) && data.output[0] && data.output[0].content) {
      content = data.output[0].content[0].text || '';
    }

    const tokensUsed = (data.usage && (data.usage.completion_tokens && data.usage.prompt_tokens))
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
