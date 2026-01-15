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
import { JSONRPC_VERSION, createJsonRpcError } from './jsonrpc.js';

// =============================================================================
// JSON-RPC 2.0 Standard Error Codes
// =============================================================================

/** Parse error - Invalid JSON was received by the server */
export const PARSE_ERROR = -32700;

/** Invalid Request - The JSON sent is not a valid Request object */
export const INVALID_REQUEST = -32600;

/** Method not found - The method does not exist / is not available */
export const METHOD_NOT_FOUND = -32601;

/** Invalid params - Invalid method parameter(s) */
export const INVALID_PARAMS = -32602;

/** Internal error - Internal JSON-RPC error */
export const INTERNAL_ERROR = -32603;

// JSON-RPC 2.0 reserved range for server errors: -32000 to -32099
export const SERVER_ERROR_START = -32000;
export const SERVER_ERROR_END = -32099;

// =============================================================================
// MCP-Specific Error Codes
// =============================================================================

/** Request was cancelled by the client */
export const REQUEST_CANCELLED = -32800;

/** Content size exceeds maximum allowed */
export const CONTENT_TOO_LARGE = -32801;

// =============================================================================
// Error Code Descriptions (for documentation/debugging)
// =============================================================================

export const ERROR_DESCRIPTIONS: Record<number, string> = {
  [PARSE_ERROR]: 'Invalid JSON',
  [INVALID_REQUEST]: 'Not a valid request object',
  [METHOD_NOT_FOUND]: 'Method does not exist',
  [INVALID_PARAMS]: 'Invalid method parameters',
  [INTERNAL_ERROR]: 'Internal JSON-RPC error',
  [REQUEST_CANCELLED]: 'Request was cancelled',
  [CONTENT_TOO_LARGE]: 'Content exceeds maximum size',
};

// =============================================================================
// Base MCP Error Class
// =============================================================================

/**
 * Base error class for all MCP protocol errors.
 * Includes error code and optional data for additional context.
 */
export class McpError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = 'McpError';
    // Maintain proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert to a plain object suitable for JSON serialization.
   * Never exposes internal stack traces in the response.
   */
  toJSON(): { code: number; message: string; data?: unknown } {
    const result: { code: number; message: string; data?: unknown } = {
      code: this.code,
      message: this.message,
    };
    if (this.data !== undefined) {
      result.data = this.data;
    }
    return result;
  }
}

// =============================================================================
// Specific Error Classes
// =============================================================================

/**
 * Parse Error - Invalid JSON was received
 */
export class ParseError extends McpError {
  constructor(data?: unknown) {
    super(PARSE_ERROR, 'Parse error: Invalid JSON', data);
    this.name = 'ParseError';
  }
}

/**
 * Invalid Request Error - The JSON sent is not a valid Request object
 */
export class InvalidRequestError extends McpError {
  constructor(message?: string, data?: unknown) {
    super(INVALID_REQUEST, message ?? 'Invalid Request', data);
    this.name = 'InvalidRequestError';
  }
}

/**
 * Method Not Found Error - The method does not exist or is not available
 */
export class MethodNotFoundError extends McpError {
  constructor(method: string) {
    super(METHOD_NOT_FOUND, `Method not found: ${method}`, { method });
    this.name = 'MethodNotFoundError';
  }
}

/**
 * Invalid Params Error - Invalid method parameters
 */
export class InvalidParamsError extends McpError {
  constructor(message?: string, data?: unknown) {
    super(INVALID_PARAMS, message ?? 'Invalid params', data);
    this.name = 'InvalidParamsError';
  }
}

/**
 * Internal Error - Internal JSON-RPC error
 */
export class InternalError extends McpError {
  constructor(message?: string, data?: unknown) {
    super(INTERNAL_ERROR, message ?? 'Internal error', data);
    this.name = 'InternalError';
  }
}

/**
 * Request Cancelled Error - Request was cancelled by the client
 */
export class RequestCancelledError extends McpError {
  constructor(requestId?: string | number) {
    super(
      REQUEST_CANCELLED,
      'Request cancelled',
      requestId !== undefined ? { requestId } : undefined
    );
    this.name = 'RequestCancelledError';
  }
}

/**
 * Content Too Large Error - Content exceeds maximum allowed size
 */
export class ContentTooLargeError extends McpError {
  constructor(actualSize?: number, maxSize?: number) {
    const data =
      actualSize !== undefined || maxSize !== undefined
        ? { actualSize, maxSize }
        : undefined;
    super(CONTENT_TOO_LARGE, 'Content too large', data);
    this.name = 'ContentTooLargeError';
  }
}

// =============================================================================
// Factory Functions (for backwards compatibility)
// =============================================================================

export function createParseError(data?: unknown): McpError {
  return new ParseError(data);
}

export function createInvalidRequest(message?: string, data?: unknown): McpError {
  return new InvalidRequestError(message, data);
}

