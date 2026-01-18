---
layout: page
title: Transports Guide
---

# Transports Guide

MCP supports two transport mechanisms: stdio and HTTP with SSE.

## Transport Comparison

| Feature | stdio | HTTP |
|---------|-------|------|
| Use case | CLI tools, local processes | Web apps, remote servers |
| Sessions | Single implicit session | Multiple concurrent sessions |
| Streaming | Not applicable | Server-Sent Events (SSE) |
| Authentication | Process isolation | OAuth 2.1 |
| Setup complexity | Low | Medium |

## stdio Transport

Standard input/output for local process communication.

### Usage

```typescript
import { McpServer, StdioTransport } from 'mcp-reference-server';

const server = new McpServer({ name: 'my-server', version: '1.0.0' });
const transport = new StdioTransport();
await server.connect(transport);
```

### Message Format

Newline-delimited JSON over stdin/stdout:

```
{"jsonrpc":"2.0","id":1,"method":"initialize",...}\n
{"jsonrpc":"2.0","id":1,"result":{...}}\n
```

### When to Use

- Claude Desktop integration
- CLI applications
- Local development
- Single-client scenarios

## HTTP Transport

RESTful endpoints with optional SSE streaming.

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | POST | JSON-RPC requests |
| `/mcp/sse` | GET | SSE event stream |
| `/health` | GET | Health check |
| `/health/ready` | GET | Readiness probe |
| `/health/live` | GET | Liveness probe |

### Usage

```typescript
import { McpServer, HttpTransport } from 'mcp-reference-server';

const server = new McpServer({ name: 'my-server', version: '1.0.0' });
const transport = new HttpTransport({
  port: 3000,
  host: '127.0.0.1',
});
await server.connect(transport);
```

### Session Management

HTTP sessions are tracked via session IDs:

```typescript
// Session ID header
Mcp-Session-Id: abc123

// Create session on initialize
POST /mcp
{ "jsonrpc": "2.0", "method": "initialize", ... }

// Response includes session ID
Mcp-Session-Id: generated-session-id
```

### SSE Streaming

Real-time event delivery for long-running operations:

```typescript
// Client connects to SSE endpoint
GET /mcp/sse
Mcp-Session-Id: abc123

// Server sends events
event: message
data: {"jsonrpc":"2.0","method":"notifications/progress",...}

event: message
data: {"jsonrpc":"2.0","method":"notifications/tools/listChanged",...}
```

### SSE Reconnection

Clients can resume from the last received event:

```typescript
// Reconnect with last event ID
GET /mcp/sse
Mcp-Session-Id: abc123
Last-Event-ID: 42

// Server replays missed events
```

## Session Lifecycle

```
        ┌─────────────┐
        │   Create    │
        │   Session   │
        └──────┬──────┘
               │ initialize
               ▼
        ┌─────────────┐
        │   Active    │◄──────┐
        │   Session   │       │ requests
        └──────┬──────┘───────┘
               │ shutdown/timeout
               ▼
        ┌─────────────┐
        │   Closed    │
        │   Session   │
        └─────────────┘
```

### Session Timeouts

Sessions expire after inactivity:

```typescript
const transport = new HttpTransport({
  sessionTimeout: 3600000, // 1 hour
});
```

## Configuration

### Environment Variables

```bash
# Transport selection
MCP_TRANSPORT=http

# HTTP settings
MCP_HTTP_PORT=3000
MCP_HTTP_HOST=0.0.0.0

# SSE settings
MCP_SSE_ENABLED=true
MCP_SESSION_TIMEOUT=3600000
```

### Programmatic

```typescript
const transport = new HttpTransport({
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '127.0.0.1',
  sseEnabled: true,
  sessionTimeout: 60 * 60 * 1000,
});
```

## Related

- [Protocol Guide](protocol) - Message format
- [Authentication Guide](authentication) - OAuth for HTTP
- [Configuration](../getting-started/configuration) - Environment variables
