/**
 * Chat API Handler
 *
 * POST /api/chat endpoint that integrates with the Agent class.
 * Returns SSE stream with token, tool_call, tool_result, done, and error events.
 */
import { Request, Response } from 'express';
export interface ChatRequest {
    message: string;
    sessionId?: string;
}
/**
 * Handle POST /api/chat
 */
export declare function handleChat(req: Request, res: Response): Promise<void>;
/**
 * Clear a session's conversation history
 */
export declare function clearSession(sessionId: string): boolean;
//# sourceMappingURL=chat-handler.d.ts.map