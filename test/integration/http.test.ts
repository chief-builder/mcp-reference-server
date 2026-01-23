/**
 * HTTP Transport Integration Tests
 *
 * Tests the full HTTP transport flow including:
 * - Request/response cycles
 * - Session creation and reuse
 * - Multiple requests with same session
 * - Content-Type and header validation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HttpTransport } from '../../src/transport/http.js';
import {
  createRequest,
  createNotification,
  createSuccessResponse,
  JSONRPC_VERSION,
} from '../../src/protocol/jsonrpc.js';
import { PROTOCOL_VERSION } from '../../src/protocol/lifecycle.js';
import { getTestPort } from '../helpers/ports.js';

// =============================================================================
// Test Helpers
// =============================================================================

interface TestServer {
  transport: HttpTransport;
  port: number;
  baseUrl: string;
}

async function createTestServer(options?: {
  allowedOrigins?: string[];
  statelessMode?: boolean;
}): Promise<TestServer> {
  const port = getTestPort();
  const transport = new HttpTransport({
    port,
    allowedOrigins: options?.allowedOrigins ?? ['*'],
    statelessMode: options?.statelessMode ?? false,
    sseKeepAliveInterval: 0,
  });
  await transport.start();
  return {
    transport,
    port,
    baseUrl: `http://127.0.0.1:${port}`,
  };
}

async function sendRequest(
  server: TestServer,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': PROTOCOL_VERSION,
    ...headers,
  };

  return fetch(`${server.baseUrl}/mcp`, {
    method: 'POST',
    headers: defaultHeaders,
    body: JSON.stringify(body),
  });
}

// =============================================================================
// Integration Tests
// =============================================================================

describe('HTTP Transport Integration', () => {
  let server: TestServer;

  afterEach(async () => {
    if (server) {
      await server.transport.close().catch(() => {});
    }
  });

  describe('Full Request/Response Cycle', () => {
    it('should complete initialize -> tools/list -> tools/call flow', async () => {
      server = await createTestServer();
      let requestCount = 0;

      server.transport.setMessageHandler(async (msg, session) => {
        requestCount++;
        const method = msg.method;
        const id = 'id' in msg ? msg.id : null;

        if (method === 'initialize') {
          return createSuccessResponse(id, {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: true } },
            serverInfo: { name: 'integration-test', version: '1.0.0' },
          });
        }

        if (method === 'tools/list') {
          return createSuccessResponse(id, {
            tools: [
              {
                name: 'test_tool',
                description: 'A test tool',
                inputSchema: { type: 'object', properties: {} },
              },
            ],
          });
        }

        if (method === 'tools/call') {
          const params = msg.params as { name: string };
          return createSuccessResponse(id, {
            content: [{ type: 'text', text: `Called ${params.name}` }],
          });
        }

        return null;
      });

      // Step 1: Initialize
      const initResponse = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        })
      );

      expect(initResponse.status).toBe(200);
      const initBody = await initResponse.json();
      expect(initBody.result.protocolVersion).toBe(PROTOCOL_VERSION);
      expect(initBody.result.serverInfo.name).toBe('integration-test');

      const sessionId = initResponse.headers.get('mcp-session-id');
      expect(sessionId).toBeTruthy();

      // Step 2: Send initialized notification
      const initializedResponse = await sendRequest(
        server,
        createNotification('notifications/initialized'),
        { 'MCP-Session-Id': sessionId! }
      );
      expect(initializedResponse.status).toBe(202);

      // Step 3: List tools
      const listResponse = await sendRequest(
        server,
        createRequest(2, 'tools/list'),
        { 'MCP-Session-Id': sessionId! }
      );

      expect(listResponse.status).toBe(200);
      const listBody = await listResponse.json();
      expect(listBody.result.tools).toHaveLength(1);
      expect(listBody.result.tools[0].name).toBe('test_tool');

      // Step 4: Call tool
      const callResponse = await sendRequest(
        server,
        createRequest(3, 'tools/call', { name: 'test_tool', arguments: {} }),
        { 'MCP-Session-Id': sessionId! }
      );

      expect(callResponse.status).toBe(200);
      const callBody = await callResponse.json();
      expect(callBody.result.content[0].text).toBe('Called test_tool');

      expect(requestCount).toBe(4);
    });

    it('should handle multiple concurrent requests on same session', async () => {
      server = await createTestServer();
      let requestCount = 0;

      server.transport.setMessageHandler(async (msg) => {
        requestCount++;
        const id = 'id' in msg ? msg.id : null;

        // Simulate some processing time
        await new Promise((resolve) => setTimeout(resolve, 10));

        return createSuccessResponse(id, { requestNumber: requestCount });
      });

      const session = server.transport.getSessionManager().createSession();

      // Send multiple requests concurrently
      const responses = await Promise.all([
        sendRequest(server, createRequest(1, 'test/method'), { 'MCP-Session-Id': session.id }),
        sendRequest(server, createRequest(2, 'test/method'), { 'MCP-Session-Id': session.id }),
        sendRequest(server, createRequest(3, 'test/method'), { 'MCP-Session-Id': session.id }),
      ]);

      // All should succeed
      for (const response of responses) {
        expect(response.status).toBe(200);
      }

      // All requests should have been processed
      expect(requestCount).toBe(3);
    });
  });

  describe('Session Lifecycle', () => {
    it('should maintain session state across multiple requests', async () => {
      server = await createTestServer();
      const sessionData: Map<string, number> = new Map();

      server.transport.setMessageHandler(async (msg, session) => {
        const id = 'id' in msg ? msg.id : null;
        const count = (sessionData.get(session.id) ?? 0) + 1;
        sessionData.set(session.id, count);

        return createSuccessResponse(id, { sessionId: session.id, requestCount: count });
      });

      // Create session via initialize
      const initResponse = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        })
      );

      const sessionId = initResponse.headers.get('mcp-session-id')!;

      // Send multiple requests
      for (let i = 2; i <= 5; i++) {
        const response = await sendRequest(
          server,
          createRequest(i, 'test/method'),
          { 'MCP-Session-Id': sessionId }
        );
        const body = await response.json();
        expect(body.result.sessionId).toBe(sessionId);
        expect(body.result.requestCount).toBe(i);
      }
    });

    it('should reject expired sessions', async () => {
      const port = getTestPort();
      const transport = new HttpTransport({
        port,
        allowedOrigins: ['*'],
        sessionTtlMs: 50, // Very short TTL for testing
      });

      await transport.start();
      server = { transport, port, baseUrl: `http://127.0.0.1:${port}` };

      transport.setMessageHandler(async (msg) => {
        const id = 'id' in msg ? msg.id : null;
        return createSuccessResponse(id, { ok: true });
      });

      const session = transport.getSessionManager().createSession();

      // Request should work initially
      const response1 = await sendRequest(
        server,
        createRequest(1, 'test'),
        { 'MCP-Session-Id': session.id }
      );
      expect(response1.status).toBe(200);

      // Wait for session to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Force cleanup
      transport.getSessionManager().cleanup();

      // Request should now fail with 404
      const response2 = await sendRequest(
        server,
        createRequest(2, 'test'),
        { 'MCP-Session-Id': session.id }
      );
      expect(response2.status).toBe(404);
    });
  });

  describe('Header Validation', () => {
    it('should validate Content-Type header', async () => {
      server = await createTestServer();
      server.transport.setMessageHandler(async () => null);

      // Wrong content type
      const response = await fetch(`${server.baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'MCP-Protocol-Version': PROTOCOL_VERSION,
        },
        body: JSON.stringify(createRequest(1, 'test')),
      });

      expect(response.status).toBe(415);
    });

    it('should validate MCP-Protocol-Version header', async () => {
      server = await createTestServer();
      server.transport.setMessageHandler(async (msg) => {
        const id = 'id' in msg ? msg.id : null;
        return createSuccessResponse(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          serverInfo: { name: 'test', version: '1.0.0' },
        });
      });

      // Missing version header - should default to legacy version 2025-03-26 per MCP spec
      // This allows backwards compatibility with older SDK clients
      const response1 = await fetch(`${server.baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        })),
      });
      expect(response1.status).toBe(200); // Should succeed with default legacy version

      // Wrong/unsupported version
      const response2 = await fetch(`${server.baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': '2020-01-01',
        },
        body: JSON.stringify(createRequest(1, 'test')),
      });
      expect(response2.status).toBe(400);
      const body2 = await response2.json();
      expect(body2.error).toContain('Unsupported protocol version');

      // Legacy version 2025-03-26 should also be accepted
      const response3 = await fetch(`${server.baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': '2025-03-26',
        },
        body: JSON.stringify(createRequest(2, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        })),
      });
      expect(response3.status).toBe(200);
    });

    it('should validate MCP-Session-Id for non-initialize requests', async () => {
      server = await createTestServer();
      server.transport.setMessageHandler(async (msg) => {
        const id = 'id' in msg ? msg.id : null;
        return createSuccessResponse(id, {});
      });

      // Missing session ID
      const response1 = await sendRequest(
        server,
        createRequest(1, 'tools/list')
      );
      expect(response1.status).toBe(400);

      // Invalid session ID
      const response2 = await sendRequest(
        server,
        createRequest(1, 'tools/list'),
        { 'MCP-Session-Id': 'nonexistent-session' }
      );
      expect(response2.status).toBe(404);
    });

    it('should expose session ID in CORS headers', async () => {
      server = await createTestServer({ allowedOrigins: ['http://example.com'] });
      server.transport.setMessageHandler(async (msg) => {
        const id = 'id' in msg ? msg.id : null;
        return createSuccessResponse(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          serverInfo: { name: 'test', version: '1.0.0' },
        });
      });

      const response = await fetch(`${server.baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': PROTOCOL_VERSION,
          'Origin': 'http://example.com',
        },
        body: JSON.stringify(createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        })),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe('http://example.com');
      expect(response.headers.get('access-control-expose-headers')).toContain('mcp-session-id');
    });
  });

  describe('JSON-RPC Message Handling', () => {
    it('should handle notifications with 202 Accepted', async () => {
      server = await createTestServer();
      let notificationReceived = false;

      server.transport.setMessageHandler(async (msg) => {
        if (msg.method === 'notifications/test') {
          notificationReceived = true;
        }
        return null;
      });

      const session = server.transport.getSessionManager().createSession();

      const response = await sendRequest(
        server,
        createNotification('notifications/test', { data: 'test' }),
        { 'MCP-Session-Id': session.id }
      );

      expect(response.status).toBe(202);
      expect(notificationReceived).toBe(true);
    });

    it('should return proper JSON-RPC response format', async () => {
      server = await createTestServer();
      server.transport.setMessageHandler(async (msg) => {
        const id = 'id' in msg ? msg.id : null;
        return createSuccessResponse(id, { result: 'test-result' });
      });

      const session = server.transport.getSessionManager().createSession();

      const response = await sendRequest(
        server,
        createRequest(42, 'test/method'),
        { 'MCP-Session-Id': session.id }
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');

      const body = await response.json();
      expect(body.jsonrpc).toBe(JSONRPC_VERSION);
      expect(body.id).toBe(42);
      expect(body.result).toEqual({ result: 'test-result' });
    });

    it('should reject invalid JSON-RPC messages', async () => {
      server = await createTestServer();
      server.transport.setMessageHandler(async () => null);

      // Invalid JSON
      const response1 = await fetch(`${server.baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': PROTOCOL_VERSION,
        },
        body: 'not valid json',
      });
      expect(response1.status).toBe(400);

      // Missing jsonrpc field
      const response2 = await sendRequest(server, { method: 'test' });
      expect(response2.status).toBe(400);

      // Missing method field
      const response3 = await sendRequest(server, { jsonrpc: '2.0', id: 1 });
      expect(response3.status).toBe(400);
    });
  });

  describe('Stateless Mode', () => {
    it('should work without session management in stateless mode', async () => {
      server = await createTestServer({ statelessMode: true });

      server.transport.setMessageHandler(async (msg, session) => {
        const id = 'id' in msg ? msg.id : null;
        return createSuccessResponse(id, { sessionId: session.id, state: session.state });
      });

      // Request without session ID should work
      const response = await sendRequest(
        server,
        createRequest(1, 'test/method')
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.result.sessionId).toBe('stateless');
      expect(body.result.state).toBe('ready');

      // Should not return session ID header
      expect(response.headers.get('mcp-session-id')).toBeNull();
    });
  });
});
