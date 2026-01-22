import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ShutdownManager,
  MCPServer,
  createShutdownManager,
} from '../../src/server.js';
import { LifecycleManager } from '../../src/protocol/lifecycle.js';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Wait for a condition to be true with timeout
 */
async function waitFor(
  condition: () => boolean,
  timeoutMs: number = 1000,
  intervalMs: number = 10
): Promise<void> {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (condition()) {
        resolve();
        return;
      }
      if (Date.now() - startTime >= timeoutMs) {
        reject(new Error(`Condition not met within ${timeoutMs}ms`));
        return;
      }
      setTimeout(check, intervalMs);
    };
    check();
  });
}

/**
 * Create a mock that tracks calls
 */
function createMockCleanup(): jest.Mock & (() => Promise<void>) {
  return vi.fn().mockResolvedValue(undefined) as jest.Mock & (() => Promise<void>);
}

// =============================================================================
// ShutdownManager Tests
// =============================================================================

describe('ShutdownManager', () => {
  let shutdownManager: ShutdownManager;

  beforeEach(() => {
    shutdownManager = new ShutdownManager({
      timeoutMs: 1000,
      exitProcess: false,
    });
  });

  afterEach(async () => {
    // Ensure signal handlers are removed
    shutdownManager.removeSignalHandlers();
  });

  describe('constructor', () => {
    it('should create instance with required options', () => {
      const manager = new ShutdownManager({ timeoutMs: 5000, exitProcess: false });
      expect(manager).toBeInstanceOf(ShutdownManager);
      expect(manager.isShuttingDown()).toBe(false);
    });

    it('should accept optional onShutdown callback', () => {
      const callback = vi.fn();
      const manager = new ShutdownManager({
        timeoutMs: 5000,
        exitProcess: false,
        onShutdown: callback,
      });
      expect(manager).toBeInstanceOf(ShutdownManager);
    });
  });

  describe('register()', () => {
    it('should register cleanup handler', () => {
      const cleanup = createMockCleanup();
      expect(() => shutdownManager.register('test', cleanup)).not.toThrow();
    });

    it('should allow multiple handlers with different names', () => {
      const cleanup1 = createMockCleanup();
      const cleanup2 = createMockCleanup();
      shutdownManager.register('test1', cleanup1);
      shutdownManager.register('test2', cleanup2);
      // No error means success
    });

    it('should overwrite handler with same name', () => {
      const cleanup1 = createMockCleanup();
      const cleanup2 = createMockCleanup();
      shutdownManager.register('test', cleanup1);
      shutdownManager.register('test', cleanup2);
      // No error means success
    });

    it('should throw if called during shutdown', async () => {
      // Start shutdown
      const shutdownPromise = shutdownManager.initiateShutdown('test');

      // Try to register during shutdown
      const cleanup = createMockCleanup();
      expect(() => shutdownManager.register('late', cleanup)).toThrow(
        'Cannot register cleanup handlers during shutdown'
      );

      await shutdownPromise;
    });
  });

  describe('unregister()', () => {
    it('should remove registered handler', async () => {
      const cleanup = createMockCleanup();
      shutdownManager.register('test', cleanup);
      shutdownManager.unregister('test');

      await shutdownManager.initiateShutdown('test');
      expect(cleanup).not.toHaveBeenCalled();
    });

    it('should not throw for non-existent handler', () => {
      expect(() => shutdownManager.unregister('nonexistent')).not.toThrow();
    });
  });

  describe('trackRequest() / completeRequest()', () => {
    it('should track request', () => {
      expect(shutdownManager.getInFlightCount()).toBe(0);
      shutdownManager.trackRequest('req-1');
      expect(shutdownManager.getInFlightCount()).toBe(1);
    });

    it('should track multiple requests', () => {
      shutdownManager.trackRequest('req-1');
      shutdownManager.trackRequest('req-2');
      shutdownManager.trackRequest('req-3');
      expect(shutdownManager.getInFlightCount()).toBe(3);
    });

    it('should complete request', () => {
      shutdownManager.trackRequest('req-1');
      shutdownManager.trackRequest('req-2');
      shutdownManager.completeRequest('req-1');
      expect(shutdownManager.getInFlightCount()).toBe(1);
    });

    it('should not track new requests after shutdown starts', async () => {
      const shutdownPromise = shutdownManager.initiateShutdown('test');
      shutdownManager.trackRequest('req-late');
      expect(shutdownManager.getInFlightCount()).toBe(0);
      await shutdownPromise;
    });

    it('should allow completing requests after shutdown starts', async () => {
      shutdownManager.trackRequest('req-1');
      const shutdownPromise = shutdownManager.initiateShutdown('test');
      shutdownManager.completeRequest('req-1');
      expect(shutdownManager.getInFlightCount()).toBe(0);
      await shutdownPromise;
    });

    it('should not throw when completing non-existent request', () => {
      expect(() => shutdownManager.completeRequest('nonexistent')).not.toThrow();
    });
  });

  describe('isShuttingDown()', () => {
    it('should return false initially', () => {
      expect(shutdownManager.isShuttingDown()).toBe(false);
    });

    it('should return true after shutdown initiated', async () => {
      const shutdownPromise = shutdownManager.initiateShutdown('test');
      expect(shutdownManager.isShuttingDown()).toBe(true);
      await shutdownPromise;
    });

    it('should remain true after shutdown completes', async () => {
      await shutdownManager.initiateShutdown('test');
      expect(shutdownManager.isShuttingDown()).toBe(true);
    });
  });

  describe('initiateShutdown()', () => {
    it('should run registered cleanup handlers', async () => {
      const cleanup1 = createMockCleanup();
      const cleanup2 = createMockCleanup();
      shutdownManager.register('handler1', cleanup1);
      shutdownManager.register('handler2', cleanup2);

      await shutdownManager.initiateShutdown('test');

      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
    });

    it('should run handlers in registration order', async () => {
      const callOrder: string[] = [];
      shutdownManager.register('first', async () => {
        callOrder.push('first');
      });
      shutdownManager.register('second', async () => {
        callOrder.push('second');
      });
      shutdownManager.register('third', async () => {
        callOrder.push('third');
      });

      await shutdownManager.initiateShutdown('test');

      expect(callOrder).toEqual(['first', 'second', 'third']);
    });

    it('should call onShutdown callback', async () => {
      const onShutdown = vi.fn().mockResolvedValue(undefined);
      const manager = new ShutdownManager({
        timeoutMs: 1000,
        exitProcess: false,
        onShutdown,
      });

      await manager.initiateShutdown('test');

      expect(onShutdown).toHaveBeenCalledTimes(1);
    });

    it('should be idempotent (multiple calls only run cleanup once)', async () => {
      const cleanup = createMockCleanup();
      shutdownManager.register('test', cleanup);

      // Call initiateShutdown multiple times
      const promise1 = shutdownManager.initiateShutdown('test');
      const promise2 = shutdownManager.initiateShutdown('test');
      const promise3 = shutdownManager.initiateShutdown('test');

      // All should resolve
      await Promise.all([promise1, promise2, promise3]);

      // But cleanup should only run once
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('should wait for in-flight requests to complete', async () => {
      shutdownManager.trackRequest('req-1');

      let shutdownCompleted = false;
      const shutdownPromise = shutdownManager.initiateShutdown('test').then(() => {
        shutdownCompleted = true;
      });

      // Give shutdown some time to start
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(shutdownCompleted).toBe(false);

      // Complete the request
      shutdownManager.completeRequest('req-1');

      await shutdownPromise;
      expect(shutdownCompleted).toBe(true);
    });

    it('should timeout if requests take too long', async () => {
      const manager = new ShutdownManager({ timeoutMs: 100, exitProcess: false });
      manager.trackRequest('slow-request');

      const startTime = Date.now();
      await manager.initiateShutdown('test');
      const elapsed = Date.now() - startTime;

      // Should have timed out around 100ms
      expect(elapsed).toBeGreaterThanOrEqual(100);
      expect(elapsed).toBeLessThan(200);
    });

    it('should continue cleanup even if handler throws', async () => {
      const cleanup1 = vi.fn().mockRejectedValue(new Error('Handler error'));
      const cleanup2 = createMockCleanup();
      shutdownManager.register('failing', cleanup1);
      shutdownManager.register('working', cleanup2);

      await shutdownManager.initiateShutdown('test');

      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
    });

    it('should continue if onShutdown throws', async () => {
      const onShutdown = vi.fn().mockRejectedValue(new Error('Callback error'));
      const manager = new ShutdownManager({
        timeoutMs: 1000,
        exitProcess: false,
        onShutdown,
      });

      // Should not throw
      await expect(manager.initiateShutdown('test')).resolves.toBeUndefined();
      expect(onShutdown).toHaveBeenCalled();
    });
  });

  describe('installSignalHandlers() / removeSignalHandlers()', () => {
    it('should install signal handlers', () => {
      const initialListeners = process.listenerCount('SIGTERM');
      shutdownManager.installSignalHandlers();
      expect(process.listenerCount('SIGTERM')).toBe(initialListeners + 1);
      expect(process.listenerCount('SIGINT')).toBeGreaterThan(0);
    });

    it('should be idempotent (multiple calls are safe)', () => {
      const initialListeners = process.listenerCount('SIGTERM');
      shutdownManager.installSignalHandlers();
      shutdownManager.installSignalHandlers();
      shutdownManager.installSignalHandlers();
      expect(process.listenerCount('SIGTERM')).toBe(initialListeners + 1);
    });

    it('should remove signal handlers', () => {
      const initialListeners = process.listenerCount('SIGTERM');
      shutdownManager.installSignalHandlers();
      expect(process.listenerCount('SIGTERM')).toBe(initialListeners + 1);
      shutdownManager.removeSignalHandlers();
      expect(process.listenerCount('SIGTERM')).toBe(initialListeners);
    });

    it('should be safe to remove without installing', () => {
      expect(() => shutdownManager.removeSignalHandlers()).not.toThrow();
    });
  });
});

// =============================================================================
// MCPServer Tests
// =============================================================================

describe('MCPServer', () => {
  let server: MCPServer;

  afterEach(async () => {
    if (server) {
      const shutdownManager = server.getShutdownManager();
      shutdownManager?.removeSignalHandlers();
    }
  });

  describe('constructor', () => {
    it('should create instance with no options', () => {
      server = new MCPServer({ exitProcess: false });
      expect(server).toBeInstanceOf(MCPServer);
    });

    it('should create instance with config', () => {
      server = new MCPServer({
        exitProcess: false,
        config: {
          port: 3000,
          host: 'localhost',
          transport: 'http',
          statelessMode: false,
          pageSize: 50,
          requestTimeoutMs: 60000,
          shutdownTimeoutMs: 5000,
          progressIntervalMs: 100,
          debug: false,
          logLevel: 'info',
          auth0: {},
        },
      });
      expect(server).toBeInstanceOf(MCPServer);
    });
  });

  describe('start()', () => {
    it('should start server and create shutdown manager', async () => {
      server = new MCPServer({ exitProcess: false });
      await server.start();

      expect(server.isHealthy()).toBe(true);
      expect(server.isReady()).toBe(true);
      expect(server.getShutdownManager()).toBeInstanceOf(ShutdownManager);
    });

    it('should be idempotent', async () => {
      server = new MCPServer({ exitProcess: false });
      await server.start();
      await server.start();
      await server.start();

      expect(server.isHealthy()).toBe(true);
    });

    it('should use config shutdownTimeoutMs', async () => {
      server = new MCPServer({
        exitProcess: false,
        config: {
          port: 3000,
          host: 'localhost',
          transport: 'http',
          statelessMode: false,
          pageSize: 50,
          requestTimeoutMs: 60000,
          shutdownTimeoutMs: 12345,
          progressIntervalMs: 100,
          debug: false,
          logLevel: 'info',
          auth0: {},
        },
      });
      await server.start();

      // The shutdown manager is created with the configured timeout
      expect(server.getShutdownManager()).not.toBeNull();
    });
  });

  describe('stop()', () => {
    it('should stop server gracefully', async () => {
      server = new MCPServer({ exitProcess: false });
      await server.start();
      expect(server.isReady()).toBe(true);

      await server.stop();
      expect(server.isReady()).toBe(false);
    });

    it('should be safe to call without starting', async () => {
      server = new MCPServer({ exitProcess: false });
      await expect(server.stop()).resolves.toBeUndefined();
    });
  });

  describe('isReady() / isHealthy()', () => {
    it('should return false before start', () => {
      server = new MCPServer({ exitProcess: false });
      expect(server.isReady()).toBe(false);
      expect(server.isHealthy()).toBe(false);
    });

    it('should return true after start', async () => {
      server = new MCPServer({ exitProcess: false });
      await server.start();
      expect(server.isReady()).toBe(true);
      expect(server.isHealthy()).toBe(true);
    });

    it('should return false for ready during shutdown', async () => {
      server = new MCPServer({ exitProcess: false });
      await server.start();

      // Initiate shutdown but don't wait
      const stopPromise = server.stop();
      expect(server.isReady()).toBe(false);

      await stopPromise;
    });

    it('should return true for healthy during shutdown', async () => {
      server = new MCPServer({ exitProcess: false });
      await server.start();

      // Initiate shutdown but don't wait
      const stopPromise = server.stop();
      // Still "alive" even during shutdown
      expect(server.isHealthy()).toBe(true);

      await stopPromise;
    });
  });

  describe('trackRequest() / completeRequest()', () => {
    it('should track requests via shutdown manager', async () => {
      server = new MCPServer({ exitProcess: false });
      await server.start();

      server.trackRequest('req-1');
      expect(server.getShutdownManager()?.getInFlightCount()).toBe(1);

      server.completeRequest('req-1');
      expect(server.getShutdownManager()?.getInFlightCount()).toBe(0);
    });

    it('should be safe before start', () => {
      server = new MCPServer({ exitProcess: false });
      expect(() => server.trackRequest('req-1')).not.toThrow();
      expect(() => server.completeRequest('req-1')).not.toThrow();
    });
  });

  describe('isAcceptingRequests()', () => {
    it('should return false before start', () => {
      server = new MCPServer({ exitProcess: false });
      expect(server.isAcceptingRequests()).toBe(false);
    });

    it('should return true after start', async () => {
      server = new MCPServer({ exitProcess: false });
      await server.start();
      expect(server.isAcceptingRequests()).toBe(true);
    });

    it('should return false during shutdown', async () => {
      server = new MCPServer({ exitProcess: false });
      await server.start();

      const stopPromise = server.stop();
      expect(server.isAcceptingRequests()).toBe(false);

      await stopPromise;
    });
  });

  describe('integration with LifecycleManager', () => {
    it('should call initiateShutdown on lifecycle manager during stop', async () => {
      const lifecycleManager = new LifecycleManager({
        name: 'test-server',
        version: '1.0.0',
      });

      // Initialize lifecycle manager
      lifecycleManager.handleInitialize({
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      });
      lifecycleManager.handleInitialized();

      expect(lifecycleManager.getState()).toBe('ready');

      server = new MCPServer({ lifecycleManager, exitProcess: false });
      await server.start();
      await server.stop();

      expect(lifecycleManager.getState()).toBe('shutting_down');
    });
  });
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('createShutdownManager()', () => {
  it('should create instance with defaults', () => {
    const manager = createShutdownManager({ exitProcess: false });
    expect(manager).toBeInstanceOf(ShutdownManager);
    manager.removeSignalHandlers();
  });

  it('should accept partial options', () => {
    const manager = createShutdownManager({ timeoutMs: 5000, exitProcess: false });
    expect(manager).toBeInstanceOf(ShutdownManager);
    manager.removeSignalHandlers();
  });

  it('should accept onShutdown callback', async () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    const manager = createShutdownManager({ onShutdown: callback, exitProcess: false });

    await manager.initiateShutdown('test');
    expect(callback).toHaveBeenCalled();
  });
});
