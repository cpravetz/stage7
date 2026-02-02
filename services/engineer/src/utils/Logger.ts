/**
 * Structured logging with request correlation IDs
 * Enables distributed tracing and better debugging
 */

import { v4 as uuidv4 } from 'uuid';

export interface LogContext {
    correlationId: string;
    operationId?: string;
    userId?: string;
    pluginId?: string;
    timestamp: Date;
    duration?: number;
}

export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR',
    TRACE = 'TRACE'
}

export interface LogEntry {
    level: LogLevel;
    message: string;
    context: LogContext;
    metadata?: Record<string, any>;
    error?: {
        code: string;
        message: string;
        stack?: string;
    };
}

class LoggerImpl {
    private context: LogContext | null = null;
    private readonly serviceName = 'Engineer';

    /**
     * Create a new context for operation tracing
     */
    createContext(operationId?: string, metadata?: Record<string, any>): LogContext {
        const context: LogContext = {
            correlationId: uuidv4(),
            operationId,
            timestamp: new Date(),
            ...metadata
        };
        this.context = context;
        return context;
    }

    /**
     * Get current context or create a new one
     */
    getContext(): LogContext {
        if (!this.context) {
            this.context = this.createContext();
        }
        return this.context;
    }

    /**
     * Set context (useful for continuing operations across services)
     */
    setContext(context: LogContext): void {
        this.context = context;
    }

    /**
     * Log at DEBUG level
     */
    debug(message: string, metadata?: Record<string, any>): void {
        this.log(LogLevel.DEBUG, message, metadata);
    }

    /**
     * Log at INFO level
     */
    info(message: string, metadata?: Record<string, any>): void {
        this.log(LogLevel.INFO, message, metadata);
    }

    /**
     * Log at WARN level
     */
    warn(message: string, metadata?: Record<string, any>): void {
        this.log(LogLevel.WARN, message, metadata);
    }

    /**
     * Log at ERROR level with error details
     */
    error(message: string, error?: Error | any, metadata?: Record<string, any>): void {
        const errorDetails = error ? {
            code: (error as any).code || 'UNKNOWN',
            message: error.message,
            stack: error.stack
        } : undefined;

        const entry: LogEntry = {
            level: LogLevel.ERROR,
            message,
            context: this.getContext(),
            metadata,
            error: errorDetails
        };

        this.writeLog(entry);
    }

    /**
     * Log at TRACE level (verbose debug info)
     */
    trace(message: string, metadata?: Record<string, any>): void {
        this.log(LogLevel.TRACE, message, metadata);
    }

    /**
     * Create a scoped logger for a specific operation
     */
    createScoped(operationId: string, metadata?: Record<string, any>): ScopedLogger {
        return new ScopedLogger(this, this.createContext(operationId, metadata));
    }

    /**
     * Internal logging method
     */
    private log(level: LogLevel, message: string, metadata?: Record<string, any>): void {
        const entry: LogEntry = {
            level,
            message,
            context: this.getContext(),
            metadata
        };
        this.writeLog(entry);
    }

    /**
     * Format and output log entry
     */
    private writeLog(entry: LogEntry): void {
        const timestamp = entry.context.timestamp.toISOString();
        const correlationId = entry.context.correlationId.substring(0, 8);
        const operationId = entry.context.operationId || '-';

        const logMessage = `[${timestamp}] [${entry.level}] [${this.serviceName}] [${correlationId}] [${operationId}] ${entry.message}`;

        // Output to console with metadata
        const consoleMethod = this.getConsoleMethod(entry.level);
        consoleMethod(logMessage, {
            context: entry.context,
            metadata: entry.metadata,
            error: entry.error
        });

        // Optional: Send to external logging service (e.g., ELK, Datadog)
        this.sendToExternalLogger(entry);
    }

    /**
     * Get appropriate console method for log level
     */
    private getConsoleMethod(level: LogLevel): any {
        switch (level) {
            case LogLevel.ERROR:
                return console.error;
            case LogLevel.WARN:
                return console.warn;
            case LogLevel.DEBUG:
            case LogLevel.TRACE:
                return console.debug;
            case LogLevel.INFO:
            default:
                return console.log;
        }
    }

    /**
     * Send logs to external service (placeholder for integration)
     */
    private sendToExternalLogger(entry: LogEntry): void {
        // TODO: Implement integration with ELK, Datadog, or other logging service
        // This would buffer logs and send them asynchronously
        if (process.env.EXTERNAL_LOGGER_ENABLED === 'true') {
            // Example: Send to external logger
            // externalLogger.log(entry);
        }
    }
}

export class ScopedLogger {
    private startTime: number = Date.now();

    constructor(
        private logger: LoggerImpl,
        private context: LogContext
    ) {
        logger.setContext(context);
    }

    debug(message: string, metadata?: Record<string, any>): void {
        this.logger.debug(message, { ...metadata, correlationId: this.context.correlationId });
    }

    info(message: string, metadata?: Record<string, any>): void {
        this.logger.info(message, { ...metadata, correlationId: this.context.correlationId });
    }

    warn(message: string, metadata?: Record<string, any>): void {
        this.logger.warn(message, { ...metadata, correlationId: this.context.correlationId });
    }

    error(message: string, error?: Error | any, metadata?: Record<string, any>): void {
        this.logger.error(message, error, { ...metadata, correlationId: this.context.correlationId });
    }

    trace(message: string, metadata?: Record<string, any>): void {
        this.logger.trace(message, { ...metadata, correlationId: this.context.correlationId });
    }

    /**
     * Log operation completion with duration
     */
    complete(message: string = 'Operation completed', metadata?: Record<string, any>): void {
        const duration = Date.now() - this.startTime;
        this.context.duration = duration;
        this.logger.info(message, {
            ...metadata,
            correlationId: this.context.correlationId,
            duration,
            durationMs: `${duration}ms`
        });
    }

    /**
     * Get the correlation ID for this operation
     */
    getCorrelationId(): string {
        return this.context.correlationId;
    }

    /**
     * Get the full context for passing to other services
     */
    getContext(): LogContext {
        return this.context;
    }
}

export default new LoggerImpl();
