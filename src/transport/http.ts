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

import express, { Express, Request, Response, NextFunction } from 'express';
import { createServer, Server } from 'node:http';
import {
  JsonRpcRequest,
  JsonRpcNotification,
  JsonRpcResponse,
  parseJsonRpc,
  createErrorResponse,
  createJsonRpcError,
  JsonRpcErrorCodes,
  isNotification,
} from '../protocol/jsonrpc.js';
import { PROTOCOL_VERSION } from '../protocol/lifecycle.js';
import { SessionManager, Session } from './session.js';

// =============================================================================
// Constants
// =============================================================================

const MCP_ENDPOINT = '/mcp';
const MCP_PROTOCOL_VERSION_HEADER = 'mcp-protocol-version';
const MCP_SESSION_ID_HEADER = 'mcp-session-id';

// =============================================================================
// Types
// =============================================================================

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
}

/**
 * Handler type for processing JSON-RPC messages over HTTP transport
 */
export type HttpMessageHandler = (
  message: JsonRpcRequest | JsonRpcNotification,
  session: Session
) => Promise<JsonRpcResponse | null>;

// =============================================================================
// HTTP Transport Error
// =============================================================================

export class HttpTransportError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'HttpTransportError';
    this.statusCode = statusCode;
  }
}

// =============================================================================
// HTTP Transport Class
// =============================================================================

export class HttpTransport {
  private readonly app: Express;
  private readonly port: number;
  private readonly host: string;
  private readonly allowedOrigins: string[];
  private readonly sessionManager: SessionManager;
  private server: Server | null = null;
  private messageHandler: HttpMessageHandler | null = null;

  constructor(options: HttpTransportOptions) {
    this.port = options.port;
    this.host = options.host ?? '0.0.0.0';
    this.allowedOrigins = options.allowedOrigins ?? [];
    this.sessionManager = new SessionManager(
      options.sessionTtlMs !== undefined ? { ttlMs: options.sessionTtlMs } : undefined
    );

    // Use provided app or create new one
    this.app = options.app ?? express();

    // Setup middleware and routes
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Set the handler for processing incoming JSON-RPC messages
   */
  setMessageHandler(handler: HttpMessageHandler): void {
    this.messageHandler = handler;
  }

  /**
   * Get the session manager instance
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * Get the Express app instance
   */
  getApp(): Express {
    return this.app;
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    if (this.server) {
      throw new HttpTransportError('Server already started', 500);
    }

    return new Promise((resolve, reject) => {
      this.server = createServer(this.app);

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        reject(new HttpTransportError(`Failed to start server: ${err.message}`, 500));
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
  async close(): Promise<void> {
    this.sessionManager.stopCleanup();

    if (!this.server) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.server!.close((err) => {
        if (err) {
          reject(new HttpTransportError(`Failed to close server: ${err.message}`, 500));
        } else {
          this.server = null;
          resolve();
        }
      });
    });
  }

  // Alias for backwards compatibility
  async stop(): Promise<void> {
    return this.close();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Parse JSON bodies
    this.app.use(express.json());

    // CORS middleware
    this.app.use(MCP_ENDPOINT, this.corsMiddleware.bind(this));
  }

  /**
   * Setup MCP routes
   */
  private setupRoutes(): void {
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
  private corsMiddleware(req: Request, res: Response, next: NextFunction): void {
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
      ].join(', '));
      res.setHeader('Access-Control-Expose-Headers', MCP_SESSION_ID_HEADER);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    next();
  }

  /**
   * Check if an origin is allowed
   */
  private isOriginAllowed(origin: string): boolean {
    // If wildcard is in the list, allow all
    if (this.allowedOrigins.includes('*')) {
      return true;
    }
    return this.allowedOrigins.includes(origin);
  }

  /**
   * Handle OPTIONS request (CORS preflight)
   */
  private handleOptions(_req: Request, res: Response): void {
    res.status(204).end();
  }

  /**
   * Handle GET request (SSE - placeholder)
   */
  private handleGet(req: Request, res: Response): void {
    // Validate Origin for non-browser requests or when Origin is present
    const origin = req.get('Origin');
    if (origin && !this.isOriginAllowed(origin)) {
      res.status(403).json({ error: 'Origin not allowed' });
      return;
    }

    // SSE implementation will go here in c6t.12
    // For now, return 501 Not Implemented
    res.status(501).json({
      error: 'SSE not implemented. Use POST for JSON-RPC messages.',
    });
  }

  /**
   * Handle POST request (JSON-RPC messages)
   */
  private async handlePost(req: Request, res: Response): Promise<void> {
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
      const protocolVersion = req.get(MCP_PROTOCOL_VERSION_HEADER);
      if (!protocolVersion) {
        res.status(400).json({
          error: `Missing required header: ${MCP_PROTOCOL_VERSION_HEADER}`,
        });
        return;
      }
      if (protocolVersion !== PROTOCOL_VERSION) {
        res.status(400).json({
          error: `Unsupported protocol version: ${protocolVersion}. Expected: ${PROTOCOL_VERSION}`,
        });
        return;
      }

      // Step 4: Parse JSON-RPC message
      const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const parseResult = parseJsonRpc(body);

      if (!parseResult.success) {
        res.status(400).json(
          createErrorResponse(null, parseResult.error)
        );
        return;
      }

      const message = parseResult.data;

      // Step 5: Handle session
      const sessionId = req.get(MCP_SESSION_ID_HEADER);
      let session: Session;

      // Check if this is an initialize request
      const isInitialize = message.method === 'initialize';

      if (isInitialize) {
        // Initialize request - create new session
        // If a session ID is provided, it should be ignored for initialize
        session = this.sessionManager.createSession();
      } else {
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
      } else {
        // isRequest(message) must be true at this point
        const request = message as JsonRpcRequest;
        // Requests get JSON-RPC response
        res.setHeader('Content-Type', 'application/json');

        // Include session ID header for initialize response
        if (isInitialize && response) {
          res.setHeader(MCP_SESSION_ID_HEADER, session.id);
        }

        if (response) {
          res.status(200).json(response);
        } else {
          // Handler returned null for a request - internal error
          res.status(500).json(
            createErrorResponse(
              request.id,
              createJsonRpcError(JsonRpcErrorCodes.INTERNAL_ERROR, 'Handler returned no response')
            )
          );
        }
      }
    } catch (error) {
      // Unexpected error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        error: `Internal server error: ${errorMessage}`,
      });
    }
  }
}
