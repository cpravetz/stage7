import { Tool } from '../types';

/**
 * ErrorSeverity — how serious is this error?
 * - transient: retryable (network, timeout)
 * - permanent: won't fix itself (missing tool, bad config)
 * - user: the user must do something (missing input, not-connected)
 */
export enum ErrorSeverity {
  TRANSIENT = 'transient',
  PERMANENT = 'permanent',
  USER = 'user',
}

/**
 * ErrorCategory — what kind of error is this?
 */
export enum ErrorCategory {
  TIMEOUT = 'timeout',
  MISSING_TOOL = 'missing_tool',
  NOT_CONNECTED = 'not_connected',
  EXECUTION = 'execution',
  NETWORK = 'network',
  VALIDATION = 'validation',
  UNKNOWN = 'unknown',
}

export interface ClassifiedError {
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  userMessage: string;
  retryable: boolean;
  originalError?: string;
}

/**
 * ErrorHandler class — classifies errors and routes them appropriately.
 *
 * Design principles (from docs/assistants design 0915-3.md):
 * 1. Missing tools → permanent error with helpful message
 * 2. Timeouts → transient error, retryable
 * 3. Not-connected → user error, assistant-addressable
 * 4. Code errors → go to the code-healing path (already exists in ToolExecutor)
 * 5. Data/state errors → assistant-addressable, not code errors
 */
export class ErrorHandler {
  /**
   * Classify an error message into a structured ClassifiedError.
   */
  static classify(error: string | undefined | null, toolId?: string): ClassifiedError {
    if (!error) {
      return {
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.PERMANENT,
        message: 'Unknown error',
        userMessage: 'Something went wrong. Please try again.',
        retryable: false,
      };
    }

    const msg = String(error);

    // Timeout detection
    if (/timed out|timeout|TIMEOUT/i.test(msg)) {
      return {
        category: ErrorCategory.TIMEOUT,
        severity: ErrorSeverity.TRANSIENT,
        message: msg,
        userMessage: 'The operation took too long and was cancelled. This may be due to a slow external service. Please try again.',
        retryable: true,
        originalError: msg,
      };
    }

    // Missing tool detection
    if (/Tool not found|tool not found|not registered|not in registry/i.test(msg)) {
      return {
        category: ErrorCategory.MISSING_TOOL,
        severity: ErrorSeverity.PERMANENT,
        message: msg,
        userMessage: toolId
          ? `The tool "${toolId}" is not available. This is a configuration issue — please contact support.`
          : 'A required tool is not available. This is a configuration issue — please contact support.',
        retryable: false,
        originalError: msg,
      };
    }

    // Not-connected detection
    if (/not.connected|not connected|not-connected|not_connected/i.test(msg)) {
      return {
        category: ErrorCategory.NOT_CONNECTED,
        severity: ErrorSeverity.USER,
        message: msg,
        userMessage: msg, // Already user-friendly from the wrapper
        retryable: false,
        originalError: msg,
      };
    }

    // Network errors
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|network error|Network error/i.test(msg)) {
      return {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.TRANSIENT,
        message: msg,
        userMessage: 'Could not connect to the external service. Please check your connection and try again.',
        retryable: true,
        originalError: msg,
      };
    }

    // Validation errors
    if (/invalid|validation|schema|required field/i.test(msg)) {
      return {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.USER,
        message: msg,
        userMessage: msg,
        retryable: false,
        originalError: msg,
      };
    }

    // Execution errors (code ran but failed)
    if (/execution|exitCode|error:/i.test(msg)) {
      return {
        category: ErrorCategory.EXECUTION,
        severity: ErrorSeverity.TRANSIENT,
        message: msg,
        userMessage: 'The tool encountered an execution error. The code healing system will attempt to fix it automatically.',
        retryable: true,
        originalError: msg,
      };
    }

    // Default: unknown
    return {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.PERMANENT,
      message: msg,
      userMessage: 'An unexpected error occurred. Please try again or contact support.',
      retryable: false,
      originalError: msg,
    };
  }

  /**
   * Format a ClassifiedError for the tool execution result.
   * Returns a user-friendly error object that the frontend can display.
   */
  static formatResult(classified: ClassifiedError): { error: string; exitCode: number; classified?: ClassifiedError } {
    return {
      error: classified.userMessage,
      exitCode: -1,
      classified,
    };
  }

  /**
   * Check if an error is a code execution error that should go through the healing path.
   */
  static isCodeExecutionError(classified: ClassifiedError): boolean {
    return classified.category === ErrorCategory.EXECUTION ||
           classified.category === ErrorCategory.TIMEOUT;
  }

  /**
   * Check if an error is assistant-addressable (user can fix it by providing input).
   */
  static isAssistantAddressable(classified: ClassifiedError): boolean {
    return classified.severity === ErrorSeverity.USER ||
           classified.category === ErrorCategory.NOT_CONNECTED ||
           classified.category === ErrorCategory.VALIDATION;
  }
}

export default ErrorHandler;