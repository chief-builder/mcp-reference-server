/**
 * Scope management and incremental consent (SEP-835)
 *
 * Implements:
 * - MCP scope definitions (mcp:read, mcp:write, mcp:admin)
 * - Tool-specific scopes (mcp:tool:*)
 * - Scope inheritance hierarchy
 * - Scope validation and enforcement
 * - 403 Forbidden with required scope in WWW-Authenticate
 */
import { z } from 'zod';
/** MCP base scopes with hierarchy */
export declare const MCP_SCOPES: {
    readonly READ: "mcp:read";
    readonly WRITE: "mcp:write";
    readonly ADMIN: "mcp:admin";
};
/** Tool-specific scope prefix */
export declare const TOOL_SCOPE_PREFIX = "mcp:tool:";
/** Standard tool scopes for the reference server */
export declare const TOOL_SCOPES: {
    readonly CALCULATE: "mcp:tool:calculate";
    readonly ROLL_DICE: "mcp:tool:roll_dice";
    readonly TELL_FORTUNE: "mcp:tool:tell_fortune";
};
export declare const ScopeStringSchema: z.ZodEffects<z.ZodString, string, string>;
export declare const ScopeArraySchema: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
export declare const ScopeManagerConfigSchema: z.ZodObject<{
    /** Resource metadata URL for WWW-Authenticate header */
    resourceMetadataUrl: z.ZodOptional<z.ZodString>;
    /** Realm for WWW-Authenticate header */
    realm: z.ZodOptional<z.ZodString>;
    /** Custom method-to-scope mapping (merged with defaults) */
    customMethodScopes: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString, "many">>>;
}, "strip", z.ZodTypeAny, {
    resourceMetadataUrl?: string | undefined;
    realm?: string | undefined;
    customMethodScopes?: Record<string, string[]> | undefined;
}, {
    resourceMetadataUrl?: string | undefined;
    realm?: string | undefined;
    customMethodScopes?: Record<string, string[]> | undefined;
}>;
export type McpScope = typeof MCP_SCOPES[keyof typeof MCP_SCOPES];
export type ToolScope = typeof TOOL_SCOPES[keyof typeof TOOL_SCOPES];
export type ScopeManagerConfig = z.infer<typeof ScopeManagerConfigSchema>;
/** Result of scope check */
export interface ScopeCheckResult {
    /** Whether the scope check passed */
    allowed: boolean;
    /** Missing scopes (if not allowed) */
    missingScopes?: string[];
    /** Human-readable message */
    message: string;
}
/**
 * Error thrown when token lacks required scope.
 * Used for 403 Forbidden responses with incremental consent support.
 */
export declare class InsufficientScopeError extends Error {
    /** Required scope(s) that were missing */
    readonly requiredScopes: string[];
    /** Scope(s) the token actually has */
    readonly tokenScopes: string[];
    readonly code = "insufficient_scope";
    readonly httpStatus = 403;
    constructor(
    /** Required scope(s) that were missing */
    requiredScopes: string[], 
    /** Scope(s) the token actually has */
    tokenScopes: string[], message?: string);
    /**
     * Get the required scope string for WWW-Authenticate header.
     */
    getRequiredScopeString(): string;
    /**
     * Build WWW-Authenticate header for this error.
     */
    buildWwwAuthenticateHeader(resourceMetadataUrl: string, realm?: string): string;
}
/**
 * Parse a space-separated scope string into an array.
 */
export declare function parseScopes(scopeString: string): string[];
/**
 * Convert scope array to space-separated string.
 */
export declare function scopesToString(scopes: string[]): string;
/**
 * Check if a scope is a tool-specific scope.
 */
export declare function isToolScope(scope: string): boolean;
/**
 * Extract tool name from a tool scope.
 * @returns Tool name or undefined if not a tool scope
 */
export declare function getToolNameFromScope(scope: string): string | undefined;
/**
 * Build a tool-specific scope from tool name.
 */
