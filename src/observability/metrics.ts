/**
 * MCP Server Metrics Collection
 *
 * Provides metrics for monitoring MCP server performance:
 * - Request counts and latency
 * - Error tracking
 * - Active session counts
 */

import type { Meter, Counter, Histogram, UpDownCounter, Attributes } from '@opentelemetry/api';
import type { TelemetryManager } from './telemetry.js';

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// Constants
// =============================================================================

/** Histogram bucket boundaries for request duration in milliseconds */
export const DURATION_BUCKETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

/** Metric names */
export const METRIC_NAMES = {
  REQUESTS_TOTAL: 'mcp.requests.total',
  REQUESTS_DURATION: 'mcp.requests.duration',
  ERRORS_TOTAL: 'mcp.errors.total',
  SESSIONS_ACTIVE: 'mcp.sessions.active',
} as const;

// =============================================================================
// MetricsCollector
// =============================================================================

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
export class MetricsCollector {
  private readonly requestsCounter: Counter;
  private readonly requestsDuration: Histogram;
  private readonly errorsCounter: Counter;
  private readonly sessionsGauge: UpDownCounter;

  // Internal tracking for getMetrics() (testing/debugging)
  private requestsTotal = 0;
  private requestsByMethod: Record<string, number> = {};
  private requestsByStatus: Record<string, number> = {};
  private errorsTotal = 0;
  private errorsByCode: Record<string, number> = {};
  private activeSessions = 0;

  constructor(meter: Meter) {
    // Counter for total requests
    this.requestsCounter = meter.createCounter(METRIC_NAMES.REQUESTS_TOTAL, {
      description: 'Total number of MCP requests',
      unit: '1',
    });

    // Histogram for request duration
    this.requestsDuration = meter.createHistogram(METRIC_NAMES.REQUESTS_DURATION, {
      description: 'Duration of MCP requests in milliseconds',
      unit: 'ms',
      advice: {
        explicitBucketBoundaries: DURATION_BUCKETS,
      },
    });

    // Counter for errors
    this.errorsCounter = meter.createCounter(METRIC_NAMES.ERRORS_TOTAL, {
      description: 'Total number of MCP errors',
      unit: '1',
    });

    // UpDownCounter for active sessions (gauge-like behavior)
    this.sessionsGauge = meter.createUpDownCounter(METRIC_NAMES.SESSIONS_ACTIVE, {
      description: 'Number of currently active MCP sessions',
      unit: '1',
    });
  }

  /**
   * Records a completed request with its duration and status.
   *
   * @param method - JSON-RPC method name (e.g., 'tools/call', 'resources/read')
   * @param durationMs - Request duration in milliseconds
   * @param status - Whether the request succeeded or failed
   * @param transport - Optional transport type ('stdio' | 'http')
   */
  recordRequest(
    method: string,
    durationMs: number,
    status: RequestStatus,
    transport?: TransportType
  ): void {
    const attributes: Attributes = {
      method,
      status,
    };
    if (transport) {
      attributes.transport = transport;
    }

    // Record counter
    this.requestsCounter.add(1, attributes);

    // Record duration
    this.requestsDuration.record(durationMs, attributes);

    // Update internal tracking
    this.requestsTotal++;
    this.requestsByMethod[method] = (this.requestsByMethod[method] ?? 0) + 1;
    this.requestsByStatus[status] = (this.requestsByStatus[status] ?? 0) + 1;
  }

  /**
   * Records an error occurrence.
   *
   * @param errorCode - Error code (JSON-RPC error code or custom code)
   * @param method - Optional JSON-RPC method that caused the error
   * @param transport - Optional transport type
   */
  recordError(errorCode: number | string, method?: string, transport?: TransportType): void {
    const attributes: Attributes = {
      error_code: String(errorCode),
    };
    if (method) {
      attributes.method = method;
    }
    if (transport) {
      attributes.transport = transport;
    }

    this.errorsCounter.add(1, attributes);

    // Update internal tracking
    this.errorsTotal++;
    const codeStr = String(errorCode);
    this.errorsByCode[codeStr] = (this.errorsByCode[codeStr] ?? 0) + 1;
  }

  /**
   * Records a new session starting.
   */
  sessionStarted(): void {
    this.sessionsGauge.add(1);
    this.activeSessions++;
  }

  /**
   * Records a session ending.
   */
  sessionEnded(): void {
    this.sessionsGauge.add(-1);
    this.activeSessions = Math.max(0, this.activeSessions - 1);
  }

  /**
   * Gets a summary of current metrics (for testing/debugging).
   * Note: This returns internally tracked values, not actual OpenTelemetry values.
   */
  getMetrics(): MetricsSummary {
    return {
      requests: {
        total: this.requestsTotal,
        byMethod: { ...this.requestsByMethod },
        byStatus: { ...this.requestsByStatus },
      },
      errors: {
        total: this.errorsTotal,
        byCode: { ...this.errorsByCode },
      },
      sessions: {
        active: this.activeSessions,
      },
    };
  }

  /**
   * Resets internal tracking counters (for testing).
   */
  resetMetrics(): void {
    this.requestsTotal = 0;
    this.requestsByMethod = {};
    this.requestsByStatus = {};
    this.errorsTotal = 0;
    this.errorsByCode = {};
    this.activeSessions = 0;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

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
export function createMetricsCollector(
  telemetry: TelemetryManager,
  meterName = 'mcp-server'
): MetricsCollector {
  const meter = telemetry.getMeter(meterName);
  return new MetricsCollector(meter as Meter);
}
