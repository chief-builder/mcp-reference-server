/**
 * Health check endpoints
 *
 * Implements:
 * - Liveness checks (/health)
 * - Readiness checks (/ready)
 * - Dependency status monitoring
 * - Proper HTTP status codes
 */
import { Router } from 'express';
import type { ShutdownManager } from '../server.js';
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
    uptime?: number;
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
export declare class HealthChecker {
    private readonly checks;
    private readonly startTime;
    private readonly version;
    constructor(options?: {
        version?: string;
    });
    /**
     * Register a health check
     *
     * @param name - Unique name for the check
     * @param check - Function that returns a CheckResult
     */
    registerCheck(name: string, check: HealthCheckFn): void;
    /**
     * Unregister a health check
     *
     * @param name - Name of the check to remove
     */
    unregisterCheck(name: string): void;
    /**
     * Run all registered health checks
     *
     * @returns Health check response with all check results
     */
    runChecks(): Promise<HealthCheckResponse>;
    /**
     * Quick liveness check
     *
     * Always returns true if the process is running.
     * This is used for the /health endpoint.
     */
    isAlive(): boolean;
    /**
     * Full readiness check
     *
     * Returns true if all registered checks pass (no failures).
     * This is used for the /ready endpoint.
     */
    isReady(): Promise<boolean>;
    /**
     * Get the uptime in seconds
     */
    getUptime(): number;
    /**
     * Get the version string
     */
    getVersion(): string;
}
/**
 * Create a memory usage health check
 *
 * @param threshold - Warning threshold (0-1). Default: 0.9
 * @returns CheckResult with pass/warn/fail status
 */
export declare function createMemoryCheck(threshold?: number): HealthCheckFn;
/**
 * Create an event loop lag health check
 *
 * @param threshold - Warning threshold in milliseconds. Default: 100
 * @returns CheckResult with pass/warn status
 */
export declare function createEventLoopCheck(threshold?: number): HealthCheckFn;
/**
 * Create a shutdown state health check
 *
 * @param shutdownManager - ShutdownManager instance
 * @returns CheckResult with pass/fail status
 */
export declare function createShutdownCheck(shutdownManager: ShutdownManager): HealthCheckFn;
/**
 * Register all built-in health checks
 *
 * @param healthChecker - HealthChecker instance
 * @param options - Options for built-in checks
 */
export declare function registerBuiltInChecks(healthChecker: HealthChecker, options?: BuiltInCheckOptions): void;
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
export declare function healthMiddleware(healthChecker: HealthChecker): Router;
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
export declare class HealthManager {
    private readonly version;
    private checks;
    private startTime;
    constructor(version: string);
    registerCheck(name: string, check: () => Promise<HealthCheck>): void;
    unregisterCheck(name: string): void;
    getStatus(): Promise<HealthStatus>;
    isHealthy(): Promise<boolean>;
}
//# sourceMappingURL=health.d.ts.map