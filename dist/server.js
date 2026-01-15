/**
 * Main MCP Server class with graceful shutdown
 *
 * Implements:
 * - Signal handling (SIGTERM/SIGINT)
 * - Request tracking
 * - Graceful shutdown with timeout
 * - Health check updates during shutdown
 */
// =============================================================================
// ShutdownManager Class
// =============================================================================
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
export class ShutdownManager {
    timeoutMs;
    onShutdown;
    cleanupHandlers = new Map();
    inFlightRequests = new Set();
    shuttingDown = false;
    shutdownPromise = null;
    signalHandlersInstalled = false;
    // Bound signal handlers for cleanup
    boundSigtermHandler;
    boundSigintHandler;
    constructor(options) {
        this.timeoutMs = options.timeoutMs;
        this.onShutdown = options.onShutdown;
        // Bind handlers for proper cleanup
        this.boundSigtermHandler = () => {
            void this.initiateShutdown('SIGTERM');
        };
        this.boundSigintHandler = () => {
            void this.initiateShutdown('SIGINT');
        };
    }
    // ===========================================================================
    // Public API
    // ===========================================================================
    /**
     * Register a component for cleanup during shutdown.
     * Components are cleaned up in the order they were registered.
     *
     * @param name - Unique name for the component
     * @param cleanup - Async cleanup function
     */
    register(name, cleanup) {
        if (this.shuttingDown) {
            throw new Error('Cannot register cleanup handlers during shutdown');
        }
        this.cleanupHandlers.set(name, cleanup);
    }
    /**
     * Unregister a previously registered cleanup handler.
     *
     * @param name - Name of the component to unregister
     */
    unregister(name) {
        this.cleanupHandlers.delete(name);
    }
    /**
     * Track an in-flight request.
     * The server will wait for all in-flight requests to complete before shutdown.
     *
     * @param requestId - Unique identifier for the request
     */
    trackRequest(requestId) {
        if (!this.shuttingDown) {
            this.inFlightRequests.add(requestId);
        }
        // If shutting down, we don't track new requests
    }
    /**
     * Mark a request as completed.
     *
     * @param requestId - Unique identifier for the request
     */
    completeRequest(requestId) {
        this.inFlightRequests.delete(requestId);
    }
    /**
     * Get the number of in-flight requests.
     */
    getInFlightCount() {
        return this.inFlightRequests.size;
    }
    /**
     * Check if shutdown is in progress.
     */
    isShuttingDown() {
        return this.shuttingDown;
    }
    /**
     * Install signal handlers for SIGTERM and SIGINT.
     * Should only be called once.
     */
    installSignalHandlers() {
        if (this.signalHandlersInstalled) {
            return;
        }
        process.on('SIGTERM', this.boundSigtermHandler);
        process.on('SIGINT', this.boundSigintHandler);
        this.signalHandlersInstalled = true;
    }
    /**
     * Remove signal handlers.
     * Called during cleanup to prevent memory leaks.
     */
    removeSignalHandlers() {
        if (!this.signalHandlersInstalled) {
            return;
        }
        process.removeListener('SIGTERM', this.boundSigtermHandler);
        process.removeListener('SIGINT', this.boundSigintHandler);
        this.signalHandlersInstalled = false;
    }
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
    async initiateShutdown(signal = 'manual') {
        // Idempotent - return existing promise if already shutting down
        if (this.shutdownPromise) {
            return this.shutdownPromise;
        }
        this.shuttingDown = true;
        this.shutdownPromise = this.performShutdown(signal);
        try {
            await this.shutdownPromise;
        }
        finally {
            // Clean up signal handlers
            this.removeSignalHandlers();
        }
    }
    // ===========================================================================
    // Private Methods
    // ===========================================================================
    /**
     * Perform the actual shutdown sequence
     */
    async performShutdown(signal) {
        console.error(`[ShutdownManager] Received ${signal}, initiating graceful shutdown...`);
        // Step 1: Wait for in-flight requests with timeout
        await this.waitForInFlightRequests();
        // Step 2: Run cleanup handlers
        await this.runCleanupHandlers();
        // Step 3: Call onShutdown callback
        if (this.onShutdown) {
            try {
                await this.onShutdown();
            }
            catch (error) {
                console.error('[ShutdownManager] Error in onShutdown callback:', error);
            }
        }
        console.error('[ShutdownManager] Shutdown complete');
    }
    /**
     * Wait for all in-flight requests to complete, with timeout
     */
    async waitForInFlightRequests() {
        if (this.inFlightRequests.size === 0) {
            console.error('[ShutdownManager] No in-flight requests');
            return;
        }
        console.error(`[ShutdownManager] Waiting for ${this.inFlightRequests.size} in-flight requests...`);
        const startTime = Date.now();
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                if (this.inFlightRequests.size === 0) {
                    clearInterval(checkInterval);
                    console.error('[ShutdownManager] All in-flight requests completed');
                    resolve();
                    return;
                }
                if (elapsed >= this.timeoutMs) {
                    clearInterval(checkInterval);
                    console.error(`[ShutdownManager] Timeout waiting for in-flight requests. ` +
                        `Forcing shutdown with ${this.inFlightRequests.size} pending requests.`);
                    resolve();
                    return;
                }
            }, 100); // Check every 100ms
        });
    }
    /**
     * Run all registered cleanup handlers in order
     */
    async runCleanupHandlers() {
        console.error(`[ShutdownManager] Running ${this.cleanupHandlers.size} cleanup handlers...`);
        for (const [name, cleanup] of this.cleanupHandlers) {
            try {
                console.error(`[ShutdownManager] Cleaning up: ${name}`);
                await cleanup();
            }
            catch (error) {
                console.error(`[ShutdownManager] Error cleaning up ${name}:`, error);
                // Continue with other handlers even if one fails
            }
        }
    }
}
// =============================================================================
// MCPServer Class
// =============================================================================
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
export class MCPServer {
    config;
    lifecycleManager;
    stdioTransport;
    httpTransport;
    telemetryManager;
    extensionRegistry;
    shutdownManager = null;
    ready = false;
    started = false;
    constructor(options) {
        this.config = options?.config;
        this.lifecycleManager = options?.lifecycleManager;
        this.stdioTransport = options?.stdioTransport;
        this.httpTransport = options?.httpTransport;
        this.telemetryManager = options?.telemetryManager;
        this.extensionRegistry = options?.extensionRegistry;
    }
    /**
     * Start the MCP server
     *
     * Initializes all transports and installs signal handlers
     */
    async start() {
        if (this.started) {
            return;
        }
        // Initialize shutdown manager
        const timeoutMs = this.config?.shutdownTimeoutMs ?? 30000;
        this.shutdownManager = new ShutdownManager({
            timeoutMs,
            onShutdown: async () => {
                // Final cleanup callback
            },
        });
        // Register cleanup handlers
        this.registerCleanupHandlers();
        // Install signal handlers
        this.shutdownManager.installSignalHandlers();
        // Start transports
        if (this.stdioTransport) {
            this.stdioTransport.start();
        }
        if (this.httpTransport) {
            await this.httpTransport.start();
        }
        // Start telemetry
        if (this.telemetryManager) {
            await this.telemetryManager.start();
        }
        this.started = true;
        this.ready = true;
    }
    /**
     * Stop the MCP server gracefully
     */
    async stop() {
        if (this.shutdownManager) {
            await this.shutdownManager.initiateShutdown('stop');
        }
    }
    /**
     * Check if the server is ready to accept requests.
     * Used by /ready health check endpoint.
     */
    isReady() {
        if (this.shutdownManager?.isShuttingDown()) {
            return false;
        }
        return this.ready;
    }
    /**
     * Check if the server is healthy (alive).
     * Used by /health endpoint.
     */
    isHealthy() {
        return this.started;
    }
    /**
     * Get the shutdown manager for request tracking
     */
    getShutdownManager() {
        return this.shutdownManager;
    }
    /**
     * Track an incoming request
     */
    trackRequest(requestId) {
        this.shutdownManager?.trackRequest(requestId);
    }
    /**
     * Mark a request as completed
     */
    completeRequest(requestId) {
        this.shutdownManager?.completeRequest(requestId);
    }
    /**
     * Check if server is accepting new requests
     */
    isAcceptingRequests() {
        return this.ready && !this.shutdownManager?.isShuttingDown();
    }
    // ===========================================================================
    // Private Methods
    // ===========================================================================
    /**
     * Register cleanup handlers for all components
     */
    registerCleanupHandlers() {
        if (!this.shutdownManager) {
            return;
        }
        // Lifecycle manager - mark as shutting down
        if (this.lifecycleManager) {
            this.shutdownManager.register('lifecycle', async () => {
                this.lifecycleManager.initiateShutdown();
            });
        }
        // HTTP transport - close HTTP server and SSE streams
        if (this.httpTransport) {
            this.shutdownManager.register('http', async () => {
                await this.httpTransport.close();
            });
        }
        // Stdio transport - close gracefully
        if (this.stdioTransport) {
            this.shutdownManager.register('stdio', async () => {
                await this.stdioTransport.close();
            });
        }
        // Extension registry - shutdown all extensions
        if (this.extensionRegistry) {
            this.shutdownManager.register('extensions', async () => {
                await this.extensionRegistry.shutdown();
            });
        }
        // Telemetry - flush traces/metrics
        if (this.telemetryManager) {
            this.shutdownManager.register('telemetry', async () => {
                await this.telemetryManager.shutdown();
            });
        }
        // Final: mark as not ready
        this.shutdownManager.register('readiness', async () => {
            this.ready = false;
        });
    }
}
// =============================================================================
// Factory Functions
// =============================================================================
/**
 * Create a ShutdownManager with default options
 */
export function createShutdownManager(options) {
    const managerOptions = {
        timeoutMs: options?.timeoutMs ?? 30000,
    };
    if (options?.onShutdown) {
        managerOptions.onShutdown = options.onShutdown;
    }
    return new ShutdownManager(managerOptions);
}
//# sourceMappingURL=server.js.map