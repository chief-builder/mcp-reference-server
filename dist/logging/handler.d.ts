/**
 * Log level management and logging handler
 *
 * Implements RFC 5424 log level priorities and MCP logging protocol.
 * Supports logging/setLevel request and notifications/message notifications.
 */
import { z } from 'zod';
import { type JsonRpcNotification } from '../protocol/jsonrpc.js';
/**
 * RFC 5424 log levels with numeric priorities.
 * Lower number = higher priority (more severe).
 */
export declare const LOG_LEVEL_PRIORITY: {
    readonly emergency: 0;
    readonly alert: 1;
    readonly critical: 2;
    readonly error: 3;
    readonly warning: 4;
    readonly notice: 5;
    readonly info: 6;
    readonly debug: 7;
};
/**
 * Log level type - RFC 5424 compliant
 */
export declare const LogLevelSchema: z.ZodEnum<["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"]>;
export type LogLevel = z.infer<typeof LogLevelSchema>;
/**
 * Schema for logging/setLevel request params
 */
export declare const SetLevelParamsSchema: z.ZodObject<{
    level: z.ZodEnum<["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"]>;
}, "strip", z.ZodTypeAny, {
    level: "debug" | "info" | "notice" | "warning" | "error" | "critical" | "alert" | "emergency";
}, {
    level: "debug" | "info" | "notice" | "warning" | "error" | "critical" | "alert" | "emergency";
}>;
export type SetLevelParams = z.infer<typeof SetLevelParamsSchema>;
/**
 * Schema for notifications/message params
 */
export declare const LogMessageParamsSchema: z.ZodObject<{
    level: z.ZodEnum<["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"]>;
    message: z.ZodString;
    logger: z.ZodOptional<z.ZodString>;
    data: z.ZodOptional<z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    message: string;
    level: "debug" | "info" | "notice" | "warning" | "error" | "critical" | "alert" | "emergency";
    data?: unknown;
    logger?: string | undefined;
}, {
    message: string;
    level: "debug" | "info" | "notice" | "warning" | "error" | "critical" | "alert" | "emergency";
    data?: unknown;
    logger?: string | undefined;
}>;
export type LogMessageParams = z.infer<typeof LogMessageParamsSchema>;
/**
 * Notification sender function type
 */
export type NotificationSender = (notification: JsonRpcNotification) => void;
/**
 * Options for LoggingHandler constructor
 */
export interface LoggingHandlerOptions {
    /**
     * Initial minimum log level.
     * Defaults to value from MCP_LOG_LEVEL env var or 'info'.
     */
    minLevel?: LogLevel;
    /**
     * Function to send notifications to the client.
     * If not provided, notifications will be collected but not sent.
     */
    notificationSender?: NotificationSender;
}
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
export declare class LoggingHandler {
    private currentLevel;
    private notificationSender;
    constructor(options?: LoggingHandlerOptions);
    /**
     * Get the current minimum log level.
     *
     * @returns The current log level
     */
    getLevel(): LogLevel;
    /**
     * Set the minimum log level.
     *
     * This is called by the logging/setLevel request handler.
     * Only messages with priority <= this level will be emitted.
     *
     * @param level - The new minimum log level
     */
    setLevel(level: LogLevel): void;
    /**
     * Handle a logging/setLevel request.
     *
     * @param params - The request parameters containing the level
     * @returns Empty object on success
     * @throws Error if params are invalid
     */
    handleSetLevel(params: unknown): Record<string, never>;
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
    shouldLog(level: LogLevel): boolean;
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
    log(level: LogLevel, message: string, data?: unknown, logger?: string): void;
    /**
     * Set the notification sender function.
     *
     * @param sender - Function to send notifications to the client
     */
    setNotificationSender(sender: NotificationSender): void;
    /**
     * Log a debug message
     */
    debug(message: string, data?: unknown, logger?: string): void;
    /**
     * Log an info message
     */
    info(message: string, data?: unknown, logger?: string): void;
    /**
     * Log a notice message
     */
    notice(message: string, data?: unknown, logger?: string): void;
    /**
     * Log a warning message
     */
    warning(message: string, data?: unknown, logger?: string): void;
    /**
     * Log an error message
     */
    error(message: string, data?: unknown, logger?: string): void;
    /**
     * Log a critical message
     */
    critical(message: string, data?: unknown, logger?: string): void;
    /**
     * Log an alert message
     */
    alert(message: string, data?: unknown, logger?: string): void;
    /**
     * Log an emergency message
     */
    emergency(message: string, data?: unknown, logger?: string): void;
    /**
     * Send a notification to the client.
     *
     * @param notification - The JSON-RPC notification to send
     */
    private sendNotification;
}
//# sourceMappingURL=handler.d.ts.map