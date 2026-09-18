import { Tool } from '../types';
import logger from '../utils/logger';

const BRAIN_URL = process.env.BRAIN_URL || 'http://brain:3100';

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

    let response: Response;
    try {
      response = await fetch(`${BRAIN_URL}/api/brain/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ toolId: tool.id, error: errorMessage }, 'Failed to connect to Brain service');
      const wrappedError = new Error(`Brain service unavailable: ${errorMessage}`) as Error & { cause?: unknown };
      wrappedError.cause = err;
      throw wrappedError;
    }

    if (!response.ok) {
      const text = await response.text();
      logger.error({ toolId: tool.id, status: response.status, body: text.slice(0, 200) }, 'Brain service returned error');
      throw new Error(`Brain returned ${response.status}: ${text.slice(0, 200)}`);
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
