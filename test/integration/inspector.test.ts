/**
 * MCP Inspector Compatibility Tests
 *
 * Contract tests that verify the server responses match MCP Inspector expectations.
 * These tests validate:
 * - Protocol version negotiation
 * - Capabilities advertisement
 * - Method compatibility
 * - Error handling per JSON-RPC 2.0 and MCP spec
 * - Message format validation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HttpTransport } from '../../src/transport/http.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { ToolExecutor, handleToolsList, handleToolsCall } from '../../src/tools/executor.js';
import { registerCalculatorTool } from '../../src/tools/calculator.js';
import { registerDiceRollerTool } from '../../src/tools/dice-roller.js';
import { registerFortuneTellerTool, getFortuneCompletions } from '../../src/tools/fortune-teller.js';
import { LoggingHandler } from '../../src/logging/handler.js';
import {
  CompletionHandler,
  registerFortuneTellerCompletions,
} from '../../src/completions/handler.js';
import {
  LifecycleManager,
  PROTOCOL_VERSION,
} from '../../src/protocol/lifecycle.js';
import { getDefaultServerCapabilities } from '../../src/protocol/capabilities.js';
import {
  createRequest,
  createNotification,
  createSuccessResponse,
  createErrorResponse,
  createJsonRpcError,
  JsonRpcErrorCodes,
  JSONRPC_VERSION,
} from '../../src/protocol/jsonrpc.js';

// =============================================================================
// Test Helpers
// =============================================================================

let portCounter = 4500;
function getTestPort(): number {
  return portCounter++;
}

interface TestServer {
  transport: HttpTransport;
  port: number;
  baseUrl: string;
  registry: ToolRegistry;
  executor: ToolExecutor;
  lifecycle: LifecycleManager;
  loggingHandler: LoggingHandler;
  completionHandler: CompletionHandler;
}

async function createTestServer(): Promise<TestServer> {
  const port = getTestPort();
  const registry = new ToolRegistry();
  const executor = new ToolExecutor(registry);
  const loggingHandler = new LoggingHandler({ minLevel: 'info' });
  const completionHandler = new CompletionHandler();

  // Register all tools
  registerCalculatorTool(registry);
  registerDiceRollerTool(registry);
  registerFortuneTellerTool(registry);

  // Register fortune teller completions
  registerFortuneTellerCompletions(completionHandler, getFortuneCompletions);

  const serverCapabilities = getDefaultServerCapabilities();
  const lifecycle = new LifecycleManager({
    name: 'mcp-reference-server',
    version: '1.0.0',
    description: 'MCP 2025-11-25 Reference Implementation',
    capabilities: serverCapabilities,
    instructions: 'This is a reference MCP server for testing.',
  });

  const transport = new HttpTransport({
    port,
    allowedOrigins: ['*'],
    sseKeepAliveInterval: 0,
  });

  // Set up message handler with full MCP method support
  transport.setMessageHandler(async (msg) => {
    const id = 'id' in msg ? msg.id : null;

    // Check pre-initialization state
    const preInitError = lifecycle.checkPreInitialization(msg);
    if (preInitError) {
      return preInitError;
    }

    // Handle initialize
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

    // Handle initialized notification
    if (msg.method === 'notifications/initialized') {
      lifecycle.handleInitialized();
      return null;
    }

    // Handle tools/list
    if (msg.method === 'tools/list') {
      const result = handleToolsList(registry, msg.params as { cursor?: string } | undefined);
      return createSuccessResponse(id, result);
    }

    // Handle tools/call
    if (msg.method === 'tools/call') {
      const params = msg.params as { name: string; arguments?: Record<string, unknown> };
      const result = await handleToolsCall(executor, {
        name: params.name,
        arguments: params.arguments,
      });
      return createSuccessResponse(id, result);
    }

    // Handle logging/setLevel
    if (msg.method === 'logging/setLevel') {
      const result = loggingHandler.handleSetLevel(msg.params);
      return createSuccessResponse(id, result);
    }

    // Handle completion/complete
    if (msg.method === 'completion/complete') {
      const result = await completionHandler.handle(msg.params as never);
      return createSuccessResponse(id, result);
    }

    // Method not found
    return createErrorResponse(
      id,
      createJsonRpcError(
        JsonRpcErrorCodes.METHOD_NOT_FOUND,
        `Method not found: ${msg.method}`,
        { method: msg.method }
      )
    );
  });

  await transport.start();

  return {
    transport,
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    registry,
    executor,
    lifecycle,
    loggingHandler,
    completionHandler,
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

async function initializeServer(server: TestServer): Promise<string> {
  const initResponse = await sendRequest(
    server,
    createRequest(1, 'initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { roots: { listChanged: true } },
      clientInfo: { name: 'mcp-inspector-test', version: '1.0.0' },
    })
  );

  const sessionId = initResponse.headers.get('mcp-session-id')!;

  // Send initialized notification
  await sendRequest(
    server,
    createNotification('notifications/initialized'),
    sessionId
  );

  return sessionId;
}

// =============================================================================
// MCP Inspector Compatibility Tests
// =============================================================================

describe('MCP Inspector Compatibility', () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await createTestServer();
  });

  afterEach(async () => {
    if (server) {
      await server.transport.close().catch(() => {});
    }
  });

  // ===========================================================================
  // Protocol Version Check
  // ===========================================================================

  describe('Protocol Version Check', () => {
    it('should announce correct protocol version (2025-11-25)', async () => {
      const response = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'inspector', version: '1.0.0' },
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      // MCP Inspector expects the server to return the exact protocol version
      expect(body.result.protocolVersion).toBe('2025-11-25');
    });

    it('should handle version negotiation with matching version', async () => {
      const response = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'inspector', version: '1.0.0' },
        })
      );

      const body = await response.json();
      expect(body.error).toBeUndefined();
      expect(body.result.protocolVersion).toBe('2025-11-25');
    });

    it('should reject incompatible protocol versions', async () => {
      const response = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: '2024-01-01',
          capabilities: {},
          clientInfo: { name: 'inspector', version: '1.0.0' },
        })
      );

      const body = await response.json();
      expect(body.error).toBeDefined();
      expect(body.error.message).toContain('Unsupported protocol version');
    });
  });

  // ===========================================================================
  // Capabilities Verification
  // ===========================================================================

  describe('Capabilities Verification', () => {
    it('should advertise tools capability with listChanged', async () => {
      const response = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'inspector', version: '1.0.0' },
        })
      );

      const body = await response.json();
      expect(body.result.capabilities.tools).toBeDefined();
      expect(body.result.capabilities.tools.listChanged).toBe(true);
    });

    it('should advertise logging capability', async () => {
      const response = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'inspector', version: '1.0.0' },
        })
      );

      const body = await response.json();
      // MCP Inspector expects logging capability to be present
      expect(body.result.capabilities.logging).toBeDefined();
    });

    it('should advertise completions capability', async () => {
      const response = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'inspector', version: '1.0.0' },
        })
      );

      const body = await response.json();
      // completions capability enables completion/complete method
      expect(body.result.capabilities.completions).toBeDefined();
    });

    it('should return expected capabilities structure in initialize response', async () => {
      const response = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'inspector', version: '1.0.0' },
        })
      );

      const body = await response.json();

      // Verify overall structure expected by MCP Inspector
      expect(body.result).toHaveProperty('protocolVersion');
      expect(body.result).toHaveProperty('capabilities');
      expect(body.result).toHaveProperty('serverInfo');
      expect(body.result.serverInfo).toHaveProperty('name');
      expect(body.result.serverInfo).toHaveProperty('version');
    });

    it('should return server info with name, version, and description', async () => {
      const response = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'inspector', version: '1.0.0' },
        })
      );

      const body = await response.json();
      expect(body.result.serverInfo.name).toBe('mcp-reference-server');
      expect(body.result.serverInfo.version).toBe('1.0.0');
      expect(body.result.serverInfo.description).toBeDefined();
    });
  });

  // ===========================================================================
  // Method Compatibility
  // ===========================================================================

  describe('Method Compatibility', () => {
    describe('tools/list', () => {
      it('should return valid tool definitions', async () => {
        const sessionId = await initializeServer(server);

        const response = await sendRequest(
          server,
          createRequest(2, 'tools/list'),
          sessionId
        );

        expect(response.status).toBe(200);
        const body = await response.json();

        expect(body.result.tools).toBeDefined();
        expect(Array.isArray(body.result.tools)).toBe(true);
        expect(body.result.tools.length).toBe(3);
      });

      it('should return tools with required MCP Inspector fields', async () => {
        const sessionId = await initializeServer(server);

        const response = await sendRequest(
          server,
          createRequest(2, 'tools/list'),
          sessionId
        );

        const body = await response.json();

        // Each tool must have name, description, and inputSchema
        for (const tool of body.result.tools) {
          expect(tool.name).toBeDefined();
          expect(typeof tool.name).toBe('string');
          expect(tool.description).toBeDefined();
          expect(typeof tool.description).toBe('string');
          expect(tool.inputSchema).toBeDefined();
          expect(typeof tool.inputSchema).toBe('object');
        }
      });

      it('should return tools with valid inputSchema structure', async () => {
        const sessionId = await initializeServer(server);

        const response = await sendRequest(
          server,
          createRequest(2, 'tools/list'),
          sessionId
        );

        const body = await response.json();

        // MCP Inspector expects JSON Schema compliant inputSchema
        for (const tool of body.result.tools) {
          expect(tool.inputSchema.type).toBe('object');
          expect(tool.inputSchema.properties).toBeDefined();
        }
      });

      it('should return tools with optional annotations', async () => {
        const sessionId = await initializeServer(server);

        const response = await sendRequest(
          server,
          createRequest(2, 'tools/list'),
          sessionId
        );

        const body = await response.json();

        // Calculator has annotations
        const calculator = body.result.tools.find(
          (t: { name: string }) => t.name === 'calculate'
        );
        expect(calculator.annotations).toBeDefined();
        expect(calculator.annotations.readOnlyHint).toBe(true);
      });
    });

    describe('tools/call', () => {
      it('should execute tool and return proper result format', async () => {
        const sessionId = await initializeServer(server);

        const response = await sendRequest(
          server,
          createRequest(3, 'tools/call', {
            name: 'calculate',
            arguments: { operation: 'add', a: 2, b: 3 },
          }),
          sessionId
        );

        expect(response.status).toBe(200);
        const body = await response.json();

        // MCP Inspector expects content array in result
        expect(body.result.content).toBeDefined();
        expect(Array.isArray(body.result.content)).toBe(true);
        expect(body.result.content.length).toBeGreaterThan(0);
      });

      it('should return text content with proper structure', async () => {
        const sessionId = await initializeServer(server);

        const response = await sendRequest(
          server,
          createRequest(3, 'tools/call', {
            name: 'calculate',
            arguments: { operation: 'multiply', a: 4, b: 5 },
          }),
          sessionId
        );

        const body = await response.json();

        // Content items must have type field
        const content = body.result.content[0];
        expect(content.type).toBe('text');
        expect(content.text).toBeDefined();
        expect(typeof content.text).toBe('string');

        // Parse the JSON result
        const result = JSON.parse(content.text);
        expect(result.result).toBe(20);
      });

      it('should return isError: true for tool validation errors (SEP-1303)', async () => {
        const sessionId = await initializeServer(server);

        const response = await sendRequest(
          server,
          createRequest(3, 'tools/call', {
            name: 'calculate',
            arguments: { operation: 'add' }, // Missing required a and b
          }),
          sessionId
        );

        const body = await response.json();

        // SEP-1303: Tool errors return isError: true, not JSON-RPC error
        expect(body.result).toBeDefined();
        expect(body.result.isError).toBe(true);
        expect(body.result.content).toBeDefined();
      });

      it('should return isError: true for tool execution errors (SEP-1303)', async () => {
        const sessionId = await initializeServer(server);

        // Division by zero
        const response = await sendRequest(
          server,
          createRequest(3, 'tools/call', {
            name: 'calculate',
            arguments: { operation: 'divide', a: 10, b: 0 },
          }),
          sessionId
        );

        const body = await response.json();

        // SEP-1303: Execution errors return isError: true
        expect(body.result.isError).toBe(true);
        expect(body.result.content[0].text).toContain('Division by zero');
      });

      it('should return isError: true for unknown tool (SEP-1303)', async () => {
        const sessionId = await initializeServer(server);

        const response = await sendRequest(
          server,
          createRequest(3, 'tools/call', {
            name: 'nonexistent_tool',
            arguments: {},
          }),
          sessionId
        );

        const body = await response.json();

        // SEP-1303: Unknown tool returns isError: true
        expect(body.result.isError).toBe(true);
        expect(body.result.content[0].text).toContain('Unknown tool');
      });
    });

    describe('logging/setLevel', () => {
      it('should accept valid log level and return empty object', async () => {
        const sessionId = await initializeServer(server);

        const response = await sendRequest(
          server,
          createRequest(3, 'logging/setLevel', { level: 'debug' }),
          sessionId
        );

        expect(response.status).toBe(200);
        const body = await response.json();

        // MCP Inspector expects empty object result
        expect(body.result).toBeDefined();
        expect(body.error).toBeUndefined();
      });

      it('should accept all RFC 5424 log levels', async () => {
        const sessionId = await initializeServer(server);
        const levels = [
          'debug',
          'info',
          'notice',
          'warning',
          'error',
          'critical',
          'alert',
          'emergency',
        ];

        for (const level of levels) {
          const response = await sendRequest(
            server,
            createRequest(100, 'logging/setLevel', { level }),
            sessionId
          );

          const body = await response.json();
          expect(body.error).toBeUndefined();
        }
      });
    });

    describe('completion/complete', () => {
      it('should return valid suggestions for fortune teller category', async () => {
        const sessionId = await initializeServer(server);

        const response = await sendRequest(
          server,
          createRequest(3, 'completion/complete', {
            ref: { type: 'ref/tool', name: 'tell_fortune' },
            argument: { name: 'category', value: '' },
          }),
          sessionId
        );

        expect(response.status).toBe(200);
        const body = await response.json();

        expect(body.result.completion).toBeDefined();
        expect(body.result.completion.values).toBeDefined();
        expect(Array.isArray(body.result.completion.values)).toBe(true);
        expect(body.result.completion.values).toContain('love');
        expect(body.result.completion.values).toContain('career');
        expect(body.result.completion.values).toContain('health');
      });

      it('should filter suggestions by prefix', async () => {
        const sessionId = await initializeServer(server);

        const response = await sendRequest(
          server,
          createRequest(3, 'completion/complete', {
            ref: { type: 'ref/tool', name: 'tell_fortune' },
            argument: { name: 'category', value: 'l' },
          }),
          sessionId
        );

        const body = await response.json();

        // Should only return 'love' which starts with 'l'
        expect(body.result.completion.values).toContain('love');
        expect(body.result.completion.values).not.toContain('career');
      });

      it('should return valid suggestions for fortune teller mood', async () => {
        const sessionId = await initializeServer(server);

        const response = await sendRequest(
          server,
          createRequest(3, 'completion/complete', {
            ref: { type: 'ref/tool', name: 'tell_fortune' },
            argument: { name: 'mood', value: '' },
          }),
          sessionId
        );

        const body = await response.json();

        expect(body.result.completion.values).toContain('optimistic');
        expect(body.result.completion.values).toContain('mysterious');
        expect(body.result.completion.values).toContain('cautious');
      });

      it('should return empty values for unknown tool', async () => {
        const sessionId = await initializeServer(server);

        const response = await sendRequest(
          server,
          createRequest(3, 'completion/complete', {
            ref: { type: 'ref/tool', name: 'unknown_tool' },
            argument: { name: 'arg', value: '' },
          }),
          sessionId
        );

        const body = await response.json();

        // Should return empty completion for unknown tool
        expect(body.result.completion).toBeDefined();
        expect(body.result.completion.values).toEqual([]);
      });
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe('Error Handling', () => {
    it('should return -32601 for method not found', async () => {
      const sessionId = await initializeServer(server);

      const response = await sendRequest(
        server,
        createRequest(3, 'unknown/method'),
        sessionId
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.error).toBeDefined();
      expect(body.error.code).toBe(-32601);
      expect(body.error.message).toContain('Method not found');
    });

    it('should return -32602 for invalid params on initialize', async () => {
      const response = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          // Missing required protocolVersion
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        })
      );

      const body = await response.json();

      expect(body.error).toBeDefined();
      expect(body.error.code).toBe(-32602); // INVALID_PARAMS
    });

    it('should include method in error data for method not found', async () => {
      const sessionId = await initializeServer(server);

      const response = await sendRequest(
        server,
        createRequest(3, 'resources/list'),
        sessionId
      );

      const body = await response.json();

      expect(body.error.data).toBeDefined();
      expect(body.error.data.method).toBe('resources/list');
    });

    it('should return -32600 for requests before initialization', async () => {
      const session = server.transport.getSessionManager().createSession();

      const response = await sendRequest(
        server,
        createRequest(1, 'tools/list'),
        session.id
      );

      const body = await response.json();

      expect(body.error).toBeDefined();
      expect(body.error.code).toBe(-32600); // INVALID_REQUEST
      expect(body.error.message).toContain('not initialized');
    });
  });

  // ===========================================================================
  // Message Format Validation
  // ===========================================================================

  describe('Message Format Validation', () => {
    it('should always include jsonrpc: "2.0" in responses', async () => {
      const response = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        })
      );

      const body = await response.json();
      expect(body.jsonrpc).toBe('2.0');
    });

    it('should echo request ID correctly in success response', async () => {
      const requestId = 'unique-test-id-12345';

      const response = await sendRequest(
        server,
        createRequest(requestId, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        })
      );

      const body = await response.json();
      expect(body.id).toBe(requestId);
    });

    it('should echo numeric request ID correctly', async () => {
      const requestId = 42;

      const response = await sendRequest(
        server,
        createRequest(requestId, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        })
      );

      const body = await response.json();
      expect(body.id).toBe(requestId);
    });

    it('should echo request ID correctly in error response', async () => {
      const sessionId = await initializeServer(server);
      const requestId = 'error-test-id';

      const response = await sendRequest(
        server,
        createRequest(requestId, 'unknown/method'),
        sessionId
      );

      const body = await response.json();
      expect(body.id).toBe(requestId);
    });

    it('should return 202 status for notifications', async () => {
      const initResponse = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        })
      );

      const sessionId = initResponse.headers.get('mcp-session-id')!;

      // Send notification (no id field)
      const notificationResponse = await sendRequest(
        server,
        createNotification('notifications/initialized'),
        sessionId
      );

      // Notifications return 202 Accepted
      expect(notificationResponse.status).toBe(202);
    });

    it('should have result OR error but not both in response', async () => {
      // Test success response
      const successResponse = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        })
      );

      const successBody = await successResponse.json();
      expect(successBody.result).toBeDefined();
      expect(successBody.error).toBeUndefined();

      // Test error response
      const sessionId = successResponse.headers.get('mcp-session-id')!;
      await sendRequest(
        server,
        createNotification('notifications/initialized'),
        sessionId
      );

      const errorResponse = await sendRequest(
        server,
        createRequest(2, 'unknown/method'),
        sessionId
      );

      const errorBody = await errorResponse.json();
      expect(errorBody.error).toBeDefined();
      expect(errorBody.result).toBeUndefined();
    });

    it('should return proper error structure with code and message', async () => {
      const sessionId = await initializeServer(server);

      const response = await sendRequest(
        server,
        createRequest(1, 'nonexistent/method'),
        sessionId
      );

      const body = await response.json();

      expect(body.error).toBeDefined();
      expect(typeof body.error.code).toBe('number');
      expect(typeof body.error.message).toBe('string');
    });
  });

  // ===========================================================================
  // Complete Inspector Workflow
  // ===========================================================================

  describe('Complete Inspector Workflow', () => {
    it('should complete typical MCP Inspector session', async () => {
      // Step 1: Initialize
      const initResponse = await sendRequest(
        server,
        createRequest(1, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { roots: { listChanged: true } },
          clientInfo: { name: 'MCP Inspector', version: '1.0.0' },
        })
      );

      expect(initResponse.status).toBe(200);
      const initBody = await initResponse.json();
      expect(initBody.jsonrpc).toBe('2.0');
      expect(initBody.id).toBe(1);
      expect(initBody.result.protocolVersion).toBe('2025-11-25');

      const sessionId = initResponse.headers.get('mcp-session-id')!;

      // Step 2: Send initialized notification
      const initializedResponse = await sendRequest(
        server,
        createNotification('notifications/initialized'),
        sessionId
      );
      expect(initializedResponse.status).toBe(202);

      // Step 3: List tools
      const toolsResponse = await sendRequest(
        server,
        createRequest(2, 'tools/list'),
        sessionId
      );
      const toolsBody = await toolsResponse.json();
      expect(toolsBody.jsonrpc).toBe('2.0');
      expect(toolsBody.id).toBe(2);
      expect(toolsBody.result.tools.length).toBe(3);

      // Step 4: Call a tool
      const callResponse = await sendRequest(
        server,
        createRequest(3, 'tools/call', {
          name: 'calculate',
          arguments: { operation: 'add', a: 10, b: 20 },
        }),
        sessionId
      );
      const callBody = await callResponse.json();
      expect(callBody.jsonrpc).toBe('2.0');
      expect(callBody.id).toBe(3);
      expect(callBody.result.content).toBeDefined();
      expect(callBody.result.isError).toBeUndefined();

      const calcResult = JSON.parse(callBody.result.content[0].text);
      expect(calcResult.result).toBe(30);

      // Step 5: Set log level
      const logResponse = await sendRequest(
        server,
        createRequest(4, 'logging/setLevel', { level: 'debug' }),
        sessionId
      );
      const logBody = await logResponse.json();
      expect(logBody.jsonrpc).toBe('2.0');
      expect(logBody.id).toBe(4);
      expect(logBody.error).toBeUndefined();

      // Step 6: Get completions
      const completionResponse = await sendRequest(
        server,
        createRequest(5, 'completion/complete', {
          ref: { type: 'ref/tool', name: 'tell_fortune' },
          argument: { name: 'category', value: 'c' },
        }),
        sessionId
      );
      const completionBody = await completionResponse.json();
      expect(completionBody.jsonrpc).toBe('2.0');
      expect(completionBody.id).toBe(5);
      expect(completionBody.result.completion.values).toContain('career');

      // Step 7: Call tool with error (for SEP-1303 validation)
      const errorCallResponse = await sendRequest(
        server,
        createRequest(6, 'tools/call', {
          name: 'calculate',
          arguments: { operation: 'divide', a: 1, b: 0 },
        }),
        sessionId
      );
      const errorCallBody = await errorCallResponse.json();
      expect(errorCallBody.jsonrpc).toBe('2.0');
      expect(errorCallBody.id).toBe(6);
      expect(errorCallBody.result.isError).toBe(true); // SEP-1303
    });
  });
});
