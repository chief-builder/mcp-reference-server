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
import { buildWwwAuthenticateHeader, WwwAuthenticateOptions } from './discovery.js';

// =============================================================================
// Constants
// =============================================================================

/** MCP base scopes with hierarchy */
export const MCP_SCOPES = {
  READ: 'mcp:read',
  WRITE: 'mcp:write',
  ADMIN: 'mcp:admin',
} as const;

/** Tool-specific scope prefix */
export const TOOL_SCOPE_PREFIX = 'mcp:tool:';

/** Standard tool scopes for the reference server */
export const TOOL_SCOPES = {
  CALCULATE: 'mcp:tool:calculate',
  ROLL_DICE: 'mcp:tool:roll_dice',
  TELL_FORTUNE: 'mcp:tool:tell_fortune',
} as const;

/**
 * Scope inheritance hierarchy.
 * Key scope implies all value scopes.
 */
const SCOPE_INHERITANCE: Record<string, string[]> = {
  [MCP_SCOPES.ADMIN]: [MCP_SCOPES.WRITE, MCP_SCOPES.READ],
  [MCP_SCOPES.WRITE]: [MCP_SCOPES.READ],
};

/**
 * Default scope requirements for MCP methods.
 */
const METHOD_SCOPES: Record<string, string[]> = {
  // Read operations
  'tools/list': [MCP_SCOPES.READ],
  'resources/list': [MCP_SCOPES.READ],
  'prompts/list': [MCP_SCOPES.READ],
  'resources/read': [MCP_SCOPES.READ],
  'prompts/get': [MCP_SCOPES.READ],

  // Write operations
  'tools/call': [MCP_SCOPES.WRITE],
  'resources/subscribe': [MCP_SCOPES.WRITE],
  'resources/unsubscribe': [MCP_SCOPES.WRITE],
  'logging/setLevel': [MCP_SCOPES.WRITE],
  'sampling/createMessage': [MCP_SCOPES.WRITE],

  // Admin operations
  'server/shutdown': [MCP_SCOPES.ADMIN],
};

// =============================================================================
// Zod Schemas
// =============================================================================

export const ScopeStringSchema = z.string().refine(
  (val) => val.trim().length > 0,
  { message: 'Scope string cannot be empty' }
);

export const ScopeArraySchema = z.array(ScopeStringSchema);

export const ScopeManagerConfigSchema = z.object({
  /** Resource metadata URL for WWW-Authenticate header */
  resourceMetadataUrl: z.string().url().optional(),
  /** Realm for WWW-Authenticate header */
  realm: z.string().optional(),
  /** Custom method-to-scope mapping (merged with defaults) */
  customMethodScopes: z.record(z.array(z.string())).optional(),
});

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Error thrown when token lacks required scope.
 * Used for 403 Forbidden responses with incremental consent support.
 */
export class InsufficientScopeError extends Error {
  public readonly code = 'insufficient_scope';
  public readonly httpStatus = 403;

