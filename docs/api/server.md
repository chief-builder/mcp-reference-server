---
layout: page
title: Server API
---

# Server API Reference

Exports for server creation, configuration, and lifecycle management.

## MCPServer (`server`)

### MCPServer Class

```typescript
class MCPServer {
  constructor(options: MCPServerOptions);
  connect(transport: Transport): Promise<void>;
  close(): Promise<void>;
  tool(
    name: string,
    description: string,
    inputSchema: JsonSchema,
    handler: ToolHandler,
    options?: ToolOptions
  ): void;
  getLifecycleManager(): LifecycleManager;
  getCapabilityManager(): CapabilityManager;
  getToolRegistry(): ToolRegistry;
}

interface MCPServerOptions {
  name: string;
  version: string;
  description?: string;
  capabilities?: ServerCapabilities;
  instructions?: string;
}

interface ToolOptions {
  title?: string;
  outputSchema?: JsonSchema;
  annotations?: ToolAnnotations;
}
```

### Usage

```typescript
import { MCPServer, StdioTransport } from 'mcp-reference-server';

const server = new MCPServer({
  name: 'mcp-reference-server',
  version: '1.0.0',
  description: 'MCP Reference Server with fortune teller',
});

// Register the tell_fortune tool
server.tool(
  'tell_fortune',
  'Get a mystical fortune',
  {
    type: 'object',
    properties: {
      category: { type: 'string', enum: ['love', 'career', 'health', 'wealth', 'general'] },
      mood: { type: 'string', enum: ['optimistic', 'mysterious', 'cautious'] }
    },
    required: ['category']
  },
  async ({ category, mood = 'mysterious' }) => ({
    content: [{ type: 'text', text: JSON.stringify({ category, mood, fortune: '...' }) }]
  }),
  { annotations: { readOnlyHint: true, idempotentHint: false } }
);

const transport = new StdioTransport();
await server.connect(transport);
```

## Configuration (`config`)

### loadConfig Function

```typescript
function loadConfig(overrides?: Partial<Config>): Config;

interface Config {
  serverName: string;
  serverVersion: string;
  transport: 'stdio' | 'http';
  httpPort: number;
  httpHost: string;
  sseEnabled: boolean;
  sessionTimeout: number;
  authEnabled: boolean;
  authIssuer?: string;
  authClientId?: string;
  authScopes?: string[];
  telemetryEnabled: boolean;
  debug: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
```

### Usage

```typescript
import { loadConfig, MCPServer } from 'mcp-reference-server';

const config = loadConfig({
  serverName: 'custom-server',
  transport: 'http',
  httpPort: 8080,
});

const server = new MCPServer({
  name: config.serverName,
  version: config.serverVersion,
});
```

## Shutdown Manager

### ShutdownManager Class

```typescript
class ShutdownManager {
  constructor(options?: ShutdownManagerOptions);
  registerHandler(handler: CleanupHandler): void;
  shutdown(signal?: string): Promise<void>;
  isShuttingDown(): boolean;
}

interface ShutdownManagerOptions {
  timeout?: number;
  signals?: string[];
}

type CleanupHandler = () => Promise<void> | void;
```

### Usage

```typescript
import { createShutdownManager } from 'mcp-reference-server';

const shutdown = createShutdownManager({
  timeout: 30000,
  signals: ['SIGINT', 'SIGTERM'],
});

shutdown.registerHandler(async () => {
  await database.close();
  console.log('Database closed');
});

shutdown.registerHandler(async () => {
  await server.close();
  console.log('Server closed');
});
```

## Extensions Framework (`extensions/framework`)

### ExtensionRegistry Class

Manages server-side extensions with capability negotiation during initialization.

```typescript
class ExtensionRegistry {
  /** Register an extension */
  registerExtension(extension: Extension): void;

  /** Unregister an extension */
  unregisterExtension(name: string): void;

  /** Get a registered extension by name */
  getExtension(name: string): Extension | undefined;

  /** List all registered extensions */
  listExtensions(): Extension[];

  /** Check if an extension is registered */
  hasExtension(name: string): boolean;

  /** Get supported extensions for capability advertisement */
  getSupportedExtensions(): Record<string, ExtensionCapability>;

  /** Check if an extension is enabled for the current session */
  isEnabled(name: string): boolean;

  /** Get all enabled extensions */
  getEnabledExtensions(): Map<string, ExtensionCapability>;

  /** Shutdown all enabled extensions */
  shutdown(): Promise<void>;
}
```

### Types

```typescript
interface Extension {
  /** Full name in namespace/extension-name format (e.g., 'anthropic/oauth-m2m') */
  name: string;
  description?: string;
  version?: string;
  settings?: Record<string, unknown>;
  onInitialize?: (clientSettings: unknown) => Promise<void>;
  onShutdown?: () => Promise<void>;
}

interface ExtensionCapability {
  name: string;
  settings?: Record<string, unknown>;
}

interface ExtensionNegotiationResult {
  enabled: Record<string, ExtensionCapability>;
}
```

### Validation Functions

| Function | Description |
|----------|-------------|
| `validateExtensionName(name)` | Validate extension name format, throws on invalid |
| `isValidExtensionName(name)` | Check if name is valid without throwing |
| `parseExtensionName(name)` | Parse into `{ namespace, extension }` |

### Negotiation Functions

| Function | Description |
|----------|-------------|
| `negotiateExtensions(clientExperimental, registry)` | Negotiate extensions during initialize |
| `buildExperimentalCapabilities(registry, additional?)` | Build server's experimental capabilities |
| `createDefaultRegistry()` | Create registry with built-in extensions |

### Usage

```typescript
import {
  ExtensionRegistry,
  negotiateExtensions,
  buildExperimentalCapabilities,
  validateExtensionName,
} from 'mcp-reference-server';

const registry = new ExtensionRegistry();

// Register a custom extension
registry.registerExtension({
  name: 'mycompany/custom-feature',  // namespace/extension-name format
  version: '1.0.0',
  settings: { enabled: true },
  async onInitialize(clientSettings) {
    console.log('Extension initialized with', clientSettings);
  },
  async onShutdown() {
    console.log('Extension shutdown');
  },
});

// During initialize handler
const negotiationResult = await negotiateExtensions(
  clientParams.capabilities?.experimental,
  registry
);

// Build server response capabilities
const experimental = buildExperimentalCapabilities(registry);
```

### Extension Name Format

Extension names must follow the `namespace/extension-name` pattern:
- Namespace: lowercase letters, numbers, hyphens
- Extension name: lowercase letters, numbers, hyphens

Examples: `anthropic/oauth-m2m`, `mycompany/custom-auth`

## Logging Handler (`logging/handler`)

### LoggingHandler Class

```typescript
class LoggingHandler {
  constructor(options?: LoggingOptions);
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
  log(level: LogLevel, message: string, data?: unknown): void;
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggingOptions {
  level?: LogLevel;
  handler?: (entry: LogEntry) => void;
}
```

### Usage

```typescript
import { LoggingHandler } from 'mcp-reference-server';

const logger = new LoggingHandler({
  level: 'info',
  handler: (entry) => {
    console.log(JSON.stringify(entry));
  },
});

logger.info('Server started', { port: 3000 });
```

## Related

- [Getting Started](../getting-started/quick-start) - Basic usage
- [Configuration](../getting-started/configuration) - Environment variables
- [Observability Guide](../guides/observability) - Logging and metrics
