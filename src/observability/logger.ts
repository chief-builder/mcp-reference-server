/**
 * Structured JSON logging with OpenTelemetry correlation
 *
 * Provides structured logging that outputs JSON with trace correlation.
 * Integrates with RFC 5424 log levels and OpenTelemetry context.
 */

import { trace, context } from '@opentelemetry/api';
import { LOG_LEVEL_PRIORITY, type LogLevel, LogLevelSchema } from '../logging/handler.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Structured log entry format
 */
export interface LogEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** RFC 5424 level name */
  level: string;
  /** Log message */
  message: string;
  /** Logger name/component */
  logger?: string;
  /** OpenTelemetry trace ID */
  traceId?: string;
  /** OpenTelemetry span ID */
  spanId?: string;
  /** Additional structured data */
  data?: unknown;
}

/**
 * Options for StructuredLogger constructor
 */
export interface StructuredLoggerOptions {
  /** Logger name/component identifier */
  name?: string;
  /** Minimum log level (default: from MCP_LOG_LEVEL env or 'info') */
  minLevel?: LogLevel;
  /** Output function (default: console.log) */
  output?: (json: string) => void;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Gets the minimum log level from environment or default
 */
function getDefaultLogLevel(): LogLevel {
  const envLevel = process.env['MCP_LOG_LEVEL'];
  if (envLevel) {
    const result = LogLevelSchema.safeParse(envLevel);
    if (result.success) {
      return result.data;
    }
  }
  return 'info';
}

/**
 * Extracts trace context from the current OpenTelemetry span
 */
function getTraceContext(): { traceId?: string; spanId?: string } {
  const span = trace.getSpan(context.active());
  if (!span) {
    return {};
  }

  const spanContext = span.spanContext();
  // Check for valid (non-zero) trace context
  if (
    spanContext.traceId === '00000000000000000000000000000000' ||
    spanContext.spanId === '0000000000000000'
  ) {
    return {};
  }

  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };
}

// =============================================================================
// StructuredLogger Class
// =============================================================================

/**
 * Structured JSON logger with OpenTelemetry trace correlation.
 *
 * Outputs NDJSON format logs with RFC 5424 levels and automatic
 * trace ID/span ID inclusion from the current OpenTelemetry context.
 *
 * @example
 * ```typescript
 * const logger = new StructuredLogger({ name: 'my-component' });
 *
 * logger.info('Server started', { port: 3000 });
 * // Output: {"timestamp":"2025-01-15T...","level":"info","message":"Server started","logger":"my-component","data":{"port":3000}}
 *
 * // Create child logger with additional context
 * const childLogger = logger.child('request-handler');
 * childLogger.debug('Processing request', { requestId: '123' });
 * ```
 */
export class StructuredLogger {
  private readonly name?: string;
  private readonly minLevel: LogLevel;
  private readonly output: (json: string) => void;

  constructor(options: StructuredLoggerOptions = {}) {
    if (options.name !== undefined) {
      this.name = options.name;
    }
    this.minLevel = options.minLevel ?? getDefaultLogLevel();
    this.output = options.output ?? console.log;
  }

  // ===========================================================================
  // Level Checking
  // ===========================================================================

  /**
   * Check if a message at the given level should be logged.
   *
   * @param level - The log level to check
   * @returns true if the message should be logged
   */
  shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] <= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  /**
   * Get the current minimum log level.
   */
  getLevel(): LogLevel {
    return this.minLevel;
  }

  /**
   * Get the logger name.
   */
  getName(): string | undefined {
    return this.name;
  }

  // ===========================================================================
  // Core Logging
  // ===========================================================================

  /**
   * Log a message at the specified level.
   *
   * @param level - The log level
   * @param message - The log message
   * @param data - Optional additional structured data
   */
  log(level: LogLevel, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    if (this.name !== undefined) {
      entry.logger = this.name;
    }

    // Add trace context if available
    const traceContext = getTraceContext();
    if (traceContext.traceId) {
      entry.traceId = traceContext.traceId;
    }
    if (traceContext.spanId) {
      entry.spanId = traceContext.spanId;
    }

    if (data !== undefined) {
      entry.data = data;
    }

    this.output(JSON.stringify(entry));
  }

  // ===========================================================================
  // Convenience Methods (RFC 5424 Levels)
  // ===========================================================================

  /**
   * Log a debug message (level 7)
   */
  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  /**
   * Log an info message (level 6)
   */
  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  /**
   * Log a notice message (level 5)
   */
  notice(message: string, data?: unknown): void {
    this.log('notice', message, data);
  }

  /**
   * Log a warning message (level 4)
   */
  warning(message: string, data?: unknown): void {
    this.log('warning', message, data);
  }

  /**
   * Log an error message (level 3)
   */
  error(message: string, data?: unknown): void {
    this.log('error', message, data);
  }

  /**
   * Log a critical message (level 2)
   */
  critical(message: string, data?: unknown): void {
    this.log('critical', message, data);
  }

  /**
   * Log an alert message (level 1)
   */
  alert(message: string, data?: unknown): void {
    this.log('alert', message, data);
  }

  /**
   * Log an emergency message (level 0)
   */
  emergency(message: string, data?: unknown): void {
    this.log('emergency', message, data);
  }

  // ===========================================================================
  // Child Loggers
  // ===========================================================================

  /**
   * Create a child logger with an additional name component.
   *
   * The child inherits the parent's min level and output function.
   * The name is formed by joining parent name and child name with '.'.
   *
   * @param childName - Name for the child logger
   * @returns A new StructuredLogger instance
   *
   * @example
   * ```typescript
   * const logger = new StructuredLogger({ name: 'server' });
   * const requestLogger = logger.child('request');
   * // requestLogger.name === 'server.request'
   * ```
   */
  child(childName: string): StructuredLogger {
    const newName = this.name ? `${this.name}.${childName}` : childName;
    return new StructuredLogger({
      name: newName,
      minLevel: this.minLevel,
      output: this.output,
    });
  }
}

// =============================================================================
// Exports
// =============================================================================

export { type LogLevel } from '../logging/handler.js';
