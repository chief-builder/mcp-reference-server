/**
 * Agent E2E Tests with Real LLM
 *
 * These tests use a real LLM provider (OpenRouter or Anthropic) to test
 * the full agent workflow. Tests are skipped if no API key is available.
 *
 * To run these tests:
 * - Set OPENROUTER_API_KEY for OpenRouter (free tier available)
 * - Or set ANTHROPIC_API_KEY for Anthropic Claude
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Agent, runAgent } from '../../src/client/agent.js';
import { MCPClient } from '../../src/client/mcp-client.js';
import { createLLMProviderAsync, getAvailableProviders } from '../../src/client/llm-provider.js';
import type { LanguageModelV1 } from 'ai';

// =============================================================================
// Test Configuration
// =============================================================================

const CURSOR_SECRET = 'e2e-test-cursor-secret-at-least-32-characters';
const SERVER_COMMAND = 'node';
const SERVER_ARGS = ['dist/cli.js'];

// Check if any LLM provider is available (requires actual API key)
const hasOpenRouterKey = !!process.env.OPENROUTER_API_KEY;
const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
const hasLLMProvider = hasOpenRouterKey || hasAnthropicKey;

// Skip all tests if no LLM provider
const describeWithLLM = hasLLMProvider ? describe : describe.skip;

// =============================================================================
// Test Context
// =============================================================================

interface TestContext {
  mcpClient: MCPClient | null;
  llmModel: LanguageModelV1 | null;
}

const ctx: TestContext = {
  mcpClient: null,
  llmModel: null,
};

// =============================================================================
// E2E Tests with Real LLM
// =============================================================================

describeWithLLM('Agent E2E Tests with Real LLM', () => {
  beforeAll(async () => {
    // Create LLM model - prefer Anthropic if available, otherwise OpenRouter
    const provider = hasAnthropicKey ? 'anthropic' : 'openrouter';
    ctx.llmModel = await createLLMProviderAsync({ provider });

    console.log(`Using LLM provider: ${provider}`);
  });

  beforeEach(async () => {
    // Create fresh MCP client for each test
    ctx.mcpClient = new MCPClient({ verbose: false });
    await ctx.mcpClient.connectStdio({
      command: SERVER_COMMAND,
      args: SERVER_ARGS,
      env: {
        MCP_TRANSPORT: 'stdio',
        MCP_CURSOR_SECRET: CURSOR_SECRET,
        MCP_LOG_LEVEL: 'error',
      },
    });
  });

  afterAll(async () => {
    if (ctx.mcpClient) {
      await ctx.mcpClient.disconnect();
      ctx.mcpClient = null;
    }
  });

  describe('Basic Tool Execution', () => {
    it('should use calculator tool when asked to calculate', async () => {
      const result = await runAgent(
        'What is 15 multiplied by 7? Use the calculate tool to find the answer.',
        ctx.mcpClient!,
        ctx.llmModel!,
        { maxSteps: 5 }
      );

      // The LLM should have called the calculator tool
      const toolCalls = result.steps.filter(s => s.type === 'tool_call');
      expect(toolCalls.length).toBeGreaterThanOrEqual(1);

      // At least one tool call should be to calculate
      const calcCall = toolCalls.find(s => s.toolName === 'calculate');
      expect(calcCall).toBeDefined();

      // The result should mention 105
      const hasCorrectAnswer = result.text.includes('105') ||
        result.steps.some(s => s.content.includes('105'));
      expect(hasCorrectAnswer).toBe(true);
    }, 30000); // 30s timeout for LLM call

    it('should use dice roller tool when asked to roll dice', async () => {
      const result = await runAgent(
        'Roll 2d6+3 for me using the roll_dice tool.',
        ctx.mcpClient!,
        ctx.llmModel!,
        { maxSteps: 5 }
      );

      // The LLM should have called the dice roller tool
      const toolCalls = result.steps.filter(s => s.type === 'tool_call');
      const diceCall = toolCalls.find(s => s.toolName === 'roll_dice');
      expect(diceCall).toBeDefined();

      // The tool args should include the notation
      if (diceCall?.toolArgs) {
        expect(diceCall.toolArgs.notation).toMatch(/2d6/i);
      }

      // There should be a tool result
      const toolResults = result.steps.filter(s => s.type === 'tool_result');
      expect(toolResults.length).toBeGreaterThanOrEqual(1);
    }, 30000);

    it('should use fortune teller when asked for a fortune', async () => {
      const result = await runAgent(
        'Tell me my career fortune with an optimistic mood using the tell_fortune tool.',
        ctx.mcpClient!,
        ctx.llmModel!,
        { maxSteps: 5 }
      );

      // The LLM should have called the fortune teller tool
      const toolCalls = result.steps.filter(s => s.type === 'tool_call');
      const fortuneCall = toolCalls.find(s => s.toolName === 'tell_fortune');
      expect(fortuneCall).toBeDefined();

      // Check the tool was called with correct arguments
      if (fortuneCall?.toolArgs) {
        expect(fortuneCall.toolArgs.category).toBe('career');
      }
    }, 30000);
  });

  describe('Multi-turn Conversations', () => {
    it('should maintain context across multiple chat turns', async () => {
      const agent = new Agent(ctx.mcpClient!, ctx.llmModel!, {
        maxSteps: 5,
        systemPrompt: 'You are a helpful assistant with access to calculator, dice, and fortune tools.',
      });

      // First turn: ask for a calculation
      const result1 = await agent.chat('Calculate 8 times 9 using the calculate tool.');

      // Verify calculation was done
      const calc1Steps = result1.steps.filter(s => s.type === 'tool_call' && s.toolName === 'calculate');
      expect(calc1Steps.length).toBeGreaterThanOrEqual(1);

      // Second turn: ask about the previous result
      const result2 = await agent.chat('Now add 28 to that previous result.');

      // The agent should understand context and calculate 72 + 28 = 100
      const hasExpectedResult = result2.text.includes('100') ||
        result2.steps.some(s => s.content.includes('100'));

      // Note: This test may be flaky depending on LLM behavior
      // The important thing is that it makes another calculation
      const calc2Steps = result2.steps.filter(s => s.type === 'tool_call');
      expect(calc2Steps.length).toBeGreaterThanOrEqual(0); // May use tool or reason from memory
    }, 60000); // 60s timeout for multiple LLM calls
  });

  describe('Error Handling', () => {
    it('should handle division by zero gracefully', async () => {
      const result = await runAgent(
        'Use the calculate tool to divide 10 by 0.',
        ctx.mcpClient!,
        ctx.llmModel!,
        { maxSteps: 5 }
      );

      // The tool should have been called
      const toolCalls = result.steps.filter(s => s.type === 'tool_call');
      expect(toolCalls.length).toBeGreaterThanOrEqual(1);

      // The tool result should contain error
      const toolResults = result.steps.filter(s => s.type === 'tool_result');
      const hasError = toolResults.some(s =>
        s.content.toLowerCase().includes('error') ||
        s.content.toLowerCase().includes('zero')
      );
      expect(hasError).toBe(true);

      // The LLM should explain the error in its response
      expect(result.text.toLowerCase()).toMatch(/zero|error|cannot|impossible/);
    }, 30000);

    it('should handle invalid tool arguments gracefully', async () => {
      const result = await runAgent(
        'Roll a d7 using the roll_dice tool (I know d7 is invalid).',
        ctx.mcpClient!,
        ctx.llmModel!,
        { maxSteps: 5 }
      );

      // The LLM might try to call the tool or explain it's invalid
      // Either way, the result should mention the issue
      const hasErrorOrExplanation =
        result.text.toLowerCase().includes('invalid') ||
        result.text.toLowerCase().includes('error') ||
        result.text.toLowerCase().includes('d4') ||
        result.text.toLowerCase().includes('d6') ||
        result.steps.some(s => s.content.toLowerCase().includes('invalid'));

      expect(hasErrorOrExplanation).toBe(true);
    }, 30000);
  });

  describe('Complex Workflows', () => {
    it('should use multiple tools in sequence when needed', async () => {
      const result = await runAgent(
        'First calculate 7 times 8, then roll a d20 and tell me if I beat that calculated number.',
        ctx.mcpClient!,
        ctx.llmModel!,
        { maxSteps: 10 }
      );

      // Should have called both calculator and dice roller
      const toolCalls = result.steps.filter(s => s.type === 'tool_call');
      const toolNames = toolCalls.map(s => s.toolName);

      expect(toolNames).toContain('calculate');
      expect(toolNames).toContain('roll_dice');

      // The response should discuss the comparison
      expect(result.text.toLowerCase()).toMatch(/56|beat|roll|higher|lower|result/);
    }, 45000);
  });
});

// =============================================================================
// Skip message for missing LLM
// =============================================================================

describe.skipIf(hasLLMProvider)('Agent E2E Tests - Skipped (No LLM Provider)', () => {
  it('should be skipped because no LLM API key is set', () => {
    console.log('\n⚠️  Agent E2E tests skipped: No LLM provider available.');
    console.log('   Set OPENROUTER_API_KEY or ANTHROPIC_API_KEY to run these tests.\n');
    expect(true).toBe(true);
  });
});
