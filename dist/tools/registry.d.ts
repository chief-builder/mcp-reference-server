/**
 * Tool Registration and Lookup
 *
 * Implements tool definition schema, registration, lookup, and paginated listing.
 * Supports MCP 2025-11-25 specification with tool annotations and event emitters.
 */
import { z } from 'zod';
import { EventEmitter } from 'events';
import type { ToolResult } from '../protocol/errors.js';
/**
 * JSON Schema 2020-12 compatible schema type
 */
export interface JsonSchema {
    type?: string | string[];
    properties?: Record<string, JsonSchema>;
    required?: string[];
    additionalProperties?: boolean | JsonSchema;
    items?: JsonSchema | JsonSchema[];
    enum?: unknown[];
    const?: unknown;
    oneOf?: JsonSchema[];
    anyOf?: JsonSchema[];
    allOf?: JsonSchema[];
    not?: JsonSchema;
    if?: JsonSchema;
    then?: JsonSchema;
    else?: JsonSchema;
    $ref?: string;
    $defs?: Record<string, JsonSchema>;
    title?: string;
    description?: string;
    default?: unknown;
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    format?: string;
    [key: string]: unknown;
}
/**
 * Content annotations for audience and priority
 */
export interface ContentAnnotations {
    /** Target audience for this content */
    audience?: ('user' | 'assistant')[];
    /** Priority level (higher = more important) */
    priority?: number;
}
/**
 * Text content type
 */
export interface TextContent {
    type: 'text';
    text: string;
    annotations?: ContentAnnotations;
}
/**
 * Image content type
 */
export interface ImageContent {
    type: 'image';
    data: string;
    mimeType: string;
    annotations?: ContentAnnotations;
}
/**
 * Audio content type
 */
export interface AudioContent {
    type: 'audio';
    data: string;
    mimeType: string;
    annotations?: ContentAnnotations;
}
/**
 * Embedded resource content type
 */
export interface EmbeddedResource {
    type: 'resource';
    resource: {
        uri: string;
        mimeType?: string;
        text?: string;
        blob?: string;
    };
    annotations?: ContentAnnotations;
}
/**
 * Union of all content types
 */
export type Content = TextContent | ImageContent | AudioContent | EmbeddedResource;
export type { ToolResult } from '../protocol/errors.js';
/**
 * Tool behavior hints for clients
 */
export interface ToolAnnotations {
    /** Tool has no side effects (safe to call without user confirmation) */
    readOnlyHint?: boolean;
    /** Tool may modify or delete data */
    destructiveHint?: boolean;
    /** Safe to call multiple times with same arguments */
    idempotentHint?: boolean;
    /** May access external services or APIs */
    openWorldHint?: boolean;
}
/**
 * Tool execution handler function type
 */
export type ToolHandler = (args: unknown) => Promise<ToolResult>;
/**
 * Complete tool definition
 */
export interface Tool {
    /** Unique tool name (lowercase_with_underscores) */
    name: string;
    /** Human-readable display name */
    title?: string;
    /** Clear description for LLM */
    description: string;
    /** JSON Schema 2020-12 for input validation */
    inputSchema: JsonSchema;
    /** Optional JSON Schema for result validation */
    outputSchema?: JsonSchema;
    /** Behavior hints */
    annotations?: ToolAnnotations;
    /** Execution function */
    handler: ToolHandler;
}
/**
 * Tool definition for external API (without handler)
 */
export interface ToolDefinitionExternal {
    name: string;
    title?: string;
    description: string;
    inputSchema: JsonSchema;
    outputSchema?: JsonSchema;
    annotations?: ToolAnnotations;
}
/**
 * Tool name validation pattern (lowercase_with_underscores)
 */
export declare const ToolNamePattern: RegExp;
/**
 * Zod schema for tool name
 */
export declare const ToolNameSchema: z.ZodString;
/**
 * Zod schema for tool annotations
 */
export declare const ToolAnnotationsSchema: z.ZodOptional<z.ZodObject<{
    readOnlyHint: z.ZodOptional<z.ZodBoolean>;
    destructiveHint: z.ZodOptional<z.ZodBoolean>;
    idempotentHint: z.ZodOptional<z.ZodBoolean>;
    openWorldHint: z.ZodOptional<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    readOnlyHint?: boolean | undefined;
    destructiveHint?: boolean | undefined;
    idempotentHint?: boolean | undefined;
    openWorldHint?: boolean | undefined;
}, {
    readOnlyHint?: boolean | undefined;
    destructiveHint?: boolean | undefined;
    idempotentHint?: boolean | undefined;
    openWorldHint?: boolean | undefined;
}>>;
export { parseCursor, createCursor, clampPageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, } from '../protocol/pagination.js';
/**
 * Paginated list result
 */
export interface PaginatedToolList {
    tools: ToolDefinitionExternal[];
    nextCursor?: string | undefined;
}
export interface ToolRegistryEvents {
    toolsChanged: [];
}
/**
 * Registry for tool definitions with pagination and change notifications
 */
export declare class ToolRegistry extends EventEmitter {
    private tools;
    private toolOrder;
    constructor();
    /**
     * Register a new tool
     * @throws Error if tool name is invalid or already registered
     */
    registerTool(tool: Tool): void;
    /**
     * Unregister a tool by name
     * @returns true if tool was found and removed, false otherwise
     */
    unregisterTool(name: string): boolean;
    /**
     * Get a tool by name
     */
    getTool(name: string): Tool | undefined;
    /**
     * Check if a tool exists
     */
    hasTool(name: string): boolean;
    /**
     * List all tools with pagination
     * @param cursor Optional opaque cursor for pagination
     * @param pageSize Number of items per page (default: 50, max: 200)
     */
    listTools(cursor?: string, pageSize?: number): PaginatedToolList;
    /**
     * Get all tools (unpaginated, for internal use)
     */
    getAllTools(): Tool[];
    /**
     * Get count of registered tools
     */
    getToolCount(): number;
    /**
     * Clear all registered tools
     */
    clear(): void;
    /**
     * Add listener for tools changed events
     */
    onToolsChanged(listener: () => void): void;
    /**
     * Remove listener for tools changed events
     */
    offToolsChanged(listener: () => void): void;
    /**
     * Convert internal tool to external definition (without handler)
     */
    private toExternalDefinition;
}
/**
 * @deprecated Use Tool interface instead
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
    name: string;
    description: string;
    inputSchema: z.ZodType<TInput>;
    handler: (input: TInput) => Promise<TOutput>;
}
/**
 * Convert a Zod schema to JSON Schema (basic conversion)
 */
export declare function zodToJsonSchema(zodSchema: z.ZodType): JsonSchema;
/**
 * Create a text content object
 */
export declare function createTextContent(text: string, annotations?: ContentAnnotations): TextContent;
/**
 * Create an image content object
 */
export declare function createImageContent(data: string, mimeType: string, annotations?: ContentAnnotations): ImageContent;
/**
 * Create an audio content object
 */
export declare function createAudioContent(data: string, mimeType: string, annotations?: ContentAnnotations): AudioContent;
/**
 * Create an embedded resource content object
 */
export declare function createResourceContent(uri: string, options?: {
    mimeType?: string;
    text?: string;
    blob?: string;
    annotations?: ContentAnnotations;
}): EmbeddedResource;
//# sourceMappingURL=registry.d.ts.map