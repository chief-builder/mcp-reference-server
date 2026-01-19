/**
 * Tools Hook
 *
 * Provides tool list management using the MCP client:
 * - Fetches available tools from MCP server
 * - Normalizes tool data for UI consumption
 * - Handles loading and error states
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useMCP, type MCPTool } from './useMCP';

// =============================================================================
// Types
// =============================================================================

/** Normalized parameter info for UI display */
export interface ToolParameter {
  name: string;
  type: string;
  description?: string;
  required: boolean;
}

/** Normalized tool info for UI display */
export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
}

export interface UseToolsReturn {
  /** List of available tools */
  tools: Tool[];
  /** Whether tools are being loaded */
  isLoading: boolean;
  /** Last error */
  error: string | null;
  /** Refresh tools list */
  refresh: () => Promise<void>;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract type string from JSON Schema property
 */
function extractType(schema: unknown): string {
  if (!schema || typeof schema !== 'object') {
    return 'unknown';
  }

  const prop = schema as Record<string, unknown>;

  // Handle array of types
  if (Array.isArray(prop.type)) {
    return prop.type.filter((t) => t !== 'null').join(' | ');
  }

  // Handle simple type
  if (typeof prop.type === 'string') {
    return prop.type;
  }

  // Handle enum
  if (Array.isArray(prop.enum)) {
    return prop.enum.map((v) => JSON.stringify(v)).join(' | ');
  }

  return 'unknown';
}

/**
 * Convert MCP tool to normalized Tool format
 */
function normalizeTool(mcpTool: MCPTool): Tool {
  const parameters: ToolParameter[] = [];

  const properties = mcpTool.inputSchema.properties ?? {};
  const required = mcpTool.inputSchema.required ?? [];

  for (const [name, schema] of Object.entries(properties)) {
    const prop = schema as Record<string, unknown>;
    parameters.push({
      name,
      type: extractType(schema),
      description: typeof prop.description === 'string' ? prop.description : undefined,
      required: required.includes(name),
    });
  }

  return {
    name: mcpTool.name,
    description: mcpTool.description ?? 'No description available',
    parameters,
  };
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useTools(): UseToolsReturn {
  const [tools, setTools] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);

  const { initialize, listTools, isInitialized } = useMCP();

  /**
   * Fetch and normalize tools from MCP server
   */
  const fetchTools = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      // Initialize session if not already done
      if (!isInitialized) {
        await initialize();
      }

      // Fetch tools
      const mcpTools = await listTools();

      // Normalize for UI
      const normalizedTools = mcpTools.map(normalizeTool);
      setTools(normalizedTools);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch tools';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [initialize, listTools, isInitialized]);

  // Fetch tools on mount (only once)
  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    fetchTools();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    tools,
    isLoading,
    error,
    refresh: fetchTools,
  };
}
