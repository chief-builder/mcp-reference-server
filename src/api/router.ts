/**
 * API Router for the MCP Reference Server
 *
 * Provides REST API endpoints for the web UI and external integrations.
 * Mounted at /api/* in the HTTP transport.
 */

import { Router, Request, Response } from 'express';
import express from 'express';
import { handleChat } from './chat-handler.js';
import { handleCancel } from './cancel-handler.js';
import { createAuthMiddleware, createMockAuthMiddleware } from './auth-middleware.js';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Check if auth should be enabled
 * In development mode (AUTH_ENABLED=false or not set), auth is optional
 */
const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';

/**
 * Check if we're in development mode (bypass auth entirely)
 */
const USE_MOCK_AUTH = process.env.USE_MOCK_AUTH === 'true';

// =============================================================================
// Router
// =============================================================================

/**
 * Create and configure the API router
 */
export function createApiRouter(): Router {
  const router = Router();

  // Parse JSON for API routes
  router.use(express.json());

  /**
   * GET /api/health
   * Health check endpoint for monitoring and load balancers
   * This endpoint is always public (no auth required)
   */
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // Apply authentication middleware
  if (USE_MOCK_AUTH) {
    // Development mode: use mock auth that always succeeds
    router.use(createMockAuthMiddleware());
  } else if (AUTH_ENABLED) {
    // Production mode: require valid Bearer token
    router.use(
      createAuthMiddleware({
        skipPaths: ['/health'], // Already handled above, but listed for clarity
        allowUnauthenticated: false,
      })
    );
  } else {
    // Auth disabled: allow unauthenticated requests but still parse tokens if present
    router.use(
      createAuthMiddleware({
        skipPaths: ['/health'],
        allowUnauthenticated: true,
      })
    );
  }

  /**
   * POST /api/chat
   * Chat endpoint with SSE streaming response
   */
  router.post('/chat', handleChat);

  /**
   * POST /api/cancel
   * Cancel an in-progress chat generation
   */
  router.post('/cancel', handleCancel);

  return router;
}
