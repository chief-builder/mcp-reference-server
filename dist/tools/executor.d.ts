/**
 * Tool Execution with Validation
 *
 * Implements tool execution with JSON Schema validation, progress notifications,
 * and SEP-1303 compliant error handling.
 */
import { z } from 'zod';
import type { ToolRegistry, ToolResult, JsonSchema, Content } from './registry.js';
/**
 * Progress notification callback type
 */
export type ProgressCallback = (progress: number, total?: number) => void;
/**
 * Progress notification emitter for tool execution
 */
export interface ProgressEmitter {
    /** Emit progress for a tool execution */
    emitProgress(progressToken: string | number, progress: number, total?: number): void;
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
/**
 * Schema for tools/list request params
 */
export declare const ToolsListParamsSchema: z.ZodOptional<z.ZodObject<{
    cursor: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    cursor?: string | undefined;
}, {
    cursor?: string | undefined;
}>>;
export type ToolsListParams = z.infer<typeof ToolsListParamsSchema>;
/**
 * Schema for tools/call request params
 */
export declare const ToolsCallParamsSchema: z.ZodObject<{
    name: z.ZodString;
    arguments: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    _meta: z.ZodOptional<z.ZodObject<{
        progressToken: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    }, "strip", z.ZodTypeAny, {
        progressToken?: string | number | undefined;
    }, {
        progressToken?: string | number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    _meta?: {
        progressToken?: string | number | undefined;
    } | undefined;
    arguments?: Record<string, unknown> | undefined;
}, {
    name: string;
    _meta?: {
        progressToken?: string | number | undefined;
    } | undefined;
    arguments?: Record<string, unknown> | undefined;
}>;
export type ToolsCallParams = z.infer<typeof ToolsCallParamsSchema>;
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
export declare function validateJsonSchema(schema: JsonSchema, data: unknown): ValidationResult;
/**
 * Executes tools with validation and error handling
 */
export declare class ToolExecutor {
    private readonly registry;
    private readonly timeoutMs;
    private readonly validateInput;
    private readonly validateOutput;
    private readonly progressEmitter;
    constructor(registry: ToolRegistry, options?: ToolExecutorOptions);
    /**
     * Execute a tool by name with the given arguments
     *
     * Per SEP-1303, validation and execution errors are returned as
     * ToolResult with isError: true, not as protocol errors.
     */
    executeTool(name: string, args: unknown, context?: ToolExecutionContext): Promise<ToolResult>;
    /**
     * Execute tool handler with timeout and abort support
     */
    private executeWithTimeout;
    /**
     * Report progress for a tool execution
     */
    reportProgress(progressToken: string | number, progress: number, total?: number): void;
}
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
export declare function handleToolsList(registry: ToolRegistry, params?: ToolsListParams): ToolsListResponse;
/**
 * Handle tools/call request
 */
export declare function handleToolsCall(executor: ToolExecutor, params: ToolsCallParams): Promise<ToolsCallResponse>;
/**
 * Create a tools/listChanged notification payload
 */
export declare function createToolsListChangedNotification(): {
    method: 'notifications/tools/listChanged';
    params?: undefined;
};
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
//# sourceMappingURL=executor.d.ts.map