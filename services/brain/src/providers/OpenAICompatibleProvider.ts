import { LLMProvider, ProviderInfo, CompletionRequest, CompletionResponse, CompletionMessage } from './Provider';
import { fetchProvider, providerTimeoutMs } from '../utils/providerFetch';

const FALLBACK_CONTEXT_WINDOW = 8192;

function toNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

// Gateways disagree on pricing metadata, and a missing price is not the same as a
// zero price. Getting this wrong makes paid models look free, which silently
// defeats the free-only and budget filters in ModelRouter.
//
//   OpenRouter : pricing: { prompt: "0.0000025" }        (USD per token)
//   Requesty   : input_price: 0.00000174                  (USD per token)
//                pricing: [{ prompt_tokens_threshold, input_price, output_price }]
//
// Both forms are USD per token, so costPer1kTokens is the value x 1000.
//
// Returns null when the catalogue entry carries no pricing, so the caller can tell
// "unpriced" apart from "genuinely zero". Collapsing the two here is what lets a
// metered provider masquerade as free.
function readCostPer1kTokens(model: Record<string, unknown>): number | null {
  const pricing = model.pricing;
  let per1k: number | null = null;

  if (Array.isArray(pricing) && pricing.length > 0) {
    const tier = (pricing[0] || {}) as Record<string, unknown>;
    const raw = toNumber(tier.input_price) ?? toNumber(tier.prompt);
    if (raw !== null) per1k = raw * 1000;
  } else if (pricing && typeof pricing === 'object') {
    const raw = toNumber((pricing as Record<string, unknown>).prompt);
    if (raw !== null) per1k = raw * 1000;
  }

  // Flat field wins when present; authoritative on gateways that publish both.
  const flat = toNumber(model.input_price);
  if (flat !== null) per1k = flat * 1000;

  return per1k;
}

function readContextWindow(model: Record<string, unknown>): number {
  for (const candidate of [model.context_length, model.context_window, model.max_input_tokens]) {
    const n = toNumber(candidate);
    if (n !== null && n > 0) return n;
  }
  return FALLBACK_CONTEXT_WINDOW;
}

function readCapabilities(model: Record<string, unknown>, id: string): string[] {
  const architecture = (model.architecture || {}) as Record<string, unknown>;
  const modality = architecture.modality;
  const supports = (key: string): boolean => model[key] === true || model[key] === 'true';

  const caps: string[] = ['chat'];
  if (supports('supports_vision') || modality === 'vision+text' || id.includes('vision')) caps.push('vision');
  if (id.includes('code') || id.includes('coder')) caps.push('code');
  if (
    supports('supports_reasoning') ||
    id.includes('reason') || id.includes('r1') || id.includes('think') ||
    id.includes('o1') || id.includes('o3')
  ) caps.push('reasoning');
  if (supports('supports_image_generation') || id.includes('creative') || id.includes('image') || id.includes('dall')) {
    caps.push('creative');
  }
  return caps;
}

export interface OpenAICompatibleConfig {
  id: string;
  name: string;
  apiBase: string;
  apiKey?: string;
  defaultModels: Array<{ id: string; capabilities: string[]; maxTokens: number; costPer1kTokens: number }>;
  extraHeaders?: Record<string, string>;
  // Model ids the provider must never expose through listModels(), so they are
  // never registered with the router. Use this for catalogue entries that are
  // advertised but unusable (e.g. free models that leak scratchpad regardless
  // of the system prompt). Filtering here keeps the router purely declarative.
  excludeModelIds?: string[];
  // Cost attributed to catalogue entries that publish no pricing. Providers whose
  // endpoint is metered should set this so their models do not read as free to
  // ModelRouter's freeOnly filter. Omitted, unpriced models keep the historical
  // 0 = "assume free" behaviour, which is correct for local catalogues.
  assumedCostPer1kTokens?: number;
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
  private excludeModelIds: Set<string>;
  private defaultModels: OpenAICompatibleConfig['defaultModels'];
  private assumedCostPer1kTokens?: number;
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
    this.excludeModelIds = new Set(config.excludeModelIds || []);
    this.defaultModels = config.defaultModels;
    this.assumedCostPer1kTokens = config.assumedCostPer1kTokens;
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

