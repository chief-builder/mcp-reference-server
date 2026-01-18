---
layout: page
title: HTTP Server Example
---

# HTTP Server Example

A complete MCP server using HTTP transport with SSE streaming.

## Complete Example

```typescript
import {
  MCPServer,
  HttpTransport,
  loadConfig,
  createShutdownManager,
} from 'mcp-reference-server';

// Load configuration from environment
const config = loadConfig({
  transport: 'http',
  httpPort: 3000,
});

// Create server
const server = new MCPServer({
  name: 'api-server',
  version: '1.0.0',
  description: 'An API gateway MCP server',
});

// Register tools
server.tool(
  'fetch_data',
  'Fetch data from an external API',
  {
    type: 'object',
    properties: {
      endpoint: {
        type: 'string',
        description: 'API endpoint to fetch',
      },
      method: {
        type: 'string',
        enum: ['GET', 'POST'],
        default: 'GET',
      },
    },
    required: ['endpoint'],
  },
  async ({ endpoint, method = 'GET' }) => {
    const response = await fetch(endpoint, { method });
    const data = await response.json();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(data, null, 2),
      }],
    };
  },
  {
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  }
);

server.tool(
  'get_time',
  'Get current server time',
  { type: 'object', properties: {} },
  async () => ({
    content: [{
      type: 'text',
      text: new Date().toISOString(),
    }],
  }),
  {
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  }
);

// Create HTTP transport
const transport = new HttpTransport({
  port: config.httpPort,
  host: config.httpHost,
  sseEnabled: true,
  sessionTimeout: 3600000, // 1 hour
});

// Setup graceful shutdown
const shutdown = createShutdownManager({
  timeout: 10000,
  signals: ['SIGINT', 'SIGTERM'],
});

shutdown.registerHandler(async () => {
  await server.close();
  console.log('Server closed');
});

// Start server
await server.connect(transport);
console.log(`API server running on http://${config.httpHost}:${config.httpPort}`);
```

## Running the Server

```bash
# Development
MCP_HTTP_PORT=3000 npx tsx api-server.ts

# Production
MCP_HTTP_PORT=3000 node dist/api-server.js
```

## Client Requests

### Initialize Session

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-11-25",
      "capabilities": {},
      "clientInfo": { "name": "curl", "version": "1.0.0" }
    }
  }'
```

### Send Initialized Notification

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "method": "notifications/initialized"
  }'
```

### Call a Tool

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "get_time",
      "arguments": {}
    }
  }'
```

### Connect to SSE Stream

```bash
curl -N http://localhost:3000/mcp/sse \
  -H "Mcp-Session-Id: <session-id>"
```

### Health Check

```bash
curl http://localhost:3000/health
```

## With OAuth Authentication

```typescript
import { OAuthValidator, HttpTransport } from 'mcp-reference-server';

const validator = new OAuthValidator({
  issuer: 'https://auth.example.com',
  audience: 'my-api-server',
});

const transport = new HttpTransport({
  port: 3000,
  authValidator: validator,
});
```

## Environment Variables

```bash
MCP_TRANSPORT=http
MCP_HTTP_PORT=3000
MCP_HTTP_HOST=0.0.0.0
MCP_SSE_ENABLED=true
MCP_SESSION_TIMEOUT=3600000
```

## Key Points

1. **SSE streaming**: Enable for real-time notifications
2. **Session management**: Track clients via `Mcp-Session-Id` header
3. **Graceful shutdown**: Use ShutdownManager for clean exit
4. **Health endpoints**: Available at `/health`, `/health/ready`, `/health/live`

## Related

- [Transports Guide](../guides/transports) - Transport concepts
- [Authentication Guide](../guides/authentication) - OAuth setup
- [stdio Server Example](stdio-server) - CLI transport
