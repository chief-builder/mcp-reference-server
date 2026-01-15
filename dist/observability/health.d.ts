/**
 * Health check endpoints
 */
export interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    version: string;
    uptime: number;
    checks: HealthCheck[];
}
export interface HealthCheck {
    name: string;
    status: 'pass' | 'warn' | 'fail';
    message?: string;
    duration?: number;
}
export type HealthCheckFn = () => Promise<HealthCheck>;
export declare class HealthManager {
    private readonly version;
    private checks;
    private startTime;
    constructor(version: string);
    registerCheck(name: string, check: HealthCheckFn): void;
    unregisterCheck(name: string): void;
    getStatus(): Promise<HealthStatus>;
    isHealthy(): Promise<boolean>;
}
//# sourceMappingURL=health.d.ts.map