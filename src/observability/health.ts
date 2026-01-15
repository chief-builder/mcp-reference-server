/**
 * Health check endpoints
 *
 * Implements:
 * - Liveness checks (/health)
 * - Readiness checks (/ready)
 * - Dependency status monitoring
 * - Proper HTTP status codes
 */

import express, { Router, Request, Response } from 'express';
import type { ShutdownManager } from '../server.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Result of a single health check
 */
export interface CheckResult {
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  timestamp?: string;
}

/**
 * Health check response format
 */
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  checks: {
    [name: string]: {
      status: 'pass' | 'fail' | 'warn';
      message?: string;
      timestamp?: string;
    };
  };
  version?: string;
  uptime?: number; // seconds
}

/**
 * Health check function type
 */
export type HealthCheckFn = () => Promise<CheckResult> | CheckResult;

/**
 * Options for creating built-in checks
 */
export interface BuiltInCheckOptions {
  /**
   * Memory usage warning threshold (0-1). Default: 0.9 (90%)
   */
  memoryThreshold?: number;

  /**
   * Event loop lag warning threshold in milliseconds. Default: 100
   */
  eventLoopLagThreshold?: number;

  /**
   * ShutdownManager instance for shutdown state check
   */
  shutdownManager?: ShutdownManager;
}

// =============================================================================
// HealthChecker Class
// =============================================================================

/**
 * Manages health checks for the MCP server
 *
 * Features:
 * - Register custom health checks
 * - Built-in checks for memory, event loop, shutdown state
 * - Liveness check (always healthy if process is running)
 * - Readiness check (all checks must pass)
 *
 * @example
 * ```typescript
 * const healthChecker = new HealthChecker({ version: '1.0.0' });
 *
 * // Register a custom check
 * healthChecker.registerCheck('database', async () => ({
 *   status: 'pass',
 *   message: 'Connected',
 * }));
 *
 * // Run checks
 * const result = await healthChecker.runChecks();
 * console.log(result.status); // 'healthy', 'degraded', or 'unhealthy'
 * ```
 */
export class HealthChecker {
  private readonly checks: Map<string, HealthCheckFn> = new Map();
  private readonly startTime: number = Date.now();
  private readonly version: string;

