/**
 * Chat API Handler
 *
 * POST /api/chat endpoint that integrates with the Agent class.
 * Returns SSE stream with token, tool_call, tool_result, done, and error events.
 */
import { streamText } from 'ai';
import { MCPClient } from '../client/mcp-client.js';
import { createLLMProviderAsync } from '../client/llm-provider.js';
import { convertMcpToolsToAiTools } from '../client/tools-adapter.js';
import { activeControllers } from './cancel-handler.js';
const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant with access to tools.
Use tools when appropriate, but you can also answer general knowledge questions directly.
Always explain what you're doing and provide clear, helpful responses.`;
// Session storage for conversation history
const sessions = new Map();
// Session cleanup interval (5 minutes)
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions) {
        if (now - session.lastAccess > SESSION_TTL_MS) {
            sessions.delete(id);
        }
    }
}, 5 * 60 * 1000);
// Singleton MCP client and model (lazy initialized)
let mcpClient = null;
let llmModel = null;
let initPromise = null;
async function ensureInitialized() {
    if (mcpClient && llmModel) {
        return { client: mcpClient, model: llmModel };
    }
    if (!initPromise) {
        initPromise = (async () => {
            // Initialize LLM model
            llmModel = await createLLMProviderAsync();
            // Initialize MCP client - connect to same server's MCP endpoint
            mcpClient = new MCPClient({ verbose: false });
            const mcpUrl = process.env.MCP_SERVER_URL || 'http://localhost:3000/mcp';
            await mcpClient.connectHttp({ url: mcpUrl });
        })();
    }
    await initPromise;
    return { client: mcpClient, model: llmModel };
}
function getOrCreateSession(sessionId) {
    let session = sessions.get(sessionId);
    if (!session) {
        session = {
            history: [{ role: 'system', content: DEFAULT_SYSTEM_PROMPT }],
            lastAccess: Date.now(),
        };
        sessions.set(sessionId, session);
    }
    else {
        session.lastAccess = Date.now();
    }
    return session.history;
}
function sendSSE(res, event, data) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}
/**
 * Handle POST /api/chat
 */
export async function handleChat(req, res) {
    const { message, sessionId } = req.body;
    if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'message is required and must be a string' });
        return;
    }
    // Set up SSE response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();
    // Create AbortController for this request
    const currentSessionId = sessionId || `session-${Date.now()}`;
    const abortController = new AbortController();
    activeControllers.set(currentSessionId, abortController);
    try {
        console.error('[Chat] Starting chat request for session:', currentSessionId);
        const { client, model } = await ensureInitialized();
        console.error('[Chat] MCP client and LLM model initialized');
        const session = getOrCreateSession(currentSessionId);
        // Add user message to history
        session.push({ role: 'user', content: message });
        // Get tools from MCP
        console.error('[Chat] Fetching tools from MCP...');
        const tools = await convertMcpToolsToAiTools(client);
        console.error('[Chat] Got', Object.keys(tools).length, 'tools:', Object.keys(tools).join(', '));
        // Track usage
        let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
        let fullText = '';
        // Use streamText for true streaming
        console.error('[Chat] Starting streamText with', session.length, 'messages');
        const result = streamText({
            model,
            messages: session,
            tools,
            maxSteps: 10,
            abortSignal: abortController.signal,
            onStepFinish: (event) => {
                // Handle tool calls
                if (event.toolCalls) {
                    for (const call of event.toolCalls) {
                        sendSSE(res, 'tool_call', {
                            name: call.toolName,
                            args: call.args,
                        });
                    }
                }
                // Handle tool results
                if (event.toolResults) {
                    for (const toolResult of event.toolResults) {
                        const resultObj = toolResult;
                        sendSSE(res, 'tool_result', {
                            name: resultObj.toolName,
                            result: resultObj.result,
                        });
                    }
                }
            },
        });
        // Stream text tokens as they arrive
        console.error('[Chat] Starting to consume textStream...');
        let tokenCount = 0;
        for await (const textPart of result.textStream) {
            if (textPart) {
                tokenCount++;
                fullText += textPart;
                sendSSE(res, 'token', { content: textPart });
            }
        }
        console.error('[Chat] Finished streaming, received', tokenCount, 'token chunks');
        // Get final usage stats (usage is a promise in streamText)
        const finalUsage = await result.usage;
        if (finalUsage) {
            usage = {
                promptTokens: finalUsage.promptTokens,
                completionTokens: finalUsage.completionTokens,
                totalTokens: finalUsage.totalTokens,
            };
        }
        // Add assistant response to history
        session.push({ role: 'assistant', content: fullText });
        // Send done event
        sendSSE(res, 'done', { usage });
        res.end();
    }
    catch (error) {
        // Check if this was an abort
        if (error instanceof Error && error.name === 'AbortError') {
            // Don't send error for intentional cancellation
            res.end();
            return;
        }
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorCode = error instanceof Error && 'code' in error
            ? error.code
            : 'internal_error';
        sendSSE(res, 'error', { code: errorCode, message: errorMessage });
        res.end();
    }
    finally {
        // Clean up the controller
        activeControllers.delete(currentSessionId);
    }
}
/**
 * Clear a session's conversation history
 */
export function clearSession(sessionId) {
    return sessions.delete(sessionId);
}
//# sourceMappingURL=chat-handler.js.map