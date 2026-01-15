/**
 * Health check endpoints
 */
export class HealthManager {
    version;
    checks = new Map();
    startTime = Date.now();
    constructor(version) {
        this.version = version;
    }
    registerCheck(name, check) {
        this.checks.set(name, check);
    }
    unregisterCheck(name) {
        this.checks.delete(name);
    }
    async getStatus() {
        const results = [];
        let overallStatus = 'healthy';
        for (const [name, checkFn] of this.checks) {
            try {
                const start = performance.now();
                const result = await checkFn();
                result.duration = performance.now() - start;
                results.push(result);
                if (result.status === 'fail') {
                    overallStatus = 'unhealthy';
                }
                else if (result.status === 'warn' && overallStatus === 'healthy') {
                    overallStatus = 'degraded';
                }
            }
            catch (error) {
                results.push({
                    name,
                    status: 'fail',
                    message: error instanceof Error ? error.message : 'Unknown error',
                });
                overallStatus = 'unhealthy';
            }
        }
        return {
            status: overallStatus,
            version: this.version,
            uptime: Date.now() - this.startTime,
            checks: results,
        };
    }
    async isHealthy() {
        const status = await this.getStatus();
        return status.status !== 'unhealthy';
    }
}
//# sourceMappingURL=health.js.map