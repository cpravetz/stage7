import { LLMProvider } from '../providers/Provider';

export interface ModelDefinition {
  id: string;
  provider: string;
  costPer1kTokens: number;
  maxTokens: number;
  capabilities: string[];
  inputFormat?: string;
  outputFormat?: string;
}

export interface ProviderHealth {
  provider: string;
  circuitState: 'closed' | 'open' | 'half-open';
  failureCount: number;
  recentSuccess: boolean;
}

export interface RoutingOptions {
  task: string;
  maxTokens?: number;
  budget?: number;
  freeOnly?: boolean;
  optimizeFor?: 'cost' | 'speed' | 'accuracy' | 'creativity' | 'balanced';
  excludedModelIds?: Iterable<string>;
  inputFormat?: string;
  outputFormat?: string;
}

export interface ModelPerformanceOutcome {
  successRate: number;
  avgLatencyMs: number;
  avgCostPerRequest: number;
  totalRequests: number;
  totalCost?: number;
  costRequests?: number;
  complaintCount: number;
  complaintRate: number;
}

type PerformanceMetricsMap = ReadonlyMap<string, ModelPerformanceOutcome | { successRate: number; avgLatencyMs: number; avgCostPerRequest: number; totalRequests: number; totalCost?: number; costRequests?: number; complaintCount?: number; complaintRate?: number }>;

const FREE_PROVIDER_PRIORITY: Record<string, number> = {} as Record<string, number>;
const RESPONSE_TIME_BASELINE_MS = 30_000;
const RESPONSE_TIME_SCORE_RANGE = 80;

function providerPriority(provider: string): number {
  return FREE_PROVIDER_PRIORITY[provider] ?? 10;
}

function modelSpecializationPenalty(model: ModelDefinition, task: string): number {
  const id = model.id.toLowerCase();
  const wantsCode = /\b(code|coding|programming|function|script|debug|refactor|implementation)\b/.test(task.toLowerCase());
  if (wantsCode) return 0;
  if (/safety|embed|embedding|coder|code|vision|omni/.test(id)) return 2;
  return 0;
}

const CAPABILITY_KEYWORDS: Record<string, string[]> = {
  vision: ['image', 'picture', 'photo', 'visual', 'see', 'look', 'analyze image', 'describe image'],
  code: ['code', 'coding', 'program', 'programming', 'function', 'script', 'debug', 'refactor', 'implement', 'implementation', 'build', 'develop', 'software'],
  chat: ['chat', 'talk', 'conversation', 'discuss', 'question', 'answer', 'help', 'assist', 'assistant'],
  reasoning: ['reason', 'reasoning', 'think', 'analyze', 'logic', 'math', 'mathematical', 'mathematics', 'solve', 'complex', 'plan', 'strategy'],
  creative: ['write', 'writing', 'story', 'poem', 'creative', 'brainstorm', 'idea', 'generate', 'compose', 'draft'],
  search: ['search', 'find', 'lookup', 'google', 'web', 'research', 'browse', 'fetch'],
};

