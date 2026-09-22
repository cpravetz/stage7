import { Tool } from '../types';
import logger from '../utils/logger';

const BRAIN_URL = process.env.BRAIN_URL || 'http://brain:3100';
const BRAIN_REQUEST_TIMEOUT_MS = Number(process.env.BRAIN_REQUEST_TIMEOUT_MS) > 0
  ? Number(process.env.BRAIN_REQUEST_TIMEOUT_MS)
  : 12000;

export interface ReasoningConfig {
  systemPrompt?: string;
  promptTemplate?: string;
  model?: string;
  provider?: string;
  temperature?: number;
  maxTokens?: number;
  outputFormat?: 'json' | 'text';
  /** Optimization priority for model selection. The Brain's ModelRouter uses this to
   *  rank candidates by the chosen dimension before falling back to cost. */
  optimizeFor?: 'cost' | 'speed' | 'accuracy' | 'creativity' | 'balanced';
}

export interface ReasoningResult {
  _raw: string;
  _model?: string;
  _provider?: string;
  _tokensUsed?: number;
  summary?: string;
  [key: string]: unknown;
}

export class ReasoningExecutor {
  private buildOptimizedTask(userPrompt: string, optimizeFor?: string): string {
    const hints: Record<string, string> = {
      cost: 'cost-effective',
      speed: 'fast',
      accuracy: 'accurate reasoning',
      creativity: 'creative writing',
      balanced: 'balanced',
    };
    const hint = hints[optimizeFor || 'balanced'] || '';
    return hint ? `${hint} task: ${userPrompt}` : userPrompt;
  }

  async execute(tool: Tool, input: Record<string, unknown>): Promise<ReasoningResult> {
    const config = (tool.reasoningConfig as ReasoningConfig) || {};
    const systemPrompt = config.systemPrompt || 'You are a helpful AI assistant.';
    const promptTemplate = config.promptTemplate || 'Tool: {{toolName}}\nDescription: {{toolDescription}}\nInput: {{input}}\n\nProvide a response.';
    const model = config.model;
    const provider = config.provider;
    const temperature = config.temperature ?? 0.7;
    const maxTokens = config.maxTokens ?? 2048;
    const outputFormat = config.outputFormat;
    const optimizeFor = config.optimizeFor || 'balanced';

    const userPrompt = promptTemplate
      .replace('{{input}}', JSON.stringify(input, null, 2))
      .replace('{{toolName}}', tool.name)
      .replace('{{toolDescription}}', tool.description);

    const optimizedPrompt = this.buildOptimizedTask(userPrompt, optimizeFor);

    // Build candidate model list: explicit model/provider first, then
    // fallbacks from env vars so the Brain can retry with alternate models
    // when the primary is rate-limited or unavailable.
    const candidates: Array<{ model?: string; provider?: string }> = [];
    if (model) candidates.push({ model, provider });
    if (process.env.BRAIN_FALLBACK_MODEL) candidates.push({ model: process.env.BRAIN_FALLBACK_MODEL });
    if (process.env.BRAIN_FALLBACK_PROVIDER) candidates.push({ provider: process.env.BRAIN_FALLBACK_PROVIDER });
    if (candidates.length === 0) candidates.push({}); // let Brain auto-select

    let response: Response | undefined;
    let lastError: unknown;
    let lastStatus: number | undefined;

    for (let attempt = 0; attempt < candidates.length; attempt += 1) {
      const candidate = candidates[attempt];
      const payload: Record<string, unknown> = {
        prompt: optimizedPrompt,
        systemPrompt,
        options: { temperature, maxTokens },
      };
      if (candidate.model) payload.model = candidate.model;
      if (candidate.provider) payload.provider = candidate.provider;
      if (optimizeFor !== 'balanced') {
        (payload.options as Record<string, unknown>).optimizeFor = optimizeFor;
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), BRAIN_REQUEST_TIMEOUT_MS);
        response = await fetch(`${BRAIN_URL}/api/brain/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.ok) {
          logger.info({ toolId: tool.id, model: candidate.model, provider: candidate.provider, attempt }, 'Brain succeeded');
          break;
        }

        lastStatus = response.status;
        const text = await response.text();
        lastError = new Error(`Brain returned ${response.status}: ${text.slice(0, 200)}`);

        // Rate limiting (429) and server errors (5xx) are transient — try next candidate
        if (response.status === 429 || response.status >= 500) {
          logger.warn({ toolId: tool.id, status: response.status, attempt, model: candidate.model }, 'Retrying with alternate model/provider');
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
          continue;
        }

        // Client errors (4xx except 429) won't be fixed by a different model
        logger.warn({ toolId: tool.id, status: response.status, model: candidate.model }, 'Non-retryable Brain error, not trying alternate models');
        break;
      } catch (err) {
        lastError = err;
        if (attempt < candidates.length - 1) {
          logger.warn({ toolId: tool.id, attempt, model: candidate.model }, 'Brain request failed, retrying with alternate model');
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
          continue;
        }
        break;
      }
    }

    if (!response?.ok) {
      const errorMessage = lastError instanceof Error ? lastError.message : 'Unknown error';
      logger.error({ toolId: tool.id, error: errorMessage, lastStatus }, 'Brain service returned error after all retries');
      throw lastError instanceof Error ? lastError : new Error(`Brain service unavailable: ${errorMessage}`);
    }

    const data = await response.json() as { content: string; model?: string; provider?: string; tokensUsed?: number };
    const content = data.content || '';

    const shouldParseJson = outputFormat === 'json' || tool.outputSchema;
    if (shouldParseJson) {
      try {
        const parsed = JSON.parse(content);
        return {
          ...parsed,
          _raw: content,
          _model: data.model,
          _provider: data.provider,
          _tokensUsed: data.tokensUsed,
        };
      } catch {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
              ...parsed,
              _raw: content,
              _model: data.model,
              _provider: data.provider,
              _tokensUsed: data.tokensUsed,
            };
          } catch {
            // fall through to text response
          }
        }
      }
    }

    return {
      summary: content,
      _raw: content,
      _model: data.model,
      _provider: data.provider,
      _tokensUsed: data.tokensUsed,
    };
  }
}
