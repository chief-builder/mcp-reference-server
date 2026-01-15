/**
 * Log level management and logging handler
 *
 * Implements RFC 5424 log level priorities and MCP logging protocol.
 * Supports logging/setLevel request and notifications/message notifications.
 */

import { z } from 'zod';
import { createNotification, type JsonRpcNotification } from '../protocol/jsonrpc.js';

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
} as const;

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

export type LogLevel = z.infer<typeof LogLevelSchema>;

/**
 * Schema for logging/setLevel request params
 */
export const SetLevelParamsSchema = z.object({
  level: LogLevelSchema,
});

export type SetLevelParams = z.infer<typeof SetLevelParamsSchema>;

/**
 * Schema for notifications/message params
 */
export const LogMessageParamsSchema = z.object({
  level: LogLevelSchema,
  message: z.string(),
  logger: z.string().optional(),
  data: z.unknown().optional(),
});

export type LogMessageParams = z.infer<typeof LogMessageParamsSchema>;

// =============================================================================
// Types
// =============================================================================

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
  private currentLevel: LogLevel;
  private notificationSender: NotificationSender | undefined;

  constructor(options: LoggingHandlerOptions = {}) {
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
  getLevel(): LogLevel {
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
  setLevel(level: LogLevel): void {
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
  handleSetLevel(params: unknown): Record<string, never> {
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
  shouldLog(level: LogLevel): boolean {
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
  log(level: LogLevel, message: string, data?: unknown, logger?: string): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const params: LogMessageParams = {
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
  setNotificationSender(sender: NotificationSender): void {
    this.notificationSender = sender;
  }

  // ===========================================================================
  // Convenience Methods
  // ===========================================================================

  /**
   * Log a debug message
   */
  debug(message: string, data?: unknown, logger?: string): void {
    this.log('debug', message, data, logger);
  }

  /**
   * Log an info message
   */
  info(message: string, data?: unknown, logger?: string): void {
    this.log('info', message, data, logger);
  }

  /**
   * Log a notice message
   */
  notice(message: string, data?: unknown, logger?: string): void {
    this.log('notice', message, data, logger);
  }

  /**
   * Log a warning message
   */
  warning(message: string, data?: unknown, logger?: string): void {
    this.log('warning', message, data, logger);
  }

  /**
   * Log an error message
   */
  error(message: string, data?: unknown, logger?: string): void {
    this.log('error', message, data, logger);
  }

  /**
   * Log a critical message
   */
  critical(message: string, data?: unknown, logger?: string): void {
    this.log('critical', message, data, logger);
  }

  /**
   * Log an alert message
   */
  alert(message: string, data?: unknown, logger?: string): void {
    this.log('alert', message, data, logger);
  }

  /**
   * Log an emergency message
   */
  emergency(message: string, data?: unknown, logger?: string): void {
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
  private sendNotification(notification: JsonRpcNotification): void {
    this.notificationSender?.(notification);
  }
}
