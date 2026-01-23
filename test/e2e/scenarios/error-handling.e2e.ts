/**
 * E2E Error Handling Tests
 *
 * Tests for JSON-RPC error handling including:
 * - Invalid JSON body (parse error -32700)
 * - Unknown method (method not found -32601)
 * - Request before initialization
 * - Missing jsonrpc field (invalid request -32600)
 * - Missing id for request (invalid request -32600)
 *
 * Uses raw HTTP fetch() to send malformed requests since SDK clients validate.
 *
 * Note: Express's json middleware handles JSON parsing before our handler,
 * returning HTML error pages for invalid JSON. The parseJsonRpc function
 * receives already-parsed objects from Express.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ServerHarness } from '../helpers/server-harness.js';
import { waitForServerReady, getEphemeralPort } from '../helpers/assertions.js';

const PROTOCOL_VERSION = '2025-11-25';

describe('Error Handling E2E Tests', () => {
  let harness: ServerHarness;
  let port: number;
  let baseUrl: string;

  beforeAll(async () => {
    port = getEphemeralPort();
    harness = new ServerHarness({
      port,
      transport: 'http',
    });

    await harness.start();
    await waitForServerReady(port);
    baseUrl = `http://127.0.0.1:${port}/mcp`;
  });

  afterAll(async () => {
    await harness.stop();
  });

  /**
   * Helper to send raw JSON-RPC requests
   */
  async function sendRawRequest(
    body: string,
    headers: Record<string, string> = {}
  ): Promise<Response> {
    return fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'mcp-protocol-version': PROTOCOL_VERSION,
        ...headers,
      },
      body,
    });
  }

  /**
   * Helper to send JSON object as request
   */
  async function sendJsonRequest(
    payload: unknown,
    headers: Record<string, string> = {}
  ): Promise<Response> {
    return sendRawRequest(JSON.stringify(payload), headers);
  }

  describe('Parse Errors (-32700)', () => {
    // Note: Express's json middleware handles JSON parsing before our code.
    // Invalid JSON now returns proper JSON-RPC -32700 error via custom error handler.

    it('should return JSON-RPC parse error (-32700) for invalid JSON body', async () => {
      // Send malformed JSON - Express's json middleware will reject it
      const response = await sendRawRequest('{ invalid json }');

      // Express returns 400 for invalid JSON
      expect(response.status).toBe(400);

      // Verify proper JSON-RPC error response
      const result = await response.json();
      expect(result.jsonrpc).toBe('2.0');
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe(-32700);
      expect(result.error.message).toBe('Parse error');
      expect(result.id).toBeNull();
    });

    it('should return JSON-RPC parse error (-32700) for truncated JSON', async () => {
      const response = await sendRawRequest('{"jsonrpc": "2.0", "method":');

      // Express returns 400 for invalid JSON
      expect(response.status).toBe(400);

      // Verify proper JSON-RPC error response
      const result = await response.json();
      expect(result.jsonrpc).toBe('2.0');
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe(-32700);
      expect(result.error.message).toBe('Parse error');
      expect(result.id).toBeNull();
    });

    it('should return invalid request error for empty body (parsed as null)', async () => {
      // Empty body is parsed by Express as {} or triggers error
      const response = await sendRawRequest('');

      expect(response.status).toBe(400);

      // Try to parse as JSON - server may return JSON error
      const text = await response.text();
      if (text.startsWith('{')) {
        const result = JSON.parse(text);
        expect(result.error).toBeDefined();
        // Empty body becomes {} which fails jsonrpc validation -> -32600
        expect(result.error.code).toBe(-32600);
      }
    });
  });

  describe('Invalid Request Errors (-32600)', () => {
    it('should return invalid request error for missing jsonrpc field', async () => {
      const response = await sendJsonRequest({
        // Missing jsonrpc: '2.0'
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      });

      expect(response.status).toBe(400);

      const result = await response.json();
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe(-32600);
    });

    it('should return invalid request error for wrong jsonrpc version', async () => {
      const response = await sendJsonRequest({
        jsonrpc: '1.0', // Wrong version
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      });

      expect(response.status).toBe(400);

      const result = await response.json();
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe(-32600);
    });

    it('should return 202 for message without id (treated as notification per JSON-RPC spec)', async () => {
      // Per JSON-RPC 2.0 spec: A message without 'id' is a notification
      // Notifications don't receive responses (server returns 202 Accepted)
      const response = await sendJsonRequest({
        jsonrpc: '2.0',
        // No id - this makes it a notification per JSON-RPC spec
        method: 'initialize',
        params: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      });

      // Notification: server returns 202 Accepted (no response body per spec)
      expect(response.status).toBe(202);
    });

    it('should handle null id for request', async () => {
      // JSON-RPC 2.0 spec allows null as a valid id for requests
      // However, implementations may treat it differently
      const response = await sendJsonRequest({
        jsonrpc: '2.0',
        id: null,
        method: 'initialize',
        params: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      });

      // Server should respond (not crash), either with success or error
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.jsonrpc).toBe('2.0');
      // Server processed it as request with null id
      expect(result.id).toBeNull();
      // May have result or error depending on how null id is handled internally
      expect(result.result ?? result.error).toBeDefined();
    });
  });

  describe('Method Not Found Errors (-32601)', () => {
    it('should return method not found error for unknown method after initialization', async () => {
      // Use a fresh server for clean state
      const freshPort = getEphemeralPort();
      const freshHarness = new ServerHarness({
        port: freshPort,
        transport: 'http',
      });

      await freshHarness.start();
      await waitForServerReady(freshPort);

      try {
        const freshUrl = `http://127.0.0.1:${freshPort}/mcp`;

        // First initialize the session
        const initResponse = await fetch(freshUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'mcp-protocol-version': PROTOCOL_VERSION,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: {},
              clientInfo: { name: 'test', version: '1.0.0' },
            },
          }),
        });

        expect(initResponse.status).toBe(200);

        // Get session ID from response headers
        const sessionId = initResponse.headers.get('mcp-session-id');
        expect(sessionId).toBeTruthy();

        // Send initialized notification
        await fetch(freshUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'mcp-protocol-version': PROTOCOL_VERSION,
            'mcp-session-id': sessionId!,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
          }),
        });

        // Now call unknown method with session
        const response = await fetch(freshUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'mcp-protocol-version': PROTOCOL_VERSION,
            'mcp-session-id': sessionId!,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'nonexistent/method',
            params: {},
          }),
        });

        expect(response.status).toBe(200);

        const result = await response.json();
        expect(result.jsonrpc).toBe('2.0');
        expect(result.id).toBe(2);
        expect(result.error).toBeDefined();
        expect(result.error.code).toBe(-32601);
        expect(result.error.message).toMatch(/method.*not.*found|unknown.*method/i);
      } finally {
        await freshHarness.stop();
      }
    });

    it('should return method not found for typo in standard method name', async () => {
      const freshPort = getEphemeralPort();
      const freshHarness = new ServerHarness({
        port: freshPort,
        transport: 'http',
      });

      await freshHarness.start();
      await waitForServerReady(freshPort);

      try {
        const freshUrl = `http://127.0.0.1:${freshPort}/mcp`;

        // Initialize first
        const initResponse = await fetch(freshUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'mcp-protocol-version': PROTOCOL_VERSION,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: {},
              clientInfo: { name: 'test', version: '1.0.0' },
            },
          }),
        });

        expect(initResponse.status).toBe(200);

        const sessionId = initResponse.headers.get('mcp-session-id');
        expect(sessionId).toBeTruthy();

        // Send initialized notification
        await fetch(freshUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'mcp-protocol-version': PROTOCOL_VERSION,
            'mcp-session-id': sessionId!,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
          }),
        });

        // Try typo in method name
        const response = await fetch(freshUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'mcp-protocol-version': PROTOCOL_VERSION,
            'mcp-session-id': sessionId!,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tool/list', // Typo: should be 'tools/list'
            params: {},
          }),
        });

        expect(response.status).toBe(200);

        const result = await response.json();
        expect(result.error).toBeDefined();
        expect(result.error.code).toBe(-32601);
      } finally {
        await freshHarness.stop();
      }
    });
  });

  describe('Request Before Initialization', () => {
    it('should return error for tools/list before initialization (not crash)', async () => {
      // Use a fresh server with no session
      const freshPort = getEphemeralPort();
      const freshHarness = new ServerHarness({
        port: freshPort,
        transport: 'http',
      });

      await freshHarness.start();
      await waitForServerReady(freshPort);

      try {
        const freshUrl = `http://127.0.0.1:${freshPort}/mcp`;

        // Send tools/list without initialization (no session ID)
        const response = await fetch(freshUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'mcp-protocol-version': PROTOCOL_VERSION,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/list',
            params: {},
          }),
        });

        // Server should respond with error (400 for missing session header), not crash
        expect(response.status).toBe(400);

        const result = await response.json();
        // Server returns { error: "Missing required header: mcp-session-id" }
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
        expect(result.error).toContain('mcp-session-id');

        // Verify server is still running (didn't crash)
        const healthCheck = await fetch(`http://127.0.0.1:${freshPort}/mcp`, {
          method: 'OPTIONS',
        });
        expect(healthCheck.status).toBe(204);
      } finally {
        await freshHarness.stop();
      }
    });

    it('should return error for tools/call before initialization (not crash)', async () => {
      const freshPort = getEphemeralPort();
      const freshHarness = new ServerHarness({
        port: freshPort,
        transport: 'http',
      });

      await freshHarness.start();
      await waitForServerReady(freshPort);

      try {
        const freshUrl = `http://127.0.0.1:${freshPort}/mcp`;

        // Send tools/call without initialization
        const response = await fetch(freshUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'mcp-protocol-version': PROTOCOL_VERSION,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'echo',
              arguments: { message: 'test' },
            },
          }),
        });

        // Server should respond with error for missing session, not crash
        expect(response.status).toBe(400);

        const result = await response.json();
        expect(result.error).toBeDefined();
        expect(result.error).toContain('mcp-session-id');

        // Verify server is still running
        const healthCheck = await fetch(`http://127.0.0.1:${freshPort}/mcp`, {
          method: 'OPTIONS',
        });
        expect(healthCheck.status).toBe(204);
      } finally {
        await freshHarness.stop();
      }
    });

    it('should return 404 for invalid session ID', async () => {
      const freshPort = getEphemeralPort();
      const freshHarness = new ServerHarness({
        port: freshPort,
        transport: 'http',
      });

      await freshHarness.start();
      await waitForServerReady(freshPort);

      try {
        const freshUrl = `http://127.0.0.1:${freshPort}/mcp`;

        // Send request with fake session ID
        const response = await fetch(freshUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'mcp-protocol-version': PROTOCOL_VERSION,
            'mcp-session-id': 'fake-session-id-12345',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/list',
            params: {},
          }),
        });

        // Server should return 404 for unknown session
        expect(response.status).toBe(404);

        const result = await response.json();
        expect(result.error).toBeDefined();
        expect(result.error).toContain('Session not found');
      } finally {
        await freshHarness.stop();
      }
    });
  });

  describe('Additional Error Cases', () => {
    it('should handle request with array body (batch not supported)', async () => {
      // JSON-RPC 2.0 supports batch requests, but MCP may not
      const response = await sendJsonRequest([
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
        },
      ]);

      // Server should return error for array body (batch not supported)
      expect(response.status).toBe(400);

      const result = await response.json();
      expect(result.error).toBeDefined();
      // Array is rejected with INVALID_REQUEST
      expect(result.error.code).toBe(-32600);
    });

    it('should handle deeply nested params without stack overflow', async () => {
      // Create deeply nested object
      let deepObject: Record<string, unknown> = { value: 'deep' };
      for (let i = 0; i < 50; i++) {
        deepObject = { nested: deepObject };
      }

      const response = await sendJsonRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
          extra: deepObject,
        },
      });

      // Should handle without crashing - may succeed or return validation error
      expect(response.status).toBeGreaterThan(0);
      expect(response.status).toBeLessThan(600);
    });

    it('should handle very long method name gracefully', async () => {
      const freshPort = getEphemeralPort();
      const freshHarness = new ServerHarness({
        port: freshPort,
        transport: 'http',
      });

      await freshHarness.start();
      await waitForServerReady(freshPort);

      try {
        const freshUrl = `http://127.0.0.1:${freshPort}/mcp`;

        // Initialize first
        const initResponse = await fetch(freshUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'mcp-protocol-version': PROTOCOL_VERSION,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: {},
              clientInfo: { name: 'test', version: '1.0.0' },
            },
          }),
        });

        const sessionId = initResponse.headers.get('mcp-session-id');

        // Try very long method name
        const longMethodName = 'a'.repeat(1000);

        const response = await fetch(freshUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'mcp-protocol-version': PROTOCOL_VERSION,
            'mcp-session-id': sessionId!,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: longMethodName,
            params: {},
          }),
        });

        // Should return error or handle gracefully, not crash
        // May return -32601 (method not found) or -32600 (invalid request)
        expect(response.status).toBe(200);

        const result = await response.json();
        expect(result.error).toBeDefined();
        // Accept either method not found or invalid request
        expect([-32601, -32600]).toContain(result.error.code);
      } finally {
        await freshHarness.stop();
      }
    });
  });
});
