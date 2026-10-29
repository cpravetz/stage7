import { ModelRouter, ModelDefinition } from './ModelRouter';
import { SemanticCache } from './SemanticCache';
import { ContextManager } from './ContextManager';
import { StructuredOutputSampler } from './StructuredOutputSampler';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { buildProviderRegistry } from '../providers/registry';
import { LLMProvider, CompletionRequest, CompletionResponse } from '../providers/Provider';
import { CircuitBreaker } from '../utils/circuitBreaker';
import * as crypto from 'crypto';
import {
  BRAIN_MODEL_SELECTION_EXHAUSTED,
  BRAIN_MODEL_SELECTION_RETRY,
} from '@stage7-nextgen/shared';
import { BrainError } from '../utils/errors';
import { providerTimeoutMs } from '../utils/providerFetch';
import { EntityMemoryStore } from './EntityMemoryStore';

export interface CompletionOptions {
  schema?: z.ZodSchema;
  maxTokens?: number;
  budget?: number;
  systemPrompt?: string;
  temperature?: number;
  missionId?: string;
  optimizeFor?: 'cost' | 'speed' | 'accuracy' | 'creativity' | 'balanced';
  routingSessionId?: string;
  entityId?: string;
  assistantId?: string;
  tenantId?: string;
  inputFormat?: string;
  outputFormat?: string;
}

export interface CompletionResult {
  content: string;
  model: string;
  provider: string;
  cached: boolean;
  tokensUsed?: number;
  requestId: string;
  reasoning?: string;
}

export interface BrainLogEntry {
  timestamp: string;
  type: 'completion' | 'cache_hit' | 'error';
  model?: string;
  provider?: string;
  promptPreview?: string;
  prompt?: string;
  content?: string;
  missionId?: string;
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
  costRequests?: number;
  complaintCount: number;
  complaintRate: number;
  lastUpdated: number;
}

interface ModelRoutingSession {
  attemptedModelIds: Set<string>;
  updatedAt: number;
}

const MAX_LOG_ENTRIES = 200;
const MODEL_ROUTING_SESSION_TTL_MS = 60 * 60 * 1000;
const MAX_MODEL_ROUTING_SESSIONS = 1000;

