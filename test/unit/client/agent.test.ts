/**
 * Agent Unit Tests
 *
 * Tests for the AI agent module that orchestrates LLM interactions
 * with MCP tool execution using Vercel AI SDK.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { runAgent, Agent, type AgentOptions, type AgentResult } from '../../../src/client/agent.js';
import type { MCPClient } from '../../../src/client/mcp-client.js';
import type { LanguageModelV1 } from 'ai';

// Mock the AI SDK's generateText
vi.mock('ai', async () => {
  const actual = await vi.importActual('ai');
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

// Mock the tools adapter
vi.mock('../../../src/client/tools-adapter.js', () => ({
  convertMcpToolsToAiTools: vi.fn(),
}));

import { generateText } from 'ai';
import { convertMcpToolsToAiTools } from '../../../src/client/tools-adapter.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockMCPClient(): MCPClient {
  return {
    listTools: vi.fn().mockResolvedValue([
      {
        name: 'calculate',
        description: 'Perform arithmetic',
        inputSchema: { type: 'object', properties: {} },
      },
    ]),
    callTool: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '42' }],
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

function createMockModel(): LanguageModelV1 {
  return {
    specificationVersion: 'v1',
    provider: 'test',
    modelId: 'test-model',
    defaultObjectGenerationMode: 'json',
    doGenerate: vi.fn(),
    doStream: vi.fn(),
  } as unknown as LanguageModelV1;
}

function createMockTools() {
  return {
    calculate: {
      description: 'Perform arithmetic',
      parameters: {},
      execute: vi.fn().mockResolvedValue('42'),
    },
  };
}

// =============================================================================
// runAgent Tests
// =============================================================================

describe('runAgent', () => {
  let mockClient: MCPClient;
  let mockModel: LanguageModelV1;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockMCPClient();
    mockModel = createMockModel();
    (convertMcpToolsToAiTools as Mock).mockResolvedValue(createMockTools());
  });

  describe('basic execution', () => {
    it('should call generateText with correct parameters', async () => {
      (generateText as Mock).mockResolvedValue({
        text: 'The answer is 42',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      });

      await runAgent('What is 6 * 7?', mockClient, mockModel);

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          model: mockModel,
          maxSteps: 10,
          tools: expect.any(Object),
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({ role: 'user', content: 'What is 6 * 7?' }),
          ]),
        })
      );
    });

    it('should return the generated text', async () => {
      (generateText as Mock).mockResolvedValue({
        text: 'The answer is 42',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      });

      const result = await runAgent('What is 6 * 7?', mockClient, mockModel);

      expect(result.text).toBe('The answer is 42');
    });

    it('should return usage statistics', async () => {
      (generateText as Mock).mockResolvedValue({
        text: 'Result',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      const result = await runAgent('Test', mockClient, mockModel);

      expect(result.usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });
    });

    it('should handle missing usage statistics', async () => {
      (generateText as Mock).mockResolvedValue({
        text: 'Result',
      });

      const result = await runAgent('Test', mockClient, mockModel);

      expect(result.usage).toBeUndefined();
    });
  });

  describe('options', () => {
    it('should use custom maxSteps', async () => {
      (generateText as Mock).mockResolvedValue({ text: 'Done' });

      await runAgent('Test', mockClient, mockModel, { maxSteps: 5 });

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({ maxSteps: 5 })
      );
    });

    it('should use custom systemPrompt', async () => {
      (generateText as Mock).mockResolvedValue({ text: 'Done' });

      await runAgent('Test', mockClient, mockModel, {
        systemPrompt: 'You are a calculator assistant.',
      });

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'system',
              content: 'You are a calculator assistant.',
            }),
          ]),
        })
      );
    });

    it('should use default maxSteps of 10', async () => {
      (generateText as Mock).mockResolvedValue({ text: 'Done' });

      await runAgent('Test', mockClient, mockModel);

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({ maxSteps: 10 })
      );
    });
  });

  describe('tool conversion', () => {
    it('should convert MCP tools to AI tools', async () => {
      (generateText as Mock).mockResolvedValue({ text: 'Done' });

      await runAgent('Test', mockClient, mockModel);

      expect(convertMcpToolsToAiTools).toHaveBeenCalledWith(mockClient);
    });

    it('should pass converted tools to generateText', async () => {
      const mockTools = createMockTools();
      (convertMcpToolsToAiTools as Mock).mockResolvedValue(mockTools);
      (generateText as Mock).mockResolvedValue({ text: 'Done' });

      await runAgent('Test', mockClient, mockModel);

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({ tools: mockTools })
      );
    });
  });

  describe('step tracking', () => {
    it('should track text steps via onStepFinish callback', async () => {
      let capturedCallback: ((event: unknown) => void) | undefined;
      (generateText as Mock).mockImplementation(async (options) => {
        capturedCallback = options.onStepFinish;
        // Simulate a text step
        if (capturedCallback) {
          capturedCallback({
            stepType: 'text',
            text: 'Here is the result',
            toolCalls: undefined,
            toolResults: undefined,
          });
        }
        return { text: 'Here is the result' };
      });

      const result = await runAgent('Test', mockClient, mockModel);

      expect(result.steps).toContainEqual(
        expect.objectContaining({
          type: 'text',
          content: 'Here is the result',
        })
      );
    });

    it('should track tool call steps', async () => {
      let capturedCallback: ((event: unknown) => void) | undefined;
      (generateText as Mock).mockImplementation(async (options) => {
        capturedCallback = options.onStepFinish;
        if (capturedCallback) {
          capturedCallback({
            stepType: 'tool-call',
            toolCalls: [
              { toolName: 'calculate', args: { operation: 'add', a: 5, b: 3 } },
            ],
          });
        }
        return { text: 'Done' };
      });

      const result = await runAgent('Test', mockClient, mockModel);

      expect(result.steps).toContainEqual(
        expect.objectContaining({
          type: 'tool_call',
          toolName: 'calculate',
          toolArgs: { operation: 'add', a: 5, b: 3 },
        })
      );
    });

    it('should track tool result steps', async () => {
      let capturedCallback: ((event: unknown) => void) | undefined;
      (generateText as Mock).mockImplementation(async (options) => {
        capturedCallback = options.onStepFinish;
        if (capturedCallback) {
          capturedCallback({
            stepType: 'tool-result',
            toolResults: [{ toolName: 'calculate', result: '8' }],
          });
        }
        return { text: 'Done' };
      });

      const result = await runAgent('Test', mockClient, mockModel);

      expect(result.steps).toContainEqual(
        expect.objectContaining({
          type: 'tool_result',
          content: '8',
          toolName: 'calculate',
        })
      );
    });

    it('should stringify non-string tool results', async () => {
      let capturedCallback: ((event: unknown) => void) | undefined;
      (generateText as Mock).mockImplementation(async (options) => {
        capturedCallback = options.onStepFinish;
        if (capturedCallback) {
          capturedCallback({
            stepType: 'tool-result',
            toolResults: [{ toolName: 'calculate', result: { value: 42 } }],
          });
        }
        return { text: 'Done' };
      });

      const result = await runAgent('Test', mockClient, mockModel);

      expect(result.steps).toContainEqual(
        expect.objectContaining({
          type: 'tool_result',
          content: '{"value":42}',
        })
      );
    });
  });

  describe('error handling', () => {
    it('should propagate generateText errors', async () => {
      (generateText as Mock).mockRejectedValue(new Error('API error'));

      await expect(runAgent('Test', mockClient, mockModel)).rejects.toThrow(
        'API error'
      );
    });

    it('should propagate tool conversion errors', async () => {
      (convertMcpToolsToAiTools as Mock).mockRejectedValue(
        new Error('Tool conversion failed')
      );

      await expect(runAgent('Test', mockClient, mockModel)).rejects.toThrow(
        'Tool conversion failed'
      );
    });
  });
});

// =============================================================================
// Agent Class Tests
// =============================================================================

describe('Agent', () => {
  let mockClient: MCPClient;
  let mockModel: LanguageModelV1;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockMCPClient();
    mockModel = createMockModel();
    (convertMcpToolsToAiTools as Mock).mockResolvedValue(createMockTools());
  });

  describe('construction', () => {
    it('should create an agent with default options', () => {
      const agent = new Agent(mockClient, mockModel);
      expect(agent).toBeInstanceOf(Agent);
    });

    it('should create an agent with custom options', () => {
      const agent = new Agent(mockClient, mockModel, {
        maxSteps: 5,
        systemPrompt: 'Custom prompt',
        verbose: true,
      });
      expect(agent).toBeInstanceOf(Agent);
    });

    it('should initialize conversation history with system prompt', () => {
      const agent = new Agent(mockClient, mockModel, {
        systemPrompt: 'You are helpful.',
      });

      const history = agent.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual({
        role: 'system',
        content: 'You are helpful.',
      });
    });

    it('should use default system prompt if not provided', () => {
      const agent = new Agent(mockClient, mockModel);

      const history = agent.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].role).toBe('system');
      expect(history[0].content).toContain('helpful AI assistant');
    });
  });

  describe('chat', () => {
    it('should add user message to history', async () => {
      (generateText as Mock).mockResolvedValue({ text: 'Response' });
      const agent = new Agent(mockClient, mockModel);

      await agent.chat('Hello');

      const history = agent.getHistory();
      expect(history).toContainEqual({
        role: 'user',
        content: 'Hello',
      });
    });

    it('should add assistant response to history', async () => {
      (generateText as Mock).mockResolvedValue({ text: 'Hi there!' });
      const agent = new Agent(mockClient, mockModel);

      await agent.chat('Hello');

      const history = agent.getHistory();
      expect(history).toContainEqual({
        role: 'assistant',
        content: 'Hi there!',
      });
    });

    it('should maintain conversation context across multiple chats', async () => {
      (generateText as Mock)
        .mockResolvedValueOnce({ text: 'Hello!' })
        .mockResolvedValueOnce({ text: 'I remember you!' });
      const agent = new Agent(mockClient, mockModel);

      await agent.chat('Hi');
      await agent.chat('Do you remember me?');

      const history = agent.getHistory();
      // system + user1 + assistant1 + user2 + assistant2 = 5
      expect(history).toHaveLength(5);
    });

    it('should pass full conversation history to generateText', async () => {
      (generateText as Mock)
        .mockResolvedValueOnce({ text: 'First response' })
        .mockResolvedValueOnce({ text: 'Second response' });
      const agent = new Agent(mockClient, mockModel);

      await agent.chat('First message');
      await agent.chat('Second message');

      // Check the second call to generateText includes full history
      expect(generateText).toHaveBeenLastCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({ role: 'user', content: 'First message' }),
            expect.objectContaining({
              role: 'assistant',
              content: 'First response',
            }),
            expect.objectContaining({ role: 'user', content: 'Second message' }),
          ]),
        })
      );
    });

    it('should return AgentResult with text and steps', async () => {
      (generateText as Mock).mockResolvedValue({
        text: 'The answer is 42',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      });
      const agent = new Agent(mockClient, mockModel);

      const result = await agent.chat('What is 6 * 7?');

      expect(result.text).toBe('The answer is 42');
      expect(result.steps).toBeInstanceOf(Array);
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });
    });

    it('should use configured maxSteps', async () => {
      (generateText as Mock).mockResolvedValue({ text: 'Done' });
      const agent = new Agent(mockClient, mockModel, { maxSteps: 3 });

      await agent.chat('Test');

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({ maxSteps: 3 })
      );
    });
  });

  describe('clearHistory', () => {
    it('should reset history to only system prompt', async () => {
      (generateText as Mock).mockResolvedValue({ text: 'Response' });
      const agent = new Agent(mockClient, mockModel, {
        systemPrompt: 'Test prompt',
      });

      await agent.chat('Message 1');
      await agent.chat('Message 2');
      agent.clearHistory();

      const history = agent.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual({
        role: 'system',
        content: 'Test prompt',
      });
    });

    it('should use default system prompt after clearing if none was set', () => {
      const agent = new Agent(mockClient, mockModel);
      agent.clearHistory();

      const history = agent.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].content).toContain('helpful AI assistant');
    });
  });

  describe('getHistory', () => {
    it('should return a copy of the history', async () => {
      (generateText as Mock).mockResolvedValue({ text: 'Response' });
      const agent = new Agent(mockClient, mockModel);

      await agent.chat('Test');
      const history1 = agent.getHistory();
      const history2 = agent.getHistory();

      // Should be equal but not the same reference
      expect(history1).toEqual(history2);
      expect(history1).not.toBe(history2);
    });

    it('should not allow external modification of history', async () => {
      (generateText as Mock).mockResolvedValue({ text: 'Response' });
      const agent = new Agent(mockClient, mockModel);

      await agent.chat('Test');
      const history = agent.getHistory();
      history.push({ role: 'user', content: 'Injected' });

      // Internal history should be unchanged
      expect(agent.getHistory()).not.toContainEqual({
        role: 'user',
        content: 'Injected',
      });
    });
  });
});
