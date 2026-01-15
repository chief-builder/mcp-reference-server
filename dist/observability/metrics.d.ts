/**
 * Custom metrics for MCP server
 */
export interface MetricsConfig {
    prefix?: string;
    labels?: Record<string, string>;
}
export interface Counter {
    add(value: number, labels?: Record<string, string>): void;
}
export interface Histogram {
    record(value: number, labels?: Record<string, string>): void;
}
export interface Gauge {
    set(value: number, labels?: Record<string, string>): void;
}
export declare class MetricsManager {
    private readonly config;
    constructor(config?: MetricsConfig);
    getPrefix(): string | undefined;
    createCounter(_name: string, _description: string): Counter;
    createHistogram(_name: string, _description: string, _boundaries?: number[]): Histogram;
    createGauge(_name: string, _description: string): Gauge;
}
export declare const MCP_METRICS: {
    readonly requestCount: "mcp.requests.count";
    readonly requestDuration: "mcp.requests.duration";
    readonly requestErrors: "mcp.requests.errors";
    readonly toolExecutions: "mcp.tools.executions";
    readonly toolDuration: "mcp.tools.duration";
    readonly activeSessions: "mcp.sessions.active";
};
//# sourceMappingURL=metrics.d.ts.map