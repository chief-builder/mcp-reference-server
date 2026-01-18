---
layout: page
title: Quick Start
---

# Quick Start

Get started with the MCP Reference Server.

## Running This Server

This server includes three example tools (`tell_fortune`, `calculate`, `roll_dice`) ready to use:

```bash
# Start the server (stdio mode)
npm run dev

# Or start with HTTP transport
MCP_TRANSPORT=http MCP_PORT=3000 npm run dev
```

## Example Tool Call

Once running, you can call the `tell_fortune` tool:

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

Response:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"category\":\"career\",\"mood\":\"optimistic\",\"fortune\":\"Your hard work is about to pay off.\"}"
    }]
  }
}
```

## Testing with MCP Inspector

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) provides a visual interface for testing:

```bash
npx @modelcontextprotocol/inspector mcp-reference-server
```

## Available Tools

| Tool | Description | Example Arguments |
|------|-------------|-------------------|
| `tell_fortune` | Get mystical fortunes | `{ "category": "love", "mood": "optimistic" }` |
| `calculate` | Arithmetic operations | `{ "operation": "add", "a": 5, "b": 3 }` |
| `roll_dice` | Roll dice (D&D notation) | `{ "notation": "2d6+3" }` |

## Calculator Example

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "calculate",
    "arguments": { "operation": "multiply", "a": 6, "b": 7 }
  }
}
```

Response: `{"result": 42, "expression": "6 × 7 = 42"}`

## Dice Roller Example

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "roll_dice",
    "arguments": { "notation": "2d6+5" }
  }
}
```

Response: `{"notation": "2d6+5", "rolls": [4, 3], "modifier": 5, "total": 12}`

## Next Steps

- [Configuration](configuration) - Environment variables
- [Transports Guide](../guides/transports) - stdio vs HTTP
- [Tools Guide](../guides/tools) - Advanced tool features
