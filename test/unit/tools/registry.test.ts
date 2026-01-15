import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ToolRegistry,
  Tool,
  ToolNamePattern,
  ToolNameSchema,
  JsonSchema,
  PaginatedToolList,
  ToolDefinitionExternal,
  zodToJsonSchema,
  createTextContent,
  createImageContent,
  createAudioContent,
  createResourceContent,
} from '../../../src/tools/registry.js';
import {
  ToolExecutor,
  ToolsListParamsSchema,
  ToolsCallParamsSchema,
  validateJsonSchema,
  handleToolsList,
  handleToolsCall,
  createToolsListChangedNotification,
} from '../../../src/tools/executor.js';
import { createToolErrorResult, createToolSuccessResult } from '../../../src/protocol/errors.js';
import { z } from 'zod';

// =============================================================================
// Test Fixtures
// =============================================================================

function createSimpleTool(name: string, description = 'A test tool'): Tool {
  return {
    name,
    description,
    inputSchema: {
      type: 'object',
      properties: {
        value: { type: 'string' },
      },
    },
    handler: async (args) => ({
      content: [{ type: 'text', text: `Executed ${name}` }],
    }),
  };
}

function createCalculatorTool(): Tool {
  return {
    name: 'calculator',
    title: 'Calculator Tool',
    description: 'Performs basic arithmetic operations',
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'] },
        a: { type: 'number' },
        b: { type: 'number' },
      },
      required: ['operation', 'a', 'b'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
    handler: async (args) => {
      const { operation, a, b } = args as { operation: string; a: number; b: number };
      let result: number;
      switch (operation) {
        case 'add': result = a + b; break;
        case 'subtract': result = a - b; break;
        case 'multiply': result = a * b; break;
        case 'divide':
          if (b === 0) {
            return {
              content: [{ type: 'text', text: 'Division by zero error' }],
              isError: true,
            };
          }
          result = a / b;
          break;
        default:
          return {
            content: [{ type: 'text', text: `Unknown operation: ${operation}` }],
            isError: true,
          };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ result, expression: `${a} ${operation} ${b} = ${result}` }) }],
      };
    },
  };
}

