import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { Express } from 'express';
import {
  HttpTransport,
  HttpTransportOptions,
  HttpTransportError,
  HttpMessageHandler,
} from '../../../src/transport/http.js';
import {
  SessionManager,
  Session,
  generateSessionId,
} from '../../../src/transport/session.js';
import {
  createRequest,
  createNotification,
  createSuccessResponse,
  createErrorResponse,
  createJsonRpcError,
  JsonRpcErrorCodes,
  JSONRPC_VERSION,
} from '../../../src/protocol/jsonrpc.js';
import { PROTOCOL_VERSION } from '../../../src/protocol/lifecycle.js';
import { getTestPort } from '../../helpers/ports.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createTestTransport(options?: Partial<HttpTransportOptions>): HttpTransport {
  return new HttpTransport({
    port: getTestPort(),
    allowedOrigins: ['http://localhost:3000', 'http://example.com'],
    ...options,
  });
}

async function makeRequest(
  transport: HttpTransport,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  const app = transport.getApp();
  const port = (transport as unknown as { port: number }).port;

  // Use the app directly via supertest-like approach
  // We'll start the server and make actual HTTP requests
  await transport.start();

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': PROTOCOL_VERSION,
    ...headers,
  };

  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: defaultHeaders,
    body: JSON.stringify(body),
  });

  return response;
}

// =============================================================================
// Session Manager Tests
// =============================================================================

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  afterEach(() => {
    manager.stopCleanup();
    manager.clear();
  });

  describe('generateSessionId', () => {
    it('should generate a valid UUID', () => {
      const id = generateSessionId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSessionId());
      }
      expect(ids.size).toBe(100);
    });

    it('should only contain visible ASCII characters', () => {
      const id = generateSessionId();
      for (const char of id) {
        const code = char.charCodeAt(0);
        expect(code).toBeGreaterThanOrEqual(0x21);
        expect(code).toBeLessThanOrEqual(0x7e);
      }
    });
  });

  describe('createSession', () => {
    it('should create a session with valid ID', () => {
      const session = manager.createSession();
      expect(session.id).toBeTruthy();
      expect(session.id.length).toBeGreaterThan(0);
    });

    it('should initialize session in uninitialized state', () => {
      const session = manager.createSession();
      expect(session.state).toBe('uninitialized');
    });

    it('should set createdAt and lastActiveAt', () => {
      const before = new Date();
      const session = manager.createSession();
      const after = new Date();

      expect(session.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(session.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(session.lastActiveAt.getTime()).toBe(session.createdAt.getTime());
    });

    it('should increment session count', () => {
      expect(manager.size).toBe(0);
      manager.createSession();
      expect(manager.size).toBe(1);
      manager.createSession();
      expect(manager.size).toBe(2);
    });
  });

  describe('getSession', () => {
    it('should return session by ID', () => {
      const created = manager.createSession();
      const retrieved = manager.getSession(created.id);
      expect(retrieved).toBe(created);
    });

    it('should return undefined for unknown ID', () => {
      const session = manager.getSession('nonexistent');
      expect(session).toBeUndefined();
    });
  });

  describe('touchSession', () => {
    it('should update lastActiveAt', async () => {
      const session = manager.createSession();
      const original = session.lastActiveAt.getTime();

      await new Promise((resolve) => setTimeout(resolve, 10));

      const touched = manager.touchSession(session.id);
      expect(touched).toBe(true);
      expect(session.lastActiveAt.getTime()).toBeGreaterThan(original);
    });

    it('should return false for unknown ID', () => {
      const touched = manager.touchSession('nonexistent');
      expect(touched).toBe(false);
    });
  });

  describe('updateSessionState', () => {
    it('should update session state', () => {
      const session = manager.createSession();
      expect(session.state).toBe('uninitialized');

      manager.updateSessionState(session.id, 'initializing');
      expect(session.state).toBe('initializing');

      manager.updateSessionState(session.id, 'ready');
      expect(session.state).toBe('ready');
    });

    it('should return false for unknown ID', () => {
      const result = manager.updateSessionState('nonexistent', 'ready');
      expect(result).toBe(false);
    });
  });

  describe('setClientInfo', () => {
    it('should store client info on session', () => {
      const session = manager.createSession();
      const clientInfo = { name: 'test-client', version: '1.0.0' };
      const capabilities = { roots: { listChanged: true } };

      manager.setClientInfo(session.id, clientInfo, capabilities);

      expect(session.clientInfo).toEqual(clientInfo);
      expect(session.clientCapabilities).toEqual(capabilities);
    });

    it('should return false for unknown ID', () => {
      const result = manager.setClientInfo('nonexistent', { name: 'test', version: '1.0' });
      expect(result).toBe(false);
    });
  });

  describe('destroySession', () => {
    it('should remove session', () => {
      const session = manager.createSession();
      expect(manager.size).toBe(1);

      const destroyed = manager.destroySession(session.id);
      expect(destroyed).toBe(true);
      expect(manager.size).toBe(0);
      expect(manager.getSession(session.id)).toBeUndefined();
    });

    it('should return false for unknown ID', () => {
      const destroyed = manager.destroySession('nonexistent');
      expect(destroyed).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should remove expired sessions', async () => {
      const shortTtl = new SessionManager({ ttlMs: 50 });

      shortTtl.createSession();
      shortTtl.createSession();
      expect(shortTtl.size).toBe(2);

      await new Promise((resolve) => setTimeout(resolve, 60));

      const cleaned = shortTtl.cleanup();
      expect(cleaned).toBe(2);
      expect(shortTtl.size).toBe(0);
    });

    it('should not remove active sessions', async () => {
      const shortTtl = new SessionManager({ ttlMs: 100 });

      const session = shortTtl.createSession();
      await new Promise((resolve) => setTimeout(resolve, 50));
      shortTtl.touchSession(session.id);

      const cleaned = shortTtl.cleanup();
      expect(cleaned).toBe(0);
      expect(shortTtl.size).toBe(1);
    });
  });

  describe('clear', () => {
    it('should remove all sessions', () => {
      manager.createSession();
      manager.createSession();
      manager.createSession();
      expect(manager.size).toBe(3);

      manager.clear();
      expect(manager.size).toBe(0);
    });
  });
});

