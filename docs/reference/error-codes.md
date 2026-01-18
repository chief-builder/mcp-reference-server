---
layout: page
title: Error Codes
---

# Error Codes Reference

Complete list of JSON-RPC and MCP error codes.

## JSON-RPC 2.0 Standard Errors

| Code | Name | Description |
|------|------|-------------|
| `-32700` | Parse Error | Invalid JSON received |
| `-32600` | Invalid Request | JSON is not a valid Request object |
| `-32601` | Method Not Found | Method does not exist |
| `-32602` | Invalid Params | Invalid method parameters |
| `-32603` | Internal Error | Internal JSON-RPC error |

### Server Error Range

Codes from `-32000` to `-32099` are reserved for implementation-defined server errors.

## MCP-Specific Errors

| Code | Name | Description |
|------|------|-------------|
| `-32800` | Request Cancelled | Request was cancelled by client |
| `-32801` | Content Too Large | Content exceeds maximum size |

## Error Classes

The server provides error classes for each error type:

```typescript
import {
  ParseError,
  InvalidRequestError,
  MethodNotFoundError,
  InvalidParamsError,
  InternalError,
  RequestCancelledError,
  ContentTooLargeError,
} from 'mcp-reference-server';

// Create errors
throw new ParseError();
throw new InvalidRequestError('Missing required field');
throw new MethodNotFoundError('tools/unknown');
throw new InvalidParamsError('Invalid name format', { field: 'name' });
throw new InternalError('Database connection failed');
throw new RequestCancelledError('req-123');
throw new ContentTooLargeError(1024 * 1024, 512 * 1024);
```

## Factory Functions

```typescript
import {
  createParseError,
  createInvalidRequest,
  createMethodNotFound,
  createInvalidParams,
  createInternalError,
} from 'mcp-reference-server';

const error = createMethodNotFound('tools/missing');
```

## Error Response Format

JSON-RPC error responses follow this format:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32601,
    "message": "Method not found: tools/missing",
    "data": {
      "method": "tools/missing"
    }
  }
}
```

## Tool Execution Errors (SEP-1303)

Tool errors are different from protocol errors. Per SEP-1303, tool validation and execution errors are returned as tool results with `isError: true`, not as JSON-RPC errors:

```typescript
import { createToolErrorResult, ToolExecutionError } from 'mcp-reference-server';

// Create tool error result
const result = createToolErrorResult(
  'File not found',
  'read_file',
  { path: '/missing.txt' }
);
// Returns: { content: [...], isError: true }

// Or throw and convert
try {
  throw new ToolExecutionError('read_file', 'File not found');
} catch (e) {
  if (e instanceof ToolExecutionError) {
    return e.toToolResult();
  }
}
```

### Why Tool Errors Differ

| Protocol Error | Tool Error |
|----------------|------------|
| JSON-RPC error response | Tool result with `isError: true` |
| Stops processing | Allows LLM self-correction |
| Invalid request/params | Tool-specific failure |
| Client bug | Expected runtime condition |

## Type Guards

```typescript
import {
  isMcpError,
  isParseError,
  isInvalidRequestError,
  isMethodNotFoundError,
  isInvalidParamsError,
  isInternalError,
  isToolExecutionError,
  isServerErrorCode,
  isStandardErrorCode,
} from 'mcp-reference-server';

if (isMcpError(error)) {
  console.log(error.code, error.message);
}

if (isServerErrorCode(-32050)) {
  // Custom server error
}
```

## Converting Errors

```typescript
import { fromError, toErrorResponse } from 'mcp-reference-server';

try {
  // Some operation
} catch (err) {
  // Convert any error to McpError
  const mcpError = fromError(err);

  // Create JSON-RPC response
  const response = toErrorResponse(mcpError, requestId);
}
```

## HTTP Status Codes

When using HTTP transport, errors map to HTTP status codes:

| Error Code | HTTP Status |
|------------|-------------|
| `-32700` Parse Error | 400 Bad Request |
| `-32600` Invalid Request | 400 Bad Request |
| `-32601` Method Not Found | 404 Not Found |
| `-32602` Invalid Params | 400 Bad Request |
| `-32603` Internal Error | 500 Internal Server Error |
| `-32800` Cancelled | 499 Client Closed Request |
| `-32801` Content Too Large | 413 Payload Too Large |

## Related

- [Protocol Guide](../guides/protocol) - Protocol concepts
- [Tools Guide](../guides/tools) - Tool error handling
- [API Reference](../api/protocol) - Error exports
