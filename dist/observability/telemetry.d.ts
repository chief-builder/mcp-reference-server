/**
 * OpenTelemetry setup for MCP server
 *
 * Provides:
 * - NodeSDK configuration with OTLP exporters
 * - Environment-based configuration
 * - NoOp mode when telemetry is disabled
 * - Graceful shutdown handling
 */
import { type Tracer as OTelTracer, type Meter as OTelMeter, type Span as OTelSpan, SpanStatusCode, context } from '@opentelemetry/api';
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
/**
 * NoOp span that does nothing - used when telemetry is disabled
 */
declare class NoOpSpan {
    setStatus(_code: SpanStatusCode, _message?: string): this;
    setAttribute(_key: string, _value: unknown): this;
    setAttributes(_attributes: Record<string, unknown>): this;
    addEvent(_name: string, _attributes?: Record<string, unknown>): this;
    recordException(_exception: unknown): this;
    updateName(_name: string): this;
    end(): void;
    isRecording(): boolean;
    spanContext(): {
        traceId: string;
        spanId: string;
        traceFlags: number;
    };
}
/**
 * NoOp tracer that returns NoOp spans - used when telemetry is disabled
 */
declare class NoOpTracer {
    startSpan(_name: string, _options?: unknown): NoOpSpan;
    startActiveSpan<T>(name: string, fn: (span: NoOpSpan) => T): T;
    startActiveSpan<T>(name: string, options: unknown, fn: (span: NoOpSpan) => T): T;
    startActiveSpan<T>(name: string, options: unknown, context: unknown, fn: (span: NoOpSpan) => T): T;
}
/**
 * NoOp counter - used when telemetry is disabled
 */
declare class NoOpCounter {
    add(_value: number, _attributes?: Record<string, unknown>): void;
}
/**
 * NoOp histogram - used when telemetry is disabled
 */
declare class NoOpHistogram {
    record(_value: number, _attributes?: Record<string, unknown>): void;
}
/**
 * NoOp gauge (observable) - used when telemetry is disabled
 */
declare class NoOpObservableGauge {
    addCallback(_callback: unknown): void;
    removeCallback(_callback: unknown): void;
}
/**
 * NoOp meter - used when telemetry is disabled
 */
declare class NoOpMeter {
    createCounter(_name: string, _options?: unknown): NoOpCounter;
    createHistogram(_name: string, _options?: unknown): NoOpHistogram;
    createObservableGauge(_name: string, _options?: unknown): NoOpObservableGauge;
    createUpDownCounter(_name: string, _options?: unknown): NoOpCounter;
    createObservableCounter(_name: string, _options?: unknown): NoOpObservableGauge;
    createObservableUpDownCounter(_name: string, _options?: unknown): NoOpObservableGauge;
}
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
export declare class TelemetryManager {
    private sdk;
    private initialized;
    private readonly enabled;
    private readonly serviceName;
    private readonly serviceVersion;
    private readonly endpoint;
    private readonly metricExportIntervalMs;
    constructor(options?: TelemetryOptions);
    /**
     * Starts the OpenTelemetry SDK.
     * If telemetry is disabled, this is a no-op.
     */
    start(): Promise<void>;
    /**
     * Shuts down the OpenTelemetry SDK, flushing any pending traces and metrics.
     * If telemetry is disabled, this is a no-op.
     */
    shutdown(): Promise<void>;
    /**
     * Gets a tracer for creating spans.
     * Returns a no-op tracer if telemetry is disabled.
     *
     * @param name - Name of the tracer (typically component name)
     * @param version - Optional version of the component
     */
    getTracer(name: string, version?: string): OTelTracer | NoOpTracer;
    /**
     * Gets a meter for creating metrics.
     * Returns a no-op meter if telemetry is disabled.
     *
     * @param name - Name of the meter (typically component name)
     * @param version - Optional version of the component
     */
    getMeter(name: string, version?: string): OTelMeter | NoOpMeter;
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
    withSpan<T>(name: string, fn: (span: OTelSpan | NoOpSpan) => Promise<T>): Promise<T>;
    /**
     * Extracts trace context from HTTP headers (W3C Trace Context format).
     *
     * @param headers - HTTP headers containing trace context
     * @returns A context object that can be used for span creation
     */
    extractContext(headers: Record<string, string | string[] | undefined>): ReturnType<typeof context.active>;
    /**
     * Injects trace context into HTTP headers (W3C Trace Context format).
     *
     * @param headers - HTTP headers object to inject context into
     * @returns The headers object with trace context added
     */
    injectContext(headers?: Record<string, string>): Record<string, string>;
    /**
     * Returns whether telemetry is enabled.
     */
    isEnabled(): boolean;
    /**
     * Returns whether the SDK has been initialized.
     */
    isInitialized(): boolean;
    /**
     * Gets the configured service name.
     */
    getServiceName(): string;
    /**
     * @deprecated Use start() instead
     */
    initialize(): Promise<void>;
}
export { SpanStatusCode } from '@opentelemetry/api';
export type { Tracer as OTelTracer, Meter as OTelMeter, Span as OTelSpan } from '@opentelemetry/api';
//# sourceMappingURL=telemetry.d.ts.map