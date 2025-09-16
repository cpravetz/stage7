import { AxiosError } from 'axios';

export enum StepErrorType {
    TRANSIENT = 'transient', // Errors that might resolve on retry (e.g., network timeout, temporary service unavailability)
    PERMANENT = 'permanent', // Errors that will not resolve on retry (e.g., invalid input, auth error, bug in plugin)
    VALIDATION = 'validation', // Input validation errors that might be fixable through replanning
    RECOVERABLE = 'recoverable', // Errors that can be fixed with specific recovery actions
    USER_INPUT_NEEDED = 'user_input_needed', // Errors that require user intervention
}

/**
 * Classifies an error from a step execution to determine the appropriate recovery strategy.
 * @param error The error object, which could be a standard Error, an AxiosError, or a custom structured error.
 * @returns A StepErrorType indicating if the error is transient or permanent.
 */
export function classifyStepError(error: any): StepErrorType {
    // 1. Check for custom structured error codes if they exist
    // This can be expanded with the system's global error codes.
    if (error && error.error_code) {
        switch (error.error_code) {
            // Example permanent errors
            case 'INPUT_VALIDATION_FAILED':
            case 'AUTHENTICATION_ERROR':
            case 'PLUGIN_PERMISSION_VALIDATION_FAILED':
                return StepErrorType.PERMANENT;

            // Example transient errors
            case 'SERVICE_UNAVAILABLE':
            case 'RATE_LIMIT_EXCEEDED':
                return StepErrorType.TRANSIENT;
        }
    }

    // 2. Check for Axios-specific network errors, which are more reliable than string matching
    if (error.isAxiosError) {
        const axiosError = error as AxiosError;

        // Network errors (timeout, DNS issues, connection refused) are often transient
        if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ENOTFOUND' || axiosError.code === 'ECONNRESET' || axiosError.code === 'ECONNREFUSED') {
            return StepErrorType.TRANSIENT;
        }

        // Check HTTP status codes from the response
        if (axiosError.response) {
            const status = axiosError.response.status;
            if (status >= 500) { // 500, 502, 503, 504 are server-side issues, potentially transient
                return StepErrorType.TRANSIENT;
            }
            if (status === 400) { // 400 is validation error
                return StepErrorType.VALIDATION;
            }
            if (status > 400 && status < 500) { // 401, 403, 404 are client-side errors, almost always permanent
                return StepErrorType.PERMANENT;
            }
        }
    }

    // 3. Fallback to checking error messages for common patterns
    const errorMessage = (error.message || '').toLowerCase();

    // Transient errors that should be retried
    if (errorMessage.includes('timeout') ||
        errorMessage.includes('network error') ||
        errorMessage.includes('rate limit') ||
        errorMessage.includes('service unavailable') ||
        errorMessage.includes('connection refused') ||
        errorMessage.includes('temporary failure') ||
        errorMessage.includes('try again later')) {
        return StepErrorType.TRANSIENT;
    }

    // Recoverable errors that can be fixed with specific actions
    if (errorMessage.includes('python script exited with code null') ||
        errorMessage.includes('plugin execution failed') ||
        errorMessage.includes('no response from') ||
        errorMessage.includes('waiting for user input') ||
        errorMessage.includes('dependency not satisfied') ||
        errorMessage.includes('missing dependency')) {
        return StepErrorType.RECOVERABLE;
    }

    // User input needed
    if (errorMessage.includes('user confirmation required') ||
        errorMessage.includes('please provide') ||
        errorMessage.includes('user input required') ||
        errorMessage.includes('awaiting user response')) {
        return StepErrorType.USER_INPUT_NEEDED;
    }

    // Validation errors that might be fixable through replanning
    if (errorMessage.includes('invalid input') ||
        errorMessage.includes('missing required') ||
        errorMessage.includes('parameter validation failed') ||
        errorMessage.includes('invalid parameter type') ||
        errorMessage.includes('schema validation failed')) {
        return StepErrorType.VALIDATION;
    }

    // Permanent errors that won't resolve with retry
    if (errorMessage.includes('unauthorized') ||
        errorMessage.includes('access denied') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('permission denied') ||
        errorMessage.includes('authentication failed') ||
        errorMessage.includes('forbidden')) {
        return StepErrorType.PERMANENT;
    }

    // 4. Default to recoverable for unknown errors to allow for intelligent recovery
    return StepErrorType.RECOVERABLE;
}