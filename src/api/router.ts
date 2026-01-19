/**
 * API Router for the MCP Reference Server
 *
 * Provides REST API endpoints for the web UI and external integrations.
 * Mounted at /api/* in the HTTP transport.
 */

import { Router, Request, Response } from 'express';
import express from 'express';
import { handleChat } from './chat-handler.js';

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
   */
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  /**
   * POST /api/chat
   * Chat endpoint with SSE streaming response
   */
  router.post('/chat', handleChat);

  return router;
}
