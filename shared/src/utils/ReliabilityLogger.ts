import { v4 as uuidv4 } from 'uuid';

/**
 * Log levels for the ReliabilityLogger
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

/**
 * Configuration options for ReliabilityLogger
 */
export interface ReliabilityLoggerConfig {
  /**
   * Minimum log level to output
   * @default LogLevel.INFO
   */
  minLogLevel?: LogLevel;
  
  /**
   * Whether to include timestamps in log messages
   * @default true
   */
  includeTimestamps?: boolean;
  
  /**
   * Whether to include component/source information in log messages
   * @default true
   */
  includeComponent?: boolean;
  
  /**
   * Custom prefix for all log messages
   */
  prefix?: string;
  
  /**
   * Whether to track reliability metrics
   * @default true
   */
  trackReliability?: boolean;
  
  /**
   * Maximum number of error entries to keep in memory
   * @default 1000
   */
  maxErrorHistory?: number;
}

/**
 * Error tracking entry for reliability monitoring
 */
export interface ErrorEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  error?: Error;
  context?: Record<string, any>;
  component?: string;
  stackTrace?: string;
}

/**
 * Reliability metrics collected by the logger
 */
export interface ReliabilityMetrics {
  totalLogs: number;
  errorsByLevel: Record<LogLevel, number>;
  errorRate: number;
  lastErrorTimestamp?: Date;
  uptimeSeconds: number;
  errorHistory: ErrorEntry[];
}

/**
 * Comprehensive logger with reliability tracking capabilities
 * 
 * The ReliabilityLogger provides enhanced logging features including:
 * - Multiple log levels (DEBUG, INFO, WARN, ERROR, CRITICAL)
 * - Reliability metrics tracking
 * - Error history and analysis
 * - Context-aware logging
 * - Compatibility with existing console-based logging patterns
 */
export class ReliabilityLogger {
  private config: Required<ReliabilityLoggerConfig>;
  private startTime: Date;
  private metrics: ReliabilityMetrics;
  private componentName: string;

  /**
   * Create a new ReliabilityLogger instance
   * 
   * @param componentName Name of the component using this logger (for context)
   * @param config Optional configuration for the logger
   */
  constructor(componentName: string, config: ReliabilityLoggerConfig = {}) {
    this.componentName = componentName;
    this.startTime = new Date();
    
    // Set default configuration
    this.config = {
      minLogLevel: config.minLogLevel || LogLevel.INFO,
      includeTimestamps: config.includeTimestamps !== false, // default true
      includeComponent: config.includeComponent !== false, // default true
      prefix: config.prefix || '',
      trackReliability: config.trackReliability !== false, // default true
      maxErrorHistory: config.maxErrorHistory || 1000
    };

    // Initialize metrics
    this.metrics = {
      totalLogs: 0,
      errorsByLevel: {
        [LogLevel.DEBUG]: 0,
        [LogLevel.INFO]: 0,
        [LogLevel.WARN]: 0,
        [LogLevel.ERROR]: 0,
        [LogLevel.CRITICAL]: 0
      },
      errorRate: 0,
      uptimeSeconds: 0,
      errorHistory: []
    };
  }

  /**
   * Get the current reliability metrics
   */
  getMetrics(): ReliabilityMetrics {
    if (this.config.trackReliability) {
      const totalErrors = this.metrics.errorsByLevel[LogLevel.ERROR] + 
                         this.metrics.errorsByLevel[LogLevel.CRITICAL];
      const uptime = this.getUptimeSeconds();
      
      this.metrics = {
        ...this.metrics,
        errorRate: uptime > 0 ? totalErrors / uptime : 0,
        uptimeSeconds: uptime
      };
    }
    
    return this.metrics;
  }

  /**
   * Get uptime in seconds
   */
  private getUptimeSeconds(): number {
    return Math.floor((new Date().getTime() - this.startTime.getTime()) / 1000);
  }

  /**
   * Format a log message with consistent structure
   */
  private formatMessage(level: LogLevel, message: string, context?: Record<string, any>): string {
    const parts: string[] = [];
    
    // Add prefix if configured
    if (this.config.prefix) {
      parts.push(this.config.prefix);
    }

    // Add timestamp if configured
    if (this.config.includeTimestamps) {
      const timestamp = new Date().toISOString();
      parts.push(`[${timestamp}]`);
    }

    // Add log level
    parts.push(`[${level}]`);

    // Add component name if configured
    if (this.config.includeComponent && this.componentName) {
      parts.push(`[${this.componentName}]`);
    }

    // Add the main message
    parts.push(message);

    // Add context if provided
    if (context && Object.keys(context).length > 0) {
      try {
        const contextStr = JSON.stringify(context);
        parts.push(`Context: ${contextStr}`);
      } catch (e) {
        parts.push(`Context: [unserializable]`);
      }
    }

    return parts.join(' ');
  }

