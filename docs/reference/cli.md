---
layout: page
title: CLI Reference
---

# CLI Reference

Command-line interface for MCP Reference Server.

## Installation

```bash
# Global installation
npm install -g mcp-reference-server

# Or use npx
npx mcp-reference-server
```

## Basic Usage

```bash
# Start server with default settings
mcp-reference-server

# Start with environment variables
MCP_TRANSPORT=http MCP_PORT=8080 mcp-reference-server

# Start with debug logging
MCP_DEBUG=true mcp-reference-server
```

## Transport Modes

### stdio Transport (Default)

For CLI integration and local processes:

```bash
mcp-reference-server
# Reads JSON-RPC from stdin, writes to stdout
```

### HTTP Transport

For web applications and remote access:

```bash
MCP_TRANSPORT=http MCP_PORT=3000 mcp-reference-server
# Starts HTTP server on specified port
```

### Both Transports

Run both simultaneously:

```bash
MCP_TRANSPORT=both MCP_PORT=3000 mcp-reference-server
# stdio + HTTP on port 3000
```

## Common Options via Environment

| Variable | Description |
|----------|-------------|
| `MCP_TRANSPORT` | `stdio`, `http`, or `both` |
| `MCP_PORT` | HTTP port number |
| `MCP_HOST` | HTTP host address |
| `MCP_DEBUG` | Enable debug logging |
| `MCP_LOG_LEVEL` | Set log verbosity |

## Using with Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "reference-server": {
      "command": "mcp-reference-server"
    }
  }
}
```

Or with custom settings:

```json
{
  "mcpServers": {
    "reference-server": {
      "command": "mcp-reference-server",
      "env": {
        "MCP_DEBUG": "true",
        "MCP_LOG_LEVEL": "debug"
      }
    }
  }
}
```

## Using with MCP Inspector

Test the server interactively:

```bash
# Direct invocation
npx @modelcontextprotocol/inspector mcp-reference-server

# With HTTP transport
MCP_TRANSPORT=http MCP_PORT=3000 npx @modelcontextprotocol/inspector
# Then open http://localhost:3000 in browser
```

## Development Mode

For development with hot reloading:

```bash
# Using tsx for TypeScript
npm run dev

# Equivalent to:
npx tsx src/cli.ts
```

## Custom Entry Point

Create a custom server script:

```typescript
// my-server.ts
import { MCPServer, StdioTransport } from 'mcp-reference-server';

const server = new MCPServer({
  name: 'my-custom-server',
  version: '1.0.0',
});

// Add your tools...

const transport = new StdioTransport();
await server.connect(transport);
```

Run it:

```bash
npx tsx my-server.ts
```

## Signals

The server handles these signals for graceful shutdown:

| Signal | Behavior |
|--------|----------|
| `SIGINT` | Graceful shutdown (Ctrl+C) |
| `SIGTERM` | Graceful shutdown |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Normal exit |
| `1` | Error during startup or operation |

## Logging Output

- **stdio transport**: Logs go to stderr (stdout is for MCP messages)
- **HTTP transport**: Logs go to stdout

Control log format:

```bash
# JSON format (default in production)
MCP_LOG_LEVEL=info mcp-reference-server

# Debug format (more verbose)
MCP_DEBUG=true mcp-reference-server
```

## Health Checks (HTTP)

When using HTTP transport:

```bash
# Overall health
curl http://localhost:3000/health

# Readiness probe (for load balancers)
curl http://localhost:3000/health/ready

# Liveness probe (for orchestrators)
curl http://localhost:3000/health/live
```

## Examples

### Production HTTP Server

```bash
MCP_TRANSPORT=http \
MCP_PORT=3000 \
MCP_HOST=0.0.0.0 \
MCP_LOG_LEVEL=info \
MCP_REQUEST_TIMEOUT_MS=30000 \
mcp-reference-server
```

### Debug Session

```bash
MCP_DEBUG=true \
MCP_LOG_LEVEL=debug \
mcp-reference-server
```

### With Authentication

```bash
MCP_TRANSPORT=http \
MCP_PORT=3000 \
MCP_AUTH0_DOMAIN=your-tenant.auth0.com \
MCP_AUTH0_AUDIENCE=https://api.example.com \
mcp-reference-server
```

## Related

- [Installation](../getting-started/installation) - Setup guide
- [Configuration](../getting-started/configuration) - All options
- [Environment Variables](environment) - Complete variable list
