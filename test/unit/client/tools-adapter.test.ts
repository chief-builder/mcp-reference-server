/**
 * Tools Adapter Unit Tests
 *
 * Tests for converting MCP tools to Vercel AI SDK format,
 * including JSON Schema to Zod schema conversion.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { z } from 'zod';
import {
  jsonSchemaToZod,
  mcpToolToAiTool,
  convertMcpToolsToAiTools,
  formatToolResult,
} from '../../../src/client/tools-adapter.js';
import type { MCPClient, MCPTool } from '../../../src/client/mcp-client.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockMCPClient(tools: MCPTool[] = []): MCPClient {
  return {
    listTools: vi.fn().mockResolvedValue(tools),
    callTool: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'result' }],
    }),
    connectStdio: vi.fn(),
    connectHttp: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
    complete: vi.fn(),
    setLoggingLevel: vi.fn(),
    getClient: vi.fn(),
  } as unknown as MCPClient;
}

// =============================================================================
// jsonSchemaToZod Tests
// =============================================================================

describe('jsonSchemaToZod', () => {
  describe('string types', () => {
    it('should convert basic string type', () => {
      const schema = jsonSchemaToZod({ type: 'string' });
      expect(schema.parse('hello')).toBe('hello');
      expect(() => schema.parse(123)).toThrow();
    });

    it('should handle minLength constraint', () => {
      const schema = jsonSchemaToZod({ type: 'string', minLength: 3 });
      expect(schema.parse('hello')).toBe('hello');
      expect(() => schema.parse('hi')).toThrow();
    });

    it('should handle maxLength constraint', () => {
      const schema = jsonSchemaToZod({ type: 'string', maxLength: 5 });
      expect(schema.parse('hello')).toBe('hello');
      expect(() => schema.parse('hello world')).toThrow();
    });

    it('should handle pattern constraint', () => {
      const schema = jsonSchemaToZod({ type: 'string', pattern: '^[a-z]+$' });
      expect(schema.parse('hello')).toBe('hello');
      expect(() => schema.parse('Hello123')).toThrow();
    });

    it('should handle enum constraint', () => {
      const schema = jsonSchemaToZod({
        type: 'string',
        enum: ['add', 'subtract', 'multiply', 'divide'],
      });
      expect(schema.parse('add')).toBe('add');
      expect(schema.parse('multiply')).toBe('multiply');
      expect(() => schema.parse('power')).toThrow();
    });

    it('should handle empty enum array as regular string', () => {
      const schema = jsonSchemaToZod({ type: 'string', enum: [] });
      expect(schema.parse('anything')).toBe('anything');
    });
  });

  describe('number types', () => {
    it('should convert number type', () => {
      const schema = jsonSchemaToZod({ type: 'number' });
      expect(schema.parse(42)).toBe(42);
      expect(schema.parse(3.14)).toBe(3.14);
      expect(() => schema.parse('42')).toThrow();
    });

    it('should convert integer type', () => {
      const schema = jsonSchemaToZod({ type: 'integer' });
      expect(schema.parse(42)).toBe(42);
      expect(() => schema.parse(3.14)).toThrow();
    });

    it('should handle minimum constraint', () => {
      const schema = jsonSchemaToZod({ type: 'number', minimum: 0 });
      expect(schema.parse(0)).toBe(0);
      expect(schema.parse(100)).toBe(100);
      expect(() => schema.parse(-1)).toThrow();
    });

    it('should handle maximum constraint', () => {
      const schema = jsonSchemaToZod({ type: 'number', maximum: 100 });
      expect(schema.parse(100)).toBe(100);
      expect(schema.parse(0)).toBe(0);
      expect(() => schema.parse(101)).toThrow();
    });
  });

  describe('boolean type', () => {
    it('should convert boolean type', () => {
      const schema = jsonSchemaToZod({ type: 'boolean' });
      expect(schema.parse(true)).toBe(true);
      expect(schema.parse(false)).toBe(false);
      expect(() => schema.parse('true')).toThrow();
    });
  });

  describe('array types', () => {
    it('should convert array with item type', () => {
      const schema = jsonSchemaToZod({
        type: 'array',
        items: { type: 'string' },
      });
      expect(schema.parse(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
      expect(() => schema.parse([1, 2, 3])).toThrow();
    });

    it('should convert array without item type', () => {
      const schema = jsonSchemaToZod({ type: 'array' });
      expect(schema.parse([1, 'two', true])).toEqual([1, 'two', true]);
    });

    it('should handle minItems constraint', () => {
      const schema = jsonSchemaToZod({
        type: 'array',
        items: { type: 'number' },
        minItems: 2,
      });
      expect(schema.parse([1, 2])).toEqual([1, 2]);
      expect(() => schema.parse([1])).toThrow();
    });

    it('should handle maxItems constraint', () => {
      const schema = jsonSchemaToZod({
        type: 'array',
        items: { type: 'number' },
        maxItems: 3,
      });
      expect(schema.parse([1, 2, 3])).toEqual([1, 2, 3]);
      expect(() => schema.parse([1, 2, 3, 4])).toThrow();
    });
  });

  describe('object types', () => {
    it('should convert object with properties', () => {
      const schema = jsonSchemaToZod({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      });

      expect(schema.parse({ name: 'Alice', age: 30 })).toEqual({
        name: 'Alice',
        age: 30,
      });
      expect(schema.parse({ name: 'Bob' })).toEqual({ name: 'Bob' });
      expect(() => schema.parse({ age: 30 })).toThrow(); // missing required name
    });

    it('should convert object without properties', () => {
      const schema = jsonSchemaToZod({ type: 'object' });
      expect(schema.parse({ any: 'thing' })).toEqual({ any: 'thing' });
    });

    it('should handle nested objects', () => {
      const schema = jsonSchemaToZod({
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            required: ['name'],
          },
        },
        required: ['user'],
      });

      expect(schema.parse({ user: { name: 'Alice' } })).toEqual({
        user: { name: 'Alice' },
      });
    });

    it('should make non-required properties optional', () => {
      const schema = jsonSchemaToZod({
        type: 'object',
        properties: {
          required: { type: 'string' },
          optional: { type: 'string' },
        },
        required: ['required'],
      });

      expect(schema.parse({ required: 'value' })).toEqual({ required: 'value' });
      expect(schema.parse({ required: 'value', optional: 'opt' })).toEqual({
        required: 'value',
        optional: 'opt',
      });
    });
  });

  describe('null type', () => {
    it('should convert null type', () => {
      const schema = jsonSchemaToZod({ type: 'null' });
      expect(schema.parse(null)).toBe(null);
      expect(() => schema.parse(undefined)).toThrow();
      expect(() => schema.parse('')).toThrow();
    });
  });

  describe('edge cases', () => {
    it('should return unknown for missing type', () => {
      const schema = jsonSchemaToZod({});
      expect(schema.parse('anything')).toBe('anything');
      expect(schema.parse(123)).toBe(123);
      expect(schema.parse({ nested: true })).toEqual({ nested: true });
    });

    it('should return unknown for unrecognized type', () => {
      const schema = jsonSchemaToZod({ type: 'custom' });
      expect(schema.parse('anything')).toBe('anything');
    });
  });
});

// =============================================================================
// mcpToolToAiTool Tests
// =============================================================================

describe('mcpToolToAiTool', () => {
  let mockClient: MCPClient;

  beforeEach(() => {
    mockClient = createMockMCPClient();
  });

  it('should convert an MCP tool to AI SDK format', () => {
    const mcpTool: MCPTool = {
      name: 'calculate',
      description: 'Perform arithmetic operations',
      inputSchema: {
        type: 'object',
        properties: {
          operation: { type: 'string', enum: ['add', 'subtract'] },
          a: { type: 'number' },
          b: { type: 'number' },
        },
        required: ['operation', 'a', 'b'],
      },
    };

    const aiTool = mcpToolToAiTool(mcpTool, mockClient);

    expect(aiTool).toHaveProperty('description', 'Perform arithmetic operations');
    expect(aiTool).toHaveProperty('parameters');
    expect(aiTool).toHaveProperty('execute');
  });

  it('should use tool name as fallback description', () => {
    const mcpTool: MCPTool = {
      name: 'my_tool',
      inputSchema: { type: 'object' },
    };

    const aiTool = mcpToolToAiTool(mcpTool, mockClient);

    expect(aiTool.description).toBe('Tool: my_tool');
  });

  it('should execute tool via MCP client', async () => {
    const mcpTool: MCPTool = {
      name: 'calculate',
      description: 'Calculate',
      inputSchema: {
        type: 'object',
        properties: { a: { type: 'number' }, b: { type: 'number' } },
      },
    };

    (mockClient.callTool as Mock).mockResolvedValue({
      content: [{ type: 'text', text: '8' }],
    });

    const aiTool = mcpToolToAiTool(mcpTool, mockClient);
    const result = await aiTool.execute!({ a: 5, b: 3 }, {
      toolCallId: 'test',
      messages: [],
      abortSignal: undefined as unknown as AbortSignal,
    });

    expect(mockClient.callTool).toHaveBeenCalledWith('calculate', { a: 5, b: 3 });
    expect(result).toBe('8');
  });

  it('should handle tool execution error', async () => {
    const mcpTool: MCPTool = {
      name: 'failing_tool',
      description: 'A tool that fails',
      inputSchema: { type: 'object' },
    };

    (mockClient.callTool as Mock).mockResolvedValue({
      content: [{ type: 'text', text: 'Division by zero' }],
      isError: true,
    });

    const aiTool = mcpToolToAiTool(mcpTool, mockClient);
    const result = await aiTool.execute!({}, {
      toolCallId: 'test',
      messages: [],
      abortSignal: undefined as unknown as AbortSignal,
    });

    expect(result).toBe('Error: Division by zero');
  });

  it('should handle tool result with no text content', async () => {
    const mcpTool: MCPTool = {
      name: 'image_tool',
      description: 'Returns an image',
      inputSchema: { type: 'object' },
    };

    (mockClient.callTool as Mock).mockResolvedValue({
      content: [{ type: 'image', data: 'base64...' }],
    });

    const aiTool = mcpToolToAiTool(mcpTool, mockClient);
    const result = await aiTool.execute!({}, {
      toolCallId: 'test',
      messages: [],
      abortSignal: undefined as unknown as AbortSignal,
    });

    // Should JSON stringify the content when no text
    expect(result).toBe('[{"type":"image","data":"base64..."}]');
  });

  it('should concatenate multiple text contents', async () => {
    const mcpTool: MCPTool = {
      name: 'multi_text',
      description: 'Returns multiple text',
      inputSchema: { type: 'object' },
    };

    (mockClient.callTool as Mock).mockResolvedValue({
      content: [
        { type: 'text', text: 'Line 1' },
        { type: 'text', text: 'Line 2' },
      ],
    });

    const aiTool = mcpToolToAiTool(mcpTool, mockClient);
    const result = await aiTool.execute!({}, {
      toolCallId: 'test',
      messages: [],
      abortSignal: undefined as unknown as AbortSignal,
    });

    expect(result).toBe('Line 1\nLine 2');
  });

  it('should handle error with no text content', async () => {
    const mcpTool: MCPTool = {
      name: 'error_tool',
      description: 'Error tool',
      inputSchema: { type: 'object' },
    };

    (mockClient.callTool as Mock).mockResolvedValue({
      content: [],
      isError: true,
    });

    const aiTool = mcpToolToAiTool(mcpTool, mockClient);
    const result = await aiTool.execute!({}, {
      toolCallId: 'test',
      messages: [],
      abortSignal: undefined as unknown as AbortSignal,
    });

    expect(result).toBe('Error: Unknown error');
  });
});

// =============================================================================
// convertMcpToolsToAiTools Tests
// =============================================================================

describe('convertMcpToolsToAiTools', () => {
  it('should convert all MCP tools to AI tools', async () => {
    const tools: MCPTool[] = [
      {
        name: 'tool1',
        description: 'First tool',
        inputSchema: { type: 'object' },
      },
      {
        name: 'tool2',
        description: 'Second tool',
        inputSchema: { type: 'object' },
      },
    ];
    const mockClient = createMockMCPClient(tools);

    const aiTools = await convertMcpToolsToAiTools(mockClient);

    expect(Object.keys(aiTools)).toEqual(['tool1', 'tool2']);
    expect(aiTools.tool1.description).toBe('First tool');
    expect(aiTools.tool2.description).toBe('Second tool');
  });

  it('should return empty object for no tools', async () => {
    const mockClient = createMockMCPClient([]);

    const aiTools = await convertMcpToolsToAiTools(mockClient);

    expect(aiTools).toEqual({});
  });

  it('should call listTools on the client', async () => {
    const mockClient = createMockMCPClient([]);

    await convertMcpToolsToAiTools(mockClient);

    expect(mockClient.listTools).toHaveBeenCalled();
  });
});

// =============================================================================
// formatToolResult Tests
// =============================================================================

describe('formatToolResult', () => {
  it('should return string as-is', () => {
    expect(formatToolResult('hello')).toBe('hello');
  });

  it('should stringify objects', () => {
    expect(formatToolResult({ key: 'value' })).toBe('{\n  "key": "value"\n}');
  });

  it('should stringify arrays', () => {
    expect(formatToolResult([1, 2, 3])).toBe('[\n  1,\n  2,\n  3\n]');
  });

  it('should stringify numbers', () => {
    expect(formatToolResult(42)).toBe('42');
  });

  it('should stringify null', () => {
    expect(formatToolResult(null)).toBe('null');
  });

  it('should stringify nested objects', () => {
    const result = formatToolResult({ user: { name: 'Alice', age: 30 } });
    expect(result).toContain('"user"');
    expect(result).toContain('"name"');
    expect(result).toContain('"Alice"');
  });
});
