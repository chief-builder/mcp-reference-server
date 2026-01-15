/**
 * Tool Registration and Lookup
 *
 * Implements tool definition schema, registration, lookup, and paginated listing.
 * Supports MCP 2025-11-25 specification with tool annotations and event emitters.
 */
import { z } from 'zod';
import { EventEmitter } from 'events';
import { parseCursor, createCursor, clampPageSize, DEFAULT_PAGE_SIZE, } from '../protocol/pagination.js';
// =============================================================================
// Zod Schemas for Validation
// =============================================================================
/**
 * Tool name validation pattern (lowercase_with_underscores)
 */
export const ToolNamePattern = /^[a-z][a-z0-9_]*$/;
/**
 * Zod schema for tool name
 */
export const ToolNameSchema = z.string().regex(ToolNamePattern, 'Tool name must be lowercase with underscores, starting with a letter');
/**
 * Zod schema for tool annotations
 */
export const ToolAnnotationsSchema = z.object({
    readOnlyHint: z.boolean().optional(),
    destructiveHint: z.boolean().optional(),
    idempotentHint: z.boolean().optional(),
    openWorldHint: z.boolean().optional(),
}).strict().optional();
// =============================================================================
// Pagination Types
// =============================================================================
// Re-export pagination helpers for convenience
export { parseCursor, createCursor, clampPageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, } from '../protocol/pagination.js';
// =============================================================================
// Tool Registry
// =============================================================================
/**
 * Registry for tool definitions with pagination and change notifications
 */
export class ToolRegistry extends EventEmitter {
    tools = new Map();
    toolOrder = []; // Maintains insertion order for pagination
    constructor() {
        super();
    }
    /**
     * Register a new tool
     * @throws Error if tool name is invalid or already registered
     */
    registerTool(tool) {
        // Validate tool name
        const nameValidation = ToolNameSchema.safeParse(tool.name);
        if (!nameValidation.success) {
            throw new Error(`Invalid tool name '${tool.name}': ${nameValidation.error.message}`);
        }
        // Check for duplicates
        if (this.tools.has(tool.name)) {
            throw new Error(`Tool already registered: ${tool.name}`);
        }
        // Validate required fields
        if (!tool.description || tool.description.trim() === '') {
            throw new Error(`Tool '${tool.name}' must have a description`);
        }
        if (!tool.inputSchema || typeof tool.inputSchema !== 'object') {
            throw new Error(`Tool '${tool.name}' must have an inputSchema`);
        }
        if (typeof tool.handler !== 'function') {
            throw new Error(`Tool '${tool.name}' must have a handler function`);
        }
        // Register the tool
        this.tools.set(tool.name, tool);
        this.toolOrder.push(tool.name);
        // Emit change notification
        this.emit('toolsChanged');
    }
    /**
     * Unregister a tool by name
     * @returns true if tool was found and removed, false otherwise
     */
    unregisterTool(name) {
        if (!this.tools.has(name)) {
            return false;
        }
        this.tools.delete(name);
        this.toolOrder = this.toolOrder.filter((n) => n !== name);
        // Emit change notification
        this.emit('toolsChanged');
        return true;
    }
    /**
     * Get a tool by name
     */
    getTool(name) {
        return this.tools.get(name);
    }
    /**
     * Check if a tool exists
     */
    hasTool(name) {
        return this.tools.has(name);
    }
    /**
     * List all tools with pagination
     * @param cursor Optional opaque cursor for pagination
     * @param pageSize Number of items per page (default: 50, max: 200)
     */
    listTools(cursor, pageSize = DEFAULT_PAGE_SIZE) {
        // Parse and validate cursor using pagination helper
        const cursorResult = parseCursor(cursor ?? '');
        const startIndex = cursorResult.valid ? cursorResult.offset : 0;
        // Clamp page size to valid range
        const effectivePageSize = clampPageSize(pageSize);
        // Get slice of tools
        const endIndex = Math.min(startIndex + effectivePageSize, this.toolOrder.length);
        const toolNames = this.toolOrder.slice(startIndex, endIndex);
        // Build external tool definitions (without handlers)
        const tools = toolNames
            .map((name) => this.tools.get(name))
            .filter((tool) => tool !== undefined)
            .map((tool) => this.toExternalDefinition(tool));
        // Generate next cursor if there are more items
        let nextCursor;
        if (endIndex < this.toolOrder.length) {
            nextCursor = createCursor(endIndex);
        }
        return { tools, nextCursor };
    }
    /**
     * Get all tools (unpaginated, for internal use)
     */
    getAllTools() {
        return this.toolOrder
            .map((name) => this.tools.get(name))
            .filter((tool) => tool !== undefined);
    }
    /**
     * Get count of registered tools
     */
    getToolCount() {
        return this.tools.size;
    }
    /**
     * Clear all registered tools
     */
    clear() {
        const hadTools = this.tools.size > 0;
        this.tools.clear();
        this.toolOrder = [];
        if (hadTools) {
            this.emit('toolsChanged');
        }
    }
    /**
     * Add listener for tools changed events
     */
    onToolsChanged(listener) {
        this.on('toolsChanged', listener);
    }
    /**
     * Remove listener for tools changed events
     */
    offToolsChanged(listener) {
        this.off('toolsChanged', listener);
    }
    /**
     * Convert internal tool to external definition (without handler)
     */
    toExternalDefinition(tool) {
        const external = {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
        };
        if (tool.title !== undefined) {
            external.title = tool.title;
        }
        if (tool.outputSchema !== undefined) {
            external.outputSchema = tool.outputSchema;
        }
        if (tool.annotations !== undefined) {
            external.annotations = tool.annotations;
        }
        return external;
    }
}
/**
 * Convert a Zod schema to JSON Schema (basic conversion)
 */
