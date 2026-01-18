---
layout: page
title: Completions Guide
---

# Completions Guide

Completions provide argument auto-complete suggestions for tools.

## Overview

When users type tool arguments, clients can request completions:

```
User types: tell_fortune --category=l
Client requests: completion/complete for category argument
Server returns: ["love"]
```

## Completion Handler

The `CompletionHandler` manages completion providers:

```typescript
import { CompletionHandler } from 'mcp-reference-server';

const handler = new CompletionHandler();
```

## Simple API: Argument Providers

Register completions for specific tool arguments:

```typescript
// Static values
handler.registerArgumentProvider('search', 'type', () => [
  'files',
  'folders',
  'all'
]);

// Dynamic completions based on prefix
handler.registerArgumentProvider('search', 'path', (prefix) => {
  // Filter directories matching prefix
  return getDirectories().filter(d =>
    d.toLowerCase().startsWith(prefix.toLowerCase())
  );
});

// Async provider
handler.registerArgumentProvider('users', 'name', async (prefix) => {
  const users = await fetchUsers();
  return users
    .map(u => u.name)
    .filter(n => n.toLowerCase().startsWith(prefix.toLowerCase()));
});
```

## Full API: Custom Providers

For advanced use cases, register full providers:

```typescript
handler.registerProvider('ref/tool', 'advanced_tool', async (request) => {
  const { argument } = request;

  // Custom logic based on argument name
  if (argument.name === 'format') {
    return {
      completion: {
        values: ['json', 'xml', 'csv'],
        hasMore: false
      }
    };
  }

  return { completion: { values: [] } };
});
```

## Handling Requests

```typescript
const result = await handler.handle({
  ref: { type: 'ref/tool', name: 'search' },
  argument: { name: 'type', value: 'f' }
});

// result.completion.values = ['files', 'folders']
```

## Response Format

```typescript
interface CompletionResult {
  completion: {
    values: string[];      // Completion suggestions
    total?: number;        // Total available (if truncated)
    hasMore?: boolean;     // More results available
  };
}
```

## Automatic Features

### Prefix Filtering

The `filterByPrefix` helper provides case-insensitive filtering:

```typescript
import { filterByPrefix } from 'mcp-reference-server';

const values = ['Apple', 'Apricot', 'Banana'];
filterByPrefix(values, 'ap');  // ['Apple', 'Apricot']
filterByPrefix(values, 'AP');  // ['Apple', 'Apricot']
filterByPrefix(values, '');    // ['Apple', 'Apricot', 'Banana']
```

### Result Limiting

Results are automatically limited to 20 items:

```typescript
import { applyCompletionLimits } from 'mcp-reference-server';

const manyValues = Array.from({ length: 100 }, (_, i) => `item${i}`);
const result = applyCompletionLimits(manyValues);

// result.values.length = 20
// result.hasMore = true
// result.total = 100
```

## Supported Reference Types

| Type | Description |
|------|-------------|
| `ref/tool` | Tool argument completions |

## JSON-RPC Request

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "completion/complete",
  "params": {
    "ref": {
      "type": "ref/tool",
      "name": "tell_fortune"
    },
    "argument": {
      "name": "category",
      "value": "l"
    }
  }
}
```

## JSON-RPC Response

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "completion": {
      "values": ["love"],
      "total": 1,
      "hasMore": false
    }
  }
}
```

## Server Integration

Integrate completions with your MCP server:

```typescript
import { McpServer, CompletionHandler } from 'mcp-reference-server';

const server = new McpServer({ name: 'my-server', version: '1.0.0' });
const completions = new CompletionHandler();

// Register tool
server.tool('search', 'Search files', schema, handler);

// Register completions for the tool
completions.registerArgumentProvider('search', 'type', () =>
  ['files', 'folders', 'all']
);

// Server automatically routes completion/complete requests
```

## Related

- [Tools Guide](tools) - Tool registration
- [API Reference](../api/tools) - Tools module exports
