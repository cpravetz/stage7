import { NextGenError } from '@stage7-nextgen/shared';

export class AuthError extends NextGenError {
  constructor(
    statusCode: number,
    message: string,
    details?: any
  ) {
    super(message, statusCode, details);
    this.name = 'AuthError';
  }

  static badRequest(message = 'Bad Request', details?: any): AuthError {
    return new AuthError(400, message, details);
  }

  static unauthorized(message = 'Unauthorized'): AuthError {
    return new AuthError(401, message);
  }

  static forbidden(message = 'Forbidden'): AuthError {
    return new AuthError(403, message);
  }

  static notFound(message = 'Not Found'): AuthError {
    return new AuthError(404, message);
  }

  toJson() {
    return {
      statusCode: this.statusCode,
      message: this.message,
      details: this.details,
    };
  }
}
