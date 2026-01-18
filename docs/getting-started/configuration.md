---
layout: page
title: Configuration
---

# Configuration

MCP Reference Server is configured via environment variables and programmatic options.

## Environment Variables

### Core Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_SERVER_NAME` | Server name for identification | `mcp-reference-server` |
| `MCP_SERVER_VERSION` | Server version string | `1.0.0` |
| `MCP_TRANSPORT` | Transport type: `stdio` or `http` | `stdio` |

### HTTP Transport

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_HTTP_PORT` | HTTP server port | `3000` |
| `MCP_HTTP_HOST` | HTTP server host | `127.0.0.1` |
| `MCP_SSE_ENABLED` | Enable SSE streaming | `true` |
| `MCP_SESSION_TIMEOUT` | Session timeout (ms) | `3600000` |

### Authentication

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_AUTH_ENABLED` | Enable OAuth authentication | `false` |
| `MCP_AUTH_ISSUER` | OAuth issuer URL | - |
| `MCP_AUTH_CLIENT_ID` | OAuth client ID | - |
| `MCP_AUTH_CLIENT_SECRET` | OAuth client secret | - |
| `MCP_AUTH_SCOPES` | Required scopes (comma-separated) | - |

### Observability

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_TELEMETRY_ENABLED` | Enable OpenTelemetry | `false` |
| `MCP_DEBUG` | Enable debug logging | `false` |
| `MCP_LOG_LEVEL` | Log level: debug, info, warn, error | `info` |
| `OTEL_SERVICE_NAME` | OpenTelemetry service name | `mcp-server` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP exporter endpoint | - |

## Programmatic Configuration

```typescript
import { McpServer, loadConfig } from 'mcp-reference-server';

const config = loadConfig({
  // Override environment variables
  serverName: 'custom-server',
  transport: 'http',
  httpPort: 8080,
});

const server = new McpServer({
  name: config.serverName,
  version: config.serverVersion,
});
```

## .env File

Create a `.env` file in your project root:

```bash
# Server
MCP_SERVER_NAME=my-mcp-server
MCP_TRANSPORT=http
MCP_HTTP_PORT=3000

# Auth (optional)
MCP_AUTH_ENABLED=true
MCP_AUTH_ISSUER=https://auth.example.com

# Observability (optional)
MCP_DEBUG=true
MCP_LOG_LEVEL=debug
```

## Next Steps

- [Environment Reference](../reference/environment) - Complete variable list
- [Authentication Guide](../guides/authentication) - OAuth setup
- [Observability Guide](../guides/observability) - Telemetry configuration
