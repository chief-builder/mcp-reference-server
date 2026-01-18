/**
 * Cross-Transport Consistency E2E Tests
 *
 * Verifies that both HTTP and stdio transports produce semantically
 * equivalent responses for the same requests. Uses vitest's describe.each
 * for parametrized testing across transports.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { ServerHarness } from '../helpers/server-harness.js';
import {
  createHttpClient,
  createStdioClientSpawned,
  E2EClient,
  InitializeResult,
  ListToolsResult,
  CallToolResult,
} from '../helpers/client-factory.js';
import { waitForServerReady, getEphemeralPort } from '../helpers/assertions.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '../../..');
const CLI_PATH = resolve(PROJECT_ROOT, 'dist/cli.js');

// Default environment for stdio tests
const STDIO_ENV = {
  MCP_TRANSPORT: 'stdio',
  MCP_CURSOR_SECRET: 'e2e-test-cursor-secret-for-e2e-testing-purposes!',
};

/**
 * Transport configuration for parametrized tests.
 */
interface TransportConfig {
  name: string;
  setup: () => Promise<{ client: E2EClient; cleanup: () => Promise<void> }>;
}

/**
 * Create transport configurations for parametrized tests.
 * Each transport returns a setup function that creates a client and cleanup function.
 */
function createTransportConfigs(): TransportConfig[] {
  return [
    {
      name: 'HTTP',
      setup: async () => {
        const port = getEphemeralPort();
        const harness = new ServerHarness({
          port,
          transport: 'http',
        });

        await harness.start();
        await waitForServerReady(port);
        const client = await createHttpClient(port);

        return {
          client,
          cleanup: async () => {
            await client.disconnect();
            await harness.stop();
          },
        };
      },
    },
    {
      name: 'Stdio',
      setup: async () => {
        const client = await createStdioClientSpawned('node', [CLI_PATH], STDIO_ENV);

        return {
          client,
          cleanup: async () => {
            await client.disconnect();
          },
        };
      },
    },
  ];
}

