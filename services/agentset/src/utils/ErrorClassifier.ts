import { AxiosError } from 'axios';

export enum StepErrorType {
    TRANSIENT = 'transient', // Errors that might resolve on retry (e.g., network timeout, temporary service unavailability)
    RECOVERABLE = 'recoverable', // Errors related to data or state that might be fixed by LLM intervention without aborting the plan branch
    PERMANENT = 'permanent', // Errors that will not resolve on retry (e.g., invalid input, auth error, bug in plugin)
    VALIDATION = 'validation', // Input validation errors that might be fixable through replanning
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

    if (errorMessage.includes('timeout') || errorMessage.includes('network error') || errorMessage.includes('rate limit')) {
        return StepErrorType.TRANSIENT;
    }

    if (errorMessage.includes('missing required')) {
        return StepErrorType.RECOVERABLE;
    }

    if (errorMessage.includes('invalid input')) {
        return StepErrorType.VALIDATION;
    }
    
    if (errorMessage.includes('unauthorized') || errorMessage.includes('access denied') || errorMessage.includes('not found')) {
        return StepErrorType.PERMANENT;
    }

    // 4. Default to permanent to avoid infinite retry loops on unknown errors.
    return StepErrorType.PERMANENT;
}
