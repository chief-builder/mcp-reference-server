---
layout: page
title: Home
---

# MCP Reference Server

A learning project implementing the Model Context Protocol (MCP) 2025-11-25 specification.

## What This Project Does

This is a complete MCP server implementation with three example tools:

| Tool | Description |
|------|-------------|
| `tell_fortune` | Get mystical fortunes (categories: love, career, health, wealth, general) |
| `calculate` | Perform arithmetic operations (add, subtract, multiply, divide) |
| `roll_dice` | Roll dice using D&D notation (e.g., "2d6+3") |

## Features

- **Full Protocol Support**: JSON-RPC 2.0 message format with lifecycle management
- **Dual Transport**: stdio for CLI integration, HTTP/SSE for web applications
- **Tools Framework**: SEP-1303 annotations, execution control, auto-complete
- **Observability**: OpenTelemetry traces/metrics, structured logging, health endpoints
- **Type Safety**: Full TypeScript with Zod runtime validation
- **1710 Tests**: Comprehensive test coverage

## Quick Start

```bash
# Clone and install
git clone https://github.com/chiefbuilder/mcp-reference-server.git
cd mcp-reference-server
npm install

# Run the server
npm run dev
```

Then call a tool:

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

## Documentation

### Getting Started
- [Installation](getting-started/installation) - Requirements and setup
- [Quick Start](getting-started/quick-start) - Your first MCP server
- [Configuration](getting-started/configuration) - Environment variables

### Guides
- [Protocol](guides/protocol) - JSON-RPC 2.0, lifecycle, capabilities
- [Transports](guides/transports) - stdio vs HTTP, SSE, sessions
- [Authentication](guides/authentication) - OAuth 2.1, PKCE, M2M
- [Tools](guides/tools) - Creating custom tools
- [Completions](guides/completions) - Argument auto-complete
- [Observability](guides/observability) - Telemetry, metrics, health

### API Reference
- [Protocol](api/protocol) - Protocol module exports
- [Transport](api/transport) - Transport module exports
- [Auth](api/auth) - Auth module exports
- [Tools](api/tools) - Tools module exports
- [Server](api/server) - Server and config exports

### Examples
- [stdio Server](examples/stdio-server) - CLI transport example
- [HTTP Server](examples/http-server) - HTTP transport example
- [Custom Tool](examples/custom-tool) - Building tools

### Reference
- [Environment Variables](reference/environment) - All MCP_* variables
- [Error Codes](reference/error-codes) - JSON-RPC and MCP errors
- [CLI](reference/cli) - Command line usage

## Requirements

- Node.js 20.0.0 or higher
- TypeScript 5.6+ (for development)

## External References

- [MCP Specification](https://spec.modelcontextprotocol.io/) - Official MCP specification
- [MCP GitHub](https://github.com/modelcontextprotocol) - Official MCP repositories
- [MCP Inspector](https://github.com/modelcontextprotocol/inspector) - Testing tool

## License

MIT - This is a learning project for understanding the MCP protocol.
