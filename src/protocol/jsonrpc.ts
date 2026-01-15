/**
 * JSON-RPC 2.0 types and parsing
 *
 * Implements the JSON-RPC 2.0 specification for MCP protocol messages.
 * See: https://www.jsonrpc.org/specification
 */

import { z } from 'zod';

// =============================================================================
// Constants
// =============================================================================

export const JSONRPC_VERSION = '2.0' as const;

/**
 * Standard JSON-RPC 2.0 error codes
 */
export const JsonRpcErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Server errors reserved: -32000 to -32099
  SERVER_ERROR_START: -32099,
  SERVER_ERROR_END: -32000,
} as const;

// =============================================================================
// Zod Schemas
// =============================================================================

/**
 * JSON-RPC message ID - can be string, number, or null
 * Per spec: IDs SHOULD NOT contain fractional parts
 */
export const JsonRpcIdSchema = z.union([
  z.string(),
  z.number().int(),
  z.null(),
]);

/**
 * JSON-RPC error object schema
 */
export const JsonRpcErrorSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  data: z.unknown().optional(),
});

/**
 * Base JSON-RPC message with version field
 */
const JsonRpcBaseSchema = z.object({
  jsonrpc: z.literal(JSONRPC_VERSION),
});

/**
 * JSON-RPC Request schema
 * A request MUST have an id field (distinguishes from notification)
 */
export const JsonRpcRequestSchema = JsonRpcBaseSchema.extend({
  id: z.union([z.string(), z.number().int()]), // Requests must have non-null id
  method: z.string(),
  params: z.record(z.unknown()).optional(),
});

/**
 * JSON-RPC Notification schema
 * A notification MUST NOT have an id field
 */
export const JsonRpcNotificationSchema = JsonRpcBaseSchema.extend({
  method: z.string(),
  params: z.record(z.unknown()).optional(),
}).strict();

/**
 * JSON-RPC Success Response schema
 */
export const JsonRpcSuccessResponseSchema = JsonRpcBaseSchema.extend({
  id: JsonRpcIdSchema,
  result: z.unknown(),
});

/**
 * JSON-RPC Error Response schema
 */
export const JsonRpcErrorResponseSchema = JsonRpcBaseSchema.extend({
  id: JsonRpcIdSchema,
  error: JsonRpcErrorSchema,
});

/**
 * JSON-RPC Response schema (either success or error)
 */
export const JsonRpcResponseSchema = z.union([
  JsonRpcSuccessResponseSchema,
  JsonRpcErrorResponseSchema,
]);

/**
 * Any JSON-RPC message (request, notification, or response)
 */
export const JsonRpcMessageSchema = z.union([
  JsonRpcRequestSchema,
  JsonRpcNotificationSchema,
  JsonRpcResponseSchema,
]);

// =============================================================================
// Types (inferred from schemas)
// =============================================================================

export type JsonRpcId = z.infer<typeof JsonRpcIdSchema>;
export type JsonRpcError = z.infer<typeof JsonRpcErrorSchema>;
export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>;
export type JsonRpcNotification = z.infer<typeof JsonRpcNotificationSchema>;
export type JsonRpcSuccessResponse = z.infer<typeof JsonRpcSuccessResponseSchema>;
export type JsonRpcErrorResponse = z.infer<typeof JsonRpcErrorResponseSchema>;
export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>;
export type JsonRpcMessage = z.infer<typeof JsonRpcMessageSchema>;

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a message is a request (has id field)
 */
export function isRequest(message: JsonRpcMessage): message is JsonRpcRequest {
  return 'id' in message && 'method' in message && message.id !== undefined;
}

/**
 * Check if a message is a notification (has method but no id)
 */
export function isNotification(message: JsonRpcMessage): message is JsonRpcNotification {
  return 'method' in message && !('id' in message);
}

/**
 * Check if a message is a response (has result or error, no method)
 */
export function isResponse(message: JsonRpcMessage): message is JsonRpcResponse {
  return ('result' in message || 'error' in message) && !('method' in message);
}

/**
 * Check if a response is a success response
 */
export function isSuccessResponse(response: JsonRpcResponse): response is JsonRpcSuccessResponse {
  return 'result' in response && !('error' in response);
}

/**
 * Check if a response is an error response
 */
export function isErrorResponse(response: JsonRpcResponse): response is JsonRpcErrorResponse {
  return 'error' in response;
}

// =============================================================================
// ID Generator
// =============================================================================

/**
 * Creates a unique ID generator for JSON-RPC messages within a session
 */
export function createIdGenerator(prefix?: string): () => string {
  let counter = 0;
  const sessionId = prefix ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  return () => {
    counter += 1;
    return `${sessionId}-${counter}`;
  };
}

/**
 * Creates a numeric ID generator for JSON-RPC messages
 */
export function createNumericIdGenerator(): () => number {
  let counter = 0;
  return () => {
    counter += 1;
    return counter;
  };
}

