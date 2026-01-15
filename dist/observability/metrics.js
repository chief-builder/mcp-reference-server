/**
 * Custom metrics for MCP server
 */
export class MetricsManager {
    config;
    constructor(config = {}) {
        this.config = config;
    }
    getPrefix() {
        return this.config.prefix;
    }
    createCounter(_name, _description) {
        // TODO: Create OpenTelemetry counter
        return {
            add: () => { },
        };
    }
    createHistogram(_name, _description, _boundaries) {
        // TODO: Create OpenTelemetry histogram
        return {
            record: () => { },
        };
    }
    createGauge(_name, _description) {
        // TODO: Create OpenTelemetry gauge
        return {
            set: () => { },
        };
    }
}
// Pre-defined MCP metrics
export const MCP_METRICS = {
    requestCount: 'mcp.requests.count',
    requestDuration: 'mcp.requests.duration',
    requestErrors: 'mcp.requests.errors',
    toolExecutions: 'mcp.tools.executions',
    toolDuration: 'mcp.tools.duration',
    activeSessions: 'mcp.sessions.active',
};
//# sourceMappingURL=metrics.js.map