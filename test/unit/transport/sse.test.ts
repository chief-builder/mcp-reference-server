import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import {
  SSEStream,
  SSEManager,
  SSEEvent,
} from '../../../src/transport/sse.js';
import {
  createNotification,
  createRequest,
  JsonRpcMessage,
} from '../../../src/protocol/jsonrpc.js';

// =============================================================================
// Mock Response
// =============================================================================

class MockResponse extends EventEmitter {
  private headers: Map<string, string> = new Map();
  public writtenData: string[] = [];
  public headersWritten: boolean = false;
  public ended: boolean = false;

  setHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }

  getHeader(name: string): string | undefined {
    return this.headers.get(name);
  }

  flushHeaders(): void {
    this.headersWritten = true;
  }

  write(data: string): boolean {
    this.writtenData.push(data);
    return true;
  }

  end(): void {
    this.ended = true;
    this.emit('close');
  }

  simulateClose(): void {
    this.emit('close');
  }
}

function createMockResponse(): MockResponse & Response {
  return new MockResponse() as MockResponse & Response;
}

// =============================================================================
// SSEStream Tests
// =============================================================================

describe('SSEStream', () => {
  let mockRes: MockResponse & Response;

  beforeEach(() => {
    mockRes = createMockResponse();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should set SSE headers', () => {
      const stream = new SSEStream(mockRes, 'session-123', { keepAliveInterval: 0 });

      expect(mockRes.getHeader('Content-Type')).toBe('text/event-stream');
      expect(mockRes.getHeader('Cache-Control')).toBe('no-cache');
      expect(mockRes.getHeader('Connection')).toBe('keep-alive');
      expect(mockRes.getHeader('X-Accel-Buffering')).toBe('no');
      expect(mockRes.headersWritten).toBe(true);

      stream.close();
    });

    it('should start keep-alive timer when configured', () => {
      const stream = new SSEStream(mockRes, 'session-123', { keepAliveInterval: 1000 });

      expect(mockRes.writtenData.length).toBe(0);

      vi.advanceTimersByTime(1000);
      expect(mockRes.writtenData.length).toBe(1);
      expect(mockRes.writtenData[0]).toBe(': keep-alive\n\n');

      vi.advanceTimersByTime(1000);
      expect(mockRes.writtenData.length).toBe(2);

      stream.close();
    });

    it('should not start keep-alive when interval is 0', () => {
      const stream = new SSEStream(mockRes, 'session-123', { keepAliveInterval: 0 });

      vi.advanceTimersByTime(60000);
      expect(mockRes.writtenData.length).toBe(0);

      stream.close();
    });
  });

  describe('isActive', () => {
    it('should return true when stream is active', () => {
      const stream = new SSEStream(mockRes, 'session-123', { keepAliveInterval: 0 });
      expect(stream.isActive).toBe(true);
      stream.close();
    });

    it('should return false after close', () => {
      const stream = new SSEStream(mockRes, 'session-123', { keepAliveInterval: 0 });
      stream.close();
      expect(stream.isActive).toBe(false);
    });

    it('should return false after client disconnect', () => {
      const stream = new SSEStream(mockRes, 'session-123', { keepAliveInterval: 0 });
      mockRes.simulateClose();
      expect(stream.isActive).toBe(false);
    });
  });

  describe('send', () => {
    it('should send JSON-RPC message as SSE event', () => {
      const stream = new SSEStream(mockRes, 'session-123', { keepAliveInterval: 0 });
      const message = createNotification('test/event', { data: 'value' });

      stream.send(message);

      expect(mockRes.writtenData.length).toBe(1);
      const output = mockRes.writtenData[0];
      expect(output).toContain('id: session-123:1\n');
      expect(output).toContain('data: ');
      expect(output).toContain(JSON.stringify(message));
      expect(output.endsWith('\n\n')).toBe(true);

      stream.close();
    });

    it('should increment sequence number', () => {
      const stream = new SSEStream(mockRes, 'session-123', { keepAliveInterval: 0 });

      stream.send(createNotification('event1'));
      stream.send(createNotification('event2'));
      stream.send(createNotification('event3'));

      expect(mockRes.writtenData[0]).toContain('id: session-123:1\n');
      expect(mockRes.writtenData[1]).toContain('id: session-123:2\n');
      expect(mockRes.writtenData[2]).toContain('id: session-123:3\n');

      stream.close();
    });

    it('should not send when stream is closed', () => {
      const stream = new SSEStream(mockRes, 'session-123', { keepAliveInterval: 0 });
      stream.close();

      stream.send(createNotification('test'));
      // Only the 'end' would have been called, no write
      expect(mockRes.writtenData.length).toBe(0);
    });

    it('should add events to buffer', () => {
      const stream = new SSEStream(mockRes, 'session-123', { keepAliveInterval: 0, bufferSize: 10 });

      stream.send(createNotification('event1'));
      stream.send(createNotification('event2'));

      const buffer = stream.getBuffer();
      expect(buffer.length).toBe(2);
      expect(buffer[0].id).toBe('session-123:1');
      expect(buffer[1].id).toBe('session-123:2');

      stream.close();
    });

    it('should limit buffer size', () => {
      const stream = new SSEStream(mockRes, 'session-123', { keepAliveInterval: 0, bufferSize: 3 });

      for (let i = 0; i < 5; i++) {
        stream.send(createNotification(`event${i}`));
      }

      const buffer = stream.getBuffer();
      expect(buffer.length).toBe(3);
      expect(buffer[0].id).toBe('session-123:3');
      expect(buffer[1].id).toBe('session-123:4');
      expect(buffer[2].id).toBe('session-123:5');

      stream.close();
    });
  });

  describe('sendWithType', () => {
    it('should include event type in SSE output', () => {
      const stream = new SSEStream(mockRes, 'session-123', { keepAliveInterval: 0 });
      const message = createNotification('test/event');

      stream.sendWithType(message, 'custom-event');

      const output = mockRes.writtenData[0];
      expect(output).toContain('event: custom-event\n');
      expect(output).toContain('id: session-123:1\n');

      stream.close();
    });
  });

  describe('sendComment', () => {
    it('should send SSE comment', () => {
      const stream = new SSEStream(mockRes, 'session-123', { keepAliveInterval: 0 });

      stream.sendComment('ping');

      expect(mockRes.writtenData.length).toBe(1);
      expect(mockRes.writtenData[0]).toBe(': ping\n\n');

      stream.close();
    });
  });

  describe('replayEvent', () => {
    it('should write event with original ID', () => {
      const stream = new SSEStream(mockRes, 'session-123', { keepAliveInterval: 0 });
      const event: SSEEvent = {
        id: 'session-123:5',
        data: JSON.stringify(createNotification('replayed')),
      };

      stream.replayEvent(event);

      const output = mockRes.writtenData[0];
      expect(output).toContain('id: session-123:5\n');

      stream.close();
    });

    it('should update sequence number to match replayed event', () => {
      const stream = new SSEStream(mockRes, 'session-123', { keepAliveInterval: 0 });

      // Replay event with sequence 10
      stream.replayEvent({
        id: 'session-123:10',
        data: JSON.stringify(createNotification('replayed')),
      });

      // Next send should be sequence 11
      stream.send(createNotification('next'));

      expect(mockRes.writtenData[1]).toContain('id: session-123:11\n');

      stream.close();
    });
  });

  describe('close', () => {
    it('should end the response', () => {
      const stream = new SSEStream(mockRes, 'session-123', { keepAliveInterval: 0 });
      stream.close();

      expect(mockRes.ended).toBe(true);
    });

    it('should stop keep-alive timer', () => {
      const stream = new SSEStream(mockRes, 'session-123', { keepAliveInterval: 1000 });

      stream.close();

      vi.advanceTimersByTime(5000);
      expect(mockRes.writtenData.length).toBe(0);
    });

    it('should be idempotent', () => {
      const stream = new SSEStream(mockRes, 'session-123', { keepAliveInterval: 0 });

      stream.close();
      stream.close();
      stream.close();

      // Should not throw
      expect(mockRes.ended).toBe(true);
    });
  });

  describe('getSessionId', () => {
    it('should return the session ID', () => {
      const stream = new SSEStream(mockRes, 'my-session-id', { keepAliveInterval: 0 });
      expect(stream.getSessionId()).toBe('my-session-id');
      stream.close();
    });
  });

  describe('currentSequence', () => {
    it('should return 0 initially', () => {
      const stream = new SSEStream(mockRes, 'session-123', { keepAliveInterval: 0 });
      expect(stream.currentSequence).toBe(0);
      stream.close();
    });

    it('should increment after sending', () => {
      const stream = new SSEStream(mockRes, 'session-123', { keepAliveInterval: 0 });

      stream.send(createNotification('event1'));
      expect(stream.currentSequence).toBe(1);

      stream.send(createNotification('event2'));
      expect(stream.currentSequence).toBe(2);

      stream.close();
    });
  });
});

