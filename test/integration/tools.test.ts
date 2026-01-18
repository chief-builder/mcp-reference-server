/**
 * Tool Execution E2E Tests
 *
 * Tests full tool execution flow including:
 * - Calculator: full request/response with results
 * - Dice Roller: verify randomness in results
 * - Fortune Teller: category filtering
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HttpTransport } from '../../src/transport/http.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { ToolExecutor, handleToolsList, handleToolsCall } from '../../src/tools/executor.js';
import { registerCalculatorTool } from '../../src/tools/calculator.js';
import { registerDiceRollerTool } from '../../src/tools/dice-roller.js';
import { registerFortuneTellerTool } from '../../src/tools/fortune-teller.js';
import { createRequest, createSuccessResponse, JsonRpcRequest } from '../../src/protocol/jsonrpc.js';
import { PROTOCOL_VERSION } from '../../src/protocol/lifecycle.js';
import { getTestPort } from '../helpers/ports.js';

// =============================================================================
// Test Helpers
// =============================================================================

interface TestServer {
  transport: HttpTransport;
  port: number;
  baseUrl: string;
  registry: ToolRegistry;
  executor: ToolExecutor;
}

async function createTestServer(): Promise<TestServer> {
  const port = getTestPort();
  const registry = new ToolRegistry();
  const executor = new ToolExecutor(registry);

  // Register all tools
  registerCalculatorTool(registry);
  registerDiceRollerTool(registry);
  registerFortuneTellerTool(registry);

  const transport = new HttpTransport({
    port,
    allowedOrigins: ['*'],
    sseKeepAliveInterval: 0,
  });

  // Set up message handler for tool operations
  transport.setMessageHandler(async (msg) => {
    const id = 'id' in msg ? msg.id : null;

    if (msg.method === 'initialize') {
      return createSuccessResponse(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: true } },
        serverInfo: { name: 'tool-test-server', version: '1.0.0' },
      });
    }

    if (msg.method === 'tools/list') {
      const result = handleToolsList(registry, msg.params as { cursor?: string } | undefined);
      return createSuccessResponse(id, result);
    }

    if (msg.method === 'tools/call') {
      const params = msg.params as { name: string; arguments?: Record<string, unknown> };
      const result = await handleToolsCall(executor, {
        name: params.name,
        arguments: params.arguments,
      });
      return createSuccessResponse(id, result);
    }

    return null;
  });

  await transport.start();

  return {
    transport,
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    registry,
    executor,
  };
}

async function sendRequest(
  server: TestServer,
  sessionId: string,
  body: unknown
): Promise<Response> {
  return fetch(`${server.baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': PROTOCOL_VERSION,
      'MCP-Session-Id': sessionId,
    },
    body: JSON.stringify(body),
  });
}

// =============================================================================
// Integration Tests
// =============================================================================

describe('Tool Execution E2E', () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await createTestServer();
  });

  afterEach(async () => {
    if (server) {
      await server.transport.close().catch(() => {});
    }
  });

  describe('Tool Discovery', () => {
    it('should list all registered tools', async () => {
      const session = server.transport.getSessionManager().createSession();

      const response = await sendRequest(
        server,
        session.id,
        createRequest(1, 'tools/list')
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.result.tools).toHaveLength(3);

      const toolNames = body.result.tools.map((t: { name: string }) => t.name);
      expect(toolNames).toContain('calculate');
      expect(toolNames).toContain('roll_dice');
      expect(toolNames).toContain('tell_fortune');
    });

    it('should return tool metadata including annotations', async () => {
      const session = server.transport.getSessionManager().createSession();

      const response = await sendRequest(
        server,
        session.id,
        createRequest(1, 'tools/list')
      );

      const body = await response.json();
      const calculator = body.result.tools.find((t: { name: string }) => t.name === 'calculate');

      expect(calculator).toBeDefined();
      expect(calculator.description).toContain('arithmetic');
      expect(calculator.inputSchema).toBeDefined();
      expect(calculator.inputSchema.properties).toBeDefined();
      expect(calculator.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    });
  });

  describe('Calculator Tool', () => {
    it('should perform addition correctly', async () => {
      const session = server.transport.getSessionManager().createSession();

      const response = await sendRequest(
        server,
        session.id,
        createRequest(1, 'tools/call', {
          name: 'calculate',
          arguments: { operation: 'add', a: 5, b: 3 },
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.result.isError).toBeUndefined();
      expect(body.result.content).toHaveLength(1);

      const content = body.result.content[0];
      expect(content.type).toBe('text');

      const result = JSON.parse(content.text);
      expect(result.result).toBe(8);
      expect(result.expression).toBe('5 + 3 = 8');
    });

    it('should perform subtraction correctly', async () => {
      const session = server.transport.getSessionManager().createSession();

      const response = await sendRequest(
        server,
        session.id,
        createRequest(1, 'tools/call', {
          name: 'calculate',
          arguments: { operation: 'subtract', a: 10, b: 4 },
        })
      );

      const body = await response.json();
      const result = JSON.parse(body.result.content[0].text);
      expect(result.result).toBe(6);
      expect(result.expression).toBe('10 - 4 = 6');
    });

    it('should perform multiplication correctly', async () => {
      const session = server.transport.getSessionManager().createSession();

      const response = await sendRequest(
        server,
        session.id,
        createRequest(1, 'tools/call', {
          name: 'calculate',
          arguments: { operation: 'multiply', a: 6, b: 7 },
        })
      );

      const body = await response.json();
      const result = JSON.parse(body.result.content[0].text);
      expect(result.result).toBe(42);
    });

    it('should perform division correctly', async () => {
      const session = server.transport.getSessionManager().createSession();

      const response = await sendRequest(
        server,
        session.id,
        createRequest(1, 'tools/call', {
          name: 'calculate',
          arguments: { operation: 'divide', a: 20, b: 4 },
        })
      );

      const body = await response.json();
      const result = JSON.parse(body.result.content[0].text);
      expect(result.result).toBe(5);
    });

    it('should handle division by zero with error result', async () => {
      const session = server.transport.getSessionManager().createSession();

      const response = await sendRequest(
        server,
        session.id,
        createRequest(1, 'tools/call', {
          name: 'calculate',
          arguments: { operation: 'divide', a: 10, b: 0 },
        })
      );

      const body = await response.json();
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toContain('Division by zero');
    });

    it('should handle decimal numbers', async () => {
      const session = server.transport.getSessionManager().createSession();

      const response = await sendRequest(
        server,
        session.id,
        createRequest(1, 'tools/call', {
          name: 'calculate',
          arguments: { operation: 'multiply', a: 2.5, b: 4 },
        })
      );

      const body = await response.json();
      const result = JSON.parse(body.result.content[0].text);
      expect(result.result).toBe(10);
    });

    it('should handle negative numbers', async () => {
      const session = server.transport.getSessionManager().createSession();

      const response = await sendRequest(
        server,
        session.id,
        createRequest(1, 'tools/call', {
          name: 'calculate',
          arguments: { operation: 'add', a: -5, b: 3 },
        })
      );

      const body = await response.json();
      const result = JSON.parse(body.result.content[0].text);
      expect(result.result).toBe(-2);
    });

    it('should reject invalid operation', async () => {
      const session = server.transport.getSessionManager().createSession();

      const response = await sendRequest(
        server,
        session.id,
        createRequest(1, 'tools/call', {
          name: 'calculate',
          arguments: { operation: 'modulo', a: 10, b: 3 },
        })
      );

      const body = await response.json();
      expect(body.result.isError).toBe(true);
    });
  });

  describe('Dice Roller Tool', () => {
    it('should roll dice and return results', async () => {
      const session = server.transport.getSessionManager().createSession();

      const response = await sendRequest(
        server,
        session.id,
        createRequest(1, 'tools/call', {
          name: 'roll_dice',
          arguments: { notation: '2d6' },
        })
      );

      const body = await response.json();
      expect(body.result.isError).toBeUndefined();

      const result = JSON.parse(body.result.content[0].text);
      expect(result.notation).toBe('2d6');
      expect(result.rolls).toHaveLength(2);
      expect(result.modifier).toBe(0);

      // Each roll should be between 1 and 6
      for (const roll of result.rolls) {
        expect(roll).toBeGreaterThanOrEqual(1);
        expect(roll).toBeLessThanOrEqual(6);
      }

      // Total should match sum of rolls
      const sum = result.rolls.reduce((a: number, b: number) => a + b, 0);
      expect(result.total).toBe(sum);
    });

    it('should handle dice notation with modifiers', async () => {
      const session = server.transport.getSessionManager().createSession();

      // Test positive modifier
      const response1 = await sendRequest(
        server,
        session.id,
        createRequest(1, 'tools/call', {
          name: 'roll_dice',
          arguments: { notation: '1d20+5' },
        })
      );

      const body1 = await response1.json();
      const result1 = JSON.parse(body1.result.content[0].text);
      expect(result1.modifier).toBe(5);
      expect(result1.total).toBe(result1.rolls[0] + 5);

      // Test negative modifier
      const response2 = await sendRequest(
        server,
        session.id,
        createRequest(2, 'tools/call', {
          name: 'roll_dice',
          arguments: { notation: '1d20-3' },
        })
      );

      const body2 = await response2.json();
      const result2 = JSON.parse(body2.result.content[0].text);
      expect(result2.modifier).toBe(-3);
      expect(result2.total).toBe(result2.rolls[0] - 3);
    });

    it('should verify randomness across multiple rolls', async () => {
      const session = server.transport.getSessionManager().createSession();
      const results: number[] = [];

      // Roll d20 multiple times
      for (let i = 0; i < 20; i++) {
        const response = await sendRequest(
          server,
          session.id,
          createRequest(i, 'tools/call', {
            name: 'roll_dice',
            arguments: { notation: 'd20' },
          })
        );

        const body = await response.json();
        const result = JSON.parse(body.result.content[0].text);
        results.push(result.total);
      }

      // Check that results have some variance (not all the same)
      const uniqueResults = new Set(results);
      expect(uniqueResults.size).toBeGreaterThan(1);

      // Check all results are within valid range
      for (const r of results) {
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(20);
      }
    });

    it('should support various die types', async () => {
      const session = server.transport.getSessionManager().createSession();
      const dieTypes = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

      for (const die of dieTypes) {
        const response = await sendRequest(
          server,
          session.id,
          createRequest(1, 'tools/call', {
            name: 'roll_dice',
            arguments: { notation: die },
          })
        );

        const body = await response.json();
        expect(body.result.isError).toBeUndefined();

        const result = JSON.parse(body.result.content[0].text);
        const sides = parseInt(die.substring(1), 10);
        expect(result.rolls[0]).toBeGreaterThanOrEqual(1);
        expect(result.rolls[0]).toBeLessThanOrEqual(sides);
      }
    });

    it('should handle invalid dice notation', async () => {
      const session = server.transport.getSessionManager().createSession();

      // Invalid die type
      const response1 = await sendRequest(
        server,
        session.id,
        createRequest(1, 'tools/call', {
          name: 'roll_dice',
          arguments: { notation: 'd7' },
        })
      );

      const body1 = await response1.json();
      expect(body1.result.isError).toBe(true);

      // Invalid notation format
      const response2 = await sendRequest(
        server,
        session.id,
        createRequest(2, 'tools/call', {
          name: 'roll_dice',
          arguments: { notation: 'roll 2 dice' },
        })
      );

      const body2 = await response2.json();
      expect(body2.result.isError).toBe(true);
    });

    it('should handle multiple dice', async () => {
      const session = server.transport.getSessionManager().createSession();

      const response = await sendRequest(
        server,
        session.id,
        createRequest(1, 'tools/call', {
          name: 'roll_dice',
          arguments: { notation: '4d6' },
        })
      );

      const body = await response.json();
      const result = JSON.parse(body.result.content[0].text);

      expect(result.rolls).toHaveLength(4);
      for (const roll of result.rolls) {
        expect(roll).toBeGreaterThanOrEqual(1);
        expect(roll).toBeLessThanOrEqual(6);
      }
    });
  });

  describe('Fortune Teller Tool', () => {
    it('should return fortune for specified category', async () => {
      const session = server.transport.getSessionManager().createSession();
      const categories = ['love', 'career', 'health', 'wealth', 'general'];

      for (const category of categories) {
        const response = await sendRequest(
          server,
          session.id,
          createRequest(1, 'tools/call', {
            name: 'tell_fortune',
            arguments: { category },
          })
        );

        const body = await response.json();
        expect(body.result.isError).toBeUndefined();

        const result = JSON.parse(body.result.content[0].text);
        expect(result.category).toBe(category);
        expect(result.fortune).toBeTruthy();
        expect(typeof result.fortune).toBe('string');
        expect(result.fortune.length).toBeGreaterThan(10);
      }
    });

    it('should respect mood parameter', async () => {
      const session = server.transport.getSessionManager().createSession();
      const moods = ['optimistic', 'mysterious', 'cautious'];

      for (const mood of moods) {
        const response = await sendRequest(
          server,
          session.id,
          createRequest(1, 'tools/call', {
            name: 'tell_fortune',
            arguments: { category: 'general', mood },
          })
        );

        const body = await response.json();
        expect(body.result.isError).toBeUndefined();

        const result = JSON.parse(body.result.content[0].text);
        expect(result.mood).toBe(mood);
      }
    });

    it('should use default mood when not specified', async () => {
      const session = server.transport.getSessionManager().createSession();

      const response = await sendRequest(
        server,
        session.id,
        createRequest(1, 'tools/call', {
          name: 'tell_fortune',
          arguments: { category: 'love' },
        })
      );

      const body = await response.json();
      const result = JSON.parse(body.result.content[0].text);

      // Default mood should be 'mysterious'
      expect(result.mood).toBe('mysterious');
    });

    it('should return varied fortunes', async () => {
      const session = server.transport.getSessionManager().createSession();
      const fortunes: string[] = [];

      // Get multiple fortunes
      for (let i = 0; i < 10; i++) {
        const response = await sendRequest(
          server,
          session.id,
          createRequest(i, 'tools/call', {
            name: 'tell_fortune',
            arguments: { category: 'career', mood: 'optimistic' },
          })
        );

        const body = await response.json();
        const result = JSON.parse(body.result.content[0].text);
        fortunes.push(result.fortune);
      }

      // There should be some variety (not all the same fortune)
      const uniqueFortunes = new Set(fortunes);
      // With 5 fortunes per category/mood, we should see variety in 10 tries
      expect(uniqueFortunes.size).toBeGreaterThan(1);
    });

    it('should reject invalid category', async () => {
      const session = server.transport.getSessionManager().createSession();

      const response = await sendRequest(
        server,
        session.id,
        createRequest(1, 'tools/call', {
          name: 'tell_fortune',
          arguments: { category: 'invalid_category' },
        })
      );

      const body = await response.json();
      expect(body.result.isError).toBe(true);
      // Validation happens at schema level - check for validation error
      expect(body.result.content[0].text).toContain('validationErrors');
      expect(body.result.content[0].text).toContain('category');
    });

    it('should reject invalid mood', async () => {
      const session = server.transport.getSessionManager().createSession();

      const response = await sendRequest(
        server,
        session.id,
        createRequest(1, 'tools/call', {
          name: 'tell_fortune',
          arguments: { category: 'love', mood: 'angry' },
        })
      );

      const body = await response.json();
      expect(body.result.isError).toBe(true);
      // Validation happens at schema level - check for validation error
      expect(body.result.content[0].text).toContain('validationErrors');
      expect(body.result.content[0].text).toContain('mood');
    });
  });

  describe('Tool Error Handling', () => {
    it('should return error for unknown tool', async () => {
      const session = server.transport.getSessionManager().createSession();

      const response = await sendRequest(
        server,
        session.id,
        createRequest(1, 'tools/call', {
          name: 'nonexistent_tool',
          arguments: {},
        })
      );

      const body = await response.json();
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toContain('Unknown tool');
    });

    it('should return error for invalid arguments', async () => {
      const session = server.transport.getSessionManager().createSession();

      const response = await sendRequest(
        server,
        session.id,
        createRequest(1, 'tools/call', {
          name: 'calculate',
          arguments: { operation: 'add' }, // Missing a and b
        })
      );

      const body = await response.json();
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toContain('Invalid arguments');
    });

    it('should handle missing arguments gracefully', async () => {
      const session = server.transport.getSessionManager().createSession();

      const response = await sendRequest(
        server,
        session.id,
        createRequest(1, 'tools/call', {
          name: 'roll_dice',
          arguments: {}, // Missing notation
        })
      );

      const body = await response.json();
      expect(body.result.isError).toBe(true);
    });
  });

  describe('Full Tool Workflow', () => {
    it('should complete initialize -> list -> call flow', async () => {
      // Create fresh connection without existing session
      const initResponse = await fetch(`${server.baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': PROTOCOL_VERSION,
        },
        body: JSON.stringify(
          createRequest(1, 'initialize', {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
          })
        ),
      });

      expect(initResponse.status).toBe(200);
      const sessionId = initResponse.headers.get('mcp-session-id')!;

      // List tools
      const listResponse = await sendRequest(
        server,
        sessionId,
        createRequest(2, 'tools/list')
      );
      const listBody = await listResponse.json();
      expect(listBody.result.tools.length).toBe(3);

      // Call calculator
      const calcResponse = await sendRequest(
        server,
        sessionId,
        createRequest(3, 'tools/call', {
          name: 'calculate',
          arguments: { operation: 'multiply', a: 6, b: 9 },
        })
      );
      const calcBody = await calcResponse.json();
      const calcResult = JSON.parse(calcBody.result.content[0].text);
      expect(calcResult.result).toBe(54);

      // Call dice roller
      const diceResponse = await sendRequest(
        server,
        sessionId,
        createRequest(4, 'tools/call', {
          name: 'roll_dice',
          arguments: { notation: '3d6+2' },
        })
      );
      const diceBody = await diceResponse.json();
      const diceResult = JSON.parse(diceBody.result.content[0].text);
      expect(diceResult.rolls).toHaveLength(3);

      // Call fortune teller
      const fortuneResponse = await sendRequest(
        server,
        sessionId,
        createRequest(5, 'tools/call', {
          name: 'tell_fortune',
          arguments: { category: 'wealth', mood: 'optimistic' },
        })
      );
      const fortuneBody = await fortuneResponse.json();
      const fortuneResult = JSON.parse(fortuneBody.result.content[0].text);
      expect(fortuneResult.category).toBe('wealth');
      expect(fortuneResult.mood).toBe('optimistic');
    });
  });
});
