/**
 * OpenTelemetry setup
 */
export class TelemetryManager {
    config;
    initialized = false;
    constructor(config) {
        this.config = config;
    }
    async initialize() {
        if (!this.config.enabled) {
            return;
        }
        if (this.initialized) {
            return;
        }
        // TODO: Initialize OpenTelemetry SDK
        // - NodeSDK setup
        // - Resource configuration
        // - Exporter configuration
        this.initialized = true;
    }
    async shutdown() {
        if (!this.initialized) {
            return;
        }
        // TODO: Shutdown OpenTelemetry SDK
        this.initialized = false;
    }
    isInitialized() {
        return this.initialized;
    }
}
//# sourceMappingURL=telemetry.js.map