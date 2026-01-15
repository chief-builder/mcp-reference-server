import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trace, context, SpanContext, TraceFlags } from '@opentelemetry/api';
import { StructuredLogger, type LogEntry, type LogLevel } from '../../../src/observability/logger.js';

// =============================================================================
// Test Setup
// =============================================================================

// Store original env vars
const originalEnv = { ...process.env };

function resetEnv() {
  delete process.env['MCP_LOG_LEVEL'];
}

function restoreEnv() {
  process.env = { ...originalEnv };
}

// Mock span for trace context tests
function createMockSpan(traceId: string, spanId: string) {
  return {
    spanContext: () => ({
      traceId,
      spanId,
      traceFlags: TraceFlags.SAMPLED,
      isRemote: false,
    } as SpanContext),
  };
}

// =============================================================================
// StructuredLogger Tests
// =============================================================================

describe('StructuredLogger', () => {
  beforeEach(() => {
    resetEnv();
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create with default options', () => {
      const logger = new StructuredLogger();
      expect(logger.getName()).toBeUndefined();
      expect(logger.getLevel()).toBe('info');
    });

    it('should accept custom name', () => {
      const logger = new StructuredLogger({ name: 'my-component' });
      expect(logger.getName()).toBe('my-component');
    });

    it('should accept custom min level', () => {
      const logger = new StructuredLogger({ minLevel: 'debug' });
      expect(logger.getLevel()).toBe('debug');
    });

    it('should read MCP_LOG_LEVEL from environment', () => {
      process.env['MCP_LOG_LEVEL'] = 'warning';
      const logger = new StructuredLogger();
      expect(logger.getLevel()).toBe('warning');
    });

    it('should prefer options.minLevel over environment', () => {
      process.env['MCP_LOG_LEVEL'] = 'warning';
      const logger = new StructuredLogger({ minLevel: 'debug' });
      expect(logger.getLevel()).toBe('debug');
    });

    it('should ignore invalid MCP_LOG_LEVEL', () => {
      process.env['MCP_LOG_LEVEL'] = 'invalid';
      const logger = new StructuredLogger();
      expect(logger.getLevel()).toBe('info');
    });
  });

  describe('JSON output format', () => {
    it('should output valid JSON', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output });

      logger.info('Test message');

      expect(output).toHaveBeenCalledTimes(1);
      const json = output.mock.calls[0][0];
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should include required fields', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output });

      logger.info('Test message');

      const entry: LogEntry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.timestamp).toBeDefined();
      expect(entry.level).toBe('info');
      expect(entry.message).toBe('Test message');
    });

    it('should format timestamp as ISO 8601', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output });

      logger.info('Test');

      const entry: LogEntry = JSON.parse(output.mock.calls[0][0]);
      // ISO 8601 format check
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it('should include logger name when provided', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ name: 'test-logger', output });

      logger.info('Test');

      const entry: LogEntry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.logger).toBe('test-logger');
    });

    it('should omit logger when not provided', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output });

      logger.info('Test');

      const entry: LogEntry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.logger).toBeUndefined();
    });

    it('should include data when provided', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output });

      logger.info('Test', { key: 'value', count: 42 });

      const entry: LogEntry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.data).toEqual({ key: 'value', count: 42 });
    });

    it('should omit data when not provided', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output });

      logger.info('Test');

      const entry: LogEntry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.data).toBeUndefined();
    });

    it('should handle complex data types', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output });

      logger.info('Test', {
        array: [1, 2, 3],
        nested: { deep: { value: true } },
        nullValue: null,
      });

      const entry: LogEntry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.data).toEqual({
        array: [1, 2, 3],
        nested: { deep: { value: true } },
        nullValue: null,
      });
    });

    it('should output NDJSON (one object per line)', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output });

      logger.info('First');
      logger.info('Second');

      expect(output).toHaveBeenCalledTimes(2);
      // Each call should be a single JSON object (no newlines in the output)
      expect(output.mock.calls[0][0]).not.toContain('\n');
      expect(output.mock.calls[1][0]).not.toContain('\n');
    });
  });

  describe('level filtering', () => {
    it('should log messages at current level', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ minLevel: 'info', output });

      logger.info('Test');

      expect(output).toHaveBeenCalledTimes(1);
    });

    it('should log messages above current level (more severe)', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ minLevel: 'warning', output });

      logger.error('Error');
      logger.critical('Critical');

      expect(output).toHaveBeenCalledTimes(2);
    });

    it('should not log messages below current level (less severe)', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ minLevel: 'warning', output });

      logger.notice('Notice');
      logger.info('Info');
      logger.debug('Debug');

      expect(output).not.toHaveBeenCalled();
    });

    it('should respect RFC 5424 priority ordering', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ minLevel: 'error', output });

      // Should log (priority <= error)
      logger.emergency('Emergency');
      logger.alert('Alert');
      logger.critical('Critical');
      logger.error('Error');

      // Should not log (priority > error)
      logger.warning('Warning');
      logger.notice('Notice');
      logger.info('Info');
      logger.debug('Debug');

      expect(output).toHaveBeenCalledTimes(4);
    });

    it('should log everything when level is debug', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ minLevel: 'debug', output });

      const levels: LogLevel[] = [
        'emergency',
        'alert',
        'critical',
        'error',
        'warning',
        'notice',
        'info',
        'debug',
      ];

      for (const level of levels) {
        logger.log(level, `${level} message`);
      }

      expect(output).toHaveBeenCalledTimes(8);
    });

    it('should only log emergency when level is emergency', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ minLevel: 'emergency', output });

      logger.emergency('Emergency');
      logger.alert('Alert');
      logger.debug('Debug');

      expect(output).toHaveBeenCalledTimes(1);
    });
  });

  describe('trace correlation', () => {
    it('should include traceId and spanId when span is active', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output });

      const mockSpan = createMockSpan(
        '0af7651916cd43dd8448eb211c80319c',
        'b7ad6b7169203331'
      );

      vi.spyOn(trace, 'getSpan').mockReturnValue(mockSpan as any);

      logger.info('Test');

      const entry: LogEntry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
      expect(entry.spanId).toBe('b7ad6b7169203331');
    });

    it('should omit traceId/spanId when no active span', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output });

      vi.spyOn(trace, 'getSpan').mockReturnValue(undefined);

      logger.info('Test');

      const entry: LogEntry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.traceId).toBeUndefined();
      expect(entry.spanId).toBeUndefined();
    });

    it('should omit trace context when traceId is all zeros', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output });

      const mockSpan = createMockSpan(
        '00000000000000000000000000000000',
        '0000000000000000'
      );

      vi.spyOn(trace, 'getSpan').mockReturnValue(mockSpan as any);

      logger.info('Test');

      const entry: LogEntry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.traceId).toBeUndefined();
      expect(entry.spanId).toBeUndefined();
    });
  });

  describe('convenience methods', () => {
    let output: ReturnType<typeof vi.fn>;
    let logger: StructuredLogger;

    beforeEach(() => {
      output = vi.fn();
      logger = new StructuredLogger({ minLevel: 'debug', output });
    });

    it('debug() should log at debug level', () => {
      logger.debug('Debug message');
      const entry: LogEntry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.level).toBe('debug');
    });

    it('info() should log at info level', () => {
      logger.info('Info message');
      const entry: LogEntry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.level).toBe('info');
    });

    it('notice() should log at notice level', () => {
      logger.notice('Notice message');
      const entry: LogEntry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.level).toBe('notice');
    });

    it('warning() should log at warning level', () => {
      logger.warning('Warning message');
      const entry: LogEntry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.level).toBe('warning');
    });

    it('error() should log at error level', () => {
      logger.error('Error message');
      const entry: LogEntry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.level).toBe('error');
    });

    it('critical() should log at critical level', () => {
      logger.critical('Critical message');
      const entry: LogEntry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.level).toBe('critical');
    });

    it('alert() should log at alert level', () => {
      logger.alert('Alert message');
      const entry: LogEntry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.level).toBe('alert');
    });

    it('emergency() should log at emergency level', () => {
      logger.emergency('Emergency message');
      const entry: LogEntry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.level).toBe('emergency');
    });

    it('convenience methods should pass data correctly', () => {
      logger.info('Test', { key: 'value' });
      const entry: LogEntry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.data).toEqual({ key: 'value' });
    });
  });

  describe('child loggers', () => {
    it('should create child with joined name', () => {
      const logger = new StructuredLogger({ name: 'parent' });
      const child = logger.child('child');
      expect(child.getName()).toBe('parent.child');
    });

    it('should use child name when parent has no name', () => {
      const logger = new StructuredLogger();
      const child = logger.child('child');
      expect(child.getName()).toBe('child');
    });

    it('should inherit minLevel from parent', () => {
      const logger = new StructuredLogger({ minLevel: 'warning' });
      const child = logger.child('child');
      expect(child.getLevel()).toBe('warning');
    });

    it('should inherit output function from parent', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ output });
      const child = logger.child('child');

      child.info('Test');

      expect(output).toHaveBeenCalledTimes(1);
    });

    it('should support multiple levels of children', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ name: 'root', output });
      const child = logger.child('level1');
      const grandchild = child.child('level2');

      expect(grandchild.getName()).toBe('root.level1.level2');

      grandchild.info('Test');
      const entry: LogEntry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.logger).toBe('root.level1.level2');
    });

    it('child should include logger name in output', () => {
      const output = vi.fn();
      const logger = new StructuredLogger({ name: 'server', output });
      const requestLogger = logger.child('request');

      requestLogger.info('Processing');

      const entry: LogEntry = JSON.parse(output.mock.calls[0][0]);
      expect(entry.logger).toBe('server.request');
    });
  });

  describe('shouldLog', () => {
    it('should return true for levels at or above current priority', () => {
      const logger = new StructuredLogger({ minLevel: 'warning' });

      expect(logger.shouldLog('emergency')).toBe(true);
      expect(logger.shouldLog('alert')).toBe(true);
      expect(logger.shouldLog('critical')).toBe(true);
      expect(logger.shouldLog('error')).toBe(true);
      expect(logger.shouldLog('warning')).toBe(true);
    });

    it('should return false for levels below current priority', () => {
      const logger = new StructuredLogger({ minLevel: 'warning' });

      expect(logger.shouldLog('notice')).toBe(false);
      expect(logger.shouldLog('info')).toBe(false);
      expect(logger.shouldLog('debug')).toBe(false);
    });
  });

  describe('default output', () => {
    it('should use console.log by default', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const logger = new StructuredLogger();

      logger.info('Test');

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0][0]).toContain('"message":"Test"');
    });
  });
});

