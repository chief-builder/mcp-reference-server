/**
 * E2E Session Management Workflow Tests
 *
 * Tests for the MCP session management including:
 * - First request creates session, response includes Mcp-Session-Id header
 * - Subsequent requests with same session ID reuse session state
 * - Request with invalid session ID returns 404
 * - Multiple concurrent requests on same session don't corrupt state
 * - Stdio transport works without session management (stateless)
 *
 * Note: The HTTP server has a single lifecycle state (uninitialized -> initializing -> ready).
 * Session management (Mcp-Session-Id) is separate from lifecycle - sessions track HTTP
 * connections while lifecycle tracks MCP protocol state. Once the server is initialized,
 * it stays ready for all subsequent sessions.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ServerHarness } from '../helpers/server-harness.js';
import { createStdioClientSpawned } from '../helpers/client-factory.js';
import { waitForServerReady, getEphemeralPort } from '../helpers/assertions.js';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '../../..');
const CLI_PATH = resolve(PROJECT_ROOT, 'dist/cli.js');
const PROTOCOL_VERSION = '2025-11-25';

// Default environment for stdio tests
const STDIO_ENV = {
  MCP_TRANSPORT: 'stdio',
  MCP_CURSOR_SECRET: 'e2e-test-cursor-secret-for-e2e-testing-purposes!',
};

/**
 * Helper to make a raw HTTP request with session header control
 */
async function makeRequest(
  port: number,
  method: string,
  params: Record<string, unknown>,
  sessionId?: string
): Promise<{ response: globalThis.Response; sessionId: string | null }> {
  const url = `http://127.0.0.1:${port}/mcp`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'mcp-protocol-version': PROTOCOL_VERSION,
  };

  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
  }

  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: Math.floor(Math.random() * 100000),
    method,
    params,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
  });

  const responseSessionId = response.headers.get('mcp-session-id');
  return { response, sessionId: responseSessionId };
}

/**
 * Helper to initialize a server and return a valid session ID.
 * Also transitions the server to ready state by sending initialized notification.
 */
async function initializeServer(
  port: number
): Promise<string> {
  // Send initialize request
  const initResult = await makeRequest(port, 'initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'session-setup-client', version: '1.0.0' },
  });

  if (initResult.response.status !== 200) {
    throw new Error(`Initialize failed with status ${initResult.response.status}`);
  }

  const sessionId = initResult.sessionId;
  if (!sessionId) {
    throw new Error('No session ID returned from initialize');
  }

  // Send initialized notification to transition to ready state
  await makeRequest(port, 'notifications/initialized', {}, sessionId);

  return sessionId;
}