  private isExcluded(id: string): boolean {
    return this.excludeModelIds.has(id);
  }

  async listModels(): Promise<Array<{ id: string; capabilities: string[]; maxTokens: number; costPer1kTokens: number }>> {
    if (this.modelCache) return this.modelCache;
    if (this.listModelsPath) {
      try {
        const headers: Record<string, string> = {
      'Connection': 'close', ...this.extraHeaders };
        if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
        const res = await fetchProvider(`${this.apiBase}${this.listModelsPath}`, { headers });
        if (res.ok) {
          const data = await res.json() as
            | { data?: Array<Record<string, unknown>> }
            | Array<Record<string, unknown>>;
          const arr = Array.isArray(data) ? data : (data.data || []);
          const mapped = arr.map((m: Record<string, unknown>) => {
            const id = m.id || (m as any).name || '';
            if (!id || this.isExcluded(id)) return null;
            const cost = readCostPer1kTokens(m) ?? this.assumedCostPer1kTokens ?? 0;
            const isEmbedding = id.includes('embed') || (m.architecture as any)?.modality === 'embedding';
            if (isEmbedding) return { id, capabilities: ['embedding'], maxTokens: readContextWindow(m), costPer1kTokens: cost };
            const caps = readCapabilities(m, id);
            // OpenAI-compatible local/free catalogs often omit capability metadata;
            // keep general chat models eligible for advisory and drafting tasks.
            if (this.id === 'openwebui' || id.endsWith(':free')) {
              caps.push('reasoning', 'creative');
            }
            return {
              id,
              capabilities: caps,
              maxTokens: readContextWindow(m),
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
    const defaults = this.defaultModels.filter((m) => !this.isExcluded(m.id));
    this.modelCache = defaults;
    return defaults;
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

    const upperId = this.id.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const alt = upperId.replace(/UI$/, '');
    const pathSuggestion = `Set ${upperId}_CHAT_PATH or ${upperId}_COMPLETIONS_PATH (or ${alt}_CHAT_PATH / ${alt}_COMPLETIONS_PATH) env var to the provider's supported completion endpoint (e.g. /api/chat/completions, /completions).`;

    const buildBody = (model: string) => ({
      model,
      messages: req.messages,
      max_tokens: req.maxTokens,
      temperature: req.temperature,
    });

    // Try chat/completions first, fall back to /completions if the server doesn't support chat endpoint.
    let res = await fetchProvider(`${this.apiBase}${this.chatCompletionsPath}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildBody(req.model)),
    });

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
            res = await fetchProvider(`${this.apiBase}${this.chatCompletionsPath}`, {
              method: 'POST',
              headers,
              body: JSON.stringify(buildBody(fallbackModel)),
            });
            if (res.ok) {
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
      if (res.status === 405 || res.status === 404 || /Method Not Allowed/i.test(errText) || /Not Found/i.test(errText) || (res.status === 400 && /does not support chat|does not support/i.test(errText))) {
        const prompt = req.messages.map((m: CompletionMessage) => `${m.role}: ${m.content}`).join('\n');
        res = await fetchProvider(`${this.apiBase}${this.completionsPath}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: req.model,
            prompt,
            max_tokens: req.maxTokens,
            temperature: req.temperature,
          }),
        });
        if (!res.ok) {
          const errText2 = await (res.text ? res.text() : Promise.resolve(String(res)));
          throw new Error(`[${this.id}] completion failed (chat then completions): ${res.status} ${errText2}. ${pathSuggestion}`);
        }
        data = await res.json();
      } else {
        // Generic failure: timeouts (AbortError), 429 rate limits, 4xx/5xx, etc.
        // The env-var path suggestion is only meaningful for 404/405/"does not support chat"
        // cases, so it is intentionally NOT included here.
        throw new Error(`[${this.id}] completion failed: ${res.status} ${errText}`);
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
