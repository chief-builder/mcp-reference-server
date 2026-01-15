/**
 * Standard JSON-RPC and MCP error codes
 */
export declare const PARSE_ERROR = -32700;
export declare const INVALID_REQUEST = -32600;
export declare const METHOD_NOT_FOUND = -32601;
export declare const INVALID_PARAMS = -32602;
export declare const INTERNAL_ERROR = -32603;
export declare const SERVER_ERROR_START = -32000;
export declare const SERVER_ERROR_END = -32099;
export declare const REQUEST_CANCELLED = -32800;
export declare const CONTENT_TOO_LARGE = -32801;
export declare class McpError extends Error {
    readonly code: number;
    readonly data?: unknown | undefined;
    constructor(code: number, message: string, data?: unknown | undefined);
}
export declare function createParseError(data?: unknown): McpError;
export declare function createInvalidRequest(data?: unknown): McpError;
export declare function createMethodNotFound(method: string): McpError;
export declare function createInvalidParams(data?: unknown): McpError;
export declare function createInternalError(data?: unknown): McpError;
//# sourceMappingURL=errors.d.ts.map