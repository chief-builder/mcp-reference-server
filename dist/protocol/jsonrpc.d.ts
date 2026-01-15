/**
 * JSON-RPC 2.0 types and parsing
 *
 * Implements the JSON-RPC 2.0 specification for MCP protocol messages.
 * See: https://www.jsonrpc.org/specification
 */
import { z } from 'zod';
export declare const JSONRPC_VERSION: "2.0";
/**
 * Standard JSON-RPC 2.0 error codes
 */
export declare const JsonRpcErrorCodes: {
    readonly PARSE_ERROR: -32700;
    readonly INVALID_REQUEST: -32600;
    readonly METHOD_NOT_FOUND: -32601;
    readonly INVALID_PARAMS: -32602;
    readonly INTERNAL_ERROR: -32603;
    readonly SERVER_ERROR_START: -32099;
    readonly SERVER_ERROR_END: -32000;
};
/**
 * JSON-RPC message ID - can be string, number, or null
 * Per spec: IDs SHOULD NOT contain fractional parts
 */
export declare const JsonRpcIdSchema: z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodNull]>;
/**
 * JSON-RPC error object schema
 */
export declare const JsonRpcErrorSchema: z.ZodObject<{
    code: z.ZodNumber;
    message: z.ZodString;
    data: z.ZodOptional<z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    code: number;
    message: string;
    data?: unknown;
}, {
    code: number;
    message: string;
    data?: unknown;
}>;
/**
 * JSON-RPC Request schema
 * A request MUST have an id field (distinguishes from notification)
 */
export declare const JsonRpcRequestSchema: z.ZodObject<{
    jsonrpc: z.ZodLiteral<"2.0">;
} & {
    id: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    method: z.ZodString;
    params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    jsonrpc: "2.0";
    id: string | number;
    method: string;
    params?: Record<string, unknown> | undefined;
}, {
    jsonrpc: "2.0";
    id: string | number;
    method: string;
    params?: Record<string, unknown> | undefined;
}>;
/**
 * JSON-RPC Notification schema
 * A notification MUST NOT have an id field
 */
export declare const JsonRpcNotificationSchema: z.ZodObject<{
    jsonrpc: z.ZodLiteral<"2.0">;
} & {
    method: z.ZodString;
    params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strict", z.ZodTypeAny, {
    jsonrpc: "2.0";
    method: string;
    params?: Record<string, unknown> | undefined;
}, {
    jsonrpc: "2.0";
    method: string;
    params?: Record<string, unknown> | undefined;
}>;
/**
 * JSON-RPC Success Response schema
 */
export declare const JsonRpcSuccessResponseSchema: z.ZodObject<{
    jsonrpc: z.ZodLiteral<"2.0">;
} & {
    id: z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodNull]>;
    result: z.ZodUnknown;
}, "strip", z.ZodTypeAny, {
    jsonrpc: "2.0";
    id: string | number | null;
    result?: unknown;
}, {
    jsonrpc: "2.0";
    id: string | number | null;
    result?: unknown;
}>;
/**
 * JSON-RPC Error Response schema
 */
export declare const JsonRpcErrorResponseSchema: z.ZodObject<{
    jsonrpc: z.ZodLiteral<"2.0">;
} & {
    id: z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodNull]>;
    error: z.ZodObject<{
        code: z.ZodNumber;
        message: z.ZodString;
        data: z.ZodOptional<z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        code: number;
        message: string;
        data?: unknown;
    }, {
        code: number;
        message: string;
        data?: unknown;
    }>;
}, "strip", z.ZodTypeAny, {
    error: {
        code: number;
        message: string;
        data?: unknown;
    };
    jsonrpc: "2.0";
    id: string | number | null;
}, {
    error: {
        code: number;
        message: string;
        data?: unknown;
    };
    jsonrpc: "2.0";
    id: string | number | null;
}>;
/**
 * JSON-RPC Response schema (either success or error)
 */
export declare const JsonRpcResponseSchema: z.ZodUnion<[z.ZodObject<{
    jsonrpc: z.ZodLiteral<"2.0">;
} & {
    id: z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodNull]>;
    result: z.ZodUnknown;
}, "strip", z.ZodTypeAny, {
    jsonrpc: "2.0";
    id: string | number | null;
    result?: unknown;
}, {
    jsonrpc: "2.0";
    id: string | number | null;
    result?: unknown;
}>, z.ZodObject<{
    jsonrpc: z.ZodLiteral<"2.0">;
} & {
    id: z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodNull]>;
    error: z.ZodObject<{
        code: z.ZodNumber;
        message: z.ZodString;
        data: z.ZodOptional<z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        code: number;
        message: string;
        data?: unknown;
    }, {
        code: number;
        message: string;
        data?: unknown;
    }>;
}, "strip", z.ZodTypeAny, {
    error: {
        code: number;
        message: string;
        data?: unknown;
    };
    jsonrpc: "2.0";
    id: string | number | null;
}, {
    error: {
        code: number;
        message: string;
        data?: unknown;
    };
    jsonrpc: "2.0";
    id: string | number | null;
}>]>;
/**
 * Any JSON-RPC message (request, notification, or response)
 */
