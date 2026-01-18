/**
 * MCP Client Wrapper
 *
 * Wraps @modelcontextprotocol/sdk Client with a simplified interface
 * for connecting to MCP servers via stdio or HTTP transport.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

export interface StdioConnectionOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface HttpConnectionOptions {
  url: string;
  headers?: Record<string, string>;
}

export type ConnectionOptions =
  | ({ type: 'stdio' } & StdioConnectionOptions)
  | ({ type: 'http' } & HttpConnectionOptions);

export interface MCPTool {
  name: string;
  description?: string | undefined;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
}

export interface ToolCallResult {
  content: Array<{
    type: string;
    text?: string;
    [key: string]: unknown;
  }>;
  isError?: boolean | undefined;
}

export interface MCPClientOptions {
  name?: string | undefined;
  version?: string | undefined;
  verbose?: boolean | undefined;
}

/**
 * MCP Client wrapper for simplified server interaction
 */
export class MCPClient {
  private client: Client;
  private transport: Transport | null = null;
  private connected = false;
  private verbose: boolean;

  constructor(options: MCPClientOptions = {}) {
    this.verbose = options.verbose ?? false;
    this.client = new Client(
      {
        name: options.name ?? 'mcp-reference-client',
        version: options.version ?? '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    if (this.verbose) {
      this.setupVerboseLogging();
    }
  }

  /**
   * Connect to an MCP server via stdio transport
   */
  async connectStdio(options: StdioConnectionOptions): Promise<void> {
    if (this.connected) {
      throw new Error('Already connected. Disconnect first.');
    }

    this.log(`Connecting via stdio: ${options.command} ${options.args?.join(' ') ?? ''}`);

    const transportParams: { command: string; args?: string[]; env?: Record<string, string>; cwd?: string } = {
      command: options.command,
    };
    if (options.args) transportParams.args = options.args;
    if (options.env) transportParams.env = options.env;
    if (options.cwd) transportParams.cwd = options.cwd;

    this.transport = new StdioClientTransport(transportParams);

    await this.client.connect(this.transport);
    this.connected = true;
    this.log('Connected successfully');
  }

  /**
   * Connect to an MCP server via HTTP transport (StreamableHTTP)
   */
  async connectHttp(options: HttpConnectionOptions): Promise<void> {
    if (this.connected) {
      throw new Error('Already connected. Disconnect first.');
    }

    this.log(`Connecting via HTTP: ${options.url}`);

    // Dynamic import for HTTP transport
    const { StreamableHTTPClientTransport } = await import(
      '@modelcontextprotocol/sdk/client/streamableHttp.js'
    );

    const httpTransport = new StreamableHTTPClientTransport(new URL(options.url));
    // Store as any to avoid type conflicts between different SDK transport types
    this.transport = httpTransport as Transport;
    await this.client.connect(this.transport);
    this.connected = true;
    this.log('Connected successfully');
  }

  /**
   * Connect using unified options
   */
  async connect(options: ConnectionOptions): Promise<void> {
    if (options.type === 'stdio') {
      await this.connectStdio(options);
    } else if (options.type === 'http') {
      await this.connectHttp(options);
    } else {
      throw new Error(`Unknown connection type: ${(options as { type: string }).type}`);
    }
  }

  /**
   * List all available tools from the server
   */
  async listTools(): Promise<MCPTool[]> {
    this.ensureConnected();
    this.log('Listing tools...');

    const result = await this.client.listTools();
    const tools = result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as MCPTool['inputSchema'],
    }));

    this.log(`Found ${tools.length} tools`);
    return tools;
  }

  /**
   * Call a tool with arguments
   */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolCallResult> {
    this.ensureConnected();
    this.log(`Calling tool: ${name}`, args);

    const result = await this.client.callTool({ name, arguments: args });

    this.log('Tool result:', result);
    return {
      content: result.content as ToolCallResult['content'],
      isError: result.isError === true ? true : undefined,
    };
  }

  /**
   * Get completions for prompt arguments
   */
  async complete(
    ref: { type: 'ref/prompt'; name: string } | { type: 'ref/resource'; uri: string },
    argument: { name: string; value: string }
  ): Promise<string[]> {
    this.ensureConnected();
    this.log('Getting completions for:', ref, argument);

    const result = await this.client.complete({
      ref,
      argument,
    });

    return result.completion.values;
  }

  /**
   * Set the server's logging level
   */
  async setLoggingLevel(level: 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency'): Promise<void> {
    this.ensureConnected();
    this.log(`Setting logging level: ${level}`);
    await this.client.setLoggingLevel(level);
  }

  /**
   * Check if connected to a server
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<void> {
    if (!this.connected || !this.transport) {
      return;
    }

    this.log('Disconnecting...');
    await this.transport.close();
    this.transport = null;
    this.connected = false;
    this.log('Disconnected');
  }

  /**
   * Get the underlying client for advanced usage
   */
  getClient(): Client {
    return this.client;
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('Not connected to a server');
    }
  }

  private log(message: string, ...args: unknown[]): void {
    if (this.verbose) {
      console.error(`[MCP Client] ${message}`, ...args);
    }
  }

  private setupVerboseLogging(): void {
    // The MCP SDK handles transport-level logging
    // This is where we could add request/response interceptors
  }
}
