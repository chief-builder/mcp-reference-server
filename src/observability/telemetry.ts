/**
 * OpenTelemetry setup for MCP server
 *
 * Provides:
 * - NodeSDK configuration with OTLP exporters
 * - Environment-based configuration
 * - NoOp mode when telemetry is disabled
 * - Graceful shutdown handling
 */

import { NodeSDK, type NodeSDKConfiguration } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import {
  trace,
  metrics,
  type Tracer as OTelTracer,
  type Meter as OTelMeter,
  type Span as OTelSpan,
  SpanStatusCode,
  context,
  propagation,
} from '@opentelemetry/api';

// =============================================================================
// Types
// =============================================================================

export interface TelemetryConfig {
  /** Service name for telemetry identification */
  serviceName: string;
  /** Service version */
  serviceVersion?: string;
  /** Whether telemetry is enabled (default: true) */
  enabled?: boolean;
  /** OTLP endpoint URL */
  endpoint?: string;
  /** Metric export interval in milliseconds (default: 60000) */
  metricExportIntervalMs?: number;
}

export interface TelemetryOptions {
  /** Service name override (default: OTEL_SERVICE_NAME env var or 'mcp-reference-server') */
  serviceName?: string;
  /** Service version */
  serviceVersion?: string;
  /** OTLP endpoint override (default: OTEL_EXPORTER_OTLP_ENDPOINT env var) */
  endpoint?: string;
  /** Metric export interval in milliseconds */
  metricExportIntervalMs?: number;
}

// =============================================================================
// NoOp Implementations
// =============================================================================

/**
 * NoOp span that does nothing - used when telemetry is disabled
 */
class NoOpSpan {
  setStatus(_code: SpanStatusCode, _message?: string): this {
    return this;
  }

  setAttribute(_key: string, _value: unknown): this {
    return this;
  }

  setAttributes(_attributes: Record<string, unknown>): this {
    return this;
  }

  addEvent(_name: string, _attributes?: Record<string, unknown>): this {
    return this;
  }

  recordException(_exception: unknown): this {
    return this;
  }

  updateName(_name: string): this {
    return this;
  }

  end(): void {
    // NoOp
  }

  isRecording(): boolean {
    return false;
  }

  spanContext() {
    return {
      traceId: '00000000000000000000000000000000',
      spanId: '0000000000000000',
      traceFlags: 0,
    };
  }
}

/**
 * NoOp tracer that returns NoOp spans - used when telemetry is disabled
 */
class NoOpTracer {
  startSpan(_name: string, _options?: unknown): NoOpSpan {
    return new NoOpSpan();
  }

  startActiveSpan<T>(name: string, fn: (span: NoOpSpan) => T): T;
  startActiveSpan<T>(name: string, options: unknown, fn: (span: NoOpSpan) => T): T;
  startActiveSpan<T>(name: string, options: unknown, context: unknown, fn: (span: NoOpSpan) => T): T;
  startActiveSpan<T>(
    _name: string,
    optionsOrFn: unknown,
    contextOrFn?: unknown,
    fn?: (span: NoOpSpan) => T
  ): T {
    const span = new NoOpSpan();
    if (typeof optionsOrFn === 'function') {
      return (optionsOrFn as (span: NoOpSpan) => T)(span);
    }
    if (typeof contextOrFn === 'function') {
      return (contextOrFn as (span: NoOpSpan) => T)(span);
    }
    if (typeof fn === 'function') {
      return fn(span);
    }
    throw new Error('Invalid arguments to startActiveSpan');
  }
}

/**
 * NoOp counter - used when telemetry is disabled
 */
class NoOpCounter {
  add(_value: number, _attributes?: Record<string, unknown>): void {
    // NoOp
  }
}

/**
 * NoOp histogram - used when telemetry is disabled
 */
class NoOpHistogram {
  record(_value: number, _attributes?: Record<string, unknown>): void {
    // NoOp
  }
}

/**
 * NoOp gauge (observable) - used when telemetry is disabled
 */
