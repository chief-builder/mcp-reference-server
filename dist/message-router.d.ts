/**
 * Central Message Router for MCP Server
 *
 * Routes JSON-RPC messages to appropriate handlers based on method name.
 * Performs lifecycle validation before processing.
 */
import type { Config } from './config.js';
import type { LifecycleManager } from './protocol/lifecycle.js';
import type { ToolRegistry } from './tools/registry.js';
import type { ToolExecutor } from './tools/executor.js';
import type { CompletionHandler } from './completions/handler.js';
import type { LoggingHandler } from './logging/handler.js';
import type { Session } from './transport/session.js';
import { type JsonRpcRequest, type JsonRpcNotification, type JsonRpcResponse } from './protocol/jsonrpc.js';
export interface MessageRouterOptions {
    lifecycleManager: LifecycleManager;
    toolRegistry: ToolRegistry;
    toolExecutor: ToolExecutor;
    completionHandler: CompletionHandler;
    loggingHandler: LoggingHandler;
    config: Config;
}
export interface SessionContext {
    session?: Session;
}
/**
 * Central message router that connects transports to handlers.
 *
 * Responsibilities:
 * - Validates lifecycle state before processing messages
 * - Routes messages to appropriate handlers based on method
 * - Converts handler results to JSON-RPC responses
 */
export declare class MessageRouter {
    private readonly lifecycleManager;
    private readonly toolRegistry;
    private readonly toolExecutor;
    private readonly completionHandler;
    private readonly loggingHandler;
    constructor(options: MessageRouterOptions);
    /**
     * Check session lifecycle state before processing a message.
     * Uses per-session state when available, otherwise falls back to global.
     */
    private checkSessionLifecycle;
    /**
     * Handle initialize request with per-session state.
     * Falls back to global lifecycle manager if no session is provided.
     */
    private handleSessionInitialize;
    /**
     * Handle initialized notification with per-session state.
     * Falls back to global lifecycle manager if no session is provided.
     */
    private handleSessionInitialized;
    /**
     * Route a JSON-RPC message to the appropriate handler.
     *
     * @param message - The JSON-RPC request or notification
     * @param context - Optional session context
     * @returns JSON-RPC response for requests, null for notifications
     */
    handleMessage(message: JsonRpcRequest | JsonRpcNotification, context?: SessionContext): Promise<JsonRpcResponse | null>;
    /**
     * Route a message to the appropriate handler based on method.
     */
    private routeMessage;
}
/**
 * Create a new MessageRouter instance.
 *
 * @param options - Router options
 * @returns A new MessageRouter instance
 */
export declare function createMessageRouter(options: MessageRouterOptions): MessageRouter;
//# sourceMappingURL=message-router.d.ts.map