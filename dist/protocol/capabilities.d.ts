/**
 * MCP Capability negotiation
 *
 * Implements capability advertisement, recognition, and enforcement for MCP protocol.
 * Ensures server/client only use features that have been mutually negotiated.
 */
import type { ClientCapabilities, ServerCapabilities, LifecycleManager } from './lifecycle.js';
import { type JsonRpcError } from './jsonrpc.js';
export declare const DEFAULT_SERVER_INFO: {
    readonly name: "mcp-reference-server";
    readonly version: "1.0.0";
    readonly description: "MCP 2025-11-25 Reference Implementation";
};
export interface NegotiatedCapabilities {
    client: ClientCapabilities;
    server: ServerCapabilities;
}
/**
 * Capability path for checking nested capabilities
 * Examples: 'tools.listChanged', 'roots.listChanged', 'logging', 'experimental.oauth-m2m'
 */
export type CapabilityPath = string;
export declare class CapabilityError extends Error {
    readonly code: number;
    readonly data?: unknown;
    constructor(message: string, data?: unknown);
    toJsonRpcError(): JsonRpcError;
}
/**
 * Manages capability negotiation and enforcement for MCP sessions.
 * Works alongside LifecycleManager to provide capability-aware request handling.
 */
export declare class CapabilityManager {
    private lifecycleManager;
    private serverCapabilities;
    constructor(lifecycleManager: LifecycleManager, serverCapabilities?: ServerCapabilities);
    /**
     * Get the server capabilities that will be advertised to clients
     */
    getServerCapabilities(): ServerCapabilities;
    /**
     * Get the client capabilities (available after initialization)
     */
    getClientCapabilities(): ClientCapabilities | null;
    /**
     * Get both client and server capabilities as a negotiated pair
     * Returns null if not yet initialized
     */
    getNegotiatedCapabilities(): NegotiatedCapabilities | null;
    /**
     * Check if the client advertised a specific capability.
     * Use dot notation for nested capabilities: 'roots.listChanged'
     */
    hasClientCapability(path: CapabilityPath): boolean;
    /**
     * Check if the server supports a specific capability.
     * Use dot notation for nested capabilities: 'tools.listChanged'
     */
    hasServerCapability(path: CapabilityPath): boolean;
    /**
     * Require that the client has advertised a specific capability.
     * Throws CapabilityError if the capability is not present.
     * Use this before sending notifications that require client support.
     */
    requireClientCapability(path: CapabilityPath): void;
    /**
     * Require that the server supports a specific capability.
     * Throws CapabilityError if the capability is not present.
     * Use this to reject requests for unsupported features.
     */
    requireServerCapability(path: CapabilityPath): void;
    /**
     * Check if a method is allowed based on server capabilities.
     * Returns true if the method can be handled, false otherwise.
     */
    isMethodAllowed(method: string): boolean;
    /**
     * Validate that a method can be handled based on server capabilities.
     * Throws CapabilityError if the server doesn't support the required capability.
     */
    validateMethodCapability(method: string): void;
    /**
     * Check if a notification can be sent to the client based on their capabilities.
     * Returns true if the client supports receiving the notification.
     */
    canSendNotification(notificationMethod: string): boolean;
    /**
     * Validate that a notification can be sent to the client.
     * Throws CapabilityError if the client doesn't support the notification.
     */
    validateNotificationCapability(notificationMethod: string): void;
}
/**
 * Get default server capabilities for the reference implementation
 */
export declare function getDefaultServerCapabilities(): ServerCapabilities;
/**
 * Negotiate capabilities between client and server.
 * Returns the effective capabilities for the session.
 */
export declare function negotiateCapabilities(clientCapabilities: ClientCapabilities, serverCapabilities: ServerCapabilities): NegotiatedCapabilities;
/**
 * Check if a capability exists at a given path in a capabilities object.
 * Supports dot notation for nested paths: 'roots.listChanged', 'experimental.oauth-m2m'
 */
export declare function hasCapabilityAtPath(capabilities: ClientCapabilities | ServerCapabilities, path: CapabilityPath): boolean;
/**
 * Get value at a capability path, or undefined if not present
 */
export declare function getCapabilityAtPath(capabilities: ClientCapabilities | ServerCapabilities, path: CapabilityPath): unknown;
/**
 * Maps method names to required server capabilities.
 * Methods not in this map don't require specific capabilities.
 */
export declare function getMethodCapabilityMapping(): Record<string, CapabilityPath>;
/**
 * Maps notification names to required client capabilities.
 * Server MUST NOT send notifications for capabilities client didn't advertise.
 */
export declare function getNotificationCapabilityMapping(): Record<string, CapabilityPath>;
/**
 * @deprecated Use CapabilityManager.hasClientCapability or hasCapabilityAtPath instead
 */
export declare function hasCapability(capabilities: ClientCapabilities | ServerCapabilities, name: string): boolean;
/**
 * @deprecated Use CapabilityManager.requireClientCapability or requireServerCapability instead
 */
export declare function requireCapability(capabilities: ClientCapabilities | ServerCapabilities, name: string): void;
//# sourceMappingURL=capabilities.d.ts.map