/**
 * MCP Reference Server - Entry point and public exports
 * Production-quality reference implementation targeting 2025-11-25 specification
 */

// Main server
export {
  MCPServer,
  ShutdownManager,
  createShutdownManager,
  type ShutdownManagerOptions,
  type MCPServerOptions,
  type CleanupHandler,
} from './server.js';

// Configuration
export { loadConfig, type Config } from './config.js';

// Protocol
export * from './protocol/jsonrpc.js';
export * from './protocol/lifecycle.js';
export * from './protocol/capabilities.js';
export * from './protocol/errors.js';

// Transport
export * from './transport/stdio.js';
export * from './transport/http.js';
export * from './transport/session.js';
export * from './transport/sse.js';

// Auth
export * from './auth/oauth.js';
export * from './auth/pkce.js';
export * from './auth/discovery.js';
export * from './auth/tokens.js';
// m2m.js re-exports from extensions/oauth-m2m.js - skip to avoid duplicate exports

// Tools
export * from './tools/registry.js';
export * from './tools/executor.js';

// Completions
export * from './completions/handler.js';

// Logging
export * from './logging/handler.js';

// Extensions
export * from './extensions/framework.js';
export * from './extensions/oauth-m2m.js';

// Observability
export * from './observability/telemetry.js';
export * from './observability/metrics.js';
export * from './observability/health.js';
