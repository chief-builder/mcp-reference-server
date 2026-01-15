/**
 * Argument auto-complete handler
 *
 * Implements the completion/complete request handler for MCP protocol.
 * Supports ref/tool, ref/prompt, and ref/resource reference types.
 */
import { z } from 'zod';
/** Reference types supported by the completion handler */
export declare const CompletionRefTypeSchema: z.ZodEnum<["ref/tool", "ref/prompt", "ref/resource"]>;
export type CompletionRefType = z.infer<typeof CompletionRefTypeSchema>;
/** Reference object in completion request */
export declare const CompletionRefSchema: z.ZodObject<{
    type: z.ZodEnum<["ref/tool", "ref/prompt", "ref/resource"]>;
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "ref/tool" | "ref/prompt" | "ref/resource";
    name: string;
}, {
    type: "ref/tool" | "ref/prompt" | "ref/resource";
    name: string;
}>;
export type CompletionRef = z.infer<typeof CompletionRefSchema>;
/** Argument object in completion request */
export declare const CompletionArgumentSchema: z.ZodObject<{
    name: z.ZodString;
    value: z.ZodString;
}, "strip", z.ZodTypeAny, {
    value: string;
    name: string;
}, {
    value: string;
    name: string;
}>;
export type CompletionArgument = z.infer<typeof CompletionArgumentSchema>;
/** Full completion request parameters */
export declare const CompletionParamsSchema: z.ZodObject<{
    ref: z.ZodObject<{
        type: z.ZodEnum<["ref/tool", "ref/prompt", "ref/resource"]>;
        name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "ref/tool" | "ref/prompt" | "ref/resource";
        name: string;
    }, {
        type: "ref/tool" | "ref/prompt" | "ref/resource";
        name: string;
    }>;
    argument: z.ZodObject<{
        name: z.ZodString;
        value: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        value: string;
        name: string;
    }, {
        value: string;
        name: string;
    }>;
}, "strip", z.ZodTypeAny, {
    ref: {
        type: "ref/tool" | "ref/prompt" | "ref/resource";
        name: string;
    };
    argument: {
        value: string;
        name: string;
    };
}, {
    ref: {
        type: "ref/tool" | "ref/prompt" | "ref/resource";
        name: string;
    };
    argument: {
        value: string;
        name: string;
    };
}>;
export type CompletionParams = z.infer<typeof CompletionParamsSchema>;
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
export type CompletionProvider = (request: CompletionRequest) => Promise<CompletionResult>;
/**
 * Filter completions by prefix (case-insensitive)
 *
 * @param values - Array of values to filter
 * @param prefix - Prefix to match
 * @returns Filtered array of matching values
 */
export declare function filterByPrefix(values: string[], prefix: string): string[];
/**
 * Apply completion limits and generate hasMore indicator
 *
 * @param values - Array of completion values
 * @param maxResults - Maximum number of results to return (default: MAX_COMPLETIONS)
 * @returns Completion result with values, total, and hasMore
 */
export declare function applyCompletionLimits(values: string[], maxResults?: number): {
    values: string[];
    total?: number;
    hasMore?: boolean;
};
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
export declare class CompletionHandler {
    /** Low-level providers keyed by "refType:name" */
    private providers;
    /** Argument providers keyed by "toolName:argName" */
    private argumentProviders;
    /**
     * Register a completion provider for a specific tool argument
     *
     * @param toolName - Name of the tool
     * @param argName - Name of the argument
     * @param provider - Function that returns completions for a given prefix
     */
    registerArgumentProvider(toolName: string, argName: string, provider: ArgumentCompletionProvider): void;
    /**
     * Check if an argument provider is registered
     *
     * @param toolName - Name of the tool
     * @param argName - Name of the argument
     * @returns true if provider is registered
     */
    hasArgumentProvider(toolName: string, argName: string): boolean;
    /**
     * Get all registered argument provider keys
     *
     * @returns Array of "toolName:argName" keys
     */
    getRegisteredArgumentProviders(): string[];
    /**
     * Register a full completion provider for a ref type
     *
     * @param refType - Reference type (ref/tool, ref/prompt, ref/resource)
     * @param name - Name of the tool/prompt/resource
     * @param provider - Full completion provider function
     */
    registerProvider(refType: CompletionRefType, name: string, provider: CompletionProvider): void;
    /**
     * Check if a provider is registered for a ref
     *
     * @param refType - Reference type
     * @param name - Name of the tool/prompt/resource
     * @returns true if provider is registered
     */
    hasProvider(refType: CompletionRefType, name: string): boolean;
    /**
     * Handle a completion/complete request
     *
     * @param params - Completion parameters (ref and argument)
     * @returns Completion result with values, total, and hasMore
     */
    handle(params: CompletionParams): Promise<CompletionResult>;
    /**
     * Alias for handle() for backwards compatibility
     *
     * @param request - Completion request
     * @returns Completion result
     */
    complete(request: CompletionRequest): Promise<CompletionResult>;
}
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
export declare function registerFortuneTellerCompletions(handler: CompletionHandler, getCompletions: (argName: string, prefix?: string) => string[]): void;
//# sourceMappingURL=handler.d.ts.map