// =============================================================================
// Parse Result Types
// =============================================================================

export type ParseSuccess<T> = {
  success: true;
  data: T;
};

export type ParseError = {
  success: false;
  error: JsonRpcError;
};

export type ParseResult<T> = ParseSuccess<T> | ParseError;

// =============================================================================
// Parsing Functions
// =============================================================================

/**
 * Create a JSON-RPC error object
 */
export function createJsonRpcError(
  code: number,
  message: string,
  data?: unknown
): JsonRpcError {
  const error: JsonRpcError = { code, message };
  if (data !== undefined) {
    error.data = data;
  }
  return error;
}

/**
 * Parse a JSON string into a JSON-RPC message
 */
export function parseJsonRpc(input: string): ParseResult<JsonRpcRequest | JsonRpcNotification> {
  // Step 1: Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (e) {
    return {
      success: false,
      error: createJsonRpcError(
        JsonRpcErrorCodes.PARSE_ERROR,
        'Parse error: Invalid JSON',
        e instanceof Error ? e.message : String(e)
      ),
    };
  }

  // Step 2: Check if it's an object
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      success: false,
      error: createJsonRpcError(
        JsonRpcErrorCodes.INVALID_REQUEST,
        'Invalid Request: Expected object'
      ),
    };
  }

  const obj = parsed as Record<string, unknown>;

  // Step 3: Check jsonrpc version
  if (obj.jsonrpc !== JSONRPC_VERSION) {
    return {
      success: false,
      error: createJsonRpcError(
        JsonRpcErrorCodes.INVALID_REQUEST,
        `Invalid Request: jsonrpc must be "${JSONRPC_VERSION}"`,
        { received: obj.jsonrpc }
      ),
    };
  }

  // Step 4: Check for method (required for request/notification)
  if (typeof obj.method !== 'string') {
    return {
      success: false,
      error: createJsonRpcError(
        JsonRpcErrorCodes.INVALID_REQUEST,
        'Invalid Request: method must be a string'
      ),
    };
  }

  // Step 5: Validate params if present (must be object per MCP spec)
  if (obj.params !== undefined && (typeof obj.params !== 'object' || obj.params === null || Array.isArray(obj.params))) {
    return {
      success: false,
      error: createJsonRpcError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        'Invalid params: must be an object'
      ),
    };
  }

  // Step 6: Distinguish request vs notification by presence of id
  if ('id' in obj) {
    // This is a request
    const id = obj.id;
    if (id !== null && typeof id !== 'string' && (typeof id !== 'number' || !Number.isInteger(id))) {
      return {
        success: false,
        error: createJsonRpcError(
          JsonRpcErrorCodes.INVALID_REQUEST,
          'Invalid Request: id must be string, integer, or null'
        ),
      };
    }

    // Request with null id is technically valid but unusual - treat as request
    const request: JsonRpcRequest = {
      jsonrpc: JSONRPC_VERSION,
      id: id as string | number,
      method: obj.method,
    };
    if (obj.params !== undefined) {
      request.params = obj.params as Record<string, unknown>;
    }
    return { success: true, data: request };
  } else {
    // This is a notification (no id)
    const notification: JsonRpcNotification = {
      jsonrpc: JSONRPC_VERSION,
      method: obj.method,
    };
    if (obj.params !== undefined) {
      notification.params = obj.params as Record<string, unknown>;
    }
    return { success: true, data: notification };
  }
}

/**
 * Parse a JSON string expecting a response
 */
export function parseJsonRpcResponse(input: string): ParseResult<JsonRpcResponse> {
  // Step 1: Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (e) {
    return {
      success: false,
      error: createJsonRpcError(
        JsonRpcErrorCodes.PARSE_ERROR,
        'Parse error: Invalid JSON',
        e instanceof Error ? e.message : String(e)
      ),
    };
  }

  // Step 2: Check if it's an object
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      success: false,
      error: createJsonRpcError(
        JsonRpcErrorCodes.INVALID_REQUEST,
        'Invalid Response: Expected object'
      ),
    };
  }

  const obj = parsed as Record<string, unknown>;

  // Step 3: Check jsonrpc version
  if (obj.jsonrpc !== JSONRPC_VERSION) {
    return {
      success: false,
      error: createJsonRpcError(
        JsonRpcErrorCodes.INVALID_REQUEST,
        `Invalid Response: jsonrpc must be "${JSONRPC_VERSION}"`
      ),
    };
  }

  // Step 4: Check for id (required for response)
  if (!('id' in obj)) {
    return {
      success: false,
      error: createJsonRpcError(
        JsonRpcErrorCodes.INVALID_REQUEST,
        'Invalid Response: id is required'
      ),
    };
  }

  const id = obj.id;
  if (id !== null && typeof id !== 'string' && (typeof id !== 'number' || !Number.isInteger(id))) {
    return {
      success: false,
      error: createJsonRpcError(
        JsonRpcErrorCodes.INVALID_REQUEST,
        'Invalid Response: id must be string, integer, or null'
      ),
    };
  }

  // Step 5: Must have either result or error, but not both
  const hasResult = 'result' in obj;
  const hasError = 'error' in obj;

  if (hasResult && hasError) {
    return {
      success: false,
      error: createJsonRpcError(
        JsonRpcErrorCodes.INVALID_REQUEST,
        'Invalid Response: cannot have both result and error'
      ),
    };
  }

  if (!hasResult && !hasError) {
    return {
      success: false,
      error: createJsonRpcError(
        JsonRpcErrorCodes.INVALID_REQUEST,
        'Invalid Response: must have either result or error'
      ),
    };
  }

  if (hasError) {
    // Validate error object
    const errorResult = JsonRpcErrorSchema.safeParse(obj.error);
    if (!errorResult.success) {
      return {
        success: false,
        error: createJsonRpcError(
          JsonRpcErrorCodes.INVALID_REQUEST,
          'Invalid Response: error object is malformed',
          errorResult.error.format()
        ),
      };
    }

    return {
      success: true,
      data: {
        jsonrpc: JSONRPC_VERSION,
        id: id as JsonRpcId,
        error: errorResult.data,
      },
    };
  }

  // Success response
  return {
    success: true,
    data: {
      jsonrpc: JSONRPC_VERSION,
      id: id as JsonRpcId,
      result: obj.result,
    },
  };
}

