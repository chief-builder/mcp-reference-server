---
layout: page
title: Protocol API
---

# Protocol API Reference

Exports for JSON-RPC, lifecycle management, capabilities, and error handling.

## JSON-RPC (`protocol/jsonrpc`)

### Types

```typescript
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}
```

### Constants

```typescript
const JsonRpcErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
};
```

### Functions

| Function | Description |
|----------|-------------|
| `createRequest(id, method, params?)` | Create a JSON-RPC request |
| `createResponse(id, result)` | Create a success response |
| `createErrorResponse(id, error)` | Create an error response |
| `createNotification(method, params?)` | Create a notification |
| `createJsonRpcError(code, message, data?)` | Create an error object |
| `isRequest(msg)` | Type guard for requests |
| `isNotification(msg)` | Type guard for notifications |
| `isResponse(msg)` | Type guard for responses |

## Lifecycle (`protocol/lifecycle`)

### Constants

```typescript
const PROTOCOL_VERSION = '2025-11-25';
```

### Types

```typescript
type ServerState = 'uninitialized' | 'initializing' | 'ready' | 'shutting_down';

interface InitializeParams {
  protocolVersion: string;
  capabilities: ClientCapabilities;
  clientInfo: { name: string; version: string };
}

interface InitializeResult {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: { name: string; version: string; description?: string };
  instructions?: string;
}

interface ServerConfig {
  name: string;
  version: string;
  description?: string;
  capabilities?: ServerCapabilities;
  instructions?: string;
}
```

### LifecycleManager Class

```typescript
class LifecycleManager {
  constructor(config: ServerConfig);
  getState(): ServerState;
  getClientInfo(): { name: string; version: string } | null;
  getClientCapabilities(): ClientCapabilities | null;
  handleInitialize(params: unknown): InitializeResult;
  handleInitialized(): void;
  initiateShutdown(): boolean;
  isOperational(): boolean;
  reset(): void;
}
```

## Capabilities (`protocol/capabilities`)

### Types

```typescript
// This server's capabilities
interface ServerCapabilities {
  tools?: { listChanged?: boolean };
  completions?: Record<string, unknown>;
}

// Example: what this server returns
const capabilities = {
  tools: { listChanged: true },
  completions: {}
};
```

### CapabilityManager Class

```typescript
class CapabilityManager {
  constructor(lifecycleManager: LifecycleManager, serverCapabilities?: ServerCapabilities);
  getServerCapabilities(): ServerCapabilities;
  getClientCapabilities(): ClientCapabilities | null;
  getNegotiatedCapabilities(): NegotiatedCapabilities | null;
  hasClientCapability(path: string): boolean;
  hasServerCapability(path: string): boolean;
  requireClientCapability(path: string): void;
  requireServerCapability(path: string): void;
  isMethodAllowed(method: string): boolean;
  validateMethodCapability(method: string): void;
  canSendNotification(method: string): boolean;
}
```

### Functions

| Function | Description |
|----------|-------------|
| `getDefaultServerCapabilities()` | Get default server capabilities |
| `negotiateCapabilities(client, server)` | Negotiate capability set |
| `hasCapabilityAtPath(caps, path)` | Check capability at path |
| `getMethodCapabilityMapping()` | Get method to capability map |
| `getNotificationCapabilityMapping()` | Get notification to capability map |

## Errors (`protocol/errors`)

### Types

```typescript
interface ToolResult {
  content: Content[];
  isError?: boolean;
  structuredContent?: unknown;
}

interface ErrorWithCode {
  code: number;
  message: string;
  data?: unknown;
}
```

### Functions

| Function | Description |
|----------|-------------|
| `createToolError(message, data?)` | Create tool execution error |
| `isToolError(result)` | Check if result is an error |

## Pagination (`protocol/pagination`)

Cursor-based pagination for MCP list operations with secure, tamper-proof cursors.

### Constants

