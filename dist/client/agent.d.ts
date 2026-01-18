/**
 * AI Agent
 *
 * Orchestrates LLM interactions with MCP tool execution.
 * Uses Vercel AI SDK's generateText with automatic tool calling.
 */
import { type LanguageModelV1, type CoreMessage } from 'ai';
import type { MCPClient } from './mcp-client.js';
export interface AgentOptions {
    maxSteps?: number | undefined;
    systemPrompt?: string | undefined;
    verbose?: boolean | undefined;
}
export interface AgentResult {
    text: string;
    steps: AgentStep[];
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    } | undefined;
}
export interface AgentStep {
    type: 'text' | 'tool_call' | 'tool_result';
    content: string;
    toolName?: string | undefined;
    toolArgs?: Record<string, unknown> | undefined;
}
/**
 * Run the AI agent with a user prompt
 */
export declare function runAgent(prompt: string, mcpClient: MCPClient, model: LanguageModelV1, options?: AgentOptions): Promise<AgentResult>;
/**
 * Agent class for stateful conversations
 */
export declare class Agent {
    private mcpClient;
    private model;
    private options;
    private conversationHistory;
    constructor(mcpClient: MCPClient, model: LanguageModelV1, options?: AgentOptions);
    /**
     * Send a message and get a response
     */
    chat(message: string): Promise<AgentResult>;
    /**
     * Clear conversation history
     */
    clearHistory(): void;
    /**
     * Get conversation history
     */
    getHistory(): CoreMessage[];
}
//# sourceMappingURL=agent.d.ts.map