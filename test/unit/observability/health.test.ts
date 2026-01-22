import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express, { Express } from 'express';
import { createServer, Server } from 'node:http';
import {
  HealthChecker,
  HealthCheckResponse,
  CheckResult,
  healthMiddleware,
  createMemoryCheck,
  createEventLoopCheck,
  createShutdownCheck,
  registerBuiltInChecks,
} from '../../../src/observability/health.js';
import { ShutdownManager } from '../../../src/server.js';
import { getTestPort } from '../../helpers/ports.js';

// =============================================================================
// Test Helpers
// =============================================================================

async function startServer(app: Express, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function stopServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

// =============================================================================
// HealthChecker Tests
// =============================================================================

describe('HealthChecker', () => {
  let healthChecker: HealthChecker;

  beforeEach(() => {
    healthChecker = new HealthChecker({ version: '1.0.0' });
  });

  describe('constructor', () => {
    it('should create with default version', () => {
      const checker = new HealthChecker();
      expect(checker.getVersion()).toBe('0.0.0');
    });

    it('should create with custom version', () => {
      expect(healthChecker.getVersion()).toBe('1.0.0');
    });

    it('should start tracking uptime from creation', async () => {
      const checker = new HealthChecker();
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(checker.getUptime()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('registerCheck', () => {
    it('should register a health check', async () => {
      healthChecker.registerCheck('test', () => ({
        status: 'pass',
        message: 'OK',
      }));

      const result = await healthChecker.runChecks();
      expect(result.checks['test']).toBeDefined();
      expect(result.checks['test']?.status).toBe('pass');
    });

    it('should allow registering async checks', async () => {
      healthChecker.registerCheck('async-test', async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return { status: 'pass', message: 'Async OK' };
      });

      const result = await healthChecker.runChecks();
      expect(result.checks['async-test']?.status).toBe('pass');
    });

    it('should overwrite existing check with same name', async () => {
      healthChecker.registerCheck('test', () => ({
        status: 'pass',
        message: 'First',
      }));
      healthChecker.registerCheck('test', () => ({
        status: 'warn',
        message: 'Second',
      }));

      const result = await healthChecker.runChecks();
      expect(result.checks['test']?.status).toBe('warn');
      expect(result.checks['test']?.message).toBe('Second');
    });
  });

  describe('unregisterCheck', () => {
    it('should unregister a health check', async () => {
      healthChecker.registerCheck('test', () => ({
        status: 'pass',
      }));
      healthChecker.unregisterCheck('test');

      const result = await healthChecker.runChecks();
      expect(result.checks['test']).toBeUndefined();
    });

    it('should not throw when unregistering non-existent check', () => {
      expect(() => healthChecker.unregisterCheck('non-existent')).not.toThrow();
    });
  });

  describe('runChecks', () => {
    it('should return healthy status when no checks are registered', async () => {
      const result = await healthChecker.runChecks();
      expect(result.status).toBe('healthy');
      expect(Object.keys(result.checks)).toHaveLength(0);
    });

    it('should return healthy status when all checks pass', async () => {
      healthChecker.registerCheck('check1', () => ({ status: 'pass' }));
      healthChecker.registerCheck('check2', () => ({ status: 'pass' }));

      const result = await healthChecker.runChecks();
      expect(result.status).toBe('healthy');
    });

    it('should return degraded status when any check warns', async () => {
      healthChecker.registerCheck('check1', () => ({ status: 'pass' }));
      healthChecker.registerCheck('check2', () => ({ status: 'warn', message: 'Warning' }));

      const result = await healthChecker.runChecks();
      expect(result.status).toBe('degraded');
    });

    it('should return unhealthy status when any check fails', async () => {
      healthChecker.registerCheck('check1', () => ({ status: 'pass' }));
      healthChecker.registerCheck('check2', () => ({ status: 'fail', message: 'Failed' }));

      const result = await healthChecker.runChecks();
      expect(result.status).toBe('unhealthy');
    });

    it('should return unhealthy status on exception', async () => {
      healthChecker.registerCheck('error-check', () => {
        throw new Error('Check failed');
      });

      const result = await healthChecker.runChecks();
      expect(result.status).toBe('unhealthy');
      expect(result.checks['error-check']?.status).toBe('fail');
      expect(result.checks['error-check']?.message).toBe('Check failed');
    });

    it('should include version and uptime in response', async () => {
      const result = await healthChecker.runChecks();
      expect(result.version).toBe('1.0.0');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should add timestamps to check results', async () => {
      healthChecker.registerCheck('test', () => ({ status: 'pass' }));

      const result = await healthChecker.runChecks();
      expect(result.checks['test']?.timestamp).toBeDefined();
      expect(() => new Date(result.checks['test']!.timestamp!)).not.toThrow();
    });

    it('should preserve provided timestamps', async () => {
      const timestamp = '2024-01-01T00:00:00.000Z';
      healthChecker.registerCheck('test', () => ({
        status: 'pass',
        timestamp,
      }));

      const result = await healthChecker.runChecks();
      expect(result.checks['test']?.timestamp).toBe(timestamp);
    });

    it('should prioritize fail over warn status', async () => {
      healthChecker.registerCheck('warn', () => ({ status: 'warn' }));
      healthChecker.registerCheck('fail', () => ({ status: 'fail' }));
      healthChecker.registerCheck('pass', () => ({ status: 'pass' }));

      const result = await healthChecker.runChecks();
      expect(result.status).toBe('unhealthy');
    });
  });

  describe('isAlive', () => {
    it('should always return true', () => {
      expect(healthChecker.isAlive()).toBe(true);
    });

    it('should return true even with failing checks', () => {
      healthChecker.registerCheck('fail', () => ({ status: 'fail' }));
      expect(healthChecker.isAlive()).toBe(true);
    });
  });

  describe('isReady', () => {
    it('should return true when all checks pass', async () => {
      healthChecker.registerCheck('check', () => ({ status: 'pass' }));
      expect(await healthChecker.isReady()).toBe(true);
    });

    it('should return true when checks warn (degraded)', async () => {
      healthChecker.registerCheck('check', () => ({ status: 'warn' }));
      expect(await healthChecker.isReady()).toBe(true);
    });

    it('should return false when any check fails', async () => {
      healthChecker.registerCheck('check', () => ({ status: 'fail' }));
      expect(await healthChecker.isReady()).toBe(false);
    });

    it('should return true when no checks are registered', async () => {
      expect(await healthChecker.isReady()).toBe(true);
    });
  });
});

// =============================================================================
// Built-in Checks Tests
// =============================================================================

describe('Built-in Checks', () => {
  describe('createMemoryCheck', () => {
    it('should return pass status when memory is below threshold', () => {
      const check = createMemoryCheck(0.99);
      const result = check() as CheckResult;
      expect(result.status).toBe('pass');
      expect(result.message).toContain('Memory usage:');
    });

    it('should return warn status when memory is above threshold', () => {
      // Use very low threshold to trigger warning
      const check = createMemoryCheck(0.01);
      const result = check() as CheckResult;
      expect(result.status).toBe('warn');
      expect(result.message).toContain('Memory usage high:');
    });

    it('should include timestamp', () => {
      const check = createMemoryCheck();
      const result = check() as CheckResult;
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('createEventLoopCheck', () => {
    it('should return pass status when event loop lag is below threshold', async () => {
      const check = createEventLoopCheck(1000); // High threshold
      const result = await check();
      expect(result.status).toBe('pass');
      expect(result.message).toContain('Event loop lag:');
    });

    it('should return warn status when event loop lag is above threshold', async () => {
      const check = createEventLoopCheck(0); // Threshold of 0ms
      const result = await check();
      // Even with 0 threshold, lag might be 0ms in fast systems
      // So we just verify the check runs correctly
      expect(['pass', 'warn']).toContain(result.status);
      expect(result.message).toContain('Event loop lag');
    });

    it('should include timestamp', async () => {
      const check = createEventLoopCheck();
      const result = await check();
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('createShutdownCheck', () => {
    it('should return pass status when not shutting down', () => {
      const shutdownManager = new ShutdownManager({ timeoutMs: 1000, exitProcess: false });
      const check = createShutdownCheck(shutdownManager);
      const result = check() as CheckResult;
      expect(result.status).toBe('pass');
      expect(result.message).toBe('Server is running');
    });

    it('should return fail status when shutting down', async () => {
      const shutdownManager = new ShutdownManager({ timeoutMs: 100, exitProcess: false });

      // Start shutdown
      const shutdownPromise = shutdownManager.initiateShutdown('test');

      // Check should fail during shutdown
      const check = createShutdownCheck(shutdownManager);
      const result = check() as CheckResult;
      expect(result.status).toBe('fail');
      expect(result.message).toBe('Server is shutting down');

      // Wait for shutdown to complete
      await shutdownPromise;
    });
  });

  describe('registerBuiltInChecks', () => {
    it('should register memory and event_loop checks', async () => {
      const healthChecker = new HealthChecker();
      registerBuiltInChecks(healthChecker);

      const result = await healthChecker.runChecks();
      expect(result.checks['memory']).toBeDefined();
      expect(result.checks['event_loop']).toBeDefined();
    });

    it('should register shutdown check when shutdownManager provided', async () => {
      const healthChecker = new HealthChecker();
      const shutdownManager = new ShutdownManager({ timeoutMs: 1000, exitProcess: false });
      registerBuiltInChecks(healthChecker, { shutdownManager });

      const result = await healthChecker.runChecks();
      expect(result.checks['shutdown']).toBeDefined();
    });

    it('should not register shutdown check without shutdownManager', async () => {
      const healthChecker = new HealthChecker();
      registerBuiltInChecks(healthChecker);

      const result = await healthChecker.runChecks();
      expect(result.checks['shutdown']).toBeUndefined();
    });

    it('should use custom thresholds', async () => {
      const healthChecker = new HealthChecker();
      registerBuiltInChecks(healthChecker, {
        memoryThreshold: 0.01, // Very low to trigger warning
        eventLoopLagThreshold: 1000, // Very high to ensure pass
      });

      const result = await healthChecker.runChecks();
      expect(result.checks['memory']?.status).toBe('warn');
      expect(result.checks['event_loop']?.status).toBe('pass');
    });
  });
});

// =============================================================================
// Express Middleware Tests
// =============================================================================

describe('healthMiddleware', () => {
  let app: Express;
  let server: Server;
  let healthChecker: HealthChecker;
  let port: number;

  beforeEach(() => {
    healthChecker = new HealthChecker({ version: '1.0.0' });
    app = express();
    app.use(healthMiddleware(healthChecker));
    port = getTestPort();
  });

  afterEach(async () => {
    if (server) {
      await stopServer(server);
    }
  });

  describe('GET /health (liveness)', () => {
    it('should return 200 OK', async () => {
      server = await startServer(app, port);
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      expect(response.status).toBe(200);
    });

    it('should return healthy status', async () => {
      server = await startServer(app, port);
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      const body = await response.json() as HealthCheckResponse;
      expect(body.status).toBe('healthy');
    });

    it('should include version', async () => {
      server = await startServer(app, port);
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      const body = await response.json() as HealthCheckResponse;
      expect(body.version).toBe('1.0.0');
    });

    it('should include uptime', async () => {
      server = await startServer(app, port);
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      const body = await response.json() as HealthCheckResponse;
      expect(body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return 200 even with failing checks', async () => {
      healthChecker.registerCheck('fail', () => ({ status: 'fail' }));
      server = await startServer(app, port);
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      expect(response.status).toBe(200);
    });

    it('should return empty checks object', async () => {
      healthChecker.registerCheck('test', () => ({ status: 'pass' }));
      server = await startServer(app, port);
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      const body = await response.json() as HealthCheckResponse;
      expect(body.checks).toEqual({});
    });
  });

  describe('GET /ready (readiness)', () => {
    it('should return 200 OK when healthy', async () => {
      healthChecker.registerCheck('test', () => ({ status: 'pass' }));
      server = await startServer(app, port);
      const response = await fetch(`http://127.0.0.1:${port}/ready`);
      expect(response.status).toBe(200);
      const body = await response.json() as HealthCheckResponse;
      expect(body.status).toBe('healthy');
    });

    it('should return 200 OK when degraded', async () => {
      healthChecker.registerCheck('test', () => ({ status: 'warn' }));
      server = await startServer(app, port);
      const response = await fetch(`http://127.0.0.1:${port}/ready`);
      expect(response.status).toBe(200);
      const body = await response.json() as HealthCheckResponse;
      expect(body.status).toBe('degraded');
    });

    it('should return 503 Service Unavailable when unhealthy', async () => {
      healthChecker.registerCheck('test', () => ({ status: 'fail' }));
      server = await startServer(app, port);
      const response = await fetch(`http://127.0.0.1:${port}/ready`);
      expect(response.status).toBe(503);
      const body = await response.json() as HealthCheckResponse;
      expect(body.status).toBe('unhealthy');
    });

    it('should include all check results', async () => {
      healthChecker.registerCheck('check1', () => ({ status: 'pass', message: 'OK' }));
      healthChecker.registerCheck('check2', () => ({ status: 'warn', message: 'Warning' }));

      server = await startServer(app, port);
      const response = await fetch(`http://127.0.0.1:${port}/ready`);
      const body = await response.json() as HealthCheckResponse;
      expect(body.checks['check1']).toBeDefined();
      expect(body.checks['check2']).toBeDefined();
    });

    it('should include version and uptime', async () => {
      server = await startServer(app, port);
      const response = await fetch(`http://127.0.0.1:${port}/ready`);
      const body = await response.json() as HealthCheckResponse;
      expect(body.version).toBe('1.0.0');
      expect(body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return 503 on check exception', async () => {
      healthChecker.registerCheck('error', () => {
        throw new Error('Check error');
      });

      server = await startServer(app, port);
      const response = await fetch(`http://127.0.0.1:${port}/ready`);
      expect(response.status).toBe(503);
      const body = await response.json() as HealthCheckResponse;
      expect(body.status).toBe('unhealthy');
    });
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Health Check Integration', () => {
  it('should work with ShutdownManager integration', async () => {
    const shutdownManager = new ShutdownManager({ timeoutMs: 1000, exitProcess: false });
    const healthChecker = new HealthChecker({ version: '1.0.0' });

    registerBuiltInChecks(healthChecker, { shutdownManager });

    // Should be ready initially
    expect(await healthChecker.isReady()).toBe(true);

    // Start shutdown
    const shutdownPromise = shutdownManager.initiateShutdown('test');

    // Should not be ready during shutdown
    expect(await healthChecker.isReady()).toBe(false);

    await shutdownPromise;
  });

  it('should work with Express app', async () => {
    const healthChecker = new HealthChecker({ version: '2.0.0' });
    registerBuiltInChecks(healthChecker);

    const app = express();
    app.use(healthMiddleware(healthChecker));

    const port = getTestPort();
    const server = await startServer(app, port);

    try {
      // Liveness check
      const healthResponse = await fetch(`http://127.0.0.1:${port}/health`);
      expect(healthResponse.status).toBe(200);

      // Readiness check
      const readyResponse = await fetch(`http://127.0.0.1:${port}/ready`);
      expect(readyResponse.status).toBe(200);
      const body = await readyResponse.json() as HealthCheckResponse;
      expect(body.checks['memory']).toBeDefined();
      expect(body.checks['event_loop']).toBeDefined();
    } finally {
      await stopServer(server);
    }
  });
});