```typescript
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PAGE_SIZE } from 'mcp-reference-server';

DEFAULT_PAGE_SIZE  // 50
MAX_PAGE_SIZE      // 200
MIN_PAGE_SIZE      // 1
```

### Types

```typescript
interface PaginationParams {
  /** Opaque cursor from previous response */
  cursor?: string;
}

interface PaginatedResult<T> {
  /** Items in the current page */
  items: T[];
  /** Cursor for next page, undefined if no more pages */
  nextCursor?: string;
}

interface ParseCursorResult {
  /** Whether parsing was successful */
  valid: boolean;
  /** Offset from cursor (0 if invalid) */
  offset: number;
  /** Error message if invalid */
  error?: string;
}
```

### Functions

| Function | Description |
|----------|-------------|
| `createCursor(offset, metadata?)` | Create a Base64-encoded opaque cursor |
| `parseCursor(cursor)` | Parse and validate a cursor, returns `ParseCursorResult` |
| `paginate(items, cursor?, pageSize?)` | Apply pagination to an array |
| `clampPageSize(pageSize?, default?, max?)` | Clamp page size to valid range |
| `emptyPaginatedResult()` | Create an empty paginated result |

### Usage

```typescript
import { paginate, DEFAULT_PAGE_SIZE } from 'mcp-reference-server';

// Paginate a tools list
const tools = [/* array of tools */];
const result = paginate(tools, params.cursor, DEFAULT_PAGE_SIZE);

// Response includes items and optional nextCursor
return {
  tools: result.items,
  nextCursor: result.nextCursor,
};
```

### Cursor Security

Cursors are tamper-proof using:
- Base64-encoded JSON with offset and timestamp
- SHA-256 checksum validated on parse
- Configurable secret via `MCP_CURSOR_SECRET` environment variable

## Progress Notifications (`protocol/progress`)

Rate-limited progress notifications for long-running operations.

### Constants

```typescript
import { PROGRESS_NOTIFICATION_METHOD } from 'mcp-reference-server';

PROGRESS_NOTIFICATION_METHOD  // 'notifications/progress'
```

### Types

```typescript
type ProgressToken = string | number;

interface ProgressNotificationParams {
  progressToken: ProgressToken;
  progress: number;
  total?: number;
  message?: string;
}

interface ProgressReporterOptions {
  /** Throttle interval in milliseconds (default: 100ms) */
  throttleMs?: number;
}

type SendNotificationFn = (notification: JsonRpcNotification) => void;
```

### ProgressReporter Class

```typescript
class ProgressReporter {
  constructor(
    token: ProgressToken,
    sendNotification: SendNotificationFn,
    options?: ProgressReporterOptions
  );

  /** Report progress (throttled) */
  report(progress: number, total?: number, message?: string): void;

  /** Force final progress report (bypasses throttle) */
  complete(message?: string): void;
}
```

### Functions

| Function | Description |
|----------|-------------|
| `extractProgressToken(params)` | Extract progressToken from request `_meta` field |
| `createProgressReporter(params, sendFn, options?)` | Create reporter if token present |
| `createProgressNotification(token, progress, total?, message?)` | Create a progress notification |

### Usage

```typescript
import { createProgressReporter, extractProgressToken } from 'mcp-reference-server';

// In a tool handler
async function handleLongOperation(params, sendNotification) {
  const reporter = createProgressReporter(params, sendNotification, {
    throttleMs: 100,  // Throttle to max 10 updates/second
  });

  if (reporter) {
    for (let i = 0; i < items.length; i++) {
      await processItem(items[i]);
      reporter.report(i + 1, items.length, `Processing item ${i + 1}`);
    }
    reporter.complete('Done');
  }
}
```

### Throttling

The `ProgressReporter` automatically throttles updates:
- Updates within the throttle interval are queued
- Only the most recent update is kept
- `complete()` always sends the final notification

## Related

- [Protocol Guide](../guides/protocol) - Protocol concepts
- [Error Codes Reference](../reference/error-codes) - All error codes
