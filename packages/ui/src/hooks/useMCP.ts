/**
 * MCP Client Hook
 *
 * Provides MCP protocol client functionality:
 * - Initialize MCP session with protocol version header
 * - Store and reuse mcp-session-id from initialize response
 * - List available tools via tools/list method
 */

import { useState, useCallback, useRef } from 'react';
import { getToken } from '@/lib/auth';

// =============================================================================
// Constants
// =============================================================================

const MCP_ENDPOINT = '/mcp';
const MCP_PROTOCOL_VERSION = '2025-11-25';

// =============================================================================
// Types
// =============================================================================

/** JSON-RPC 2.0 request */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

/** JSON-RPC 2.0 response */
interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/** MCP Tool definition */
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

/** MCP tools/list response */
interface ToolsListResult {
  tools: MCPTool[];
  nextCursor?: string;
}

/** MCP initialize result */
interface InitializeResult {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  serverInfo: {
    name: string;
    version: string;
  };
}

export interface UseMCPReturn {
  /** Initialize MCP session */
  initialize: () => Promise<InitializeResult>;
  /** List available tools */
  listTools: () => Promise<MCPTool[]>;
  /** Current session ID */
  sessionId: string | null;
  /** Whether initialization is in progress */
  isInitializing: boolean;
  /** Last error */
  error: string | null;
  /** Whether session is initialized */
  isInitialized: boolean;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useMCP(): UseMCPReturn {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const requestIdRef = useRef(0);

  /**
   * Make a JSON-RPC request to the MCP endpoint
   */
  const rpcRequest = useCallback(
    async <T>(method: string, params?: Record<string, unknown>): Promise<T> => {
      requestIdRef.current += 1;

      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: requestIdRef.current,
        method,
        ...(params && { params }),
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'mcp-protocol-version': MCP_PROTOCOL_VERSION,
      };

      // Add auth header if available
      const token = getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Add session ID if we have one
      if (sessionId) {
        headers['mcp-session-id'] = sessionId;
      }

      const response = await fetch(MCP_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });

      // Extract and store session ID from response header
      const newSessionId = response.headers.get('mcp-session-id');
      if (newSessionId && newSessionId !== sessionId) {
        setSessionId(newSessionId);
      }

      if (!response.ok) {
        throw new Error(`MCP request failed: ${response.status} ${response.statusText}`);
      }

      const result: JsonRpcResponse<T> = await response.json();

      if (result.error) {
        throw new Error(result.error.message || 'MCP request failed');
      }

      return result.result as T;
    },
    [sessionId]
  );

  /**
   * Send a JSON-RPC notification (no response expected)
   */
  const rpcNotification = useCallback(
    async (method: string, params?: Record<string, unknown>): Promise<void> => {
      const notification = {
        jsonrpc: '2.0' as const,
        method,
        ...(params && { params }),
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'mcp-protocol-version': MCP_PROTOCOL_VERSION,
      };

      const token = getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      if (sessionId) {
        headers['mcp-session-id'] = sessionId;
      }

      // Fire and forget - notifications don't expect responses
      await fetch(MCP_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(notification),
      });
    },
    [sessionId]
  );

  /**
   * Initialize MCP session
   */
  const initialize = useCallback(async (): Promise<InitializeResult> => {
    setIsInitializing(true);
    setError(null);

    try {
      const result = await rpcRequest<InitializeResult>('initialize', {
        protocolVersion: MCP_PROTOCOL_VERSION,
        clientInfo: {
          name: 'agent-ui',
          version: '1.0.0',
        },
        capabilities: {},
      });

      // Send notifications/initialized to complete the handshake
      // This transitions the server from 'initializing' to 'ready' state
      await rpcNotification('notifications/initialized');

      setIsInitialized(true);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize MCP session';
      setError(message);
      throw err;
    } finally {
      setIsInitializing(false);
    }
  }, [rpcRequest, rpcNotification]);

  /**
   * List available tools
   */
  const listTools = useCallback(async (): Promise<MCPTool[]> => {
    setError(null);

    try {
      const result = await rpcRequest<ToolsListResult>('tools/list');
      return result.tools;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list tools';
      setError(message);
      throw err;
    }
  }, [rpcRequest]);

  return {
    initialize,
    listTools,
    sessionId,
    isInitializing,
    error,
    isInitialized,
  };
}
