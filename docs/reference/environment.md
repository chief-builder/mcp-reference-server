---
layout: page
title: Environment Variables
---

# Environment Variables Reference

Complete list of environment variables for configuring MCP Reference Server.

## Server Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MCP_PORT` | number | `3000` | HTTP server port (1-65535) |
| `MCP_HOST` | string | `0.0.0.0` | HTTP server host address |
| `MCP_TRANSPORT` | string | `both` | Transport type: `stdio`, `http`, or `both` |
| `MCP_STATELESS_MODE` | boolean | `false` | Enable stateless mode (no session tracking) |

## Pagination

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MCP_PAGINATION_DEFAULT` | number | `50` | Default page size for lists |
| `MCP_PAGE_SIZE` | number | `50` | Alias for pagination default |
| `MCP_PAGINATION_MAX` | number | `200` | Maximum allowed page size |

## Timeouts

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MCP_REQUEST_TIMEOUT_MS` | number | `60000` | Request timeout in milliseconds |
| `MCP_SHUTDOWN_TIMEOUT_MS` | number | `30000` | Graceful shutdown timeout |
| `MCP_PROGRESS_INTERVAL_MS` | number | `100` | Progress notification interval |

## Logging & Debug

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MCP_DEBUG` | boolean | `false` | Enable debug mode |
| `MCP_LOG_LEVEL` | string | `info` | Log level (see values below) |

### Log Levels

- `debug` - Detailed debugging information
- `info` - Normal operational messages
- `notice` - Normal but significant conditions
- `warning` - Warning conditions
- `error` - Error conditions
- `critical` - Critical conditions
- `alert` - Action must be taken immediately
- `emergency` - System is unusable

## Authentication (Auth0)

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MCP_AUTH0_DOMAIN` | string | - | Auth0 tenant domain |
| `MCP_AUTH0_AUDIENCE` | string | - | Auth0 API audience |
| `MCP_AUTH0_CLIENT_ID` | string | - | Auth0 client ID |
| `MCP_M2M_CLIENT_SECRET` | string | - | M2M client secret |

## OpenTelemetry

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | string | - | OTLP exporter endpoint |
| `OTEL_SERVICE_NAME` | string | `mcp-server` | Service name for telemetry |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | string | - | Protocol: `grpc` or `http/protobuf` |
| `MCP_TELEMETRY_ENABLED` | boolean | `false` | Enable telemetry collection |

## Example .env File

```bash
# Server
MCP_PORT=3000
MCP_HOST=0.0.0.0
MCP_TRANSPORT=http

# Pagination
MCP_PAGINATION_DEFAULT=50
MCP_PAGINATION_MAX=200

# Timeouts
MCP_REQUEST_TIMEOUT_MS=60000
MCP_SHUTDOWN_TIMEOUT_MS=30000

# Logging
MCP_DEBUG=true
MCP_LOG_LEVEL=debug

# Auth0 (optional)
MCP_AUTH0_DOMAIN=your-tenant.auth0.com
MCP_AUTH0_AUDIENCE=https://api.example.com
MCP_AUTH0_CLIENT_ID=your-client-id
MCP_M2M_CLIENT_SECRET=your-secret

# OpenTelemetry (optional)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=my-mcp-server
MCP_TELEMETRY_ENABLED=true
```

## Boolean Values

Boolean environment variables accept:

- `true` or `1` for enabled
- `false` or `0` for disabled

## Loading Configuration

```typescript
import { loadConfig, getConfig } from 'mcp-reference-server';

// Load from environment
const config = loadConfig();

// Access specific values
console.log(config.port);
console.log(config.debug);
console.log(config.logLevel);

// Singleton pattern
const config1 = getConfig();
const config2 = getConfig();
// config1 === config2
```

## Related

- [Configuration Guide](../getting-started/configuration) - Setup overview
- [Authentication Guide](../guides/authentication) - OAuth configuration
- [Observability Guide](../guides/observability) - Telemetry setup
