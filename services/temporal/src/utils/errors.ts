import { NextGenError } from '@stage7-nextgen/shared';

export class TemporalError extends NextGenError {
  constructor(statusCode: number, message: string, details?: Record<string, unknown>) {
    super(message, statusCode, details);
    this.name = 'TemporalError';
  }

  static workflowError(message = 'Workflow error', details?: Record<string, unknown>): TemporalError {
    return new TemporalError(502, message, details);
  }
}
