/**
 * MCP Client Factory for E2E Tests
 *
 * Creates MCP clients for HTTP and stdio transports.
 * Uses @modelcontextprotocol/sdk Client for protocol handling.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface E2EClient {
  /** Initialize connection to server */
  initialize(): Promise<InitializeResult>;
  /** List available tools */
  listTools(): Promise<ListToolsResult>;
  /** Call a tool with arguments */
  callTool(name: string, args?: Record<string, unknown>): Promise<CallToolResult>;
  /** Disconnect from server */
  disconnect(): Promise<void>;
  /** Get underlying SDK client */
  getClient(): Client;
}

export interface InitializeResult {
  protocolVersion: string;
  serverInfo: {
    name: string;
    version: string;
  };
  capabilities: Record<string, unknown>;
}

export interface ListToolsResult {
  tools: Array<{
    name: string;
    description?: string;
    inputSchema: Record<string, unknown>;
  }>;
}

export interface CallToolResult {
  content: Array<{
    type: string;
    text?: string;
    [key: string]: unknown;
  }>;
  isError?: boolean;
}

/**
 * Create an HTTP client that connects to a server at the given port.
 */
export async function createHttpClient(port: number, host: string = '127.0.0.1'): Promise<E2EClient> {
  const url = `http://${host}:${port}/mcp`;

  // Dynamic import for HTTP transport
  const { StreamableHTTPClientTransport } = await import(
    '@modelcontextprotocol/sdk/client/streamableHttp.js'
  );

  // Our server requires mcp-protocol-version header on all requests
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: {
      headers: {
        'mcp-protocol-version': '2025-11-25',
      },
    },
  });

  const client = new Client(
    { name: 'e2e-test-client', version: '1.0.0' },
    { capabilities: {} }
  );

  let connected = false;

  return {
    async initialize(): Promise<InitializeResult> {
      if (!connected) {
        await client.connect(transport);
        connected = true;
      }
      // The SDK automatically handles initialization during connect
      // Return the server info from the client's session
      const serverInfo = client.getServerVersion();
      return {
        protocolVersion: '2025-11-25',
        serverInfo: serverInfo ?? { name: 'unknown', version: 'unknown' },
        capabilities: client.getServerCapabilities() ?? {},
      };
    },

    async listTools(): Promise<ListToolsResult> {
      if (!connected) {
        await this.initialize();
      }
      const result = await client.listTools();
      return {
        tools: result.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema as Record<string, unknown>,
        })),
      };
    },

    async callTool(name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
      if (!connected) {
        await this.initialize();
      }
      const result = await client.callTool({ name, arguments: args });
      return {
        content: result.content as CallToolResult['content'],
        isError: result.isError === true ? true : undefined,
      };
    },

    async disconnect(): Promise<void> {
      if (connected) {
        await transport.close();
        connected = false;
      }
    },

    getClient(): Client {
      return client;
    },
  };
}

/**
 * Create a stdio client by spawning a new server process.
 * This is the recommended way to test stdio transport.
 */
export async function createStdioClientSpawned(
  command: string,
  args: string[] = [],
  env?: Record<string, string>
): Promise<E2EClient> {
  const transport = new StdioClientTransport({
    command,
    args,
    env,
  });

  const client = new Client(
    { name: 'e2e-stdio-client', version: '1.0.0' },
    { capabilities: {} }
  );

  let connected = false;

  return {
    async initialize(): Promise<InitializeResult> {
      if (!connected) {
        await client.connect(transport);
        connected = true;
      }
      const serverInfo = client.getServerVersion();
      return {
        protocolVersion: '2025-11-25',
        serverInfo: serverInfo ?? { name: 'unknown', version: 'unknown' },
        capabilities: client.getServerCapabilities() ?? {},
      };
    },

    async listTools(): Promise<ListToolsResult> {
      if (!connected) {
        await this.initialize();
      }
      const result = await client.listTools();
      return {
        tools: result.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema as Record<string, unknown>,
        })),
      };
    },

    async callTool(name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
      if (!connected) {
        await this.initialize();
      }
      const result = await client.callTool({ name, arguments: args });
      return {
        content: result.content as CallToolResult['content'],
        isError: result.isError === true ? true : undefined,
      };
    },

    async disconnect(): Promise<void> {
      if (connected) {
        await transport.close();
        connected = false;
      }
    },

    getClient(): Client {
      return client;
    },
  };
}
