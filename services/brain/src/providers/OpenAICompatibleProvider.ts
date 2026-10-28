import { LLMProvider, ProviderInfo, CompletionRequest, CompletionResponse, CompletionMessage, ProviderModel } from './Provider';
import { fetchProvider, providerTimeoutMs } from '../utils/providerFetch';

const FALLBACK_CONTEXT_WINDOW = 8192;

/**
 * Routes a gateway may serve its OpenAI-compatible API on. They are probed in
 * order when the configured route does not exist, so a provider that serves
 * the API under a different prefix still works without any configuration.
 */
const CHAT_PATH_CANDIDATES = [
  '/chat/completions',
  '/v1/chat/completions',
  '/api/chat/completions',
  '/api/v1/chat/completions',
  '/openai/chat/completions',
];

const COMPLETIONS_PATH_CANDIDATES = [
  '/completions',
  '/v1/completions',
  '/api/completions',
  '/api/v1/completions',
];

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

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') return [value];
  return [];
}

/**
 * Returns the first non-empty string from a list of candidate values, else
 * undefined. Used to extract the model's chain-of-thought / reasoning field,
 * which reasoning-capable models (o1, o3-mini, OpenRouter reasoning models)
 * return under a variety of keys alongside the final content.
 */
function firstNonEmptyString(candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate;
  }
  return undefined;
}

/**
 * Reads a capability flag from either the flat OpenAI-style field
 * (`supports_vision`) or the nested Mistral-style `capabilities` object
 * (`capabilities.vision`), since gateways disagree on where they put it.
 */
function readCapabilityFlag(model: Record<string, unknown>, key: string): boolean {
  if (model[key] === true || model[key] === 'true') return true;
  const caps = model.capabilities;
  if (caps && typeof caps === 'object') {
    const value = (caps as Record<string, unknown>)[key];
    if (value === true || value === 'true') return true;
  }
  return false;
}

/**
 * Decides whether a catalogue entry can serve a text chat completion, using
 * only metadata the provider publishes at runtime.
 *
 * Returns null when the gateway gives no signal at all, meaning
 * "assume chat-capable" -- the historical behaviour for catalogs (mostly
 * local ones) that omit capability flags entirely.
 *
 * The signals, in order:
 *   1. Mistral's explicit `capabilities.completion_chat` boolean.
 *   2. OpenRouter-style `output_modalities`: a model whose published output
 *      modalities include no text cannot answer a chat completion.
 *   3. xAI's sparse listing, where image-generation models carry
 *      `image_price` and no text token prices while chat models carry text
 *      token prices.
 *
 * Nothing here is inferred from the model id. Media models are distinguished
 * by the modalities and pricing fields their own gateway reports, so a newly
 * added image or OCR model is handled correctly with no stage7-side change.
 */
function canServeChat(model: Record<string, unknown>): boolean | null {
  const caps = model.capabilities;
  if (caps && typeof caps === 'object') {
    const completionChat = (caps as Record<string, unknown>).completion_chat;
    if (typeof completionChat === 'boolean') return completionChat;
  }

  const architecture = (model.architecture || {}) as Record<string, unknown>;
  const outputModalities = asStringArray(architecture.output_modalities ?? model.output_modalities);

  // A model whose published output modalities include no text cannot answer a
  // chat completion (image/audio/video-only generators).
  if (outputModalities.length > 0) {
    return outputModalities.includes('text');
  }

  const modality = String(architecture.modality ?? model.modality ?? '');
  const outputModality = modality.split('->').at(-1)?.toLowerCase();
  if (outputModality && /(?:^|[+,\s])text(?:$|[+,\s])/.test(outputModality) === false) {
    return false;
  }

  // xAI lists image-generation models alongside chat models on the same
  // /models endpoint. The image models carry image_price and no text token
  // prices; chat models carry text token prices. This is the only reliable
  // discriminator in xAI's sparse listing.
  const hasTextPrice = model.prompt_text_token_price != null || model.completion_text_token_price != null;
  const hasMediaPrice = ['image_price', 'video_price', 'audio_price'].some((key) => model[key] != null);
  if (hasMediaPrice || hasTextPrice) {
    // Media generation prices without text-token prices indicate a non-chat
    // model, regardless of which generated modality the provider exposes.
    if (hasMediaPrice && !hasTextPrice) return false;
    return true;
  }

  // Some catalogs expose generation models by id but omit modality and pricing
  // metadata. Keep this fallback narrow: general video-input models can still
  // serve chat, while explicitly named media generators cannot.
  if (/(?:^|[/_-])imagine-(?:image|video)(?:$|[_.-])|(?:^|[/_-])(?:image|video)-(?:generation|gen)(?:$|[_.-])/i.test(String(model.id ?? ''))) {
    return false;
  }

  // No modality or pricing metadata: assume chat-capable.
  return null;
}

