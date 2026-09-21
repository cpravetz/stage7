import { Tool } from '../types';
import logger from '../utils/logger';

const BRAIN_URL = process.env.BRAIN_URL || 'http://brain:3100';
const BRAIN_REQUEST_TIMEOUT_MS = Number(process.env.BRAIN_REQUEST_TIMEOUT_MS) > 0
  ? Number(process.env.BRAIN_REQUEST_TIMEOUT_MS)
  : 15000;

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

    const payload: Record<string, unknown> = {
      prompt: optimizedPrompt,
      systemPrompt,
      options: { temperature, maxTokens },
    };

    if (model) payload.model = model;
    if (provider) payload.provider = provider;
    if (optimizeFor !== 'balanced') {
      (payload.options as Record<string, unknown>).optimizeFor = optimizeFor;
    }

    let response: Response | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
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
        if (response.ok) break;
        const text = await response.text();
        lastError = new Error(`Brain returned ${response.status}: ${text.slice(0, 200)}`);
        if (![502, 503, 504].includes(response.status) || attempt === 2) break;
        logger.warn({ toolId: tool.id, status: response.status, attempt }, 'Retrying transient Brain gateway error');
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      } catch (err) {
        lastError = err;
        if (attempt === 2) break;
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }

    if (!response?.ok) {
      const errorMessage = lastError instanceof Error ? lastError.message : 'Unknown error';
      logger.error({ toolId: tool.id, error: errorMessage }, 'Brain service returned error');
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
