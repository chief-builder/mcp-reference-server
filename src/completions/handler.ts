/**
 * Argument auto-complete handler
 *
 * Implements the completion/complete request handler for MCP protocol.
 * Supports ref/tool, ref/prompt, and ref/resource reference types.
 */

import { z } from 'zod';

// =============================================================================
// Constants
// =============================================================================

/** Maximum number of completion values to return */
const MAX_COMPLETIONS = 20;

// =============================================================================
// Schemas
// =============================================================================

/** Reference types supported by the completion handler */
export const CompletionRefTypeSchema = z.enum(['ref/tool', 'ref/prompt', 'ref/resource']);
export type CompletionRefType = z.infer<typeof CompletionRefTypeSchema>;

/** Reference object in completion request */
export const CompletionRefSchema = z.object({
  type: CompletionRefTypeSchema,
  name: z.string(),
});
export type CompletionRef = z.infer<typeof CompletionRefSchema>;

/** Argument object in completion request */
export const CompletionArgumentSchema = z.object({
  name: z.string(),
  value: z.string(),
});
export type CompletionArgument = z.infer<typeof CompletionArgumentSchema>;

/** Full completion request parameters */
export const CompletionParamsSchema = z.object({
  ref: CompletionRefSchema,
  argument: CompletionArgumentSchema,
});
export type CompletionParams = z.infer<typeof CompletionParamsSchema>;

// =============================================================================
// Types
// =============================================================================

/**
 * Completion request structure (MCP protocol format)
 */
export interface CompletionRequest {
  ref: {
    type: 'ref/tool' | 'ref/prompt' | 'ref/resource';
    name: string;
  };
  argument: {
    name: string;
    value: string;
  };
}

/**
 * Completion result structure
 */
export interface CompletionResult {
  completion: {
    values: string[];
    total?: number;
    hasMore?: boolean;
  };
}

/**
 * Simple argument provider function type
 * Takes a prefix string and returns completion values
 */
export type ArgumentCompletionProvider = (prefix: string) => string[] | Promise<string[]>;

/**
 * Full completion provider function type (lower-level API)
 */
export type CompletionProvider = (
  request: CompletionRequest
) => Promise<CompletionResult>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Filter completions by prefix (case-insensitive)
 *
 * @param values - Array of values to filter
 * @param prefix - Prefix to match
 * @returns Filtered array of matching values
 */
export function filterByPrefix(values: string[], prefix: string): string[] {
  if (!prefix) {
    return values;
  }
  const normalizedPrefix = prefix.toLowerCase();
  return values.filter((v) => v.toLowerCase().startsWith(normalizedPrefix));
}

/**
 * Apply completion limits and generate hasMore indicator
 *
 * @param values - Array of completion values
 * @param maxResults - Maximum number of results to return (default: MAX_COMPLETIONS)
 * @returns Completion result with values, total, and hasMore
 */
export function applyCompletionLimits(
  values: string[],
  maxResults: number = MAX_COMPLETIONS
): { values: string[]; total?: number; hasMore?: boolean } {
  const total = values.length;
  const hasMore = total > maxResults;
  const limitedValues = hasMore ? values.slice(0, maxResults) : values;

  return {
    values: limitedValues,
    ...(hasMore ? { total, hasMore: true } : {}),
  };
}

// =============================================================================
// CompletionHandler Class
// =============================================================================

/**
 * Handler for completion/complete requests
 *
 * Supports two APIs:
 * 1. Simple API: registerArgumentProvider(toolName, argName, provider)
 *    - For registering completions for specific tool arguments
 *
 * 2. Full API: registerProvider(refType, name, provider)
 *    - For registering custom providers for any ref type
 */
export class CompletionHandler {
  /** Low-level providers keyed by "refType:name" */
  private providers: Map<string, CompletionProvider> = new Map();

  /** Argument providers keyed by "toolName:argName" */
  private argumentProviders: Map<string, ArgumentCompletionProvider> = new Map();

  // ===========================================================================
  // Simple API for tool argument completions
  // ===========================================================================

