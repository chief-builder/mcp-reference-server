/**
 * OpenTelemetry setup
 */
export interface TelemetryConfig {
    serviceName: string;
    serviceVersion?: string;
    enabled?: boolean;
    endpoint?: string;
}
export declare class TelemetryManager {
    private readonly config;
    private initialized;
    constructor(config: TelemetryConfig);
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    isInitialized(): boolean;
}
//# sourceMappingURL=telemetry.d.ts.map