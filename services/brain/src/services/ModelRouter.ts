import { LLMProvider } from '../providers/Provider';

export interface ModelDefinition {
  id: string;
  provider: string;
  costPer1kTokens: number;
  maxTokens: number;
  capabilities: string[];
}

export interface ProviderHealth {
  provider: string;
  circuitState: 'closed' | 'open' | 'half-open';
  failureCount: number;
  recentSuccess: boolean;
}

const FREE_PROVIDER_PRIORITY: Record<string, number> = {} as Record<string, number>;

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
  code: ['code', 'program', 'function', 'script', 'debug', 'refactor', 'implement', 'build', 'develop', 'software'],
  chat: ['chat', 'talk', 'conversation', 'discuss', 'question', 'answer', 'help', 'assist'],
  reasoning: ['reason', 'think', 'analyze', 'logic', 'math', 'solve', 'complex', 'plan', 'strategy'],
  creative: ['write', 'story', 'poem', 'creative', 'brainstorm', 'idea', 'generate', 'compose', 'draft'],
  search: ['search', 'find', 'lookup', 'google', 'web', 'research', 'browse', 'fetch'],
};

function inferCapabilities(task: string): string[] {
  const lower = task.toLowerCase();
  const matched = new Set<string>();
  for (const [cap, keywords] of Object.entries(CAPABILITY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
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

function getExcludedModelIds(): Set<string> {
  const raw = process.env.BRAIN_EXCLUDE_MODELS;
  if (!raw) return new Set();
  return new Set(raw.split(/\s*,\s*/).filter(Boolean));
}

interface ScoredModel {
  model: ModelDefinition;
  score: number;
}

export class ModelRouter {
  private models = new Map<string, ModelDefinition>();
  private providerHealth = new Map<string, ProviderHealth>();

  registerModel(model: ModelDefinition) {
    this.models.set(model.id, model);
  }

  registerModels(models: ModelDefinition[]) {
    for (const m of models) this.models.set(m.id, m);
  }

  removeProviderModels(providerId: string) {
    for (const [id, m] of Array.from(this.models.entries())) {
      if (m.provider === providerId) this.models.delete(id);
    }
  }

  listModels(): ModelDefinition[] {
    return Array.from(this.models.values());
  }

  getModel(id: string): ModelDefinition | undefined {
    return this.models.get(id);
  }

  updateProviderHealth(health: ProviderHealth) {
    this.providerHealth.set(health.provider, health);
  }

  route(options: { task: string; maxTokens?: number; budget?: number; freeOnly?: boolean; optimizeFor?: 'cost' | 'speed' | 'accuracy' | 'creativity' | 'balanced' }): ModelDefinition {
    const candidates = this.getCandidates(options);
    if (candidates.length === 0) {
      throw new Error('No model available for the requested task. Ensure at least one LLM provider is configured with a valid API key (OPENAI_API_KEY, OPENROUTER_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, MISTRAL_API_KEY, GROK_API_KEY, HUGGINGFACE_API_KEY, NVIDIA_API_KEY, or OPENWEB_URL).');
    }
    return candidates[0].model;
  }

  getCandidates(options: { task: string; maxTokens?: number; budget?: number; freeOnly?: boolean; optimizeFor?: 'cost' | 'speed' | 'accuracy' | 'creativity' | 'balanced' }): ScoredModel[] {
    const excluded = getExcludedModelIds();
    const isExcluded = (id: string) => excluded.has(id);
    const requiredCaps = inferCapabilities(options.task);

    let candidates = Array.from(this.models.values()).filter((m) => {
      if (options.maxTokens && m.maxTokens < options.maxTokens) return false;
      if (options.budget !== undefined && m.costPer1kTokens > options.budget) return false;
      if (options.freeOnly) {
        if (!(m.costPer1kTokens === 0)) return false;
      }
      if (isExcluded(m.id)) return false;
      return requiredCaps.every((cap) => m.capabilities.includes(cap));
    });

    if (candidates.length === 0) {
      candidates = Array.from(this.models.values()).filter((m) => {
        if (options.maxTokens && m.maxTokens < options.maxTokens) return false;
        if (options.budget !== undefined && m.costPer1kTokens > options.budget) return false;
        if (options.freeOnly) {
          if (!(m.costPer1kTokens === 0)) return false;
        }
        if (isExcluded(m.id)) return false;
        return requiredCaps.length === 0 || requiredCaps.some((cap) => m.capabilities.includes(cap));
      });
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

    // Deterministic tiebreaker
    score += 1 / (1 + model.id.length);

    return score;
  }
}