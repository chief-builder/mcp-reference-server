/**
 * Trace propagation for MCP
 */
export interface SpanContext {
    traceId: string;
    spanId: string;
    traceFlags: number;
}
export interface Span {
    setStatus(status: 'ok' | 'error', message?: string): void;
    setAttribute(key: string, value: string | number | boolean): void;
    addEvent(name: string, attributes?: Record<string, string | number | boolean>): void;
    end(): void;
}
export interface TracerOptions {
    name: string;
    version?: string;
}
export declare class Tracer {
    private readonly options;
    constructor(options: TracerOptions);
    getName(): string;
    startSpan(_name: string, _attributes?: Record<string, string | number | boolean>): Span;
    extractContext(_headers: Record<string, string>): SpanContext | null;
    injectContext(_context: SpanContext): Record<string, string>;
}
export declare function createTracer(options: TracerOptions): Tracer;
//# sourceMappingURL=tracing.d.ts.map