/**
 * Test helpers module unit tests
 *
 * Verifies that all helper exports work correctly.
 */

import { describe, it, expect } from 'vitest';
import {
  createTestServer,
  sendRequest,
  waitForCondition,
  createDeferred,
  mockFetch,
  NetworkErrors,
  delay,
  parseSSEEvents,
  getTestPort,
  resetPortOffset,
  peekNextPort,
  getPortInfo,
} from './index.js';

describe('Test Helpers Module', () => {
  describe('exports', () => {
    it('should export createTestServer', () => {
      expect(typeof createTestServer).toBe('function');
    });

    it('should export sendRequest', () => {
      expect(typeof sendRequest).toBe('function');
    });

    it('should export waitForCondition', () => {
      expect(typeof waitForCondition).toBe('function');
    });

    it('should export createDeferred', () => {
      expect(typeof createDeferred).toBe('function');
    });

    it('should export mockFetch', () => {
      expect(typeof mockFetch).toBe('function');
    });

    it('should export NetworkErrors with all error types', () => {
      expect(NetworkErrors).toBeDefined();
      expect(typeof NetworkErrors.timeout).toBe('function');
      expect(typeof NetworkErrors.connectionRefused).toBe('function');
      expect(typeof NetworkErrors.dnsResolutionFailed).toBe('function');
      expect(typeof NetworkErrors.connectionReset).toBe('function');
      expect(typeof NetworkErrors.networkError).toBe('function');
      expect(typeof NetworkErrors.sslError).toBe('function');
    });

    it('should export delay', () => {
      expect(typeof delay).toBe('function');
    });

    it('should export parseSSEEvents', () => {
      expect(typeof parseSSEEvents).toBe('function');
    });

    it('should re-export port helpers', () => {
      expect(typeof getTestPort).toBe('function');
      expect(typeof resetPortOffset).toBe('function');
      expect(typeof peekNextPort).toBe('function');
      expect(typeof getPortInfo).toBe('function');
    });
  });

  describe('NetworkErrors', () => {
    it('should create timeout error with AbortError name', () => {
      const error = NetworkErrors.timeout();
      expect(error.name).toBe('AbortError');
      expect(error.message).toContain('aborted');
    });

    it('should create timeout error with custom message', () => {
      const error = NetworkErrors.timeout('Custom timeout');
      expect(error.message).toBe('Custom timeout');
    });

    it('should create connection refused error', () => {
      const error = NetworkErrors.connectionRefused();
      expect(error).toBeInstanceOf(TypeError);
      expect(error.message).toContain('Connection refused');
    });

    it('should create DNS resolution error with hostname', () => {
      const error = NetworkErrors.dnsResolutionFailed('test.example.com');
      expect(error).toBeInstanceOf(TypeError);
      expect(error.message).toContain('test.example.com');
      expect(error.message).toContain('ENOTFOUND');
    });

    it('should create connection reset error', () => {
      const error = NetworkErrors.connectionReset();
      expect(error.name).toBe('ConnectionResetError');
      expect(error.message).toContain('Connection reset');
    });

    it('should create generic network error', () => {
      const error = NetworkErrors.networkError();
      expect(error).toBeInstanceOf(TypeError);
    });

    it('should create SSL error', () => {
      const error = NetworkErrors.sslError();
      expect(error.name).toBe('SSLError');
      expect(error.message).toContain('SSL');
    });
  });

  describe('parseSSEEvents', () => {
    it('should parse SSE events correctly', () => {
      const text = 'id: 1\nevent: message\ndata: hello\n\nid: 2\ndata: world\n\n';
      const events = parseSSEEvents(text);
      expect(events).toHaveLength(2);
      expect(events[0].id).toBe('1');
      expect(events[0].event).toBe('message');
      expect(events[0].data).toBe('hello');
      expect(events[1].id).toBe('2');
      expect(events[1].data).toBe('world');
    });

    it('should handle empty text', () => {
      const events = parseSSEEvents('');
      expect(events).toHaveLength(0);
    });

    it('should handle events without all fields', () => {
      const text = 'data: only-data\n\n';
      const events = parseSSEEvents(text);
      expect(events).toHaveLength(1);
      expect(events[0].data).toBe('only-data');
      expect(events[0].id).toBeUndefined();
      expect(events[0].event).toBeUndefined();
    });
  });

  describe('createDeferred', () => {
    it('should create resolvable promise', async () => {
      const { promise, resolve } = createDeferred<string>();
      resolve('test-value');
      const result = await promise;
      expect(result).toBe('test-value');
    });

    it('should create rejectable promise', async () => {
      const { promise, reject } = createDeferred<string>();
      reject(new Error('test-error'));
      await expect(promise).rejects.toThrow('test-error');
    });
  });

  describe('waitForCondition', () => {
    it('should resolve immediately when condition is true', async () => {
      await waitForCondition(() => true);
      // No error means it resolved
    });

    it('should resolve when condition becomes true', async () => {
      let count = 0;
      await waitForCondition(() => {
        count++;
        return count >= 3;
      });
      expect(count).toBeGreaterThanOrEqual(3);
    });

    it('should throw on timeout', async () => {
      await expect(
        waitForCondition(() => false, { timeout: 50, message: 'Test timeout' })
      ).rejects.toThrow('Test timeout');
    });

    it('should use default timeout message', async () => {
      await expect(
        waitForCondition(() => false, { timeout: 50 })
      ).rejects.toThrow('Condition not met within timeout');
    });

    it('should support async conditions', async () => {
      let count = 0;
      await waitForCondition(async () => {
        count++;
        return count >= 2;
      });
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('delay', () => {
    it('should delay execution', async () => {
      const start = Date.now();
      await delay(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45);
    });
  });

  describe('mockFetch', () => {
    it('should create a mock fetch function', () => {
      const mock = mockFetch();
      expect(typeof mock.fetch).toBe('function');
      mock.restore();
    });

    it('should record calls', async () => {
      const mock = mockFetch();
      mock.setDefaultResponse({ ok: true, body: {} });

      await mock.fetch('https://example.com/test');

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].url).toBe('https://example.com/test');
      mock.restore();
    });

    it('should return configured responses', async () => {
      const mock = mockFetch({
        'https://api.test.com/data': {
          ok: true,
          status: 200,
          body: { result: 'success' },
        },
      });

      const response = await mock.fetch('https://api.test.com/data');
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.result).toBe('success');

      mock.restore();
    });

    it('should match URL patterns', async () => {
      const mock = mockFetch();
      mock.addResponse('/token', {
        ok: true,
        body: { access_token: 'test' },
      });

      const response = await mock.fetch('https://auth.example.com/oauth/token');
      expect(response.ok).toBe(true);

      const body = await response.json();
      expect(body.access_token).toBe('test');

      mock.restore();
    });

    it('should throw configured errors', async () => {
      const mock = mockFetch();
      const networkError = new TypeError('Network error');
      mock.addResponse('/failing', { error: networkError });

      await expect(mock.fetch('https://example.com/failing')).rejects.toThrow('Network error');

      mock.restore();
    });

    it('should delay responses', async () => {
      const mock = mockFetch();
      mock.addResponse('/slow', { delay: 50, ok: true, body: {} });

      const start = Date.now();
      await mock.fetch('https://example.com/slow');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(45);

      mock.restore();
    });

    it('should use default response for unmatched URLs', async () => {
      const mock = mockFetch();
      mock.setDefaultResponse({ status: 404, body: { error: 'not found' } });

      const response = await mock.fetch('https://unknown.com/path');
      expect(response.status).toBe(404);

      mock.restore();
    });

    it('should reset state', async () => {
      const mock = mockFetch();
      mock.addResponse('/test', { ok: true, body: {} });
      await mock.fetch('https://example.com/test');

      expect(mock.calls).toHaveLength(1);

      mock.reset();

      expect(mock.calls).toHaveLength(0);

      mock.restore();
    });
  });

  describe('port helpers', () => {
    it('should return incrementing ports', () => {
      const port1 = getTestPort();
      const port2 = getTestPort();
      expect(port2).toBe(port1 + 1);
    });

    it('should provide port info', () => {
      const info = getPortInfo();
      expect(info).toHaveProperty('basePort');
      expect(info).toHaveProperty('offset');
      expect(info).toHaveProperty('nextPort');
    });

    it('should peek at next port without incrementing', () => {
      const peeked = peekNextPort();
      const actual = getTestPort();
      expect(peeked).toBe(actual);
    });
  });
});
