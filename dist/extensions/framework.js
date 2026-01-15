/**
 * Extension negotiation framework
 *
 * Implements MCP extension capability negotiation during initialization.
 * Extensions use namespace/name format (e.g., 'anthropic/oauth-m2m').
 */
import { z } from 'zod';
// =============================================================================
// Constants
// =============================================================================
/**
 * Regex pattern for valid extension names.
 * Format: namespace/extension-name
 * - namespace: lowercase letters, numbers, hyphens
 * - extension-name: lowercase letters, numbers, hyphens
 */
const EXTENSION_NAME_PATTERN = /^[a-z0-9-]+\/[a-z0-9-]+$/;
// =============================================================================
// Validation
// =============================================================================
/**
 * Zod schema for validating extension names
 */
export const ExtensionNameSchema = z.string().regex(EXTENSION_NAME_PATTERN, 'Extension name must be in namespace/extension-name format (e.g., anthropic/oauth-m2m)');
/**
 * Validate an extension name format.
 * @param name Extension name to validate
 * @returns true if valid
 * @throws Error if invalid
 */
export function validateExtensionName(name) {
    const result = ExtensionNameSchema.safeParse(name);
    if (!result.success) {
        throw new ExtensionError(`Invalid extension name '${name}': ${result.error.issues[0]?.message ?? 'unknown error'}`);
    }
    return true;
}
/**
 * Check if an extension name is valid without throwing.
 * @param name Extension name to check
 * @returns true if valid, false otherwise
 */
export function isValidExtensionName(name) {
    return EXTENSION_NAME_PATTERN.test(name);
}
/**
 * Parse an extension name into namespace and extension parts.
 * @param name Full extension name
 * @returns Object with namespace and extension properties
 */
export function parseExtensionName(name) {
    validateExtensionName(name);
    const [namespace, extension] = name.split('/');
    return { namespace, extension };
}
// =============================================================================
// Errors
// =============================================================================
/**
 * Error thrown for extension-related issues
 */
export class ExtensionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ExtensionError';
    }
}
// =============================================================================
// Extension Registry
// =============================================================================
/**
 * Registry for managing server-side extensions.
 * Extensions must be registered before negotiation can occur.
 */
export class ExtensionRegistry {
    extensions = new Map();
    enabledExtensions = new Map();
    /**
     * Register an extension with the registry.
     * @param extension Extension to register
     * @throws ExtensionError if extension name is invalid or already registered
     */
    registerExtension(extension) {
        validateExtensionName(extension.name);
        if (this.extensions.has(extension.name)) {
            throw new ExtensionError(`Extension '${extension.name}' is already registered`);
        }
        this.extensions.set(extension.name, extension);
    }
    /**
     * Unregister an extension from the registry.
     * @param name Extension name to unregister
     * @throws ExtensionError if extension is not registered
     */
    unregisterExtension(name) {
        if (!this.extensions.has(name)) {
            throw new ExtensionError(`Extension '${name}' is not registered`);
        }
        this.extensions.delete(name);
        this.enabledExtensions.delete(name);
    }
    /**
     * Get a registered extension by name.
     * @param name Extension name
     * @returns Extension if found, undefined otherwise
     */
    getExtension(name) {
        return this.extensions.get(name);
    }
    /**
     * List all registered extensions.
     * @returns Array of registered extensions
     */
    listExtensions() {
        return Array.from(this.extensions.values());
    }
    /**
     * Check if an extension is registered.
     * @param name Extension name
     * @returns true if registered
     */
    hasExtension(name) {
        return this.extensions.has(name);
    }
    /**
     * Get supported extensions for capability advertisement.
     * Used during initialization to tell client what extensions server supports.
     * @returns Record of extension names to their capability info
     */
    getSupportedExtensions() {
        const supported = {};
        for (const [name, extension] of this.extensions) {
            supported[name] = {
                name,
                settings: extension.settings,
            };
        }
        return supported;
    }
    /**
     * Check if an extension is enabled for the current session.
     * @param name Extension name
     * @returns true if enabled
     */
    isEnabled(name) {
        return this.enabledExtensions.has(name);
    }
    /**
     * Get all enabled extensions for the current session.
     * @returns Map of enabled extension names to their capabilities
     */
    getEnabledExtensions() {
        return new Map(this.enabledExtensions);
    }
    /**
     * Enable an extension for the current session.
     * Internal method used during negotiation.
     * @param name Extension name
     * @param capability Negotiated capability
     */
    enableExtension(name, capability) {
        this.enabledExtensions.set(name, capability);
    }
    /**
     * Clear all enabled extensions.
     * Called during shutdown or session reset.
     */
    clearEnabledExtensions() {
        this.enabledExtensions.clear();
    }
    /**
     * Shutdown all enabled extensions.
     * Calls onShutdown for each enabled extension.
     */
    async shutdown() {
        const shutdownPromises = [];
        for (const name of this.enabledExtensions.keys()) {
            const extension = this.extensions.get(name);
            if (extension?.onShutdown) {
                shutdownPromises.push(extension.onShutdown().catch((err) => {
                    console.error(`Error shutting down extension '${name}':`, err);
                }));
            }
        }
        await Promise.all(shutdownPromises);
        this.clearEnabledExtensions();
    }
}
// =============================================================================
// Extension Negotiation
// =============================================================================
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
export async function negotiateExtensions(clientExperimental, registry) {
    const result = {
        enabled: {},
    };
    if (!clientExperimental) {
        return result;
    }
    // Find mutually supported extensions
    for (const [key, clientValue] of Object.entries(clientExperimental)) {
        // Check if this looks like an extension capability
        // Extension names are in namespace/extension-name format
        if (!isValidExtensionName(key)) {
            // Not an extension, skip (could be other experimental capabilities)
            continue;
        }
        // Check if server supports this extension
        const extension = registry.getExtension(key);
        if (!extension) {
            // Server doesn't support this extension
            continue;
        }
        // Extension is mutually supported - extract client settings
        const clientSettings = typeof clientValue === 'object' && clientValue !== null
            ? clientValue
            : {};
        // Call extension's onInitialize hook
        if (extension.onInitialize) {
            try {
                await extension.onInitialize(clientSettings);
            }
            catch (err) {
                console.error(`Error initializing extension '${key}':`, err);
                // Skip this extension if initialization fails
                continue;
            }
        }
        // Enable the extension
        const capability = {
            name: key,
            settings: extension.settings,
        };
        registry.enableExtension(key, capability);
        result.enabled[key] = capability;
    }
    return result;
}
/**
 * Build experimental capabilities for server response.
 * Includes both enabled extensions and any additional experimental features.
 *
 * @param registry Extension registry
 * @param additionalExperimental Additional experimental capabilities
 * @returns Experimental capabilities object for initialize result
 */