  constructor(
    /** Required scope(s) that were missing */
    public readonly requiredScopes: string[],
    /** Scope(s) the token actually has */
    public readonly tokenScopes: string[],
    message?: string
  ) {
    const scopeString = requiredScopes.join(' ');
    const defaultMessage = `Insufficient scope. Required: ${scopeString}`;
    super(message ?? defaultMessage);
    this.name = 'InsufficientScopeError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Get the required scope string for WWW-Authenticate header.
   */
  getRequiredScopeString(): string {
    return this.requiredScopes.join(' ');
  }

  /**
   * Build WWW-Authenticate header for this error.
   */
  buildWwwAuthenticateHeader(resourceMetadataUrl: string, realm?: string): string {
    const options: WwwAuthenticateOptions = {
      resourceMetadataUrl,
      error: 'insufficient_scope',
      errorDescription: this.message,
      scope: this.getRequiredScopeString(),
    };
    if (realm) {
      options.realm = realm;
    }
    return buildWwwAuthenticateHeader(options);
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Parse a space-separated scope string into an array.
 */
export function parseScopes(scopeString: string): string[] {
  if (!scopeString || scopeString.trim() === '') {
    return [];
  }
  return scopeString.split(/\s+/).filter(Boolean);
}

/**
 * Convert scope array to space-separated string.
 */
export function scopesToString(scopes: string[]): string {
  return scopes.filter(Boolean).join(' ');
}

/**
 * Check if a scope is a tool-specific scope.
 */
export function isToolScope(scope: string): boolean {
  return scope.startsWith(TOOL_SCOPE_PREFIX);
}

/**
 * Extract tool name from a tool scope.
 * @returns Tool name or undefined if not a tool scope
 */
export function getToolNameFromScope(scope: string): string | undefined {
  if (!isToolScope(scope)) {
    return undefined;
  }
  return scope.slice(TOOL_SCOPE_PREFIX.length);
}

/**
 * Build a tool-specific scope from tool name.
 */
export function buildToolScope(toolName: string): string {
  return `${TOOL_SCOPE_PREFIX}${toolName}`;
}

// =============================================================================
// ScopeManager Class
// =============================================================================

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
export class ScopeManager {
  private readonly config: ScopeManagerConfig;
  private readonly methodScopes: Record<string, string[]>;

  constructor(config: Partial<ScopeManagerConfig> = {}) {
    this.config = ScopeManagerConfigSchema.parse(config);

    // Merge custom method scopes with defaults
    this.methodScopes = {
      ...METHOD_SCOPES,
      ...(this.config.customMethodScopes ?? {}),
    };
  }

  /**
   * Check if token scopes include the required scope(s).
   *
   * @param tokenScopes - Scopes from the token (array or space-separated string)
   * @param required - Required scope(s) (single scope or array)
   * @returns true if all required scopes are present
   */
  hasScope(
    tokenScopes: string[] | string,
    required: string | string[]
  ): boolean {
    const scopes = Array.isArray(tokenScopes) ? tokenScopes : parseScopes(tokenScopes);
    const requiredScopes = Array.isArray(required) ? required : [required];

    return requiredScopes.every((req) => scopes.includes(req));
  }

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
  hasScopeWithInheritance(
    tokenScopes: string[] | string,
    required: string
  ): boolean {
    const scopes = Array.isArray(tokenScopes) ? tokenScopes : parseScopes(tokenScopes);

    // Direct match
    if (scopes.includes(required)) {
      return true;
    }

    // Check if any token scope implies the required scope
    for (const tokenScope of scopes) {
      const implied = SCOPE_INHERITANCE[tokenScope];
      if (implied && implied.includes(required)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if token scopes satisfy all required scopes with inheritance.
   *
   * @param tokenScopes - Scopes from the token
   * @param required - Required scopes (all must be satisfied)
   * @returns Result with allowed status and missing scopes
   */
  checkScopes(
    tokenScopes: string[] | string,
    required: string[]
  ): ScopeCheckResult {
    const scopes = Array.isArray(tokenScopes) ? tokenScopes : parseScopes(tokenScopes);
    const missingScopes: string[] = [];

    for (const req of required) {
      if (!this.hasScopeWithInheritance(scopes, req)) {
        missingScopes.push(req);
      }
    }

    if (missingScopes.length === 0) {
      return {
        allowed: true,
        message: 'Scope check passed',
      };
    }

    return {
      allowed: false,
      missingScopes,
      message: `Missing required scopes: ${missingScopes.join(', ')}`,
    };
  }

  /**
   * Get the scopes required for an MCP method.
   *
   * @param method - The MCP method name (e.g., 'tools/call')
   * @param toolName - Optional tool name for tool-specific scope
   * @returns Array of required scopes
   */
  getRequiredScopes(method: string, toolName?: string): string[] {
    const methodScope = this.methodScopes[method] ?? [];

    // For tools/call, also require tool-specific scope if configured
    if (method === 'tools/call' && toolName) {
      const toolScope = buildToolScope(toolName);
      // Return both method scope and tool scope
      return [...methodScope, toolScope];
    }

    return methodScope;
  }

  /**
   * Validate that token scopes are sufficient for a method call.
   *
   * @param tokenScopes - Scopes from the token
   * @param method - The MCP method name
   * @param toolName - Optional tool name for tools/call
   * @throws {InsufficientScopeError} If scopes are insufficient
   */
  validateMethodAccess(
    tokenScopes: string[] | string,
    method: string,
    toolName?: string
  ): void {
    const scopes = Array.isArray(tokenScopes) ? tokenScopes : parseScopes(tokenScopes);
    const required = this.getRequiredScopes(method, toolName);

    if (required.length === 0) {
      // No scope required for this method
      return;
    }

    const result = this.checkScopes(scopes, required);
    if (!result.allowed && result.missingScopes) {
      throw new InsufficientScopeError(
        result.missingScopes,
        scopes,
        `Access denied for ${method}: ${result.message}`
      );
    }
  }

  /**
   * Validate that token scopes are sufficient for a tool call.
   * Checks both method scope (mcp:write) and tool-specific scope.
   *
   * @param tokenScopes - Scopes from the token
   * @param toolName - The tool name being called
   * @param requireToolScope - Whether to require tool-specific scope (default: true)
   * @throws {InsufficientScopeError} If scopes are insufficient
   */
  validateToolAccess(
    tokenScopes: string[] | string,
    toolName: string,
    requireToolScope = true
  ): void {
    const scopes = Array.isArray(tokenScopes) ? tokenScopes : parseScopes(tokenScopes);

    // Check base method scope (mcp:write)
    const result = this.checkScopes(scopes, [MCP_SCOPES.WRITE]);
    if (!result.allowed && result.missingScopes) {
      throw new InsufficientScopeError(
        result.missingScopes,
        scopes,
        `Access denied for tool ${toolName}: requires ${MCP_SCOPES.WRITE} scope`
      );
    }

    // Check tool-specific scope if required
    if (requireToolScope) {
      const toolScope = buildToolScope(toolName);
      if (!scopes.includes(toolScope)) {
        throw new InsufficientScopeError(
          [toolScope],
          scopes,
          `Access denied for tool ${toolName}: requires ${toolScope} scope`
        );
      }
    }
  }

  /**
   * Get all scopes implied by the given scopes (including inheritance).
   *
   * @param scopes - Input scopes
   * @returns All effective scopes including inherited ones
   */
  getEffectiveScopes(scopes: string[] | string): string[] {
    const inputScopes = Array.isArray(scopes) ? scopes : parseScopes(scopes);
    const effective = new Set<string>(inputScopes);

    for (const scope of inputScopes) {
      const implied = SCOPE_INHERITANCE[scope];
      if (implied) {
        for (const impliedScope of implied) {
          effective.add(impliedScope);
        }
      }
    }

    return Array.from(effective);
  }

  /**
   * Get the resource metadata URL configured for this manager.
   */
  getResourceMetadataUrl(): string | undefined {
    return this.config.resourceMetadataUrl;
  }

  /**
   * Get the realm configured for this manager.
   */
  getRealm(): string | undefined {
    return this.config.realm;
  }

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
  } {
    const resourceMetadataUrl = this.config.resourceMetadataUrl;
    if (!resourceMetadataUrl) {
      throw new Error('resourceMetadataUrl not configured');
    }

    return {
      status: 403,
      headers: {
        'WWW-Authenticate': error.buildWwwAuthenticateHeader(
          resourceMetadataUrl,
          this.config.realm
        ),
        'Content-Type': 'application/json',
      },
      body: {
        error: 'insufficient_scope',
        error_description: error.message,
        required_scope: error.getRequiredScopeString(),
      },
    };
  }
}

// =============================================================================
// Standalone Functions (convenience)
// =============================================================================

/**
 * Create a ScopeManager with default configuration.
 */
export function createScopeManager(config?: Partial<ScopeManagerConfig>): ScopeManager {
  return new ScopeManager(config);
}

/**
 * Quick check if scopes satisfy requirement (with inheritance).
 */
export function checkScopeWithInheritance(
  tokenScopes: string[] | string,
  required: string
): boolean {
  const manager = new ScopeManager();
  return manager.hasScopeWithInheritance(tokenScopes, required);
}

/**
 * Get all standard MCP scopes.
 */
export function getAllMcpScopes(): string[] {
  return [MCP_SCOPES.READ, MCP_SCOPES.WRITE, MCP_SCOPES.ADMIN];
}

/**
 * Get all tool scopes.
 */
export function getAllToolScopes(): string[] {
  return Object.values(TOOL_SCOPES);
}