// =============================================================================
// HTTP Transport Tests
// =============================================================================

describe('HttpTransport', () => {
  let transport: HttpTransport;

  afterEach(async () => {
    if (transport) {
      await transport.close().catch(() => {});
    }
  });

  describe('constructor', () => {
    it('should create transport with required options', () => {
      transport = new HttpTransport({ port: getTestPort() });
      expect(transport).toBeInstanceOf(HttpTransport);
    });

    it('should accept custom Express app', () => {
      const customApp = express();
      transport = new HttpTransport({ port: getTestPort(), app: customApp });
      expect(transport.getApp()).toBe(customApp);
    });

    it('should have session manager', () => {
      transport = new HttpTransport({ port: getTestPort() });
      expect(transport.getSessionManager()).toBeInstanceOf(SessionManager);
    });
  });

  describe('start/close', () => {
    it('should start and stop server', async () => {
      transport = new HttpTransport({ port: getTestPort() });
      await transport.start();
      await transport.close();
    });

    it('should throw if started twice', async () => {
      transport = new HttpTransport({ port: getTestPort() });
      await transport.start();
      await expect(transport.start()).rejects.toThrow(HttpTransportError);
    });

    it('should not throw if stopped without starting', async () => {
      transport = new HttpTransport({ port: getTestPort() });
      await transport.close(); // Should not throw
    });
  });

  describe('POST /mcp endpoint', () => {
    describe('header validation', () => {
      it('should reject requests without MCP-Protocol-Version header', async () => {
        transport = createTestTransport();
        transport.setMessageHandler(async () => null);
        await transport.start();

        const port = (transport as unknown as { port: number }).port;
        const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(createRequest(1, 'test')),
        });

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toContain('mcp-protocol-version');
      });

      it('should reject requests with wrong protocol version', async () => {
        transport = createTestTransport();
        transport.setMessageHandler(async () => null);
        await transport.start();

        const port = (transport as unknown as { port: number }).port;
        const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'MCP-Protocol-Version': '2024-01-01',
          },
          body: JSON.stringify(createRequest(1, 'test')),
        });

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toContain('Unsupported protocol version');
      });

      it('should reject requests with wrong Content-Type', async () => {
        transport = createTestTransport();
        transport.setMessageHandler(async () => null);
        await transport.start();

        const port = (transport as unknown as { port: number }).port;
        const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
            'MCP-Protocol-Version': PROTOCOL_VERSION,
          },
          body: 'not json',
        });

        expect(response.status).toBe(415);
      });

      it('should reject disallowed origins', async () => {
        transport = createTestTransport({ allowedOrigins: ['http://allowed.com'] });
        transport.setMessageHandler(async () => null);
        await transport.start();

        const port = (transport as unknown as { port: number }).port;
        const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'MCP-Protocol-Version': PROTOCOL_VERSION,
            'Origin': 'http://evil.com',
          },
          body: JSON.stringify(createRequest(1, 'test')),
        });

        expect(response.status).toBe(403);
      });

      it('should allow requests with allowed origin', async () => {
        transport = createTestTransport({ allowedOrigins: ['http://allowed.com'] });
        transport.setMessageHandler(async () => createSuccessResponse(1, { result: 'ok' }));
        await transport.start();

        const port = (transport as unknown as { port: number }).port;
        const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'MCP-Protocol-Version': PROTOCOL_VERSION,
            'Origin': 'http://allowed.com',
            'MCP-Session-Id': transport.getSessionManager().createSession().id,
          },
          body: JSON.stringify(createRequest(1, 'test')),
        });

        expect(response.status).toBe(200);
      });

      it('should allow all origins with wildcard', async () => {
        transport = createTestTransport({ allowedOrigins: ['*'] });
        transport.setMessageHandler(async () => createSuccessResponse(1, { result: 'ok' }));
        await transport.start();

        const port = (transport as unknown as { port: number }).port;
        const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'MCP-Protocol-Version': PROTOCOL_VERSION,
            'Origin': 'http://any-origin.com',
            'MCP-Session-Id': transport.getSessionManager().createSession().id,
          },
          body: JSON.stringify(createRequest(1, 'test')),
        });

        expect(response.status).toBe(200);
      });

      it('should return 413 for payloads exceeding 100KB', async () => {
        transport = createTestTransport({ allowedOrigins: ['*'] });
        transport.setMessageHandler(async () => createSuccessResponse(1, { result: 'ok' }));
        await transport.start();

        const port = (transport as unknown as { port: number }).port;
        // Create a payload larger than 100KB (100 * 1024 = 102400 bytes)
        const largePayload = {
          jsonrpc: '2.0',
          id: 1,
          method: 'test',
          params: {
            data: 'x'.repeat(110 * 1024), // ~110KB of data
          },
        };

        const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'MCP-Protocol-Version': PROTOCOL_VERSION,
            'MCP-Session-Id': transport.getSessionManager().createSession().id,
          },
          body: JSON.stringify(largePayload),
        });

        expect(response.status).toBe(413);
      });
    });

    describe('session management', () => {
      it('should create session on initialize request', async () => {
        transport = createTestTransport();
        transport.setMessageHandler(async (msg, session) => {
          return createSuccessResponse(
            (msg as { id: number }).id,
            {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: {},
              serverInfo: { name: 'test', version: '1.0.0' },
            }
          );
        });
        await transport.start();

        const port = (transport as unknown as { port: number }).port;
        const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'MCP-Protocol-Version': PROTOCOL_VERSION,
          },
          body: JSON.stringify(createRequest(1, 'initialize', {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
          })),
        });

        expect(response.status).toBe(200);
        const sessionId = response.headers.get('mcp-session-id');
        expect(sessionId).toBeTruthy();
        expect(transport.getSessionManager().getSession(sessionId!)).toBeDefined();
      });

      it('should require session ID for non-initialize requests', async () => {
        transport = createTestTransport();
        transport.setMessageHandler(async () => createSuccessResponse(1, {}));
        await transport.start();

        const port = (transport as unknown as { port: number }).port;
        const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'MCP-Protocol-Version': PROTOCOL_VERSION,
          },
          body: JSON.stringify(createRequest(1, 'tools/list')),
        });

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toContain('mcp-session-id');
      });

      it('should reject invalid session ID', async () => {
        transport = createTestTransport();
        transport.setMessageHandler(async () => createSuccessResponse(1, {}));
        await transport.start();

        const port = (transport as unknown as { port: number }).port;
        const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'MCP-Protocol-Version': PROTOCOL_VERSION,
            'MCP-Session-Id': 'invalid-session-id',
          },
          body: JSON.stringify(createRequest(1, 'tools/list')),
        });

        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body.error).toContain('Session not found');
      });

      it('should accept valid session ID', async () => {
        transport = createTestTransport();
        transport.setMessageHandler(async () => createSuccessResponse(1, { tools: [] }));
        await transport.start();

        const session = transport.getSessionManager().createSession();
        const port = (transport as unknown as { port: number }).port;
        const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'MCP-Protocol-Version': PROTOCOL_VERSION,
            'MCP-Session-Id': session.id,
          },
          body: JSON.stringify(createRequest(1, 'tools/list')),
        });

        expect(response.status).toBe(200);
      });
    });

    describe('JSON-RPC handling', () => {
      it('should handle requests and return responses', async () => {
        transport = createTestTransport();
        transport.setMessageHandler(async (msg) => {
          const req = msg as { id: number; method: string };
          return createSuccessResponse(req.id, { echo: req.method });
        });
        await transport.start();

        const session = transport.getSessionManager().createSession();
        const port = (transport as unknown as { port: number }).port;
        const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'MCP-Protocol-Version': PROTOCOL_VERSION,
            'MCP-Session-Id': session.id,
          },
          body: JSON.stringify(createRequest(1, 'test/method')),
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.jsonrpc).toBe(JSONRPC_VERSION);
        expect(body.id).toBe(1);
        expect(body.result).toEqual({ echo: 'test/method' });
      });

      it('should return 202 Accepted for notifications', async () => {
        transport = createTestTransport();
        let receivedNotification = false;
        transport.setMessageHandler(async () => {
          receivedNotification = true;
          return null;
        });
        await transport.start();

        const session = transport.getSessionManager().createSession();
        const port = (transport as unknown as { port: number }).port;
        const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'MCP-Protocol-Version': PROTOCOL_VERSION,
            'MCP-Session-Id': session.id,
          },
          body: JSON.stringify(createNotification('notifications/test')),
        });

        expect(response.status).toBe(202);
        expect(receivedNotification).toBe(true);
      });

      it('should pass session to message handler', async () => {
        transport = createTestTransport();
        let receivedSession: Session | null = null;
        transport.setMessageHandler(async (msg, session) => {
          receivedSession = session;
          return createSuccessResponse((msg as { id: number }).id, {});
        });
        await transport.start();

        const session = transport.getSessionManager().createSession();
        const port = (transport as unknown as { port: number }).port;
        await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'MCP-Protocol-Version': PROTOCOL_VERSION,
            'MCP-Session-Id': session.id,
          },
          body: JSON.stringify(createRequest(1, 'test')),
        });

        expect(receivedSession).toBe(session);
      });

      it('should reject invalid JSON-RPC messages', async () => {
        transport = createTestTransport();
        transport.setMessageHandler(async () => null);
        await transport.start();

        const port = (transport as unknown as { port: number }).port;
        const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'MCP-Protocol-Version': PROTOCOL_VERSION,
          },
          body: JSON.stringify({ invalid: 'message' }),
        });

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toBeDefined();
      });

      it('should return 500 if no handler configured', async () => {
        transport = createTestTransport();
        // Don't set message handler
        await transport.start();

        const session = transport.getSessionManager().createSession();
        const port = (transport as unknown as { port: number }).port;
        const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'MCP-Protocol-Version': PROTOCOL_VERSION,
            'MCP-Session-Id': session.id,
          },
          body: JSON.stringify(createRequest(1, 'test')),
        });

        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.error).toContain('No message handler');
      });
    });

    describe('CORS', () => {
      it('should handle OPTIONS preflight request', async () => {
        transport = createTestTransport({ allowedOrigins: ['http://example.com'] });
        await transport.start();

        const port = (transport as unknown as { port: number }).port;
        const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'OPTIONS',
          headers: {
            'Origin': 'http://example.com',
          },
        });

        expect(response.status).toBe(204);
      });

      it('should set CORS headers for allowed origin', async () => {
        transport = createTestTransport({ allowedOrigins: ['http://example.com'] });
        transport.setMessageHandler(async () => createSuccessResponse(1, {}));
        await transport.start();

        const session = transport.getSessionManager().createSession();
        const port = (transport as unknown as { port: number }).port;
        const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'MCP-Protocol-Version': PROTOCOL_VERSION,
            'MCP-Session-Id': session.id,
            'Origin': 'http://example.com',
          },
          body: JSON.stringify(createRequest(1, 'test')),
        });

        expect(response.headers.get('access-control-allow-origin')).toBe('http://example.com');
        expect(response.headers.get('access-control-expose-headers')).toContain('mcp-session-id');
      });
    });
  });

  describe('GET /mcp endpoint (SSE)', () => {
    it('should reject requests without Accept: text/event-stream', async () => {
      transport = createTestTransport({ allowedOrigins: ['*'] });
      await transport.start();

      const session = transport.getSessionManager().createSession();
      const port = (transport as unknown as { port: number }).port;
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'GET',
        headers: {
          'MCP-Session-Id': session.id,
        },
      });

      expect(response.status).toBe(406);
      const body = await response.json();
      expect(body.error).toContain('text/event-stream');
    });

    it('should reject requests without session ID', async () => {
      transport = createTestTransport({ allowedOrigins: ['*'] });
      await transport.start();

      const port = (transport as unknown as { port: number }).port;
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
        },
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('mcp-session-id');
    });

    it('should reject invalid session ID', async () => {
      transport = createTestTransport({ allowedOrigins: ['*'] });
      await transport.start();

      const port = (transport as unknown as { port: number }).port;
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'MCP-Session-Id': 'invalid-session',
        },
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toContain('Session not found');
    });

    it('should establish SSE connection with valid session', async () => {
      transport = createTestTransport({ allowedOrigins: ['*'], sseKeepAliveInterval: 0 });
      await transport.start();

      const session = transport.getSessionManager().createSession();
      const port = (transport as unknown as { port: number }).port;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 500);

      try {
        const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'GET',
          headers: {
            'Accept': 'text/event-stream',
            'MCP-Session-Id': session.id,
          },
          signal: controller.signal,
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('text/event-stream');
        expect(response.headers.get('cache-control')).toBe('no-cache');
      } catch (err) {
        // AbortError is expected - we just want to verify headers
        if ((err as Error).name !== 'AbortError') {
          throw err;
        }
      } finally {
        clearTimeout(timeoutId);
      }
    });

    it('should reject disallowed origins', async () => {
      transport = createTestTransport({ allowedOrigins: ['http://allowed.com'] });
      await transport.start();

      const port = (transport as unknown as { port: number }).port;
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'GET',
        headers: {
          'Origin': 'http://evil.com',
          'Accept': 'text/event-stream',
        },
      });

      expect(response.status).toBe(403);
    });

    it('should provide SSEManager for sending events', async () => {
      transport = createTestTransport({ allowedOrigins: ['*'], sseKeepAliveInterval: 0 });
      await transport.start();

      const session = transport.getSessionManager().createSession();
      const sseManager = transport.getSSEManager();

      expect(sseManager).toBeDefined();

      // Before connection, hasStream should be false
      expect(sseManager.hasStream(session.id)).toBe(false);
    });
  });
});

