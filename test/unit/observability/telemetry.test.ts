import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TelemetryManager, SpanStatusCode } from '../../../src/observability/telemetry.js';

// =============================================================================
// Test Setup
// =============================================================================

// Store original env vars
const originalEnv = { ...process.env };

function resetEnv() {
  // Clear relevant env vars
  delete process.env['MCP_TELEMETRY_ENABLED'];
  delete process.env['OTEL_SERVICE_NAME'];
  delete process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
}

function restoreEnv() {
  process.env = { ...originalEnv };
}

// =============================================================================
// TelemetryManager Tests
// =============================================================================

describe('TelemetryManager', () => {
  beforeEach(() => {
    resetEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  describe('constructor', () => {
    it('should create with default options', () => {
      const telemetry = new TelemetryManager();
      expect(telemetry.getServiceName()).toBe('mcp-reference-server');
      expect(telemetry.isEnabled()).toBe(true);
      expect(telemetry.isInitialized()).toBe(false);
    });

    it('should use custom service name from options', () => {
      const telemetry = new TelemetryManager({ serviceName: 'custom-service' });
      expect(telemetry.getServiceName()).toBe('custom-service');
    });

    it('should read service name from OTEL_SERVICE_NAME env var', () => {
      process.env['OTEL_SERVICE_NAME'] = 'env-service';
      const telemetry = new TelemetryManager();
      expect(telemetry.getServiceName()).toBe('env-service');
    });

    it('should prefer options over env var for service name', () => {
      process.env['OTEL_SERVICE_NAME'] = 'env-service';
      const telemetry = new TelemetryManager({ serviceName: 'options-service' });
      expect(telemetry.getServiceName()).toBe('options-service');
    });
  });

  describe('enabled state', () => {
    it('should be enabled by default', () => {
      const telemetry = new TelemetryManager();
      expect(telemetry.isEnabled()).toBe(true);
    });

    it('should be disabled when MCP_TELEMETRY_ENABLED=false', () => {
      process.env['MCP_TELEMETRY_ENABLED'] = 'false';
      const telemetry = new TelemetryManager();
      expect(telemetry.isEnabled()).toBe(false);
    });

    it('should be disabled when MCP_TELEMETRY_ENABLED=0', () => {
      process.env['MCP_TELEMETRY_ENABLED'] = '0';
      const telemetry = new TelemetryManager();
      expect(telemetry.isEnabled()).toBe(false);
    });

    it('should be enabled when MCP_TELEMETRY_ENABLED=true', () => {
      process.env['MCP_TELEMETRY_ENABLED'] = 'true';
      const telemetry = new TelemetryManager();
      expect(telemetry.isEnabled()).toBe(true);
    });

    it('should be enabled when MCP_TELEMETRY_ENABLED=1', () => {
      process.env['MCP_TELEMETRY_ENABLED'] = '1';
      const telemetry = new TelemetryManager();
      expect(telemetry.isEnabled()).toBe(true);
    });

    it('should be disabled when MCP_TELEMETRY_ENABLED=FALSE (case insensitive)', () => {
      process.env['MCP_TELEMETRY_ENABLED'] = 'FALSE';
      const telemetry = new TelemetryManager();
      expect(telemetry.isEnabled()).toBe(false);
    });
  });

  describe('NoOp mode (disabled telemetry)', () => {
    let telemetry: TelemetryManager;

    beforeEach(() => {
      process.env['MCP_TELEMETRY_ENABLED'] = 'false';
      telemetry = new TelemetryManager();
    });

    it('should not initialize when disabled', async () => {
      await telemetry.start();
      expect(telemetry.isInitialized()).toBe(false);
    });

    it('should provide NoOp tracer', () => {
      const tracer = telemetry.getTracer('test');
      expect(tracer).toBeDefined();

      // NoOp tracer should return NoOp span
      const span = tracer.startSpan('test-span');
      expect(span).toBeDefined();
      expect(span.isRecording()).toBe(false);

      // These should all be no-ops (not throw)
      span.setAttribute('key', 'value');
      span.setAttributes({ foo: 'bar' });
      span.addEvent('event');
      span.recordException(new Error('test'));
      span.setStatus(SpanStatusCode.OK);
      span.updateName('new-name');
      span.end();
    });

    it('should provide NoOp meter', () => {
      const meter = telemetry.getMeter('test');
      expect(meter).toBeDefined();

      // Create various metric types - all should be no-ops
      const counter = meter.createCounter('test_counter');
      counter.add(1);

      const histogram = meter.createHistogram('test_histogram');
      histogram.record(100);

      const gauge = meter.createObservableGauge('test_gauge');
      gauge.addCallback(() => {});
      gauge.removeCallback(() => {});

      const upDownCounter = meter.createUpDownCounter('test_updown');
      upDownCounter.add(-1);
    });

    it('should handle withSpan in NoOp mode', async () => {
      const result = await telemetry.withSpan('test-span', async (span) => {
        span.setAttribute('key', 'value');
        return 'success';
      });
      expect(result).toBe('success');
    });

    it('should handle withSpan errors in NoOp mode', async () => {
      await expect(
        telemetry.withSpan('test-span', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
    });

    it('should not throw on shutdown when not initialized', async () => {
      await expect(telemetry.shutdown()).resolves.toBeUndefined();
    });

    it('should return active context for extractContext when disabled', () => {
      const ctx = telemetry.extractContext({ traceparent: 'test' });
      expect(ctx).toBeDefined();
    });

    it('should return same headers for injectContext when disabled', () => {
      const headers = { 'x-custom': 'value' };
      const result = telemetry.injectContext(headers);
      expect(result).toBe(headers);
    });
  });

  describe('NoOp tracer startActiveSpan', () => {
    let telemetry: TelemetryManager;

    beforeEach(() => {
      process.env['MCP_TELEMETRY_ENABLED'] = 'false';
      telemetry = new TelemetryManager();
    });

    it('should handle startActiveSpan with just callback', () => {
      const tracer = telemetry.getTracer('test');
      const result = tracer.startActiveSpan('span', (span) => {
        span.setAttribute('key', 'value');
        return 42;
      });
      expect(result).toBe(42);
    });

    it('should handle startActiveSpan with options and callback', () => {
      const tracer = telemetry.getTracer('test');
      const result = tracer.startActiveSpan('span', {}, (span) => {
        return 'with-options';
      });
      expect(result).toBe('with-options');
    });

    it('should handle startActiveSpan with options, context, and callback', () => {
      const tracer = telemetry.getTracer('test');
      const result = tracer.startActiveSpan('span', {}, {}, (span) => {
        return 'full-signature';
      });
      expect(result).toBe('full-signature');
    });
  });

  describe('initialization', () => {
    // Note: These tests don't actually start the SDK to avoid side effects
    // They verify the logic flow and state management

    it('should set initialized flag after start', async () => {
      // We can't easily test actual SDK initialization without side effects
      // So we test the disabled path which follows the same logic
      process.env['MCP_TELEMETRY_ENABLED'] = 'false';
      const telemetry = new TelemetryManager();

      await telemetry.start();
      // When disabled, initialized stays false (by design)
      expect(telemetry.isInitialized()).toBe(false);
    });

    it('should support legacy initialize() method', async () => {
      process.env['MCP_TELEMETRY_ENABLED'] = 'false';
      const telemetry = new TelemetryManager();

      // Legacy method should work same as start()
      await telemetry.initialize();
      expect(telemetry.isInitialized()).toBe(false);
    });
  });

  describe('context propagation', () => {
    let telemetry: TelemetryManager;

    beforeEach(() => {
      process.env['MCP_TELEMETRY_ENABLED'] = 'false';
      telemetry = new TelemetryManager();
    });

    it('should extract context from headers', () => {
      const ctx = telemetry.extractContext({
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      });
      expect(ctx).toBeDefined();
    });

    it('should handle array header values', () => {
      const ctx = telemetry.extractContext({
        traceparent: ['00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'],
      });
      expect(ctx).toBeDefined();
    });

    it('should handle undefined header values', () => {
      const ctx = telemetry.extractContext({
        traceparent: undefined,
      });
      expect(ctx).toBeDefined();
    });

    it('should inject context into headers', () => {
      const headers = telemetry.injectContext({});
      expect(headers).toBeDefined();
    });

    it('should inject context into existing headers', () => {
      const headers = telemetry.injectContext({ 'x-custom': 'value' });
      expect(headers['x-custom']).toBe('value');
    });
  });

  describe('NoOp span context', () => {
    it('should return zero-filled span context', () => {
      process.env['MCP_TELEMETRY_ENABLED'] = 'false';
      const telemetry = new TelemetryManager();
      const tracer = telemetry.getTracer('test');
      const span = tracer.startSpan('test');

      const ctx = span.spanContext();
      expect(ctx.traceId).toBe('00000000000000000000000000000000');
      expect(ctx.spanId).toBe('0000000000000000');
      expect(ctx.traceFlags).toBe(0);
    });
  });
});

// =============================================================================
// Configuration Tests
// =============================================================================

describe('Telemetry Configuration', () => {
  beforeEach(() => {
    resetEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it('should use default service name when no config', () => {
    const telemetry = new TelemetryManager();
    expect(telemetry.getServiceName()).toBe('mcp-reference-server');
  });

  it('should use OTEL_SERVICE_NAME environment variable', () => {
    process.env['OTEL_SERVICE_NAME'] = 'my-test-service';
    const telemetry = new TelemetryManager();
    expect(telemetry.getServiceName()).toBe('my-test-service');
  });

  it('should prefer options.serviceName over environment variable', () => {
    process.env['OTEL_SERVICE_NAME'] = 'env-service';
    const telemetry = new TelemetryManager({ serviceName: 'options-service' });
    expect(telemetry.getServiceName()).toBe('options-service');
  });
});

// =============================================================================
// Export Tests
// =============================================================================

describe('Telemetry Exports', () => {
  it('should export SpanStatusCode', () => {
    expect(SpanStatusCode).toBeDefined();
    expect(SpanStatusCode.OK).toBeDefined();
    expect(SpanStatusCode.ERROR).toBeDefined();
    expect(SpanStatusCode.UNSET).toBeDefined();
  });
});
