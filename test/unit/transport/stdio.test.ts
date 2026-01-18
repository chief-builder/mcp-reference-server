import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';
import {
  StdioTransport,
  createStdioTransport,
  StdioTransportOptions,
} from '../../../src/transport/stdio.js';
import {
  createRequest,
  createNotification,
  createSuccessResponse,
  JSONRPC_VERSION,
} from '../../../src/protocol/jsonrpc.js';
import { LifecycleManager } from '../../../src/protocol/lifecycle.js';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a mock readable stream for stdin simulation
 */
function createMockStdin(): Readable & { push: (chunk: string | null) => boolean } {
  const stream = new Readable({
    read() {
      // No-op, we'll push data manually
    },
  });
  return stream as Readable & { push: (chunk: string | null) => boolean };
}

/**
 * Create a mock writable stream for stdout/stderr simulation
 */
function createMockStdout(): Writable & { chunks: string[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  (stream as Writable & { chunks: string[] }).chunks = chunks;
  return stream as Writable & { chunks: string[] };
}

// Track transports for cleanup to avoid memory leak warnings
const activeTransports: StdioTransport[] = [];

/**
 * Create test options with mock streams
 */
function createTestOptions(): {
  options: StdioTransportOptions;
  stdin: ReturnType<typeof createMockStdin>;
  stdout: ReturnType<typeof createMockStdout>;
  stderr: ReturnType<typeof createMockStdout>;
  createTransport: () => StdioTransport;
} {
  const stdin = createMockStdin();
  const stdout = createMockStdout();
  const stderr = createMockStdout();
  const options = { stdin, stdout, stderr };

  // Helper to create and track transport
  const createTransport = () => {
    const transport = new StdioTransport(options);
    activeTransports.push(transport);
    return transport;
  };

  return {
    options,
    stdin,
    stdout,
    stderr,
    createTransport,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('StdioTransport', () => {
  afterEach(async () => {
    // Clean up all transports to remove signal listeners
    for (const transport of activeTransports) {
      if (!transport.isClosed()) {
        await transport.close();
      }
    }
    activeTransports.length = 0;
  });

  describe('constructor', () => {
    it('should create transport with default streams', () => {
      const transport = new StdioTransport();
      expect(transport).toBeInstanceOf(StdioTransport);
      expect(transport.isStarted()).toBe(false);
      expect(transport.isClosed()).toBe(false);
    });

    it('should create transport with custom streams', () => {
      const { options } = createTestOptions();
      const transport = new StdioTransport(options);
      expect(transport).toBeInstanceOf(StdioTransport);
    });

    it('should accept lifecycle manager option', () => {
      const { options } = createTestOptions();
      const lifecycleManager = new LifecycleManager({
        name: 'test-server',
        version: '1.0.0',
      });
      options.lifecycleManager = lifecycleManager;
      const transport = new StdioTransport(options);
      expect(transport).toBeInstanceOf(StdioTransport);
    });
  });

  describe('start()', () => {
    it('should mark transport as started', () => {
      const { createTransport } = createTestOptions();
      const transport = createTransport();

      expect(transport.isStarted()).toBe(false);
      transport.start();
      expect(transport.isStarted()).toBe(true);
    });

    it('should be idempotent (multiple calls do nothing)', () => {
      const { createTransport } = createTestOptions();
      const transport = createTransport();

      transport.start();
      transport.start();
      transport.start();
      expect(transport.isStarted()).toBe(true);
    });

    it('should throw if transport is already closed', async () => {
      const { createTransport } = createTestOptions();
      const transport = createTransport();

      await transport.close();
      expect(() => transport.start()).toThrow('Cannot start a closed transport');
    });
  });

  describe('send()', () => {
    it('should serialize and write JSON-RPC message with newline', () => {
      const { options, stdout } = createTestOptions();
      const transport = new StdioTransport(options);

      const response = createSuccessResponse(1, { tools: [] });
      transport.send(response);

      expect(stdout.chunks.length).toBe(1);
      expect(stdout.chunks[0]).toBe(JSON.stringify(response) + '\n');
    });

    it('should write requests correctly', () => {
      const { options, stdout } = createTestOptions();
      const transport = new StdioTransport(options);

      const request = createRequest(1, 'tools/list');
      transport.send(request);

      expect(stdout.chunks[0]).toBe(JSON.stringify(request) + '\n');
    });

    it('should write notifications correctly', () => {
      const { options, stdout } = createTestOptions();
      const transport = new StdioTransport(options);

      const notification = createNotification('notifications/initialized');
      transport.send(notification);

      expect(stdout.chunks[0]).toBe(JSON.stringify(notification) + '\n');
    });

    it('should throw if transport is closed', async () => {
      const { options } = createTestOptions();
      const transport = new StdioTransport(options);

      await transport.close();
      expect(() => transport.send(createSuccessResponse(1, {}))).toThrow(
        'Cannot send on a closed transport'
      );
    });
  });

  describe('log()', () => {
    it('should write to stderr with newline', () => {
      const { options, stderr } = createTestOptions();
      const transport = new StdioTransport(options);

      transport.log('Test log message');

      expect(stderr.chunks.length).toBe(1);
      expect(stderr.chunks[0]).toBe('Test log message\n');
    });

    it('should not throw when closed (silent fail)', async () => {
      const { options, stderr } = createTestOptions();
      const transport = new StdioTransport(options);

      await transport.close();
      transport.log('This should be ignored');

      // Should not have written anything after close
      expect(stderr.chunks.length).toBe(0);
    });
  });

  describe('close()', () => {
    it('should mark transport as closed', async () => {
      const { options } = createTestOptions();
      const transport = new StdioTransport(options);

      expect(transport.isClosed()).toBe(false);
      await transport.close();
      expect(transport.isClosed()).toBe(true);
    });

    it('should be idempotent (multiple calls are safe)', async () => {
      const { options } = createTestOptions();
      const transport = new StdioTransport(options);

      await transport.close();
      await transport.close();
      await transport.close();
      expect(transport.isClosed()).toBe(true);
    });

    it('should emit close event', async () => {
      const { options } = createTestOptions();
      const transport = new StdioTransport(options);

      const closeHandler = vi.fn();
      transport.onClose(closeHandler);

      await transport.close();

      expect(closeHandler).toHaveBeenCalledTimes(1);
    });

    it('should notify lifecycle manager on close', async () => {
      const { options } = createTestOptions();
      const lifecycleManager = new LifecycleManager({
        name: 'test-server',
        version: '1.0.0',
      });

      // Initialize the lifecycle manager to ready state
      lifecycleManager.handleInitialize({
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      });
      lifecycleManager.handleInitialized();

      options.lifecycleManager = lifecycleManager;
      const transport = new StdioTransport(options);

      expect(lifecycleManager.getState()).toBe('ready');
      await transport.close();
      expect(lifecycleManager.getState()).toBe('shutting_down');
    });
  });

  describe('message parsing', () => {
    it('should parse and emit valid JSON-RPC requests', async () => {
      const { createTransport, stdin } = createTestOptions();
      const transport = createTransport();

      const messageHandler = vi.fn();
      transport.onMessage(messageHandler);
      transport.start();

      const request = createRequest(1, 'tools/list');
      stdin.push(JSON.stringify(request) + '\n');

      // Wait for event loop to process
      await new Promise((resolve) => setImmediate(resolve));

      expect(messageHandler).toHaveBeenCalledTimes(1);
      expect(messageHandler).toHaveBeenCalledWith(request);
    });

    it('should parse and emit valid JSON-RPC notifications', async () => {
      const { createTransport, stdin } = createTestOptions();
      const transport = createTransport();

      const messageHandler = vi.fn();
      transport.onMessage(messageHandler);
      transport.start();

      const notification = createNotification('notifications/initialized');
      stdin.push(JSON.stringify(notification) + '\n');

      await new Promise((resolve) => setImmediate(resolve));

      expect(messageHandler).toHaveBeenCalledTimes(1);
      expect(messageHandler).toHaveBeenCalledWith(notification);
    });

    it('should handle multiple messages in sequence', async () => {
      const { createTransport, stdin } = createTestOptions();
      const transport = createTransport();

      const messageHandler = vi.fn();
      transport.onMessage(messageHandler);
      transport.start();

      const msg1 = createRequest(1, 'initialize');
      const msg2 = createNotification('notifications/initialized');
      const msg3 = createRequest(2, 'tools/list');

      stdin.push(JSON.stringify(msg1) + '\n');
      stdin.push(JSON.stringify(msg2) + '\n');
      stdin.push(JSON.stringify(msg3) + '\n');

      await new Promise((resolve) => setImmediate(resolve));

      expect(messageHandler).toHaveBeenCalledTimes(3);
      expect(messageHandler).toHaveBeenNthCalledWith(1, msg1);
      expect(messageHandler).toHaveBeenNthCalledWith(2, msg2);
      expect(messageHandler).toHaveBeenNthCalledWith(3, msg3);
    });

    it('should handle multiple messages in single chunk', async () => {
      const { createTransport, stdin } = createTestOptions();
      const transport = createTransport();

      const messageHandler = vi.fn();
      transport.onMessage(messageHandler);
      transport.start();

      const msg1 = createRequest(1, 'tools/list');
      const msg2 = createRequest(2, 'resources/list');

      // Send both in a single chunk
      stdin.push(JSON.stringify(msg1) + '\n' + JSON.stringify(msg2) + '\n');

      await new Promise((resolve) => setImmediate(resolve));

      expect(messageHandler).toHaveBeenCalledTimes(2);
      expect(messageHandler).toHaveBeenNthCalledWith(1, msg1);
      expect(messageHandler).toHaveBeenNthCalledWith(2, msg2);
    });

    it('should buffer partial messages across chunks', async () => {
      const { createTransport, stdin } = createTestOptions();
      const transport = createTransport();

      const messageHandler = vi.fn();
      transport.onMessage(messageHandler);
      transport.start();

      const request = createRequest(1, 'tools/list');
      const serialized = JSON.stringify(request);

      // Split the message across multiple chunks
      const mid = Math.floor(serialized.length / 2);
      stdin.push(serialized.substring(0, mid));

      await new Promise((resolve) => setImmediate(resolve));
      expect(messageHandler).not.toHaveBeenCalled();

      stdin.push(serialized.substring(mid) + '\n');

      await new Promise((resolve) => setImmediate(resolve));
      expect(messageHandler).toHaveBeenCalledTimes(1);
      expect(messageHandler).toHaveBeenCalledWith(request);
    });

    it('should skip empty lines', async () => {
      const { createTransport, stdin } = createTestOptions();
      const transport = createTransport();

      const messageHandler = vi.fn();
      transport.onMessage(messageHandler);
      transport.start();

      const request = createRequest(1, 'tools/list');
      stdin.push('\n\n' + JSON.stringify(request) + '\n\n\n');

      await new Promise((resolve) => setImmediate(resolve));

      expect(messageHandler).toHaveBeenCalledTimes(1);
      expect(messageHandler).toHaveBeenCalledWith(request);
    });
  });

  describe('error handling', () => {
    it('should emit error for invalid JSON', async () => {
      const { createTransport, stdin } = createTestOptions();
      const transport = createTransport();

      const errorHandler = vi.fn();
      transport.onError(errorHandler);
      transport.start();

      stdin.push('not valid json\n');

      await new Promise((resolve) => setImmediate(resolve));

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler.mock.calls[0]?.[0]).toBeInstanceOf(Error);
      expect(errorHandler.mock.calls[0]?.[0]?.message).toContain('JSON-RPC parse error');
    });

    it('should emit error for invalid JSON-RPC structure', async () => {
      const { createTransport, stdin } = createTestOptions();
      const transport = createTransport();

      const errorHandler = vi.fn();
      transport.onError(errorHandler);
      transport.start();

      // Valid JSON but not valid JSON-RPC
      stdin.push('{"foo": "bar"}\n');

      await new Promise((resolve) => setImmediate(resolve));

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler.mock.calls[0]?.[0]?.message).toContain('JSON-RPC parse error');
    });

    it('should continue processing after error', async () => {
      const { createTransport, stdin } = createTestOptions();
      const transport = createTransport();

      const messageHandler = vi.fn();
      const errorHandler = vi.fn();
      transport.onMessage(messageHandler);
      transport.onError(errorHandler);
      transport.start();

      const validRequest = createRequest(1, 'tools/list');
      stdin.push('invalid json\n');
      stdin.push(JSON.stringify(validRequest) + '\n');

      await new Promise((resolve) => setImmediate(resolve));

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(messageHandler).toHaveBeenCalledTimes(1);
      expect(messageHandler).toHaveBeenCalledWith(validRequest);
    });

    it('should emit stdin errors', async () => {
      const { createTransport, stdin } = createTestOptions();
      const transport = createTransport();

      const errorHandler = vi.fn();
      transport.onError(errorHandler);
      transport.start();

      const testError = new Error('Stream error');
      stdin.emit('error', testError);

      await new Promise((resolve) => setImmediate(resolve));

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler).toHaveBeenCalledWith(testError);
    });

    it('should emit error when line exceeds 1MB limit', async () => {
      const { createTransport, stdin } = createTestOptions();
      const transport = createTransport();

      const errorHandler = vi.fn();
      const messageHandler = vi.fn();
      transport.onError(errorHandler);
      transport.onMessage(messageHandler);
      transport.start();

      // Create data larger than 1MB (1024 * 1024 bytes) without newline
      const oversizedData = 'x'.repeat(1024 * 1024 + 1);
      stdin.push(oversizedData);

      await new Promise((resolve) => setImmediate(resolve));

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler.mock.calls[0]?.[0]).toBeInstanceOf(Error);
      expect(errorHandler.mock.calls[0]?.[0]?.message).toContain('Line exceeds maximum length');
      expect(messageHandler).not.toHaveBeenCalled();
    });

    it('should recover after oversized line error and process subsequent messages', async () => {
      const { createTransport, stdin } = createTestOptions();
      const transport = createTransport();

      const errorHandler = vi.fn();
      const messageHandler = vi.fn();
      transport.onError(errorHandler);
      transport.onMessage(messageHandler);
      transport.start();

      // First, send oversized data without newline to trigger error
      const oversizedData = 'x'.repeat(1024 * 1024 + 1);
      stdin.push(oversizedData);

      await new Promise((resolve) => setImmediate(resolve));
      expect(errorHandler).toHaveBeenCalledTimes(1);

      // Now send a valid message - transport should recover
      const validRequest = createRequest(1, 'tools/list');
      stdin.push(JSON.stringify(validRequest) + '\n');

      await new Promise((resolve) => setImmediate(resolve));

      expect(messageHandler).toHaveBeenCalledTimes(1);
      expect(messageHandler).toHaveBeenCalledWith(validRequest);
    });

    it('should not trigger error for large complete messages with newline', async () => {
      const { createTransport, stdin } = createTestOptions();
      const transport = createTransport();

      const errorHandler = vi.fn();
      const messageHandler = vi.fn();
      transport.onError(errorHandler);
      transport.onMessage(messageHandler);
      transport.start();

      // Create valid JSON-RPC request with large params (but with newline terminator)
      // This should process normally since there's a newline before hitting the limit
      const request = createRequest(1, 'test', { data: 'y'.repeat(1000) });
      stdin.push(JSON.stringify(request) + '\n');

      await new Promise((resolve) => setImmediate(resolve));

      // Should not have triggered the oversized line error
      expect(errorHandler).not.toHaveBeenCalled();
      expect(messageHandler).toHaveBeenCalledTimes(1);
      expect(messageHandler).toHaveBeenCalledWith(request);
    });
  });

  describe('stream end handling', () => {
    it('should close transport when stdin ends', async () => {
      const { createTransport, stdin } = createTestOptions();
      const transport = createTransport();

      const closeHandler = vi.fn();
      transport.onClose(closeHandler);
      transport.start();

      stdin.push(null); // Signal end of stream

      await new Promise((resolve) => setImmediate(resolve));

      expect(transport.isClosed()).toBe(true);
      expect(closeHandler).toHaveBeenCalledTimes(1);
    });

    it('should process remaining buffer on stdin end', async () => {
      const { createTransport, stdin } = createTestOptions();
      const transport = createTransport();

      const messageHandler = vi.fn();
      transport.onMessage(messageHandler);
      transport.start();

      // Send a message without trailing newline (partial buffer)
      const request = createRequest(1, 'tools/list');
      stdin.push(JSON.stringify(request));

      await new Promise((resolve) => setImmediate(resolve));
      expect(messageHandler).not.toHaveBeenCalled();

      // Signal end of stream
      stdin.push(null);

      await new Promise((resolve) => setImmediate(resolve));
      expect(messageHandler).toHaveBeenCalledTimes(1);
      expect(messageHandler).toHaveBeenCalledWith(request);
    });
  });

  describe('event handler management', () => {
    it('should allow registering and removing message handlers', async () => {
      const { createTransport, stdin } = createTestOptions();
      const transport = createTransport();

      const handler = vi.fn();
      transport.onMessage(handler);
      transport.start();

      const request = createRequest(1, 'test');
      stdin.push(JSON.stringify(request) + '\n');
      await new Promise((resolve) => setImmediate(resolve));

      expect(handler).toHaveBeenCalledTimes(1);

      transport.offMessage(handler);
      stdin.push(JSON.stringify(createRequest(2, 'test')) + '\n');
      await new Promise((resolve) => setImmediate(resolve));

      // Should still be 1 since handler was removed
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should allow registering and removing error handlers', async () => {
      const { createTransport, stdin } = createTestOptions();
      const transport = createTransport();

      const handler = vi.fn();
      const catchAllHandler = vi.fn(); // Catch-all to prevent unhandled errors
      transport.onError(handler);
      transport.onError(catchAllHandler);
      transport.start();

      stdin.push('invalid\n');
      await new Promise((resolve) => setImmediate(resolve));

      expect(handler).toHaveBeenCalledTimes(1);

      transport.offError(handler);
      stdin.push('also invalid\n');
      await new Promise((resolve) => setImmediate(resolve));

      // handler should still be 1 since it was removed
      expect(handler).toHaveBeenCalledTimes(1);
      // catchAllHandler should have received both errors
      expect(catchAllHandler).toHaveBeenCalledTimes(2);
    });

    it('should allow registering and removing close handlers', async () => {
      const { createTransport } = createTestOptions();
      const transport = createTransport();

      const handler = vi.fn();
      transport.onClose(handler);

      // Remove before close
      transport.offClose(handler);

      await transport.close();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('factory function', () => {
    it('should create transport with createStdioTransport', () => {
      const transport = createStdioTransport();
      expect(transport).toBeInstanceOf(StdioTransport);
    });

    it('should pass options to createStdioTransport', () => {
      const { options } = createTestOptions();
      const transport = createStdioTransport(options);
      expect(transport).toBeInstanceOf(StdioTransport);
    });
  });

  describe('message format compliance', () => {
    it('should use UTF-8 encoding for messages', () => {
      const { options, stdout } = createTestOptions();
      const transport = new StdioTransport(options);

      // Test with unicode characters
      const response = createSuccessResponse(1, { text: 'Hello \u4e16\u754c' });
      transport.send(response);

      const written = stdout.chunks[0];
      expect(written).toContain('\u4e16\u754c');
    });

    it('should use newline as message delimiter', () => {
      const { options, stdout } = createTestOptions();
      const transport = new StdioTransport(options);

      transport.send(createSuccessResponse(1, {}));
      transport.send(createSuccessResponse(2, {}));

      expect(stdout.chunks[0]).toMatch(/\n$/);
      expect(stdout.chunks[1]).toMatch(/\n$/);
    });

    it('should not use length prefix', () => {
      const { options, stdout } = createTestOptions();
      const transport = new StdioTransport(options);

      transport.send(createSuccessResponse(1, {}));

      const written = stdout.chunks[0] ?? '';
      // Should start with { not with any Content-Length or similar header
      expect(written.trim().startsWith('{')).toBe(true);
    });
  });
});

describe('StdioTransport Integration', () => {
  afterEach(async () => {
    // Clean up all transports to remove signal listeners
    for (const transport of activeTransports) {
      if (!transport.isClosed()) {
        await transport.close();
      }
    }
    activeTransports.length = 0;
  });

  it('should handle full request-response cycle', async () => {
    const { createTransport, stdin, stdout } = createTestOptions();
    const transport = createTransport();

    const messages: Array<{ jsonrpc: string; id?: string | number; method?: string }> = [];
    transport.onMessage((msg) => {
      messages.push(msg);

      // Respond to requests
      if ('id' in msg) {
        transport.send(createSuccessResponse(msg.id, { handled: true }));
      }
    });

    transport.start();

    // Send a request
    const request = createRequest(1, 'tools/list');
    stdin.push(JSON.stringify(request) + '\n');

    await new Promise((resolve) => setImmediate(resolve));

    // Verify request was received
    expect(messages.length).toBe(1);
    expect(messages[0]?.method).toBe('tools/list');

    // Verify response was sent
    expect(stdout.chunks.length).toBe(1);
    const response = JSON.parse(stdout.chunks[0] ?? '{}');
    expect(response.jsonrpc).toBe(JSONRPC_VERSION);
    expect(response.id).toBe(1);
    expect(response.result).toEqual({ handled: true });
  });
});