  constructor(options?: { version?: string }) {
    this.version = options?.version ?? '0.0.0';
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Register a health check
   *
   * @param name - Unique name for the check
   * @param check - Function that returns a CheckResult
   */
  registerCheck(name: string, check: HealthCheckFn): void {
    this.checks.set(name, check);
  }

  /**
   * Unregister a health check
   *
   * @param name - Name of the check to remove
   */
  unregisterCheck(name: string): void {
    this.checks.delete(name);
  }

  /**
   * Run all registered health checks
   *
   * @returns Health check response with all check results
   */
  async runChecks(): Promise<HealthCheckResponse> {
    const checks: HealthCheckResponse['checks'] = {};
    let overallStatus: HealthCheckResponse['status'] = 'healthy';

    for (const [name, checkFn] of this.checks) {
      try {
        const result = await checkFn();
        const checkEntry: HealthCheckResponse['checks'][string] = {
          status: result.status,
          timestamp: result.timestamp ?? new Date().toISOString(),
        };
        if (result.message !== undefined) {
          checkEntry.message = result.message;
        }
        checks[name] = checkEntry;

        if (result.status === 'fail') {
          overallStatus = 'unhealthy';
        } else if (result.status === 'warn' && overallStatus === 'healthy') {
          overallStatus = 'degraded';
        }
      } catch (error) {
        checks[name] = {
          status: 'fail',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        };
        overallStatus = 'unhealthy';
      }
    }

    return {
      status: overallStatus,
      checks,
      version: this.version,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  /**
   * Quick liveness check
   *
   * Always returns true if the process is running.
   * This is used for the /health endpoint.
   */
  isAlive(): boolean {
    return true;
  }

  /**
   * Full readiness check
   *
   * Returns true if all registered checks pass (no failures).
   * This is used for the /ready endpoint.
   */
  async isReady(): Promise<boolean> {
    const response = await this.runChecks();
    return response.status !== 'unhealthy';
  }

  /**
   * Get the uptime in seconds
   */
  getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Get the version string
   */
  getVersion(): string {
    return this.version;
  }
}

// =============================================================================
// Built-in Checks
// =============================================================================

/**
 * Create a memory usage health check
 *
 * @param threshold - Warning threshold (0-1). Default: 0.9
 * @returns CheckResult with pass/warn/fail status
 */
export function createMemoryCheck(threshold: number = 0.9): HealthCheckFn {
  return () => {
    const used = process.memoryUsage();
    const heapUsedRatio = used.heapUsed / used.heapTotal;

    if (heapUsedRatio > threshold) {
      return {
        status: 'warn',
        message: `Memory usage high: ${(heapUsedRatio * 100).toFixed(1)}%`,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      status: 'pass',
      message: `Memory usage: ${(heapUsedRatio * 100).toFixed(1)}%`,
      timestamp: new Date().toISOString(),
    };
  };
}

/**
 * Create an event loop lag health check
 *
 * @param threshold - Warning threshold in milliseconds. Default: 100
 * @returns CheckResult with pass/warn status
 */
export function createEventLoopCheck(threshold: number = 100): HealthCheckFn {
  return async () => {
    const start = Date.now();

    // Use setImmediate to measure event loop lag
    await new Promise<void>((resolve) => {
      setImmediate(() => {
        resolve();
      });
    });

    const lag = Date.now() - start;

    if (lag > threshold) {
      return {
        status: 'warn',
        message: `Event loop lag high: ${lag}ms`,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      status: 'pass',
      message: `Event loop lag: ${lag}ms`,
      timestamp: new Date().toISOString(),
    };
  };
}

/**
 * Create a shutdown state health check
 *
 * @param shutdownManager - ShutdownManager instance
 * @returns CheckResult with pass/fail status
 */
export function createShutdownCheck(shutdownManager: ShutdownManager): HealthCheckFn {
  return () => {
    if (shutdownManager.isShuttingDown()) {
      return {
        status: 'fail',
        message: 'Server is shutting down',
        timestamp: new Date().toISOString(),
      };
    }

    return {
      status: 'pass',
      message: 'Server is running',
      timestamp: new Date().toISOString(),
    };
  };
}

/**
 * Register all built-in health checks
 *
 * @param healthChecker - HealthChecker instance
 * @param options - Options for built-in checks
 */
export function registerBuiltInChecks(
  healthChecker: HealthChecker,
  options?: BuiltInCheckOptions
): void {
  // Memory check
  healthChecker.registerCheck(
    'memory',
    createMemoryCheck(options?.memoryThreshold ?? 0.9)
  );

  // Event loop check
  healthChecker.registerCheck(
    'event_loop',
    createEventLoopCheck(options?.eventLoopLagThreshold ?? 100)
  );

  // Shutdown state check (if ShutdownManager provided)
  if (options?.shutdownManager) {
    healthChecker.registerCheck(
      'shutdown',
      createShutdownCheck(options.shutdownManager)
    );
  }
}

// =============================================================================
// Express Middleware
// =============================================================================

/**
 * Create Express middleware for health check endpoints
 *
 * Provides:
 * - GET /health - Liveness check (always 200 if process is alive)
 * - GET /ready - Readiness check (200 if healthy/degraded, 503 if unhealthy)
 *
 * @param healthChecker - HealthChecker instance
 * @returns Express Router
 */
export function healthMiddleware(healthChecker: HealthChecker): Router {
  const router = express.Router();

  /**
   * GET /health - Liveness check
   *
   * Returns 200 OK if the process is alive.
   * Kubernetes uses this to know if the container needs to be restarted.
   */
  router.get('/health', (_req: Request, res: Response) => {
    const response: HealthCheckResponse = {
      status: 'healthy',
      checks: {},
      version: healthChecker.getVersion(),
      uptime: healthChecker.getUptime(),
    };

    res.status(200).json(response);
  });

  /**
   * GET /ready - Readiness check
   *
   * Returns 200 OK if all checks pass (healthy or degraded).
   * Returns 503 Service Unavailable if any check fails (unhealthy).
   * Kubernetes uses this to know if the pod should receive traffic.
   */
  router.get('/ready', async (_req: Request, res: Response) => {
    try {
      const response = await healthChecker.runChecks();
      const statusCode = response.status === 'unhealthy' ? 503 : 200;
      res.status(statusCode).json(response);
    } catch (error) {
      const response: HealthCheckResponse = {
        status: 'unhealthy',
        checks: {
          readiness: {
            status: 'fail',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
          },
        },
        version: healthChecker.getVersion(),
        uptime: healthChecker.getUptime(),
      };
      res.status(503).json(response);
    }
  });

  return router;
}

// =============================================================================
// Legacy Exports (for backwards compatibility)
// =============================================================================

/**
 * @deprecated Use HealthCheckResponse instead
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  checks: HealthCheck[];
}

/**
 * @deprecated Use CheckResult instead
 */
export interface HealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message?: string;
  duration?: number;
}

/**
 * @deprecated Use HealthChecker instead
 */
export class HealthManager {
  private checks: Map<string, () => Promise<HealthCheck>> = new Map();
  private startTime = Date.now();

  constructor(private readonly version: string) {}

  registerCheck(name: string, check: () => Promise<HealthCheck>): void {
    this.checks.set(name, check);
  }

  unregisterCheck(name: string): void {
    this.checks.delete(name);
  }

  async getStatus(): Promise<HealthStatus> {
    const results: HealthCheck[] = [];
    let overallStatus: HealthStatus['status'] = 'healthy';

    for (const [name, checkFn] of this.checks) {
      try {
        const start = performance.now();
        const result = await checkFn();
        result.duration = performance.now() - start;
        results.push(result);

        if (result.status === 'fail') {
          overallStatus = 'unhealthy';
        } else if (result.status === 'warn' && overallStatus === 'healthy') {
          overallStatus = 'degraded';
        }
      } catch (error) {
        results.push({
          name,
          status: 'fail',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        overallStatus = 'unhealthy';
      }
    }

    return {
      status: overallStatus,
      version: this.version,
      uptime: Date.now() - this.startTime,
      checks: results,
    };
  }

  async isHealthy(): Promise<boolean> {
    const status = await this.getStatus();
    return status.status !== 'unhealthy';
  }
}