// =============================================================================
// Serialization Functions
// =============================================================================

/**
 * Serialize a JSON-RPC response to JSON string
 */
export function serializeJsonRpc(response: JsonRpcResponse): string {
  return JSON.stringify(response);
}

/**
 * Serialize a JSON-RPC request to JSON string
 */
export function serializeRequest(request: JsonRpcRequest): string {
  return JSON.stringify(request);
}

/**
 * Serialize a JSON-RPC notification to JSON string
 */
export function serializeNotification(notification: JsonRpcNotification): string {
  return JSON.stringify(notification);
}

/**
 * Serialize any JSON-RPC message to JSON string
 */
export function serializeMessage(message: JsonRpcMessage): string {
  return JSON.stringify(message);
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a JSON-RPC request object
 */
export function createRequest(
  id: string | number,
  method: string,
  params?: Record<string, unknown>
): JsonRpcRequest {
  const request: JsonRpcRequest = {
    jsonrpc: JSONRPC_VERSION,
    id,
    method,
  };
  if (params !== undefined) {
    request.params = params;
  }
  return request;
}

/**
 * Create a JSON-RPC notification object
 */
export function createNotification(
  method: string,
  params?: Record<string, unknown>
): JsonRpcNotification {
  const notification: JsonRpcNotification = {
    jsonrpc: JSONRPC_VERSION,
    method,
  };
  if (params !== undefined) {
    notification.params = params;
  }
  return notification;
}

/**
 * Create a JSON-RPC success response object
 */
export function createSuccessResponse(
  id: JsonRpcId,
  result: unknown
): JsonRpcSuccessResponse {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    result,
  };
}

/**
 * Create a JSON-RPC error response object
 */
export function createErrorResponse(
  id: JsonRpcId,
  error: JsonRpcError
): JsonRpcErrorResponse {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    error,
  };
}

/**
 * Create a parse error response (used when we can't determine the request id)
 */
export function createParseErrorResponse(data?: unknown): JsonRpcErrorResponse {
  return createErrorResponse(
    null,
    createJsonRpcError(JsonRpcErrorCodes.PARSE_ERROR, 'Parse error', data)
  );
}

/**
 * Create an invalid request error response
 */
export function createInvalidRequestResponse(id: JsonRpcId, data?: unknown): JsonRpcErrorResponse {
  return createErrorResponse(
    id,
    createJsonRpcError(JsonRpcErrorCodes.INVALID_REQUEST, 'Invalid Request', data)
  );
}

/**
 * Create a method not found error response
 */
export function createMethodNotFoundResponse(id: JsonRpcId, method?: string): JsonRpcErrorResponse {
  return createErrorResponse(
    id,
    createJsonRpcError(
      JsonRpcErrorCodes.METHOD_NOT_FOUND,
      'Method not found',
      method ? { method } : undefined
    )
  );
}

/**
 * Create an invalid params error response
 */
export function createInvalidParamsResponse(id: JsonRpcId, data?: unknown): JsonRpcErrorResponse {
  return createErrorResponse(
    id,
    createJsonRpcError(JsonRpcErrorCodes.INVALID_PARAMS, 'Invalid params', data)
  );
}

/**
 * Create an internal error response
 */
export function createInternalErrorResponse(id: JsonRpcId, data?: unknown): JsonRpcErrorResponse {
  return createErrorResponse(
    id,
    createJsonRpcError(JsonRpcErrorCodes.INTERNAL_ERROR, 'Internal error', data)
  );
}
