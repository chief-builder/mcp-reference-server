/**
 * MCP Server Metrics Collection
 *
 * Provides metrics for monitoring MCP server performance:
 * - Request counts and latency
 * - Error tracking
 * - Active session counts
 */
import type { Meter } from '@opentelemetry/api';
import type { TelemetryManager } from './telemetry.js';
export interface MetricsSummary {
    requests: {
        total: number;
        byMethod: Record<string, number>;
        byStatus: Record<string, number>;
    };
    errors: {
        total: number;
        byCode: Record<string, number>;
    };
    sessions: {
        active: number;
    };
}
export type RequestStatus = 'success' | 'error';
export type TransportType = 'stdio' | 'http';
/** Histogram bucket boundaries for request duration in milliseconds */
export declare const DURATION_BUCKETS: number[];
/** Metric names */
export declare const METRIC_NAMES: {
    readonly REQUESTS_TOTAL: "mcp.requests.total";
    readonly REQUESTS_DURATION: "mcp.requests.duration";
    readonly ERRORS_TOTAL: "mcp.errors.total";
    readonly SESSIONS_ACTIVE: "mcp.sessions.active";
};
/**
 * Collects and records MCP server metrics using OpenTelemetry.
 *
 * @example
 * ```typescript
 * const telemetry = new TelemetryManager();
 * const metrics = createMetricsCollector(telemetry);
 *
 * // Record a successful request
 * metrics.recordRequest('tools/call', 42, 'success');
 *
 * // Record an error
 * metrics.recordError(-32600, 'tools/call');
 *
 * // Track sessions
 * metrics.sessionStarted();
 * // ... later
 * metrics.sessionEnded();
 * ```
 */
export declare class MetricsCollector {
    private readonly requestsCounter;
    private readonly requestsDuration;
    private readonly errorsCounter;
    private readonly sessionsGauge;
    private requestsTotal;
    private requestsByMethod;
    private requestsByStatus;
    private errorsTotal;
    private errorsByCode;
    private activeSessions;
    constructor(meter: Meter);
    /**
     * Records a completed request with its duration and status.
     *
     * @param method - JSON-RPC method name (e.g., 'tools/call', 'resources/read')
     * @param durationMs - Request duration in milliseconds
     * @param status - Whether the request succeeded or failed
     * @param transport - Optional transport type ('stdio' | 'http')
     */
    recordRequest(method: string, durationMs: number, status: RequestStatus, transport?: TransportType): void;
    /**
     * Records an error occurrence.
     *
     * @param errorCode - Error code (JSON-RPC error code or custom code)
     * @param method - Optional JSON-RPC method that caused the error
     * @param transport - Optional transport type
     */
    recordError(errorCode: number | string, method?: string, transport?: TransportType): void;
    /**
     * Records a new session starting.
     */
    sessionStarted(): void;
    /**
     * Records a session ending.
     */
    sessionEnded(): void;
    /**
     * Gets a summary of current metrics (for testing/debugging).
     * Note: This returns internally tracked values, not actual OpenTelemetry values.
     */
    getMetrics(): MetricsSummary;
    /**
     * Resets internal tracking counters (for testing).
     */
    resetMetrics(): void;
}
/**
 * Creates a MetricsCollector from a TelemetryManager.
 *
 * @param telemetry - TelemetryManager instance
 * @param meterName - Optional meter name (default: 'mcp-server')
 * @returns MetricsCollector instance
 *
 * @example
 * ```typescript
 * const telemetry = new TelemetryManager({ serviceName: 'my-mcp-server' });
 * await telemetry.start();
 *
 * const metrics = createMetricsCollector(telemetry);
 * metrics.recordRequest('initialize', 15, 'success');
 * ```
 */
export declare function createMetricsCollector(telemetry: TelemetryManager, meterName?: string): MetricsCollector;
//# sourceMappingURL=metrics.d.ts.map