/**
 * Protocol Lifecycle Integration Tests
 *
 * Tests the complete MCP protocol lifecycle including:
 * - Initialize -> ready state transitions
 * - Capability exchange
 * - Graceful shutdown
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HttpTransport } from '../../src/transport/http.js';
import {
  LifecycleManager,
  PROTOCOL_VERSION,
  ServerCapabilities,
  ClientCapabilities,
  InitializeResult,
} from '../../src/protocol/lifecycle.js';
import {
  createRequest,
  createNotification,
  createSuccessResponse,
  createErrorResponse,
  createJsonRpcError,
  JsonRpcErrorCodes,
  JsonRpcRequest,
  JsonRpcNotification,
} from '../../src/protocol/jsonrpc.js';
import { getTestPort } from '../helpers/ports.js';

// =============================================================================
// Test Helpers
// =============================================================================

interface TestServer {
  transport: HttpTransport;
  port: number;
  baseUrl: string;
  lifecycle: LifecycleManager;
}

async function createTestServer(serverCapabilities?: ServerCapabilities): Promise<TestServer> {
  const port = getTestPort();
  const lifecycle = new LifecycleManager({
    name: 'lifecycle-test-server',
    version: '1.0.0',
    description: 'Test server for lifecycle tests',
    capabilities: serverCapabilities ?? {
      tools: { listChanged: true },
      resources: { subscribe: true, listChanged: true },
      prompts: { listChanged: true },
      logging: {},
    },
    instructions: 'This is a test server.',
  });

  const transport = new HttpTransport({
    port,
    allowedOrigins: ['*'],
    sseKeepAliveInterval: 0,
  });

  transport.setMessageHandler(async (msg, session) => {
    const id = 'id' in msg ? msg.id : null;

    // Check pre-initialization state
    const preInitError = lifecycle.checkPreInitialization(msg);
    if (preInitError) {
      return preInitError;
    }

    if (msg.method === 'initialize') {
      try {
        const result = lifecycle.handleInitialize(msg.params);
        return createSuccessResponse(id, result);
      } catch (error) {
        if (error instanceof Error && 'code' in error) {
          return createErrorResponse(
            id,
            createJsonRpcError((error as { code: number }).code, error.message)
          );
        }
        throw error;
      }
    }

    if (msg.method === 'notifications/initialized') {
      lifecycle.handleInitialized();
      return null; // Notification - no response
    }

    if (msg.method === 'shutdown') {
      lifecycle.initiateShutdown();
      return createSuccessResponse(id, {});
    }

    // All other methods require ready state
    if (!lifecycle.isOperational()) {
      return createErrorResponse(
        id,
        createJsonRpcError(JsonRpcErrorCodes.INVALID_REQUEST, 'Server not ready')
      );
    }

    // Echo method for testing
    if (msg.method === 'test/echo') {
      return createSuccessResponse(id, { params: msg.params, state: lifecycle.getState() });
    }

    return createErrorResponse(
      id,
      createJsonRpcError(JsonRpcErrorCodes.METHOD_NOT_FOUND, `Unknown method: ${msg.method}`)
    );
  });

  await transport.start();

  return {
    transport,
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    lifecycle,
  };
}

async function sendRequest(
  server: TestServer,
  body: unknown,
  sessionId?: string
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': PROTOCOL_VERSION,
  };

  if (sessionId) {
    headers['MCP-Session-Id'] = sessionId;
  }

  return fetch(`${server.baseUrl}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

// =============================================================================
// Integration Tests
// =============================================================================

describe('Protocol Lifecycle Integration', () => {
  let server: TestServer;

  afterEach(async () => {
    if (server) {
      await server.transport.close().catch(() => {});
    }
  });

  describe('Initialization Flow', () => {
    it('should complete full initialization handshake', async () => {
      server = await createTestServer();

      // Initial state should be uninitialized
      expect(server.lifecycle.getState()).toBe('uninitialized');

      // Step 1: Send initialize request
      const initResponse = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {
            roots: { listChanged: true },
            sampling: {},
          },
          clientInfo: {
            name: 'test-client',
            version: '2.0.0',
          },
        })
      );

      expect(initResponse.status).toBe(200);
      const initBody = await initResponse.json();

      // Verify initialize response
      expect(initBody.result.protocolVersion).toBe(PROTOCOL_VERSION);
      expect(initBody.result.serverInfo.name).toBe('lifecycle-test-server');
      expect(initBody.result.serverInfo.version).toBe('1.0.0');
      expect(initBody.result.serverInfo.description).toBe('Test server for lifecycle tests');
      expect(initBody.result.instructions).toBe('This is a test server.');
      expect(initBody.result.capabilities.tools).toBeDefined();

      // State should be initializing
      expect(server.lifecycle.getState()).toBe('initializing');

      const sessionId = initResponse.headers.get('mcp-session-id')!;

      // Step 2: Send initialized notification
      const initializedResponse = await sendRequest(
        server,
        createNotification('notifications/initialized'),
        sessionId
      );

      expect(initializedResponse.status).toBe(202);

      // State should now be ready
      expect(server.lifecycle.getState()).toBe('ready');

      // Step 3: Verify client info was stored
      expect(server.lifecycle.getClientInfo()).toEqual({
        name: 'test-client',
        version: '2.0.0',
      });
    });

    it('should reject requests before initialization', async () => {
      server = await createTestServer();
      const session = server.transport.getSessionManager().createSession();

      // Try to call a method before initialize
      const response = await sendRequest(
        server,
        createRequest(1, 'tools/list'),
        session.id
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe(JsonRpcErrorCodes.INVALID_REQUEST);
      expect(body.error.message).toContain('not initialized');
    });

    it('should reject duplicate initialize requests', async () => {
      server = await createTestServer();

      // First initialize
      const response1 = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        })
      );
      expect(response1.status).toBe(200);
      const sessionId = response1.headers.get('mcp-session-id')!;

      // Send initialized
      await sendRequest(
        server,
        createNotification('notifications/initialized'),
        sessionId
      );

      // Try second initialize
      const response2 = await sendRequest(
        server,
        createRequest(2, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        }),
        sessionId
      );

      expect(response2.status).toBe(200);
      const body = await response2.json();
      expect(body.error).toBeDefined();
      expect(body.error.message).toContain('already initialized');
    });

    it('should reject incompatible protocol versions', async () => {
      server = await createTestServer();

      const response = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: '2020-01-01', // Wrong version
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.error).toBeDefined();
      expect(body.error.message).toContain('Unsupported protocol version');
    });
  });

  describe('Capability Exchange', () => {
    it('should advertise server capabilities', async () => {
      server = await createTestServer({
        tools: { listChanged: true },
        resources: { subscribe: true, listChanged: true },
        prompts: { listChanged: true },
        logging: {},
        completions: {},
      });

      const response = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        })
      );

      const body = await response.json();
      const capabilities = body.result.capabilities;

      expect(capabilities.tools).toEqual({ listChanged: true });
      expect(capabilities.resources).toEqual({ subscribe: true, listChanged: true });
      expect(capabilities.prompts).toEqual({ listChanged: true });
      expect(capabilities.logging).toBeDefined();
      expect(capabilities.completions).toBeDefined();
    });

    it('should store client capabilities', async () => {
      server = await createTestServer();

      const clientCapabilities: ClientCapabilities = {
        roots: { listChanged: true },
        sampling: { enabled: true },
        experimental: { customFeature: true },
      };

      const response = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: clientCapabilities,
          clientInfo: { name: 'capable-client', version: '3.0' },
        })
      );

      expect(response.status).toBe(200);

      const storedCapabilities = server.lifecycle.getClientCapabilities();
      expect(storedCapabilities?.roots?.listChanged).toBe(true);
      expect(storedCapabilities?.sampling).toBeDefined();
      expect(storedCapabilities?.experimental).toBeDefined();
    });

    it('should handle minimal client capabilities', async () => {
      server = await createTestServer();

      const response = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {}, // Empty capabilities
          clientInfo: { name: 'minimal-client', version: '1.0' },
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.result.protocolVersion).toBe(PROTOCOL_VERSION);
    });
  });

  describe('State Transitions', () => {
    it('should transition through all states correctly', async () => {
      server = await createTestServer();

      // State 1: uninitialized
      expect(server.lifecycle.getState()).toBe('uninitialized');

      // Transition to initializing
      const initResponse = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        })
      );
      const sessionId = initResponse.headers.get('mcp-session-id')!;

      // State 2: initializing
      expect(server.lifecycle.getState()).toBe('initializing');

      // Transition to ready
      await sendRequest(
        server,
        createNotification('notifications/initialized'),
        sessionId
      );

      // State 3: ready
      expect(server.lifecycle.getState()).toBe('ready');
      expect(server.lifecycle.isOperational()).toBe(true);

      // Transition to shutting_down
      await sendRequest(
        server,
        createRequest(2, 'shutdown'),
        sessionId
      );

      // State 4: shutting_down
      expect(server.lifecycle.getState()).toBe('shutting_down');
      expect(server.lifecycle.isOperational()).toBe(false);
    });

    it('should reject non-initialize requests in uninitialized state', async () => {
      server = await createTestServer();
      const session = server.transport.getSessionManager().createSession();

      const methods = ['tools/list', 'resources/list', 'prompts/list', 'test/echo'];

      for (const method of methods) {
        const response = await sendRequest(
          server,
          createRequest(1, method),
          session.id
        );

        const body = await response.json();
        expect(body.error).toBeDefined();
        expect(body.error.message).toContain('not initialized');
      }
    });

    it('should only allow initialized notification in initializing state', async () => {
      server = await createTestServer();

      // Initialize first
      const initResponse = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        })
      );
      const sessionId = initResponse.headers.get('mcp-session-id')!;

      expect(server.lifecycle.getState()).toBe('initializing');

      // Try other requests - should be rejected
      const response = await sendRequest(
        server,
        createRequest(2, 'tools/list'),
        sessionId
      );

      const body = await response.json();
      expect(body.error).toBeDefined();
    });
  });

  describe('Graceful Shutdown', () => {
    it('should handle shutdown request', async () => {
      server = await createTestServer();

      // Initialize
      const initResponse = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        })
      );
      const sessionId = initResponse.headers.get('mcp-session-id')!;

      await sendRequest(
        server,
        createNotification('notifications/initialized'),
        sessionId
      );

      expect(server.lifecycle.isOperational()).toBe(true);

      // Shutdown
      const shutdownResponse = await sendRequest(
        server,
        createRequest(2, 'shutdown'),
        sessionId
      );

      expect(shutdownResponse.status).toBe(200);
      const shutdownBody = await shutdownResponse.json();
      expect(shutdownBody.result).toBeDefined();
      expect(server.lifecycle.getState()).toBe('shutting_down');
      expect(server.lifecycle.isOperational()).toBe(false);
    });

    it('should reject requests after shutdown', async () => {
      server = await createTestServer();

      // Initialize and ready
      const initResponse = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        })
      );
      const sessionId = initResponse.headers.get('mcp-session-id')!;

      await sendRequest(
        server,
        createNotification('notifications/initialized'),
        sessionId
      );

      // Shutdown
      await sendRequest(server, createRequest(2, 'shutdown'), sessionId);

      // Try to call method after shutdown
      const response = await sendRequest(
        server,
        createRequest(3, 'test/echo', { data: 'test' }),
        sessionId
      );

      const body = await response.json();
      expect(body.error).toBeDefined();
      expect(body.error.message).toContain('shutting down');
    });

    it('should handle multiple shutdown calls gracefully', async () => {
      server = await createTestServer();

      // Initialize
      const initResponse = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        })
      );
      const sessionId = initResponse.headers.get('mcp-session-id')!;

      await sendRequest(
        server,
        createNotification('notifications/initialized'),
        sessionId
      );

      // First shutdown
      const firstShutdown = server.lifecycle.initiateShutdown();
      expect(firstShutdown).toBe(true);

      // Second shutdown should return false (already shutting down)
      const secondShutdown = server.lifecycle.initiateShutdown();
      expect(secondShutdown).toBe(false);

      expect(server.lifecycle.getState()).toBe('shutting_down');
    });
  });

  describe('Complete Lifecycle Flow', () => {
    it('should complete full lifecycle: init -> ready -> operations -> shutdown', async () => {
      server = await createTestServer();

      // Step 1: Initialize
      expect(server.lifecycle.getState()).toBe('uninitialized');

      const initResponse = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { roots: { listChanged: true } },
          clientInfo: { name: 'lifecycle-test', version: '1.0.0' },
        })
      );

      expect(initResponse.status).toBe(200);
      const sessionId = initResponse.headers.get('mcp-session-id')!;
      expect(server.lifecycle.getState()).toBe('initializing');

      // Step 2: Send initialized notification
      const initializedResponse = await sendRequest(
        server,
        createNotification('notifications/initialized'),
        sessionId
      );
      expect(initializedResponse.status).toBe(202);
      expect(server.lifecycle.getState()).toBe('ready');

      // Step 3: Perform operations in ready state
      const echoResponse = await sendRequest(
        server,
        createRequest(2, 'test/echo', { message: 'hello' }),
        sessionId
      );
      expect(echoResponse.status).toBe(200);
      const echoBody = await echoResponse.json();
      expect(echoBody.result.state).toBe('ready');
      expect(echoBody.result.params.message).toBe('hello');

      // Step 4: Shutdown
      const shutdownResponse = await sendRequest(
        server,
        createRequest(3, 'shutdown'),
        sessionId
      );
      expect(shutdownResponse.status).toBe(200);
      expect(server.lifecycle.getState()).toBe('shutting_down');

      // Step 5: Verify operations are rejected after shutdown
      const postShutdownResponse = await sendRequest(
        server,
        createRequest(4, 'test/echo', { message: 'should fail' }),
        sessionId
      );
      const postShutdownBody = await postShutdownResponse.json();
      expect(postShutdownBody.error).toBeDefined();
    });

    it('should allow lifecycle reset for testing', async () => {
      server = await createTestServer();

      // Initialize
      await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        })
      );

      expect(server.lifecycle.getState()).toBe('initializing');

      // Reset
      server.lifecycle.reset();

      expect(server.lifecycle.getState()).toBe('uninitialized');
      expect(server.lifecycle.getClientInfo()).toBeNull();
      expect(server.lifecycle.getClientCapabilities()).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid initialize params', async () => {
      server = await createTestServer();

      // Missing protocolVersion
      const response = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        })
      );

      const body = await response.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe(JsonRpcErrorCodes.INVALID_PARAMS);
    });

    it('should handle missing clientInfo', async () => {
      server = await createTestServer();

      const response = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          // Missing clientInfo
        })
      );

      const body = await response.json();
      expect(body.error).toBeDefined();
    });
  });
});