function shouldOmitModel(model: Record<string, unknown>): boolean {
  const caps = model.capabilities;
  const completionChat = caps && typeof caps === 'object'
    ? (caps as Record<string, unknown>).completion_chat
    : undefined;
  if (completionChat === false) return true;

  const hasTextPrice = model.prompt_text_token_price != null || model.completion_text_token_price != null;
  const hasMediaPrice = ['image_price', 'video_price', 'audio_price'].some((key) => model[key] != null);
  return hasMediaPrice && !hasTextPrice;
}

function readCapabilities(model: Record<string, unknown>, id: string): string[] {
  const architecture = (model.architecture || {}) as Record<string, unknown>;
  const modality = architecture.modality;
  const inputModalities = asStringArray(architecture.input_modalities ?? model.input_modalities);
  const outputModalities = asStringArray(architecture.output_modalities ?? model.output_modalities);

  const caps: string[] = [];
  const chat = canServeChat(model);
  if (chat !== false) caps.push('chat');
  if (
    readCapabilityFlag(model, 'vision')
    ||
    readCapabilityFlag(model, 'supports_vision')
    || modality === 'vision+text'
    || id.includes('vision')
    || inputModalities.includes('image')
    || inputModalities.includes('video')
  ) caps.push('vision');
  if (inputModalities.includes('audio') || readCapabilityFlag(model, 'supports_audio')) caps.push('audio');
  if (id.includes('code') || id.includes('coder')) caps.push('code');
  if (
    readCapabilityFlag(model, 'supports_reasoning')
    || id.includes('reason') || id.includes('r1') || id.includes('think')
    || id.includes('o1') || id.includes('o3')
  ) caps.push('reasoning');
  if (readCapabilityFlag(model, 'supports_image_generation') || id.includes('creative') || id.includes('image') || id.includes('dall') || id.includes('flux') || id.includes('stable') || id.includes('midjourney')) {
    // pure image generation model
  } else if (id.includes('creative')) {
    caps.push('creative');
  }
  for (const media of ['image', 'audio', 'video']) {
    if (
      outputModalities.includes(media)
      || readCapabilityFlag(model, `supports_${media}_generation`)
    ) caps.push(`${media}_generation`);
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
  private modelCache: ProviderModel[] | null = null;

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

  /**
   * The completion endpoints to try, in order: the configured route first,
   * then the well-known OpenAI-compatible routes. A gateway whose API base
   * is missing its version prefix is also probed with that prefix added.
   */
  private endpointCandidates(
    configuredPath: string,
    fallbacks: string[],
  ): Array<{ url: string; base: string; path: string }> {
    const bases: Array<{ base: string; prefix: string }> = [{ base: this.apiBase, prefix: '' }];
    if (!/\/v\d+[a-z0-9]*$/i.test(this.apiBase)) {
      bases.push({ base: this.apiBase, prefix: '/v1' });
    }

    const paths = [configuredPath, ...fallbacks];
    const seen = new Set<string>();
    const candidates: Array<{ url: string; base: string; path: string }> = [];

    for (const { base, prefix } of bases) {
      for (const path of paths) {
        const normalized = path.startsWith('/') ? path : `/${path}`;
        const url = `${base}${prefix}${normalized}`;
        if (seen.has(url)) continue;
        seen.add(url);
        candidates.push({ url, base: `${base}${prefix}`, path: normalized });
      }
    }

    return candidates;
  }

  /** Remembers an endpoint that answered, so later calls go straight to it. */
  private rememberEndpoint(base: string, path: string, kind: 'chat' | 'completions'): void {
    if (base !== this.apiBase) {
      this.apiBase = base;
      this.modelCache = null;
      this.info.apiBase = base;
    }
    if (kind === 'chat') this.chatCompletionsPath = path;
    else this.completionsPath = path;
  }

  isAvailable(): boolean {
    return !!this.apiBase;
  }

  private isExcluded(id: string): boolean {
    return this.excludeModelIds.has(id);
  }

  async listModels(): Promise<ProviderModel[]> {
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
            if (!id || this.isExcluded(id) || shouldOmitModel(m)) return null;
            const cost = readCostPer1kTokens(m) ?? this.assumedCostPer1kTokens ?? 0;
            const isEmbedding = id.includes('embed') || (m.architecture as any)?.modality === 'embedding';
            if (isEmbedding) return { id, capabilities: ['embedding'], maxTokens: readContextWindow(m), costPer1kTokens: cost };
            const caps = readCapabilities(m, id);
            // OpenAI-compatible local/free catalogs often omit capability metadata;
            // keep general chat models eligible for advisory and drafting tasks.
            if (this.id === 'openwebui' || id.endsWith(':free')) {
              caps.push('reasoning', 'creative');
            }
            const inputFormat = (m as any).input_format || (m as any).inputFormat || (m as any).input_modalities;
            const outputFormat = (m as any).output_format || (m as any).outputFormat || (m as any).output_modalities;
            return {
              id,
              capabilities: caps,
              maxTokens: readContextWindow(m),
              costPer1kTokens: cost,
              inputFormat,
              outputFormat,
            };
          }).filter((m): m is ProviderModel => !!m);
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
    const pathSuggestion = `Set ${upperId}_CHAT_PATH or ${upperId}_COMPLETIONS_PATH${alt && alt !== upperId ? ` (or ${alt}_CHAT_PATH / ${alt}_COMPLETIONS_PATH)` : ''} env var to the provider's supported completion endpoint (e.g. /api/chat/completions, /completions).`;

    const buildBody = (model: string) => ({
      model,
      messages: req.messages,
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      input_format: (req as any).inputFormat,
      output_format: (req as any).outputFormat,
    });

    const tried: string[] = [];
    let triedCompletions = false;
    let res: Response | undefined;
    let lastStatus = 0;
    let lastText = '';
    let lastUrl = '';

    // Try the chat endpoint first. When the gateway does not serve that
    // route, the well-known OpenAI-compatible routes are probed before giving
    // up, and the one that answers is remembered for later calls.
    const chatCandidates = this.endpointCandidates(this.chatCompletionsPath, CHAT_PATH_CANDIDATES);
    for (const candidate of chatCandidates) {
      tried.push(candidate.url);
      const attempt = await fetchProvider(candidate.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(buildBody(req.model)),
      });
      if (attempt.ok) {
        res = attempt;
        this.rememberEndpoint(candidate.base, candidate.path, 'chat');
        break;
      }
      lastStatus = attempt.status;
      lastText = await (attempt.text ? attempt.text() : Promise.resolve(String(attempt)));
      lastUrl = candidate.url;
      // Only "this route does not exist" justifies probing another route.
      if (lastStatus !== 404 && lastStatus !== 405) break;
    }

    if (!res && lastStatus === 400 && /Model not found/i.test(lastText)) {
      // If the server returns 400 with a "Model not found" message, try to
      // discover available models and retry with a known model once.
      try {
        const available = await this.listModels();
        if (available && available.length > 0) {
          const fallbackModel = available[0].id;
          const retry = await fetchProvider(lastUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(buildBody(fallbackModel)),
          });
          if (retry.ok) {
            res = retry;
          }
        }
      } catch {
        // fall through to other fallback logic
      }
    }

    if (!res) {
      // The chat endpoint is not usable. Fall back to the legacy completions
      // endpoint when the server says the route is missing or unsupported.
      const wantsCompletions = lastStatus === 405 || lastStatus === 404
        || /Method Not Allowed/i.test(lastText) || /Not Found/i.test(lastText)
        || (lastStatus === 400 && /does not support chat|does not support/i.test(lastText));
      if (wantsCompletions) {
        triedCompletions = true;
        const prompt = req.messages.map((m: CompletionMessage) => `${m.role}: ${m.content}`).join('\n');
        const completionsCandidates = this.endpointCandidates(this.completionsPath, COMPLETIONS_PATH_CANDIDATES);
        for (const candidate of completionsCandidates) {
          tried.push(candidate.url);
          const attempt = await fetchProvider(candidate.url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model: req.model,
              prompt,
              max_tokens: req.maxTokens,
              temperature: req.temperature,
              input_format: (req as any).inputFormat,
              output_format: (req as any).outputFormat,
            }),
          });
          if (attempt.ok) {
            res = attempt;
            this.rememberEndpoint(candidate.base, candidate.path, 'completions');
            break;
          }
          lastStatus = attempt.status;
          lastText = await (attempt.text ? attempt.text() : Promise.resolve(String(attempt)));
          if (lastStatus !== 404 && lastStatus !== 405) break;
        }
      }
    }

    if (!res) {
      // Generic failure: timeouts (AbortError), 429 rate limits, 4xx/5xx, etc.
      // The env-var path suggestion is only meaningful for 404/405/"does not support chat"
      // cases, so it is intentionally NOT included here.
      const isRouteProblem = lastStatus === 404 || lastStatus === 405;
      const label = triedCompletions ? 'chat then completions' : 'chat';
      throw new Error(
        `[${this.id}] completion failed (${label}): ${lastStatus} ${lastText}`
        + (isRouteProblem ? `. Tried: ${tried.join(', ')}. ${pathSuggestion}` : ''),
      );
    }

    const data: any = await res.json();
    // Normalize response for both /chat/completions and /completions
    let content = '';
    let reasoning: string | undefined;
    if (data.choices && data.choices[0] && data.choices[0].message) {
      content = data.choices[0].message.content ?? '';
      // Extract the model's chain-of-thought / reasoning field, if present.
      // Reasoning-capable models (o1, o3-mini, OpenRouter reasoning models)
      // return a separate reasoning/thinking field alongside the final content.
      reasoning = firstNonEmptyString([
        data.choices[0].message.reasoning,
        data.choices[0].message.reasoning_content,
        data.reasoning,
        data.thought,
      ]);
      if (!content && data.choices[0].message.refusal) {
        throw new Error(`[${this.id}] model refused: ${data.choices[0].message.refusal}`);
      }
    } else if (data.choices && data.choices[0] && data.choices[0].text) {
      content = data.choices[0].text;
      reasoning = firstNonEmptyString([data.reasoning, data.thought]);
    } else if (data.output && Array.isArray(data.output) && data.output[0] && data.output[0].content) {
      content = data.output[0].content[0].text || '';
      reasoning = firstNonEmptyString([
        data.output[0].reasoning,
        data.output[0].reasoning_content,
        data.reasoning,
        data.thought,
      ]);
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
      reasoning: reasoning || undefined,
    };
  }
}
