/**
 * API Router for the MCP Reference Server
 *
 * Provides REST API endpoints for the web UI and external integrations.
 * Mounted at /api/* in the HTTP transport.
 */
import { Router } from 'express';
/**
 * Create and configure the API router
 */
export function createApiRouter() {
    const router = Router();
    /**
     * GET /api/health
     * Health check endpoint for monitoring and load balancers
     */
    router.get('/health', (_req, res) => {
        res.json({ status: 'ok' });
    });
    return router;
}
//# sourceMappingURL=router.js.map