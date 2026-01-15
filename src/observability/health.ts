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

export class HealthManager {
  private checks: Map<string, HealthCheckFn> = new Map();
  private startTime = Date.now();

  constructor(private readonly version: string) {}

  registerCheck(name: string, check: HealthCheckFn): void {
    this.checks.set(name, check);
  }

  unregisterCheck(name: string): void {
    this.checks.delete(name);
  }

  async getStatus(): Promise<HealthStatus> {
    const results: HealthCheck[] = [];
    let overallStatus: HealthStatus['status'] = 'healthy';

    for (const [name, checkFn] of this.checks) {
      try {
        const start = performance.now();
        const result = await checkFn();
        result.duration = performance.now() - start;
        results.push(result);

        if (result.status === 'fail') {
          overallStatus = 'unhealthy';
        } else if (result.status === 'warn' && overallStatus === 'healthy') {
          overallStatus = 'degraded';
        }
      } catch (error) {
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

  async isHealthy(): Promise<boolean> {
    const status = await this.getStatus();
    return status.status !== 'unhealthy';
  }
}