// =============================================================================
// SSEManager Tests
// =============================================================================

describe('SSEManager', () => {
  let manager: SSEManager;

  beforeEach(() => {
    manager = new SSEManager({ bufferSize: 100, keepAliveInterval: 0 });
  });

  afterEach(() => {
    manager.closeAll();
  });

  describe('createStream', () => {
    it('should create a new stream for session', () => {
      const mockRes = createMockResponse();
      const stream = manager.createStream('session-1', mockRes);

      expect(stream).toBeInstanceOf(SSEStream);
      expect(stream.isActive).toBe(true);
      expect(manager.size).toBe(1);
    });

    it('should close existing stream when creating new one for same session', () => {
      const mockRes1 = createMockResponse();
      const mockRes2 = createMockResponse();

      const stream1 = manager.createStream('session-1', mockRes1);
      const stream2 = manager.createStream('session-1', mockRes2);

      expect(stream1.isActive).toBe(false);
      expect(stream2.isActive).toBe(true);
      expect(manager.size).toBe(1);
    });
  });

  describe('getStream', () => {
    it('should return existing stream', () => {
      const mockRes = createMockResponse();
      const created = manager.createStream('session-1', mockRes);

      const retrieved = manager.getStream('session-1');
      expect(retrieved).toBe(created);
    });

    it('should return undefined for unknown session', () => {
      const stream = manager.getStream('unknown');
      expect(stream).toBeUndefined();
    });
  });

  describe('sendEvent', () => {
    it('should send event to existing stream', () => {
      const mockRes = createMockResponse();
      manager.createStream('session-1', mockRes);

      const message = createNotification('test/event');
      const result = manager.sendEvent('session-1', message);

      expect(result).toBe(true);
      expect(mockRes.writtenData.length).toBe(1);
    });

    it('should return false for unknown session', () => {
      const message = createNotification('test/event');
      const result = manager.sendEvent('unknown', message);

      expect(result).toBe(false);
    });

    it('should return false for closed stream', () => {
      const mockRes = createMockResponse();
      const stream = manager.createStream('session-1', mockRes);
      stream.close();

      const message = createNotification('test/event');
      const result = manager.sendEvent('session-1', message);

      expect(result).toBe(false);
    });
  });

  describe('sendEventWithType', () => {
    it('should send typed event to existing stream', () => {
      const mockRes = createMockResponse();
      manager.createStream('session-1', mockRes);

      const message = createNotification('test/event');
      const result = manager.sendEventWithType('session-1', message, 'custom-type');

      expect(result).toBe(true);
      expect(mockRes.writtenData[0]).toContain('event: custom-type\n');
    });
  });

  describe('handleReconnect', () => {
    it('should create new stream on reconnect', () => {
      const mockRes1 = createMockResponse();
      const mockRes2 = createMockResponse();

      // Create initial stream and send events
      manager.createStream('session-1', mockRes1);
      manager.sendEvent('session-1', createNotification('event1'));
      manager.sendEvent('session-1', createNotification('event2'));
      manager.sendEvent('session-1', createNotification('event3'));

      // Simulate reconnect with last event ID
      const stream = manager.handleReconnect('session-1', 'session-1:1', mockRes2);

      expect(stream.isActive).toBe(true);
    });

    it('should replay events after last received sequence', () => {
      const mockRes1 = createMockResponse();
      const mockRes2 = createMockResponse();

      // Create initial stream and send events
      manager.createStream('session-1', mockRes1);
      manager.sendEvent('session-1', createNotification('event1'));
      manager.sendEvent('session-1', createNotification('event2'));
      manager.sendEvent('session-1', createNotification('event3'));

      // Simulate reconnect - client received up to sequence 1
      manager.handleReconnect('session-1', 'session-1:1', mockRes2);

      // Should have replayed events 2 and 3
      expect(mockRes2.writtenData.length).toBe(2);
      expect(mockRes2.writtenData[0]).toContain('id: session-1:2\n');
      expect(mockRes2.writtenData[1]).toContain('id: session-1:3\n');
    });

    it('should handle invalid last event ID gracefully', () => {
      const mockRes = createMockResponse();

      // Reconnect with invalid ID format
      const stream = manager.handleReconnect('session-1', 'invalid-id', mockRes);

      expect(stream.isActive).toBe(true);
      expect(mockRes.writtenData.length).toBe(0); // No replays
    });
  });

  describe('closeStream', () => {
    it('should close and remove stream', () => {
      const mockRes = createMockResponse();
      const stream = manager.createStream('session-1', mockRes);

      manager.closeStream('session-1');

      expect(stream.isActive).toBe(false);
      expect(manager.size).toBe(0);
    });

    it('should handle closing non-existent stream', () => {
      // Should not throw
      manager.closeStream('unknown');
      expect(manager.size).toBe(0);
    });
  });

  describe('closeAll', () => {
    it('should close all streams', () => {
      const mockRes1 = createMockResponse();
      const mockRes2 = createMockResponse();
      const mockRes3 = createMockResponse();

      const stream1 = manager.createStream('session-1', mockRes1);
      const stream2 = manager.createStream('session-2', mockRes2);
      const stream3 = manager.createStream('session-3', mockRes3);

      manager.closeAll();

      expect(stream1.isActive).toBe(false);
      expect(stream2.isActive).toBe(false);
      expect(stream3.isActive).toBe(false);
      expect(manager.size).toBe(0);
    });
  });

  describe('hasStream', () => {
    it('should return true for active stream', () => {
      const mockRes = createMockResponse();
      manager.createStream('session-1', mockRes);

      expect(manager.hasStream('session-1')).toBe(true);
    });

    it('should return false for unknown session', () => {
      expect(manager.hasStream('unknown')).toBe(false);
    });

    it('should return false for closed stream', () => {
      const mockRes = createMockResponse();
      const stream = manager.createStream('session-1', mockRes);
      stream.close();

      expect(manager.hasStream('session-1')).toBe(false);
    });
  });

  describe('size', () => {
    it('should track number of streams', () => {
      expect(manager.size).toBe(0);

      manager.createStream('session-1', createMockResponse());
      expect(manager.size).toBe(1);

      manager.createStream('session-2', createMockResponse());
      expect(manager.size).toBe(2);

      manager.closeStream('session-1');
      expect(manager.size).toBe(1);
    });
  });

  describe('cleanup on client disconnect', () => {
    it('should remove stream when client disconnects', () => {
      const mockRes = createMockResponse();
      manager.createStream('session-1', mockRes);

      expect(manager.size).toBe(1);

      // Simulate client disconnect
      mockRes.simulateClose();

      expect(manager.size).toBe(0);
    });
  });
});

