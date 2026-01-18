/**
 * Tool Execution with Validation
 *
 * Implements tool execution with JSON Schema validation, progress notifications,
 * and SEP-1303 compliant error handling.
 */

import { z } from 'zod';
import type {
  ToolRegistry,
  Tool,
  ToolResult,
  JsonSchema,
  Content,
} from './registry.js';
import {
  createToolErrorResult,
  ToolExecutionError,
} from '../protocol/errors.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Progress notification callback type
 */
export type ProgressCallback = (progress: number, total?: number) => void;

/**
 * Progress notification emitter for tool execution
 */
export interface ProgressEmitter {
  /** Emit progress for a tool execution */
  emitProgress(
    progressToken: string | number,
    progress: number,
    total?: number
  ): void;
}

/**
 * Options for tool executor
 */
export interface ToolExecutorOptions {
  /** Default timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** Whether to validate input against schema (default: true) */
  validateInput?: boolean;
  /** Whether to validate output against schema if present (default: false) */
  validateOutput?: boolean;
  /** Progress emitter for notifications */
  progressEmitter?: ProgressEmitter;
}

/**
 * Context passed to tool execution
 */
export interface ToolExecutionContext {
  /** Optional progress token for reporting progress */
  progressToken?: string | number;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}

/**
 * Internal execution result (used before converting to ToolResult)
 */
export interface ToolExecutionResult {
  success: boolean;
  result?: ToolResult;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  durationMs: number;
}

// =============================================================================
// Zod Schemas for Request Validation
// =============================================================================

/**
 * Schema for tools/list request params
 */
export const ToolsListParamsSchema = z.object({
  cursor: z.string().optional(),
}).optional();

export type ToolsListParams = z.infer<typeof ToolsListParamsSchema>;

/**
 * Schema for tools/call request params
 */
export const ToolsCallParamsSchema = z.object({
  name: z.string().min(1),
  arguments: z.record(z.unknown()).optional(),
  _meta: z.object({
    progressToken: z.union([z.string(), z.number()]).optional(),
  }).optional(),
});

export type ToolsCallParams = z.infer<typeof ToolsCallParamsSchema>;

// =============================================================================
// JSON Schema Validation (Simple Implementation)
// =============================================================================

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[] | undefined;
}

/**
 * Simple JSON Schema validator
 * For production use, consider using ajv or similar library
 */
export function validateJsonSchema(
  schema: JsonSchema,
  data: unknown
): ValidationResult {
  const errors: string[] = [];

  try {
    validateValue(schema, data, '', errors);
    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : 'Validation error'],
    };
  }
}

/**
 * Recursively validate a value against a schema
 */
function validateValue(
  schema: JsonSchema,
  value: unknown,
  path: string,
  errors: string[]
): void {
  // Handle null/undefined
  if (value === null || value === undefined) {
    if (schema.type && !schemaAllowsNull(schema)) {
      errors.push(`${path || '/'}: value is ${value === null ? 'null' : 'undefined'} but schema does not allow it`);
    }
    return;
  }

  // Type validation
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const typeMatches = types.some((t) => matchesType(value, t));

    if (!typeMatches) {
      const actualType = getJsonType(value);
      errors.push(`${path || '/'}: expected ${types.join(' | ')}, got ${actualType}`);
      return;
    }
  }

  // Const validation
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path || '/'}: expected const value ${JSON.stringify(schema.const)}`);
    return;
  }

  // Enum validation
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path || '/'}: value must be one of ${JSON.stringify(schema.enum)}`);
    return;
  }

  // Object validation
  if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
    validateObject(schema, value as Record<string, unknown>, path, errors);
  }

  // Array validation
  if (Array.isArray(value)) {
    validateArray(schema, value, path, errors);
  }

  // String validation
  if (typeof value === 'string') {
    validateString(schema, value, path, errors);
  }

  // Number validation
  if (typeof value === 'number') {
    validateNumber(schema, value, path, errors);
  }
}

/**
 * Check if schema allows null
 */
function schemaAllowsNull(schema: JsonSchema): boolean {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  return types.includes('null');
}

/**
 * Get JSON type of a value
 */
function getJsonType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Check if a value matches a type specification
 */
