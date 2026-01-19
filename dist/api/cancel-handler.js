/**
 * Cancel API Handler
 *
 * POST /api/cancel endpoint to abort in-progress chat generation.
 */
// Store of active AbortControllers per session
// This is shared with chat-handler.ts via exports
export const activeControllers = new Map();
/**
 * Handle POST /api/cancel
 */
export function handleCancel(req, res) {
    const { sessionId } = req.body;
    if (!sessionId || typeof sessionId !== 'string') {
        res.status(400).json({ error: 'sessionId is required and must be a string' });
        return;
    }
    const controller = activeControllers.get(sessionId);
    if (controller) {
        controller.abort();
        activeControllers.delete(sessionId);
        res.json({ cancelled: true });
    }
    else {
        // No active generation for this session - that's okay
        res.json({ cancelled: false });
    }
}
//# sourceMappingURL=cancel-handler.js.map