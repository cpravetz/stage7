export type ErrorType = 'transient' | 'permanent';

export const classifyStepError = (error: Error): ErrorType => {
  const errorMessage = error.message.toLowerCase();

  // Permanent Errors (4xx, validation, etc.)
  if (
    errorMessage.includes('not found') ||
    errorMessage.includes('bad request') ||
    errorMessage.includes('validation error') ||
    errorMessage.includes('unauthorized') ||
    errorMessage.includes('forbidden') ||
    errorMessage.includes('invalid')
  ) {
    return 'permanent';
  }

  // Transient Errors (5xx, network, etc.)
  if (
    errorMessage.includes('timeout') ||
    errorMessage.includes('network error') ||
    errorMessage.includes('service unavailable') ||
    errorMessage.includes('server error') ||
    errorMessage.includes('econnreset')
  ) {
    return 'transient';
  }

  // Default to permanent
  return 'permanent';
};
