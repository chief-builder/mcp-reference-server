/**
 * Log level management and logging handler
 *
 * Implements RFC 5424 log level priorities and MCP logging protocol.
 * Supports logging/setLevel request and notifications/message notifications.
 */
import { z } from 'zod';
import { createNotification } from '../protocol/jsonrpc.js';
// =============================================================================
// Constants - RFC 5424 Log Levels
// =============================================================================
/**
 * RFC 5424 log levels with numeric priorities.
 * Lower number = higher priority (more severe).
 */
export const LOG_LEVEL_PRIORITY = {
    emergency: 0, // System is unusable
    alert: 1, // Action must be taken immediately
    critical: 2, // Critical conditions
    error: 3, // Error conditions
    warning: 4, // Warning conditions
    notice: 5, // Normal but significant condition
    info: 6, // Informational messages
    debug: 7, // Debug-level messages
};
// =============================================================================
// Schemas
// =============================================================================
/**
 * Log level type - RFC 5424 compliant
 */
export const LogLevelSchema = z.enum([
    'debug',
    'info',
    'notice',
    'warning',
    'error',
    'critical',
    'alert',
    'emergency',
]);
/**
 * Schema for logging/setLevel request params
 */
export const SetLevelParamsSchema = z.object({
    level: LogLevelSchema,
});
/**
 * Schema for notifications/message params
 */
export const LogMessageParamsSchema = z.object({
    level: LogLevelSchema,
    message: z.string(),
    logger: z.string().optional(),
    data: z.unknown().optional(),
});
// =============================================================================
// LoggingHandler Class
// =============================================================================
/**
 * Handler for logging operations in MCP.
 *
 * Manages log level configuration and emits log notifications to clients.
 * Follows RFC 5424 log level priorities where lower numbers are more severe.
 *
 * @example
 * ```typescript
 * const handler = new LoggingHandler({
 *   minLevel: 'info',
 *   notificationSender: (notification) => transport.send(notification)
 * });
 *
 * // Set level via logging/setLevel request
 * handler.setLevel('debug');
 *
 * // Log messages
 * handler.log('info', 'Server started', { port: 3000 }, 'server');
 * ```
 */
export class LoggingHandler {
    currentLevel;
    notificationSender;
    constructor(options = {}) {
        this.currentLevel = options.minLevel ?? 'info';
        this.notificationSender = options.notificationSender ?? undefined;
    }
    // ===========================================================================
    // Level Management
    // ===========================================================================
    /**
     * Get the current minimum log level.
     *
     * @returns The current log level
     */
    getLevel() {
        return this.currentLevel;
    }
    /**
     * Set the minimum log level.
     *
     * This is called by the logging/setLevel request handler.
     * Only messages with priority <= this level will be emitted.
     *
     * @param level - The new minimum log level
     */
    setLevel(level) {
        const parseResult = LogLevelSchema.safeParse(level);
        if (parseResult.success) {
            this.currentLevel = parseResult.data;
        }
    }
    /**
     * Handle a logging/setLevel request.
     *
     * @param params - The request parameters containing the level
     * @returns Empty object on success
     * @throws Error if params are invalid
     */
    handleSetLevel(params) {
        const parseResult = SetLevelParamsSchema.safeParse(params);
        if (!parseResult.success) {
            throw new Error(`Invalid params: ${parseResult.error.message}`);
        }
        this.setLevel(parseResult.data.level);
        return {};
    }
    // ===========================================================================
    // Logging
    // ===========================================================================
    /**
     * Check if a message at the given level should be logged.
     *
     * A message is logged if its priority (RFC 5424 numeric value) is
     * less than or equal to the current level's priority.
     * Lower number = higher priority = more severe.
     *
     * @param level - The log level to check
     * @returns true if the message should be logged
     */
    shouldLog(level) {
        return LOG_LEVEL_PRIORITY[level] <= LOG_LEVEL_PRIORITY[this.currentLevel];
    }
    /**
     * Log a message at the specified level.
     *
     * Sends a notifications/message notification to the client if:
     * 1. The message level priority <= current level priority
     * 2. A notification sender is configured
     *
     * @param level - The log level for this message
     * @param message - The log message text
     * @param data - Optional additional data to include
     * @param logger - Optional logger name/category
     */
    log(level, message, data, logger) {
        if (!this.shouldLog(level)) {
            return;
        }
        const params = {
            level,
            message,
        };
        if (logger !== undefined) {
            params.logger = logger;
        }
        if (data !== undefined) {
            params.data = data;
        }
        const notification = createNotification('notifications/message', params);
        this.sendNotification(notification);
    }
    /**
     * Set the notification sender function.
     *
     * @param sender - Function to send notifications to the client
     */
    setNotificationSender(sender) {
        this.notificationSender = sender;
    }
    // ===========================================================================
    // Convenience Methods
    // ===========================================================================
    /**
     * Log a debug message
     */
    debug(message, data, logger) {
        this.log('debug', message, data, logger);
    }
    /**
     * Log an info message
     */
    info(message, data, logger) {
        this.log('info', message, data, logger);
    }
    /**
     * Log a notice message
     */
    notice(message, data, logger) {
        this.log('notice', message, data, logger);
    }
    /**
     * Log a warning message
     */
    warning(message, data, logger) {
        this.log('warning', message, data, logger);
    }
    /**
     * Log an error message
     */
    error(message, data, logger) {
        this.log('error', message, data, logger);
    }
    /**
     * Log a critical message
     */
    critical(message, data, logger) {
        this.log('critical', message, data, logger);
    }
    /**
     * Log an alert message
     */
    alert(message, data, logger) {
        this.log('alert', message, data, logger);
    }
    /**
     * Log an emergency message
     */
    emergency(message, data, logger) {
        this.log('emergency', message, data, logger);
    }
    // ===========================================================================
    // Private Methods
    // ===========================================================================
    /**
     * Send a notification to the client.
     *
     * @param notification - The JSON-RPC notification to send
     */
    sendNotification(notification) {
        this.notificationSender?.(notification);
    }
}
//# sourceMappingURL=handler.js.map