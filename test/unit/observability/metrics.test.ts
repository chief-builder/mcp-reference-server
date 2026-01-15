import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MetricsCollector,
  createMetricsCollector,
  DURATION_BUCKETS,
  METRIC_NAMES,
} from '../../../src/observability/metrics.js';
import { TelemetryManager } from '../../../src/observability/telemetry.js';

// =============================================================================
// Test Setup
// =============================================================================

const originalEnv = { ...process.env };

function resetEnv() {
  delete process.env['MCP_TELEMETRY_ENABLED'];
  delete process.env['OTEL_SERVICE_NAME'];
  delete process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
}

function restoreEnv() {
  process.env = { ...originalEnv };
}

// =============================================================================
// Constants Tests
// =============================================================================

describe('Metrics Constants', () => {
  it('should export correct metric names', () => {
    expect(METRIC_NAMES.REQUESTS_TOTAL).toBe('mcp.requests.total');
    expect(METRIC_NAMES.REQUESTS_DURATION).toBe('mcp.requests.duration');
    expect(METRIC_NAMES.ERRORS_TOTAL).toBe('mcp.errors.total');
    expect(METRIC_NAMES.SESSIONS_ACTIVE).toBe('mcp.sessions.active');
  });

  it('should export duration bucket boundaries', () => {
    expect(DURATION_BUCKETS).toEqual([1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]);
  });
});

// =============================================================================
// MetricsCollector Tests
// =============================================================================