export function createMethodNotFound(method: string): McpError {
  return new MethodNotFoundError(method);
}

export function createInvalidParams(message?: string, data?: unknown): McpError {
  return new InvalidParamsError(message, data);
}

export function createInternalError(message?: string, data?: unknown): McpError {
  return new InternalError(message, data);
}

// =============================================================================
// Tool Execution Errors (SEP-1303)
// =============================================================================

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
export class ToolExecutionError extends Error {
  constructor(
    public readonly toolName: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ToolExecutionError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert to a tool result with isError: true
   */
  toToolResult(): ToolResult {
    return createToolErrorResult(this.message, this.toolName, this.details);
  }
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
export function createToolErrorResult(
  message: string,
  toolName?: string,
  details?: unknown
): ToolResult {
  // Build an actionable error message
  let errorText = message;

  if (toolName) {
    errorText = `Tool '${toolName}' failed: ${message}`;
  }

  // Add details if provided (but never include stack traces)
  if (details !== undefined) {
    // Safely serialize details, avoiding circular references
    try {
      const detailsStr =
        typeof details === 'string' ? details : JSON.stringify(details, null, 2);
      errorText += `\n\nDetails: ${detailsStr}`;
    } catch {
      // If serialization fails, skip details
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: errorText,
      },
    ],
    isError: true,
  };
}

/**
 * Create a successful tool result
 */
export function createToolSuccessResult(text: string): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
  };
}

// =============================================================================
// Error Response Helpers
// =============================================================================

/**
 * Convert an McpError to a JSON-RPC error response.
 *
 * @param error - The McpError to convert
 * @param requestId - The request ID to include in the response
 * @returns A properly formatted JSON-RPC error response
 */
export function toErrorResponse(
  error: McpError,
  requestId: JsonRpcId
): JsonRpcErrorResponse {
  return {
    jsonrpc: JSONRPC_VERSION,
    id: requestId,
    error: createJsonRpcError(error.code, error.message, error.data),
  };
}

/**
 * Wrap an unknown error in an InternalError.
 *
 * Use this to safely convert any caught error to an McpError.
 * Never exposes internal stack traces or sensitive information.
 *
 * @param error - The unknown error to wrap
 * @returns An McpError (InternalError if not already an McpError)
 */
export function fromError(error: unknown): McpError {
  // Already an McpError, return as-is
  if (error instanceof McpError) {
    return error;
  }

  // Standard Error - extract message but not stack trace
  if (error instanceof Error) {
    // Provide actionable message without exposing internals
    return new InternalError(
      `An internal error occurred: ${error.message}`
    );
  }

  // String error
  if (typeof error === 'string') {
    return new InternalError(`An internal error occurred: ${error}`);
  }

  // Unknown error type
  return new InternalError('An unexpected internal error occurred');
}

/**
 * Create an error response from any error type.
 *
 * Convenience function that combines fromError() and toErrorResponse().
 *
 * @param error - Any error value
 * @param requestId - The request ID to include in the response
 * @returns A properly formatted JSON-RPC error response
 */
export function createErrorResponseFromError(
  error: unknown,
  requestId: JsonRpcId
): JsonRpcErrorResponse {
  return toErrorResponse(fromError(error), requestId);
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if an error is an McpError
 */
export function isMcpError(error: unknown): error is McpError {
  return error instanceof McpError;
}

/**
 * Check if an error is a ParseError
 */
export function isParseError(error: unknown): error is ParseError {
  return error instanceof ParseError;
}

/**
 * Check if an error is an InvalidRequestError
 */
export function isInvalidRequestError(error: unknown): error is InvalidRequestError {
  return error instanceof InvalidRequestError;
}

/**
 * Check if an error is a MethodNotFoundError
 */
export function isMethodNotFoundError(error: unknown): error is MethodNotFoundError {
  return error instanceof MethodNotFoundError;
}

/**
 * Check if an error is an InvalidParamsError
 */
export function isInvalidParamsError(error: unknown): error is InvalidParamsError {
  return error instanceof InvalidParamsError;
}

/**
 * Check if an error is an InternalError
 */
export function isInternalError(error: unknown): error is InternalError {
  return error instanceof InternalError;
}

/**
 * Check if an error is a ToolExecutionError
 */
export function isToolExecutionError(error: unknown): error is ToolExecutionError {
  return error instanceof ToolExecutionError;
}

/**
 * Check if an error code is in the server error range (-32000 to -32099)
 */
export function isServerErrorCode(code: number): boolean {
  return code >= SERVER_ERROR_END && code <= SERVER_ERROR_START;
}

/**
 * Check if an error code is a standard JSON-RPC error code
 */
export function isStandardErrorCode(code: number): boolean {
  return (
    code === PARSE_ERROR ||
    code === INVALID_REQUEST ||
    code === METHOD_NOT_FOUND ||
    code === INVALID_PARAMS ||
    code === INTERNAL_ERROR
  );
}