export declare const JsonRpcMessageSchema: z.ZodUnion<[z.ZodObject<{
    jsonrpc: z.ZodLiteral<"2.0">;
} & {
    id: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    method: z.ZodString;
    params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    jsonrpc: "2.0";
    id: string | number;
    method: string;
    params?: Record<string, unknown> | undefined;
}, {
    jsonrpc: "2.0";
    id: string | number;
    method: string;
    params?: Record<string, unknown> | undefined;
}>, z.ZodObject<{
    jsonrpc: z.ZodLiteral<"2.0">;
} & {
    method: z.ZodString;
    params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strict", z.ZodTypeAny, {
    jsonrpc: "2.0";
    method: string;
    params?: Record<string, unknown> | undefined;
}, {
    jsonrpc: "2.0";
    method: string;
    params?: Record<string, unknown> | undefined;
}>, z.ZodUnion<[z.ZodObject<{
    jsonrpc: z.ZodLiteral<"2.0">;
} & {
    id: z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodNull]>;
    result: z.ZodUnknown;
}, "strip", z.ZodTypeAny, {
    jsonrpc: "2.0";
    id: string | number | null;
    result?: unknown;
}, {
    jsonrpc: "2.0";
    id: string | number | null;
    result?: unknown;
}>, z.ZodObject<{
    jsonrpc: z.ZodLiteral<"2.0">;
} & {
    id: z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodNull]>;
    error: z.ZodObject<{
        code: z.ZodNumber;
        message: z.ZodString;
        data: z.ZodOptional<z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        code: number;
        message: string;
        data?: unknown;
    }, {
        code: number;
        message: string;
        data?: unknown;
    }>;
}, "strip", z.ZodTypeAny, {
    error: {
        code: number;
        message: string;
        data?: unknown;
    };
    jsonrpc: "2.0";
    id: string | number | null;
}, {
    error: {
        code: number;
        message: string;
        data?: unknown;
    };
    jsonrpc: "2.0";
    id: string | number | null;
}>]>]>;
export type JsonRpcId = z.infer<typeof JsonRpcIdSchema>;
export type JsonRpcError = z.infer<typeof JsonRpcErrorSchema>;
export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>;
export type JsonRpcNotification = z.infer<typeof JsonRpcNotificationSchema>;
export type JsonRpcSuccessResponse = z.infer<typeof JsonRpcSuccessResponseSchema>;
export type JsonRpcErrorResponse = z.infer<typeof JsonRpcErrorResponseSchema>;
export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>;
export type JsonRpcMessage = z.infer<typeof JsonRpcMessageSchema>;
/**
 * Check if a message is a request (has id field)
 */
export declare function isRequest(message: JsonRpcMessage): message is JsonRpcRequest;
/**
 * Check if a message is a notification (has method but no id)
 */
export declare function isNotification(message: JsonRpcMessage): message is JsonRpcNotification;
/**
 * Check if a message is a response (has result or error, no method)
 */
export declare function isResponse(message: JsonRpcMessage): message is JsonRpcResponse;
/**
 * Check if a response is a success response
 */
export declare function isSuccessResponse(response: JsonRpcResponse): response is JsonRpcSuccessResponse;
/**
 * Check if a response is an error response
 */
export declare function isErrorResponse(response: JsonRpcResponse): response is JsonRpcErrorResponse;
/**
 * Creates a unique ID generator for JSON-RPC messages within a session
 */
export declare function createIdGenerator(prefix?: string): () => string;
/**
 * Creates a numeric ID generator for JSON-RPC messages
 */
export declare function createNumericIdGenerator(): () => number;
export type ParseSuccess<T> = {
    success: true;
    data: T;
};
export type ParseFailure = {
    success: false;
    error: JsonRpcError;
};
export type ParseResult<T> = ParseSuccess<T> | ParseFailure;
/**
 * Create a JSON-RPC error object
 */
export declare function createJsonRpcError(code: number, message: string, data?: unknown): JsonRpcError;
/**
 * Parse a JSON string into a JSON-RPC message
 */
export declare function parseJsonRpc(input: string): ParseResult<JsonRpcRequest | JsonRpcNotification>;
/**
 * Parse a JSON string expecting a response
 */
export declare function parseJsonRpcResponse(input: string): ParseResult<JsonRpcResponse>;
/**
 * Serialize a JSON-RPC response to JSON string
 */
export declare function serializeJsonRpc(response: JsonRpcResponse): string;
/**
 * Serialize a JSON-RPC request to JSON string
 */
export declare function serializeRequest(request: JsonRpcRequest): string;
/**
 * Serialize a JSON-RPC notification to JSON string
 */
export declare function serializeNotification(notification: JsonRpcNotification): string;
/**
 * Serialize any JSON-RPC message to JSON string
 */
export declare function serializeMessage(message: JsonRpcMessage): string;
/**
 * Create a JSON-RPC request object
 */
export declare function createRequest(id: string | number, method: string, params?: Record<string, unknown>): JsonRpcRequest;
/**
 * Create a JSON-RPC notification object
 */
export declare function createNotification(method: string, params?: Record<string, unknown>): JsonRpcNotification;
/**
 * Create a JSON-RPC success response object
 */
export declare function createSuccessResponse(id: JsonRpcId, result: unknown): JsonRpcSuccessResponse;
/**
 * Create a JSON-RPC error response object
 */
export declare function createErrorResponse(id: JsonRpcId, error: JsonRpcError): JsonRpcErrorResponse;
/**
 * Create a parse error response (used when we can't determine the request id)
 */
export declare function createParseErrorResponse(data?: unknown): JsonRpcErrorResponse;
/**
 * Create an invalid request error response
 */
export declare function createInvalidRequestResponse(id: JsonRpcId, data?: unknown): JsonRpcErrorResponse;
/**
 * Create a method not found error response
 */
export declare function createMethodNotFoundResponse(id: JsonRpcId, method?: string): JsonRpcErrorResponse;
/**
 * Create an invalid params error response
 */
export declare function createInvalidParamsResponse(id: JsonRpcId, data?: unknown): JsonRpcErrorResponse;
/**
 * Create an internal error response
 */
export declare function createInternalErrorResponse(id: JsonRpcId, data?: unknown): JsonRpcErrorResponse;
//# sourceMappingURL=jsonrpc.d.ts.map