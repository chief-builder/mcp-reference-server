/**
 * MCP Capability negotiation
 *
 * Implements capability advertisement, recognition, and enforcement for MCP protocol.
 * Ensures server/client only use features that have been mutually negotiated.
 */
import { JsonRpcErrorCodes, createJsonRpcError } from './jsonrpc.js';
// =============================================================================
// Constants - Default Server Capabilities
// =============================================================================
export const DEFAULT_SERVER_INFO = {
    name: 'mcp-reference-server',
    version: '1.0.0',
    description: 'MCP 2025-11-25 Reference Implementation',
};
// =============================================================================
// Capability Error
// =============================================================================
export class CapabilityError extends Error {
    code;
    data;
    constructor(message, data) {
        super(message);
        this.name = 'CapabilityError';
        this.code = JsonRpcErrorCodes.INVALID_REQUEST;
        this.data = data;
    }
    toJsonRpcError() {
        return createJsonRpcError(this.code, this.message, this.data);
    }
}
// =============================================================================
// Capability Manager
// =============================================================================
/**
 * Manages capability negotiation and enforcement for MCP sessions.
 * Works alongside LifecycleManager to provide capability-aware request handling.
 */
export class CapabilityManager {
    lifecycleManager;
    serverCapabilities;
    constructor(lifecycleManager, serverCapabilities) {
        this.lifecycleManager = lifecycleManager;
        this.serverCapabilities = serverCapabilities ?? getDefaultServerCapabilities();
    }
    /**
     * Get the server capabilities that will be advertised to clients
     */
    getServerCapabilities() {
        return this.serverCapabilities;
    }
    /**
     * Get the client capabilities (available after initialization)
     */
    getClientCapabilities() {
        return this.lifecycleManager.getClientCapabilities();
    }
    /**
     * Get both client and server capabilities as a negotiated pair
     * Returns null if not yet initialized
     */
    getNegotiatedCapabilities() {
        const clientCaps = this.getClientCapabilities();
        if (!clientCaps) {
            return null;
        }
        return {
            client: clientCaps,
            server: this.serverCapabilities,
        };
    }
    /**
     * Check if the client advertised a specific capability.
     * Use dot notation for nested capabilities: 'roots.listChanged'
     */
    hasClientCapability(path) {
        const clientCaps = this.getClientCapabilities();
        if (!clientCaps) {
            return false;
        }
        return hasCapabilityAtPath(clientCaps, path);
    }
    /**
     * Check if the server supports a specific capability.
     * Use dot notation for nested capabilities: 'tools.listChanged'
     */
    hasServerCapability(path) {
        return hasCapabilityAtPath(this.serverCapabilities, path);
    }
    /**
     * Require that the client has advertised a specific capability.
     * Throws CapabilityError if the capability is not present.
     * Use this before sending notifications that require client support.
     */
    requireClientCapability(path) {
        if (!this.hasClientCapability(path)) {
            throw new CapabilityError(`Client does not support required capability: ${path}`, { requiredCapability: path });
        }
    }
    /**
     * Require that the server supports a specific capability.
     * Throws CapabilityError if the capability is not present.
     * Use this to reject requests for unsupported features.
     */
    requireServerCapability(path) {
        if (!this.hasServerCapability(path)) {
            throw new CapabilityError(`Server does not support required capability: ${path}`, { requiredCapability: path });
        }
    }
    /**
     * Check if a method is allowed based on server capabilities.
     * Returns true if the method can be handled, false otherwise.
     */
    isMethodAllowed(method) {
        const capabilityMapping = getMethodCapabilityMapping();
        const requiredCapability = capabilityMapping[method];
        // Methods without capability requirements are always allowed
        if (!requiredCapability) {
            return true;
        }
        return this.hasServerCapability(requiredCapability);
    }
    /**
     * Validate that a method can be handled based on server capabilities.
     * Throws CapabilityError if the server doesn't support the required capability.
     */
    validateMethodCapability(method) {
        const capabilityMapping = getMethodCapabilityMapping();
        const requiredCapability = capabilityMapping[method];
        if (requiredCapability && !this.hasServerCapability(requiredCapability)) {
            throw new CapabilityError(`Method '${method}' requires capability '${requiredCapability}' which is not supported`, { method, requiredCapability });
        }
    }
    /**
     * Check if a notification can be sent to the client based on their capabilities.
     * Returns true if the client supports receiving the notification.
     */
    canSendNotification(notificationMethod) {
        const notificationMapping = getNotificationCapabilityMapping();
        const requiredCapability = notificationMapping[notificationMethod];
        // Notifications without capability requirements can always be sent
        if (!requiredCapability) {
            return true;
        }
        return this.hasClientCapability(requiredCapability);
    }
    /**
     * Validate that a notification can be sent to the client.
     * Throws CapabilityError if the client doesn't support the notification.
     */
    validateNotificationCapability(notificationMethod) {
        if (!this.canSendNotification(notificationMethod)) {
            const notificationMapping = getNotificationCapabilityMapping();
            const requiredCapability = notificationMapping[notificationMethod];
            throw new CapabilityError(`Cannot send '${notificationMethod}' notification: client does not support '${requiredCapability}'`, { notificationMethod, requiredCapability });
        }
    }
}
// =============================================================================
// Utility Functions
// =============================================================================
/**
 * Get default server capabilities for the reference implementation
 */
