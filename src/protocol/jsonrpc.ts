/**
 * JSON-RPC 2.0 types and parsing
 */

export const JSONRPC_VERSION = '2.0' as const;

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

export function parseJsonRpc(_input: string): JsonRpcRequest | JsonRpcNotification {
  // TODO: Implement JSON-RPC parsing
  throw new Error('Not implemented');
}

export function serializeJsonRpc(_response: JsonRpcResponse): string {
  // TODO: Implement JSON-RPC serialization
  throw new Error('Not implemented');
}