export function zodToJsonSchema(zodSchema) {
    // This is a simplified conversion - for production, consider using
    // a library like zod-to-json-schema
    const def = zodSchema._def;
    const shape = def.shape?.();
    if (!shape) {
        // Fallback for non-object schemas
        return { type: 'object' };
    }
    const properties = {};
    const required = [];
    for (const [key, value] of Object.entries(shape)) {
        const zodType = value;
        properties[key] = zodTypeToJsonSchema(zodType);
        // Check if field is required (not optional)
        if (!zodType.isOptional()) {
            required.push(key);
        }
    }
    const result = {
        type: 'object',
        properties,
    };
    if (required.length > 0) {
        result.required = required;
    }
    return result;
}
/**
 * Convert individual Zod type to JSON Schema type
 */
function zodTypeToJsonSchema(zodType) {
    const def = zodType._def;
    // Handle optional wrapper
    if (def.typeName === 'ZodOptional' && def.innerType) {
        return zodTypeToJsonSchema(def.innerType);
    }
    // Handle nullable wrapper
    if (def.typeName === 'ZodNullable' && def.innerType) {
        const inner = zodTypeToJsonSchema(def.innerType);
        return { ...inner, nullable: true };
    }
    switch (def.typeName) {
        case 'ZodString':
            return { type: 'string' };
        case 'ZodNumber':
            return { type: 'number' };
        case 'ZodBoolean':
            return { type: 'boolean' };
        case 'ZodArray':
            return {
                type: 'array',
                items: def.type ? zodTypeToJsonSchema(def.type) : {},
            };
        case 'ZodObject':
            return zodToJsonSchema(zodType);
        case 'ZodEnum':
            if (def.values) {
                return {
                    type: 'string',
                    enum: def.values,
                };
            }
            return { type: 'string' };
        case 'ZodLiteral':
            return { const: def.value };
        default:
            return {};
    }
}
/**
 * Create a text content object
 */
export function createTextContent(text, annotations) {
    const content = { type: 'text', text };
    if (annotations) {
        content.annotations = annotations;
    }
    return content;
}
/**
 * Create an image content object
 */
export function createImageContent(data, mimeType, annotations) {
    const content = { type: 'image', data, mimeType };
    if (annotations) {
        content.annotations = annotations;
    }
    return content;
}
/**
 * Create an audio content object
 */
export function createAudioContent(data, mimeType, annotations) {
    const content = { type: 'audio', data, mimeType };
    if (annotations) {
        content.annotations = annotations;
    }
    return content;
}
/**
 * Create an embedded resource content object
 */
export function createResourceContent(uri, options) {
    const content = {
        type: 'resource',
        resource: { uri },
    };
    if (options?.mimeType) {
        content.resource.mimeType = options.mimeType;
    }
    if (options?.text !== undefined) {
        content.resource.text = options.text;
    }
    if (options?.blob !== undefined) {
        content.resource.blob = options.blob;
    }
    if (options?.annotations) {
        content.annotations = options.annotations;
    }
    return content;
}
//# sourceMappingURL=registry.js.map