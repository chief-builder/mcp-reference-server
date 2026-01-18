/**
 * Tools Adapter
 *
 * Converts MCP tools to Vercel AI SDK tool format.
 * Handles JSON Schema to Zod conversion for parameter validation.
 */
import { type CoreTool } from 'ai';
import { z } from 'zod';
import type { MCPClient, MCPTool } from './mcp-client.js';
/**
 * Convert a JSON Schema to Zod schema
 * Supports basic types and nested objects
 */
export declare function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType;
/**
 * Convert an MCP tool to AI SDK tool format
 */
export declare function mcpToolToAiTool(mcpTool: MCPTool, mcpClient: MCPClient): CoreTool;
/**
 * Convert all MCP tools to AI SDK tools
 */
export declare function convertMcpToolsToAiTools(mcpClient: MCPClient): Promise<Record<string, CoreTool>>;
/**
 * Format tool result for display
 */
export declare function formatToolResult(result: unknown): string;
//# sourceMappingURL=tools-adapter.d.ts.map