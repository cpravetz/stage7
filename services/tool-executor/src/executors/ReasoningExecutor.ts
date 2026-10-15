import { Tool } from '../types';
import logger from '../utils/logger';

const BRAIN_URL = process.env.BRAIN_URL || 'http://brain:3100';

export interface ReasoningConfig {
  systemPrompt?: string;
  promptTemplate?: string;
  temperature?: number;
  maxTokens?: number;
  outputFormat?: 'json' | 'text';
  routingSessionId?: string;
  privateInputFields?: string[];
  qualityFeedback?: {
    sourceRequestIdField: string;
    validField: string;
    issuesField: string;
    preValidationIssuesField?: string;
    shortCircuitOnPreValidationIssues?: boolean;
  };
  /** Optimization priority for model selection. The Brain's ModelRouter uses this to
   *  rank candidates by the chosen dimension before falling back to cost. */
  optimizeFor?: 'cost' | 'speed' | 'accuracy' | 'creativity' | 'balanced';
}

export interface ReasoningResult {
  _raw: string;
  _model?: string;
  _provider?: string;
  _tokensUsed?: number;
  _requestId?: string;
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
    const temperature = config.temperature ?? 0.7;
    const maxTokens = config.maxTokens ?? 2048;
    const outputFormat = config.outputFormat;
    const optimizeFor = config.optimizeFor || 'balanced';
    const routingSessionId = typeof input.routingSessionId === 'string'
      ? input.routingSessionId
      : config.routingSessionId;
    const privateInputFields = new Set(['routingSessionId', ...(config.privateInputFields || [])]);
    const promptInput = Object.fromEntries(
      Object.entries(input).filter(([key]) => !privateInputFields.has(key)),
    );
    const feedback = config.qualityFeedback;
    const localIssues = feedback?.shortCircuitOnPreValidationIssues && feedback.preValidationIssuesField
      ? input[feedback.preValidationIssuesField]
      : undefined;
    if (feedback && Array.isArray(localIssues)) {
      const issues = Array.from(new Set(
        localIssues
          .filter((issue): issue is string => typeof issue === 'string' && issue.trim().length > 0)
          .map((issue) => issue.trim()),
      ));
      if (issues.length > 0) {
        const output = {
          [feedback.validField]: false,
          [feedback.issuesField]: issues,
        };
        await this.reportQualityFeedback(tool, input, output, config);
        return { ...output, _raw: JSON.stringify(output) };
      }
    }

    const userPrompt = promptTemplate
      .replace('{{input}}', JSON.stringify(promptInput, null, 2))
      .replace('{{toolName}}', tool.name)
      .replace('{{toolDescription}}', tool.description);

    const optimizedPrompt = this.buildOptimizedTask(userPrompt, optimizeFor);

    const options: Record<string, unknown> = { temperature, maxTokens };
    if (optimizeFor !== 'balanced') options.optimizeFor = optimizeFor;
    if (routingSessionId) options.routingSessionId = routingSessionId;

    const payload: Record<string, unknown> = {
      prompt: optimizedPrompt,
      systemPrompt,
      options,
    };

    const response = await fetch(`${BRAIN_URL}/api/brain/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      const error = new Error(`Brain returned ${response.status}: ${text.slice(0, 500)}`);
      logger.error({ toolId: tool.id, status: response.status, error: error.message }, 'Brain service returned an error');
      throw error;
    }
    logger.info({ toolId: tool.id }, 'Brain succeeded');

    const data = await response.json() as {
      content: string;
      model?: string;
      provider?: string;
      tokensUsed?: number;
      requestId?: string;
    };
    const content = data.content || '';

    const shouldParseJson = outputFormat === 'json' || tool.outputSchema;
    if (shouldParseJson) {
      try {
        const parsed = JSON.parse(content) as Record<string, unknown>;
        await this.reportQualityFeedback(tool, input, parsed, config);
        return {
          ...parsed,
          _raw: content,
          _model: data.model,
          _provider: data.provider,
          _tokensUsed: data.tokensUsed,
          _requestId: data.requestId,
        };
      } catch {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
            await this.reportQualityFeedback(tool, input, parsed, config);
            return {
              ...parsed,
              _raw: content,
              _model: data.model,
              _provider: data.provider,
              _tokensUsed: data.tokensUsed,
              _requestId: data.requestId,
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
      _requestId: data.requestId,
    };
  }

  private async reportQualityFeedback(
    tool: Tool,
    input: Record<string, unknown>,
    output: Record<string, unknown>,
    config: ReasoningConfig,
  ): Promise<void> {
    const feedback = config.qualityFeedback;
    if (!feedback) return;

    const priorIssues = feedback.preValidationIssuesField
      ? input[feedback.preValidationIssuesField]
      : undefined;
    const reviewIssues = output[feedback.issuesField];
    const issues = Array.from(new Set([
      ...(Array.isArray(priorIssues) ? priorIssues.filter((issue): issue is string => typeof issue === 'string') : []),
      ...(Array.isArray(reviewIssues) ? reviewIssues.filter((issue): issue is string => typeof issue === 'string') : []),
    ]));
    const invalid = output[feedback.validField] === false || issues.length > 0;
    if (!invalid) return;

    const sourceRequestId = input[feedback.sourceRequestIdField];
    if (typeof sourceRequestId !== 'string' || !sourceRequestId) {
      logger.warn(
        { toolId: tool.id, issues },
        'Could not report validated content failure because the source Brain request ID was missing',
      );
      return;
    }

    const reason = `Validated output from ${tool.id} was rejected: ${
      issues.length > 0 ? issues.join('; ') : 'the independent validation result marked it invalid'
    }`.slice(0, 2_000);
    const missionId = typeof input.missionId === 'string' ? input.missionId : undefined;
    try {
      const response = await fetch(`${BRAIN_URL}/api/brain/complaint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: sourceRequestId, reason, missionId }),
      });
      if (!response.ok) {
        const details = await response.text();
        logger.error(
          { toolId: tool.id, requestId: sourceRequestId, status: response.status, details: details.slice(0, 300) },
          'Brain rejected a reasoning-output quality complaint',
        );
        return;
      }
      logger.info(
        { toolId: tool.id, requestId: sourceRequestId, missionId, reason },
        'Reasoning output validation complaint recorded',
      );
    } catch (error) {
      logger.error(
        { toolId: tool.id, requestId: sourceRequestId, missionId, error: error instanceof Error ? error.message : String(error) },
        'Failed to report a reasoning-output quality complaint',
      );
    }
  }
}
