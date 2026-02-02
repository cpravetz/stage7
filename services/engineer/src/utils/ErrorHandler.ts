/**
 * Standardized error handling for Engineer service
 * Provides consistent error types and recovery strategies
 */

export enum ErrorSeverity {
    LOW = 'LOW',           // Non-critical, can retry
    MEDIUM = 'MEDIUM',     // Important but recoverable
    HIGH = 'HIGH',         // Critical but doesn't stop service
    CRITICAL = 'CRITICAL'  // Fatal error
}

export interface EngineerError extends Error {
    code: string;
    severity: ErrorSeverity;
    context?: Record<string, any>;
    retryable: boolean;
    timestamp: Date;
}

export class EngineerErrorHandler {
    private static readonly RETRYABLE_CODES = [
        'TIMEOUT',
        'ECONNREFUSED',
        'ECONNRESET',
        'ETIMEDOUT',
        'SERVICE_UNAVAILABLE'
    ];

    /**
     * Create a standardized Engineer error
     */
    static createError(
        code: string,
        message: string,
        severity: ErrorSeverity = ErrorSeverity.MEDIUM,
        context?: Record<string, any>
    ): EngineerError {
        const error = new Error(message) as EngineerError;
        error.code = code;
        error.severity = severity;
        error.context = context;
        error.retryable = this.isRetryable(code);
        error.timestamp = new Date();
        return error;
    }

    /**
     * Determine if an error is retryable
     */
    static isRetryable(code: string): boolean {
        return this.RETRYABLE_CODES.includes(code);
    }

    /**
     * Calculate backoff time for exponential backoff with jitter
     */
    static calculateBackoff(attempt: number, maxBackoff: number = 5000): number {
        const exponential = Math.pow(2, attempt) * 1000;
        const jitter = Math.random() * 1000;
        return Math.min(maxBackoff, exponential + jitter);
    }

    /**
     * Format error for logging
     */
    static formatErrorLog(error: EngineerError | Error): Record<string, any> {
        const engineerError = error as EngineerError;
        return {
            code: engineerError.code || 'UNKNOWN',
            message: error.message,
            severity: engineerError.severity || ErrorSeverity.MEDIUM,
            retryable: engineerError.retryable ?? false,
            timestamp: engineerError.timestamp || new Date(),
            context: engineerError.context || {},
            stack: error.stack
        };
    }

    /**
     * Extract error message from various error types
     */
    static extractMessage(error: any): string {
        if (error instanceof Error) {
            return error.message;
        }
        if (typeof error === 'string') {
            return error;
        }
        if (error?.response?.data?.message) {
            return error.response.data.message;
        }
        if (error?.response?.data?.error) {
            return error.response.data.error;
        }
        return 'Unknown error occurred';
    }

    /**
     * Extract HTTP status code from error
     */
    static extractStatusCode(error: any): number {
        return error?.response?.status || 500;
    }
}

/**
 * Retry strategy for service calls
 */
export interface RetryStrategy {
    maxAttempts: number;
    initialBackoff: number;
    maxBackoff: number;
    backoffMultiplier: number;
    timeoutMs: number;
}

export const DEFAULT_RETRY_STRATEGY: RetryStrategy = {
    maxAttempts: 3,
    initialBackoff: 1000,
    maxBackoff: 5000,
    backoffMultiplier: 2,
    timeoutMs: 30000
};

/**
 * Wrapper for retry logic
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    strategy: RetryStrategy = DEFAULT_RETRY_STRATEGY,
    onRetry?: (attempt: number, error: Error) => void
): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= strategy.maxAttempts; attempt++) {
        try {
            return await Promise.race([
                operation(),
                new Promise<T>((_, reject) =>
                    setTimeout(
                        () => reject(EngineerErrorHandler.createError(
                            'TIMEOUT',
                            `Operation ${operationName} timed out after ${strategy.timeoutMs}ms`,
                            ErrorSeverity.MEDIUM
                        )),
                        strategy.timeoutMs
                    )
                )
            ]);
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            const engineerError = error as EngineerError;

            if (attempt === strategy.maxAttempts || !engineerError.retryable) {
                throw lastError;
            }

            const backoff = EngineerErrorHandler.calculateBackoff(attempt - 1, strategy.maxBackoff);

            if (onRetry) {
                onRetry(attempt, lastError);
            }

            await new Promise(resolve => setTimeout(resolve, backoff));
        }
    }

    throw lastError || new Error(`Failed to execute ${operationName} after ${strategy.maxAttempts} attempts`);
}
