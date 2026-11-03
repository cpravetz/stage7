import { z } from 'zod';
import { logger } from '@stage7-nextgen/shared';
import { parsePlanJson } from '../planner/planJson';

export interface BrainCompleteRequest<T> {
  prompt: string;
  systemPrompt: string;
  schema: z.ZodSchema<T>;
  requirements?: {
    maxTokens?: number;
    temperature?: number;
    routingSessionId?: string;
    missionId?: string;
    attempt?: number;
  };
  mode?: 'plan' | 'select' | 'review' | 'execute' | 'verify' | 'agent';
}

export interface BrainCompleteResult<T> {
  value: T;
  requestId?: string;
  model?: string;
  provider?: string;
  tokensUsed?: number;
}

export class BrainValidationError extends Error {
  constructor(
    message: string,
    public issues?: string[],
    public requestId?: string,
  ) {
    super(message);
    this.name = 'BrainValidationError';
  }
}

export interface BrainCompletionAdapter {
  complete(request: {
    prompt: string;
    systemPrompt: string;
    maxTokens: number;
    temperature: number;
    missionId?: string;
    routingSessionId?: string;
    attempt: number;
  }): Promise<string>;
}

export class BrainClient {
  constructor(private readonly adapter: BrainCompletionAdapter) {}

  async complete<T>(req: BrainCompleteRequest<T>): Promise<BrainCompleteResult<T>> {
    const {
      prompt,
      systemPrompt,
      schema,
      requirements = {},
      mode = 'agent',
    } = req;

    const {
      maxTokens = 8192,
      temperature = 0.3,
      routingSessionId,
      missionId,
      attempt = 1,
    } = requirements;

    let content: string;
    try {
      content = await this.adapter.complete({
        prompt,
        systemPrompt,
        maxTokens,
        temperature,
        missionId,
        routingSessionId,
        attempt,
      });
    } catch (error) {
      throw error;
    }

    let parsed: any;
    try {
      const parsedJson = parsePlanJson(content);
      parsed = parsedJson.value;
      if (parsedJson.repaired) {
        logger.debug(
          { missionId, mode, repairs: parsedJson.repairs },
          'Brain client repaired structurally invalid JSON',
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BrainValidationError(
        `Brain returned invalid JSON: ${message}`,
        [message],
      );
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => {
        const path = issue.path.length === 0 ? '<root>' : issue.path.join('.');
        return path + ': ' + issue.message;
      });
      throw new BrainValidationError(
        'Brain response failed schema validation: ' + issues.join('; '),
        issues,
      );
    }

    return {
      value: result.data,
    };
  }
}