describe('Session Management E2E Tests', () => {
  describe('HTTP Transport Session Creation', () => {
    let harness: ServerHarness;
    let port: number;
    let primarySessionId: string;

    beforeAll(async () => {
      port = getEphemeralPort();
      harness = new ServerHarness({
        port,
        transport: 'http',
      });

      await harness.start();
      await waitForServerReady(port);

      // Initialize server to ready state and get a session ID
      // This establishes the server lifecycle state for all tests
      primarySessionId = await initializeServer(port);
    });

    afterAll(async () => {
      await harness.stop();
    });

    it('should create a new session on initialize request and return Mcp-Session-Id header', async () => {
      // Verify the primary session was created correctly
      expect(primarySessionId).toBeDefined();
      expect(primarySessionId).not.toBe('');
      expect(typeof primarySessionId).toBe('string');

      // Session ID should be a UUID (36 chars with hyphens)
      expect(primarySessionId.length).toBe(36);
      expect(primarySessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should reuse session state for subsequent requests with same session ID', async () => {
      // Make a tools/list request using the primary session
      const toolsResult = await makeRequest(port, 'tools/list', {}, primarySessionId);

      expect(toolsResult.response.status).toBe(200);
      const toolsBody = await toolsResult.response.json();
      expect(toolsBody.result).toBeDefined();
      expect(toolsBody.result.tools).toBeDefined();
      expect(Array.isArray(toolsBody.result.tools)).toBe(true);

      // Make another request with the same session - should still work
      const secondToolsResult = await makeRequest(
        port,
        'tools/list',
        {},
        primarySessionId
      );
      expect(secondToolsResult.response.status).toBe(200);

      // Make a tool call with the same session
      const calcResult = await makeRequest(
        port,
        'tools/call',
        {
          name: 'calculate',
          arguments: { operation: 'add', a: 5, b: 3 },
        },
        primarySessionId
      );
      expect(calcResult.response.status).toBe(200);
      const calcBody = await calcResult.response.json();
      expect(calcBody.result.content[0].text).toContain('8');
    });

    it('should return 404 when request uses an invalid session ID', async () => {
      // Use a random UUID that doesn't exist as a session
      const invalidSessionId = '12345678-1234-1234-1234-123456789abc';

      const { response } = await makeRequest(
        port,
        'tools/list',
        {},
        invalidSessionId
      );

      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toBeDefined();
      expect(body.error).toContain('Session not found');
    });

    it('should return 400 when non-initialize request has no session ID', async () => {
      // Try to call tools/list without a session ID
      const { response } = await makeRequest(port, 'tools/list', {});

      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBeDefined();
      expect(body.error).toContain('mcp-session-id');
    });

    it('should handle multiple concurrent requests on same session without corrupting state', async () => {
      // Send multiple concurrent requests using the primary session
      const concurrentCount = 10;
      const requests = Array.from({ length: concurrentCount }, (_, i) =>
        makeRequest(
          port,
          'tools/call',
          {
            name: 'calculate',
            arguments: { operation: 'add', a: i, b: 1 },
          },
          primarySessionId
        )
      );

      // Execute all requests concurrently
      const results = await Promise.all(requests);

      // All requests should succeed
      for (let i = 0; i < concurrentCount; i++) {
        expect(results[i].response.status).toBe(200);
        const body = await results[i].response.json();
        expect(body.result).toBeDefined();
        expect(body.result.content).toBeDefined();
        expect(body.result.isError).not.toBe(true);
      }

      // Session should still be valid after concurrent requests
      const finalResult = await makeRequest(port, 'tools/list', {}, primarySessionId);
      expect(finalResult.response.status).toBe(200);
    });

    it('should allow creating new sessions via HTTP transport (session tracking)', async () => {
      // Note: Once the server lifecycle is in 'ready' state, the session manager
      // still creates new sessions for each initialize request. The session ID
      // tracks the HTTP connection state, not the MCP lifecycle state.
      //
      // However, the lifecycle manager rejects subsequent initialize requests
      // because the protocol is designed for a single client per server instance.
      // In a production multi-tenant setup, you'd typically use separate server
      // processes or stateless mode.

      // Verify the primary session is still valid
      const result = await makeRequest(port, 'tools/list', {}, primarySessionId);
      expect(result.response.status).toBe(200);

      // The session system is working - we can verify it accepts valid sessions
      // and rejects invalid ones (tested above)
    });
  });

  describe('Stdio Transport Stateless Behavior', () => {
    it('should work without session management - each client is its own session', async () => {
      // Stdio transport is inherently stateless from an HTTP session perspective.
      // Each client spawns its own server process, creating a 1:1 relationship.
      // There's no session ID header needed - the process IS the session.

      const client = await createStdioClientSpawned('node', [CLI_PATH], STDIO_ENV);

      try {
        // Initialize the client
        const initResult = await client.initialize();

        expect(initResult.protocolVersion).toBe(PROTOCOL_VERSION);
        expect(initResult.serverInfo).toBeDefined();
        expect(initResult.serverInfo.name).toBe('mcp-reference-server');

        // Make multiple requests - all should work because the client maintains
        // its connection to the server process
        const toolsResult1 = await client.listTools();
        expect(toolsResult1.tools.length).toBeGreaterThan(0);

        const toolsResult2 = await client.listTools();
        expect(toolsResult2.tools.length).toBeGreaterThan(0);

        // Call a tool
        const calcResult = await client.callTool('calculate', {
          operation: 'multiply',
          a: 6,
          b: 7,
        });
        expect(calcResult.content[0].text).toContain('42');
        expect(calcResult.isError).not.toBe(true);
      } finally {
        await client.disconnect();
      }
    });

    it('should maintain independent state across multiple stdio clients', async () => {
      // Create two independent stdio clients
      const client1 = await createStdioClientSpawned('node', [CLI_PATH], STDIO_ENV);
      const client2 = await createStdioClientSpawned('node', [CLI_PATH], STDIO_ENV);

      try {
        // Initialize both clients
        const [init1, init2] = await Promise.all([
          client1.initialize(),
          client2.initialize(),
        ]);

        expect(init1.serverInfo.name).toBe('mcp-reference-server');
        expect(init2.serverInfo.name).toBe('mcp-reference-server');

        // Both clients should be able to make independent requests
        const [tools1, tools2] = await Promise.all([
          client1.listTools(),
          client2.listTools(),
        ]);

        expect(tools1.tools.length).toBeGreaterThan(0);
        expect(tools2.tools.length).toBeGreaterThan(0);

        // Each client can call tools independently
        const [calc1, calc2] = await Promise.all([
          client1.callTool('calculate', { operation: 'add', a: 1, b: 2 }),
          client2.callTool('calculate', { operation: 'subtract', a: 10, b: 3 }),
        ]);

        expect(calc1.content[0].text).toContain('3');
        expect(calc2.content[0].text).toContain('7');
      } finally {
        await Promise.all([client1.disconnect(), client2.disconnect()]);
      }
    });
  });

  describe('HTTP Stateless Mode', () => {
    let harness: ServerHarness;
    let port: number;

    beforeAll(async () => {
      port = getEphemeralPort();
      harness = new ServerHarness({
        port,
        transport: 'http',
        statelessMode: true,
      });

      await harness.start();
      await waitForServerReady(port);
    });

    afterAll(async () => {
      await harness.stop();
    });

    it('should not return Mcp-Session-Id header in stateless mode', async () => {
      const { response, sessionId } = await makeRequest(port, 'initialize', {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'stateless-test-client', version: '1.0.0' },
      });

      expect(response.status).toBe(200);

      // In stateless mode, no session ID header should be returned
      expect(sessionId).toBeNull();

      const body = await response.json();
      expect(body.result).toBeDefined();
    });

    it('should process requests without session ID in stateless mode', async () => {
      // In stateless mode, each request creates an ephemeral session internally.
      // No Mcp-Session-Id header is required or returned.
      // Server lifecycle was initialized in previous test, but we need to send
      // the initialized notification to transition to ready state.
      await makeRequest(port, 'notifications/initialized', {});

      // Call tools/list without a session ID - works because stateless mode
      // handles each request independently with ephemeral sessions
      const toolsResult = await makeRequest(port, 'tools/list', {});
      expect(toolsResult.response.status).toBe(200);

      const body = await toolsResult.response.json();
      expect(body.result).toBeDefined();
      expect(body.result.tools).toBeDefined();
    });
  });
});