  /**
   * Track an error in the reliability metrics
   */
  private trackError(level: LogLevel, message: string, error?: Error, context?: Record<string, any>): void {
    if (!this.config.trackReliability) return;

    const errorEntry: ErrorEntry = {
      id: uuidv4(),
      timestamp: new Date(),
      level,
      message,
      error,
      context,
      component: this.componentName,
      stackTrace: error?.stack
    };

    // Add to error history
    this.metrics.errorHistory.push(errorEntry);
    
    // Limit error history size
    if (this.metrics.errorHistory.length > this.config.maxErrorHistory) {
      this.metrics.errorHistory.shift(); // Remove oldest entry
    }

    // Update error count
    this.metrics.errorsByLevel[level]++;
  }

  /**
   * Log a message at DEBUG level
   */
  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log a message at INFO level
   */
  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log a message at WARN level
   */
  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log a message at ERROR level
   */
  error(message: string, error?: Error, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  /**
   * Log a message at CRITICAL level
   */
  critical(message: string, error?: Error, context?: Record<string, any>): void {
    this.log(LogLevel.CRITICAL, message, context, error);
  }

  /**
   * Main logging method that handles all log levels
   */
  private log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
    // Check if this log level should be output based on minLogLevel
    const levelPriority = this.getLogLevelPriority(level);
    const minLevelPriority = this.getLogLevelPriority(this.config.minLogLevel);
    
    if (levelPriority < minLevelPriority) {
      return; // Skip logging if below minimum level
    }

    const formattedMessage = this.formatMessage(level, message, context);
    
    // Output to console using the appropriate method
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formattedMessage);
        break;
      case LogLevel.INFO:
        console.info(formattedMessage);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage);
        break;
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        console.error(formattedMessage);
        break;
      default:
        console.log(formattedMessage);
    }

    // Update metrics
    this.metrics.totalLogs++;
    
    // Track errors for reliability monitoring
    if (level === LogLevel.ERROR || level === LogLevel.CRITICAL) {
      this.trackError(level, message, error, context);
    }
  }

  /**
   * Get numerical priority for log levels (higher number = higher priority)
   */
  private getLogLevelPriority(level: LogLevel): number {
    switch (level) {
      case LogLevel.DEBUG: return 1;
      case LogLevel.INFO: return 2;
      case LogLevel.WARN: return 3;
      case LogLevel.ERROR: return 4;
      case LogLevel.CRITICAL: return 5;
      default: return 2; // Default to INFO level
    }
  }

  /**
   * Get recent error history
   * 
   * @param limit Maximum number of errors to return
   * @param minLevel Minimum log level to include
   */
  getErrorHistory(limit: number = 10, minLevel: LogLevel = LogLevel.ERROR): ErrorEntry[] {
    return this.metrics.errorHistory
      .filter(entry => this.getLogLevelPriority(entry.level) >= this.getLogLevelPriority(minLevel))
      .slice(-limit); // Get most recent errors
  }

  /**
   * Clear error history
   */
  clearErrorHistory(): void {
    this.metrics.errorHistory = [];
  }

  /**
   * Create a child logger with additional context
   * 
   * @param subcomponent Name of the subcomponent
   * @param additionalConfig Additional configuration to merge
   */
  createChildLogger(subcomponent: string, additionalConfig: ReliabilityLoggerConfig = {}): ReliabilityLogger {
    const childComponentName = this.componentName ? `${this.componentName}.${subcomponent}` : subcomponent;
    
    return new ReliabilityLogger(childComponentName, {
      ...this.config,
      ...additionalConfig
    });
  }

  /**
   * Reset reliability metrics (useful for testing or periodic reporting)
   */
  resetMetrics(): void {
    this.startTime = new Date();
    this.metrics = {
      totalLogs: 0,
      errorsByLevel: {
        [LogLevel.DEBUG]: 0,
        [LogLevel.INFO]: 0,
        [LogLevel.WARN]: 0,
        [LogLevel.ERROR]: 0,
        [LogLevel.CRITICAL]: 0
      },
      errorRate: 0,
      uptimeSeconds: 0,
      errorHistory: []
    };
  }

  /**
   * Check if the logger would output messages at the specified level
   * 
   * @param level Log level to check
   */
  wouldLog(level: LogLevel): boolean {
    const levelPriority = this.getLogLevelPriority(level);
    const minLevelPriority = this.getLogLevelPriority(this.config.minLogLevel);
    return levelPriority >= minLevelPriority;
  }

  /**
   * Get the current configuration
   */
  getConfig(): Required<ReliabilityLoggerConfig> {
    return { ...this.config };
  }

  /**
   * Update the logger configuration
   * 
   * @param newConfig New configuration to merge with existing
   */
  updateConfig(newConfig: ReliabilityLoggerConfig): void {
    this.config = { ...this.config, ...newConfig };
  }
}