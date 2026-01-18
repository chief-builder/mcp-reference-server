/**
 * MCP Client Wrapper
 *
 * Wraps @modelcontextprotocol/sdk Client with a simplified interface
 * for connecting to MCP servers via stdio or HTTP transport.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
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
export type ConnectionOptions = ({
    type: 'stdio';
} & StdioConnectionOptions) | ({
    type: 'http';
} & HttpConnectionOptions);
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
export declare class MCPClient {
    private client;
    private transport;
    private connected;
    private verbose;
    constructor(options?: MCPClientOptions);
    /**
     * Connect to an MCP server via stdio transport
     */
    connectStdio(options: StdioConnectionOptions): Promise<void>;
    /**
     * Connect to an MCP server via HTTP transport (StreamableHTTP)
     */
    connectHttp(options: HttpConnectionOptions): Promise<void>;
    /**
     * Connect using unified options
     */
    connect(options: ConnectionOptions): Promise<void>;
    /**
     * List all available tools from the server
     */
    listTools(): Promise<MCPTool[]>;
    /**
     * Call a tool with arguments
     */
    callTool(name: string, args?: Record<string, unknown>): Promise<ToolCallResult>;
    /**
     * Get completions for prompt arguments
     */
    complete(ref: {
        type: 'ref/prompt';
        name: string;
    } | {
        type: 'ref/resource';
        uri: string;
    }, argument: {
        name: string;
        value: string;
    }): Promise<string[]>;
    /**
     * Set the server's logging level
     */
    setLoggingLevel(level: 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency'): Promise<void>;
    /**
     * Check if connected to a server
     */
    isConnected(): boolean;
    /**
     * Disconnect from the server
     */
    disconnect(): Promise<void>;
    /**
     * Get the underlying client for advanced usage
     */
    getClient(): Client;
    private ensureConnected;
    private log;
    private setupVerboseLogging;
}
//# sourceMappingURL=mcp-client.d.ts.map