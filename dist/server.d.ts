/**
 * Main MCP Server class
 */
import type { Config } from './config.js';
export interface MCPServerOptions {
    config?: Config;
}
export declare class MCPServer {
    constructor(_options?: MCPServerOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
}
//# sourceMappingURL=server.d.ts.map