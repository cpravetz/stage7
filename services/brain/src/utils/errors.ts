import { NextGenError } from '@stage7-nextgen/shared';

export class BrainError extends NextGenError {
  static badRequest(message: string, details?: Record<string, unknown>) {
    return new BrainError(message, 400, details);
  }

  static notFound(message: string, details?: Record<string, unknown>) {
    return new BrainError(message, 404, details);
  }

  static internalError(message: string = 'Internal server error', details?: Record<string, unknown>) {
    return new BrainError(message, 500, details);
  }

  static unauthorized(message: string = 'Unauthorized', details?: Record<string, unknown>) {
    return new BrainError(message, 401, details);
  }

  static forbidden(message: string = 'Forbidden', details?: Record<string, unknown>) {
    return new BrainError(message, 403, details);
  }
}
