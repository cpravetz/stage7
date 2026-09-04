import { ModelRouter, ModelDefinition } from './ModelRouter';
import { SemanticCache } from './SemanticCache';
import { ContextManager } from './ContextManager';
import { ContextChunk } from '../types/context';
import { StructuredOutputSampler } from './StructuredOutputSampler';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { buildProviderRegistry } from '../providers/registry';
import { LLMProvider, CompletionRequest, CompletionResponse } from '../providers/Provider';
import { CircuitBreaker } from '../utils/circuitBreaker';
import * as crypto from 'crypto';

export interface CompletionOptions {
  model?: string;
  provider?: string;
  schema?: z.ZodSchema;
  maxTokens?: number;
  budget?: number;
  systemPrompt?: string;
  temperature?: number;
}

export interface CompletionResult {
  content: string;
  model: string;
  provider: string;
  cached: boolean;
  tokensUsed?: number;
}

export class BrainService {
  private router = new ModelRouter();
  private cache = SemanticCache.getInstance();
  private context = new ContextManager();
  private providers: LLMProvider[] = [];
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  constructor() {
    this.providers = buildProviderRegistry();
    for (const p of this.providers) {
      this.registerProviderModels(p);
      this.circuitBreakers.set(p.id, new CircuitBreaker(5, 30000));
    }
    logger.info({ providers: this.providers.map((p) => p.id) }, 'Brain initialized with providers');
  }

  private registerProviderModels(provider: LLMProvider) {
    provider.listModels()
      .then((models) => {
        const defs: ModelDefinition[] = models.map((m) => ({
          id: m.id,
          provider: provider.id,
          costPer1kTokens: m.costPer1kTokens,
          maxTokens: m.maxTokens,
          capabilities: m.capabilities,
        }));
        this.router.registerModels(defs);
        logger.info({ provider: provider.id, count: defs.length }, 'Registered models from provider');
      })
      .catch((err) => {
        logger.warn({ provider: provider.id, err: err instanceof Error ? err.message : String(err) }, 'Failed to list provider models, using defaults');
      });
  }

  listProviders(): Array<{ id: string; name: string; hasApiKey: boolean; openAICompatible: boolean }> {
    return this.providers.map((p) => ({
      id: p.id,
      name: p.name,
      hasApiKey: p.info.hasApiKey,
      openAICompatible: p.info.openAICompatible,
    }));
  }

  registerModel(model: ModelDefinition) {
    this.router.registerModel(model);
  }

  listAvailableModels(): ModelDefinition[] {
    return this.router.listModels();
  }

  async complete(prompt: string, options: CompletionOptions = {}): Promise<CompletionResult> {
    const promptHash = crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 16);
    const systemHash = options.systemPrompt
      ? crypto.createHash('sha256').update(options.systemPrompt).digest('hex').slice(0, 8)
      : 'none';
    const cacheKey = `brain:complete:${options.model || 'auto'}:${options.provider || 'any'}:${promptHash}:${systemHash}`;

    const cached = await this.cache.get(cacheKey);
    if (cached) {
      logger.info({ cacheKey }, 'Cache hit');
      return { ...(cached as CompletionResult), cached: true };
    }

    const model = this.router.route({
      task: prompt,
      modelId: options.model,
      provider: options.provider,
      maxTokens: options.maxTokens ?? 1024,
      budget: options.budget,
    });

    const provider = this.providers.find((p) => p.id === model.provider);
    if (!provider) {
      throw new Error(`Provider ${model.provider} not found for model ${model.id}`);
    }
    if (!provider.isAvailable()) {
      throw new Error(`Provider ${provider.id} is not available (missing API key or endpoint)`);
    }

    const messages: CompletionRequest['messages'] = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const req: CompletionRequest = {
      model: model.id,
      messages,
      maxTokens: options.maxTokens ?? 1024,
      temperature: options.temperature,
    };

    logger.info({ provider: provider.id, model: model.id }, 'Dispatching completion');
    const breaker = this.circuitBreakers.get(provider.id);
    const response: CompletionResponse = await (breaker || new CircuitBreaker()).execute(async () => provider.complete(req));

    const result: CompletionResult = {
      content: response.content,
      model: response.model || model.id,
      provider: response.provider || provider.id,
      cached: false,
      tokensUsed: response.tokensUsed,
    };

    await this.cache.set(cacheKey, result);
    return result;
  }

  validateStructuredOutput<T>(schema: z.ZodSchema, data: unknown): T {
    const sampler = new StructuredOutputSampler(schema);
    return sampler.validate<T>(data);
  }

  getCacheStats() {
    return this.cache.stats();
  }

  getCircuitBreakerStats(): Array<{ provider: string; state: string; failures: number }> {
    return this.providers.map((p) => {
      const breaker = this.circuitBreakers.get(p.id);
      return {
        provider: p.id,
        state: breaker ? breaker.getState() : 'closed',
        failures: breaker ? breaker.getFailureCount() : 0,
      };
    });
  }
}
