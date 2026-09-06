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

export interface BrainLogEntry {
  timestamp: string;
  type: 'completion' | 'cache_hit' | 'error';
  model?: string;
  provider?: string;
  promptPreview?: string;
  success: boolean;
  durationMs?: number;
  error?: string;
  tokensUsed?: number;
}

const MAX_LOG_ENTRIES = 200;

export class BrainService {
  private router = new ModelRouter();
  private cache = SemanticCache.getInstance();
  private context = new ContextManager();
  private providers: LLMProvider[] = [];
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private brainLog: BrainLogEntry[] = [];

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
    const startTime = Date.now();
    const modelIdOpt = options.model || 'auto';
    const providerOpt = options.provider || 'any';
    const promptPreview = prompt.slice(0, 120);

    const promptHash = crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 16);
    const systemHash = options.systemPrompt
      ? crypto.createHash('sha256').update(options.systemPrompt).digest('hex').slice(0, 8)
      : 'none';
    const cacheKey = `brain:complete:${modelIdOpt}:${providerOpt}:${promptHash}:${systemHash}`;

    const cached = await this.cache.get(cacheKey);
    if (cached) {
      logger.info({ cacheKey }, 'Cache hit');
      this.addLog({
        type: 'cache_hit',
        model: modelIdOpt,
        provider: providerOpt,
        promptPreview,
        success: true,
        durationMs: Date.now() - startTime,
      });
      return { ...(cached as CompletionResult), cached: true };
    }

    // Build ordered candidate list and try providers/models until one succeeds.
    const candidates = this.router.getCandidates({
      task: prompt,
      modelId: options.model,
      provider: options.provider,
      maxTokens: options.maxTokens ?? 1024,
      budget: options.budget,
    });

    if (!candidates || candidates.length === 0) {
      const errMsg = 'No model available for the requested task. Ensure at least one LLM provider is configured with a valid API key.';
      this.addLog({
        type: 'error',
        model: options.model || 'auto',
        provider: options.provider || 'any',
        promptPreview,
        success: false,
        durationMs: Date.now() - startTime,
        error: errMsg,
      });
      throw new Error(errMsg);
    }

    let lastErr: unknown = null;
    const maxRetriesPerProvider = 2;

    const messagesBase: CompletionRequest['messages'] = [];
    if (options.systemPrompt) messagesBase.push({ role: 'system', content: options.systemPrompt });
    messagesBase.push({ role: 'user', content: prompt });

    for (const candidate of candidates) {
      const provider = this.providers.find((p) => p.id === candidate.provider);
      if (!provider) {
        logger.warn({ candidate }, 'Skipping candidate: provider not registered');
        continue;
      }
      if (!provider.isAvailable()) {
        logger.warn({ provider: provider.id }, 'Skipping candidate: provider not available');
        continue;
      }

      const req: CompletionRequest = {
        model: candidate.id,
        messages: messagesBase,
        maxTokens: options.maxTokens ?? 1024,
        temperature: options.temperature,
      };

      logger.info({ provider: provider.id, model: candidate.id }, 'Dispatching completion (candidate)');
      const breaker = this.circuitBreakers.get(provider.id) || new CircuitBreaker();

      for (let attempt = 0; attempt < maxRetriesPerProvider; attempt++) {
        try {
          const response: CompletionResponse = await breaker.execute(async () => provider.complete(req));

          const result: CompletionResult = {
            content: response.content,
            model: response.model || candidate.id,
            provider: response.provider || provider.id,
            cached: false,
            tokensUsed: response.tokensUsed,
          };

          this.addLog({
            type: 'completion',
            model: result.model,
            provider: result.provider,
            promptPreview,
            success: true,
            durationMs: Date.now() - startTime,
            tokensUsed: response.tokensUsed,
          });

          await this.cache.set(cacheKey, result);
          return result;
        } catch (err) {
          lastErr = err;
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.warn({ provider: provider.id, model: candidate.id, attempt, err: errMsg }, 'Candidate attempt failed');

          // classify error: provider-key / quota issues vs transient
          const isKeyLimit = /key limit exceeded|limit exceeded|quota exceeded/i.test(errMsg) || /\b403\b/.test(errMsg);
          if (isKeyLimit) {
            // provider-level fatal: remove provider models from router and stop trying this provider
            logger.error({ provider: provider.id, err: errMsg }, 'Provider key/quota error - removing provider models from router');
            try {
              this.router.removeProviderModels(provider.id);
            } catch (e) {
              logger.warn({ e }, 'Failed to remove provider models');
            }
            this.addLog({
              type: 'error',
              model: candidate.id,
              provider: provider.id,
              promptPreview,
              success: false,
              durationMs: Date.now() - startTime,
              error: errMsg,
            });
            // break out to next candidate
            break;
          }

          // transient: backoff a little then retry this provider (if attempts remain)
          if (attempt < maxRetriesPerProvider - 1) {
            const backoffMs = 250 * (attempt + 1);
            await new Promise((res) => setTimeout(res, backoffMs));
            continue;
          }

          // exhausted attempts for this candidate; log and try next candidate
          this.addLog({
            type: 'error',
            model: candidate.id,
            provider: provider.id,
            promptPreview,
            success: false,
            durationMs: Date.now() - startTime,
            error: errMsg,
          });
          break;
        }
      }
    }

    const finalErrMsg = lastErr instanceof Error ? lastErr.message : String(lastErr || 'All providers failed');
    this.addLog({
      type: 'error',
      model: options.model || 'auto',
      provider: options.provider || 'any',
      promptPreview,
      success: false,
      durationMs: Date.now() - startTime,
      error: finalErrMsg,
    });
    throw new Error(finalErrMsg);
  }

  private addLog(entry: Omit<BrainLogEntry, 'timestamp'>) {
    this.brainLog.unshift({ timestamp: new Date().toISOString(), ...entry });
    if (this.brainLog.length > MAX_LOG_ENTRIES) {
      this.brainLog = this.brainLog.slice(0, MAX_LOG_ENTRIES);
    }
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

  getLogs(): BrainLogEntry[] {
    return this.brainLog;
  }
}
