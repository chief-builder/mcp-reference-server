/**
 * Debug mode helper for verbose logging and performance timing
 *
 * Provides request/response dumping and performance timing when MCP_DEBUG=true.
 * Zero overhead when disabled.
 */
import { StructuredLogger } from './logger.js';
import type { Config } from '../config.js';
/**
 * Options for DebugHelper constructor
 */
export interface DebugHelperOptions {
    /** Whether debug mode is enabled (default: from MCP_DEBUG env) */
    enabled?: boolean;
    /** Logger instance to use for debug output */
    logger?: StructuredLogger;
}
/**
 * Result from timeAsync including timing breakdown
 */
export interface TimingResult<T> {
    /** The result from the timed function */
    result: T;
    /** Duration in milliseconds */
    durationMs: number;
}
/**
 * Debug helper for verbose logging and performance timing.
 *
 * When enabled (MCP_DEBUG=true), provides detailed request/response logging
 * and performance timing. When disabled, all methods are no-ops with minimal
 * overhead.
 *
 * @example
 * ```typescript
 * const debug = new DebugHelper({ enabled: true });
 *
 * // Log request details
 * debug.logRequest('tools/call', { name: 'myTool' }, 'req-123');
 *
 * // Time async operations
 * const result = await debug.timeAsync('database-query', async () => {
 *   return await db.query('SELECT * FROM users');
 * });
 *
 * // Dump objects for inspection
 * debug.dump('user-data', userData);
 * ```
 */
export declare class DebugHelper {
    private readonly enabled;
    private readonly logger;
    constructor(options?: DebugHelperOptions);
    /**
     * Check if debug mode is enabled.
     *
     * @returns true if debug mode is enabled
     */
    isEnabled(): boolean;
    /**
     * Log request details (only when enabled).
     *
     * Logs the full request parameters with request ID for correlation.
     * Large objects are automatically truncated.
     *
     * @param method - The RPC method name
     * @param params - Request parameters
     * @param requestId - Request ID for correlation
     */
    logRequest(method: string, params: unknown, requestId: string | number): void;
    /**
     * Log response details (only when enabled).
     *
     * Logs the full response result with duration and request ID.
     * Large objects are automatically truncated.
     *
     * @param requestId - Request ID for correlation
     * @param result - Response result
     * @param durationMs - Request duration in milliseconds
     */
    logResponse(requestId: string | number, result: unknown, durationMs: number): void;
    /**
     * Log error details (only when enabled).
     *
     * Logs error information with duration and request ID.
     *
     * @param requestId - Request ID for correlation
     * @param error - The error that occurred
     * @param durationMs - Request duration in milliseconds
     */
    logError(requestId: string | number, error: unknown, durationMs: number): void;
    /**
     * Time an async function execution.
     *
     * Uses high-resolution timing (performance.now()) and logs the duration.
     * Only logs when debug mode is enabled.
     *
     * @param name - Name of the operation being timed
     * @param fn - Async function to execute and time
     * @returns The result of the function
     *
     * @example
     * ```typescript
     * const users = await debug.timeAsync('fetch-users', async () => {
     *   return await userService.getAll();
     * });
     * ```
     */
    timeAsync<T>(name: string, fn: () => Promise<T>): Promise<T>;
    /**
     * Dump an object to the debug log.
     *
     * Useful for inspecting object state during debugging.
     * Large objects are automatically truncated.
     *
     * @param label - Label for the dump
     * @param obj - Object to dump
     */
    dump(label: string, obj: unknown): void;
}
/**
 * Create a DebugHelper using configuration.
 *
 * @param config - Configuration object with debug flag
 * @returns Configured DebugHelper instance
 *
 * @example
 * ```typescript
 * const config = loadConfig();
 * const debug = createDebugHelper(config);
 * ```
 */
export declare function createDebugHelper(config: Config): DebugHelper;
/**
 * Get the debug helper singleton.
 *
 * Creates the singleton on first call using the current config.
 *
 * @returns The debug helper singleton
 */
export declare function getDebugHelper(): DebugHelper;
/**
 * Reset the debug helper singleton (for testing).
 */
export declare function resetDebugHelper(): void;
//# sourceMappingURL=debug.d.ts.map