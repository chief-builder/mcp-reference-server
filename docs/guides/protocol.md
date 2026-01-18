---
layout: page
title: Protocol Guide
---

# Protocol Guide

The Model Context Protocol (MCP) uses JSON-RPC 2.0 for communication between clients and servers.

## Message Format

All messages follow the JSON-RPC 2.0 specification:

### Request

Example calling the `tell_fortune` tool from this server:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "tell_fortune",
    "arguments": { "category": "career", "mood": "optimistic" }
  }
}
```

### Response

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"category\":\"career\",\"mood\":\"optimistic\",\"fortune\":\"Your dedication will be recognized soon.\"}"
    }]
  }
}
```

### Notification

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized"
}
```

## Lifecycle States

The server transitions through these states:

```
uninitialized → initializing → ready → shutting_down
```

| State | Description |
|-------|-------------|
| `uninitialized` | Server started, awaiting `initialize` request |
| `initializing` | Received `initialize`, awaiting `initialized` notification |
| `ready` | Fully operational, handling requests |
| `shutting_down` | Shutdown initiated, rejecting new requests |

## Initialization Handshake

```
Client                    Server
   |                         |
   |-- initialize ---------> |  (state: uninitialized → initializing)
   |<-------- result --------|
   |                         |
   |-- notifications/initialized -->|  (state: initializing → ready)
   |                         |
   |<-- tools/list --------->|  (normal operations)
```

### Initialize Request

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-11-25",
    "capabilities": {},
    "clientInfo": { "name": "test-client", "version": "1.0.0" }
  }
}
```

### Initialize Response

This server responds with:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-11-25",
    "capabilities": {
      "tools": { "listChanged": true },
      "completions": {}
    },
    "serverInfo": {
      "name": "mcp-reference-server",
      "version": "1.0.0"
    }
  }
}
```

## Capabilities

Capabilities determine available features for the session.

### Server Capabilities

This server advertises these capabilities:

```typescript
// Capabilities returned by this server
{
  tools: { listChanged: true },
  completions: {}
}
```

## Supported Methods

This server supports these methods:

| Method | Description |
|--------|-------------|
| `initialize` | Initialize the connection |
| `tools/list` | List available tools |
| `tools/call` | Execute a tool |
| `completion/complete` | Get argument completions |

## Error Codes

Standard JSON-RPC 2.0 error codes:

| Code | Name | Description |
|------|------|-------------|
| -32700 | Parse error | Invalid JSON |
| -32600 | Invalid Request | Not a valid Request object |
| -32601 | Method not found | Method does not exist |
| -32602 | Invalid params | Invalid method parameters |
| -32603 | Internal error | Internal JSON-RPC error |

See [Error Codes Reference](../reference/error-codes) for MCP-specific codes.

## Related

- [Transports Guide](transports) - Communication channels
- [Tools Guide](tools) - Tool registration and calling
- [Error Codes Reference](../reference/error-codes) - Complete error list