export function getDefaultServerCapabilities() {
    return {
        tools: {
            listChanged: true,
        },
        logging: {},
        completions: {},
        experimental: {
            'oauth-m2m': {},
        },
    };
}
/**
 * Negotiate capabilities between client and server.
 * Returns the effective capabilities for the session.
 */
export function negotiateCapabilities(clientCapabilities, serverCapabilities) {
    // For MCP, negotiation is straightforward - each side advertises what they support
    // The server stores client capabilities to know what notifications it can send
    // The client stores server capabilities to know what methods it can call
    return {
        client: clientCapabilities,
        server: serverCapabilities,
    };
}
/**
 * Check if a capability exists at a given path in a capabilities object.
 * Supports dot notation for nested paths: 'roots.listChanged', 'experimental.oauth-m2m'
 */
export function hasCapabilityAtPath(capabilities, path) {
    const parts = path.split('.');
    let current = capabilities;
    for (const part of parts) {
        if (current === null || current === undefined) {
            return false;
        }
        if (typeof current !== 'object') {
            return false;
        }
        current = current[part];
    }
    // The capability exists if we found a non-undefined value at the path
    // For boolean capabilities, they must be true
    // For object capabilities (like logging: {}), their presence is sufficient
    if (current === undefined) {
        return false;
    }
    if (typeof current === 'boolean') {
        return current;
    }
    // Object capabilities are considered present if the object exists
    return true;
}
/**
 * Get value at a capability path, or undefined if not present
 */
export function getCapabilityAtPath(capabilities, path) {
    const parts = path.split('.');
    let current = capabilities;
    for (const part of parts) {
        if (current === null || current === undefined) {
            return undefined;
        }
        if (typeof current !== 'object') {
            return undefined;
        }
        current = current[part];
    }
    return current;
}
/**
 * Maps method names to required server capabilities.
 * Methods not in this map don't require specific capabilities.
 */
export function getMethodCapabilityMapping() {
    return {
        // Tools methods
        'tools/list': 'tools',
        'tools/call': 'tools',
        // Resources methods
        'resources/list': 'resources',
        'resources/read': 'resources',
        'resources/subscribe': 'resources.subscribe',
        'resources/unsubscribe': 'resources.subscribe',
        'resources/templates/list': 'resources',
        // Prompts methods
        'prompts/list': 'prompts',
        'prompts/get': 'prompts',
        // Logging methods
        'logging/setLevel': 'logging',
        // Completion methods
        'completion/complete': 'completions',
        // Roots methods (server-initiated)
        'roots/list': 'roots',
    };
}
/**
 * Maps notification names to required client capabilities.
 * Server MUST NOT send notifications for capabilities client didn't advertise.
 */
export function getNotificationCapabilityMapping() {
    return {
        // Roots notifications - client must support roots.listChanged
        'notifications/roots/listChanged': 'roots.listChanged',
        // Note: The following are server-to-client notifications that don't require
        // specific client capabilities (they're based on server capabilities):
        // - notifications/tools/listChanged (server advertises tools.listChanged)
        // - notifications/resources/listChanged (server advertises resources.listChanged)
        // - notifications/prompts/listChanged (server advertises prompts.listChanged)
        // - notifications/resources/updated (for subscribed resources)
        // - notifications/message (logging messages)
        // - notifications/progress (progress updates)
        // - notifications/cancelled (operation cancelled)
    };
}
// =============================================================================
// Legacy exports for backwards compatibility
// =============================================================================
/**
 * @deprecated Use CapabilityManager.hasClientCapability or hasCapabilityAtPath instead
 */
export function hasCapability(capabilities, name) {
    return hasCapabilityAtPath(capabilities, name);
}
/**
 * @deprecated Use CapabilityManager.requireClientCapability or requireServerCapability instead
 */
export function requireCapability(capabilities, name) {
    if (!hasCapabilityAtPath(capabilities, name)) {
        throw new CapabilityError(`Required capability not present: ${name}`, { requiredCapability: name });
    }
}
//# sourceMappingURL=capabilities.js.map