function modelRoutingKey(model: Pick<ModelDefinition, 'id' | 'provider'>): string {
  return `${model.provider}:${model.id}`;
}

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
  private modelCatalogReady: Promise<void>;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private brainLog: BrainLogEntry[] = [];
  private modelRoutingSessions = new Map<string, ModelRoutingSession>();
  private llmSettingsCache: { freeModelsOnly: boolean; fetchedAt: number } | null = null;
  private LLMS_SETTINGS_TTL_MS = 30000; // 30 seconds

  // Performance tracking - persisted to artifacts service
  private performanceMetricsCache: Map<string, ModelPerformanceMetrics> | null = null;
  private performanceCacheFetchedAt: number = 0;
  private readonly PERFORMANCE_CACHE_TTL_MS = 30000; // 30 seconds

  private initialized = false;

  // Request ID -> {provider, model} mapping for complaints
  private requestIdMap = new Map<string, { provider: string; model: string; complaintRecorded?: boolean; routingSessionKey?: string }>();

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    await Promise.all([
      this.modelCatalogReady,
      this.loadPerformanceMetrics(),
      this.loadBrainLog(),
    ]);
    this.router.setPerformanceMetrics(this.performanceMetricsCache || new Map());
    logger.info('Brain initialized with persisted history and metrics');
  }

  constructor() {
    this.providers = buildProviderRegistry();
    const defaultThreshold = Number(process.env.BRAIN_CIRCUIT_THRESHOLD) || 8;
    const defaultCooldown = Number(process.env.BRAIN_CIRCUIT_COOLDOWN_MS) || 60000; // 60s
    for (const p of this.providers) {
      this.circuitBreakers.set(p.id, new CircuitBreaker(defaultThreshold, defaultCooldown));
    }
    this.modelCatalogReady = Promise.all(this.providers.map((provider) => this.registerProviderModels(provider)))
      .then(() => undefined);
    logger.info({ providers: this.providers.map((p) => p.id) }, 'Brain initialized with providers');
  }

  private async registerProviderModels(provider: LLMProvider): Promise<void> {
    try {
      const models = await provider.listModels();
      const defs: ModelDefinition[] = models.map((m) => ({
          id: m.id,
          provider: provider.id,
          costPer1kTokens: m.costPer1kTokens,
          maxTokens: m.maxTokens,
          capabilities: m.capabilities,
          inputFormat: m.inputFormat,
          outputFormat: m.outputFormat,
      }));
      this.router.registerModels(defs);
      logger.info({ provider: provider.id, count: defs.length }, 'Registered models from provider');
    } catch (err) {
      logger.warn({ provider: provider.id, err: err instanceof Error ? err.message : String(err) }, 'Failed to list provider models, using defaults');
    }
  }

  private getRoutingSession(sessionId: string): ModelRoutingSession {
    const now = Date.now();
    for (const [key, session] of this.modelRoutingSessions) {
      if (now - session.updatedAt > MODEL_ROUTING_SESSION_TTL_MS) {
        this.modelRoutingSessions.delete(key);
      }
    }

    let session = this.modelRoutingSessions.get(sessionId);
    if (!session) {
      if (this.modelRoutingSessions.size >= MAX_MODEL_ROUTING_SESSIONS) {
        const oldest = Array.from(this.modelRoutingSessions.entries())
          .sort((left, right) => left[1].updatedAt - right[1].updatedAt)[0];
        if (oldest) this.modelRoutingSessions.delete(oldest[0]);
      }
      session = { attemptedModelIds: new Set(), updatedAt: now };
      this.modelRoutingSessions.set(sessionId, session);
    }
    session.updatedAt = now;
    return session;
  }

  private recordRoutingSessionAttempts(sessionId: string | undefined, modelIds: Iterable<string>): void {
    if (!sessionId) return;
    const session = this.getRoutingSession(sessionId);
    for (const modelId of modelIds) session.attemptedModelIds.add(modelId);
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
     let systemPrompt = options.systemPrompt;
     if (options.entityId) {
       const memories = await EntityMemoryStore.getInstance().getActive(
         options.entityId,
         options.assistantId,
         options.tenantId,
       );
       const memoryNudge = this.context.formatMemoryNudges(memories);
       if (memoryNudge) systemPrompt = [memoryNudge, systemPrompt].filter(Boolean).join('\n\n');
     }
     const requestId = `brain_${startTime}_${crypto.randomBytes(6).toString('hex')}`;
     const attemptTimeout = providerAttemptTimeoutMs();
     // A candidate attempt cannot cost more than the lower of the two
     // ceilings: the provider fetch timeout fires before the attempt ceiling,
     // so the completion deadline has to be budgeted against that smaller
     // cost. Budgeting against the attempt ceiling alone made the deadline
     // fit fewer candidates than it was meant to, and the leftover budget
     // then expired between candidates instead of paying for another one.
     const attemptCostMs = Math.min(attemptTimeout, providerTimeoutMs());
     const maxRetries = 2;
     const configuredDeadline = Number(process.env.BRAIN_COMPLETION_DEADLINE_MS);
     const defaultDeadline = Math.max(attemptTimeout, Math.min(attemptTimeout * 3, 900000));
     const completionDeadline = startTime + (Number.isFinite(configuredDeadline) && configuredDeadline > 0 ? configuredDeadline : defaultDeadline);
     const promptPreview = prompt.slice(0, 120);

     const promptHash = crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 16);
    const systemHash = systemPrompt
      ? crypto.createHash('sha256').update(systemPrompt).digest('hex').slice(0, 8)
      : 'none';
    const formatHash = `${(options as any).inputFormat || 'none'}:${(options as any).outputFormat || 'none'}`;
    const cacheKey = `brain:complete:auto:${promptHash}:${systemHash}:${formatHash}`;
    const routingSessionId = options.routingSessionId?.trim();
    const routingSessionKey = routingSessionId
     ? `${options.missionId || 'brain'}:${routingSessionId}`
     : undefined;

    const cached = routingSessionKey ? null : await this.cache.get(cacheKey);
    if (cached) {
      logger.info({ cacheKey }, 'Cache hit');
      const cachedResult = cached as CompletionResult;
      this.addLog({
        type: 'cache_hit',
        model: cachedResult.model,
        provider: cachedResult.provider,
        promptPreview,
        prompt,
        content: cachedResult.content,
        missionId: options.missionId,
        success: true,
        durationMs: Date.now() - startTime,
      });
      // Ensure requestId mapping exists for cached responses
      if (cachedResult.requestId) {
        if (!this.requestIdMap.has(cachedResult.requestId)) {
          this.requestIdMap.set(cachedResult.requestId, { provider: cachedResult.provider, model: cachedResult.model });
        }
      }
      return { ...cachedResult, cached: true };
    }

    await this.modelCatalogReady;
    this.router.setPerformanceMetrics(await this.loadPerformanceMetrics());

    // Optionally consult llm-config for runtime preference to prefer free models
    const settings = await this.loadLlmSettings();

      const routingOptions = {
        task: prompt,
        maxTokens: options.maxTokens ?? 1024,
        budget: options.budget,
        freeOnly: settings?.freeModelsOnly,
        optimizeFor: options.optimizeFor,
        inputFormat: options.inputFormat,
        outputFormat: options.outputFormat,
      };
    const eligibleCandidates = this.router.getCandidates(routingOptions);
    const session = routingSessionKey ? this.getRoutingSession(routingSessionKey) : undefined;
    const attemptedModelIds = new Set(session?.attemptedModelIds || []);
    const attemptedThisCall = new Set<string>();
    const candidates = this.router.getCandidates({
      ...routingOptions,
      excludedModelIds: attemptedModelIds,
    });

    if (!candidates || candidates.length === 0) {
      if (routingSessionKey) {
        const attemptedEligibleModelCount = eligibleCandidates
          .filter((candidate) => attemptedModelIds.has(modelRoutingKey(candidate.model))).length;
        const reason = eligibleCandidates.length === 0
          ? 'No models are eligible under the current Brain settings'
          : `All ${eligibleCandidates.length} eligible models have already been tried`;
        const error = new BrainError(`${reason}${settings?.freeModelsOnly ? ' (free models only is enabled)' : ''}.`, 503, {
          code: BRAIN_MODEL_SELECTION_EXHAUSTED,
          eligibleModelCount: eligibleCandidates.length,
          attemptedModelCount: attemptedEligibleModelCount,
          freeModelsOnly: settings?.freeModelsOnly === true,
        });
        this.addLog({
          type: 'error',
          promptPreview,
          missionId: options.missionId,
          success: false,
          durationMs: Date.now() - startTime,
          error: error.message,
        });
        throw error;
      }
      const errMsg = 'No model available for the requested task under the current Brain settings. Ensure an eligible LLM provider is configured.';
      this.addLog({
        type: 'error',
        promptPreview,
        missionId: options.missionId,
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
    if (systemPrompt) messagesBase.push({ role: 'system', content: systemPrompt });
    messagesBase.push({ role: 'user', content: prompt });

    for (const candidate of candidates) {
      if (Date.now() >= completionDeadline) {
        lastErr = new Error('Brain completion deadline expired before the next eligible model could be attempted');
        break;
      }
      // Skip if there isn't enough time left to attempt this candidate at all.
      if (Date.now() + attemptCostMs > completionDeadline) {
        lastErr = new Error('Brain completion deadline did not leave enough time for the next eligible model attempt');
        break;
      }
      const routingKey = modelRoutingKey(candidate.model);
      const provider = this.providers.find((p) => p.id === candidate.model.provider);
      if (!provider) {
        lastErr = new Error(`Provider '${candidate.model.provider}' is not registered`);
        logger.warn({ candidate }, 'Skipping candidate: provider not registered');
        continue;
      }
      if (!provider.isAvailable()) {
        lastErr = new Error(`Provider '${provider.id}' is not available`);
        logger.warn({ provider: provider.id }, 'Skipping candidate: provider not available');
        continue;
      }
      if (unavailableProviders.has(provider.id)) continue;

      const req: CompletionRequest = {
        model: candidate.model.id,
        messages: messagesBase,
        maxTokens: options.maxTokens ?? 1024,
        temperature: options.temperature,
        inputFormat: options.inputFormat,
        outputFormat: options.outputFormat,
      };

      const candidateStartTime = Date.now();
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
            missionId: options.missionId,
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
        if (Date.now() + attemptCostMs > completionDeadline) break;
        try {
          attemptedModelIds.add(routingKey);
          attemptedThisCall.add(routingKey);
          const response: CompletionResponse = await withProviderTimeout(provider.complete(req));
          breaker.recordSuccess();

          const result: CompletionResult = {
            content: response.content,
            model: response.model || candidate.model.id,
            provider: response.provider || provider.id,
            cached: false,
            tokensUsed: response.tokensUsed,
            requestId,
            reasoning: response.reasoning,
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
            prompt,
            content: result.content,
            missionId: options.missionId,
            success: true,
            durationMs: Date.now() - startTime,
            tokensUsed: response.tokensUsed,
            estimatedCost,
          });

          // Update provider health in router
          this.updateProviderHealth(result.provider, true);
          // Keep failed candidates excluded, but allow a model that answered successfully to serve later turns.
          this.recordRoutingSessionAttempts(
            routingSessionKey,
            Array.from(attemptedThisCall).filter((attemptedModelId) => attemptedModelId !== routingKey),
          );

          // Record performance metrics
          await this.recordPerformanceMetrics(result.model, result.provider, Date.now() - candidateStartTime, response.tokensUsed, estimatedCost, true);

          // Record request ID mapping for complaint tracking
          this.requestIdMap.set(requestId, { provider: result.provider, model: result.model, routingSessionKey });

          if (!routingSessionKey) await this.cache.set(cacheKey, result);

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
          //
          // A 403 is scoped to the model in the common case: the model is
          // gated, unavailable, or not permitted for this account, while the
          // provider itself keeps working for every other model. Treating it
          // as provider-wide takes the whole provider's catalogue down with a
          // single unusable model, so only a denial that names neither the
          // model nor the endpoint is treated as provider-wide.
          const mentionsModel = /\bmodels?\b/i.test(errMsg);
          const isProviderAccessDenied = /\b403\b/.test(errMsg)
            && !mentionsModel
            && /(your (?:api )?key|your account|your organization|your org\b|this key|not authorized|unauthorized|api key .*(?:not|invalid)|not allowed to use|permission to use)/i.test(errMsg);
          const isModelSpecific = /is not found for API version|model .* does not exist|model .* not found/i.test(errMsg)
            || /\b(404)\b/.test(errMsg)
            || (/\b403\b/.test(errMsg) && !isProviderAccessDenied);
          // classify error: provider-key / quota issues vs transient vs rate-limit
          const isProviderFatal = /key limit exceeded|quota exceeded|no remaining credits|insufficient credits|credit balance is too low|credits? exhausted|payment required|invalid api key|incorrect api key|authentication|unauthorized|no route for that uri|object identifier is invalid|invalid account|invalid endpoint|unauthorized account/i.test(errMsg)
            || /\b(401|402)\b/.test(errMsg)
            || isProviderAccessDenied;
          // 429 / rate-limit / too-many-requests: move to the next candidate model
          // (which may be on the same provider or a different one) rather than retrying
          // the same model, since retrying would just hit the same rate limit.
          const isRateLimit = /\b(429)\b/.test(errMsg) || /rate ?limit|too many requests|throttl/i.test(errMsg);
          // Timeout: the provider took longer than the per-attempt ceiling.
          // Retrying the same model almost always re-hits the same timeout, so
          // skip to the next candidate immediately instead of wasting time.
          const isTimeout = /timed out after \d+ms/i.test(errMsg);
          if (isTimeout) {
            breaker.recordFailure();
            logger.warn({ provider: provider.id, model: candidate.model.id, err: errMsg }, 'Provider timed out - trying next candidate');
            this.addLog({
              type: 'error',
              model: candidate.model.id,
              provider: provider.id,
              promptPreview,
              missionId: options.missionId,
              success: false,
              durationMs: Date.now() - startTime,
              error: errMsg,
            });
            this.updateProviderHealth(provider.id, false);
            await this.recordPerformanceMetrics(candidate.model.id, provider.id, Date.now() - candidateStartTime, undefined, undefined, false);
            // Keep the model in the routing session's attempted set so the next
            // turn rotates to a different eligible model instead of repeating
            // the same slow provider until the completion deadline expires. A
            // later routing session can still use this model.
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
              missionId: options.missionId,
              success: false,
              durationMs: Date.now() - startTime,
              error: errMsg,
              modelIssue: false,
            });
            this.updateProviderHealth(provider.id, false);
            await this.recordPerformanceMetrics(candidate.model.id, provider.id, Date.now() - candidateStartTime, undefined, undefined, false);
            lastFailureWasLogged = true;
            break;
          }
          if (isModelSpecific) {
            // A model-level denial confirms the provider responded; it must not
            // contribute to provider-wide health or leave a half-open circuit.
            breaker.reset();
            // Model-specific error (e.g. 404 for a specific model). Skip this model
            // but keep the provider active so other models on this provider can still be tried.
            logger.warn({ provider: provider.id, model: candidate.model.id, err: errMsg }, 'Model-specific error - skipping to next candidate');
            this.addLog({
              type: 'error',
              model: candidate.model.id,
              provider: provider.id,
              promptPreview,
              missionId: options.missionId,
              success: false,
              durationMs: Date.now() - startTime,
              error: errMsg,
              modelIssue: true,
            });
            this.updateProviderHealth(provider.id, false);
            await this.recordPerformanceMetrics(candidate.model.id, provider.id, Date.now() - candidateStartTime, undefined, undefined, false);
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
              missionId: options.missionId,
              success: false,
              durationMs: Date.now() - startTime,
              error: errMsg,
            });
            this.updateProviderHealth(provider.id, false);
            await this.recordPerformanceMetrics(candidate.model.id, provider.id, Date.now() - candidateStartTime, undefined, undefined, false);
            lastFailureWasLogged = true;
            // Keep the model in the routing session's attempted set so the next
            // turn rotates to a different eligible model rather than retrying a
            // rate-limited provider until the completion deadline expires.
            break;
          }

          // transient: backoff a little then retry this provider (if attempts remain)
          breaker.recordFailure();
          if (attempt < maxRetriesPerProvider - 1) {
            const backoffMs = 250 * (attempt + 1);
            await new Promise((res) => setTimeout(res, backoffMs));
            continue;
          }

          // exhausted attempts for this candidate; log and try next candidate
          await this.recordPerformanceMetrics(candidate.model.id, provider.id, Date.now() - candidateStartTime, undefined, undefined, false);
          this.addLog({
            type: 'error',
            model: candidate.model.id,
            provider: provider.id,
            promptPreview,
            missionId: options.missionId,
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

    if (!lastFailureWasLogged) {
      this.addLog({
        type: 'error',
        model: finalModel,
        provider: finalProvider,
        promptPreview,
        missionId: options.missionId,
        success: false,
        durationMs: Date.now() - startTime,
        error: finalErrMsg,
      });
    }
    if (routingSessionKey) {
      this.recordRoutingSessionAttempts(routingSessionKey, attemptedModelIds);
      const attemptedEligibleModelCount = eligibleCandidates
        .filter((candidate) => attemptedModelIds.has(modelRoutingKey(candidate.model))).length;
      const remainingModelCount = eligibleCandidates.length - attemptedEligibleModelCount;
      const code = remainingModelCount === 0
        ? BRAIN_MODEL_SELECTION_EXHAUSTED
        : BRAIN_MODEL_SELECTION_RETRY;
      const message = remainingModelCount === 0
        ? `Every eligible model was tried, but none completed the request. Last provider error: ${finalErrMsg}`
        : `Brain could not complete the request yet; ${remainingModelCount} eligible model(s) remain untried. Last provider error: ${finalErrMsg}`;
      // While eligible models remain, this call is a routing decision and not a
      // verdict: the caller retries, the routing session hands it a model that
      // has not been tried yet, and the next call gets a fresh deadline. Only
      // an exhausted model set is reported as a terminal failure.
      throw new BrainError(message, 503, {
        code,
        eligibleModelCount: eligibleCandidates.length,
        attemptedModelCount: attemptedEligibleModelCount,
        remainingModelCount,
        freeModelsOnly: settings?.freeModelsOnly === true,
        deadlineExpired: Date.now() >= completionDeadline,
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
        // A missing or unreachable llm-config means the "free models only"
        // preference is unknown. Say so, instead of silently routing to paid
        // models while the operator believes the restriction is active.
        if (res.status === 404) {
          logger.warn('llm-config not found; model selection is not restricted to free models');
        } else {
          logger.warn({ status: res.status }, 'Failed to read llm-config; model selection is not restricted to free models');
        }
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
    const logEntry = { timestamp: new Date().toISOString(), ...entry };
    this.brainLog.unshift(logEntry);
    if (this.brainLog.length > MAX_LOG_ENTRIES) {
      this.brainLog = this.brainLog.slice(0, MAX_LOG_ENTRIES);
    }
    this.saveBrainLog(logEntry).catch((e) => logger.warn({ err: e instanceof Error ? e.message : String(e) }, 'Failed to persist brain log'));
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
      const res = await fetch(`${persistenceUrl}/api/artifacts/brain/performance-metrics`, { method: 'GET' });
      if (!res.ok) {
        this.performanceMetricsCache = new Map();
        this.performanceCacheFetchedAt = now;
        return this.performanceMetricsCache;
      }
      const doc = await res.json() as { metrics?: Array<Partial<ModelPerformanceMetrics>> };
      const metricsMap = new Map<string, ModelPerformanceMetrics>();
      if (Array.isArray(doc.metrics)) {
        for (const value of doc.metrics) {
          const m = value;
          const totalRequests = m.totalRequests || 0;
          const complaintCount = m.complaintCount || 0;
          metricsMap.set(`${m.provider || ''}:${m.model || ''}`, {
            model: m.model || '',
            provider: m.provider || '',
            totalRequests,
            successfulRequests: m.successfulRequests || 0,
            failedRequests: m.failedRequests || 0,
            totalLatencyMs: m.totalLatencyMs || 0,
            totalTokensUsed: m.totalTokensUsed || 0,
            totalCost: m.totalCost || 0,
            avgLatencyMs: m.avgLatencyMs || 0,
            successRate: m.successRate || 0,
            avgCostPerRequest: m.avgCostPerRequest || 0,
            costRequests: m.costRequests || 0,
            complaintCount,
            complaintRate: Math.max(0, Math.min(1, complaintCount / Math.max(totalRequests, 1))),
            lastUpdated: m.lastUpdated || now,
          });
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

private async savePerformanceMetric(
  metric: ModelPerformanceMetrics,
  required = false,
): Promise<void> {
    try {
      const persistenceUrl = this.getArtifactsUrl();
      const response = await fetch(`${persistenceUrl}/api/artifacts/brain/performance-metrics`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metric),
      });
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Artifacts returned HTTP ${response.status}: ${details.slice(0, 300)}`);
    }
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      'Failed to persist Brain model performance metrics',
    );
    if (required) throw err;
  }
}

  private async loadBrainLog(): Promise<void> {
    try {
      const persistenceUrl = this.getArtifactsUrl();
      const res = await fetch(`${persistenceUrl}/api/artifacts/brain/logs`, { method: 'GET' });
      if (!res.ok) return;
      const result = await res.json() as { entries?: BrainLogEntry[] };
      if (Array.isArray(result.entries)) {
        this.brainLog = result.entries.slice(0, MAX_LOG_ENTRIES);
      }
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Failed to load brain log from artifacts');
    }
  }

  private async saveBrainLog(entry: BrainLogEntry): Promise<void> {
    try {
      const persistenceUrl = this.getArtifactsUrl();
      const response = await fetch(`${persistenceUrl}/api/artifacts/brain/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      if (!response.ok) {
        const details = await response.text();
        throw new Error(`Artifacts returned HTTP ${response.status}: ${details.slice(0, 300)}`);
      }
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
        costRequests: 0,
        complaintCount: 0,
        complaintRate: 0,
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
    if (cost !== undefined) {
      const priorCostRequests = metrics.costRequests
        ?? (metrics.totalCost > 0 ? metrics.totalRequests - 1 : 0);
      metrics.totalCost += cost;
      metrics.costRequests = priorCostRequests + 1;
      metrics.avgCostPerRequest = metrics.totalCost / metrics.costRequests;
    }
    
    if (success) {
      metrics.successfulRequests++;
    } else {
      metrics.failedRequests++;
    }
    metrics.successRate = metrics.successfulRequests / metrics.totalRequests;
    metrics.complaintRate = Math.max(
      0,
      Math.min(1, metrics.complaintCount / Math.max(metrics.totalRequests, 1)),
    );
    metrics.lastUpdated = now;
    
    await this.savePerformanceMetric(metrics);
    // Update local cache
    this.performanceMetricsCache = metricsMap;
    this.router.setPerformanceMetrics(metricsMap);
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
    const persistenceUrl = this.getArtifactsUrl();
    const response = await fetch(`${persistenceUrl}/api/artifacts/brain/performance-metrics`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Artifacts returned HTTP ${response.status}: ${details.slice(0, 300)}`);
    }
    this.performanceMetricsCache = emptyMap;
    this.performanceCacheFetchedAt = 0;
    this.router.setPerformanceMetrics(emptyMap);
  }

  validateStructuredOutput<T>(schema: z.ZodSchema, data: unknown): T {
    const sampler = new StructuredOutputSampler(schema);
    return sampler.validate<T>(data);
  }

  getCacheStats() {
    return this.cache.stats();
  }

  resetCircuitBreakers(): void {
    for (const breaker of this.circuitBreakers.values()) breaker.reset();
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

  async recordComplaint(requestId: string): Promise<boolean> {
    const mapping = this.requestIdMap.get(requestId);
    if (!mapping) {
      logger.warn({ requestId }, 'Complaint received for unknown requestId');
      return false;
    }
    if (mapping.complaintRecorded) return true;

    const currentMetrics = await this.loadPerformanceMetrics();
    const metrics = new Map(
      Array.from(currentMetrics, ([key, value]) => [key, { ...value }] as const),
    );
    const key = `${mapping.provider}:${mapping.model}`;
    const existing = metrics.get(key);
    const complaintCount = (existing?.complaintCount || 0) + 1;
    metrics.set(key, {
      model: mapping.model,
      provider: mapping.provider,
      totalRequests: existing?.totalRequests ?? 0,
      successfulRequests: existing?.successfulRequests ?? 0,
      failedRequests: existing?.failedRequests ?? 0,
      totalLatencyMs: existing?.totalLatencyMs ?? 0,
      totalTokensUsed: existing?.totalTokensUsed ?? 0,
      totalCost: existing?.totalCost ?? 0,
      avgLatencyMs: existing?.avgLatencyMs ?? 0,
      successRate: existing?.successRate ?? 0,
      avgCostPerRequest: existing?.avgCostPerRequest ?? 0,
      costRequests: existing?.costRequests ?? 0,
      complaintCount,
      complaintRate: Math.max(
        0,
        Math.min(1, complaintCount / Math.max(existing?.totalRequests ?? 0, 1)),
      ),
      lastUpdated: Date.now(),
    });

    await this.savePerformanceMetric(metrics.get(key)!, true);
    mapping.complaintRecorded = true;
    this.performanceMetricsCache = metrics;
    this.performanceCacheFetchedAt = Date.now();
    this.router.setPerformanceMetrics(metrics);
    // A rejected answer is a reason to try a different model, not to repeat
    // the same one. Mark the model as attempted for the routing session that
    // produced it so the next turn of that session routes to an eligible model
    // that has not been tried yet.
    if (mapping.routingSessionKey) {
      this.recordRoutingSessionAttempts(mapping.routingSessionKey, [modelRoutingKey({ id: mapping.model, provider: mapping.provider })]);
      logger.info({ provider: mapping.provider, model: mapping.model, routingSessionKey: mapping.routingSessionKey }, 'Complained model excluded from its routing session');
    }
    return true;
  }
}
