#!/usr/bin/env node
/**
 * MCP Reference Server CLI
 * Starts the server with configuration from environment variables
 */

import { loadConfig } from './config.js';
import { MCPServer } from './server.js';

async function main(): Promise<void> {
  try {
    const config = loadConfig();
    const server = new MCPServer({ config });

    // Start the server (installs signal handlers internally)
    await server.start();

    console.error(`MCP Reference Server started`);
    console.error(`  Transport: ${config.transport}`);
    if (config.transport === 'http' || config.transport === 'both') {
      console.error(`  HTTP: http://${config.host}:${config.port}`);
    }
    if (config.transport === 'stdio' || config.transport === 'both') {
      console.error(`  STDIO: enabled`);
    }
  } catch (error) {
    console.error('Failed to start MCP server:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