export declare function buildToolScope(toolName: string): string;
/**
 * Manages OAuth scope validation and enforcement for MCP.
 *
 * Features:
 * - Scope parsing (space-separated strings)
 * - Scope inheritance (mcp:admin implies mcp:write implies mcp:read)
 * - Method-to-scope mapping
 * - Tool-specific scope support
 * - WWW-Authenticate header generation for 403 responses
 */
export declare class ScopeManager {
    private readonly config;
    private readonly methodScopes;
    constructor(config?: Partial<ScopeManagerConfig>);
    /**
     * Check if token scopes include the required scope(s).
     *
     * @param tokenScopes - Scopes from the token (array or space-separated string)
     * @param required - Required scope(s) (single scope or array)
     * @returns true if all required scopes are present
     */
    hasScope(tokenScopes: string[] | string, required: string | string[]): boolean;
    /**
     * Check if token scopes satisfy required scope with inheritance.
     *
     * Inheritance rules:
     * - mcp:admin implies mcp:write and mcp:read
     * - mcp:write implies mcp:read
     * - Tool-specific scopes have no inheritance
     *
     * @param tokenScopes - Scopes from the token (array or space-separated string)
     * @param required - Required scope
     * @returns true if the required scope is satisfied (directly or via inheritance)
     */
    hasScopeWithInheritance(tokenScopes: string[] | string, required: string): boolean;
    /**
     * Check if token scopes satisfy all required scopes with inheritance.
     *
     * @param tokenScopes - Scopes from the token
     * @param required - Required scopes (all must be satisfied)
     * @returns Result with allowed status and missing scopes
     */
    checkScopes(tokenScopes: string[] | string, required: string[]): ScopeCheckResult;
    /**
     * Get the scopes required for an MCP method.
     *
     * @param method - The MCP method name (e.g., 'tools/call')
     * @param toolName - Optional tool name for tool-specific scope
     * @returns Array of required scopes
     */
    getRequiredScopes(method: string, toolName?: string): string[];
    /**
     * Validate that token scopes are sufficient for a method call.
     *
     * @param tokenScopes - Scopes from the token
     * @param method - The MCP method name
     * @param toolName - Optional tool name for tools/call
     * @throws {InsufficientScopeError} If scopes are insufficient
     */
    validateMethodAccess(tokenScopes: string[] | string, method: string, toolName?: string): void;
    /**
     * Validate that token scopes are sufficient for a tool call.
     * Checks both method scope (mcp:write) and tool-specific scope.
     *
     * @param tokenScopes - Scopes from the token
     * @param toolName - The tool name being called
     * @param requireToolScope - Whether to require tool-specific scope (default: true)
     * @throws {InsufficientScopeError} If scopes are insufficient
     */
    validateToolAccess(tokenScopes: string[] | string, toolName: string, requireToolScope?: boolean): void;
    /**
     * Get all scopes implied by the given scopes (including inheritance).
     *
     * @param scopes - Input scopes
     * @returns All effective scopes including inherited ones
     */
    getEffectiveScopes(scopes: string[] | string): string[];
    /**
     * Get the resource metadata URL configured for this manager.
     */
    getResourceMetadataUrl(): string | undefined;
    /**
     * Get the realm configured for this manager.
     */
    getRealm(): string | undefined;
    /**
     * Build a 403 response with WWW-Authenticate header for insufficient scope.
     *
     * @param error - The InsufficientScopeError
     * @returns Object with status, headers, and body for the response
     */
    build403Response(error: InsufficientScopeError): {
        status: number;
        headers: Record<string, string>;
        body: {
            error: string;
            error_description: string;
            required_scope: string;
        };
    };
}
/**
 * Create a ScopeManager with default configuration.
 */
export declare function createScopeManager(config?: Partial<ScopeManagerConfig>): ScopeManager;
/**
 * Quick check if scopes satisfy requirement (with inheritance).
 */
export declare function checkScopeWithInheritance(tokenScopes: string[] | string, required: string): boolean;
/**
 * Get all standard MCP scopes.
 */
export declare function getAllMcpScopes(): string[];
/**
 * Get all tool scopes.
 */
export declare function getAllToolScopes(): string[];
//# sourceMappingURL=scopes.d.ts.map