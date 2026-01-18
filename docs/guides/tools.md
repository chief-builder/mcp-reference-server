---
layout: page
title: Tools Guide
---

# Tools Guide

Tools are the primary way MCP servers expose functionality to clients.

## Tool Definition

A tool consists of:

- **name**: Unique identifier (lowercase_with_underscores)
- **description**: Clear explanation for LLMs
- **inputSchema**: JSON Schema for parameters
- **handler**: Async function that executes the tool
- **annotations**: Optional behavior hints (SEP-1303)

## Tools in This Server

This server includes three example tools:

| Tool | Description |
|------|-------------|
| `tell_fortune` | Get mystical fortunes by category and mood |
| `calculate` | Perform arithmetic operations |
| `roll_dice` | Roll dice using standard notation (e.g., "2d6+3") |

## Tool Registration Example

Here's the actual `tell_fortune` tool from this project:

```typescript
import { ToolRegistry } from 'mcp-reference-server';

const registry = new ToolRegistry();

registry.registerTool({
  name: 'tell_fortune',
  title: 'Fortune Teller',
  description: 'Get a fortune for categories: love, career, health, wealth, general. Moods: optimistic, mysterious, cautious.',
  inputSchema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['love', 'career', 'health', 'wealth', 'general'],
        description: 'Fortune category'
      },
      mood: {
        type: 'string',
        enum: ['optimistic', 'mysterious', 'cautious'],
        description: 'Fortune mood (default: mysterious)'
      }
    },
    required: ['category'],
    additionalProperties: false
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,  // Random fortunes!
    openWorldHint: false
  },
  handler: async ({ category, mood = 'mysterious' }) => {
    const fortune = selectFortune(category, mood);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ category, mood, fortune })
      }]
    };
  }
});
```

## Tool Annotations (SEP-1303)

Annotations provide behavior hints to clients. Here are the annotations for tools in this server:

```typescript
// tell_fortune - random results, no side effects
annotations: {
  readOnlyHint: true,      // No side effects
  destructiveHint: false,  // Doesn't modify data
  idempotentHint: false,   // Random fortunes each call
  openWorldHint: false     // No external APIs
}

// calculate - deterministic, no side effects
annotations: {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,    // Same inputs = same result
  openWorldHint: false
}

// roll_dice - random results, no side effects
annotations: {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,   // Random dice rolls
  openWorldHint: false
}
```

### Annotation Types

| Annotation | Description |
|------------|-------------|
| `readOnlyHint` | Tool has no side effects (safe for automatic execution) |
| `destructiveHint` | Tool may modify or delete data (requires confirmation) |
| `idempotentHint` | Safe to call multiple times with same arguments |
| `openWorldHint` | May access external services or APIs |

## Input Schema

Tools use JSON Schema 2020-12 for input validation:

```typescript
const inputSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'Search query',
      minLength: 1,
      maxLength: 100
    },
    limit: {
      type: 'number',
      description: 'Maximum results',
      minimum: 1,
      maximum: 50,
      default: 10
    },
    filters: {
      type: 'array',
      items: { type: 'string' },
      description: 'Optional filters'
    }
  },
  required: ['query']
};
```

## Tool Results

Tools return content arrays with optional metadata:

### Text Content

```typescript
return {
  content: [{
    type: 'text',
    text: 'Operation completed successfully'
  }]
};
```

### Image Content

```typescript
return {
  content: [{
    type: 'image',
    data: base64EncodedImage,
    mimeType: 'image/png'
  }]
};
```

### Resource Content

```typescript
return {
  content: [{
    type: 'resource',
    resource: {
      uri: 'file:///path/to/file.txt',
      mimeType: 'text/plain',
      text: fileContents
    }
  }]
};
```

### Error Results

```typescript
return {
  content: [{
    type: 'text',
    text: 'Failed to process request'
  }],
  isError: true  // Marks result as an error
};
```

## Content Annotations

Add audience and priority hints:

```typescript
return {
  content: [{
    type: 'text',
    text: 'Detailed technical output...',
    annotations: {
      audience: ['assistant'],  // For AI processing
      priority: 0.8              // Higher = more important
    }
  }, {
    type: 'text',
    text: 'Summary for the user',
    annotations: {
      audience: ['user'],
      priority: 1.0
    }
  }]
};
```

## Tool Registry

For advanced use cases, use the ToolRegistry directly:

```typescript
import { ToolRegistry } from 'mcp-reference-server';

const registry = new ToolRegistry();

// Register tool
registry.registerTool({
  name: 'calculate',
  description: 'Perform calculation',
  inputSchema: { type: 'object', properties: { expression: { type: 'string' } } },
  handler: async (args) => {
    // Implementation
  }
});

// List tools with pagination
const { tools, nextCursor } = registry.listTools(undefined, 50);

// Listen for changes
registry.onToolsChanged(() => {
  console.log('Tools list updated');
});
```

## tools/call Request

Call the `tell_fortune` tool:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "tell_fortune",
    "arguments": {
      "category": "wealth",
      "mood": "optimistic"
    }
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
      "text": "{\"category\":\"wealth\",\"mood\":\"optimistic\",\"fortune\":\"Financial opportunities are heading your way.\"}"
    }]
  }
}
```

## tools/list Request and Response

Request available tools:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}
```

Response from this server:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "calculate",
        "description": "Perform basic arithmetic operations",
        "inputSchema": { "type": "object", "properties": { "operation": {}, "a": {}, "b": {} } },
        "annotations": { "readOnlyHint": true, "idempotentHint": true }
      },
      {
        "name": "roll_dice",
        "description": "Roll dice using standard notation",
        "inputSchema": { "type": "object", "properties": { "notation": {} } },
        "annotations": { "readOnlyHint": true, "idempotentHint": false }
      },
      {
        "name": "tell_fortune",
        "description": "Get a mystical fortune",
        "inputSchema": { "type": "object", "properties": { "category": {}, "mood": {} } },
        "annotations": { "readOnlyHint": true, "idempotentHint": false }
      }
    ]
  }
}
```

## Related

- [Protocol Guide](protocol) - JSON-RPC format
- [Completions Guide](completions) - Argument auto-complete
- [API Reference](../api/tools) - Tools exports