class NoOpObservableGauge {
  addCallback(_callback: unknown): void {
    // NoOp
  }

  removeCallback(_callback: unknown): void {
    // NoOp
  }
}

/**
 * NoOp meter - used when telemetry is disabled
 */
class NoOpMeter {
  createCounter(_name: string, _options?: unknown): NoOpCounter {
    return new NoOpCounter();
  }

  createHistogram(_name: string, _options?: unknown): NoOpHistogram {
    return new NoOpHistogram();
  }

  createObservableGauge(_name: string, _options?: unknown): NoOpObservableGauge {
    return new NoOpObservableGauge();
  }

  createUpDownCounter(_name: string, _options?: unknown): NoOpCounter {
    return new NoOpCounter();
  }

  createObservableCounter(_name: string, _options?: unknown): NoOpObservableGauge {
    return new NoOpObservableGauge();
  }

  createObservableUpDownCounter(_name: string, _options?: unknown): NoOpObservableGauge {
    return new NoOpObservableGauge();
  }
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Determines if telemetry is enabled based on environment variable
 */
function isTelemetryEnabled(): boolean {
  const envValue = process.env['MCP_TELEMETRY_ENABLED'];
  if (envValue === undefined) {
    return true; // Default: enabled
  }
  return envValue.toLowerCase() === 'true' || envValue === '1';
}

/**
 * Gets the service name from environment or default
 */
function getServiceName(override?: string): string {
  return override ?? process.env['OTEL_SERVICE_NAME'] ?? 'mcp-reference-server';
}

/**
 * Gets the OTLP endpoint from environment or default
 */
function getOtlpEndpoint(override?: string): string | undefined {
  return override ?? process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
}

// =============================================================================
// TelemetryManager
// =============================================================================

/**
 * Manages OpenTelemetry SDK lifecycle and provides access to tracers and meters.
 *
 * When telemetry is disabled (via MCP_TELEMETRY_ENABLED=false), this class
 * provides no-op implementations with zero overhead.
 *
 * @example
 * ```typescript
 * const telemetry = new TelemetryManager({ serviceName: 'my-service' });
 * await telemetry.start();
 *
 * const tracer = telemetry.getTracer('my-component');
 * const span = tracer.startSpan('operation');
 * // ... do work
 * span.end();
 *
 * await telemetry.shutdown();
 * ```
 */
export class TelemetryManager {
  private sdk: NodeSDK | null = null;
  private initialized = false;
  private readonly enabled: boolean;
  private readonly serviceName: string;
  private readonly serviceVersion: string;
  private readonly endpoint: string | undefined;
  private readonly metricExportIntervalMs: number;

  constructor(options: TelemetryOptions = {}) {
    this.enabled = isTelemetryEnabled();
    this.serviceName = getServiceName(options.serviceName);
    this.serviceVersion = options.serviceVersion ?? '0.1.0';
    this.endpoint = getOtlpEndpoint(options.endpoint);
    this.metricExportIntervalMs = options.metricExportIntervalMs ?? 60000;
  }

  /**
   * Starts the OpenTelemetry SDK.
   * If telemetry is disabled, this is a no-op.
   */
  async start(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    if (this.initialized) {
      return;
    }

    const resource = new Resource({
      [ATTR_SERVICE_NAME]: this.serviceName,
      [ATTR_SERVICE_VERSION]: this.serviceVersion,
    });

    const traceExporterConfig = this.endpoint
      ? { url: `${this.endpoint}/v1/traces` }
      : undefined;

    const metricExporterConfig = this.endpoint
      ? { url: `${this.endpoint}/v1/metrics` }
      : undefined;

    // Create metric reader - use unknown cast to work around OpenTelemetry
    // version compatibility issues between sdk-node and sdk-metrics packages
    const metricReader = new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(metricExporterConfig),
      exportIntervalMillis: this.metricExportIntervalMs,
    });

