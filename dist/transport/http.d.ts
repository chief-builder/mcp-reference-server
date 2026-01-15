/**
 * Streamable HTTP transport implementation
 *
 * Implements the MCP HTTP transport with:
 * - Single /mcp endpoint supporting POST (and GET for SSE in future)
 * - Session management via MCP-Session-Id header
 * - Protocol version validation via MCP-Protocol-Version header
 * - Origin validation for security
 * - CORS support
 */
import { Express } from 'express';
import { JsonRpcRequest, JsonRpcNotification, JsonRpcResponse } from '../protocol/jsonrpc.js';
import { SessionManager, Session } from './session.js';
import { SSEManager } from './sse.js';
export interface HttpTransportOptions {
    /**
     * Port to listen on
     */
    port: number;
    /**
     * Host to bind to. Default: '0.0.0.0'
     */
    host?: string;
    /**
     * Existing Express app to use. If not provided, creates a new one.
     */
    app?: Express;
    /**
     * Allowed origins for CORS. If empty or undefined, all origins are rejected.
     * Use ['*'] to allow all origins (not recommended for production).
     */
    allowedOrigins?: string[];
    /**
     * Session TTL in milliseconds. Default: 30 minutes
     */
    sessionTtlMs?: number;
    /**
     * SSE event buffer size for replay. Default: 100
     */
    sseBufferSize?: number;
    /**
     * SSE keep-alive interval in milliseconds. Default: 30000 (30 seconds)
     * Set to 0 to disable keep-alive pings
     */
    sseKeepAliveInterval?: number;
    /**
     * Stateless mode for horizontal scaling. Default: false
     * When true:
     * - No session ID generation or validation
     * - No Mcp-Session-Id header in responses
     * - SSE streams are not supported (returns 406)
     * - Each request is independent
     */
    statelessMode?: boolean;
}
/**
 * Handler type for processing JSON-RPC messages over HTTP transport
 */
export type HttpMessageHandler = (message: JsonRpcRequest | JsonRpcNotification, session: Session) => Promise<JsonRpcResponse | null>;
export declare class HttpTransportError extends Error {
    readonly statusCode: number;
    constructor(message: string, statusCode: number);
}
export declare class HttpTransport {
    private readonly app;
    private readonly port;
    private readonly host;
    private readonly allowedOrigins;
    private readonly sessionManager;
    private readonly sseManager;
    private readonly statelessMode;
    private server;
    private messageHandler;
    constructor(options: HttpTransportOptions);
    /**
     * Set the handler for processing incoming JSON-RPC messages
     */
    setMessageHandler(handler: HttpMessageHandler): void;
    /**
     * Get the session manager instance
     */
    getSessionManager(): SessionManager;
    /**
     * Get the SSE manager instance
     */
    getSSEManager(): SSEManager;
    /**
     * Get the Express app instance
     */
    getApp(): Express;
    /**
     * Check if transport is in stateless mode
     */
    isStateless(): boolean;
    /**
     * Start the HTTP server
     */
    start(): Promise<void>;
    /**
     * Stop the HTTP server and cleanup
     */
    close(): Promise<void>;
    stop(): Promise<void>;
    /**
     * Setup Express middleware
     */
    private setupMiddleware;
    /**
     * Setup MCP routes
     */
    private setupRoutes;
    /**
     * CORS middleware - validates Origin header and sets CORS headers
     */
    private corsMiddleware;
    /**
     * Check if an origin is allowed
     */
    private isOriginAllowed;
    /**
     * Handle OPTIONS request (CORS preflight)
     */
    private handleOptions;
    /**
     * Handle GET request (SSE stream for server-initiated messages)
     */
    private handleGet;
    /**
     * Handle POST request (JSON-RPC messages)
     */
    private handlePost;
}
//# sourceMappingURL=http.d.ts.map