import { z } from 'zod';
import { logger } from '../utils/logger';

export class StructuredOutputSampler {
  private schema: z.ZodSchema;

  constructor(schema: z.ZodSchema) {
    this.schema = schema;
  }

  validate<T>(data: unknown): T {
    const result = this.schema.safeParse(data);
    if (!result.success) {
      logger.error({ error: result.error.format() }, 'Structured output validation failed');
      throw new Error(result.error.message);
    }
    return result.data as T;
  }

  enforceInPrompt(prompt: string): string {
    const schemaDescription = this.describeSchema();
    return `${prompt}

Please respond with a JSON object matching this schema:
${schemaDescription}

Respond ONLY with valid JSON.`;
  }

  describeSchema(): string {
    return JSON.stringify(this.getJsonSchema(), null, 2);
  }

  private getJsonSchema(): Record<string, unknown> {
    return {
      description: 'Structured output schema',
      type: 'object',
    };
  }
}
