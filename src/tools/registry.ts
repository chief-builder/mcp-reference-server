/**
 * Tool Registration and Lookup
 *
 * Implements tool definition schema, registration, lookup, and paginated listing.
 * Supports MCP 2025-11-25 specification with tool annotations and event emitters.
 */

import { z } from 'zod';
import { EventEmitter } from 'events';
import type { ToolResult } from '../protocol/errors.js';

// =============================================================================
// JSON Schema Types
// =============================================================================

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

// =============================================================================
// Content Types
// =============================================================================

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
  data: string; // Base64-encoded image data
  mimeType: string;
  annotations?: ContentAnnotations;
}

/**
 * Audio content type
 */
export interface AudioContent {
  type: 'audio';
  data: string; // Base64-encoded audio data
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

// =============================================================================
// Tool Result Types
// =============================================================================

// Re-export ToolResult from protocol/errors.js to avoid duplication
export type { ToolResult } from '../protocol/errors.js';

// =============================================================================
// Tool Annotations
// =============================================================================

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

// =============================================================================
// Tool Definition
// =============================================================================

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
export const ToolNameSchema = z.string().regex(
  ToolNamePattern,
  'Tool name must be lowercase with underscores, starting with a letter'
);

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

/**
 * Paginated list result
 */
export interface PaginatedToolList {
  tools: ToolDefinitionExternal[];
  nextCursor?: string | undefined;
}

// =============================================================================
// Tool Registry Events
// =============================================================================

export interface ToolRegistryEvents {
  toolsChanged: [];
}

// =============================================================================
// Tool Registry
// =============================================================================

const DEFAULT_PAGE_SIZE = 50;

/**
 * Registry for tool definitions with pagination and change notifications
 */
export class ToolRegistry extends EventEmitter {
  private tools: Map<string, Tool> = new Map();
  private toolOrder: string[] = []; // Maintains insertion order for pagination

  constructor() {
    super();
  }

  /**
   * Register a new tool
   * @throws Error if tool name is invalid or already registered
   */
  registerTool(tool: Tool): void {
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
  unregisterTool(name: string): boolean {
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
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * List all tools with pagination
   * @param cursor Optional cursor for pagination (base64 encoded index)
   * @param pageSize Number of items per page (default: 50)
   */
  listTools(cursor?: string, pageSize: number = DEFAULT_PAGE_SIZE): PaginatedToolList {
    // Determine starting index from cursor
    let startIndex = 0;
    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
        const parsed = parseInt(decoded, 10);
        if (!isNaN(parsed) && parsed >= 0) {
          startIndex = parsed;
        }
      } catch {
        // Invalid cursor, start from beginning
        startIndex = 0;
      }
    }

    // Ensure valid page size
    const effectivePageSize = Math.max(1, Math.min(pageSize, 1000));

    // Get slice of tools
    const endIndex = Math.min(startIndex + effectivePageSize, this.toolOrder.length);
    const toolNames = this.toolOrder.slice(startIndex, endIndex);

    // Build external tool definitions (without handlers)
    const tools: ToolDefinitionExternal[] = toolNames
      .map((name) => this.tools.get(name))
      .filter((tool): tool is Tool => tool !== undefined)
      .map((tool) => this.toExternalDefinition(tool));

    // Determine next cursor
    let nextCursor: string | undefined;
    if (endIndex < this.toolOrder.length) {
      nextCursor = Buffer.from(endIndex.toString()).toString('base64');
    }

    return { tools, nextCursor };
  }

  /**
   * Get all tools (unpaginated, for internal use)
   */
  getAllTools(): Tool[] {
    return this.toolOrder
      .map((name) => this.tools.get(name))
      .filter((tool): tool is Tool => tool !== undefined);
  }

  /**
   * Get count of registered tools
   */
  getToolCount(): number {
    return this.tools.size;
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
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
  onToolsChanged(listener: () => void): void {
    this.on('toolsChanged', listener);
  }

  /**
   * Remove listener for tools changed events
   */
  offToolsChanged(listener: () => void): void {
    this.off('toolsChanged', listener);
  }

  /**
   * Convert internal tool to external definition (without handler)
   */
  private toExternalDefinition(tool: Tool): ToolDefinitionExternal {
    const external: ToolDefinitionExternal = {
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

// =============================================================================
// Legacy exports for backwards compatibility
// =============================================================================

/**
 * @deprecated Use Tool interface instead
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  handler: (input: TInput) => Promise<TOutput>;
}

// =============================================================================
// Helper Functions
// =============================================================================

// Internal type for accessing Zod internals
interface ZodDefWithTypeName {
  typeName?: string;
  innerType?: z.ZodType;
  type?: z.ZodType;
  values?: unknown[];
  value?: unknown;
  shape?: () => Record<string, z.ZodType>;
}

/**
 * Convert a Zod schema to JSON Schema (basic conversion)
 */
export function zodToJsonSchema(zodSchema: z.ZodType): JsonSchema {
  // This is a simplified conversion - for production, consider using
  // a library like zod-to-json-schema
  const def = zodSchema._def as ZodDefWithTypeName;
  const shape = def.shape?.();

  if (!shape) {
    // Fallback for non-object schemas
    return { type: 'object' };
  }

  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const zodType = value;
    properties[key] = zodTypeToJsonSchema(zodType);

    // Check if field is required (not optional)
    if (!zodType.isOptional()) {
      required.push(key);
    }
  }

  const result: JsonSchema = {
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
function zodTypeToJsonSchema(zodType: z.ZodType): JsonSchema {
  const def = zodType._def as ZodDefWithTypeName;

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
export function createTextContent(
  text: string,
  annotations?: ContentAnnotations
): TextContent {
  const content: TextContent = { type: 'text', text };
  if (annotations) {
    content.annotations = annotations;
  }
  return content;
}

/**
 * Create an image content object
 */
export function createImageContent(
  data: string,
  mimeType: string,
  annotations?: ContentAnnotations
): ImageContent {
  const content: ImageContent = { type: 'image', data, mimeType };
  if (annotations) {
    content.annotations = annotations;
  }
  return content;
}

/**
 * Create an audio content object
 */
export function createAudioContent(
  data: string,
  mimeType: string,
  annotations?: ContentAnnotations
): AudioContent {
  const content: AudioContent = { type: 'audio', data, mimeType };
  if (annotations) {
    content.annotations = annotations;
  }
  return content;
}

/**
 * Create an embedded resource content object
 */
export function createResourceContent(
  uri: string,
  options?: {
    mimeType?: string;
    text?: string;
    blob?: string;
    annotations?: ContentAnnotations;
  }
): EmbeddedResource {
  const content: EmbeddedResource = {
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
