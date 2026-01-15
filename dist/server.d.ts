/**
 * Main MCP Server class with graceful shutdown
 *
 * Implements:
 * - Signal handling (SIGTERM/SIGINT)
 * - Request tracking
 * - Graceful shutdown with timeout
 * - Health check updates during shutdown
 */
import type { Config } from './config.js';
import type { LifecycleManager } from './protocol/lifecycle.js';
import type { StdioTransport } from './transport/stdio.js';
import type { HttpTransport } from './transport/http.js';
import type { TelemetryManager } from './observability/telemetry.js';
import type { ExtensionRegistry } from './extensions/framework.js';
export interface ShutdownManagerOptions {
    /**
     * Timeout for shutdown in milliseconds
     */
    timeoutMs: number;
    /**
     * Optional callback to run during shutdown
     */
    onShutdown?: () => Promise<void>;
}
export interface CleanupHandler {
    name: string;
    cleanup: () => Promise<void>;
}
export interface MCPServerOptions {
    config?: Config;
    lifecycleManager?: LifecycleManager;
    stdioTransport?: StdioTransport;
    httpTransport?: HttpTransport;
    telemetryManager?: TelemetryManager;
    extensionRegistry?: ExtensionRegistry;
}
/**
 * Manages graceful shutdown of the MCP server
 *
 * Features:
 * - Signal handling (SIGTERM/SIGINT)
 * - In-flight request tracking
 * - Component cleanup registration
 * - Configurable shutdown timeout
 *
 * @example
 * ```typescript
 * const shutdownManager = new ShutdownManager({ timeoutMs: 30000 });
 *
 * // Register cleanup handlers
 * shutdownManager.register('http', async () => httpTransport.close());
 * shutdownManager.register('telemetry', async () => telemetry.shutdown());
 *
 * // Track requests
 * shutdownManager.trackRequest('req-123');
 * // ... process request ...
 * shutdownManager.completeRequest('req-123');
 *
 * // Install signal handlers
 * shutdownManager.installSignalHandlers();
 * ```
 */
export declare class ShutdownManager {
    private readonly timeoutMs;
    private readonly onShutdown;
    private readonly cleanupHandlers;
    private readonly inFlightRequests;
    private shuttingDown;
    private shutdownPromise;
    private signalHandlersInstalled;
    private readonly boundSigtermHandler;
    private readonly boundSigintHandler;
    constructor(options: ShutdownManagerOptions);
    /**
     * Register a component for cleanup during shutdown.
     * Components are cleaned up in the order they were registered.
     *
     * @param name - Unique name for the component
     * @param cleanup - Async cleanup function
     */
    register(name: string, cleanup: () => Promise<void>): void;
    /**
     * Unregister a previously registered cleanup handler.
     *
     * @param name - Name of the component to unregister
     */
    unregister(name: string): void;
    /**
     * Track an in-flight request.
     * The server will wait for all in-flight requests to complete before shutdown.
     *
     * @param requestId - Unique identifier for the request
     */
    trackRequest(requestId: string): void;
    /**
     * Mark a request as completed.
     *
     * @param requestId - Unique identifier for the request
     */
    completeRequest(requestId: string): void;
    /**
     * Get the number of in-flight requests.
     */
    getInFlightCount(): number;
    /**
     * Check if shutdown is in progress.
     */
    isShuttingDown(): boolean;
    /**
     * Install signal handlers for SIGTERM and SIGINT.
     * Should only be called once.
     */
    installSignalHandlers(): void;
    /**
     * Remove signal handlers.
     * Called during cleanup to prevent memory leaks.
     */
    removeSignalHandlers(): void;
    /**
     * Initiate graceful shutdown.
     *
     * Shutdown sequence:
     * 1. Mark as shutting down (stops accepting new requests)
     * 2. Wait for in-flight requests to complete (with timeout)
     * 3. Call registered cleanup handlers in order
     * 4. Call onShutdown callback if provided
     *
     * @param signal - The signal that triggered shutdown (for logging)
     * @returns Promise that resolves when shutdown is complete
     */
    initiateShutdown(signal?: string): Promise<void>;
    /**
     * Perform the actual shutdown sequence
     */
    private performShutdown;
    /**
     * Wait for all in-flight requests to complete, with timeout
     */
    private waitForInFlightRequests;
    /**
     * Run all registered cleanup handlers in order
     */
    private runCleanupHandlers;
}
/**
 * Main MCP Server class
 *
 * Orchestrates all server components including:
 * - Transport layers (stdio, HTTP)
 * - Protocol lifecycle
 * - Extension framework
 * - Telemetry
 * - Health checks
 *
 * @example
 * ```typescript
 * const server = new MCPServer({ config });
 * await server.start();
 *
 * // Server runs until shutdown signal received
 * ```
 */
export declare class MCPServer {
    private readonly config;
    private readonly lifecycleManager;
    private readonly stdioTransport;
    private readonly httpTransport;
    private readonly telemetryManager;
    private readonly extensionRegistry;
    private shutdownManager;
    private ready;
    private started;
    constructor(options?: MCPServerOptions);
    /**
     * Start the MCP server
     *
     * Initializes all transports and installs signal handlers
     */
    start(): Promise<void>;
    /**
     * Stop the MCP server gracefully
     */
    stop(): Promise<void>;
    /**
     * Check if the server is ready to accept requests.
     * Used by /ready health check endpoint.
     */
    isReady(): boolean;
    /**
     * Check if the server is healthy (alive).
     * Used by /health endpoint.
     */
    isHealthy(): boolean;
    /**
     * Get the shutdown manager for request tracking
     */
    getShutdownManager(): ShutdownManager | null;
    /**
     * Track an incoming request
     */
    trackRequest(requestId: string): void;
    /**
     * Mark a request as completed
     */
    completeRequest(requestId: string): void;
    /**
     * Check if server is accepting new requests
     */
    isAcceptingRequests(): boolean;
    /**
     * Register cleanup handlers for all components
     */
    private registerCleanupHandlers;
}
/**
 * Create a ShutdownManager with default options
 */
export declare function createShutdownManager(options?: Partial<ShutdownManagerOptions>): ShutdownManager;
//# sourceMappingURL=server.d.ts.map