function matchesType(value: unknown, expectedType: string): boolean {
  const actualType = getJsonType(value);

  // Direct match
  if (actualType === expectedType) return true;

  // Handle 'integer' type - numbers that are integers
  if (expectedType === 'integer' && typeof value === 'number') {
    return Number.isInteger(value);
  }

  // 'number' type accepts both integers and floats
  if (expectedType === 'number' && typeof value === 'number') {
    return true;
  }

  return false;
}

/**
 * Validate object properties
 */
function validateObject(
  schema: JsonSchema,
  obj: Record<string, unknown>,
  path: string,
  errors: string[]
): void {
  // Required properties
  if (schema.required) {
    for (const prop of schema.required) {
      if (!(prop in obj)) {
        errors.push(`${path || '/'}/${prop}: required property is missing`);
      }
    }
  }

  // Property validation
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in obj) {
        validateValue(propSchema, obj[key], `${path}/${key}`, errors);
      }
    }
  }

  // Additional properties
  if (schema.additionalProperties === false && schema.properties) {
    const allowedKeys = new Set(Object.keys(schema.properties));
    for (const key of Object.keys(obj)) {
      if (!allowedKeys.has(key)) {
        errors.push(`${path || '/'}/${key}: additional property not allowed`);
      }
    }
  }
}

/**
 * Validate array items
 */
function validateArray(
  schema: JsonSchema,
  arr: unknown[],
  path: string,
  errors: string[]
): void {
  if (schema.items) {
    const itemSchema = Array.isArray(schema.items) ? schema.items[0] : schema.items;
    if (itemSchema) {
      arr.forEach((item, index) => {
        validateValue(itemSchema, item, `${path}[${index}]`, errors);
      });
    }
  }
}

/**
 * Validate string constraints
 */
function validateString(
  schema: JsonSchema,
  value: string,
  path: string,
  errors: string[]
): void {
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    errors.push(`${path || '/'}: string length ${value.length} is less than minimum ${schema.minLength}`);
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    errors.push(`${path || '/'}: string length ${value.length} exceeds maximum ${schema.maxLength}`);
  }
  if (schema.pattern) {
    const regex = new RegExp(schema.pattern);
    if (!regex.test(value)) {
      errors.push(`${path || '/'}: string does not match pattern ${schema.pattern}`);
    }
  }
}

/**
 * Validate number constraints
 */