describe('Cross-Transport Consistency E2E Tests', () => {
  /**
   * Compares two initialize results for semantic equivalence.
   * Some fields may differ slightly between transports but core semantics should match.
   */
  function assertInitializeEquivalent(httpResult: InitializeResult, stdioResult: InitializeResult): void {
    // Protocol version must be identical
    expect(httpResult.protocolVersion).toBe(stdioResult.protocolVersion);

    // Server info should be identical
    expect(httpResult.serverInfo.name).toBe(stdioResult.serverInfo.name);
    expect(httpResult.serverInfo.version).toBe(stdioResult.serverInfo.version);

    // Capabilities should have the same keys
    const httpCapKeys = Object.keys(httpResult.capabilities).sort();
    const stdioCapKeys = Object.keys(stdioResult.capabilities).sort();
    expect(httpCapKeys).toEqual(stdioCapKeys);
  }

  /**
   * Compares two tools/list results for semantic equivalence.
   * Tool lists should be identical across transports.
   */
  function assertToolsListEquivalent(httpResult: ListToolsResult, stdioResult: ListToolsResult): void {
    // Both should have the same number of tools
    expect(httpResult.tools.length).toBe(stdioResult.tools.length);

    // Sort tools by name for consistent comparison
    const httpTools = [...httpResult.tools].sort((a, b) => a.name.localeCompare(b.name));
    const stdioTools = [...stdioResult.tools].sort((a, b) => a.name.localeCompare(b.name));

    // Each tool should have identical properties
    for (let i = 0; i < httpTools.length; i++) {
      expect(httpTools[i].name).toBe(stdioTools[i].name);
      expect(httpTools[i].description).toBe(stdioTools[i].description);
      expect(JSON.stringify(httpTools[i].inputSchema)).toBe(JSON.stringify(stdioTools[i].inputSchema));
    }
  }

  /**
   * Compares two tools/call results for semantic equivalence.
   * Results should be identical for the same inputs.
   */
  function assertToolCallEquivalent(httpResult: CallToolResult, stdioResult: CallToolResult): void {
    // Both should have same error state
    expect(httpResult.isError).toBe(stdioResult.isError);

    // Both should have same number of content items
    expect(httpResult.content.length).toBe(stdioResult.content.length);

    // Each content item should match
    for (let i = 0; i < httpResult.content.length; i++) {
      expect(httpResult.content[i].type).toBe(stdioResult.content[i].type);
      expect(httpResult.content[i].text).toBe(stdioResult.content[i].text);
    }
  }

  describe('Initialize Request Consistency', () => {
    it('should produce equivalent initialize responses on both transports', async () => {
      const configs = createTransportConfigs();
      const results: { name: string; result: InitializeResult }[] = [];

      // Initialize both transports
      for (const config of configs) {
        const { client, cleanup } = await config.setup();
        try {
          const result = await client.initialize();
          results.push({ name: config.name, result });
        } finally {
          await cleanup();
        }
      }

      // Verify we got results from both transports
      expect(results.length).toBe(2);

      const httpResult = results.find((r) => r.name === 'HTTP')!.result;
      const stdioResult = results.find((r) => r.name === 'Stdio')!.result;

      // Compare for equivalence
      assertInitializeEquivalent(httpResult, stdioResult);
    });
  });

  describe('Tools/List Request Consistency', () => {
    it('should produce identical tool lists on both transports', async () => {
      const configs = createTransportConfigs();
      const results: { name: string; result: ListToolsResult }[] = [];

      // Get tools list from both transports
      for (const config of configs) {
        const { client, cleanup } = await config.setup();
        try {
          await client.initialize();
          const result = await client.listTools();
          results.push({ name: config.name, result });
        } finally {
          await cleanup();
        }
      }

      // Verify we got results from both transports
      expect(results.length).toBe(2);

      const httpResult = results.find((r) => r.name === 'HTTP')!.result;
      const stdioResult = results.find((r) => r.name === 'Stdio')!.result;

      // Compare for equivalence
      assertToolsListEquivalent(httpResult, stdioResult);
    });
  });

  describe('Tools/Call Request Consistency', () => {
    it('should produce identical results for valid tool call on both transports', async () => {
      const configs = createTransportConfigs();
      const results: { name: string; result: CallToolResult }[] = [];

      // Call the same tool with same args on both transports
      for (const config of configs) {
        const { client, cleanup } = await config.setup();
        try {
          await client.initialize();
          const result = await client.callTool('calculate', {
            operation: 'add',
            a: 42,
            b: 13,
          });
          results.push({ name: config.name, result });
        } finally {
          await cleanup();
        }
      }

      // Verify we got results from both transports
      expect(results.length).toBe(2);

      const httpResult = results.find((r) => r.name === 'HTTP')!.result;
      const stdioResult = results.find((r) => r.name === 'Stdio')!.result;

      // Compare for equivalence
      assertToolCallEquivalent(httpResult, stdioResult);

      // Verify both got the correct answer
      expect(httpResult.content[0].text).toContain('55');
      expect(stdioResult.content[0].text).toContain('55');
    });

    it('should produce identical results for multiply operation on both transports', async () => {
      const configs = createTransportConfigs();
      const results: { name: string; result: CallToolResult }[] = [];

      for (const config of configs) {
        const { client, cleanup } = await config.setup();
        try {
          await client.initialize();
          const result = await client.callTool('calculate', {
            operation: 'multiply',
            a: 7,
            b: 9,
          });
          results.push({ name: config.name, result });
        } finally {
          await cleanup();
        }
      }

      expect(results.length).toBe(2);

      const httpResult = results.find((r) => r.name === 'HTTP')!.result;
      const stdioResult = results.find((r) => r.name === 'Stdio')!.result;

      assertToolCallEquivalent(httpResult, stdioResult);
      expect(httpResult.content[0].text).toContain('63');
      expect(stdioResult.content[0].text).toContain('63');
    });
  });

  describe('Error Response Consistency', () => {
    it('should produce equivalent error for unknown tool on both transports', async () => {
      const configs = createTransportConfigs();
      const results: { name: string; result: CallToolResult }[] = [];

      // Call a non-existent tool on both transports
      for (const config of configs) {
        const { client, cleanup } = await config.setup();
        try {
          await client.initialize();
          const result = await client.callTool('nonexistent_tool_xyz', {});
          results.push({ name: config.name, result });
        } finally {
          await cleanup();
        }
      }

      expect(results.length).toBe(2);

      const httpResult = results.find((r) => r.name === 'HTTP')!.result;
      const stdioResult = results.find((r) => r.name === 'Stdio')!.result;

      // Both should indicate error
      expect(httpResult.isError).toBe(true);
      expect(stdioResult.isError).toBe(true);

      // Both should have error content
      expect(httpResult.content.length).toBeGreaterThan(0);
      expect(stdioResult.content.length).toBeGreaterThan(0);

      // Both should mention the unknown tool name
      expect(httpResult.content[0].text).toContain('nonexistent_tool_xyz');
      expect(stdioResult.content[0].text).toContain('nonexistent_tool_xyz');
    });

    it('should produce equivalent error for invalid tool arguments on both transports', async () => {
      const configs = createTransportConfigs();
      const results: { name: string; result: CallToolResult }[] = [];

      // Call tool with invalid arguments on both transports
      for (const config of configs) {
        const { client, cleanup } = await config.setup();
        try {
          await client.initialize();
          const result = await client.callTool('calculate', {
            operation: 'invalid_op',
            a: 1,
            b: 2,
          });
          results.push({ name: config.name, result });
        } finally {
          await cleanup();
        }
      }

      expect(results.length).toBe(2);

      const httpResult = results.find((r) => r.name === 'HTTP')!.result;
      const stdioResult = results.find((r) => r.name === 'Stdio')!.result;

      // Both should indicate error
      expect(httpResult.isError).toBe(true);
      expect(stdioResult.isError).toBe(true);

      // Both should have error content
      expect(httpResult.content.length).toBeGreaterThan(0);
      expect(stdioResult.content.length).toBeGreaterThan(0);
    });

    it('should produce equivalent error for missing required arguments on both transports', async () => {
      const configs = createTransportConfigs();
      const results: { name: string; result: CallToolResult }[] = [];

      // Call tool with missing required arguments on both transports
      for (const config of configs) {
        const { client, cleanup } = await config.setup();
        try {
          await client.initialize();
          const result = await client.callTool('calculate', {
            operation: 'add',
            // Missing 'a' and 'b'
          });
          results.push({ name: config.name, result });
        } finally {
          await cleanup();
        }
      }

      expect(results.length).toBe(2);

      const httpResult = results.find((r) => r.name === 'HTTP')!.result;
      const stdioResult = results.find((r) => r.name === 'Stdio')!.result;

      // Both should indicate error
      expect(httpResult.isError).toBe(true);
      expect(stdioResult.isError).toBe(true);

      // Both should have error content
      expect(httpResult.content.length).toBeGreaterThan(0);
      expect(stdioResult.content.length).toBeGreaterThan(0);
    });
  });

  describe('Parametrized Transport Tests', () => {
    // Use describe.each to run same tests across both transports
    const transportNames = ['HTTP', 'Stdio'] as const;

    describe.each(transportNames)('%s Transport', (transportName) => {
      let client: E2EClient;
      let cleanup: () => Promise<void>;

      beforeAll(async () => {
        const configs = createTransportConfigs();
        const config = configs.find((c) => c.name === transportName)!;
        const setup = await config.setup();
        client = setup.client;
        cleanup = setup.cleanup;
        await client.initialize();
      });

      afterAll(async () => {
        await cleanup();
      });

      it('should have valid server info after initialization', async () => {
        // Client is already initialized in beforeAll, verify the state
        const sdkClient = client.getClient();
        const serverVersion = sdkClient.getServerVersion();
        const capabilities = sdkClient.getServerCapabilities();

        expect(serverVersion).toBeDefined();
        expect(serverVersion?.name).toBe('mcp-reference-server');
        expect(serverVersion?.version).toBeDefined();
        expect(capabilities).toBeDefined();
      });

      it('should return non-empty tools list', async () => {
        const result = await client.listTools();

        expect(result.tools).toBeDefined();
        expect(Array.isArray(result.tools)).toBe(true);
        expect(result.tools.length).toBeGreaterThan(0);

        // Verify calculate tool exists
        const calculateTool = result.tools.find((t) => t.name === 'calculate');
        expect(calculateTool).toBeDefined();
        expect(calculateTool!.inputSchema).toBeDefined();
      });

      it('should execute tool and return result', async () => {
        const result = await client.callTool('calculate', {
          operation: 'subtract',
          a: 100,
          b: 37,
        });

        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(0);
        expect(result.content[0].text).toContain('63');
        expect(result.isError).not.toBe(true);
      });

      it('should return error for unknown tool', async () => {
        const result = await client.callTool('tool_that_does_not_exist_abc123', {});

        expect(result.isError).toBe(true);
        expect(result.content.length).toBeGreaterThan(0);
        expect(result.content[0].text).toContain('tool_that_does_not_exist_abc123');
      });
    });
  });
});
