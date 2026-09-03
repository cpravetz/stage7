import { NextGenError } from '@stage7-nextgen/shared';

export class ArtifactsError extends NextGenError {
  constructor(statusCode: number, message: string, details?: any) {
    super(message, statusCode, details);
    this.name = 'ArtifactsError';
  }

  static notFound(message = 'Not Found'): ArtifactsError {
    return new ArtifactsError(404, message);
  }

  static badRequest(message = 'Bad Request'): ArtifactsError {
    return new ArtifactsError(400, message);
  }

  static internalError(message = 'Internal Server Error'): ArtifactsError {
    return new ArtifactsError(500, message);
  }
}