// =============================================================================
// LogEntry Interface Tests
// =============================================================================

describe('LogEntry interface', () => {
  it('should match expected structure', () => {
    const output = vi.fn();
    const logger = new StructuredLogger({
      name: 'test',
      output,
    });

    // Mock span for trace context
    const mockSpan = createMockSpan(
      'abc123def456abc123def456abc123de',
      'span12345678'
    );
    vi.spyOn(trace, 'getSpan').mockReturnValue(mockSpan as any);

    logger.info('Complete log entry', { extra: 'data' });

    const entry: LogEntry = JSON.parse(output.mock.calls[0][0]);

    // Verify all fields
    expect(typeof entry.timestamp).toBe('string');
    expect(entry.level).toBe('info');
    expect(entry.message).toBe('Complete log entry');
    expect(entry.logger).toBe('test');
    expect(entry.traceId).toBe('abc123def456abc123def456abc123de');
    expect(entry.spanId).toBe('span12345678');
    expect(entry.data).toEqual({ extra: 'data' });

    vi.restoreAllMocks();
  });
});

// =============================================================================
// Environment Variable Tests
// =============================================================================

describe('MCP_LOG_LEVEL environment variable', () => {
  beforeEach(() => {
    resetEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it('should default to info when not set', () => {
    const logger = new StructuredLogger();
    expect(logger.getLevel()).toBe('info');
  });

  it('should use debug level from env', () => {
    process.env['MCP_LOG_LEVEL'] = 'debug';
    const logger = new StructuredLogger();
    expect(logger.getLevel()).toBe('debug');
  });

  it('should use error level from env', () => {
    process.env['MCP_LOG_LEVEL'] = 'error';
    const logger = new StructuredLogger();
    expect(logger.getLevel()).toBe('error');
  });

  it('should use emergency level from env', () => {
    process.env['MCP_LOG_LEVEL'] = 'emergency';
    const logger = new StructuredLogger();
    expect(logger.getLevel()).toBe('emergency');
  });

  it('should fall back to info for invalid level', () => {
    process.env['MCP_LOG_LEVEL'] = 'trace';
    const logger = new StructuredLogger();
    expect(logger.getLevel()).toBe('info');
  });

  it('should fall back to info for empty string', () => {
    process.env['MCP_LOG_LEVEL'] = '';
    const logger = new StructuredLogger();
    expect(logger.getLevel()).toBe('info');
  });
});
