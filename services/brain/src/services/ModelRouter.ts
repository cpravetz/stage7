import { LLMProvider } from '../providers/Provider';

export interface ModelDefinition {
  id: string;
  provider: string;
  costPer1kTokens: number;
  maxTokens: number;
  capabilities: string[];
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
    }
  }
  if (matched.size === 0) matched.add('chat');
  return Array.from(matched);
}

export class ModelRouter {
  private models = new Map<string, ModelDefinition>();

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

  route(options: { task: string; modelId?: string; maxTokens?: number; budget?: number; provider?: string }): ModelDefinition {
    if (options.modelId) {
      const m = this.models.get(options.modelId);
      if (m) return m;
      throw new Error(`Model '${options.modelId}' not found. Available models: ${Array.from(this.models.keys()).join(', ') || 'none'}`);
    }
    const requiredCaps = inferCapabilities(options.task);

    if (options.provider) {
      const same = Array.from(this.models.values()).find((m) => {
        if (m.provider !== options.provider) return false;
        return requiredCaps.every((cap) => m.capabilities.includes(cap));
      });
      if (same) return same;
    }
    const providers = options.provider ? new Set([options.provider]) : null;

    let candidates = Array.from(this.models.values()).filter((m) => {
      if (providers && !providers.has(m.provider)) return false;
      if (options.maxTokens && m.maxTokens < options.maxTokens) return false;
      if (options.budget !== undefined && m.costPer1kTokens > options.budget) return false;
      return requiredCaps.every((cap) => m.capabilities.includes(cap));
    });

    if (candidates.length === 0) {
      candidates = Array.from(this.models.values()).filter((m) => {
        if (providers && !providers.has(m.provider)) return false;
        if (options.maxTokens && m.maxTokens < options.maxTokens) return false;
        if (options.budget !== undefined && m.costPer1kTokens > options.budget) return false;
        return requiredCaps.length === 0 || requiredCaps.some((cap) => m.capabilities.includes(cap));
      });
    }

    if (candidates.length === 0) {
      throw new Error('No model available for the requested task. Ensure at least one LLM provider is configured with a valid API key (OPENAI_API_KEY, OPENROUTER_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, MISTRAL_API_KEY, GROK_API_KEY, HUGGINGFACE_API_KEY, or OPENWEB_URL).');
    }

    candidates.sort((a, b) => {
      const costDiff = a.costPer1kTokens - b.costPer1kTokens;
      if (costDiff !== 0) return costDiff;
      const aMatch = requiredCaps.filter((cap) => a.capabilities.includes(cap)).length;
      const bMatch = requiredCaps.filter((cap) => b.capabilities.includes(cap)).length;
      if (bMatch !== aMatch) return bMatch - aMatch;
      return a.id.localeCompare(b.id);
    });
    return candidates[0];
  }
}
