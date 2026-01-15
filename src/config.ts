/**
 * Environment configuration loader
 */

export interface Config {
  // Server
  serverName: string;
  serverVersion: string;
  port: number;
  host: string;

  // Transport
  transport: 'stdio' | 'http';

  // Auth
  authEnabled: boolean;
  oauthIssuer: string | undefined;
  oauthClientId: string | undefined;
  oauthClientSecret: string | undefined;

  // Observability
  otelEnabled: boolean;
  otelEndpoint: string | undefined;
  otelServiceName: string;

  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export function loadConfig(): Config {
  return {
    serverName: process.env['MCP_SERVER_NAME'] ?? 'mcp-reference-server',
    serverVersion: process.env['MCP_SERVER_VERSION'] ?? '0.1.0',
    port: parseInt(process.env['MCP_PORT'] ?? '3000', 10),
    host: process.env['MCP_HOST'] ?? '0.0.0.0',
    transport: (process.env['MCP_TRANSPORT'] as Config['transport']) ?? 'stdio',
    authEnabled: process.env['MCP_AUTH_ENABLED'] === 'true',
    oauthIssuer: process.env['MCP_OAUTH_ISSUER'],
    oauthClientId: process.env['MCP_OAUTH_CLIENT_ID'],
    oauthClientSecret: process.env['MCP_OAUTH_CLIENT_SECRET'],
    otelEnabled: process.env['MCP_OTEL_ENABLED'] === 'true',
    otelEndpoint: process.env['MCP_OTEL_ENDPOINT'],
    otelServiceName: process.env['MCP_OTEL_SERVICE_NAME'] ?? 'mcp-reference-server',
    logLevel: (process.env['MCP_LOG_LEVEL'] as Config['logLevel']) ?? 'info',
  };
}