  /**
   * Register a completion provider for a specific tool argument
   *
   * @param toolName - Name of the tool
   * @param argName - Name of the argument
   * @param provider - Function that returns completions for a given prefix
   */
  registerArgumentProvider(
    toolName: string,
    argName: string,
    provider: ArgumentCompletionProvider
  ): void {
    const key = `${toolName}:${argName}`;
    this.argumentProviders.set(key, provider);
  }

  /**
   * Check if an argument provider is registered
   *
   * @param toolName - Name of the tool
   * @param argName - Name of the argument
   * @returns true if provider is registered
   */
  hasArgumentProvider(toolName: string, argName: string): boolean {
    return this.argumentProviders.has(`${toolName}:${argName}`);
  }

  /**
   * Get all registered argument provider keys
   *
   * @returns Array of "toolName:argName" keys
   */
  getRegisteredArgumentProviders(): string[] {
    return Array.from(this.argumentProviders.keys());
  }

  // ===========================================================================
  // Full API for custom providers
  // ===========================================================================

  /**
   * Register a full completion provider for a ref type
   *
   * @param refType - Reference type (ref/tool, ref/prompt, ref/resource)
   * @param name - Name of the tool/prompt/resource
   * @param provider - Full completion provider function
   */
  registerProvider(refType: CompletionRefType, name: string, provider: CompletionProvider): void {
    const key = `${refType}:${name}`;
    this.providers.set(key, provider);
  }

  /**
   * Check if a provider is registered for a ref
   *
   * @param refType - Reference type
   * @param name - Name of the tool/prompt/resource
   * @returns true if provider is registered
   */
  hasProvider(refType: CompletionRefType, name: string): boolean {
    return this.providers.has(`${refType}:${name}`);
  }

  // ===========================================================================
  // Request Handling
  // ===========================================================================

  /**
   * Handle a completion/complete request
   *
   * @param params - Completion parameters (ref and argument)
   * @returns Completion result with values, total, and hasMore
   */
  async handle(params: CompletionParams): Promise<CompletionResult> {
    // Validate params with Zod
    const parseResult = CompletionParamsSchema.safeParse(params);
    if (!parseResult.success) {
      return { completion: { values: [] } };
    }

    const { ref, argument } = parseResult.data;

    // First, check for argument providers (simple API)
    if (ref.type === 'ref/tool') {
      const argKey = `${ref.name}:${argument.name}`;
      const argProvider = this.argumentProviders.get(argKey);

      if (argProvider) {
        const rawValues = await Promise.resolve(argProvider(argument.value));
        const filtered = filterByPrefix(rawValues, argument.value);
        const result = applyCompletionLimits(filtered);
        return { completion: result };
      }
    }

    // Then, check for full providers
    const providerKey = `${ref.type}:${ref.name}`;
    const provider = this.providers.get(providerKey);

    if (provider) {
      return provider({ ref, argument });
    }

    // No provider found
    return { completion: { values: [] } };
  }

  /**
   * Alias for handle() for backwards compatibility
   *
   * @param request - Completion request
   * @returns Completion result
   */
  async complete(request: CompletionRequest): Promise<CompletionResult> {
    return this.handle(request);
  }
}

// =============================================================================
// Fortune Teller Completions Registration
// =============================================================================

/**
 * Register Fortune Teller completions with a CompletionHandler
 *
 * Registers completion providers for the tell_fortune tool arguments:
 * - category: ["love", "career", "health", "wealth", "general"]
 * - mood: ["optimistic", "mysterious", "cautious"]
 *
 * @param handler - The CompletionHandler to register with
 * @param getCompletions - The getFortuneCompletions function from fortune-teller module
 */
export function registerFortuneTellerCompletions(
  handler: CompletionHandler,
  getCompletions: (argName: string, prefix?: string) => string[]
): void {
  // Register category completions
  handler.registerArgumentProvider('tell_fortune', 'category', (prefix) =>
    getCompletions('category', prefix)
  );

  // Register mood completions
  handler.registerArgumentProvider('tell_fortune', 'mood', (prefix) =>
    getCompletions('mood', prefix)
  );
}
