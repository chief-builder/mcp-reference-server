/**
 * Debug mode helper for verbose logging and performance timing
 *
 * Provides request/response dumping and performance timing when MCP_DEBUG=true.
 * Zero overhead when disabled.
 */

import { StructuredLogger } from './logger.js';
import type { Config } from '../config.js';
import { getConfig } from '../config.js';

// =============================================================================
// Constants
// =============================================================================

/** Maximum size in bytes before truncating debug output */
const MAX_DUMP_SIZE_BYTES = 1024;

/** Truncation marker */
const TRUNCATION_MARKER = '... [truncated]';

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Truncates an object's JSON representation if it exceeds the max size
 */
function truncateForDump(obj: unknown): unknown {
  // Handle primitives that JSON.stringify handles specially
  if (obj === undefined) {
    return undefined;
  }

  try {
    const json = JSON.stringify(obj);
    if (json.length <= MAX_DUMP_SIZE_BYTES) {
      return obj;
    }

    // Return a truncated representation
    const truncatedJson = json.slice(0, MAX_DUMP_SIZE_BYTES);
    return {
      __truncated: true,
      __originalSize: json.length,
      __preview: truncatedJson + TRUNCATION_MARKER,
    };
  } catch {
    // If serialization fails, return a safe representation
    return {
      __serializationError: true,
      __type: typeof obj,
      __constructor: obj?.constructor?.name ?? 'unknown',
    };
  }
}

/**
 * Formats error for debug output
 */
function formatError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    type: typeof error,
    value: String(error),
  };
}

// =============================================================================
// DebugHelper Class
// =============================================================================

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
export class DebugHelper {
  private readonly enabled: boolean;
  private readonly logger: StructuredLogger;

  constructor(options: DebugHelperOptions = {}) {
    // Default to env var or false
    this.enabled = options.enabled ?? (process.env['MCP_DEBUG'] === 'true' || process.env['MCP_DEBUG'] === '1');
    this.logger = options.logger ?? new StructuredLogger({
      name: 'debug',
      minLevel: 'debug',
    });
  }

  // ===========================================================================
  // State Checking
  // ===========================================================================

  /**
   * Check if debug mode is enabled.
   *
   * @returns true if debug mode is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  // ===========================================================================
  // Request/Response Logging
  // ===========================================================================

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
  logRequest(method: string, params: unknown, requestId: string | number): void {
    if (!this.enabled) {
      return;
    }

    this.logger.debug('Request received', {
      requestId,
      method,
      params: truncateForDump(params),
    });
  }

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
  logResponse(requestId: string | number, result: unknown, durationMs: number): void {
    if (!this.enabled) {
      return;
    }

    this.logger.debug('Response sent', {
      requestId,
      durationMs: Math.round(durationMs * 100) / 100,
      result: truncateForDump(result),
    });
  }

  /**
   * Log error details (only when enabled).
   *
   * Logs error information with duration and request ID.
   *
   * @param requestId - Request ID for correlation
   * @param error - The error that occurred
   * @param durationMs - Request duration in milliseconds
   */
  logError(requestId: string | number, error: unknown, durationMs: number): void {
    if (!this.enabled) {
      return;
    }

    this.logger.debug('Request failed', {
      requestId,
      durationMs: Math.round(durationMs * 100) / 100,
      error: formatError(error),
    });
  }

  // ===========================================================================
  // Performance Timing
  // ===========================================================================

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
  async timeAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (!this.enabled) {
      return fn();
    }

    const start = performance.now();
    try {
      const result = await fn();
      const durationMs = performance.now() - start;
      this.logger.debug('Operation completed', {
        operation: name,
        durationMs: Math.round(durationMs * 100) / 100,
        status: 'success',
      });
      return result;
    } catch (error) {
      const durationMs = performance.now() - start;
      this.logger.debug('Operation failed', {
        operation: name,
        durationMs: Math.round(durationMs * 100) / 100,
        status: 'error',
        error: formatError(error),
      });
      throw error;
    }
  }

  // ===========================================================================
  // Object Dumping
  // ===========================================================================

  /**
   * Dump an object to the debug log.
   *
   * Useful for inspecting object state during debugging.
   * Large objects are automatically truncated.
   *
   * @param label - Label for the dump
   * @param obj - Object to dump
   */
  dump(label: string, obj: unknown): void {
    if (!this.enabled) {
      return;
    }

    this.logger.debug(`Dump: ${label}`, {
      value: truncateForDump(obj),
    });
  }
}

// =============================================================================
// Factory Function
// =============================================================================

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
export function createDebugHelper(config: Config): DebugHelper {
  return new DebugHelper({
    enabled: config.debug,
  });
}

// =============================================================================
// Singleton
// =============================================================================

let debugHelperSingleton: DebugHelper | null = null;

/**
 * Get the debug helper singleton.
 *
 * Creates the singleton on first call using the current config.
 *
 * @returns The debug helper singleton
 */
export function getDebugHelper(): DebugHelper {
  if (!debugHelperSingleton) {
    debugHelperSingleton = createDebugHelper(getConfig());
  }
  return debugHelperSingleton;
}

/**
 * Reset the debug helper singleton (for testing).
 */
export function resetDebugHelper(): void {
  debugHelperSingleton = null;
}