describe('MetricsCollector', () => {
  let telemetry: TelemetryManager;
  let metrics: MetricsCollector;

  beforeEach(() => {
    resetEnv();
    // Use disabled telemetry for unit tests (uses NoOp meter)
    process.env['MCP_TELEMETRY_ENABLED'] = 'false';
    telemetry = new TelemetryManager({ serviceName: 'test-service' });
    metrics = createMetricsCollector(telemetry);
  });

  afterEach(() => {
    restoreEnv();
  });

  describe('recordRequest', () => {
    it('should record a successful request', () => {
      metrics.recordRequest('tools/call', 42, 'success');

      const summary = metrics.getMetrics();
      expect(summary.requests.total).toBe(1);
      expect(summary.requests.byMethod['tools/call']).toBe(1);
      expect(summary.requests.byStatus['success']).toBe(1);
    });

    it('should record an error request', () => {
      metrics.recordRequest('resources/read', 150, 'error');

      const summary = metrics.getMetrics();
      expect(summary.requests.total).toBe(1);
      expect(summary.requests.byMethod['resources/read']).toBe(1);
      expect(summary.requests.byStatus['error']).toBe(1);
    });

    it('should accumulate multiple requests', () => {
      metrics.recordRequest('tools/call', 10, 'success');
      metrics.recordRequest('tools/call', 20, 'success');
      metrics.recordRequest('resources/read', 30, 'error');

      const summary = metrics.getMetrics();
      expect(summary.requests.total).toBe(3);
      expect(summary.requests.byMethod['tools/call']).toBe(2);
      expect(summary.requests.byMethod['resources/read']).toBe(1);
      expect(summary.requests.byStatus['success']).toBe(2);
      expect(summary.requests.byStatus['error']).toBe(1);
    });

    it('should handle transport attribute', () => {
      // This tests that the method doesn't throw with transport
      metrics.recordRequest('initialize', 5, 'success', 'stdio');
      metrics.recordRequest('initialize', 8, 'success', 'http');

      const summary = metrics.getMetrics();
      expect(summary.requests.total).toBe(2);
    });
  });

  describe('recordError', () => {
    it('should record an error with numeric code', () => {
      metrics.recordError(-32600, 'tools/call');

      const summary = metrics.getMetrics();
      expect(summary.errors.total).toBe(1);
      expect(summary.errors.byCode['-32600']).toBe(1);
    });

    it('should record an error with string code', () => {
      metrics.recordError('INVALID_PARAMS', 'resources/read');

      const summary = metrics.getMetrics();
      expect(summary.errors.total).toBe(1);
      expect(summary.errors.byCode['INVALID_PARAMS']).toBe(1);
    });

    it('should record an error without method', () => {
      metrics.recordError(-32700);

      const summary = metrics.getMetrics();
      expect(summary.errors.total).toBe(1);
      expect(summary.errors.byCode['-32700']).toBe(1);
    });

    it('should accumulate multiple errors', () => {
      metrics.recordError(-32600, 'tools/call');
      metrics.recordError(-32600, 'resources/read');
      metrics.recordError(-32601, 'prompts/get');

      const summary = metrics.getMetrics();
      expect(summary.errors.total).toBe(3);
      expect(summary.errors.byCode['-32600']).toBe(2);
      expect(summary.errors.byCode['-32601']).toBe(1);
    });

    it('should handle transport attribute', () => {
      metrics.recordError(-32600, 'tools/call', 'http');

      const summary = metrics.getMetrics();
      expect(summary.errors.total).toBe(1);
    });
  });

  describe('session tracking', () => {
    it('should track session started', () => {
      metrics.sessionStarted();

      const summary = metrics.getMetrics();
      expect(summary.sessions.active).toBe(1);
    });

    it('should track session ended', () => {
      metrics.sessionStarted();
      metrics.sessionEnded();

      const summary = metrics.getMetrics();
      expect(summary.sessions.active).toBe(0);
    });

    it('should track multiple sessions', () => {
      metrics.sessionStarted();
      metrics.sessionStarted();
      metrics.sessionStarted();

      const summary = metrics.getMetrics();
      expect(summary.sessions.active).toBe(3);
    });

    it('should handle concurrent sessions', () => {
      metrics.sessionStarted();
      metrics.sessionStarted();
      metrics.sessionEnded();

      const summary = metrics.getMetrics();
      expect(summary.sessions.active).toBe(1);
    });

    it('should not go below zero active sessions', () => {
      metrics.sessionEnded();
      metrics.sessionEnded();

      const summary = metrics.getMetrics();
      expect(summary.sessions.active).toBe(0);
    });
  });

  describe('getMetrics', () => {
    it('should return empty summary initially', () => {
      const summary = metrics.getMetrics();

      expect(summary.requests.total).toBe(0);
      expect(summary.requests.byMethod).toEqual({});
      expect(summary.requests.byStatus).toEqual({});
      expect(summary.errors.total).toBe(0);
      expect(summary.errors.byCode).toEqual({});
      expect(summary.sessions.active).toBe(0);
    });

    it('should return a copy of internal state', () => {
      metrics.recordRequest('tools/call', 10, 'success');

      const summary1 = metrics.getMetrics();
      const summary2 = metrics.getMetrics();

      // Modifying one should not affect the other
      summary1.requests.byMethod['modified'] = 999;
      expect(summary2.requests.byMethod['modified']).toBeUndefined();
    });
  });

  describe('resetMetrics', () => {
    it('should reset all internal counters', () => {
      metrics.recordRequest('tools/call', 10, 'success');
      metrics.recordError(-32600);
      metrics.sessionStarted();

      metrics.resetMetrics();

      const summary = metrics.getMetrics();
      expect(summary.requests.total).toBe(0);
      expect(summary.requests.byMethod).toEqual({});
      expect(summary.requests.byStatus).toEqual({});
      expect(summary.errors.total).toBe(0);
      expect(summary.errors.byCode).toEqual({});
      expect(summary.sessions.active).toBe(0);
    });
  });
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('createMetricsCollector', () => {
  beforeEach(() => {
    resetEnv();
    process.env['MCP_TELEMETRY_ENABLED'] = 'false';
  });

  afterEach(() => {
    restoreEnv();
  });

  it('should create a MetricsCollector from TelemetryManager', () => {
    const telemetry = new TelemetryManager();
    const metrics = createMetricsCollector(telemetry);

    expect(metrics).toBeInstanceOf(MetricsCollector);
  });

  it('should use custom meter name', () => {
    const telemetry = new TelemetryManager();
    const metrics = createMetricsCollector(telemetry, 'custom-meter');

    // Verify it works
    metrics.recordRequest('test', 1, 'success');
    expect(metrics.getMetrics().requests.total).toBe(1);
  });

  it('should work with enabled telemetry', () => {
    // Reset to enabled (default)
    delete process.env['MCP_TELEMETRY_ENABLED'];

    const telemetry = new TelemetryManager();
    const metrics = createMetricsCollector(telemetry);

    // Should still work (though actual OTel metrics won't be exported without SDK start)
    metrics.recordRequest('test', 1, 'success');
    expect(metrics.getMetrics().requests.total).toBe(1);
  });
});

// =============================================================================
// Integration-like Tests
// =============================================================================

describe('MetricsCollector integration scenarios', () => {
  let telemetry: TelemetryManager;
  let metrics: MetricsCollector;

  beforeEach(() => {
    resetEnv();
    process.env['MCP_TELEMETRY_ENABLED'] = 'false';
    telemetry = new TelemetryManager({ serviceName: 'test-service' });
    metrics = createMetricsCollector(telemetry);
  });

  afterEach(() => {
    restoreEnv();
  });

  it('should handle typical request lifecycle', () => {
    // Session starts
    metrics.sessionStarted();

    // Initialize request
    metrics.recordRequest('initialize', 15, 'success', 'stdio');

    // Tool calls
    metrics.recordRequest('tools/call', 120, 'success', 'stdio');
    metrics.recordRequest('tools/call', 85, 'success', 'stdio');
    metrics.recordRequest('tools/call', 500, 'error', 'stdio');
    metrics.recordError(-32600, 'tools/call', 'stdio');

    // Resource reads
    metrics.recordRequest('resources/read', 25, 'success', 'stdio');

    // Session ends
    metrics.sessionEnded();

    const summary = metrics.getMetrics();
    expect(summary.requests.total).toBe(5);
    expect(summary.requests.byMethod['initialize']).toBe(1);
    expect(summary.requests.byMethod['tools/call']).toBe(3);
    expect(summary.requests.byMethod['resources/read']).toBe(1);
    expect(summary.requests.byStatus['success']).toBe(4);
    expect(summary.requests.byStatus['error']).toBe(1);
    expect(summary.errors.total).toBe(1);
    expect(summary.sessions.active).toBe(0);
  });

  it('should handle multiple concurrent sessions', () => {
    // Two sessions start
    metrics.sessionStarted();
    metrics.sessionStarted();

    expect(metrics.getMetrics().sessions.active).toBe(2);

    // Requests from both sessions
    metrics.recordRequest('tools/call', 50, 'success');
    metrics.recordRequest('resources/read', 30, 'success');

    // One session ends
    metrics.sessionEnded();

    expect(metrics.getMetrics().sessions.active).toBe(1);
    expect(metrics.getMetrics().requests.total).toBe(2);

    // Second session ends
    metrics.sessionEnded();

    expect(metrics.getMetrics().sessions.active).toBe(0);
  });

  it('should handle all JSON-RPC error codes', () => {
    // Standard JSON-RPC errors
    metrics.recordError(-32700, 'parse'); // Parse error
    metrics.recordError(-32600, 'invalid'); // Invalid Request
    metrics.recordError(-32601, 'method'); // Method not found
    metrics.recordError(-32602, 'params'); // Invalid params
    metrics.recordError(-32603, 'internal'); // Internal error

    // Custom error codes
    metrics.recordError(-32000, 'custom1'); // Server error
    metrics.recordError(-32099, 'custom2'); // Server error

    const summary = metrics.getMetrics();
    expect(summary.errors.total).toBe(7);
    expect(Object.keys(summary.errors.byCode).length).toBe(7);
  });
});