function validateNumber(
  schema: JsonSchema,
  value: number,
  path: string,
  errors: string[]
): void {
  if (schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${path || '/'}: value ${value} is less than minimum ${schema.minimum}`);
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    errors.push(`${path || '/'}: value ${value} exceeds maximum ${schema.maximum}`);
  }
}

// =============================================================================
// Tool Executor
// =============================================================================

/**
 * Executes tools with validation and error handling
 */
export class ToolExecutor {
  private readonly registry: ToolRegistry;
  private readonly timeoutMs: number;
  private readonly validateInput: boolean;
  private readonly validateOutput: boolean;
  private readonly progressEmitter: ProgressEmitter | undefined;

  constructor(registry: ToolRegistry, options: ToolExecutorOptions = {}) {
    this.registry = registry;
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.validateInput = options.validateInput ?? true;
    this.validateOutput = options.validateOutput ?? false;
    this.progressEmitter = options.progressEmitter;
  }

  /**
   * Execute a tool by name with the given arguments
   *
   * Per SEP-1303, validation and execution errors are returned as
   * ToolResult with isError: true, not as protocol errors.
   */
  async executeTool(
    name: string,
    args: unknown,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    // Look up the tool
    const tool = this.registry.getTool(name);
    if (!tool) {
      return createToolErrorResult(
        `Unknown tool: ${name}`,
        name,
        { availableTools: this.registry.getAllTools().map((t) => t.name) }
      );
    }

    // Validate input if enabled
    if (this.validateInput) {
      const validation = validateJsonSchema(tool.inputSchema, args);
      if (!validation.valid) {
        return createToolErrorResult(
          `Invalid arguments for tool '${name}'`,
          name,
          { validationErrors: validation.errors }
        );
      }
    }

    // Execute the tool
    try {
      const result = await this.executeWithTimeout(
        tool,
        args,
        context
      );

      // Validate output if enabled and schema is present
      if (
        this.validateOutput &&
        tool.outputSchema &&
        result.content &&
        !result.isError
      ) {
        // Extract data from content for validation (simplified)
        const textContent = result.content.find((c) => c.type === 'text');
        if (textContent && textContent.type === 'text') {
          try {
            const outputData = JSON.parse(textContent.text);
            const validation = validateJsonSchema(tool.outputSchema, outputData);
            if (!validation.valid) {
              return createToolErrorResult(
                `Tool output validation failed`,
                name,
                { validationErrors: validation.errors }
              );
            }
          } catch {
            // Output is not JSON, skip validation
          }
        }
      }

      return result;
    } catch (error) {
      // Handle tool execution errors (SEP-1303)
      if (error instanceof ToolExecutionError) {
        return error.toToolResult();
      }

      // Handle cancellation
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.message === 'Tool execution cancelled')
      ) {
        return createToolErrorResult(
          'Tool execution was cancelled',
          name
        );
      }

      // Handle timeout
      if (error instanceof Error && error.message === 'Tool execution timeout') {
        return createToolErrorResult(
          `Tool execution timed out after ${this.timeoutMs}ms`,
          name
        );
      }

      // Handle generic errors
      const message = error instanceof Error ? error.message : 'Unknown error';
      return createToolErrorResult(message, name);
    }
  }

  /**
   * Execute tool handler with timeout and abort support
   */
  private async executeWithTimeout(
    tool: Tool,
    args: unknown,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const timeoutMs = this.timeoutMs;

    // Create abort controller for timeout
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => {
      timeoutController.abort();
    }, timeoutMs);

    try {
      // Race between tool execution, timeout, and external abort
      const result = await Promise.race([
        tool.handler(args),
        new Promise<ToolResult>((_, reject) => {
          timeoutController.signal.addEventListener('abort', () => {
            reject(new Error('Tool execution timeout'));
          }, { once: true });
        }),
        ...(context?.abortSignal
          ? [
              new Promise<ToolResult>((_, reject) => {
                context.abortSignal!.addEventListener('abort', () => {
                  reject(new Error('Tool execution cancelled'));
                }, { once: true });
              }),
            ]
          : []),
      ]);

      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Report progress for a tool execution
   */
  reportProgress(
    progressToken: string | number,
    progress: number,
    total?: number
  ): void {
    if (this.progressEmitter) {
      this.progressEmitter.emitProgress(progressToken, progress, total);
    }
  }
}

// =============================================================================
// Request Handlers
// =============================================================================

/**
 * Response type for tools/list
 */
export interface ToolsListResponse {
  tools: Array<{
    name: string;
    title?: string;
    description: string;
    inputSchema: JsonSchema;
    outputSchema?: JsonSchema;
    annotations?: {
      readOnlyHint?: boolean;
      destructiveHint?: boolean;
      idempotentHint?: boolean;
      openWorldHint?: boolean;
    };
  }>;
  nextCursor?: string | undefined;
}

/**
 * Response type for tools/call
 */
export interface ToolsCallResponse {
  content: Content[];
  isError?: boolean | undefined;
}

/**
 * Handle tools/list request
 */
export function handleToolsList(
  registry: ToolRegistry,
  params?: ToolsListParams
): ToolsListResponse {
  const cursor = params?.cursor;
  const result = registry.listTools(cursor);

  return {
    tools: result.tools,
    nextCursor: result.nextCursor,
  };
}

/**
 * Handle tools/call request
 */
export async function handleToolsCall(
  executor: ToolExecutor,
  params: ToolsCallParams
): Promise<ToolsCallResponse> {
  const { name, arguments: args, _meta } = params;
  const progressToken = _meta?.progressToken;

  const context: ToolExecutionContext = {};
  if (progressToken !== undefined) {
    context.progressToken = progressToken;
  }

  const result = await executor.executeTool(name, args ?? {}, context);

  return {
    content: result.content,
    isError: result.isError,
  };
}

// =============================================================================
// Notification Helpers
// =============================================================================

/**
 * Create a tools/listChanged notification payload
 */
export function createToolsListChangedNotification(): {
  method: 'notifications/tools/listChanged';
  params?: undefined;
} {
  return {
    method: 'notifications/tools/listChanged',
  };
}

// =============================================================================
// Legacy exports for backwards compatibility
// =============================================================================

/**
 * @deprecated Use ToolExecutionResult interface instead
 */
export interface LegacyToolExecutionResult {
  success: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  durationMs: number;
}