    this.sdk = new NodeSDK({
      resource,
      traceExporter: new OTLPTraceExporter(traceExporterConfig),
      metricReader: metricReader as unknown as NodeSDKConfiguration['metricReader'],
      instrumentations: [
        new HttpInstrumentation({
          // Enable W3C Trace Context propagation
          enabled: true,
        }),
        new ExpressInstrumentation({
          enabled: true,
        }),
      ],
    });

    this.sdk.start();
    this.initialized = true;
  }

  /**
   * Shuts down the OpenTelemetry SDK, flushing any pending traces and metrics.
   * If telemetry is disabled, this is a no-op.
   */
  async shutdown(): Promise<void> {
    if (!this.enabled || !this.initialized || !this.sdk) {
      return;
    }

    try {
      await this.sdk.shutdown();
    } finally {
      this.sdk = null;
      this.initialized = false;
    }
  }

  /**
   * Gets a tracer for creating spans.
   * Returns a no-op tracer if telemetry is disabled.
   *
   * @param name - Name of the tracer (typically component name)
   * @param version - Optional version of the component
   */
  getTracer(name: string, version?: string): OTelTracer | NoOpTracer {
    if (!this.enabled) {
      return new NoOpTracer();
    }
    return trace.getTracer(name, version);
  }

  /**
   * Gets a meter for creating metrics.
   * Returns a no-op meter if telemetry is disabled.
   *
   * @param name - Name of the meter (typically component name)
   * @param version - Optional version of the component
   */
  getMeter(name: string, version?: string): OTelMeter | NoOpMeter {
    if (!this.enabled) {
      return new NoOpMeter();
    }
    return metrics.getMeter(name, version);
  }

  /**
   * Convenience method to wrap a function with a span.
   * The span is automatically ended when the function completes.
   *
   * @param name - Name of the span
   * @param fn - Function to execute within the span
   * @returns The result of the function
   *
   * @example
   * ```typescript
   * const result = await telemetry.withSpan('process-request', async (span) => {
   *   span.setAttribute('request.id', requestId);
   *   return await processRequest();
   * });
   * ```
   */
  async withSpan<T>(
    name: string,
    fn: (span: OTelSpan | NoOpSpan) => Promise<T>
  ): Promise<T> {
    if (!this.enabled) {
      const noOpSpan = new NoOpSpan();
      return fn(noOpSpan as unknown as OTelSpan);
    }

    const tracer = this.getTracer(this.serviceName);
    return (tracer as OTelTracer).startActiveSpan(name, async (span: OTelSpan) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Extracts trace context from HTTP headers (W3C Trace Context format).
   *
   * @param headers - HTTP headers containing trace context
   * @returns A context object that can be used for span creation
   */
  extractContext(headers: Record<string, string | string[] | undefined>): ReturnType<typeof context.active> {
    if (!this.enabled) {
      return context.active();
    }
    // Normalize headers to string values
    const normalizedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) {
        normalizedHeaders[key] = Array.isArray(value) ? value[0] ?? '' : value;
      }
    }
    return propagation.extract(context.active(), normalizedHeaders);
  }

  /**
   * Injects trace context into HTTP headers (W3C Trace Context format).
   *
   * @param headers - HTTP headers object to inject context into
   * @returns The headers object with trace context added
   */
  injectContext(headers: Record<string, string> = {}): Record<string, string> {
    if (!this.enabled) {
      return headers;
    }
    propagation.inject(context.active(), headers);
    return headers;
  }

  /**
   * Returns whether telemetry is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Returns whether the SDK has been initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Gets the configured service name.
   */
  getServiceName(): string {
    return this.serviceName;
  }

  // Legacy compatibility methods

  /**
   * @deprecated Use start() instead
   */
  async initialize(): Promise<void> {
    return this.start();
  }
}

// =============================================================================
// Exports
// =============================================================================

export { SpanStatusCode } from '@opentelemetry/api';
export type { Tracer as OTelTracer, Meter as OTelMeter, Span as OTelSpan } from '@opentelemetry/api';
