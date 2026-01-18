#!/usr/bin/env node
/**
 * MCP Reference Server CLI
 *
 * Starts the server with configuration from environment variables.
 * Wires together all server components: lifecycle, tools, completions,
 * logging, transports, and message routing.
 */
import { loadConfig } from './config.js';
import { MCPServer } from './server.js';
import { LifecycleManager } from './protocol/lifecycle.js';
import { ToolRegistry } from './tools/registry.js';
import { ToolExecutor } from './tools/executor.js';
import { CompletionHandler } from './completions/handler.js';
import { LoggingHandler } from './logging/handler.js';
import { StdioTransport } from './transport/stdio.js';
import { HttpTransport } from './transport/http.js';
import { MessageRouter } from './message-router.js';
import { registerAllBuiltins } from './tools/builtin.js';
async function main() {
    try {
        const config = loadConfig();
        // =========================================================================
        // 1. Create Core Components
        // =========================================================================
        // Lifecycle manager handles server state and initialization handshake
        const lifecycleManager = new LifecycleManager({
            name: 'mcp-reference-server',
            version: '0.1.0',
            description: 'MCP Reference Implementation Server',
            capabilities: {
                tools: { listChanged: true },
                logging: {},
                completions: {},
            },
        });
        // Tool registry stores tool definitions
        const toolRegistry = new ToolRegistry();
        // Completion handler provides argument auto-complete
        const completionHandler = new CompletionHandler();
        // Register built-in tools and their completions
        registerAllBuiltins(toolRegistry, completionHandler);
        // Tool executor runs tools with validation
        const toolExecutor = new ToolExecutor(toolRegistry, {
            timeoutMs: config.requestTimeoutMs,
        });
        // Logging handler manages log levels
        const loggingHandler = new LoggingHandler({
            minLevel: config.logLevel,
        });
        // =========================================================================
        // 2. Create Message Router
        // =========================================================================
        const router = new MessageRouter({
            lifecycleManager,
            toolRegistry,
            toolExecutor,
            completionHandler,
            loggingHandler,
            config,
        });
        // =========================================================================
        // 3. Create Transports Based on Config
        // =========================================================================
        let stdioTransport;
        let httpTransport;
        if (config.transport === 'stdio' || config.transport === 'both') {
            stdioTransport = new StdioTransport({ lifecycleManager });
            // Wire transport to router
            stdioTransport.onMessage(async (msg) => {
                const response = await router.handleMessage(msg);
                if (response) {
                    stdioTransport.send(response);
                }
            });
            stdioTransport.onError((error) => {
                console.error('Stdio transport error:', error.message);
            });
        }
        if (config.transport === 'http' || config.transport === 'both') {
            httpTransport = new HttpTransport({
                port: config.port,
                host: config.host,
                allowedOrigins: ['*'], // Allow all origins for reference server
                statelessMode: config.statelessMode,
            });
            // Wire transport to router
            httpTransport.setMessageHandler(async (msg, session) => {
                return router.handleMessage(msg, { session });
            });
        }
        // =========================================================================
        // 4. Create and Start Server
        // =========================================================================
        // Build server options, only including transports if they exist
        // This satisfies exactOptionalPropertyTypes
        const serverOptions = {
            config,
            lifecycleManager,
        };
        if (stdioTransport) {
            serverOptions.stdioTransport = stdioTransport;
        }
        if (httpTransport) {
            serverOptions.httpTransport = httpTransport;
        }
        const server = new MCPServer(serverOptions);
        await server.start();
        // =========================================================================
        // 5. Log Startup Information
        // =========================================================================
        console.error(`MCP Reference Server started`);
        console.error(`  Transport: ${config.transport}`);
        if (httpTransport) {
            console.error(`  HTTP: http://${config.host}:${config.port}`);
        }
        if (stdioTransport) {
            console.error(`  STDIO: enabled`);
        }
        console.error(`  Tools: ${toolRegistry.getToolCount()} registered`);
    }
    catch (error) {
        console.error('Failed to start MCP server:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=cli.js.map