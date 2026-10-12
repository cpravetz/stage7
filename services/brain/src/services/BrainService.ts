import { ModelRouter, ModelDefinition, ProviderHealth } from './ModelRouter';
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
  schema?: z.ZodSchema;
  maxTokens?: number;
  budget?: number;
  systemPrompt?: string;
  temperature?: number;
  missionId?: string;
  optimizeFor?: 'cost' | 'speed' | 'accuracy' | 'creativity' | 'balanced';
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
  estimatedCost?: number;
  modelIssue?: boolean;
  optimizeFor?: 'cost' | 'speed' | 'accuracy' | 'creativity' | 'balanced';
}

export interface ModelPerformanceMetrics {
  model: string;
  provider: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalLatencyMs: number;
  totalTokensUsed: number;
  totalCost: number;
  avgLatencyMs: number;
  successRate: number;
  avgCostPerRequest: number;
  lastUpdated: number;
}

const MAX_LOG_ENTRIES = 200;
const BRAIN_LOG_DOC_ID = 'brain-log-history';
const PERFORMANCE_METRICS_DOC_ID = 'model-performance-metrics';

function providerAttemptTimeoutMs(): number {
  const configured = Number(process.env.BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 310000;
}

async function withProviderTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`Provider attempt timed out after ${providerAttemptTimeoutMs()}ms`)), providerAttemptTimeoutMs());
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export class BrainService {
  private router = new ModelRouter();
  private cache = SemanticCache.getInstance();
  private context = new ContextManager();
  private providers: LLMProvider[] = [];
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private brainLog: BrainLogEntry[] = [];
  private llmSettingsCache: { freeModelsOnly: boolean; fetchedAt: number } | null = null;
  private LLMS_SETTINGS_TTL_MS = 30000; // 30 seconds

  // Track recently successful model+provider combinations to prioritize them
  private recentSuccesses: Map<string, number> = new Map();
  private readonly RECENT_SUCCESS_TTL_MS = 300000; // 5 minutes

  // Performance tracking - persisted to artifacts service
  private performanceMetricsCache: Map<string, ModelPerformanceMetrics> | null = null;
  private performanceCacheFetchedAt: number = 0;
  private readonly PERFORMANCE_CACHE_TTL_MS = 30000; // 30 seconds

  private initialized = false;

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    await Promise.all([
      this.loadPerformanceMetrics(),
      this.loadBrainLog(),
    ]);
    logger.info('Brain initialized with persisted history and metrics');
  }

  constructor() {
    this.providers = buildProviderRegistry();
    const defaultThreshold = Number(process.env.BRAIN_CIRCUIT_THRESHOLD) || 8;
    const defaultCooldown = Number(process.env.BRAIN_CIRCUIT_COOLDOWN_MS) || 60000; // 60s
    for (const p of this.providers) {
      this.registerProviderModels(p);
      this.circuitBreakers.set(p.id, new CircuitBreaker(defaultThreshold, defaultCooldown));
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

  private prioritizeRecentSuccesses(candidates: ModelDefinition[]): ModelDefinition[] {
    const now = Date.now();
    const recent = candidates
      .filter((m) => {
        const key = `${m.provider}:${m.id}`;
        const ts = this.recentSuccesses.get(key);
        return ts !== undefined && (now - ts) < this.RECENT_SUCCESS_TTL_MS;
      })
      .sort((a, b) => {
        const ka = `${a.provider}:${a.id}`;
        const kb = `${b.provider}:${b.id}`;
        return (this.recentSuccesses.get(kb) || 0) - (this.recentSuccesses.get(ka) || 0);
      });

    if (recent.length === 0) return candidates;

    // Move recently successful models to the front, keep the rest after
    const remaining = candidates.filter((m) => !recent.includes(m));
    return [...recent, ...remaining];
  }

  private recordSuccess(provider: string, model: string) {
    this.recentSuccesses.set(`${provider}:${model}`, Date.now());
  }

  private updateProviderHealth(provider: string, success: boolean) {
    const breaker = this.circuitBreakers.get(provider);
    const state = breaker?.getState() ?? 'closed';
    const failureCount = breaker?.getFailureCount() ?? 0;
    this.router.updateProviderHealth({
      provider,
      circuitState: state,
      failureCount,
      recentSuccess: success,
    });
  }

async complete(prompt: string, options: CompletionOptions = {}): Promise<CompletionResult> {
     const startTime = Date.now();
     const attemptTimeout = providerAttemptTimeoutMs();
     const maxRetries = 2;
     const configuredDeadline = Number(process.env.BRAIN_COMPLETION_DEADLINE_MS);
     const defaultDeadline = Math.max(attemptTimeout, Math.min(attemptTimeout * 3, 900000));
     const completionDeadline = startTime + (Number.isFinite(configuredDeadline) && configuredDeadline > 0 ? configuredDeadline : defaultDeadline);
     const promptPreview = prompt.slice(0, 120);

     const promptHash = crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 16);
    const systemHash = options.systemPrompt
      ? crypto.createHash('sha256').update(options.systemPrompt).digest('hex').slice(0, 8)
      : 'none';
    const cacheKey = `brain:complete:auto:${promptHash}:${systemHash}`;

    const cached = await this.cache.get(cacheKey);
    if (cached) {
      logger.info({ cacheKey }, 'Cache hit');
      const cachedResult = cached as CompletionResult;
      this.addLog({
        type: 'cache_hit',
        model: cachedResult.model,
        provider: cachedResult.provider,
        promptPreview,
        success: true,
        durationMs: Date.now() - startTime,
      });
      return { ...cachedResult, cached: true };
    }

    // Optionally consult llm-config for runtime preference to prefer free models
    const settings = await this.loadLlmSettings();

    // Build ordered candidate list and try providers/models until one succeeds.
    const routingOptions = {
      task: prompt,
      maxTokens: options.maxTokens ?? 1024,
      budget: options.budget,
      freeOnly: settings?.freeModelsOnly,
      optimizeFor: options.optimizeFor,
    };
    let candidates = this.router.getCandidates(routingOptions);

    // Reorder candidates to prioritize recently successful models
    const candidatesById = new Map(candidates.map((candidate) => [candidate.model.id, candidate]));
    candidates = this.prioritizeRecentSuccesses(candidates.map((candidate) => candidate.model))
      .flatMap((model) => {
        const candidate = candidatesById.get(model.id);
        return candidate ? [candidate] : [];
      });

    // If no candidates found and we were preferring free models, retry without that constraint.
    if ((!candidates || candidates.length === 0) && settings?.freeModelsOnly) {
      logger.warn({ task: prompt.slice(0, 80) }, 'No free-model candidates found; retrying with paid models allowed');
      const newCandidates = this.router.getCandidates({
        task: prompt,
        maxTokens: options.maxTokens ?? 1024,
        budget: options.budget,
        freeOnly: false,
        optimizeFor: options.optimizeFor,
      });
      candidates = newCandidates;
    }

    if (!candidates || candidates.length === 0) {
      // As a last-resort fallback, allow any free chat-capable model from free providers.
      const fallback = this.router.listModels().filter((m) => (m.costPer1kTokens === 0) && (m.capabilities.includes('chat') || m.capabilities.includes('creative')));
      if (fallback.length > 0) {
        logger.warn({ task: prompt.slice(0, 80), fallbackCount: fallback.length }, 'Using fallback free chat-capable models');
        candidates = fallback.map(m => ({ model: m, score: 0 }));
      }
    }

    if (!candidates || candidates.length === 0) {
      const errMsg = 'No model available for the requested task. Ensure at least one LLM provider is configured with a valid API key.';
      this.addLog({
        type: 'error',
        promptPreview,
        success: false,
        durationMs: Date.now() - startTime,
        error: errMsg,
      });
      throw new Error(errMsg);
    }

    let lastErr: unknown = null;
    let lastCandidate: { id: string; provider: string } | null = null;
    const reportedOpenCircuits = new Set<string>();
    const unavailableProviders = new Set<string>();
    let lastFailureWasLogged = false;
     const maxRetriesPerProvider = maxRetries;

    const messagesBase: CompletionRequest['messages'] = [];
    if (options.systemPrompt) messagesBase.push({ role: 'system', content: options.systemPrompt });
    messagesBase.push({ role: 'user', content: prompt });

    for (const candidate of candidates) {
      if (Date.now() >= completionDeadline) break;
      // Skip if there isn't enough time left to attempt this candidate at all.
      if (Date.now() + attemptTimeout > completionDeadline) break;
      const provider = this.providers.find((p) => p.id === candidate.model.provider);
      if (!provider) {
        logger.warn({ candidate }, 'Skipping candidate: provider not registered');
        continue;
      }
      if (!provider.isAvailable()) {
        logger.warn({ provider: provider.id }, 'Skipping candidate: provider not available');
        continue;
      }
      if (unavailableProviders.has(provider.id)) continue;

      const req: CompletionRequest = {
        model: candidate.model.id,
        messages: messagesBase,
        maxTokens: options.maxTokens ?? 1024,
        temperature: options.temperature,
      };

      logger.info({ provider: provider.id, model: candidate.model.id }, 'Dispatching completion (candidate)');
      lastCandidate = { id: candidate.model.id, provider: provider.id };
      const breaker = this.circuitBreakers.get(provider.id) || new CircuitBreaker(Number(process.env.BRAIN_CIRCUIT_THRESHOLD) || 8, Number(process.env.BRAIN_CIRCUIT_COOLDOWN_MS) || 60000);
      if (breaker.getState() === 'open') {
        const circuitError = new Error(
          `Provider temporarily unavailable after repeated failures. Retry in about ${Math.max(1, Math.ceil(breaker.getRemainingCooldownMs() / 1000))} seconds.`,
        );
        lastErr = circuitError;
        if (!reportedOpenCircuits.has(provider.id)) {
          this.addLog({
            type: 'error',
            model: candidate.model.id,
            provider: provider.id,
            promptPreview,
            success: false,
            durationMs: Date.now() - startTime,
            error: circuitError.message,
          });
          reportedOpenCircuits.add(provider.id);
          lastFailureWasLogged = true;
        }
        continue;
      }

      for (let attempt = 0; attempt < maxRetriesPerProvider; attempt++) {
        if (Date.now() >= completionDeadline) break;
        // Skip if there isn't enough time left to even start this attempt
        // (each attempt may take up to providerAttemptTimeoutMs).
        if (Date.now() + attemptTimeout > completionDeadline) break;
        try {
          const response: CompletionResponse = await withProviderTimeout(
            breaker.execute(async () => provider.complete(req)),
          );

          const result: CompletionResult = {
            content: response.content,
            model: response.model || candidate.model.id,
            provider: response.provider || provider.id,
            cached: false,
            tokensUsed: response.tokensUsed,
          };

          // estimate cost based on model's costPer1kTokens
          const estimatedCost = typeof response.tokensUsed === 'number' && typeof candidate.model.costPer1kTokens === 'number'
            ? (response.tokensUsed / 1000) * candidate.model.costPer1kTokens
            : undefined;

          this.addLog({
            type: 'completion',
            model: result.model,
            provider: result.provider,
            promptPreview,
            success: true,
            durationMs: Date.now() - startTime,
            tokensUsed: response.tokensUsed,
            estimatedCost,
          });

          // Record this provider/model as recently successful for prioritization
          this.recordSuccess(result.provider, result.model);

          // Update provider health in router
          this.updateProviderHealth(result.provider, true);

          // Record performance metrics
          await this.recordPerformanceMetrics(result.model, result.provider, Date.now() - startTime, response.tokensUsed, estimatedCost, true);

          await this.cache.set(cacheKey, result);

          // if missionId provided, append a cost_estimate event to artifacts persistence
          try {
            const missionId = (options as any).missionId as string | undefined;
            if (missionId) {
              const persistenceUrl = process.env.ARTIFACTS_URL || process.env.PERSISTENCE_URL || 'http://artifacts:4200';
              const event = {
                type: 'cost_estimate',
                timestamp: Date.now(),
                data: {
                  model: result.model,
                  provider: result.provider,
                  tokensUsed: response.tokensUsed,
                  estimatedCost,
                },
              };
              fetch(`${persistenceUrl}/api/artifacts/missions/${encodeURIComponent(missionId)}/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(event),
              }).catch((e) => logger.warn({ err: e instanceof Error ? e.message : String(e), missionId }, 'Failed to post cost event to artifacts'));
            }
          } catch (e) {
            logger.warn({ err: e instanceof Error ? e.message : String(e) }, 'Error while attempting to publish cost event');
          }
          return result;
        }         catch (err) {
          lastErr = err;
          lastFailureWasLogged = false;
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.warn({ provider: provider.id, model: candidate.model.id, attempt, err: errMsg }, 'Candidate attempt failed');

          // Model-specific errors: the specific model is invalid or misconfigured,
          // but other models on this provider may still work. Do NOT trip the
          // provider circuit breaker — just skip to the next candidate model.
          const isModelSpecific = /is not found for API version|model .* does not exist|model .* not found/i.test(errMsg)
            || /\b(404)\b/.test(errMsg);
          // classify error: provider-key / quota issues vs transient vs rate-limit
          const isProviderFatal = /key limit exceeded|quota exceeded|no remaining credits|insufficient credits|credit balance is too low|credits? exhausted|payment required|invalid api key|incorrect api key|authentication|unauthorized|no route for that uri|object identifier is invalid|invalid account|invalid endpoint|unauthorized account/i.test(errMsg)
            || /\b(401|402|403)\b/.test(errMsg);
          // 429 / rate-limit / too-many-requests: move to the next candidate model
          // (which may be on the same provider or a different one) rather than retrying
          // the same model, since retrying would just hit the same rate limit.
          const isRateLimit = /\b(429)\b/.test(errMsg) || /rate ?limit|too many requests|throttl/i.test(errMsg);
          // Timeout: the provider took longer than the per-attempt ceiling.
          // Retrying the same model almost always re-hits the same timeout, so
          // skip to the next candidate immediately instead of wasting time.
          const isTimeout = /timed out after \d+ms/i.test(errMsg);
          if (isTimeout) {
            logger.warn({ provider: provider.id, model: candidate.model.id, err: errMsg }, 'Provider timed out - trying next candidate');
            this.addLog({
              type: 'error',
              model: candidate.model.id,
              provider: provider.id,
              promptPreview,
              success: false,
              durationMs: Date.now() - startTime,
              error: errMsg,
            });
            this.updateProviderHealth(provider.id, false);
            break;
          }
          if (isProviderFatal) {
            unavailableProviders.add(provider.id);
            logger.error({ provider: provider.id, model: candidate.model.id, err: errMsg }, 'Provider configuration, credit, or quota error; skipping further attempts for this provider');
            try {
              const cb = this.circuitBreakers.get(provider.id);
              cb?.trip();
            } catch (e) {
              logger.warn({ e }, 'Failed to trip circuit-breaker for provider');
            }
            this.addLog({
              type: 'error',
              model: candidate.model.id,
              provider: provider.id,
              promptPreview,
              success: false,
              durationMs: Date.now() - startTime,
              error: errMsg,
              modelIssue: false,
            });
            this.updateProviderHealth(provider.id, false);
            lastFailureWasLogged = true;
            break;
          }
          if (isModelSpecific) {
            // Model-specific error (e.g. 404 for a specific model). Skip this model
            // but keep the provider active so other models on this provider can still be tried.
            logger.warn({ provider: provider.id, model: candidate.model.id, err: errMsg }, 'Model-specific error - skipping to next candidate');
            this.addLog({
              type: 'error',
              model: candidate.model.id,
              provider: provider.id,
              promptPreview,
              success: false,
              durationMs: Date.now() - startTime,
              error: errMsg,
              modelIssue: true,
            });
            this.updateProviderHealth(provider.id, false);
            lastFailureWasLogged = true;
            break;
          }
          if (isRateLimit) {
            // Rate-limited: do NOT retry the same model (backoff would just hit the
            // same limit). Move to the next candidate model immediately.
            logger.warn({ provider: provider.id, model: candidate.model.id, err: errMsg }, 'Model rate-limited - trying next candidate');
            this.addLog({
              type: 'error',
              model: candidate.model.id,
              provider: provider.id,
              promptPreview,
              success: false,
              durationMs: Date.now() - startTime,
              error: errMsg,
            });
            this.updateProviderHealth(provider.id, false);
            lastFailureWasLogged = true;
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
            model: candidate.model.id,
            provider: provider.id,
            promptPreview,
            success: false,
            durationMs: Date.now() - startTime,
            error: errMsg,
          });
          lastFailureWasLogged = true;
          break;
        }
      }
    }

    const finalErrMsg = lastErr instanceof Error ? lastErr.message : String(lastErr || 'All providers failed');

    const finalModel = lastCandidate?.id;
    const finalProvider = lastCandidate?.provider;

    // Record performance metrics for final failure
    if (finalModel && finalProvider) {
      await this.recordPerformanceMetrics(finalModel, finalProvider, Date.now() - startTime, undefined, undefined, false);
    }

    if (!lastFailureWasLogged) {
      this.addLog({
        type: 'error',
        model: finalModel,
        provider: finalProvider,
        promptPreview,
        success: false,
        durationMs: Date.now() - startTime,
        error: finalErrMsg,
      });
    }
    throw new Error(finalErrMsg);
  }

  private async loadLlmSettings(): Promise<{ freeModelsOnly: boolean } | null> {
    try {
      const now = Date.now();
      if (this.llmSettingsCache && now - this.llmSettingsCache.fetchedAt < this.LLMS_SETTINGS_TTL_MS) {
        return { freeModelsOnly: this.llmSettingsCache.freeModelsOnly };
      }
      const persistenceUrl = process.env.ARTIFACTS_URL || process.env.PERSISTENCE_URL || 'http://artifacts:4200';
      const res = await fetch(`${persistenceUrl}/api/artifacts/documents/llm-config`, { method: 'GET' });
      if (!res.ok) {
        return null;
      }
      const doc = await res.json() as { id?: string; tenantId?: string; collection?: string; data?: Record<string, unknown> };
      const free = !!(doc.data && typeof doc.data.freeModelsOnly === 'boolean' ? doc.data.freeModelsOnly : false);
      this.llmSettingsCache = { freeModelsOnly: free, fetchedAt: now };
      return { freeModelsOnly: free };
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Failed to load llm-config from artifacts');
      return null;
    }
  }

  private addLog(entry: Omit<BrainLogEntry, 'timestamp'>) {
    this.brainLog.unshift({ timestamp: new Date().toISOString(), ...entry });
    if (this.brainLog.length > MAX_LOG_ENTRIES) {
      this.brainLog = this.brainLog.slice(0, MAX_LOG_ENTRIES);
    }
    this.saveBrainLog().catch((e) => logger.warn({ err: e instanceof Error ? e.message : String(e) }, 'Failed to persist brain log'));
  }

  private getArtifactsUrl(): string {
    return process.env.ARTIFACTS_URL || process.env.PERSISTENCE_URL || 'http://artifacts:4200';
  }

  private async loadPerformanceMetrics(): Promise<Map<string, ModelPerformanceMetrics>> {
    const now = Date.now();
    if (this.performanceMetricsCache && now - this.performanceCacheFetchedAt < this.PERFORMANCE_CACHE_TTL_MS) {
      return this.performanceMetricsCache;
    }
    try {
      const persistenceUrl = this.getArtifactsUrl();
      const res = await fetch(`${persistenceUrl}/api/artifacts/documents/model-performance-metrics`, { method: 'GET' });
      if (!res.ok) {
        this.performanceMetricsCache = new Map();
        this.performanceCacheFetchedAt = now;
        return this.performanceMetricsCache;
      }
      const doc = await res.json() as { data?: Record<string, unknown> };
      const metricsMap = new Map<string, ModelPerformanceMetrics>();
      if (doc.data && typeof doc.data === 'object') {
        for (const [key, value] of Object.entries(doc.data)) {
          metricsMap.set(key, value as ModelPerformanceMetrics);
        }
      }
      this.performanceMetricsCache = metricsMap;
      this.performanceCacheFetchedAt = now;
      return metricsMap;
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Failed to load performance metrics from artifacts');
      this.performanceMetricsCache = new Map();
      this.performanceCacheFetchedAt = now;
      return this.performanceMetricsCache;
    }
  }

private async savePerformanceMetrics(metrics: Map<string, ModelPerformanceMetrics>): Promise<void> {
    try {
      const persistenceUrl = this.getArtifactsUrl();
      const data: Record<string, ModelPerformanceMetrics> = {};
      for (const [key, value] of metrics.entries()) {
        data[key] = value;
      }
      await fetch(`${persistenceUrl}/api/artifacts/documents/model-performance-metrics`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Failed to save performance metrics to artifacts');
    }
  }

  private async loadBrainLog(): Promise<void> {
    try {
      const persistenceUrl = this.getArtifactsUrl();
      const res = await fetch(`${persistenceUrl}/api/artifacts/documents/${BRAIN_LOG_DOC_ID}`, { method: 'GET' });
      if (!res.ok) return;
      const doc = await res.json() as { data?: { entries?: BrainLogEntry[] } };
      if (doc.data && Array.isArray(doc.data.entries)) {
        this.brainLog = doc.data.entries.slice(0, MAX_LOG_ENTRIES);
      }
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Failed to load brain log from artifacts');
    }
  }

  private async saveBrainLog(): Promise<void> {
    try {
      const persistenceUrl = this.getArtifactsUrl();
      await fetch(`${persistenceUrl}/api/artifacts/documents/${BRAIN_LOG_DOC_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { entries: this.brainLog } }),
      });
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Failed to save brain log to artifacts');
    }
  }

  private async recordPerformanceMetrics(model: string, provider: string, latencyMs: number, tokensUsed: number | undefined, cost: number | undefined, success: boolean) {
    const key = `${provider}:${model}`;
    const now = Date.now();
    const metricsMap = await this.loadPerformanceMetrics();
    let metrics = metricsMap.get(key);
    
    if (!metrics) {
      metrics = {
        model,
        provider,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalLatencyMs: 0,
        totalTokensUsed: 0,
        totalCost: 0,
        avgLatencyMs: 0,
        successRate: 0,
        avgCostPerRequest: 0,
        lastUpdated: now,
      };
      metricsMap.set(key, metrics);
    }
    
    metrics.totalRequests++;
    metrics.totalLatencyMs += latencyMs;
    metrics.avgLatencyMs = metrics.totalLatencyMs / metrics.totalRequests;
    
    if (tokensUsed) {
      metrics.totalTokensUsed += tokensUsed;
    }
    if (cost) {
      metrics.totalCost += cost;
      metrics.avgCostPerRequest = metrics.totalCost / metrics.totalRequests;
    }
    
    if (success) {
      metrics.successfulRequests++;
    } else {
      metrics.failedRequests++;
    }
    metrics.successRate = metrics.successfulRequests / metrics.totalRequests;
    metrics.lastUpdated = now;
    
    await this.savePerformanceMetrics(metricsMap);
    // Update local cache
    this.performanceMetricsCache = metricsMap;
  }

  async getPerformanceMetrics(): Promise<ModelPerformanceMetrics[]> {
    const metricsMap = await this.loadPerformanceMetrics();
    return Array.from(metricsMap.values())
      .sort((a, b) => b.totalRequests - a.totalRequests);
  }

  async getPerformanceMetricsForModel(model: string, provider: string): Promise<ModelPerformanceMetrics | undefined> {
    const metricsMap = await this.loadPerformanceMetrics();
    return metricsMap.get(`${provider}:${model}`);
  }

  async clearPerformanceMetrics(): Promise<void> {
    const emptyMap = new Map<string, ModelPerformanceMetrics>();
    await this.savePerformanceMetrics(emptyMap);
    this.performanceMetricsCache = emptyMap;
    this.performanceCacheFetchedAt = 0;
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