describe('HttpTransportError', () => {
  it('should have correct properties', () => {
    const error = new HttpTransportError('Test error', 500);
    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(500);
    expect(error.name).toBe('HttpTransportError');
    expect(error).toBeInstanceOf(Error);
  });
});

// =============================================================================
// Stateless Mode Tests
// =============================================================================

describe('HttpTransport Stateless Mode', () => {
  let transport: HttpTransport;

  afterEach(async () => {
    if (transport) {
      await transport.close().catch(() => {});
    }
  });

  describe('constructor', () => {
    it('should default to stateful mode', () => {
      transport = new HttpTransport({ port: getTestPort() });
      expect(transport.isStateless()).toBe(false);
    });

    it('should enable stateless mode when configured', () => {
      transport = new HttpTransport({ port: getTestPort(), statelessMode: true });
      expect(transport.isStateless()).toBe(true);
    });
  });

  describe('POST /mcp endpoint in stateless mode', () => {
    it('should not require session ID for any request', async () => {
      transport = new HttpTransport({
        port: getTestPort(),
        statelessMode: true,
        allowedOrigins: ['*'],
      });
      transport.setMessageHandler(async (msg) => {
        return createSuccessResponse((msg as { id: number }).id, { tools: [] });
      });
      await transport.start();

      const port = (transport as unknown as { port: number }).port;
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': PROTOCOL_VERSION,
        },
        body: JSON.stringify(createRequest(1, 'tools/list')),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.result).toEqual({ tools: [] });
    });

    it('should not return session ID header on initialize', async () => {
      transport = new HttpTransport({
        port: getTestPort(),
        statelessMode: true,
        allowedOrigins: ['*'],
      });
      transport.setMessageHandler(async (msg) => {
        return createSuccessResponse((msg as { id: number }).id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          serverInfo: { name: 'test', version: '1.0.0' },
        });
      });
      await transport.start();

      const port = (transport as unknown as { port: number }).port;
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': PROTOCOL_VERSION,
        },
        body: JSON.stringify(createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        })),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('mcp-session-id')).toBeNull();
    });

    it('should accept requests with any or no session ID', async () => {
      transport = new HttpTransport({
        port: getTestPort(),
        statelessMode: true,
        allowedOrigins: ['*'],
      });
      transport.setMessageHandler(async (msg) => {
        return createSuccessResponse((msg as { id: number }).id, { result: 'ok' });
      });
      await transport.start();

      const port = (transport as unknown as { port: number }).port;

      // Request without session ID
      const response1 = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': PROTOCOL_VERSION,
        },
        body: JSON.stringify(createRequest(1, 'test')),
      });
      expect(response1.status).toBe(200);

      // Request with arbitrary session ID (should be ignored)
      const response2 = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': PROTOCOL_VERSION,
          'MCP-Session-Id': 'any-random-id',
        },
        body: JSON.stringify(createRequest(2, 'test')),
      });
      expect(response2.status).toBe(200);
    });

    it('should pass ephemeral session to handler', async () => {
      transport = new HttpTransport({
        port: getTestPort(),
        statelessMode: true,
        allowedOrigins: ['*'],
      });
      let receivedSession: Session | null = null;
      transport.setMessageHandler(async (msg, session) => {
        receivedSession = session;
        return createSuccessResponse((msg as { id: number }).id, {});
      });
      await transport.start();

      const port = (transport as unknown as { port: number }).port;
      await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': PROTOCOL_VERSION,
        },
        body: JSON.stringify(createRequest(1, 'test')),
      });

      expect(receivedSession).toBeDefined();
      expect(receivedSession!.id).toBe('stateless');
      expect(receivedSession!.state).toBe('ready');
    });

    it('should handle notifications in stateless mode', async () => {
      transport = new HttpTransport({
        port: getTestPort(),
        statelessMode: true,
        allowedOrigins: ['*'],
      });
      let receivedNotification = false;
      transport.setMessageHandler(async () => {
        receivedNotification = true;
        return null;
      });
      await transport.start();

      const port = (transport as unknown as { port: number }).port;
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': PROTOCOL_VERSION,
        },
        body: JSON.stringify(createNotification('notifications/test')),
      });

      expect(response.status).toBe(202);
      expect(receivedNotification).toBe(true);
    });
  });

  describe('GET /mcp endpoint (SSE) in stateless mode', () => {
    it('should reject SSE connections with 406', async () => {
      transport = new HttpTransport({
        port: getTestPort(),
        statelessMode: true,
        allowedOrigins: ['*'],
      });
      await transport.start();

      const port = (transport as unknown as { port: number }).port;
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'MCP-Session-Id': 'any-id',
        },
      });

      expect(response.status).toBe(406);
      const body = await response.json();
      expect(body.error).toContain('stateless mode');
    });

    it('should reject SSE even without Accept header', async () => {
      transport = new HttpTransport({
        port: getTestPort(),
        statelessMode: true,
        allowedOrigins: ['*'],
      });
      await transport.start();

      const port = (transport as unknown as { port: number }).port;
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'GET',
        headers: {},
      });

      expect(response.status).toBe(406);
      const body = await response.json();
      expect(body.error).toContain('stateless mode');
    });
  });

  describe('header validation still works in stateless mode', () => {
    it('should still require Content-Type header', async () => {
      transport = new HttpTransport({
        port: getTestPort(),
        statelessMode: true,
        allowedOrigins: ['*'],
      });
      transport.setMessageHandler(async () => null);
      await transport.start();

      const port = (transport as unknown as { port: number }).port;
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          'MCP-Protocol-Version': PROTOCOL_VERSION,
        },
        body: JSON.stringify(createRequest(1, 'test')),
      });

      expect(response.status).toBe(415);
    });

    it('should still require MCP-Protocol-Version header', async () => {
      transport = new HttpTransport({
        port: getTestPort(),
        statelessMode: true,
        allowedOrigins: ['*'],
      });
      transport.setMessageHandler(async () => null);
      await transport.start();

      const port = (transport as unknown as { port: number }).port;
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createRequest(1, 'test')),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('mcp-protocol-version');
    });

    it('should still validate Origin header', async () => {
      transport = new HttpTransport({
        port: getTestPort(),
        statelessMode: true,
        allowedOrigins: ['http://allowed.com'],
      });
      transport.setMessageHandler(async () => null);
      await transport.start();

      const port = (transport as unknown as { port: number }).port;
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': PROTOCOL_VERSION,
          'Origin': 'http://evil.com',
        },
        body: JSON.stringify(createRequest(1, 'test')),
      });

      expect(response.status).toBe(403);
    });
  });
});
