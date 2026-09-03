import { NextGenError } from '@stage7-nextgen/shared';

export class VaultError extends NextGenError {
  constructor(
    statusCode: number,
    message: string,
    details?: any
  ) {
    super(message, statusCode, details);
    this.name = 'VaultError';
  }

  static badRequest(message = 'Bad Request', details?: any): VaultError {
    return new VaultError(400, message, details);
  }

  static notFound(message = 'Not Found'): VaultError {
    return new VaultError(404, message);
  }

  static encryptionError(message = 'Encryption error', details?: any): VaultError {
    return new VaultError(500, message, details);
  }

  toJson() {
    return {
      statusCode: this.statusCode,
      message: this.message,
      details: this.details,
    };
  }
}
