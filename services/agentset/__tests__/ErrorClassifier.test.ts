
import { classifyStepError, StepErrorType } from '../src/utils/ErrorClassifier';
import { AxiosError } from 'axios';

describe('classifyStepError', () => {
  // Test custom structured error codes
  it('should classify custom error codes correctly', () => {
    expect(classifyStepError({ error_code: 'INPUT_VALIDATION_FAILED' })).toBe(StepErrorType.PERMANENT);
    expect(classifyStepError({ error_code: 'SERVICE_UNAVAILABLE' })).toBe(StepErrorType.TRANSIENT);
  });

  // Test Axios network errors
  it('should classify Axios network errors as transient', () => {
    const axiosError: Partial<AxiosError> = { isAxiosError: true, code: 'ECONNABORTED' };
    expect(classifyStepError(axiosError)).toBe(StepErrorType.TRANSIENT);
  });

  // Test HTTP status codes
  it('should classify HTTP status codes correctly', () => {
    const error500: Partial<AxiosError> = { isAxiosError: true, response: { status: 500 } as any };
    const error400: Partial<AxiosError> = { isAxiosError: true, response: { status: 400 } as any };
    const error401: Partial<AxiosError> = { isAxiosError: true, response: { status: 401 } as any };

    expect(classifyStepError(error500)).toBe(StepErrorType.TRANSIENT);
    expect(classifyStepError(error400)).toBe(StepErrorType.VALIDATION);
    expect(classifyStepError(error401)).toBe(StepErrorType.PERMANENT);
  });

  // Test error messages
  it('should classify errors based on message content', () => {
    expect(classifyStepError(new Error('request timed out'))).toBe(StepErrorType.TRANSIENT);
    expect(classifyStepError(new Error('invalid input provided'))).toBe(StepErrorType.VALIDATION);
    expect(classifyStepError(new Error('access denied'))).toBe(StepErrorType.PERMANENT);
  });

  // Test default case
  it('should default to permanent for unknown errors', () => {
    expect(classifyStepError(new Error('an unknown error occurred'))).toBe(StepErrorType.PERMANENT);
  });
});
