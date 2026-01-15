/**
 * Standard JSON-RPC and MCP error codes
 */
// JSON-RPC 2.0 standard error codes
export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;
// JSON-RPC 2.0 reserved range: -32000 to -32099
export const SERVER_ERROR_START = -32000;
export const SERVER_ERROR_END = -32099;
// MCP-specific error codes
export const REQUEST_CANCELLED = -32800;
export const CONTENT_TOO_LARGE = -32801;
export class McpError extends Error {
    code;
    data;
    constructor(code, message, data) {
        super(message);
        this.code = code;
        this.data = data;
        this.name = 'McpError';
    }
}
export function createParseError(data) {
    return new McpError(PARSE_ERROR, 'Parse error', data);
}
export function createInvalidRequest(data) {
    return new McpError(INVALID_REQUEST, 'Invalid Request', data);
}
export function createMethodNotFound(method) {
    return new McpError(METHOD_NOT_FOUND, `Method not found: ${method}`);
}
export function createInvalidParams(data) {
    return new McpError(INVALID_PARAMS, 'Invalid params', data);
}
export function createInternalError(data) {
    return new McpError(INTERNAL_ERROR, 'Internal error', data);
}
//# sourceMappingURL=errors.js.map