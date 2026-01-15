/**
 * Environment configuration loader with Zod validation
 */

import { z } from 'zod';

/**
 * Configuration schema with validation rules
 */
export const ConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3000),
  host: z.string().default('0.0.0.0'),
  transport: z.enum(['stdio', 'http', 'both']).default('both'),
  statelessMode: z.boolean().default(false),
  pageSize: z.number().int().min(1).max(1000).default(50),
  requestTimeoutMs: z.number().int().min(0).default(60000),
  shutdownTimeoutMs: z.number().int().min(0).default(30000),
  progressIntervalMs: z.number().int().min(0).default(100),
  debug: z.boolean().default(false),
  logLevel: z
    .enum(['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency'])
    .default('info'),
  auth0: z
    .object({
      domain: z.string().optional(),
      audience: z.string().optional(),
      clientId: z.string().optional(),
    })
    .default({}),
  m2mClientSecret: z.string().optional(),
  otelEndpoint: z.string().optional(),
});

/**
 * Configuration type inferred from schema
 */
export type Config = z.infer<typeof ConfigSchema>;

/**
 * Parse a boolean from environment variable string
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parse an integer from environment variable string
 */
function parseInteger(value: string | undefined): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? undefined : parsed;
}

/**
 * Load configuration from environment variables
 */
export function loadConfig(): Config {
  const rawConfig = {
    port: parseInteger(process.env['MCP_PORT']),
    host: process.env['MCP_HOST'] || undefined,
    transport: process.env['MCP_TRANSPORT'] || undefined,
    statelessMode: parseBoolean(process.env['MCP_STATELESS_MODE'], false),
    pageSize: parseInteger(process.env['MCP_PAGE_SIZE']),
    requestTimeoutMs: parseInteger(process.env['MCP_REQUEST_TIMEOUT_MS']),
    shutdownTimeoutMs: parseInteger(process.env['MCP_SHUTDOWN_TIMEOUT_MS']),
    progressIntervalMs: parseInteger(process.env['MCP_PROGRESS_INTERVAL_MS']),
    debug: parseBoolean(process.env['MCP_DEBUG'], false),
    logLevel: process.env['MCP_LOG_LEVEL'] || undefined,
    auth0: {
      domain: process.env['MCP_AUTH0_DOMAIN'] || undefined,
      audience: process.env['MCP_AUTH0_AUDIENCE'] || undefined,
      clientId: process.env['MCP_AUTH0_CLIENT_ID'] || undefined,
    },
    m2mClientSecret: process.env['MCP_M2M_CLIENT_SECRET'] || undefined,
    otelEndpoint: process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] || undefined,
  };

  // Clean auth0 object - remove undefined values
  const cleanedAuth0 = Object.fromEntries(
    Object.entries(rawConfig.auth0).filter(([, v]) => v !== undefined)
  );

  // Build config object, removing undefined top-level values so defaults apply
  const configInput: Record<string, unknown> = {};

  if (rawConfig.port !== undefined) configInput.port = rawConfig.port;
  if (rawConfig.host !== undefined) configInput.host = rawConfig.host;
  if (rawConfig.transport !== undefined) configInput.transport = rawConfig.transport;
  configInput.statelessMode = rawConfig.statelessMode;
  if (rawConfig.pageSize !== undefined) configInput.pageSize = rawConfig.pageSize;
  if (rawConfig.requestTimeoutMs !== undefined) configInput.requestTimeoutMs = rawConfig.requestTimeoutMs;
  if (rawConfig.shutdownTimeoutMs !== undefined) configInput.shutdownTimeoutMs = rawConfig.shutdownTimeoutMs;
  if (rawConfig.progressIntervalMs !== undefined) configInput.progressIntervalMs = rawConfig.progressIntervalMs;
  configInput.debug = rawConfig.debug;
  if (rawConfig.logLevel !== undefined) configInput.logLevel = rawConfig.logLevel;
  if (Object.keys(cleanedAuth0).length > 0) configInput.auth0 = cleanedAuth0;
  if (rawConfig.m2mClientSecret !== undefined) configInput.m2mClientSecret = rawConfig.m2mClientSecret;
  if (rawConfig.otelEndpoint !== undefined) configInput.otelEndpoint = rawConfig.otelEndpoint;

  return ConfigSchema.parse(configInput);
}

/**
 * Singleton config instance
 */
let config: Config | null = null;

/**
 * Get the current configuration (singleton)
 * Loads from environment on first call
 */
export function getConfig(): Config {
  if (!config) {
    config = loadConfig();
  }
  return config;
}

/**
 * Force reload configuration from environment
 */
export function reloadConfig(): Config {
  config = loadConfig();
  return config;
}

/**
 * Reset config singleton (for testing)
 */
export function resetConfig(): void {
  config = null;
}
