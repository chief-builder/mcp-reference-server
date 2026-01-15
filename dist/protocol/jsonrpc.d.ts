/**
 * JSON-RPC 2.0 types and parsing
 */
export declare const JSONRPC_VERSION: "2.0";
export type JsonRpcId = string | number | null;
export interface JsonRpcRequest {
    jsonrpc: typeof JSONRPC_VERSION;
    method: string;
    params?: unknown;
    id?: JsonRpcId;
}
export interface JsonRpcResponse {
    jsonrpc: typeof JSONRPC_VERSION;
    result?: unknown;
    error?: JsonRpcError;
    id: JsonRpcId;
}
export interface JsonRpcError {
    code: number;
    message: string;
    data?: unknown;
}
export interface JsonRpcNotification {
    jsonrpc: typeof JSONRPC_VERSION;
    method: string;
    params?: unknown;
}
export declare function parseJsonRpc(_input: string): JsonRpcRequest | JsonRpcNotification;
export declare function serializeJsonRpc(_response: JsonRpcResponse): string;
//# sourceMappingURL=jsonrpc.d.ts.map