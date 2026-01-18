---
layout: page
title: Custom Tool Example
---

# Custom Tool Example

Building advanced tools with schemas, validation, and rich content.

## Basic Tool

```typescript
server.tool(
  'greet',
  'Greet someone by name',
  {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name to greet' },
    },
    required: ['name'],
  },
  async ({ name }) => ({
    content: [{ type: 'text', text: `Hello, ${name}!` }],
  })
);
```

## Tool with Annotations

```typescript
server.tool(
  'delete_file',
  'Delete a file from the filesystem',
  {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to delete' },
      force: { type: 'boolean', default: false },
    },
    required: ['path'],
  },
  async ({ path, force }) => {
    const fs = await import('fs/promises');
    await fs.rm(path, { force });
    return {
      content: [{ type: 'text', text: `Deleted: ${path}` }],
    };
  },
  {
    title: 'Delete File',
    annotations: {
      destructiveHint: true,   // May delete data
      idempotentHint: false,   // Not safe to retry
    },
  }
);
```

## Tool with Complex Schema

```typescript
server.tool(
  'search',
  'Search for items with filters',
  {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query',
        minLength: 1,
        maxLength: 100,
      },
      filters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['documents', 'images', 'videos'],
          },
          dateRange: {
            type: 'object',
            properties: {
              start: { type: 'string', format: 'date' },
              end: { type: 'string', format: 'date' },
            },
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 10,
          },
        },
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 100,
        default: 10,
      },
      offset: {
        type: 'number',
        minimum: 0,
        default: 0,
      },
    },
    required: ['query'],
  },
  async ({ query, filters, limit = 10, offset = 0 }) => {
    const results = await searchService.search(query, { filters, limit, offset });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(results, null, 2),
      }],
    };
  }
);
```

## Tool Returning Multiple Content Types

```typescript
server.tool(
  'analyze_image',
  'Analyze an image and return results',
  {
    type: 'object',
    properties: {
      url: { type: 'string', format: 'uri' },
    },
    required: ['url'],
  },
  async ({ url }) => {
    const analysis = await imageService.analyze(url);
    const thumbnail = await imageService.thumbnail(url);

    return {
      content: [
        {
          type: 'text',
          text: `Analysis Results:\n${JSON.stringify(analysis, null, 2)}`,
          annotations: {
            audience: ['assistant'],
            priority: 0.8,
          },
        },
        {
          type: 'image',
          data: thumbnail.base64,
          mimeType: 'image/jpeg',
          annotations: {
            audience: ['user'],
            priority: 1.0,
          },
        },
        {
          type: 'text',
          text: `Found ${analysis.objects.length} objects in image`,
          annotations: {
            audience: ['user'],
            priority: 0.9,
          },
        },
      ],
    };
  }
);
```

## Tool with Error Handling

```typescript
server.tool(
  'execute_query',
  'Execute a database query',
  {
    type: 'object',
    properties: {
      sql: { type: 'string', description: 'SQL query to execute' },
    },
    required: ['sql'],
  },
  async ({ sql }) => {
    try {
      // Validate query
      if (sql.toLowerCase().includes('drop') || sql.toLowerCase().includes('delete')) {
        return {
          content: [{
            type: 'text',
            text: 'Destructive queries are not allowed',
          }],
          isError: true,
        };
      }

      const result = await database.query(sql);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result.rows, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Query failed: ${error.message}`,
        }],
        isError: true,
      };
    }
  },
  {
    annotations: {
      readOnlyHint: true,
    },
  }
);
```

## Tool with Completions

```typescript
import { CompletionHandler } from 'mcp-reference-server';

const completions = new CompletionHandler();

// Register tool
server.tool(
  'set_config',
  'Set a configuration value',
  {
    type: 'object',
    properties: {
      key: { type: 'string' },
      value: { type: 'string' },
    },
    required: ['key', 'value'],
  },
  async ({ key, value }) => {
    await config.set(key, value);
    return {
      content: [{ type: 'text', text: `Set ${key} = ${value}` }],
    };
  }
);

// Register completions for the key argument
completions.registerArgumentProvider('set_config', 'key', async (prefix) => {
  const keys = await config.listKeys();
  return keys.filter(k => k.toLowerCase().startsWith(prefix.toLowerCase()));
});
```

## Tool with Output Schema

```typescript
server.tool(
  'get_user',
  'Get user information by ID',
  {
    type: 'object',
    properties: {
      id: { type: 'string' },
    },
    required: ['id'],
  },
  async ({ id }) => {
    const user = await userService.getById(id);
    return {
      content: [{ type: 'text', text: JSON.stringify(user) }],
      structuredContent: user,
    };
  },
  {
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string', format: 'email' },
        role: { type: 'string', enum: ['admin', 'user', 'guest'] },
      },
    },
  }
);
```

## Using ToolRegistry Directly

```typescript
import { ToolRegistry, ToolExecutor } from 'mcp-reference-server';

const registry = new ToolRegistry();
const executor = new ToolExecutor(registry);

registry.registerTool({
  name: 'calculate',
  description: 'Perform a calculation',
  inputSchema: {
    type: 'object',
    properties: {
      expression: { type: 'string' },
    },
    required: ['expression'],
  },
  handler: async ({ expression }) => {
    const result = eval(expression); // Use a safe math parser in production
    return {
      content: [{ type: 'text', text: String(result) }],
    };
  },
});

// Listen for changes
registry.onToolsChanged(() => {
  console.log(`Tool count: ${registry.getToolCount()}`);
});

// Execute tool
const result = await executor.execute('calculate', { expression: '2 + 2' });
```

## Related

- [Tools Guide](../guides/tools) - Tool concepts
- [Completions Guide](../guides/completions) - Argument completion
- [API Reference](../api/tools) - Tools API
