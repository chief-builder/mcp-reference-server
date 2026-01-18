---
layout: page
title: Tools API
---

# Tools API Reference

Exports for tool registration, execution, and completions.

## Tool Registry (`tools/registry`)

### Types

```typescript
interface Tool {
  name: string;
  title?: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  annotations?: ToolAnnotations;
  handler: ToolHandler;
}

interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

type ToolHandler = (args: unknown) => Promise<ToolResult>;

interface ToolResult {
  content: Content[];
  isError?: boolean;
}

type Content = TextContent | ImageContent | AudioContent | EmbeddedResource;

interface TextContent {
  type: 'text';
  text: string;
  annotations?: ContentAnnotations;
}

interface ImageContent {
  type: 'image';
  data: string;
  mimeType: string;
  annotations?: ContentAnnotations;
}
```

### ToolRegistry Class

```typescript
class ToolRegistry extends EventEmitter {
  registerTool(tool: Tool): void;
  unregisterTool(name: string): boolean;
  getTool(name: string): Tool | undefined;
  hasTool(name: string): boolean;
  listTools(cursor?: string, pageSize?: number): PaginatedToolList;
  getAllTools(): Tool[];
  getToolCount(): number;
  clear(): void;
  onToolsChanged(listener: () => void): void;
  offToolsChanged(listener: () => void): void;
}

interface PaginatedToolList {
  tools: ToolDefinitionExternal[];
  nextCursor?: string;
}
```

### Usage

```typescript
import { ToolRegistry } from 'mcp-reference-server';

const registry = new ToolRegistry();

registry.registerTool({
  name: 'greet',
  description: 'Greet someone',
  inputSchema: {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name']
  },
  handler: async ({ name }) => ({
    content: [{ type: 'text', text: `Hello, ${name}!` }]
  })
});

registry.onToolsChanged(() => {
  console.log('Tools updated');
});
```

## Tool Executor (`tools/executor`)

### ToolExecutor Class

```typescript
class ToolExecutor {
  constructor(registry: ToolRegistry, options?: ExecutorOptions);
  execute(name: string, args: unknown): Promise<ToolResult>;
  validateArgs(name: string, args: unknown): ValidationResult;
}

interface ExecutorOptions {
  timeout?: number;
  validateArgs?: boolean;
}

interface ValidationResult {
  valid: boolean;
  errors?: string[];
}
```

### Usage

```typescript
import { ToolExecutor, ToolRegistry } from 'mcp-reference-server';

const registry = new ToolRegistry();
const executor = new ToolExecutor(registry, {
  timeout: 30000,
  validateArgs: true
});

const result = await executor.execute('greet', { name: 'World' });
```

## Content Helpers

### Functions

| Function | Description |
|----------|-------------|
| `createTextContent(text, annotations?)` | Create text content |
| `createImageContent(data, mimeType, annotations?)` | Create image content |
| `createAudioContent(data, mimeType, annotations?)` | Create audio content |
| `createResourceContent(uri, options?)` | Create embedded resource |
| `zodToJsonSchema(zodSchema)` | Convert Zod to JSON Schema |

### Usage

```typescript
import { createTextContent, createImageContent } from 'mcp-reference-server';

return {
  content: [
    createTextContent('Operation completed', {
      audience: ['user'],
      priority: 1.0
    }),
    createImageContent(base64Data, 'image/png')
  ]
};
```

## Completions (`completions/handler`)

### CompletionHandler Class

```typescript
class CompletionHandler {
  registerArgumentProvider(
    toolName: string,
    argName: string,
    provider: ArgumentCompletionProvider
  ): void;
  hasArgumentProvider(toolName: string, argName: string): boolean;
  getRegisteredArgumentProviders(): string[];
  registerProvider(refType: CompletionRefType, name: string, provider: CompletionProvider): void;
  hasProvider(refType: CompletionRefType, name: string): boolean;
  handle(params: CompletionParams): Promise<CompletionResult>;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

type ArgumentCompletionProvider = (prefix: string) => string[] | Promise<string[]>;
type CompletionRefType = 'ref/tool' | 'ref/prompt' | 'ref/resource';

interface CompletionResult {
  completion: {
    values: string[];
    total?: number;
    hasMore?: boolean;
  };
}
```

### Helper Functions

| Function | Description |
|----------|-------------|
| `filterByPrefix(values, prefix)` | Case-insensitive prefix filter |
| `applyCompletionLimits(values, max?)` | Apply 20-item limit |

### Usage

```typescript
import { CompletionHandler, filterByPrefix } from 'mcp-reference-server';

const handler = new CompletionHandler();

handler.registerArgumentProvider('search', 'category', (prefix) =>
  filterByPrefix(['files', 'folders', 'all'], prefix)
);

const result = await handler.handle({
  ref: { type: 'ref/tool', name: 'search' },
  argument: { name: 'category', value: 'f' }
});
// result.completion.values = ['files', 'folders']
```

## Related

- [Tools Guide](../guides/tools) - Tool concepts
- [Completions Guide](../guides/completions) - Completions concepts
