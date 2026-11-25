import { NextGenError, SpendLimitRefusalPayload } from '@stage7-nextgen/shared';

export class ToolNotFoundError extends NextGenError {
  constructor(id: string) {
    super(`Tool not found: ${id}`, 404)
    this.name = 'ToolNotFoundError'
  }
}

/**
 * A reasoning tool's LLM completion was refused by the Brain's spend gate
 * (OD-5). Carries the exact 429 contract body so the error middleware can
 * answer HTTP 429 with it, letting callers surface the limit-reached notice
 * instead of a generic failure.
 */
export class SpendLimitReachedError extends Error {
  readonly payload: SpendLimitRefusalPayload;

  constructor(payload: SpendLimitRefusalPayload) {
    super(`LLM spending limit reached: ${payload.spent} of ${payload.limit} USD spent this ${payload.period}`);
    this.name = 'SpendLimitReachedError';
    this.payload = payload;
  }
}

export class ToolExecutionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolExecutionError'
  }
}

export class PluginGenerationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PluginGenerationError'
  }
}

export class ValidationError extends NextGenError {
  constructor(message: string) {
    super(message, 400)
    this.name = 'ValidationError'
  }
}
