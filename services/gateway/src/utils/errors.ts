import { NextGenError } from '@stage7-nextgen/shared';

export class GatewayError extends NextGenError {
  constructor(
    statusCode: number,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message, statusCode, details);
    this.name = 'GatewayError';
  }

  static badRequest(message = 'Bad Request', details?: Record<string, unknown>): GatewayError {
    return new GatewayError(400, message, details);
  }

  static notFound(message = 'Not Found', details?: Record<string, unknown>): GatewayError {
    return new GatewayError(404, message, details);
  }

  static internalError(message = 'Internal Server Error', details?: Record<string, unknown>): GatewayError {
    return new GatewayError(500, message, details);
  }

  static upstreamError(message = 'Upstream service error', details?: Record<string, unknown>): GatewayError {
    return new GatewayError(502, message, details);
  }
}
