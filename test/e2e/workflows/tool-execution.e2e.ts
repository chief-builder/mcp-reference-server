/**
 * E2E Tool Execution Workflow Tests
 *
 * Tests for the MCP tool execution workflow including:
 * - tools/list returns array of tool definitions with name, description, inputSchema
 * - tools/call with valid input returns content array
 * - tools/call with invalid arguments returns error
 * - tools/call for unknown tool returns error
 * - Tool validation error handling (SEP-1303 compliant)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ServerHarness } from '../helpers/server-harness.js';
import { createHttpClient, createStdioClientSpawned } from '../helpers/client-factory.js';
import { waitForServerReady, getEphemeralPort } from '../helpers/assertions.js';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '../../..');
const CLI_PATH = resolve(PROJECT_ROOT, 'dist/cli.js');

// Default environment for stdio tests
const STDIO_ENV = {
  MCP_TRANSPORT: 'stdio',
  MCP_CURSOR_SECRET: 'e2e-test-cursor-secret-for-e2e-testing-purposes!',
};

describe('Tool Execution E2E Tests', () => {
  describe('HTTP Transport', () => {
    let harness: ServerHarness;
    let port: number;
    let client: Awaited<ReturnType<typeof createHttpClient>>;

    beforeAll(async () => {
      port = getEphemeralPort();
      harness = new ServerHarness({
        port,
        transport: 'http',
      });

      await harness.start();
      await waitForServerReady(port);

      // Create and initialize a single client for all HTTP tests
      client = await createHttpClient(port);
      await client.initialize();
    });

    afterAll(async () => {
      await client?.disconnect();
      await harness.stop();
    });

    it('should return array of tool definitions with name, description, and inputSchema', async () => {
      const result = await client.listTools();

      // Verify tools is an array
      expect(result.tools).toBeDefined();
      expect(Array.isArray(result.tools)).toBe(true);
      expect(result.tools.length).toBeGreaterThan(0);

      // Verify each tool has required fields
      for (const tool of result.tools) {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
        expect(tool.name.length).toBeGreaterThan(0);

        // Description is optional but should be a string if present
        if (tool.description !== undefined) {
          expect(typeof tool.description).toBe('string');
        }

        // inputSchema is required
        expect(tool.inputSchema).toBeDefined();
        expect(typeof tool.inputSchema).toBe('object');
      }

      // Verify expected tools exist
      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames).toContain('calculate');
    });

    it('should return content array when calling tool with valid input', async () => {
      const result = await client.callTool('calculate', {
        operation: 'add',
        a: 5,
        b: 3,
      });

      // Verify content is an array
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);

      // Verify first content item has expected structure
      const firstContent = result.content[0];
      expect(firstContent.type).toBe('text');
      expect(firstContent.text).toBeDefined();

      // Verify result contains the correct answer
      expect(firstContent.text).toContain('8');

      // Verify no error flag
      expect(result.isError).not.toBe(true);
    });

    it('should return error result when calling tool with invalid arguments (SEP-1303)', async () => {
      // Call calculate tool with missing required arguments
      const result = await client.callTool('calculate', {
        operation: 'add',
        // Missing 'a' and 'b' arguments
      });

      // SEP-1303: Tool validation errors are returned as tool results with isError: true
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.isError).toBe(true);

      // Error message should indicate what went wrong
      const errorText = result.content[0].text;
      expect(errorText).toBeDefined();
      expect(typeof errorText).toBe('string');
    });

    it('should return error result when calling unknown tool (SEP-1303)', async () => {
      const result = await client.callTool('nonexistent_tool_12345', {});

      // SEP-1303: Unknown tool errors are returned as tool results with isError: true
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.isError).toBe(true);

      // Error message should indicate unknown tool
      const errorText = result.content[0].text;
      expect(errorText).toBeDefined();
      expect(errorText).toContain('nonexistent_tool_12345');
    });

    it('should return error result when calling tool with wrong argument types', async () => {
      // Call calculate tool with wrong types
      const result = await client.callTool('calculate', {
        operation: 'add',
        a: 'not a number', // Should be a number
        b: 5,
      });

      // SEP-1303: Validation errors returned as tool results
      expect(result.content).toBeDefined();
      expect(result.isError).toBe(true);
    });

    it('should handle multiple tool operations', async () => {
      // Test add
      const addResult = await client.callTool('calculate', {
        operation: 'add',
        a: 10,
        b: 5,
      });
      expect(addResult.content[0].text).toContain('15');
      expect(addResult.isError).not.toBe(true);

      // Test subtract
      const subtractResult = await client.callTool('calculate', {
        operation: 'subtract',
        a: 10,
        b: 3,
      });
      expect(subtractResult.content[0].text).toContain('7');
      expect(subtractResult.isError).not.toBe(true);

      // Test multiply
      const multiplyResult = await client.callTool('calculate', {
        operation: 'multiply',
        a: 4,
        b: 6,
      });
      expect(multiplyResult.content[0].text).toContain('24');
      expect(multiplyResult.isError).not.toBe(true);

      // Test divide
      const divideResult = await client.callTool('calculate', {
        operation: 'divide',
        a: 20,
        b: 4,
      });
      expect(divideResult.content[0].text).toContain('5');
      expect(divideResult.isError).not.toBe(true);
    });

    it('should return error for division by zero', async () => {
      const result = await client.callTool('calculate', {
        operation: 'divide',
        a: 10,
        b: 0,
      });

      // Division by zero should return an error result
      expect(result.content).toBeDefined();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('zero');
    });
  });

  describe('Stdio Transport', () => {
    it('should return array of tool definitions with name, description, and inputSchema', async () => {
      const client = await createStdioClientSpawned('node', [CLI_PATH], STDIO_ENV);

      try {
        await client.initialize();
        const result = await client.listTools();

        // Verify tools is an array
        expect(result.tools).toBeDefined();
        expect(Array.isArray(result.tools)).toBe(true);
        expect(result.tools.length).toBeGreaterThan(0);

        // Verify each tool has required fields
        for (const tool of result.tools) {
          expect(tool.name).toBeDefined();
          expect(typeof tool.name).toBe('string');
          expect(tool.inputSchema).toBeDefined();
        }
      } finally {
        await client.disconnect();
      }
    });

    it('should return content array when calling tool with valid input', async () => {
      const client = await createStdioClientSpawned('node', [CLI_PATH], STDIO_ENV);

      try {
        await client.initialize();
        const result = await client.callTool('calculate', {
          operation: 'multiply',
          a: 7,
          b: 8,
        });

        // Verify content is an array
        expect(result.content).toBeDefined();
        expect(Array.isArray(result.content)).toBe(true);
        expect(result.content[0].text).toContain('56');
        expect(result.isError).not.toBe(true);
      } finally {
        await client.disconnect();
      }
    });

    it('should return error result when calling unknown tool', async () => {
      const client = await createStdioClientSpawned('node', [CLI_PATH], STDIO_ENV);

      try {
        await client.initialize();
        const result = await client.callTool('this_tool_does_not_exist', {});

        // SEP-1303: Unknown tool errors are returned as tool results
        expect(result.content).toBeDefined();
        expect(result.isError).toBe(true);
      } finally {
        await client.disconnect();
      }
    });

    it('should return error result when calling tool with invalid arguments', async () => {
      const client = await createStdioClientSpawned('node', [CLI_PATH], STDIO_ENV);

      try {
        await client.initialize();
        const result = await client.callTool('calculate', {
          operation: 'invalid_operation',
          a: 1,
          b: 2,
        });

        // SEP-1303: Validation errors returned as tool results
        expect(result.content).toBeDefined();
        expect(result.isError).toBe(true);
      } finally {
        await client.disconnect();
      }
    });
  });

  describe('Protocol Error Handling (via stdio)', () => {
    // Note: These tests use the raw stdio transport to send malformed requests
    // to verify JSON-RPC error code handling at the protocol level.

    it('should return -32602 error when tools/call params are malformed (via stdio)', async () => {
      const { StdioClientTransport } = await import(
        '@modelcontextprotocol/sdk/client/stdio.js'
      );

      const transport = new StdioClientTransport({
        command: 'node',
        args: [CLI_PATH],
        env: STDIO_ENV,
      });

      await transport.start();

      // First, send valid initialize request
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      };

      // Write initialize request
      await new Promise<void>((resolve, reject) => {
        const stdin = (transport as unknown as { _process: { stdin: NodeJS.WriteStream } })._process?.stdin;
        if (!stdin) {
          reject(new Error('No stdin available'));
          return;
        }
        stdin.write(JSON.stringify(initRequest) + '\n', (err: Error | null | undefined) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Read initialize response
      await new Promise<void>((resolve, reject) => {
        const stdout = (transport as unknown as { _process: { stdout: NodeJS.ReadStream } })._process?.stdout;
        if (!stdout) {
          reject(new Error('No stdout available'));
          return;
        }

        let data = '';
        const onData = (chunk: Buffer) => {
          data += chunk.toString();
          const lines = data.split('\n');
          for (const line of lines) {
            if (line.trim()) {
              try {
                JSON.parse(line);
                stdout.removeListener('data', onData);
                resolve();
                return;
              } catch {
                // Not complete JSON yet
              }
            }
          }
        };

        stdout.on('data', onData);
        setTimeout(() => {
          stdout.removeListener('data', onData);
          reject(new Error('Timeout waiting for init response'));
        }, 5000);
      });

      // Send initialized notification
      const initializedNotification = {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      };

      await new Promise<void>((resolve, reject) => {
        const stdin = (transport as unknown as { _process: { stdin: NodeJS.WriteStream } })._process?.stdin;
        if (!stdin) {
          reject(new Error('No stdin available'));
          return;
        }
        stdin.write(JSON.stringify(initializedNotification) + '\n', (err: Error | null | undefined) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Now send malformed tools/call request (missing name)
      const malformedRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          // Missing required 'name' field
          arguments: {},
        },
      };

      await new Promise<void>((resolve, reject) => {
        const stdin = (transport as unknown as { _process: { stdin: NodeJS.WriteStream } })._process?.stdin;
        if (!stdin) {
          reject(new Error('No stdin available'));
          return;
        }
        stdin.write(JSON.stringify(malformedRequest) + '\n', (err: Error | null | undefined) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Read error response
      const errorResponse = await new Promise<string>((resolve, reject) => {
        const stdout = (transport as unknown as { _process: { stdout: NodeJS.ReadStream } })._process?.stdout;
        if (!stdout) {
          reject(new Error('No stdout available'));
          return;
        }

        let data = '';
        const onData = (chunk: Buffer) => {
          data += chunk.toString();
          const lines = data.split('\n');
          for (const line of lines) {
            if (line.trim()) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.id === 2) {
                  stdout.removeListener('data', onData);
                  resolve(line);
                  return;
                }
              } catch {
                // Not complete JSON yet
              }
            }
          }
        };

        stdout.on('data', onData);
        setTimeout(() => {
          stdout.removeListener('data', onData);
          reject(new Error('Timeout waiting for error response'));
        }, 5000);
      });

      const parsed = JSON.parse(errorResponse);

      // Should return JSON-RPC error with -32602 (Invalid Params)
      expect(parsed.error).toBeDefined();
      expect(parsed.error.code).toBe(-32602);
      expect(parsed.error.message).toContain('Invalid params');

      await transport.close();
    });

    it('should return -32601 error for unknown method (via stdio)', async () => {
      const { StdioClientTransport } = await import(
        '@modelcontextprotocol/sdk/client/stdio.js'
      );

      const transport = new StdioClientTransport({
        command: 'node',
        args: [CLI_PATH],
        env: STDIO_ENV,
      });

      await transport.start();

      // First, send valid initialize request
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      };

      await new Promise<void>((resolve, reject) => {
        const stdin = (transport as unknown as { _process: { stdin: NodeJS.WriteStream } })._process?.stdin;
        if (!stdin) {
          reject(new Error('No stdin available'));
          return;
        }
        stdin.write(JSON.stringify(initRequest) + '\n', (err: Error | null | undefined) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Read initialize response
      await new Promise<void>((resolve, reject) => {
        const stdout = (transport as unknown as { _process: { stdout: NodeJS.ReadStream } })._process?.stdout;
        if (!stdout) {
          reject(new Error('No stdout available'));
          return;
        }

        let data = '';
        const onData = (chunk: Buffer) => {
          data += chunk.toString();
          const lines = data.split('\n');
          for (const line of lines) {
            if (line.trim()) {
              try {
                JSON.parse(line);
                stdout.removeListener('data', onData);
                resolve();
                return;
              } catch {
                // Not complete JSON yet
              }
            }
          }
        };

        stdout.on('data', onData);
        setTimeout(() => {
          stdout.removeListener('data', onData);
          reject(new Error('Timeout waiting for init response'));
        }, 5000);
      });

      // Send initialized notification
      const initializedNotification = {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      };

      await new Promise<void>((resolve, reject) => {
        const stdin = (transport as unknown as { _process: { stdin: NodeJS.WriteStream } })._process?.stdin;
        if (!stdin) {
          reject(new Error('No stdin available'));
          return;
        }
        stdin.write(JSON.stringify(initializedNotification) + '\n', (err: Error | null | undefined) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Now send request with unknown method
      const unknownMethodRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'unknown/nonexistent_method',
        params: {},
      };

      await new Promise<void>((resolve, reject) => {
        const stdin = (transport as unknown as { _process: { stdin: NodeJS.WriteStream } })._process?.stdin;
        if (!stdin) {
          reject(new Error('No stdin available'));
          return;
        }
        stdin.write(JSON.stringify(unknownMethodRequest) + '\n', (err: Error | null | undefined) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Read error response
      const errorResponse = await new Promise<string>((resolve, reject) => {
        const stdout = (transport as unknown as { _process: { stdout: NodeJS.ReadStream } })._process?.stdout;
        if (!stdout) {
          reject(new Error('No stdout available'));
          return;
        }

        let data = '';
        const onData = (chunk: Buffer) => {
          data += chunk.toString();
          const lines = data.split('\n');
          for (const line of lines) {
            if (line.trim()) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.id === 2) {
                  stdout.removeListener('data', onData);
                  resolve(line);
                  return;
                }
              } catch {
                // Not complete JSON yet
              }
            }
          }
        };

        stdout.on('data', onData);
        setTimeout(() => {
          stdout.removeListener('data', onData);
          reject(new Error('Timeout waiting for error response'));
        }, 5000);
      });

      const parsed = JSON.parse(errorResponse);

      // Should return JSON-RPC error with -32601 (Method Not Found)
      expect(parsed.error).toBeDefined();
      expect(parsed.error.code).toBe(-32601);

      await transport.close();
    });
  });
});
