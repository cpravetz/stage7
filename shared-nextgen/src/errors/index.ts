export class NextGenError extends Error {
  public statusCode: number;
  public details?: Record<string, unknown>;

  constructor(message: string, statusCode: number = 500, details?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJson(): any {
    return {
      success: false as const,
      error: this.message,
      statusCode: this.statusCode,
      details: this.details,
    };
  }

  static badRequest(message: string, details?: Record<string, unknown>) {
    return new NextGenError(message, 400, details);
  }

  static notFound(message: string, details?: Record<string, unknown>) {
    return new NextGenError(message, 404, details);
  }

  static internalError(message: string = 'Internal server error', details?: Record<string, unknown>) {
    return new NextGenError(message, 500, details);
  }

  static unauthorized(message: string = 'Unauthorized', details?: Record<string, unknown>) {
    return new NextGenError(message, 401, details);
  }

  static forbidden(message: string = 'Forbidden', details?: Record<string, unknown>) {
    return new NextGenError(message, 403, details);
  }
}