function hasKeyword(task: string, keyword: string): boolean {
  const pattern = keyword
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${pattern}\\b`).test(task);
}

function inferCapabilities(task: string): string[] {
  const lower = task.toLowerCase();
  const matched = new Set<string>();
  for (const [cap, keywords] of Object.entries(CAPABILITY_KEYWORDS)) {
    if (keywords.some((kw) => hasKeyword(lower, kw))) {
      matched.add(cap);
      if (cap === 'creative') matched.add('chat');
    }
  }
  if (matched.size === 0) matched.add('chat');
  return Array.from(matched);
}

function getOptimizeForPriority(model: ModelDefinition, optimizeFor: string): number {
  switch (optimizeFor) {
    case 'speed':
      return model.maxTokens;
    case 'accuracy':
      return model.capabilities.includes('reasoning') ? 0 : 1;
    case 'creativity':
      return model.capabilities.includes('creative') ? 0 : 1;
    case 'cost':
    case 'balanced':
    default:
      return 0;
  }
}

interface ScoredModel {
  model: ModelDefinition;
  score: number;
}

export class ModelRouter {
  private models = new Map<string, ModelDefinition>();
  private providerHealth = new Map<string, ProviderHealth>();
  private performanceMetrics = new Map<string, ModelPerformanceOutcome>();

  registerModel(model: ModelDefinition) {
    this.models.set(`${model.provider}:${model.id}`, model);
  }

  registerModels(models: ModelDefinition[]) {
    for (const model of models) this.registerModel(model);
  }

  removeProviderModels(providerId: string) {
    for (const [key, model] of Array.from(this.models.entries())) {
      if (model.provider === providerId) this.models.delete(key);
    }
  }

  listModels(): ModelDefinition[] {
    return Array.from(this.models.values());
  }

  getModel(id: string): ModelDefinition | undefined {
    return Array.from(this.models.values()).find((model) => model.id === id);
  }

  updateProviderHealth(health: ProviderHealth) {
    this.providerHealth.set(health.provider, health);
  }

  setPerformanceMetrics(metrics: ReadonlyMap<string, { successRate: number; avgLatencyMs: number; avgCostPerRequest: number; totalRequests: number; totalCost?: number; costRequests?: number; complaintCount?: number; complaintRate?: number }>) {
    this.performanceMetrics = new Map(metrics as ReadonlyMap<string, ModelPerformanceOutcome>);
  }

  recordComplaint(provider: string, modelId: string) {
    const key = `${provider}:${modelId}`;
    const metrics = this.performanceMetrics.get(key);
    if (metrics) {
      metrics.complaintCount = (metrics.complaintCount || 0) + 1;
      metrics.complaintRate = Math.max(
        0,
        Math.min(1, metrics.complaintCount / Math.max(metrics.totalRequests, 1)),
      );
    } else {
      this.performanceMetrics.set(key, {
        successRate: 0,
        avgLatencyMs: 0,
        avgCostPerRequest: 0,
        totalRequests: 0,
        complaintCount: 1,
        complaintRate: 1,
      });
    }
  }

  route(options: RoutingOptions): ModelDefinition {
    const candidates = this.getCandidates(options);
    if (candidates.length === 0) {
      throw new Error('No model available for the requested task. Ensure at least one LLM provider is configured with a valid API key (OPENAI_API_KEY, OPENROUTER_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, MISTRAL_API_KEY, GROK_API_KEY, HUGGINGFACE_API_KEY, NVIDIA_API_KEY, or OPENWEB_URL).');
    }
    return candidates[0].model;
  }

  getCandidates(options: RoutingOptions): ScoredModel[] {
    const excluded = new Set<string>();
    for (const id of options.excludedModelIds || []) excluded.add(id);
    const isExcluded = (model: ModelDefinition) =>
      excluded.has(model.id) || excluded.has(`${model.provider}:${model.id}`);
    const eligibleModels = Array.from(this.models.values()).filter((m) => {
      if (options.maxTokens && m.maxTokens < options.maxTokens) return false;
      if (options.budget !== undefined && m.costPer1kTokens > options.budget) return false;
      if (options.freeOnly) {
        if (!(m.costPer1kTokens === 0)) return false;
      }
      if (isExcluded(m)) return false;
      if (options.inputFormat) {
        const modelInput = (m as any).inputFormat;
        if (modelInput && modelInput !== options.inputFormat) return false;
      }
      if (options.outputFormat) {
        const modelOutput = (m as any).outputFormat;
        if (modelOutput && modelOutput !== options.outputFormat) return false;
      }
      return true;
    });

    const availableCapabilities = new Set(eligibleModels.flatMap((model) => model.capabilities));
    // Search is an Agent tool capability; do not make it a hard LLM constraint when absent.
    const requiredCaps = inferCapabilities(options.task).filter((cap) =>
      cap !== 'search' || availableCapabilities.has(cap),
    );
    if (requiredCaps.length === 0) requiredCaps.push('chat');

    let candidates = eligibleModels.filter((model) =>
      requiredCaps.every((cap) => model.capabilities.includes(cap)),
    );

    if (candidates.length === 0) {
      candidates = eligibleModels.filter((model) =>
        requiredCaps.some((cap) => model.capabilities.includes(cap)),
      );
    }

    const generalCandidates = candidates.filter((candidate) => modelSpecializationPenalty(candidate, options.task) === 0);
    if (generalCandidates.length > 0) candidates = generalCandidates;

    const scored: ScoredModel[] = candidates.map((model) => ({
      model,
      score: this.scoreModel(model, options, requiredCaps),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  private scoreModel(model: ModelDefinition, options: { task: string; optimizeFor?: string; freeOnly?: boolean }, requiredCaps: string[]): number {
    const optimizeFor = options.optimizeFor || 'balanced';
    let score = 0;

    // Capability match: +10 per required capability the model has
    const matchedCaps = requiredCaps.filter((cap) => model.capabilities.includes(cap)).length;
    score += matchedCaps * 10;

    // Cost efficiency: inverse cost (free models get max bonus)
    if (model.costPer1kTokens === 0) {
      score += 50;
    } else if (model.costPer1kTokens < 0.1) {
      score += 30;
    } else if (model.costPer1kTokens < 1) {
      score += 20;
    } else if (model.costPer1kTokens < 5) {
      score += 10;
    }

    // Specialization bonus/penalty
    const specPenalty = modelSpecializationPenalty(model, options.task);
    score -= specPenalty * 5;

    // OptimizeFor preference
    const optPriority = getOptimizeForPriority(model, optimizeFor);
    if (optimizeFor === 'speed') {
      // Lower maxTokens = faster (rough proxy)
      score += Math.max(0, 100 - model.maxTokens / 1000);
    } else if (optimizeFor === 'accuracy') {
      if (model.capabilities.includes('reasoning')) score += 15;
    } else if (optimizeFor === 'creativity') {
      if (model.capabilities.includes('creative')) score += 15;
    } else if (optimizeFor === 'cost' || optimizeFor === 'balanced') {
      // Cost already factored above
    }

    // Provider health
    const health = this.providerHealth.get(model.provider);
    if (health) {
      if (health.circuitState === 'open') {
        score -= 1000; // Effectively exclude
      } else if (health.circuitState === 'half-open') {
        score -= 50;
      } else if (health.failureCount > 0) {
        score -= health.failureCount * 5;
      }
      if (health.recentSuccess) {
        score += 20;
      }
    }

    const metrics = this.performanceMetrics.get(`${model.provider}:${model.id}`);
    if (metrics && metrics.totalRequests > 0) {
      // Keep persisted outcomes a bounded ranking signal; eligibility stays above this scoring step.
      const successRate = Math.max(0, Math.min(1, metrics.successRate));
      score += (successRate - 0.5) * 40;

      if (Number.isFinite(metrics.avgLatencyMs) && metrics.avgLatencyMs >= 0) {
        score += (RESPONSE_TIME_SCORE_RANGE / (1 + metrics.avgLatencyMs / RESPONSE_TIME_BASELINE_MS))
          - RESPONSE_TIME_SCORE_RANGE / 2;
      }

      const hasMeasuredCost = (metrics.costRequests ?? 0) > 0
        || (metrics.totalCost ?? 0) > 0
        || metrics.avgCostPerRequest > 0;
      if (hasMeasuredCost && Number.isFinite(metrics.avgCostPerRequest) && metrics.avgCostPerRequest >= 0) {
        score += (10 / (1 + metrics.avgCostPerRequest * 100)) - 5;
      }

      // Complaint penalty: heavily weight quality complaints from agents
      const complaintRate = metrics.complaintRate || 0;
      if (complaintRate > 0) {
        // Each 10% complaint rate = -30 points (steep penalty)
        score -= complaintRate * 300;
      }
    }

    // Deterministic tiebreaker
    score += 1 / (1 + model.id.length);

    return score;
  }
}