// =============================================================================
// Tool Registry Tests
// =============================================================================

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('registerTool', () => {
    it('should register a valid tool', () => {
      const tool = createSimpleTool('test_tool');
      registry.registerTool(tool);
      expect(registry.hasTool('test_tool')).toBe(true);
    });

    it('should throw on invalid tool name (uppercase)', () => {
      const tool = createSimpleTool('TestTool');
      expect(() => registry.registerTool(tool)).toThrow(/invalid tool name/i);
    });

    it('should throw on invalid tool name (starts with number)', () => {
      const tool = createSimpleTool('1tool');
      expect(() => registry.registerTool(tool)).toThrow(/invalid tool name/i);
    });

    it('should throw on invalid tool name (spaces)', () => {
      const tool = createSimpleTool('test tool');
      expect(() => registry.registerTool(tool)).toThrow(/invalid tool name/i);
    });

    it('should throw on duplicate tool registration', () => {
      const tool = createSimpleTool('test_tool');
      registry.registerTool(tool);
      expect(() => registry.registerTool(tool)).toThrow(/already registered/i);
    });

    it('should throw on empty description', () => {
      const tool = createSimpleTool('test_tool', '');
      expect(() => registry.registerTool(tool)).toThrow(/must have a description/i);
    });

    it('should throw on missing inputSchema', () => {
      const tool = {
        name: 'test_tool',
        description: 'Test',
        inputSchema: null as unknown as JsonSchema,
        handler: async () => ({ content: [] }),
      };
      expect(() => registry.registerTool(tool)).toThrow(/must have an inputSchema/i);
    });

    it('should throw on missing handler', () => {
      const tool = {
        name: 'test_tool',
        description: 'Test',
        inputSchema: { type: 'object' },
        handler: null as unknown as Tool['handler'],
      };
      expect(() => registry.registerTool(tool)).toThrow(/must have a handler/i);
    });

    it('should emit toolsChanged event on registration', () => {
      const listener = vi.fn();
      registry.onToolsChanged(listener);

      registry.registerTool(createSimpleTool('test_tool'));

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('unregisterTool', () => {
    it('should unregister an existing tool', () => {
      const tool = createSimpleTool('test_tool');
      registry.registerTool(tool);
      expect(registry.hasTool('test_tool')).toBe(true);

      const result = registry.unregisterTool('test_tool');

      expect(result).toBe(true);
      expect(registry.hasTool('test_tool')).toBe(false);
    });

    it('should return false for non-existent tool', () => {
      const result = registry.unregisterTool('nonexistent');
      expect(result).toBe(false);
    });

    it('should emit toolsChanged event on unregistration', () => {
      registry.registerTool(createSimpleTool('test_tool'));

      const listener = vi.fn();
      registry.onToolsChanged(listener);

      registry.unregisterTool('test_tool');

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('getTool', () => {
    it('should return registered tool', () => {
      const tool = createSimpleTool('test_tool');
      registry.registerTool(tool);

      const retrieved = registry.getTool('test_tool');

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('test_tool');
    });

    it('should return undefined for non-existent tool', () => {
      const retrieved = registry.getTool('nonexistent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('listTools', () => {
    it('should list all tools when no cursor', () => {
      registry.registerTool(createSimpleTool('tool_a'));
      registry.registerTool(createSimpleTool('tool_b'));

      const result = registry.listTools();

      expect(result.tools).toHaveLength(2);
      expect(result.tools[0].name).toBe('tool_a');
      expect(result.tools[1].name).toBe('tool_b');
      expect(result.nextCursor).toBeUndefined();
    });

    it('should paginate results', () => {
      // Register 5 tools
      for (let i = 0; i < 5; i++) {
        registry.registerTool(createSimpleTool(`tool_${i}`));
      }

      // Get first page with size 2
      const page1 = registry.listTools(undefined, 2);
      expect(page1.tools).toHaveLength(2);
      expect(page1.tools[0].name).toBe('tool_0');
      expect(page1.tools[1].name).toBe('tool_1');
      expect(page1.nextCursor).toBeDefined();

      // Get second page
      const page2 = registry.listTools(page1.nextCursor, 2);
      expect(page2.tools).toHaveLength(2);
      expect(page2.tools[0].name).toBe('tool_2');
      expect(page2.tools[1].name).toBe('tool_3');
      expect(page2.nextCursor).toBeDefined();

      // Get third page
      const page3 = registry.listTools(page2.nextCursor, 2);
      expect(page3.tools).toHaveLength(1);
      expect(page3.tools[0].name).toBe('tool_4');
      expect(page3.nextCursor).toBeUndefined();
    });

    it('should return empty list when no tools', () => {
      const result = registry.listTools();
      expect(result.tools).toHaveLength(0);
      expect(result.nextCursor).toBeUndefined();
    });

    it('should exclude handler from external definition', () => {
      registry.registerTool(createSimpleTool('test_tool'));

      const result = registry.listTools();
      const external = result.tools[0] as unknown as Record<string, unknown>;

      expect(external.handler).toBeUndefined();
    });

    it('should include all tool properties in external definition', () => {
      const tool = createCalculatorTool();
      registry.registerTool(tool);

      const result = registry.listTools();
      const external = result.tools[0];

      expect(external.name).toBe('calculator');
      expect(external.title).toBe('Calculator Tool');
      expect(external.description).toBe('Performs basic arithmetic operations');
      expect(external.inputSchema).toBeDefined();
      expect(external.annotations).toEqual({
        readOnlyHint: true,
        idempotentHint: true,
      });
    });

    it('should handle invalid cursor gracefully', () => {
      registry.registerTool(createSimpleTool('test_tool'));

      const result = registry.listTools('invalid_cursor');

      // Should start from beginning
      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].name).toBe('test_tool');
    });
  });

  describe('getToolCount', () => {
    it('should return correct count', () => {
      expect(registry.getToolCount()).toBe(0);

      registry.registerTool(createSimpleTool('tool_a'));
      expect(registry.getToolCount()).toBe(1);

      registry.registerTool(createSimpleTool('tool_b'));
      expect(registry.getToolCount()).toBe(2);

      registry.unregisterTool('tool_a');
      expect(registry.getToolCount()).toBe(1);
    });
  });

  describe('clear', () => {
    it('should remove all tools', () => {
      registry.registerTool(createSimpleTool('tool_a'));
      registry.registerTool(createSimpleTool('tool_b'));

      registry.clear();

      expect(registry.getToolCount()).toBe(0);
      expect(registry.hasTool('tool_a')).toBe(false);
      expect(registry.hasTool('tool_b')).toBe(false);
    });

    it('should emit toolsChanged when tools exist', () => {
      registry.registerTool(createSimpleTool('test_tool'));

      const listener = vi.fn();
      registry.onToolsChanged(listener);

      registry.clear();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should not emit toolsChanged when already empty', () => {
      const listener = vi.fn();
      registry.onToolsChanged(listener);

      registry.clear();

      expect(listener).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// Tool Name Validation Tests
// =============================================================================

describe('Tool Name Validation', () => {
  describe('ToolNamePattern', () => {
    it('should match valid tool names', () => {
      expect(ToolNamePattern.test('tool')).toBe(true);
      expect(ToolNamePattern.test('my_tool')).toBe(true);
      expect(ToolNamePattern.test('tool123')).toBe(true);
      expect(ToolNamePattern.test('my_tool_v2')).toBe(true);
    });

    it('should reject invalid tool names', () => {
      expect(ToolNamePattern.test('Tool')).toBe(false);
      expect(ToolNamePattern.test('MyTool')).toBe(false);
      expect(ToolNamePattern.test('1tool')).toBe(false);
      expect(ToolNamePattern.test('my-tool')).toBe(false);
      expect(ToolNamePattern.test('my tool')).toBe(false);
      expect(ToolNamePattern.test('')).toBe(false);
    });
  });

  describe('ToolNameSchema', () => {
    it('should validate valid names', () => {
      expect(ToolNameSchema.safeParse('test_tool').success).toBe(true);
      expect(ToolNameSchema.safeParse('a').success).toBe(true);
    });

    it('should reject invalid names', () => {
      expect(ToolNameSchema.safeParse('TestTool').success).toBe(false);
      expect(ToolNameSchema.safeParse('').success).toBe(false);
    });
  });
});

// =============================================================================
// Tool Executor Tests
// =============================================================================

describe('ToolExecutor', () => {
  let registry: ToolRegistry;
  let executor: ToolExecutor;

  beforeEach(() => {
    registry = new ToolRegistry();
    executor = new ToolExecutor(registry);
  });

  describe('executeTool', () => {
    it('should execute a valid tool', async () => {
      const tool = createCalculatorTool();
      registry.registerTool(tool);

      const result = await executor.executeTool('calculator', {
        operation: 'add',
        a: 2,
        b: 3,
      });

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
    });

    it('should return error for unknown tool', async () => {
      const result = await executor.executeTool('nonexistent', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
      if (result.content[0].type === 'text') {
        expect(result.content[0].text).toContain('Unknown tool');
      }
    });

    it('should return error for invalid arguments (SEP-1303)', async () => {
      const tool = createCalculatorTool();
      registry.registerTool(tool);

      const result = await executor.executeTool('calculator', {
        operation: 'add',
        a: 'not a number', // Invalid type
        b: 3,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
      if (result.content[0].type === 'text') {
        expect(result.content[0].text).toContain('Invalid arguments');
      }
    });

    it('should return error for missing required arguments', async () => {
      const tool = createCalculatorTool();
      registry.registerTool(tool);

      const result = await executor.executeTool('calculator', {
        operation: 'add',
        // Missing 'a' and 'b'
      });

      expect(result.isError).toBe(true);
    });

    it('should handle tool execution errors gracefully', async () => {
      const failingTool: Tool = {
        name: 'failing_tool',
        description: 'A tool that always fails',
        inputSchema: { type: 'object' },
        handler: async () => {
          throw new Error('Intentional failure');
        },
      };
      registry.registerTool(failingTool);

      const result = await executor.executeTool('failing_tool', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
      if (result.content[0].type === 'text') {
        expect(result.content[0].text).toContain('Intentional failure');
      }
    });

    it('should handle tool that returns isError', async () => {
      const tool = createCalculatorTool();
      registry.registerTool(tool);

      const result = await executor.executeTool('calculator', {
        operation: 'divide',
        a: 10,
        b: 0, // Division by zero
      });

      expect(result.isError).toBe(true);
    });

    it('should skip validation when disabled', async () => {
      const executorNoValidation = new ToolExecutor(registry, { validateInput: false });

      const tool = createCalculatorTool();
      registry.registerTool(tool);

      // Pass invalid args - should still execute (and likely fail in handler)
      const result = await executorNoValidation.executeTool('calculator', {
        operation: 'add',
        a: 'invalid',
        b: 'invalid',
      });

      // Handler will process the invalid input (may produce NaN or error)
      expect(result.content).toBeDefined();
    });
  });

  describe('timeout handling', () => {
    it('should timeout long-running tools', async () => {
      const executorWithShortTimeout = new ToolExecutor(registry, { timeoutMs: 100 });

      const slowTool: Tool = {
        name: 'slow_tool',
        description: 'A slow tool',
        inputSchema: { type: 'object' },
        handler: async () => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return { content: [{ type: 'text', text: 'Done' }] };
        },
      };
      registry.registerTool(slowTool);

      const result = await executorWithShortTimeout.executeTool('slow_tool', {});

      expect(result.isError).toBe(true);
      if (result.content[0].type === 'text') {
        expect(result.content[0].text).toContain('timed out');
      }
    });
  });
});

// =============================================================================
// JSON Schema Validation Tests
// =============================================================================

describe('validateJsonSchema', () => {
  it('should validate simple object', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
      required: ['name'],
    };

    expect(validateJsonSchema(schema, { name: 'John' }).valid).toBe(true);
    expect(validateJsonSchema(schema, { name: 'John', age: 30 }).valid).toBe(true);
    expect(validateJsonSchema(schema, {}).valid).toBe(false); // Missing required
    expect(validateJsonSchema(schema, { name: 123 }).valid).toBe(false); // Wrong type
  });

  it('should validate arrays', () => {
    const schema: JsonSchema = {
      type: 'array',
      items: { type: 'number' },
    };

    expect(validateJsonSchema(schema, [1, 2, 3]).valid).toBe(true);
    expect(validateJsonSchema(schema, []).valid).toBe(true);
    expect(validateJsonSchema(schema, ['a', 'b']).valid).toBe(false);
  });

  it('should validate string constraints', () => {
    const schema: JsonSchema = {
      type: 'string',
      minLength: 2,
      maxLength: 5,
    };

    expect(validateJsonSchema(schema, 'abc').valid).toBe(true);
    expect(validateJsonSchema(schema, 'a').valid).toBe(false); // Too short
    expect(validateJsonSchema(schema, 'abcdef').valid).toBe(false); // Too long
  });

  it('should validate number constraints', () => {
    const schema: JsonSchema = {
      type: 'number',
      minimum: 0,
      maximum: 100,
    };

    expect(validateJsonSchema(schema, 50).valid).toBe(true);
    expect(validateJsonSchema(schema, -1).valid).toBe(false);
    expect(validateJsonSchema(schema, 101).valid).toBe(false);
  });

  it('should validate enum values', () => {
    const schema: JsonSchema = {
      type: 'string',
      enum: ['red', 'green', 'blue'],
    };

    expect(validateJsonSchema(schema, 'red').valid).toBe(true);
    expect(validateJsonSchema(schema, 'yellow').valid).toBe(false);
  });

  it('should validate nested objects', () => {
    const schema: JsonSchema = {
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
    };

    expect(validateJsonSchema(schema, { user: { name: 'John' } }).valid).toBe(true);
    expect(validateJsonSchema(schema, { user: {} }).valid).toBe(false);
    expect(validateJsonSchema(schema, {}).valid).toBe(false);
  });
});

// =============================================================================
// Request Handler Tests
// =============================================================================

describe('Request Handlers', () => {
  let registry: ToolRegistry;
  let executor: ToolExecutor;

  beforeEach(() => {
    registry = new ToolRegistry();
    executor = new ToolExecutor(registry);
    registry.registerTool(createCalculatorTool());
  });

  describe('handleToolsList', () => {
    it('should return list of tools', () => {
      const result = handleToolsList(registry);

      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].name).toBe('calculator');
    });

    it('should support cursor parameter', () => {
      // Add more tools for pagination
      registry.registerTool(createSimpleTool('tool_a'));
      registry.registerTool(createSimpleTool('tool_b'));

      const page1 = handleToolsList(registry, { cursor: undefined });
      expect(page1.tools.length).toBeGreaterThan(0);
    });
  });

  describe('handleToolsCall', () => {
    it('should execute tool and return result', async () => {
      const result = await handleToolsCall(executor, {
        name: 'calculator',
        arguments: { operation: 'add', a: 2, b: 3 },
      });

      expect(result.content).toBeDefined();
      expect(result.isError).toBeUndefined();
    });

    it('should handle missing arguments as empty object', async () => {
      const result = await handleToolsCall(executor, {
        name: 'calculator',
        // arguments not provided
      });

      // Should fail validation (missing required args)
      expect(result.isError).toBe(true);
    });
  });
});

// =============================================================================
// Zod Schema Parameter Validation Tests
// =============================================================================

describe('Request Parameter Schemas', () => {
  describe('ToolsListParamsSchema', () => {
    it('should accept valid params', () => {
      expect(ToolsListParamsSchema.safeParse({}).success).toBe(true);
      expect(ToolsListParamsSchema.safeParse({ cursor: 'abc123' }).success).toBe(true);
      expect(ToolsListParamsSchema.safeParse(undefined).success).toBe(true);
    });
  });

  describe('ToolsCallParamsSchema', () => {
    it('should accept valid params', () => {
      const valid = { name: 'test_tool' };
      expect(ToolsCallParamsSchema.safeParse(valid).success).toBe(true);

      const withArgs = { name: 'test_tool', arguments: { key: 'value' } };
      expect(ToolsCallParamsSchema.safeParse(withArgs).success).toBe(true);

      const withMeta = {
        name: 'test_tool',
        _meta: { progressToken: 'token123' },
      };
      expect(ToolsCallParamsSchema.safeParse(withMeta).success).toBe(true);
    });

    it('should reject invalid params', () => {
      expect(ToolsCallParamsSchema.safeParse({}).success).toBe(false);
      expect(ToolsCallParamsSchema.safeParse({ name: '' }).success).toBe(false);
    });
  });
});

// =============================================================================
// Notification Tests
// =============================================================================

describe('Notifications', () => {
  describe('createToolsListChangedNotification', () => {
    it('should create correct notification', () => {
      const notification = createToolsListChangedNotification();

      expect(notification.method).toBe('notifications/tools/listChanged');
      expect(notification.params).toBeUndefined();
    });
  });
});

// =============================================================================
// Content Helper Tests
// =============================================================================

describe('Content Helpers', () => {
  describe('createTextContent', () => {
    it('should create text content without annotations', () => {
      const content = createTextContent('Hello world');

      expect(content.type).toBe('text');
      expect(content.text).toBe('Hello world');
      expect(content.annotations).toBeUndefined();
    });

    it('should create text content with annotations', () => {
      const content = createTextContent('Hello', {
        audience: ['user'],
        priority: 1,
      });

      expect(content.annotations).toEqual({
        audience: ['user'],
        priority: 1,
      });
    });
  });

  describe('createImageContent', () => {
    it('should create image content', () => {
      const content = createImageContent('base64data', 'image/png');

      expect(content.type).toBe('image');
      expect(content.data).toBe('base64data');
      expect(content.mimeType).toBe('image/png');
    });
  });

  describe('createAudioContent', () => {
    it('should create audio content', () => {
      const content = createAudioContent('base64audio', 'audio/mp3');

      expect(content.type).toBe('audio');
      expect(content.data).toBe('base64audio');
      expect(content.mimeType).toBe('audio/mp3');
    });
  });

  describe('createResourceContent', () => {
    it('should create resource content', () => {
      const content = createResourceContent('file:///test.txt', {
        mimeType: 'text/plain',
        text: 'File content',
      });

      expect(content.type).toBe('resource');
      expect(content.resource.uri).toBe('file:///test.txt');
      expect(content.resource.mimeType).toBe('text/plain');
      expect(content.resource.text).toBe('File content');
    });
  });
});

// =============================================================================
// Zod to JSON Schema Conversion Tests
// =============================================================================

describe('zodToJsonSchema', () => {
  it('should convert simple object schema', () => {
    const zodSchema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const jsonSchema = zodToJsonSchema(zodSchema);

    expect(jsonSchema.type).toBe('object');
    expect(jsonSchema.properties).toBeDefined();
    expect(jsonSchema.properties?.name).toEqual({ type: 'string' });
    expect(jsonSchema.properties?.age).toEqual({ type: 'number' });
    expect(jsonSchema.required).toContain('name');
    expect(jsonSchema.required).toContain('age');
  });

  it('should handle optional fields', () => {
    const zodSchema = z.object({
      name: z.string(),
      nickname: z.string().optional(),
    });

    const jsonSchema = zodToJsonSchema(zodSchema);

    expect(jsonSchema.required).toContain('name');
    expect(jsonSchema.required).not.toContain('nickname');
  });

  it('should convert enum types', () => {
    const zodSchema = z.object({
      status: z.enum(['active', 'inactive']),
    });

    const jsonSchema = zodToJsonSchema(zodSchema);

    expect(jsonSchema.properties?.status).toEqual({
      type: 'string',
      enum: ['active', 'inactive'],
    });
  });
});

// =============================================================================
// Tool Result Helper Tests
// =============================================================================

describe('Tool Result Helpers', () => {
  describe('createToolErrorResult', () => {
    it('should create error result with isError flag', () => {
      const result = createToolErrorResult('Something went wrong');

      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('Something went wrong');
    });

    it('should include tool name in message', () => {
      const result = createToolErrorResult('Failed', 'calculator');

      expect(result.content[0].text).toContain('calculator');
    });
  });

  describe('createToolSuccessResult', () => {
    it('should create success result without isError flag', () => {
      const result = createToolSuccessResult('Operation completed');

      expect(result.isError).toBeUndefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('Operation completed');
    });
  });
});
