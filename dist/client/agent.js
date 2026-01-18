/**
 * AI Agent
 *
 * Orchestrates LLM interactions with MCP tool execution.
 * Uses Vercel AI SDK's generateText with automatic tool calling.
 */
import { generateText } from 'ai';
import { convertMcpToolsToAiTools } from './tools-adapter.js';
const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant with access to tools.
When the user asks a question or makes a request, use the available tools to help them.
Always explain what you're doing and provide clear, helpful responses.`;
/**
 * Run the AI agent with a user prompt
 */
export async function runAgent(prompt, mcpClient, model, options = {}) {
    const { maxSteps = 10, systemPrompt = DEFAULT_SYSTEM_PROMPT, verbose = false, } = options;
    const steps = [];
    const tools = await convertMcpToolsToAiTools(mcpClient);
    if (verbose) {
        console.error(`[Agent] Available tools: ${Object.keys(tools).join(', ')}`);
    }
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
    ];
    const result = await generateText({
        model,
        messages,
        tools,
        maxSteps,
        onStepFinish: (event) => {
            if (verbose) {
                console.error(`[Agent] Step type: ${event.stepType}`);
            }
            if (event.text) {
                steps.push({ type: 'text', content: event.text });
                if (verbose) {
                    console.error(`[Agent] Text: ${event.text.substring(0, 100)}...`);
                }
            }
            if (event.toolCalls) {
                for (const call of event.toolCalls) {
                    steps.push({
                        type: 'tool_call',
                        content: `Calling ${call.toolName}`,
                        toolName: call.toolName,
                        toolArgs: call.args,
                    });
                    if (verbose) {
                        console.error(`[Agent] Tool call: ${call.toolName}`, call.args);
                    }
                }
            }
            if (event.toolResults) {
                for (const toolResult of event.toolResults) {
                    const resultObj = toolResult;
                    const resultStr = typeof resultObj.result === 'string'
                        ? resultObj.result
                        : JSON.stringify(resultObj.result);
                    steps.push({
                        type: 'tool_result',
                        content: resultStr,
                        toolName: resultObj.toolName,
                    });
                    if (verbose) {
                        console.error(`[Agent] Tool result: ${resultStr.substring(0, 100)}...`);
                    }
                }
            }
        },
    });
    return {
        text: result.text,
        steps,
        usage: result.usage ? {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
        } : undefined,
    };
}
/**
 * Agent class for stateful conversations
 */
export class Agent {
    mcpClient;
    model;
    options;
    conversationHistory = [];
    constructor(mcpClient, model, options = {}) {
        this.mcpClient = mcpClient;
        this.model = model;
        this.options = options;
        const systemPrompt = options.systemPrompt || DEFAULT_SYSTEM_PROMPT;
        this.conversationHistory = [
            { role: 'system', content: systemPrompt },
        ];
    }
    /**
     * Send a message and get a response
     */
    async chat(message) {
        this.conversationHistory.push({ role: 'user', content: message });
        const steps = [];
        const tools = await convertMcpToolsToAiTools(this.mcpClient);
        const result = await generateText({
            model: this.model,
            messages: this.conversationHistory,
            tools,
            maxSteps: this.options.maxSteps ?? 10,
            onStepFinish: (event) => {
                if (event.text) {
                    steps.push({ type: 'text', content: event.text });
                }
                if (event.toolCalls) {
                    for (const call of event.toolCalls) {
                        steps.push({
                            type: 'tool_call',
                            content: `Calling ${call.toolName}`,
                            toolName: call.toolName,
                            toolArgs: call.args,
                        });
                    }
                }
                if (event.toolResults) {
                    for (const toolResult of event.toolResults) {
                        const res = toolResult;
                        steps.push({
                            type: 'tool_result',
                            content: typeof res.result === 'string' ? res.result : JSON.stringify(res.result),
                            toolName: res.toolName,
                        });
                    }
                }
            },
        });
        this.conversationHistory.push({ role: 'assistant', content: result.text });
        return {
            text: result.text,
            steps,
            usage: result.usage ? {
                promptTokens: result.usage.promptTokens,
                completionTokens: result.usage.completionTokens,
                totalTokens: result.usage.totalTokens,
            } : undefined,
        };
    }
    /**
     * Clear conversation history
     */
    clearHistory() {
        const systemPrompt = this.options.systemPrompt || DEFAULT_SYSTEM_PROMPT;
        this.conversationHistory = [
            { role: 'system', content: systemPrompt },
        ];
    }
    /**
     * Get conversation history
     */
    getHistory() {
        return [...this.conversationHistory];
    }
}
//# sourceMappingURL=agent.js.map