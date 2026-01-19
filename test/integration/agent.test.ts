/**
 * Agent Integration Tests
 *
 * Tests the AI agent with a real MCP server but mocked LLM responses.
 * This validates the full integration between agent, MCP client, and server.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { Agent, runAgent } from '../../src/client/agent.js';
import { MCPClient } from '../../src/client/mcp-client.js';
import type { LanguageModelV1 } from 'ai';
import { spawn, type ChildProcess } from 'child_process';
import { join } from 'path';

// Mock the AI SDK's generateText to control LLM responses
vi.mock('ai', async () => {
  const actual = await vi.importActual('ai');
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

import { generateText } from 'ai';

// =============================================================================
// Test Helpers
// =============================================================================

const SERVER_COMMAND = 'node';
const SERVER_SCRIPT = join(process.cwd(), 'dist', 'cli.js');
const CURSOR_SECRET = 'test-cursor-secret-for-integration-tests-32chars';

interface TestContext {
  serverProcess: ChildProcess | null;
  mcpClient: MCPClient | null;
}

async function startServerProcess(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const proc = spawn(SERVER_COMMAND, [SERVER_SCRIPT], {
      env: {
        ...process.env,
        MCP_TRANSPORT: 'stdio',
        MCP_CURSOR_SECRET: CURSOR_SECRET,
        MCP_LOG_LEVEL: 'error',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Wait for server to start
    const timeout = setTimeout(() => {
      reject(new Error('Server startup timeout'));
    }, 10000);

    proc.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString();
      if (msg.includes('MCP Reference Server started')) {
        clearTimeout(timeout);
        resolve(proc);
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function createMockModel(): LanguageModelV1 {
  return {
    specificationVersion: 'v1',
    provider: 'mock',
    modelId: 'mock-model',
    defaultObjectGenerationMode: 'json',
    doGenerate: vi.fn(),
    doStream: vi.fn(),
  } as unknown as LanguageModelV1;
}

// =============================================================================
// Integration Tests with Mocked LLM
// =============================================================================

describe('Agent Integration Tests', () => {
  const ctx: TestContext = {
    serverProcess: null,
    mcpClient: null,
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Start the server process
    ctx.serverProcess = await startServerProcess();

    // Create MCP client and connect via stdio
    ctx.mcpClient = new MCPClient({ verbose: false });
    await ctx.mcpClient.connectStdio({
      command: SERVER_COMMAND,
      args: [SERVER_SCRIPT],
      env: {
        MCP_TRANSPORT: 'stdio',
        MCP_CURSOR_SECRET: CURSOR_SECRET,
        MCP_LOG_LEVEL: 'error',
      },
    });
  });

  afterEach(async () => {
    if (ctx.mcpClient) {
      await ctx.mcpClient.disconnect();
      ctx.mcpClient = null;
    }
    if (ctx.serverProcess) {
      ctx.serverProcess.kill('SIGTERM');
      ctx.serverProcess = null;
    }
  });

  describe('runAgent with real MCP server', () => {
    it('should discover tools from the real server', async () => {
      const mockModel = createMockModel();
      (generateText as Mock).mockResolvedValue({ text: 'Test response' });

      await runAgent('Test prompt', ctx.mcpClient!, mockModel);

      // Verify generateText was called with tools from the real server
      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.objectContaining({
            calculate: expect.any(Object),
            roll_dice: expect.any(Object),
            tell_fortune: expect.any(Object),
          }),
        })
      );
    });

    it('should execute calculator tool via LLM tool call', async () => {
      const mockModel = createMockModel();

      // Simulate LLM making a tool call
      (generateText as Mock).mockImplementation(async (options) => {
        // Call onStepFinish to simulate tool execution
        if (options.onStepFinish) {
          // First step: tool call
          options.onStepFinish({
            stepType: 'tool-call',
            toolCalls: [{
              toolName: 'calculate',
              args: { operation: 'add', a: 10, b: 20 },
            }],
          });

          // Execute the actual tool
          const tool = options.tools.calculate;
          const toolResult = await tool.execute(
            { operation: 'add', a: 10, b: 20 },
            { toolCallId: 'test', messages: [], abortSignal: undefined as unknown as AbortSignal }
          );

          // Second step: tool result
          options.onStepFinish({
            stepType: 'tool-result',
            toolResults: [{
              toolName: 'calculate',
              result: toolResult,
            }],
          });
        }

        return { text: 'The result of 10 + 20 is 30' };
      });

      const result = await runAgent('What is 10 + 20?', ctx.mcpClient!, mockModel);

      expect(result.text).toContain('30');
      expect(result.steps).toContainEqual(
        expect.objectContaining({
          type: 'tool_call',
          toolName: 'calculate',
        })
      );
      expect(result.steps).toContainEqual(
        expect.objectContaining({
          type: 'tool_result',
          toolName: 'calculate',
        })
      );
    });

    it('should execute dice roller tool via LLM tool call', async () => {
      const mockModel = createMockModel();

      (generateText as Mock).mockImplementation(async (options) => {
        if (options.onStepFinish) {
          options.onStepFinish({
            stepType: 'tool-call',
            toolCalls: [{
              toolName: 'roll_dice',
              args: { notation: '2d6' },
            }],
          });

          const tool = options.tools.roll_dice;
          const toolResult = await tool.execute(
            { notation: '2d6' },
            { toolCallId: 'test', messages: [], abortSignal: undefined as unknown as AbortSignal }
          );

          options.onStepFinish({
            stepType: 'tool-result',
            toolResults: [{
              toolName: 'roll_dice',
              result: toolResult,
            }],
          });
        }

        return { text: 'You rolled 2d6' };
      });

      const result = await runAgent('Roll 2d6', ctx.mcpClient!, mockModel);

      expect(result.steps).toContainEqual(
        expect.objectContaining({
          type: 'tool_call',
          toolName: 'roll_dice',
          toolArgs: { notation: '2d6' },
        })
      );

      // Verify the tool result contains valid dice roll data
      const toolResultStep = result.steps.find(
        s => s.type === 'tool_result' && s.toolName === 'roll_dice'
      );
      expect(toolResultStep).toBeDefined();

      const diceResult = JSON.parse(toolResultStep!.content);
      expect(diceResult.rolls).toHaveLength(2);
      expect(diceResult.notation).toBe('2d6');
    });

    it('should execute fortune teller tool via LLM tool call', async () => {
      const mockModel = createMockModel();

      (generateText as Mock).mockImplementation(async (options) => {
        if (options.onStepFinish) {
          options.onStepFinish({
            stepType: 'tool-call',
            toolCalls: [{
              toolName: 'tell_fortune',
              args: { category: 'career', mood: 'optimistic' },
            }],
          });

          const tool = options.tools.tell_fortune;
          const toolResult = await tool.execute(
            { category: 'career', mood: 'optimistic' },
            { toolCallId: 'test', messages: [], abortSignal: undefined as unknown as AbortSignal }
          );

          options.onStepFinish({
            stepType: 'tool-result',
            toolResults: [{
              toolName: 'tell_fortune',
              result: toolResult,
            }],
          });
        }

        return { text: 'Your career fortune has been told!' };
      });

      const result = await runAgent('Tell my career fortune', ctx.mcpClient!, mockModel);

      const toolResultStep = result.steps.find(
        s => s.type === 'tool_result' && s.toolName === 'tell_fortune'
      );
      expect(toolResultStep).toBeDefined();

      const fortuneResult = JSON.parse(toolResultStep!.content);
      expect(fortuneResult.category).toBe('career');
      expect(fortuneResult.mood).toBe('optimistic');
      expect(fortuneResult.fortune).toBeTruthy();
    });

    it('should handle tool execution errors gracefully', async () => {
      const mockModel = createMockModel();

      (generateText as Mock).mockImplementation(async (options) => {
        if (options.onStepFinish) {
          options.onStepFinish({
            stepType: 'tool-call',
            toolCalls: [{
              toolName: 'calculate',
              args: { operation: 'divide', a: 10, b: 0 },
            }],
          });

          const tool = options.tools.calculate;
          const toolResult = await tool.execute(
            { operation: 'divide', a: 10, b: 0 },
            { toolCallId: 'test', messages: [], abortSignal: undefined as unknown as AbortSignal }
          );

          options.onStepFinish({
            stepType: 'tool-result',
            toolResults: [{
              toolName: 'calculate',
              result: toolResult,
            }],
          });
        }

        return { text: 'Division by zero is not allowed' };
      });

      const result = await runAgent('Divide 10 by 0', ctx.mcpClient!, mockModel);

      const toolResultStep = result.steps.find(
        s => s.type === 'tool_result' && s.toolName === 'calculate'
      );
      expect(toolResultStep).toBeDefined();
      expect(toolResultStep!.content).toContain('Error');
    });
  });

  describe('Agent class with real MCP server', () => {
    it('should maintain conversation history across multiple chats', async () => {
      const mockModel = createMockModel();
      const agent = new Agent(ctx.mcpClient!, mockModel);

      // First chat
      (generateText as Mock).mockResolvedValueOnce({ text: 'Hello!' });
      await agent.chat('Hi');

      // Second chat - should include history
      (generateText as Mock).mockResolvedValueOnce({ text: 'I remember you!' });
      await agent.chat('Do you remember me?');

      // Verify second call includes full history
      expect(generateText).toHaveBeenLastCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({ role: 'user', content: 'Hi' }),
            expect.objectContaining({ role: 'assistant', content: 'Hello!' }),
            expect.objectContaining({ role: 'user', content: 'Do you remember me?' }),
          ]),
        })
      );
    });

    it('should clear history and start fresh', async () => {
      const mockModel = createMockModel();
      const agent = new Agent(ctx.mcpClient!, mockModel);

      (generateText as Mock).mockResolvedValue({ text: 'Response' });

      await agent.chat('Message 1');
      await agent.chat('Message 2');

      agent.clearHistory();

      await agent.chat('New message');

      // After clear, history should only have system + new user message
      const history = agent.getHistory();
      expect(history).toHaveLength(3); // system + user + assistant
      expect(history[1].content).toBe('New message');
    });

    it('should use custom system prompt', async () => {
      const mockModel = createMockModel();
      const customPrompt = 'You are a math tutor.';
      const agent = new Agent(ctx.mcpClient!, mockModel, { systemPrompt: customPrompt });

      (generateText as Mock).mockResolvedValue({ text: 'Math response' });
      await agent.chat('Help with math');

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system', content: customPrompt }),
          ]),
        })
      );
    });

    it('should respect maxSteps option', async () => {
      const mockModel = createMockModel();
      const agent = new Agent(ctx.mcpClient!, mockModel, { maxSteps: 3 });

      (generateText as Mock).mockResolvedValue({ text: 'Response' });
      await agent.chat('Test');

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({ maxSteps: 3 })
      );
    });
  });

  describe('Multi-tool workflows', () => {
    it('should handle sequential tool calls in a single request', async () => {
      const mockModel = createMockModel();

      (generateText as Mock).mockImplementation(async (options) => {
        if (options.onStepFinish) {
          // First tool: calculate
          options.onStepFinish({
            stepType: 'tool-call',
            toolCalls: [{ toolName: 'calculate', args: { operation: 'multiply', a: 6, b: 7 } }],
          });

          const calcTool = options.tools.calculate;
          const calcResult = await calcTool.execute(
            { operation: 'multiply', a: 6, b: 7 },
            { toolCallId: 'calc', messages: [], abortSignal: undefined as unknown as AbortSignal }
          );

          options.onStepFinish({
            stepType: 'tool-result',
            toolResults: [{ toolName: 'calculate', result: calcResult }],
          });

          // Second tool: roll dice
          options.onStepFinish({
            stepType: 'tool-call',
            toolCalls: [{ toolName: 'roll_dice', args: { notation: '1d20' } }],
          });

          const diceTool = options.tools.roll_dice;
          const diceResult = await diceTool.execute(
            { notation: '1d20' },
            { toolCallId: 'dice', messages: [], abortSignal: undefined as unknown as AbortSignal }
          );

          options.onStepFinish({
            stepType: 'tool-result',
            toolResults: [{ toolName: 'roll_dice', result: diceResult }],
          });
        }

        return { text: '6 * 7 = 42, and you rolled a d20' };
      });

      const result = await runAgent('Calculate 6*7 and roll a d20', ctx.mcpClient!, mockModel);

      // Should have 2 tool calls and 2 tool results
      const toolCalls = result.steps.filter(s => s.type === 'tool_call');
      const toolResults = result.steps.filter(s => s.type === 'tool_result');

      expect(toolCalls).toHaveLength(2);
      expect(toolResults).toHaveLength(2);

      expect(toolCalls[0].toolName).toBe('calculate');
      expect(toolCalls[1].toolName).toBe('roll_dice');
    });
  });
});
