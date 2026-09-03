export class WorkerPoolError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'WorkerPoolError';
  }

  static badRequest(message = 'Bad Request', details?: any): WorkerPoolError {
    return new WorkerPoolError(400, message, details);
  }

  static notFound(message = 'Not Found'): WorkerPoolError {
    return new WorkerPoolError(404, message);
  }

  static internalError(message = 'Internal Server Error', details?: any): WorkerPoolError {
    return new WorkerPoolError(500, message, details);
  }

  static poolFull(message = 'Worker pool is full'): WorkerPoolError {
    return new WorkerPoolError(429, message);
  }

  toJson() {
    return {
      statusCode: this.statusCode,
      message: this.message,
      details: this.details,
    };
  }
}
