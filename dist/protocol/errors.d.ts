/**
 * MCP Error Handling
 *
 * Implements comprehensive error handling for MCP protocol:
 * - Standard JSON-RPC 2.0 error codes (-32700 to -32603)
 * - MCP-specific error codes
 * - Tool execution errors (SEP-1303 compliant)
 * - Error response formatting and conversion
 */
import type { JsonRpcId, JsonRpcErrorResponse } from './jsonrpc.js';
/** Parse error - Invalid JSON was received by the server */
export declare const PARSE_ERROR = -32700;
/** Invalid Request - The JSON sent is not a valid Request object */
export declare const INVALID_REQUEST = -32600;
/** Method not found - The method does not exist / is not available */
export declare const METHOD_NOT_FOUND = -32601;
/** Invalid params - Invalid method parameter(s) */
export declare const INVALID_PARAMS = -32602;
/** Internal error - Internal JSON-RPC error */
export declare const INTERNAL_ERROR = -32603;
export declare const SERVER_ERROR_START = -32000;
export declare const SERVER_ERROR_END = -32099;
/** Request was cancelled by the client */
export declare const REQUEST_CANCELLED = -32800;
/** Content size exceeds maximum allowed */
export declare const CONTENT_TOO_LARGE = -32801;
export declare const ERROR_DESCRIPTIONS: Record<number, string>;
/**
 * Base error class for all MCP protocol errors.
 * Includes error code and optional data for additional context.
 */
export declare class McpError extends Error {
    readonly code: number;
    readonly data?: unknown | undefined;
    constructor(code: number, message: string, data?: unknown | undefined);
    /**
     * Convert to a plain object suitable for JSON serialization.
     * Never exposes internal stack traces in the response.
     */
    toJSON(): {
        code: number;
        message: string;
        data?: unknown;
    };
}
/**
 * Parse Error - Invalid JSON was received
 */
export declare class ParseError extends McpError {
    constructor(data?: unknown);
}
/**
 * Invalid Request Error - The JSON sent is not a valid Request object
 */
export declare class InvalidRequestError extends McpError {
    constructor(message?: string, data?: unknown);
}
/**
 * Method Not Found Error - The method does not exist or is not available
 */
export declare class MethodNotFoundError extends McpError {
    constructor(method: string);
}
/**
 * Invalid Params Error - Invalid method parameters
 */
export declare class InvalidParamsError extends McpError {
    constructor(message?: string, data?: unknown);
}
/**
 * Internal Error - Internal JSON-RPC error
 */
export declare class InternalError extends McpError {
    constructor(message?: string, data?: unknown);
}
/**
 * Request Cancelled Error - Request was cancelled by the client
 */
export declare class RequestCancelledError extends McpError {
    constructor(requestId?: string | number);
}
/**
 * Content Too Large Error - Content exceeds maximum allowed size
 */
export declare class ContentTooLargeError extends McpError {
    constructor(actualSize?: number, maxSize?: number);
}
export declare function createParseError(data?: unknown): McpError;
export declare function createInvalidRequest(message?: string, data?: unknown): McpError;
export declare function createMethodNotFound(method: string): McpError;
export declare function createInvalidParams(message?: string, data?: unknown): McpError;
export declare function createInternalError(message?: string, data?: unknown): McpError;
/**
 * Tool result content type
 */
export interface ToolResultContent {
    type: 'text';
    text: string;
}
/**
 * Tool execution result with optional error flag (SEP-1303)
 *
 * Per SEP-1303, tool validation/execution errors should be returned as
 * tool results with `isError: true` rather than as JSON-RPC protocol errors.
 * This enables LLM self-correction.
 */
export interface ToolResult {
    content: ToolResultContent[];
    isError?: boolean;
}
/**
 * Error that occurs during tool execution.
 * These errors are returned as tool results, not as JSON-RPC errors,
 * to enable LLM self-correction per SEP-1303.
 */
export declare class ToolExecutionError extends Error {
    readonly toolName: string;
    readonly details?: unknown | undefined;
    constructor(toolName: string, message: string, details?: unknown | undefined);
    /**
     * Convert to a tool result with isError: true
     */
    toToolResult(): ToolResult;
}
/**
 * Create a tool error result (SEP-1303 compliant).
 *
 * Tool errors should be returned as tool results with `isError: true`
 * rather than as JSON-RPC protocol errors. This allows the LLM to
 * understand and potentially correct the error.
 *
 * @param message - Human-readable error description
 * @param toolName - Optional name of the tool that failed
 * @param details - Optional additional error details
 * @returns A ToolResult with isError: true
 */
export declare function createToolErrorResult(message: string, toolName?: string, details?: unknown): ToolResult;
/**
 * Create a successful tool result
 */
export declare function createToolSuccessResult(text: string): ToolResult;
/**
 * Convert an McpError to a JSON-RPC error response.
 *
 * @param error - The McpError to convert
 * @param requestId - The request ID to include in the response
 * @returns A properly formatted JSON-RPC error response
 */
export declare function toErrorResponse(error: McpError, requestId: JsonRpcId): JsonRpcErrorResponse;
/**
 * Wrap an unknown error in an InternalError.
 *
 * Use this to safely convert any caught error to an McpError.
 * Never exposes internal stack traces or sensitive information.
 *
 * @param error - The unknown error to wrap
 * @returns An McpError (InternalError if not already an McpError)
 */
export declare function fromError(error: unknown): McpError;
/**
 * Create an error response from any error type.
 *
 * Convenience function that combines fromError() and toErrorResponse().
 *
 * @param error - Any error value
 * @param requestId - The request ID to include in the response
 * @returns A properly formatted JSON-RPC error response
 */
export declare function createErrorResponseFromError(error: unknown, requestId: JsonRpcId): JsonRpcErrorResponse;
/**
 * Check if an error is an McpError
 */
export declare function isMcpError(error: unknown): error is McpError;
/**
 * Check if an error is a ParseError
 */
export declare function isParseError(error: unknown): error is ParseError;
/**
 * Check if an error is an InvalidRequestError
 */
export declare function isInvalidRequestError(error: unknown): error is InvalidRequestError;
/**
 * Check if an error is a MethodNotFoundError
 */
export declare function isMethodNotFoundError(error: unknown): error is MethodNotFoundError;
/**
 * Check if an error is an InvalidParamsError
 */
export declare function isInvalidParamsError(error: unknown): error is InvalidParamsError;
/**
 * Check if an error is an InternalError
 */
export declare function isInternalError(error: unknown): error is InternalError;
/**
 * Check if an error is a ToolExecutionError
 */
export declare function isToolExecutionError(error: unknown): error is ToolExecutionError;
/**
 * Check if an error code is in the server error range (-32000 to -32099)
 */
export declare function isServerErrorCode(code: number): boolean;
/**
 * Check if an error code is a standard JSON-RPC error code
 */
export declare function isStandardErrorCode(code: number): boolean;
//# sourceMappingURL=errors.d.ts.map