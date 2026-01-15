/**
 * Structured JSON logging with OpenTelemetry correlation
 *
 * Provides structured logging that outputs JSON with trace correlation.
 * Integrates with RFC 5424 log levels and OpenTelemetry context.
 */
import { type LogLevel } from '../logging/handler.js';
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
export declare class StructuredLogger {
    private readonly name?;
    private readonly minLevel;
    private readonly output;
    constructor(options?: StructuredLoggerOptions);
    /**
     * Check if a message at the given level should be logged.
     *
     * @param level - The log level to check
     * @returns true if the message should be logged
     */
    shouldLog(level: LogLevel): boolean;
    /**
     * Get the current minimum log level.
     */
    getLevel(): LogLevel;
    /**
     * Get the logger name.
     */
    getName(): string | undefined;
    /**
     * Log a message at the specified level.
     *
     * @param level - The log level
     * @param message - The log message
     * @param data - Optional additional structured data
     */
    log(level: LogLevel, message: string, data?: unknown): void;
    /**
     * Log a debug message (level 7)
     */
    debug(message: string, data?: unknown): void;
    /**
     * Log an info message (level 6)
     */
    info(message: string, data?: unknown): void;
    /**
     * Log a notice message (level 5)
     */
    notice(message: string, data?: unknown): void;
    /**
     * Log a warning message (level 4)
     */
    warning(message: string, data?: unknown): void;
    /**
     * Log an error message (level 3)
     */
    error(message: string, data?: unknown): void;
    /**
     * Log a critical message (level 2)
     */
    critical(message: string, data?: unknown): void;
    /**
     * Log an alert message (level 1)
     */
    alert(message: string, data?: unknown): void;
    /**
     * Log an emergency message (level 0)
     */
    emergency(message: string, data?: unknown): void;
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
    child(childName: string): StructuredLogger;
}
export { type LogLevel } from '../logging/handler.js';
//# sourceMappingURL=logger.d.ts.map