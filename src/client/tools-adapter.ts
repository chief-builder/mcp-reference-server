/**
 * Tools Adapter
 *
 * Converts MCP tools to Vercel AI SDK tool format.
 * Handles JSON Schema to Zod conversion for parameter validation.
 */

import { tool, type CoreTool } from 'ai';
import { z } from 'zod';
import type { MCPClient, MCPTool } from './mcp-client.js';

/**
 * Convert a JSON Schema to Zod schema
 * Supports basic types and nested objects
 */
export function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType {
  const type = schema.type as string | undefined;

  if (!type) {
    // If no type specified, allow any
    return z.unknown();
  }

  switch (type) {
    case 'string': {
      let zodSchema = z.string();
      if (schema.minLength !== undefined) {
        zodSchema = zodSchema.min(schema.minLength as number);
      }
      if (schema.maxLength !== undefined) {
        zodSchema = zodSchema.max(schema.maxLength as number);
      }
      if (schema.pattern !== undefined) {
        zodSchema = zodSchema.regex(new RegExp(schema.pattern as string));
      }
      if (schema.enum !== undefined) {
        const values = schema.enum as string[];
        if (values.length > 0) {
          return z.enum(values as [string, ...string[]]);
        }
      }
      return zodSchema;
    }

    case 'number':
    case 'integer': {
      let zodSchema = type === 'integer' ? z.number().int() : z.number();
      if (schema.minimum !== undefined) {
        zodSchema = zodSchema.min(schema.minimum as number);
      }
      if (schema.maximum !== undefined) {
        zodSchema = zodSchema.max(schema.maximum as number);
      }
      return zodSchema;
    }

    case 'boolean':
      return z.boolean();

    case 'array': {
      const items = schema.items as Record<string, unknown> | undefined;
      const itemSchema = items ? jsonSchemaToZod(items) : z.unknown();
      let arraySchema = z.array(itemSchema);
      if (schema.minItems !== undefined) {
        arraySchema = arraySchema.min(schema.minItems as number);
      }
      if (schema.maxItems !== undefined) {
        arraySchema = arraySchema.max(schema.maxItems as number);
      }
      return arraySchema;
    }

    case 'object': {
      const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
      const required = schema.required as string[] | undefined;

      if (!properties) {
        return z.object({}).passthrough();
      }

      const shape: Record<string, z.ZodType> = {};
      for (const [key, propSchema] of Object.entries(properties)) {
        let zodProp = jsonSchemaToZod(propSchema);
        if (!required?.includes(key)) {
          zodProp = zodProp.optional();
        }
        shape[key] = zodProp;
      }

      return z.object(shape);
    }

    case 'null':
      return z.null();

    default:
      return z.unknown();
  }
}

/**
 * Convert an MCP tool to AI SDK tool format
 */
export function mcpToolToAiTool(
  mcpTool: MCPTool,
  mcpClient: MCPClient
): CoreTool {
  const parameters = jsonSchemaToZod(mcpTool.inputSchema);

  return tool({
    description: mcpTool.description || `Tool: ${mcpTool.name}`,
    parameters: parameters as z.ZodObject<Record<string, z.ZodType>>,
    execute: async (args) => {
      const result = await mcpClient.callTool(mcpTool.name, args as Record<string, unknown>);

      // Extract text content from the result
      const textContents = result.content
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text)
        .join('\n');

      if (result.isError) {
        return `Error: ${textContents || 'Unknown error'}`;
      }

      return textContents || JSON.stringify(result.content);
    },
  });
}

/**
 * Convert all MCP tools to AI SDK tools
 */
export async function convertMcpToolsToAiTools(
  mcpClient: MCPClient
): Promise<Record<string, CoreTool>> {
  const mcpTools = await mcpClient.listTools();
  const aiTools: Record<string, CoreTool> = {};

  for (const mcpTool of mcpTools) {
    aiTools[mcpTool.name] = mcpToolToAiTool(mcpTool, mcpClient);
  }

  return aiTools;
}

/**
 * Format tool result for display
 */
export function formatToolResult(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }
  return JSON.stringify(result, null, 2);
}
