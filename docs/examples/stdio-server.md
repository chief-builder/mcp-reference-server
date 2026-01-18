---
layout: page
title: stdio Server Example
---

# stdio Server Example

A complete MCP server using stdio transport for CLI integration.

## Complete Example

```typescript
import { MCPServer, StdioTransport } from 'mcp-reference-server';

// Create server
const server = new MCPServer({
  name: 'file-server',
  version: '1.0.0',
  description: 'A file management MCP server',
  instructions: 'Use list_files to see available files, read_file to get contents.',
});

// Register tools
server.tool(
  'list_files',
  'List files in a directory',
  {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path to list',
        default: '.',
      },
    },
  },
  async ({ path = '.' }) => {
    const fs = await import('fs/promises');
    const files = await fs.readdir(path);
    return {
      content: [{
        type: 'text',
        text: files.join('\n'),
      }],
    };
  },
  {
    annotations: {
      readOnlyHint: true,
    },
  }
);

server.tool(
  'read_file',
  'Read contents of a file',
  {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file',
      },
    },
    required: ['path'],
  },
  async ({ path }) => {
    const fs = await import('fs/promises');
    try {
      const content = await fs.readFile(path, 'utf-8');
      return {
        content: [{
          type: 'text',
          text: content,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error reading file: ${error.message}`,
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

server.tool(
  'write_file',
  'Write content to a file',
  {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file',
      },
      content: {
        type: 'string',
        description: 'Content to write',
      },
    },
    required: ['path', 'content'],
  },
  async ({ path, content }) => {
    const fs = await import('fs/promises');
    await fs.writeFile(path, content, 'utf-8');
    return {
      content: [{
        type: 'text',
        text: `File written: ${path}`,
      }],
    };
  },
  {
    annotations: {
      destructiveHint: true,
    },
  }
);

// Connect via stdio
const transport = new StdioTransport();
await server.connect(transport);

console.error('File server started'); // Log to stderr (stdout is for MCP)
```

## Running the Server

```bash
# Development
npx tsx file-server.ts

# Production
node dist/file-server.js
```

## Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/file-server.js
```

## Claude Desktop Configuration

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "file-server": {
      "command": "node",
      "args": ["/path/to/dist/file-server.js"]
    }
  }
}
```

## Key Points

1. **Server metadata**: Set `name`, `version`, and `instructions` for client discovery
2. **Tool annotations**: Mark read-only vs destructive operations
3. **Error handling**: Return `isError: true` for tool failures
4. **stderr for logs**: stdout is reserved for MCP messages

## Related

- [Quick Start](../getting-started/quick-start) - Basic setup
- [Tools Guide](../guides/tools) - Tool concepts
- [HTTP Server Example](http-server) - HTTP transport
