/**
 * Cancel API Handler
 *
 * POST /api/cancel endpoint to abort in-progress chat generation.
 */

import { Request, Response } from 'express';

// Store of active AbortControllers per session
// This is shared with chat-handler.ts via exports
export const activeControllers = new Map<string, AbortController>();

export interface CancelRequest {
  sessionId: string;
}

/**
 * Handle POST /api/cancel
 */
export function handleCancel(req: Request, res: Response): void {
  const { sessionId } = req.body as CancelRequest;

  if (!sessionId || typeof sessionId !== 'string') {
    res.status(400).json({ error: 'sessionId is required and must be a string' });
    return;
  }

  const controller = activeControllers.get(sessionId);
  if (controller) {
    controller.abort();
    activeControllers.delete(sessionId);
    res.json({ cancelled: true });
  } else {
    // No active generation for this session - that's okay
    res.json({ cancelled: false });
  }
}
