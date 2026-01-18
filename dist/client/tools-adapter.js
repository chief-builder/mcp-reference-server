/**
 * Tools Adapter
 *
 * Converts MCP tools to Vercel AI SDK tool format.
 * Handles JSON Schema to Zod conversion for parameter validation.
 */
import { tool } from 'ai';
import { z } from 'zod';
/**
 * Convert a JSON Schema to Zod schema
 * Supports basic types and nested objects
 */
export function jsonSchemaToZod(schema) {
    const type = schema.type;
    if (!type) {
        // If no type specified, allow any
        return z.unknown();
    }
    switch (type) {
        case 'string': {
            let zodSchema = z.string();
            if (schema.minLength !== undefined) {
                zodSchema = zodSchema.min(schema.minLength);
            }
            if (schema.maxLength !== undefined) {
                zodSchema = zodSchema.max(schema.maxLength);
            }
            if (schema.pattern !== undefined) {
                zodSchema = zodSchema.regex(new RegExp(schema.pattern));
            }
            if (schema.enum !== undefined) {
                const values = schema.enum;
                if (values.length > 0) {
                    return z.enum(values);
                }
            }
            return zodSchema;
        }
        case 'number':
        case 'integer': {
            let zodSchema = type === 'integer' ? z.number().int() : z.number();
            if (schema.minimum !== undefined) {
                zodSchema = zodSchema.min(schema.minimum);
            }
            if (schema.maximum !== undefined) {
                zodSchema = zodSchema.max(schema.maximum);
            }
            return zodSchema;
        }
        case 'boolean':
            return z.boolean();
        case 'array': {
            const items = schema.items;
            const itemSchema = items ? jsonSchemaToZod(items) : z.unknown();
            let arraySchema = z.array(itemSchema);
            if (schema.minItems !== undefined) {
                arraySchema = arraySchema.min(schema.minItems);
            }
            if (schema.maxItems !== undefined) {
                arraySchema = arraySchema.max(schema.maxItems);
            }
            return arraySchema;
        }
        case 'object': {
            const properties = schema.properties;
            const required = schema.required;
            if (!properties) {
                return z.object({}).passthrough();
            }
            const shape = {};
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
export function mcpToolToAiTool(mcpTool, mcpClient) {
    const parameters = jsonSchemaToZod(mcpTool.inputSchema);
    return tool({
        description: mcpTool.description || `Tool: ${mcpTool.name}`,
        parameters: parameters,
        execute: async (args) => {
            const result = await mcpClient.callTool(mcpTool.name, args);
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
export async function convertMcpToolsToAiTools(mcpClient) {
    const mcpTools = await mcpClient.listTools();
    const aiTools = {};
    for (const mcpTool of mcpTools) {
        aiTools[mcpTool.name] = mcpToolToAiTool(mcpTool, mcpClient);
    }
    return aiTools;
}
/**
 * Format tool result for display
 */
export function formatToolResult(result) {
    if (typeof result === 'string') {
        return result;
    }
    return JSON.stringify(result, null, 2);
}
//# sourceMappingURL=tools-adapter.js.map