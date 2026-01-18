/**
 * E2E Smoke Tests
 *
 * Basic end-to-end tests to verify the server starts, accepts connections,
 * and responds to basic MCP protocol requests.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ServerHarness } from './helpers/server-harness.js';
import { createHttpClient, createStdioClientSpawned } from './helpers/client-factory.js';
import { waitForServerReady, getEphemeralPort } from './helpers/assertions.js';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '../..');

// Default environment for stdio tests
const STDIO_ENV = {
  MCP_TRANSPORT: 'stdio',
  MCP_CURSOR_SECRET: 'e2e-test-cursor-secret-for-e2e-testing-purposes!',
};

describe('E2E Smoke Tests', () => {
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

    it('should start server and accept HTTP connections', async () => {
      expect(harness.isRunning()).toBe(true);
    });

    it('should complete full MCP handshake via HTTP', async () => {
      // Client already initialized in beforeAll
      const serverInfo = client.getClient().getServerVersion();
      expect(serverInfo?.name).toBe('mcp-reference-server');

      const capabilities = client.getClient().getServerCapabilities();
      expect(capabilities).toBeDefined();
    });

    it('should list available tools via HTTP', async () => {
      const result = await client.listTools();

      expect(result.tools).toBeDefined();
      expect(Array.isArray(result.tools)).toBe(true);
      expect(result.tools.length).toBeGreaterThan(0);

      // Verify tool structure
      const tool = result.tools[0];
      expect(tool.name).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
    });

    it('should call calculate tool via HTTP', async () => {
      const result = await client.callTool('calculate', { operation: 'add', a: 2, b: 2 });

      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('4');
    });
  });

  describe('Stdio Transport', () => {
    it('should complete full MCP handshake via stdio', async () => {
      const cliPath = resolve(PROJECT_ROOT, 'dist/cli.js');
      const client = await createStdioClientSpawned('node', [cliPath], STDIO_ENV);

      try {
        const result = await client.initialize();

        expect(result.protocolVersion).toBe('2025-11-25');
        expect(result.serverInfo.name).toBe('mcp-reference-server');
        expect(result.capabilities).toBeDefined();
      } finally {
        await client.disconnect();
      }
    });

    it('should list available tools via stdio', async () => {
      const cliPath = resolve(PROJECT_ROOT, 'dist/cli.js');
      const client = await createStdioClientSpawned('node', [cliPath], STDIO_ENV);

      try {
        await client.initialize();
        const result = await client.listTools();

        expect(result.tools).toBeDefined();
        expect(Array.isArray(result.tools)).toBe(true);
        expect(result.tools.length).toBeGreaterThan(0);
      } finally {
        await client.disconnect();
      }
    });

    it('should call calculate tool via stdio', async () => {
      const cliPath = resolve(PROJECT_ROOT, 'dist/cli.js');
      const client = await createStdioClientSpawned('node', [cliPath], STDIO_ENV);

      try {
        await client.initialize();
        const result = await client.callTool('calculate', { operation: 'add', a: 2, b: 2 });

        expect(result.content).toBeDefined();
        expect(Array.isArray(result.content)).toBe(true);
        expect(result.content.length).toBeGreaterThan(0);
        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toContain('4');
      } finally {
        await client.disconnect();
      }
    });
  });
});
