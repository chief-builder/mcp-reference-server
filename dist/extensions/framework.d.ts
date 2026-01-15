/**
 * Extension negotiation framework
 *
 * Implements MCP extension capability negotiation during initialization.
 * Extensions use namespace/name format (e.g., 'anthropic/oauth-m2m').
 */
import { z } from 'zod';
/**
 * Extension definition for registering with the framework.
 */
export interface Extension {
    /** Full extension name in namespace/extension-name format */
    name: string;
    /** Optional description of the extension */
    description?: string | undefined;
    /** Optional version string */
    version?: string | undefined;
    /** Extension-specific settings */
    settings?: Record<string, unknown> | undefined;
    /**
     * Called when the extension is enabled during initialization.
     * @param clientSettings Settings provided by the client for this extension
     */
    onInitialize?: ((clientSettings: unknown) => Promise<void>) | undefined;
    /**
     * Called when the server is shutting down.
     */
    onShutdown?: (() => Promise<void>) | undefined;
}
/**
 * Extension capability as advertised in capabilities.experimental
 */
export interface ExtensionCapability {
    /** Full extension name */
    name: string;
    /** Extension-specific settings */
    settings?: Record<string, unknown> | undefined;
}
/**
 * Result of extension negotiation
 */
export interface ExtensionNegotiationResult {
    /** Map of enabled extension names to their negotiated capabilities */
    enabled: Record<string, ExtensionCapability>;
}
/**
 * Zod schema for validating extension names
 */
export declare const ExtensionNameSchema: z.ZodString;
/**
 * Validate an extension name format.
 * @param name Extension name to validate
 * @returns true if valid
 * @throws Error if invalid
 */
export declare function validateExtensionName(name: string): boolean;
/**
 * Check if an extension name is valid without throwing.
 * @param name Extension name to check
 * @returns true if valid, false otherwise
 */
export declare function isValidExtensionName(name: string): boolean;
/**
 * Parse an extension name into namespace and extension parts.
 * @param name Full extension name
 * @returns Object with namespace and extension properties
 */
export declare function parseExtensionName(name: string): {
    namespace: string;
    extension: string;
};
/**
 * Error thrown for extension-related issues
 */
export declare class ExtensionError extends Error {
    constructor(message: string);
}
/**
 * Registry for managing server-side extensions.
 * Extensions must be registered before negotiation can occur.
 */
export declare class ExtensionRegistry {
    private extensions;
    private enabledExtensions;
    /**
     * Register an extension with the registry.
     * @param extension Extension to register
     * @throws ExtensionError if extension name is invalid or already registered
     */
    registerExtension(extension: Extension): void;
    /**
     * Unregister an extension from the registry.
     * @param name Extension name to unregister
     * @throws ExtensionError if extension is not registered
     */
    unregisterExtension(name: string): void;
    /**
     * Get a registered extension by name.
     * @param name Extension name
     * @returns Extension if found, undefined otherwise
     */
    getExtension(name: string): Extension | undefined;
    /**
     * List all registered extensions.
     * @returns Array of registered extensions
     */
    listExtensions(): Extension[];
    /**
     * Check if an extension is registered.
     * @param name Extension name
     * @returns true if registered
     */
    hasExtension(name: string): boolean;
    /**
     * Get supported extensions for capability advertisement.
     * Used during initialization to tell client what extensions server supports.
     * @returns Record of extension names to their capability info
     */
    getSupportedExtensions(): Record<string, ExtensionCapability>;
    /**
     * Check if an extension is enabled for the current session.
     * @param name Extension name
     * @returns true if enabled
     */
    isEnabled(name: string): boolean;
    /**
     * Get all enabled extensions for the current session.
     * @returns Map of enabled extension names to their capabilities
     */
    getEnabledExtensions(): Map<string, ExtensionCapability>;
    /**
     * Enable an extension for the current session.
     * Internal method used during negotiation.
     * @param name Extension name
     * @param capability Negotiated capability
     */
    enableExtension(name: string, capability: ExtensionCapability): void;
    /**
     * Clear all enabled extensions.
     * Called during shutdown or session reset.
     */
    clearEnabledExtensions(): void;
    /**
     * Shutdown all enabled extensions.
     * Calls onShutdown for each enabled extension.
     */
    shutdown(): Promise<void>;
}
/**
 * Negotiate extensions between client and server during initialization.
 *
 * The client advertises supported extensions in capabilities.experimental.
 * The server responds with its supported extensions.
 * Only mutually supported extensions are enabled.
 *
 * @param clientExperimental Client's experimental capabilities (from initialize params)
 * @param registry Server's extension registry
 * @returns Negotiation result with enabled extensions
 */
export declare function negotiateExtensions(clientExperimental: Record<string, unknown> | undefined, registry: ExtensionRegistry): Promise<ExtensionNegotiationResult>;
/**
 * Build experimental capabilities for server response.
 * Includes both enabled extensions and any additional experimental features.
 *
 * @param registry Extension registry
 * @param additionalExperimental Additional experimental capabilities
 * @returns Experimental capabilities object for initialize result
 */
export declare function buildExperimentalCapabilities(registry: ExtensionRegistry, additionalExperimental?: Record<string, unknown>): Record<string, unknown>;
/**
 * Create a registry with default built-in extensions registered.
 * @returns ExtensionRegistry with built-in extensions
 */
export declare function createDefaultRegistry(): ExtensionRegistry;
/**
 * @deprecated Use negotiateExtensions instead
 */
export interface ExtensionNegotiationRequest {
    extensions: Array<{
        name: string;
        version: string;
    }>;
}
/**
 * @deprecated Use ExtensionRegistry instead
 */
export declare class ExtensionFramework {
    private registry;
    constructor();
    register(extension: Extension): void;
    negotiate(request: ExtensionNegotiationRequest): Promise<{
        enabled: Array<{
            name: string;
            version: string;
        }>;
    }>;
    isEnabled(name: string): boolean;
    shutdown(): Promise<void>;
}
//# sourceMappingURL=framework.d.ts.map