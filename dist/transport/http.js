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
import express from 'express';
import { createServer } from 'node:http';
import { parseJsonRpc, createErrorResponse, createJsonRpcError, JsonRpcErrorCodes, isNotification, } from '../protocol/jsonrpc.js';
import { PROTOCOL_VERSION } from '../protocol/lifecycle.js';
// Legacy protocol version for backwards compatibility (per MCP spec)
// If server doesn't receive mcp-protocol-version header, it SHOULD assume this version
const LEGACY_PROTOCOL_VERSION = '2025-03-26';
import { SessionManager } from './session.js';
import { SSEManager } from './sse.js';
import { createApiRouter } from '../api/router.js';
import { createOAuthRouter } from '../api/oauth-router.js';
// =============================================================================
// Constants
// =============================================================================
const MCP_ENDPOINT = '/mcp';
const MCP_PROTOCOL_VERSION_HEADER = 'mcp-protocol-version';
const MCP_SESSION_ID_HEADER = 'mcp-session-id';
// =============================================================================
// HTTP Transport Error
// =============================================================================
export class HttpTransportError extends Error {
    statusCode;
    constructor(message, statusCode) {
        super(message);
        this.name = 'HttpTransportError';
        this.statusCode = statusCode;
    }
}
// =============================================================================
// HTTP Transport Class
// =============================================================================
export class HttpTransport {
    app;
    port;
    host;
    allowedOrigins;
    sessionManager;
    sseManager;
    statelessMode;
    server = null;
    messageHandler = null;
    activeSockets = new Set();
    constructor(options) {
        this.port = options.port;
        this.host = options.host ?? '0.0.0.0';
        this.allowedOrigins = options.allowedOrigins ?? [];
        this.statelessMode = options.statelessMode ?? false;
        this.sessionManager = new SessionManager(options.sessionTtlMs !== undefined ? { ttlMs: options.sessionTtlMs } : undefined);
        const sseOptions = {};
        if (options.sseBufferSize !== undefined) {
            sseOptions.bufferSize = options.sseBufferSize;
        }
        if (options.sseKeepAliveInterval !== undefined) {
            sseOptions.keepAliveInterval = options.sseKeepAliveInterval;
        }
        this.sseManager = new SSEManager(sseOptions);
        // Use provided app or create new one
        this.app = options.app ?? express();
        // Setup middleware and routes
        this.setupMiddleware();
        this.setupRoutes();
    }
    /**
     * Set the handler for processing incoming JSON-RPC messages
     */
    setMessageHandler(handler) {
        this.messageHandler = handler;
    }
    /**
     * Get the session manager instance
     */
    getSessionManager() {
        return this.sessionManager;
    }
    /**
     * Get the SSE manager instance
     */
    getSSEManager() {
        return this.sseManager;
    }
    /**
     * Get the Express app instance
     */
    getApp() {
        return this.app;
    }
    /**
     * Check if transport is in stateless mode
     */
    isStateless() {
        return this.statelessMode;
    }
    /**
     * Start the HTTP server
     */
    async start() {
        if (this.server) {
            throw new HttpTransportError('Server already started', 500);
        }
        return new Promise((resolve, reject) => {
            this.server = createServer(this.app);
            this.server.on('error', (err) => {
                reject(new HttpTransportError(`Failed to start server: ${err.message}`, 500));
            });
            // Track connections for graceful shutdown
            this.server.on('connection', (socket) => {
                this.activeSockets.add(socket);
                socket.once('close', () => {
                    this.activeSockets.delete(socket);
                });
            });
            this.server.listen(this.port, this.host, () => {
                this.sessionManager.startCleanup();
                resolve();
            });
        });
    }
    /**
     * Stop the HTTP server and cleanup
     */
    async close() {
        this.sessionManager.stopCleanup();
        this.sseManager.closeAll();
        if (!this.server) {
            return;
        }
        // Destroy all active connections to allow immediate shutdown
        for (const socket of this.activeSockets) {
            socket.destroy();
        }
        this.activeSockets.clear();
        return new Promise((resolve, reject) => {
            this.server.close((err) => {
                if (err) {
                    reject(new HttpTransportError(`Failed to close server: ${err.message}`, 500));
                }
                else {
                    this.server = null;
                    resolve();
                }
            });
        });
    }
    // Alias for backwards compatibility
    async stop() {
        return this.close();
    }
    /**
     * Setup Express middleware
     */
    setupMiddleware() {
        // Parse JSON bodies with size limit to prevent DoS attacks
        // Scoped to MCP endpoint only to avoid affecting other routes when user provides their own app
        this.app.use(MCP_ENDPOINT, express.json({ limit: '100kb' }));
        // Handle body-parser errors (e.g., payload too large, JSON parse errors)
        this.app.use(MCP_ENDPOINT, (err, _req, res, next) => {
            if (err.type === 'entity.too.large') {
                res.status(413).json({
                    jsonrpc: '2.0',
                    error: { code: -32600, message: 'Payload too large' },
                    id: null
                });
                return;
            }
            // Handle JSON parse errors from express.json() middleware
            if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
                res.status(400).json({
                    jsonrpc: '2.0',
                    error: { code: JsonRpcErrorCodes.PARSE_ERROR, message: 'Parse error' },
                    id: null
                });
                return;
            }
            next(err);
        });
        // CORS middleware
        this.app.use(MCP_ENDPOINT, this.corsMiddleware.bind(this));
    }
    /**
     * Setup MCP routes
     */
    setupRoutes() {
        // Mount OAuth router at /oauth if enabled
        if (process.env.OAUTH_SERVER_ENABLED === 'true') {
            this.app.use('/oauth', createOAuthRouter());
        }
        // Mount API router at /api
        this.app.use('/api', createApiRouter());
        // Handle OPTIONS for CORS preflight
        this.app.options(MCP_ENDPOINT, this.handleOptions.bind(this));
        // Handle POST requests (JSON-RPC messages)
        this.app.post(MCP_ENDPOINT, this.handlePost.bind(this));
        // Handle GET requests (SSE - placeholder for future implementation)
        this.app.get(MCP_ENDPOINT, this.handleGet.bind(this));
    }
    /**
     * CORS middleware - validates Origin header and sets CORS headers
     */
    corsMiddleware(req, res, next) {
        const origin = req.get('Origin');
        // Set CORS headers
        if (origin && this.isOriginAllowed(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', [
                'Content-Type',
                'Accept',
                MCP_PROTOCOL_VERSION_HEADER,
                MCP_SESSION_ID_HEADER,
                'Authorization',
                'Last-Event-Id',
            ].join(', '));
            res.setHeader('Access-Control-Expose-Headers', MCP_SESSION_ID_HEADER);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
        next();
    }
    /**
     * Check if an origin is allowed
     */
    isOriginAllowed(origin) {
        // If wildcard is in the list, allow all
        if (this.allowedOrigins.includes('*')) {
            return true;
        }
        return this.allowedOrigins.includes(origin);
    }
    /**
     * Handle OPTIONS request (CORS preflight)
     */
    handleOptions(_req, res) {
        res.status(204).end();
    }
    /**
     * Handle GET request (SSE stream for server-initiated messages)
     */
    handleGet(req, res) {
        // In stateless mode, SSE is not supported
        if (this.statelessMode) {
            res.status(406).json({
                error: 'SSE streams are not supported in stateless mode',
            });
            return;
        }
        // Validate Origin for non-browser requests or when Origin is present
        const origin = req.get('Origin');
        if (origin && !this.isOriginAllowed(origin)) {
            res.status(403).json({ error: 'Origin not allowed' });
            return;
        }
        // Validate Accept header - client should request text/event-stream
        const accept = req.get('Accept');
        if (!accept?.includes('text/event-stream')) {
            res.status(406).json({
                error: 'Accept header must include text/event-stream',
            });
            return;
        }
        // Require session ID for SSE connections
        const sessionId = req.get(MCP_SESSION_ID_HEADER);
        if (!sessionId) {
            res.status(400).json({
                error: `Missing required header: ${MCP_SESSION_ID_HEADER}`,
            });
            return;
        }
        // Validate session exists
        const session = this.sessionManager.getSession(sessionId);
        if (!session) {
            res.status(404).json({
                error: 'Session not found',
            });
            return;
        }
        // Touch session to keep it alive
        this.sessionManager.touchSession(sessionId);
        // Check for Last-Event-Id header for reconnection
        const lastEventId = req.get('Last-Event-Id');
        // Create or reconnect SSE stream
        if (lastEventId) {
            // Reconnection - replay events after the last received ID
            this.sseManager.handleReconnect(sessionId, lastEventId, res);
        }
        else {
            // New connection
            this.sseManager.createStream(sessionId, res);
        }
        // Note: The stream stays open until the client disconnects
        // or the session is destroyed. Events are pushed via sseManager.sendEvent()
    }
    /**
     * Handle POST request (JSON-RPC messages)
     */
    async handlePost(req, res) {
        try {
            // Step 1: Validate Origin header
            const origin = req.get('Origin');
            if (origin && !this.isOriginAllowed(origin)) {
                res.status(403).json({ error: 'Origin not allowed' });
                return;
            }
            // Step 2: Validate Content-Type
            const contentType = req.get('Content-Type');
            if (!contentType?.includes('application/json')) {
                res.status(415).json({ error: 'Content-Type must be application/json' });
                return;
            }
            // Step 3: Validate MCP-Protocol-Version header
            // Per MCP spec: if header is missing, assume legacy version 2025-03-26 for backwards compatibility
            // This allows SDK clients that don't send the header on initial requests to still connect
            const protocolVersion = req.get(MCP_PROTOCOL_VERSION_HEADER) ?? LEGACY_PROTOCOL_VERSION;
            // Validate that the version is one we support
            if (protocolVersion !== PROTOCOL_VERSION && protocolVersion !== LEGACY_PROTOCOL_VERSION) {
                res.status(400).json({
                    error: `Unsupported protocol version: ${protocolVersion}. Supported versions: ${PROTOCOL_VERSION}, ${LEGACY_PROTOCOL_VERSION}`,
                });
                return;
            }
            // Step 4: Parse JSON-RPC message
            const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
            const parseResult = parseJsonRpc(body);
            if (!parseResult.success) {
                res.status(400).json(createErrorResponse(null, parseResult.error));
                return;
            }
            const message = parseResult.data;
            // Step 5: Handle session
            const sessionId = req.get(MCP_SESSION_ID_HEADER);
            let session;
            // Check if this is an initialize request
            const isInitialize = message.method === 'initialize';
            if (this.statelessMode) {
                // Stateless mode: create ephemeral session for this request only
                // No session ID validation, no persistence
                session = {
                    id: 'stateless',
                    createdAt: new Date(),
                    lastActiveAt: new Date(),
                    state: 'ready',
                };
            }
            else if (isInitialize) {
                // Initialize request - create new session
                // If a session ID is provided, it should be ignored for initialize
                session = this.sessionManager.createSession();
            }
            else {
                // Non-initialize request - require valid session
                if (!sessionId) {
                    res.status(400).json({
                        error: `Missing required header: ${MCP_SESSION_ID_HEADER}`,
                    });
                    return;
                }
                const existingSession = this.sessionManager.getSession(sessionId);
                if (!existingSession) {
                    res.status(404).json({
                        error: 'Session not found',
                    });
                    return;
                }
                session = existingSession;
                this.sessionManager.touchSession(sessionId);
            }
            // Step 6: Check if handler is set
            if (!this.messageHandler) {
                res.status(500).json({
                    error: 'No message handler configured',
                });
                return;
            }
            // Step 7: Process message
            const response = await this.messageHandler(message, session);
            // Step 8: Send response
            if (isNotification(message)) {
                // Notifications get 202 Accepted with empty body
                res.status(202).end();
            }
            else {
                // isRequest(message) must be true at this point
                const request = message;
                // Requests get JSON-RPC response
                res.setHeader('Content-Type', 'application/json');
                // Include session ID header for initialize response (not in stateless mode)
                if (isInitialize && response && !this.statelessMode) {
                    res.setHeader(MCP_SESSION_ID_HEADER, session.id);
                }
                if (response) {
                    res.status(200).json(response);
                }
                else {
                    // Handler returned null for a request - internal error
                    res.status(500).json(createErrorResponse(request.id, createJsonRpcError(JsonRpcErrorCodes.INTERNAL_ERROR, 'Handler returned no response')));
                }
            }
        }
        catch (error) {
            // Unexpected error
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({
                error: `Internal server error: ${errorMessage}`,
            });
        }
    }
}
//# sourceMappingURL=http.js.map