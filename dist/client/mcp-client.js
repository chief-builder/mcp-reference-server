/**
 * MCP Client Wrapper
 *
 * Wraps @modelcontextprotocol/sdk Client with a simplified interface
 * for connecting to MCP servers via stdio or HTTP transport.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
/**
 * MCP Client wrapper for simplified server interaction
 */
export class MCPClient {
    client;
    transport = null;
    connected = false;
    verbose;
    constructor(options = {}) {
        this.verbose = options.verbose ?? false;
        this.client = new Client({
            name: options.name ?? 'mcp-reference-client',
            version: options.version ?? '1.0.0',
        }, {
            capabilities: {},
        });
        if (this.verbose) {
            this.setupVerboseLogging();
        }
    }
    /**
     * Connect to an MCP server via stdio transport
     */
    async connectStdio(options) {
        if (this.connected) {
            throw new Error('Already connected. Disconnect first.');
        }
        this.log(`Connecting via stdio: ${options.command} ${options.args?.join(' ') ?? ''}`);
        const transportParams = {
            command: options.command,
        };
        if (options.args)
            transportParams.args = options.args;
        if (options.env)
            transportParams.env = options.env;
        if (options.cwd)
            transportParams.cwd = options.cwd;
        this.transport = new StdioClientTransport(transportParams);
        await this.client.connect(this.transport);
        this.connected = true;
        this.log('Connected successfully');
    }
    /**
     * Connect to an MCP server via HTTP transport (StreamableHTTP)
     */
    async connectHttp(options) {
        if (this.connected) {
            throw new Error('Already connected. Disconnect first.');
        }
        this.log(`Connecting via HTTP: ${options.url}`);
        // Dynamic import for HTTP transport
        const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
        const httpTransport = new StreamableHTTPClientTransport(new URL(options.url));
        // Store as any to avoid type conflicts between different SDK transport types
        this.transport = httpTransport;
        await this.client.connect(this.transport);
        this.connected = true;
        this.log('Connected successfully');
    }
    /**
     * Connect using unified options
     */
    async connect(options) {
        if (options.type === 'stdio') {
            await this.connectStdio(options);
        }
        else if (options.type === 'http') {
            await this.connectHttp(options);
        }
        else {
            throw new Error(`Unknown connection type: ${options.type}`);
        }
    }
    /**
     * List all available tools from the server
     */
    async listTools() {
        this.ensureConnected();
        this.log('Listing tools...');
        const result = await this.client.listTools();
        const tools = result.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
        }));
        this.log(`Found ${tools.length} tools`);
        return tools;
    }
    /**
     * Call a tool with arguments
     */
    async callTool(name, args = {}) {
        this.ensureConnected();
        this.log(`Calling tool: ${name}`, args);
        const result = await this.client.callTool({ name, arguments: args });
        this.log('Tool result:', result);
        return {
            content: result.content,
            isError: result.isError === true ? true : undefined,
        };
    }
    /**
     * Get completions for prompt arguments
     */
    async complete(ref, argument) {
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
    async setLoggingLevel(level) {
        this.ensureConnected();
        this.log(`Setting logging level: ${level}`);
        await this.client.setLoggingLevel(level);
    }
    /**
     * Check if connected to a server
     */
    isConnected() {
        return this.connected;
    }
    /**
     * Disconnect from the server
     */
    async disconnect() {
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
    getClient() {
        return this.client;
    }
    ensureConnected() {
        if (!this.connected) {
            throw new Error('Not connected to a server');
        }
    }
    log(message, ...args) {
        if (this.verbose) {
            console.error(`[MCP Client] ${message}`, ...args);
        }
    }
    setupVerboseLogging() {
        // The MCP SDK handles transport-level logging
        // This is where we could add request/response interceptors
    }
}
//# sourceMappingURL=mcp-client.js.map