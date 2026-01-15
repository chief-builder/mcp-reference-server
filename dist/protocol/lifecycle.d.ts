/**
 * MCP Lifecycle handling - Initialize/shutdown
 *
 * Implements the MCP protocol lifecycle management including:
 * - Server state machine (uninitialized -> initializing -> ready -> shutting_down)
 * - Initialization handshake
 * - Protocol version validation
 * - Pre-initialization request rejection
 * - Graceful shutdown
 */
import { z } from 'zod';
import { JsonRpcRequest, JsonRpcNotification, JsonRpcErrorResponse } from './jsonrpc.js';
export declare const PROTOCOL_VERSION: "2025-11-25";
export type ServerState = 'uninitialized' | 'initializing' | 'ready' | 'shutting_down';
export interface ClientCapabilities {
    roots?: {
        listChanged?: boolean | undefined;
    } | undefined;
    sampling?: Record<string, unknown> | undefined;
    experimental?: Record<string, unknown> | undefined;
}
export interface ServerCapabilities {
    tools?: {
        listChanged?: boolean;
    };
    resources?: {
        subscribe?: boolean;
        listChanged?: boolean;
    };
    prompts?: {
        listChanged?: boolean;
    };
    logging?: Record<string, unknown>;
    experimental?: Record<string, unknown>;
}
export interface InitializeParams {
    protocolVersion: string;
    capabilities: ClientCapabilities;
    clientInfo: {
        name: string;
        version: string;
    };
}
export interface InitializeResult {
    protocolVersion: string;
    capabilities: ServerCapabilities;
    serverInfo: {
        name: string;
        version: string;
        description?: string;
    };
    instructions?: string;
}
export declare const ClientCapabilitiesSchema: z.ZodObject<{
    roots: z.ZodOptional<z.ZodObject<{
        listChanged: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        listChanged?: boolean | undefined;
    }, {
        listChanged?: boolean | undefined;
    }>>;
    sampling: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    experimental: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    roots?: {
        listChanged?: boolean | undefined;
    } | undefined;
    sampling?: Record<string, unknown> | undefined;
    experimental?: Record<string, unknown> | undefined;
}, {
    roots?: {
        listChanged?: boolean | undefined;
    } | undefined;
    sampling?: Record<string, unknown> | undefined;
    experimental?: Record<string, unknown> | undefined;
}>;
export declare const InitializeParamsSchema: z.ZodObject<{
    protocolVersion: z.ZodString;
    capabilities: z.ZodObject<{
        roots: z.ZodOptional<z.ZodObject<{
            listChanged: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            listChanged?: boolean | undefined;
        }, {
            listChanged?: boolean | undefined;
        }>>;
        sampling: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        experimental: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        roots?: {
            listChanged?: boolean | undefined;
        } | undefined;
        sampling?: Record<string, unknown> | undefined;
        experimental?: Record<string, unknown> | undefined;
    }, {
        roots?: {
            listChanged?: boolean | undefined;
        } | undefined;
        sampling?: Record<string, unknown> | undefined;
        experimental?: Record<string, unknown> | undefined;
    }>;
    clientInfo: z.ZodObject<{
        name: z.ZodString;
        version: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        version: string;
    }, {
        name: string;
        version: string;
    }>;
}, "strip", z.ZodTypeAny, {
    protocolVersion: string;
    capabilities: {
        roots?: {
            listChanged?: boolean | undefined;
        } | undefined;
        sampling?: Record<string, unknown> | undefined;
        experimental?: Record<string, unknown> | undefined;
    };
    clientInfo: {
        name: string;
        version: string;
    };
}, {
    protocolVersion: string;
    capabilities: {
        roots?: {
            listChanged?: boolean | undefined;
        } | undefined;
        sampling?: Record<string, unknown> | undefined;
        experimental?: Record<string, unknown> | undefined;
    };
    clientInfo: {
        name: string;
        version: string;
    };
}>;
export interface ServerConfig {
    name: string;
    version: string;
    description?: string;
    capabilities?: ServerCapabilities;
    instructions?: string;
}
export declare class LifecycleManager {
    private state;
    private clientInfo;
    private clientCapabilities;
    private serverConfig;
    constructor(config: ServerConfig);
    /**
     * Get the current server state
     */
    getState(): ServerState;
    /**
     * Get stored client info (available after initialization)
     */
    getClientInfo(): {
        name: string;
        version: string;
    } | null;
    /**
     * Get stored client capabilities (available after initialization)
     */
    getClientCapabilities(): ClientCapabilities | null;
    /**
     * Check if a request should be rejected due to server not being initialized.
     * Returns an error response if request should be rejected, null otherwise.
     */
    checkPreInitialization(message: JsonRpcRequest | JsonRpcNotification): JsonRpcErrorResponse | null;
    /**
     * Handle the initialize request.
     * Returns InitializeResult on success, throws on error.
     */
    handleInitialize(params: unknown): InitializeResult;
    /**
     * Handle the initialized notification.
     * Transitions server to ready state.
     */
    handleInitialized(): void;
    /**
     * Initiate server shutdown.
     * Returns true if shutdown was initiated, false if already shutting down.
     */
    initiateShutdown(): boolean;
    /**
     * Check if the server is in a state that allows normal operations.
     */
    isOperational(): boolean;
    /**
     * Reset the lifecycle manager to initial state.
     * Useful for testing or server restart scenarios.
     */
    reset(): void;
}
export declare class LifecycleError extends Error {
    readonly code: number;
    readonly data?: unknown;
    constructor(code: number, message: string, data?: unknown);
    toJsonRpcError(): {
        code: number;
        message: string;
        data?: unknown;
    };
}
/**
 * @deprecated Use LifecycleManager instead
 */
export declare function handleInitialize(_params: InitializeParams): Promise<InitializeResult>;
/**
 * @deprecated Use LifecycleManager instead
 */
export declare function handleShutdown(): Promise<void>;
//# sourceMappingURL=lifecycle.d.ts.map