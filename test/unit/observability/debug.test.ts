import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DebugHelper,
  createDebugHelper,
  getDebugHelper,
  resetDebugHelper,
} from '../../../src/observability/debug.js';
import { StructuredLogger } from '../../../src/observability/logger.js';
import { resetConfig } from '../../../src/config.js';

// =============================================================================
// Test Setup
// =============================================================================

const originalEnv = { ...process.env };

function resetEnv() {
  delete process.env['MCP_DEBUG'];
  delete process.env['MCP_LOG_LEVEL'];
}

function restoreEnv() {
  process.env = { ...originalEnv };
}

// =============================================================================
// DebugHelper Tests
// =============================================================================

describe('DebugHelper', () => {
  beforeEach(() => {
    resetEnv();
    resetConfig();
    resetDebugHelper();
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Constructor and State
  // ===========================================================================

  describe('constructor', () => {
    it('should default to disabled when MCP_DEBUG not set', () => {
      const debug = new DebugHelper();
      expect(debug.isEnabled()).toBe(false);
    });

    it('should enable when MCP_DEBUG=true', () => {
      process.env['MCP_DEBUG'] = 'true';
      const debug = new DebugHelper();
      expect(debug.isEnabled()).toBe(true);
    });

    it('should enable when MCP_DEBUG=1', () => {
      process.env['MCP_DEBUG'] = '1';
      const debug = new DebugHelper();
      expect(debug.isEnabled()).toBe(true);
    });

    it('should disable when MCP_DEBUG=false', () => {
      process.env['MCP_DEBUG'] = 'false';
      const debug = new DebugHelper();
      expect(debug.isEnabled()).toBe(false);
    });

    it('should accept explicit enabled option', () => {
      const debug = new DebugHelper({ enabled: true });
      expect(debug.isEnabled()).toBe(true);
    });

    it('should prefer options.enabled over env var', () => {
      process.env['MCP_DEBUG'] = 'true';
      const debug = new DebugHelper({ enabled: false });
      expect(debug.isEnabled()).toBe(false);
    });

    it('should accept custom logger', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output, minLevel: 'debug' });
      const debug = new DebugHelper({ enabled: true, logger });

      debug.dump('test', { key: 'value' });

      expect(output).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Disabled Behavior
  // ===========================================================================

  describe('disabled behavior', () => {
    it('should not log requests when disabled', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output, minLevel: 'debug' });
      const debug = new DebugHelper({ enabled: false, logger });

      debug.logRequest('test/method', { param: 'value' }, 'req-1');

      expect(output).not.toHaveBeenCalled();
    });

    it('should not log responses when disabled', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output, minLevel: 'debug' });
      const debug = new DebugHelper({ enabled: false, logger });

      debug.logResponse('req-1', { result: 'ok' }, 100);

      expect(output).not.toHaveBeenCalled();
    });

    it('should not log errors when disabled', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output, minLevel: 'debug' });
      const debug = new DebugHelper({ enabled: false, logger });

      debug.logError('req-1', new Error('test'), 50);

      expect(output).not.toHaveBeenCalled();
    });

    it('should not log dumps when disabled', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output, minLevel: 'debug' });
      const debug = new DebugHelper({ enabled: false, logger });

      debug.dump('test', { key: 'value' });

      expect(output).not.toHaveBeenCalled();
    });

    it('should still execute timeAsync function when disabled', async () => {
      const debug = new DebugHelper({ enabled: false });
      let executed = false;

      const result = await debug.timeAsync('test', async () => {
        executed = true;
        return 'result';
      });

      expect(executed).toBe(true);
      expect(result).toBe('result');
    });
  });

  // ===========================================================================
  // Request Logging
  // ===========================================================================

  describe('logRequest', () => {
    it('should log request details when enabled', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output, minLevel: 'debug' });
      const debug = new DebugHelper({ enabled: true, logger });

      debug.logRequest('tools/call', { name: 'myTool' }, 'req-123');

      expect(output).toHaveBeenCalledTimes(1);
      const entry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.message).toBe('Request received');
      expect(entry.data.requestId).toBe('req-123');
      expect(entry.data.method).toBe('tools/call');
      expect(entry.data.params).toEqual({ name: 'myTool' });
    });

    it('should handle numeric request IDs', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output, minLevel: 'debug' });
      const debug = new DebugHelper({ enabled: true, logger });

      debug.logRequest('test', {}, 42);

      const entry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.data.requestId).toBe(42);
    });
  });

  // ===========================================================================
  // Response Logging
  // ===========================================================================

  describe('logResponse', () => {
    it('should log response details when enabled', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output, minLevel: 'debug' });
      const debug = new DebugHelper({ enabled: true, logger });

      debug.logResponse('req-456', { tools: ['a', 'b'] }, 123.456);

      expect(output).toHaveBeenCalledTimes(1);
      const entry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.message).toBe('Response sent');
      expect(entry.data.requestId).toBe('req-456');
      expect(entry.data.durationMs).toBe(123.46);
      expect(entry.data.result).toEqual({ tools: ['a', 'b'] });
    });

    it('should round duration to 2 decimal places', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output, minLevel: 'debug' });
      const debug = new DebugHelper({ enabled: true, logger });

      debug.logResponse('req-1', {}, 99.999);

      const entry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.data.durationMs).toBe(100);
    });
  });

  // ===========================================================================
  // Error Logging
  // ===========================================================================

  describe('logError', () => {
    it('should log Error instance details', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output, minLevel: 'debug' });
      const debug = new DebugHelper({ enabled: true, logger });

      const error = new Error('Something went wrong');
      debug.logError('req-789', error, 50);

      expect(output).toHaveBeenCalledTimes(1);
      const entry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.message).toBe('Request failed');
      expect(entry.data.requestId).toBe('req-789');
      expect(entry.data.durationMs).toBe(50);
      expect(entry.data.error.name).toBe('Error');
      expect(entry.data.error.message).toBe('Something went wrong');
      expect(entry.data.error.stack).toBeDefined();
    });

    it('should log non-Error values', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output, minLevel: 'debug' });
      const debug = new DebugHelper({ enabled: true, logger });

      debug.logError('req-1', 'string error', 10);

      const entry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.data.error.type).toBe('string');
      expect(entry.data.error.value).toBe('string error');
    });

    it('should handle TypeError', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output, minLevel: 'debug' });
      const debug = new DebugHelper({ enabled: true, logger });

      const error = new TypeError('Invalid type');
      debug.logError('req-1', error, 25);

      const entry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.data.error.name).toBe('TypeError');
      expect(entry.data.error.message).toBe('Invalid type');
    });
  });

  // ===========================================================================
  // Object Truncation
  // ===========================================================================

  describe('object truncation', () => {
    it('should not truncate small objects', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output, minLevel: 'debug' });
      const debug = new DebugHelper({ enabled: true, logger });

      const smallObj = { key: 'value' };
      debug.dump('small', smallObj);

      const entry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.data.value).toEqual({ key: 'value' });
      expect(entry.data.value.__truncated).toBeUndefined();
    });

    it('should truncate large objects', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output, minLevel: 'debug' });
      const debug = new DebugHelper({ enabled: true, logger });

      // Create object larger than 1KB
      const largeObj = { data: 'x'.repeat(2000) };
      debug.dump('large', largeObj);

      const entry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.data.value.__truncated).toBe(true);
      expect(entry.data.value.__originalSize).toBeGreaterThan(1024);
      expect(entry.data.value.__preview).toContain('... [truncated]');
    });

    it('should truncate large request params', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output, minLevel: 'debug' });
      const debug = new DebugHelper({ enabled: true, logger });

      const largeParams = { data: 'y'.repeat(2000) };
      debug.logRequest('test', largeParams, 'req-1');

      const entry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.data.params.__truncated).toBe(true);
    });

    it('should truncate large response results', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output, minLevel: 'debug' });
      const debug = new DebugHelper({ enabled: true, logger });

      const largeResult = { data: 'z'.repeat(2000) };
      debug.logResponse('req-1', largeResult, 100);

      const entry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.data.result.__truncated).toBe(true);
    });

    it('should handle objects that fail serialization', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output, minLevel: 'debug' });
      const debug = new DebugHelper({ enabled: true, logger });

      // Create circular reference
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      debug.dump('circular', circular);

      const entry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.data.value.__serializationError).toBe(true);
      expect(entry.data.value.__type).toBe('object');
    });
  });

  // ===========================================================================
  // Performance Timing
  // ===========================================================================

  describe('timeAsync', () => {
    it('should return function result when enabled', async () => {
      const debug = new DebugHelper({ enabled: true });

      const result = await debug.timeAsync('test', async () => {
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('should return function result when disabled', async () => {
      const debug = new DebugHelper({ enabled: false });

      const result = await debug.timeAsync('test', async () => {
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('should log timing on success', async () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output, minLevel: 'debug' });
      const debug = new DebugHelper({ enabled: true, logger });

      await debug.timeAsync('my-operation', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'done';
      });

      expect(output).toHaveBeenCalledTimes(1);
      const entry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.message).toBe('Operation completed');
      expect(entry.data.operation).toBe('my-operation');
      expect(entry.data.status).toBe('success');
      expect(entry.data.durationMs).toBeGreaterThanOrEqual(10);
    });

    it('should log timing on error and rethrow', async () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output, minLevel: 'debug' });
      const debug = new DebugHelper({ enabled: true, logger });

      const testError = new Error('Test failure');

      await expect(
        debug.timeAsync('failing-op', async () => {
          throw testError;
        })
      ).rejects.toThrow('Test failure');

      expect(output).toHaveBeenCalledTimes(1);
      const entry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.message).toBe('Operation failed');
      expect(entry.data.operation).toBe('failing-op');
      expect(entry.data.status).toBe('error');
      expect(entry.data.error.message).toBe('Test failure');
    });

    it('should measure accurate timing', async () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output, minLevel: 'debug' });
      const debug = new DebugHelper({ enabled: true, logger });

      const delay = 50;
      await debug.timeAsync('timed-op', async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
      });

      const entry = JSON.parse(output.mock.calls[0][0]);
      // Allow some tolerance for timing
      expect(entry.data.durationMs).toBeGreaterThanOrEqual(delay - 5);
      expect(entry.data.durationMs).toBeLessThan(delay + 50);
    });

    it('should not log when disabled', async () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output, minLevel: 'debug' });
      const debug = new DebugHelper({ enabled: false, logger });

      await debug.timeAsync('test', async () => 'result');

      expect(output).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Dump
  // ===========================================================================

  describe('dump', () => {
    it('should log object with label when enabled', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output, minLevel: 'debug' });
      const debug = new DebugHelper({ enabled: true, logger });

      debug.dump('user-data', { id: 1, name: 'Alice' });

      expect(output).toHaveBeenCalledTimes(1);
      const entry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.message).toBe('Dump: user-data');
      expect(entry.data.value).toEqual({ id: 1, name: 'Alice' });
    });

    it('should handle null values', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output, minLevel: 'debug' });
      const debug = new DebugHelper({ enabled: true, logger });

      debug.dump('null-test', null);

      const entry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.data.value).toBeNull();
    });

    it('should handle undefined values', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output, minLevel: 'debug' });
      const debug = new DebugHelper({ enabled: true, logger });

      debug.dump('undefined-test', undefined);

      const entry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.data.value).toBeUndefined();
    });

    it('should handle arrays', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output, minLevel: 'debug' });
      const debug = new DebugHelper({ enabled: true, logger });

      debug.dump('array-test', [1, 2, 3]);

      const entry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.data.value).toEqual([1, 2, 3]);
    });
  });
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('createDebugHelper', () => {
  beforeEach(() => {
    resetEnv();
    resetConfig();
    resetDebugHelper();
  });

  afterEach(() => {
    restoreEnv();
  });

  it('should create disabled helper when config.debug is false', () => {
    const debug = createDebugHelper({ debug: false } as any);
    expect(debug.isEnabled()).toBe(false);
  });

  it('should create enabled helper when config.debug is true', () => {
    const debug = createDebugHelper({ debug: true } as any);
    expect(debug.isEnabled()).toBe(true);
  });
});

// =============================================================================
// Singleton Tests
// =============================================================================

describe('getDebugHelper singleton', () => {
  beforeEach(() => {
    resetEnv();
    resetConfig();
    resetDebugHelper();
  });

  afterEach(() => {
    restoreEnv();
  });

  it('should return same instance on multiple calls', () => {
    const debug1 = getDebugHelper();
    const debug2 = getDebugHelper();

    expect(debug1).toBe(debug2);
  });

  it('should use MCP_DEBUG from environment', () => {
    process.env['MCP_DEBUG'] = 'true';
    resetConfig();
    resetDebugHelper();

    const debug = getDebugHelper();
    expect(debug.isEnabled()).toBe(true);
  });

  it('should return disabled when MCP_DEBUG not set', () => {
    const debug = getDebugHelper();
    expect(debug.isEnabled()).toBe(false);
  });

  it('should return new instance after reset', () => {
    const debug1 = getDebugHelper();
    resetDebugHelper();
    const debug2 = getDebugHelper();

    expect(debug1).not.toBe(debug2);
  });
});