export function buildExperimentalCapabilities(registry, additionalExperimental) {
    const experimental = {};
    // Add supported extensions
    const supported = registry.getSupportedExtensions();
    for (const [name, capability] of Object.entries(supported)) {
        experimental[name] = capability.settings ?? {};
    }
    // Merge additional experimental capabilities
    if (additionalExperimental) {
        for (const [key, value] of Object.entries(additionalExperimental)) {
            if (!(key in experimental)) {
                experimental[key] = value;
            }
        }
    }
    return experimental;
}
// =============================================================================
// Built-in Extensions
// =============================================================================
/**
 * Create the anthropic/oauth-m2m extension placeholder.
 * Actual implementation will be added in a future chunk.
 * @internal Use createOAuthM2MExtension from oauth-m2m.ts for full implementation
 */
function createOAuthM2MPlaceholderExtension(settings) {
    return {
        name: 'anthropic/oauth-m2m',
        description: 'OAuth 2.0 Machine-to-Machine authentication extension',
        version: '1.0.0',
        settings,
        async onInitialize(_clientSettings) {
            // Placeholder - implementation in c6t.24
        },
        async onShutdown() {
            // Placeholder - implementation in c6t.24
        },
    };
}
/**
 * Create a registry with default built-in extensions registered.
 * @returns ExtensionRegistry with built-in extensions
 */
export function createDefaultRegistry() {
    const registry = new ExtensionRegistry();
    // Register built-in extensions
    registry.registerExtension(createOAuthM2MPlaceholderExtension());
    return registry;
}
/**
 * @deprecated Use ExtensionRegistry instead
 */
export class ExtensionFramework {
    registry;
    constructor() {
        this.registry = new ExtensionRegistry();
    }
    register(extension) {
        // Handle legacy extension format (without namespace)
        if (!isValidExtensionName(extension.name)) {
            // Convert legacy name to new format
            const newName = `legacy/${extension.name}`;
            this.registry.registerExtension({
                ...extension,
                name: newName,
            });
        }
        else {
            this.registry.registerExtension(extension);
        }
    }
    async negotiate(request) {
        const clientExperimental = {};
        for (const ext of request.extensions) {
            const name = isValidExtensionName(ext.name) ? ext.name : `legacy/${ext.name}`;
            clientExperimental[name] = { version: ext.version };
        }
        const result = await negotiateExtensions(clientExperimental, this.registry);
        const enabled = [];
        for (const name of Object.keys(result.enabled)) {
            const extension = this.registry.getExtension(name);
            enabled.push({
                name: name.startsWith('legacy/') ? name.substring(7) : name,
                version: extension?.version ?? '1.0.0',
            });
        }
        return { enabled };
    }
    isEnabled(name) {
        const fullName = isValidExtensionName(name) ? name : `legacy/${name}`;
        return this.registry.isEnabled(fullName);
    }
    async shutdown() {
        await this.registry.shutdown();
    }
}
//# sourceMappingURL=framework.js.map