// =============================================================================
// SSE Event ID Format Tests
// =============================================================================

describe('SSE Event ID Format (SEP-1699)', () => {
  it('should use session:sequence format', () => {
    const mockRes = createMockResponse() as MockResponse & Response;
    const stream = new SSEStream(mockRes, 'abc-123-def', { keepAliveInterval: 0 });

    stream.send(createNotification('test'));

    const output = mockRes.writtenData[0];
    expect(output).toMatch(/id: abc-123-def:1\n/);

    stream.close();
  });

  it('should handle session IDs with colons', () => {
    const mockRes = createMockResponse() as MockResponse & Response;
    const manager = new SSEManager({ keepAliveInterval: 0 });

    // Session ID that contains colons
    const sessionId = 'session:with:colons';
    manager.createStream(sessionId, mockRes);
    manager.sendEvent(sessionId, createNotification('event1'));
    manager.sendEvent(sessionId, createNotification('event2'));

    // Reconnect using last event ID
    const mockRes2 = createMockResponse() as MockResponse & Response;
    manager.handleReconnect(sessionId, `${sessionId}:1`, mockRes2);

    // Should replay event 2
    expect(mockRes2.writtenData.length).toBe(1);
    expect(mockRes2.writtenData[0]).toContain(`id: ${sessionId}:2\n`);

    manager.closeAll();
  });
});
